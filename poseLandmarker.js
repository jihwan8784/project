import {
    PoseLandmarker,
    FilesetResolver,
  } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm";
  
  let poseLandmarker = null;
  
  export async function initPoseLandmarker(quality) {
    const MODEL_URLS = {
      lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
      heavy: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
    };
  
    if (!MODEL_URLS[quality]) {
      console.error('Invalid quality value:', quality);
      alert('잘못된 모델 정확도 값입니다. 다시 선택해주세요.');
      return;
    }
  
    try {
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URLS[quality],
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 2,
      });
  
      console.log('PoseLandmarker initialized');
    } catch (error) {
      console.error('PoseLandmarker initialization error:', error);
      alert('PoseLandmarker 초기화에 실패했습니다. 네트워크 상태를 확인하세요.');
    }
  }
  
  export function getPoseData(videoElement) {
    if (!poseLandmarker) return null;
    return poseLandmarker.detectForVideo(videoElement, performance.now());
  }