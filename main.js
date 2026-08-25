import { initPoseLandmarker, getPoseData } from './poseLandmarker.js';
import { drawSkeleton } from './ui.js';

const qualitySelect = document.getElementById('qualitySelect');
const webcamVideo = document.getElementById('webcamVideo');
const webcamCanvas = document.getElementById('webcamCanvas');

let isWebcamActive = false;

// PoseLandmarker 초기화 상태 확인
async function startWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    webcamVideo.srcObject = stream;

    webcamVideo.addEventListener('loadeddata', async () => {
      console.log('Webcam video loaded');

      // PoseLandmarker 초기화
      await initPoseLandmarker(qualitySelect.value);

      if (!poseLandmarker) {
        console.error('PoseLandmarker initialization failed.');
        alert('PoseLandmarker 초기화에 실패했습니다.');
        return;
      }

      isWebcamActive = true;
      processWebcamFrame();
    });
  } catch (error) {
    console.error('Webcam access error:', error);

    if (error.name === 'NotAllowedError') {
      alert('카메라 권한이 거부되었습니다. 브라우저 설정을 확인하세요.');
    } else if (error.name === 'NotFoundError') {
      alert('카메라를 찾을 수 없습니다. 카메라가 연결되어 있는지 확인하세요.');
    } else {
      alert('카메라에 접근할 수 없습니다. 오류: ' + error.message);
    }
  }
}

async function processWebcamFrame() {
  if (!isWebcamActive || !poseLandmarker) {
    console.warn('Webcam is not active or PoseLandmarker is not initialized.');
    return;
  }

  const poses = await getPoseData(webcamVideo);
  if (!poses) {
    console.warn('No pose data detected.');
    return;
  }

  drawSkeleton(webcamCanvas, poses);
  requestAnimationFrame(processWebcamFrame);
}

// 품질 선택 이벤트 리스너
qualitySelect.addEventListener('change', async () => {
  await initPoseLandmarker(qualitySelect.value);
});

// 웹캠 시작
startWebcam();