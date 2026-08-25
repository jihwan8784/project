import {
    HolisticLandmarker,
    FilesetResolver,
  } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm";
  
  let holisticLandmarker = null;
  let visionPromise = null;

  const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task";
  const QUALITIES = new Set(['lite', 'full', 'heavy']);
  
  export async function initPoseLandmarker(quality) {
    if (!QUALITIES.has(quality)) {
      console.error('Invalid quality value:', quality);
      alert('잘못된 모델 정확도 값입니다. 다시 선택해주세요.');
      return false;
    }
  
    try {
      if (!visionPromise) {
        visionPromise = FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        );
      }

      const vision = await visionPromise;
      const options = {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        minFaceDetectionConfidence: quality === 'heavy' ? 0.6 : 0.5,
        minFacePresenceConfidence: 0.5,
        minPoseDetectionConfidence: quality === 'lite' ? 0.45 : 0.55,
        minPosePresenceConfidence: 0.5,
        minHandLandmarksConfidence: 0.5,
        outputFaceBlendshapes: true,
      };

      let nextPoseLandmarker;
      try {
        nextPoseLandmarker = await HolisticLandmarker.createFromOptions(vision, options);
      } catch (gpuError) {
        console.warn('GPU delegate unavailable, falling back to CPU.', gpuError);
        nextPoseLandmarker = await HolisticLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: {
            ...options.baseOptions,
            delegate: 'CPU',
          },
        });
      }

      holisticLandmarker?.close();
      holisticLandmarker = nextPoseLandmarker;
  
      console.log('PoseLandmarker initialized');
      return true;
    } catch (error) {
      console.error('PoseLandmarker initialization error:', error);
      alert('PoseLandmarker 초기화에 실패했습니다. 네트워크 상태를 확인하세요.');
      return false;
    }
  }
  
  export function getPoseData(videoElement) {
    if (!holisticLandmarker) return null;
    return holisticLandmarker.detectForVideo(videoElement, performance.now());
  }