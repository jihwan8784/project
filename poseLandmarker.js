import {
  PoseLandmarker,
  HandLandmarker,
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm";

let poseLandmarker = null;
let handLandmarker = null;
let faceLandmarker = null;
let visionPromise = null;
let auxiliaryInitPromise = null;
let currentQuality = 'full';
let frameCounter = 0;
let cachedFaceResult = { faceLandmarks: [] };
let initializationGeneration = 0;
let lastVideoTimestamp = -1;
let lastAuxiliaryWarningAt = 0;

const AUXILIARY_WARNING_INTERVAL_MS = 5000;
const MAX_PEOPLE = 4;

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

const MODEL_URLS = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  heavy: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
};

const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
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

async function initAuxiliaryLandmarkers(vision) {
  if (handLandmarker && faceLandmarker) return;
  if (auxiliaryInitPromise) return auxiliaryInitPromise;

  auxiliaryInitPromise = (async () => {
    const [handResult, faceResult] = await Promise.allSettled([
      createWithDelegateFallback(
        HandLandmarker,
        vision,
        {
          baseOptions: { modelAssetPath: HAND_MODEL_URL },
          runningMode: 'VIDEO',
          numHands: MAX_PEOPLE * 2,
          minHandDetectionConfidence: 0.40,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.45,
        },
        'HandLandmarker',
      ),
      createWithDelegateFallback(
        FaceLandmarker,
        vision,
        {
          baseOptions: { modelAssetPath: FACE_MODEL_URL },
          runningMode: 'VIDEO',
          numFaces: MAX_PEOPLE,
          minFaceDetectionConfidence: 0.50,
          minFacePresenceConfidence: 0.45,
          minTrackingConfidence: 0.50,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        },
        'FaceLandmarker',
      ),
    ]);

    if (handResult.status === 'fulfilled') handLandmarker = handResult.value;
    else console.warn('HandLandmarker initialization failed; continuing without hands.', handResult.reason);

    if (faceResult.status === 'fulfilled') faceLandmarker = faceResult.value;
    else console.warn('FaceLandmarker initialization failed; continuing without face landmarks.', faceResult.reason);
  })();

  try {
    await auxiliaryInitPromise;
  } catch (error) {
    auxiliaryInitPromise = null;
    throw error;
  }
}

export async function initPoseLandmarker(quality) {
  if (!MODEL_URLS[quality]) {
    console.error('Invalid quality value:', quality);
    alert('잘못된 모델 정확도 값입니다. 다시 선택해주세요.');
    return false;
  }

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
        baseOptions: { modelAssetPath: MODEL_URLS[quality] },
        runningMode: 'VIDEO',
        numPoses: MAX_PEOPLE,
        // 기존 0.5보다 낮춰 몸의 일부만 보일 때도 포즈 후보가 쉽게 유지되도록 한다.
        minPoseDetectionConfidence: 0.25,
        minPosePresenceConfidence: 0.20,
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
    currentQuality = quality;
    previousPoseLandmarker?.close();

    // 손/얼굴은 Pose와 독립적으로 검출해서 몸 전체 포즈가 실패해도 해당 부위는 표시한다.
    await initAuxiliaryLandmarkers(vision);

    frameCounter = 0;
    cachedFaceResult = { faceLandmarks: [] };
    console.log('Pose + Hand + Face landmarkers initialized');
    return true;
  } catch (error) {
    console.error('Landmarker initialization error:', error);
    alert('포즈/손/얼굴 인식 모델 초기화에 실패했습니다. 네트워크 상태를 확인하세요.');
    return false;
  }
}

export function closeLandmarkers() {
  initializationGeneration += 1;
  poseLandmarker?.close();
  handLandmarker?.close();
  faceLandmarker?.close();
  poseLandmarker = null;
  handLandmarker = null;
  faceLandmarker = null;
  auxiliaryInitPromise = null;
  cachedFaceResult = { faceLandmarks: [] };
  frameCounter = 0;
  lastVideoTimestamp = -1;
}

function warnAuxiliaryDetection(label, error) {
  const now = performance.now();
  if (now - lastAuxiliaryWarningAt < AUXILIARY_WARNING_INTERVAL_MS) return;
  lastAuxiliaryWarningAt = now;
  console.warn(`${label} detection skipped for this frame.`, error);
}

export function getPoseData(videoElement, requestedTimestamp = performance.now()) {
  if (!poseLandmarker) return null;

  const candidateTimestamp = Number.isFinite(requestedTimestamp)
    ? requestedTimestamp
    : performance.now();
  const timestamp = Math.max(candidateTimestamp, lastVideoTimestamp + 0.01);
  lastVideoTimestamp = timestamp;

  const poseResult = poseLandmarker.detectForVideo(videoElement, timestamp);

  let handResult = { landmarks: [], handedness: [], worldLandmarks: [] };
  if (handLandmarker) {
    try {
      handResult = handLandmarker.detectForVideo(videoElement, timestamp);
    } catch (error) {
      warnAuxiliaryDetection('HandLandmarker', error);
    }
  }

  // 얼굴 478점을 매 프레임 처리하면 저사양 기기에서 FPS가 크게 떨어질 수 있어
  // 다인 얼굴 검출 부하를 고려해 Lite=4프레임, Full=3프레임, Heavy=2프레임마다 갱신한다.
  const faceInterval = currentQuality === 'heavy' ? 2 : currentQuality === 'lite' ? 4 : 3;
  if (faceLandmarker && frameCounter % faceInterval === 0) {
    try {
      cachedFaceResult = faceLandmarker.detectForVideo(videoElement, timestamp);
    } catch (error) {
      warnAuxiliaryDetection('FaceLandmarker', error);
    }
  }
  frameCounter += 1;

  return {
    // 기존 코드 호환용: body pose는 그대로 landmarks / worldLandmarks에 둔다.
    landmarks: poseResult?.landmarks ?? [],
    worldLandmarks: poseResult?.worldLandmarks ?? [],
    handLandmarks: handResult?.landmarks ?? [],
    handWorldLandmarks: handResult?.worldLandmarks ?? [],
    handedness: handResult?.handedness ?? [],
    faceLandmarks: cachedFaceResult?.faceLandmarks ?? [],
  };
}
