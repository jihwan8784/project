import {
  PoseLandmarker,
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm";

let poseLandmarker = null;
let faceLandmarker = null;
let visionPromise = null;
let faceInitPromise = null;
let frameCounter = 0;
let cachedFaceResult = { faceLandmarks: [], faceBlendshapes: [] };
let initializationGeneration = 0;
let lastVideoTimestamp = -1;
let lastAuxiliaryWarningAt = 0;

const AUXILIARY_WARNING_INTERVAL_MS = 5000;
const MAX_PEOPLE = 1;

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

// Google 공식 샘플과 동일한 고정 버전 경로를 사용한다.
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

async function createWithDelegateFallback(TaskClass, vision, options, label) {
  try {
    return await TaskClass.createFromOptions(vision, {
      ...options,
      baseOptions: {
        ...options.baseOptions,
        delegate: 'GPU',
      },
    });
  } catch (gpuError) {
    console.warn(`${label} GPU delegate unavailable, falling back to CPU.`, gpuError);
    return TaskClass.createFromOptions(vision, {
      ...options,
      baseOptions: {
        ...options.baseOptions,
        delegate: 'CPU',
      },
    });
  }
}

async function initFaceLandmarker(vision) {
  if (faceLandmarker) return;
  if (faceInitPromise) return faceInitPromise;

  faceInitPromise = createWithDelegateFallback(
    FaceLandmarker,
    vision,
    {
      baseOptions: { modelAssetPath: FACE_MODEL_URL },
      runningMode: 'VIDEO',
      numFaces: MAX_PEOPLE,
      minFaceDetectionConfidence: 0.45,
      minFacePresenceConfidence: 0.40,
      minTrackingConfidence: 0.45,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    },
    'FaceLandmarker',
  ).then(result => {
    faceLandmarker = result;
  });

  try {
    await faceInitPromise;
  } catch (error) {
    faceInitPromise = null;
    console.warn('FaceLandmarker initialization failed; continuing without facial expressions.', error);
  }
}

export async function initPoseLandmarker() {
  const generation = ++initializationGeneration;

  try {
    if (!visionPromise) {
      visionPromise = FilesetResolver.forVisionTasks(WASM_URL);
    }
    const vision = await visionPromise;

    const nextPoseLandmarker = await createWithDelegateFallback(
      PoseLandmarker,
      vision,
      {
        baseOptions: { modelAssetPath: POSE_MODEL_URL },
        runningMode: 'VIDEO',
        numPoses: MAX_PEOPLE,
        // 한쪽 팔/다리가 가려져도 추적이 쉽게 끊기지 않게 완화한다.
        minPoseDetectionConfidence: 0.32,
        minPosePresenceConfidence: 0.30,
        minTrackingConfidence: 0.40,
      },
      'PoseLandmarker',
    );

    if (generation !== initializationGeneration) {
      nextPoseLandmarker.close();
      return false;
    }

    const previousPoseLandmarker = poseLandmarker;
    poseLandmarker = nextPoseLandmarker;
    previousPoseLandmarker?.close();

    await initFaceLandmarker(vision);

    frameCounter = 0;
    cachedFaceResult = { faceLandmarks: [], faceBlendshapes: [] };
    console.log('Pose Lite 3D + Face landmarkers initialized');
    return true;
  } catch (error) {
    console.error('Landmarker initialization error:', error);
    alert('포즈/얼굴 인식 모델 초기화에 실패했습니다. 네트워크 상태를 확인하세요.');
    return false;
  }
}

export function closeLandmarkers() {
  initializationGeneration += 1;
  poseLandmarker?.close();
  faceLandmarker?.close();
  poseLandmarker = null;
  faceLandmarker = null;
  faceInitPromise = null;
  cachedFaceResult = { faceLandmarks: [], faceBlendshapes: [] };
  frameCounter = 0;
  lastVideoTimestamp = -1;
}

function warnAuxiliaryDetection(label, error) {
  const now = performance.now();
  if (now - lastAuxiliaryWarningAt < AUXILIARY_WARNING_INTERVAL_MS) return;
  lastAuxiliaryWarningAt = now;
  console.warn(`${label} detection skipped for this frame.`, error);
}

function mergeWorldCoordinates(normalizedPoses, worldPoses) {
  return (normalizedPoses ?? []).map((pose, poseIndex) => {
    const world = worldPoses?.[poseIndex] ?? [];
    return pose.map((point, index) => {
      const worldPoint = world[index];
      return {
        ...point,
        // main.js의 smoothing을 거쳐도 살아남도록 같은 landmark 객체에 붙인다.
        worldX: Number.isFinite(worldPoint?.x) ? worldPoint.x : null,
        worldY: Number.isFinite(worldPoint?.y) ? worldPoint.y : null,
        worldZ: Number.isFinite(worldPoint?.z) ? worldPoint.z : null,
      };
    });
  });
}

export function getPoseData(videoElement, requestedTimestamp = performance.now()) {
  if (!poseLandmarker) return null;

  const candidateTimestamp = Number.isFinite(requestedTimestamp)
    ? requestedTimestamp
    : performance.now();
  const timestamp = Math.max(candidateTimestamp, lastVideoTimestamp + 0.01);
  lastVideoTimestamp = timestamp;

  const poseResult = poseLandmarker.detectForVideo(videoElement, timestamp);

  if (faceLandmarker && frameCounter % 2 === 0) {
    try {
      cachedFaceResult = faceLandmarker.detectForVideo(videoElement, timestamp);
    } catch (error) {
      warnAuxiliaryDetection('FaceLandmarker', error);
    }
  }
  frameCounter += 1;

  const worldLandmarks = poseResult?.worldLandmarks ?? [];
  const landmarks = mergeWorldCoordinates(poseResult?.landmarks ?? [], worldLandmarks);

  return {
    landmarks,
    worldLandmarks,
    faceLandmarks: cachedFaceResult?.faceLandmarks ?? [],
    faceBlendshapes: cachedFaceResult?.faceBlendshapes ?? [],
  };
}
