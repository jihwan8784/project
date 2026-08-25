import {
  FilesetResolver,
  PoseLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm';

let poseLandmarker = null;
let visionPromise = null;

const MODEL_URLS = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
};

export async function initPoseLandmarker(quality) {
  if (!MODEL_URLS[quality]) return false;

  try {
    if (!visionPromise) {
      visionPromise = FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
      );
    }

    const vision = await visionPromise;
    const options = {
      baseOptions: {
        modelAssetPath: MODEL_URLS[quality],
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: quality === 'lite' ? 0.35 : 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    };

    let nextLandmarker;
    try {
      nextLandmarker = await PoseLandmarker.createFromOptions(vision, options);
    } catch (gpuError) {
      console.warn('GPU unavailable, using CPU for Pose Landmarker.', gpuError);
      nextLandmarker = await PoseLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: 'CPU' },
      });
    }

    poseLandmarker?.close();
    poseLandmarker = nextLandmarker;
    console.log(`Pose Landmarker initialized: ${quality}`);
    return true;
  } catch (error) {
    console.error('Pose Landmarker initialization error:', error);
    alert('인식 모델 초기화에 실패했습니다. 네트워크 상태를 확인하세요.');
    return false;
  }
}

export function getPoseData(videoElement) {
  if (!poseLandmarker) return null;
  return poseLandmarker.detectForVideo(videoElement, performance.now());
}
