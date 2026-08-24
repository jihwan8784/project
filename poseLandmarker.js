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
  }
  
  export function getPoseData(videoElement) {
    if (!poseLandmarker) return null;
    return poseLandmarker.detectForVideo(videoElement, performance.now());
  }