import {
    HolisticLandmarker,
    PoseLandmarker,
    FilesetResolver,
  } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm";
  
  let holisticLandmarker = null;
  let activeLandmarkerType = 'holistic';
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
        minFaceDetectionConfidence: quality === 'heavy' ? 0.5 : 0.4,
        minFacePresenceConfidence: 0.5,
        minPoseDetectionConfidence: quality === 'lite' ? 0.35 : 0.4,
        minPosePresenceConfidence: 0.4,
        minHandLandmarksConfidence: 0.4,
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

      activeLandmarkerType = 'holistic';

      holisticLandmarker?.close();
      holisticLandmarker = nextPoseLandmarker;
  
      console.log('PoseLandmarker initialized');
      return true;
    } catch (error) {
      console.error('PoseLandmarker initialization error:', error);
      try {
        const vision = await visionPromise;
        holisticLandmarker?.close();
        const fallbackOptions = {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task', delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.35,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        };
        try {
          holisticLandmarker = await PoseLandmarker.createFromOptions(vision, fallbackOptions);
        } catch (fallbackGpuError) {
          holisticLandmarker = await PoseLandmarker.createFromOptions(vision, {
            ...fallbackOptions,
            baseOptions: { ...fallbackOptions.baseOptions, delegate: 'CPU' },
          });
        }
        activeLandmarkerType = 'pose';
        console.warn('Holistic unavailable; using Pose Landmarker fallback.');
        return true;
      } catch (fallbackError) {
        console.error('Pose fallback initialization error:', fallbackError);
        alert('인식 모델 초기화에 실패했습니다. 네트워크와 카메라 환경을 확인하세요.');
        return false;
      }
    }
  }
  
  export function getPoseData(videoElement) {
    if (!holisticLandmarker) return null;
    const result = holisticLandmarker.detectForVideo(videoElement, performance.now());
    if (activeLandmarkerType === 'pose') {
      return {
        poseLandmarks: result.landmarks ?? [],
        poseWorldLandmarks: result.worldLandmarks ?? [],
        faceLandmarks: [],
        leftHandLandmarks: [],
        rightHandLandmarks: [],
      };
    }
    return result;
  }