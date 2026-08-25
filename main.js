import { initPoseLandmarker, getPoseData } from './poseLandmarker.js';
import { drawSkeleton } from './ui.js';

const qualitySelect = document.getElementById('qualitySelect');
const webcamVideo = document.getElementById('webcamVideo');
const webcamCanvas = document.getElementById('webcamCanvas');

let isWebcamActive = false;

async function startWebcam() {
  try {
    // 카메라 스트림 요청
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    webcamVideo.srcObject = stream;

    webcamVideo.addEventListener('loadeddata', () => {
      console.log('Webcam video loaded');
      webcamCanvas.width = webcamVideo.videoWidth;
      webcamCanvas.height = webcamVideo.videoHeight;

      isWebcamActive = true;
      processWebcamFrame();
    });
  } catch (error) {
    console.error('Webcam access error:', error);

    // 에러 메시지 추가
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

qualitySelect.addEventListener('change', async () => {
  try {
    await initPoseLandmarker(qualitySelect.value);
  } catch (error) {
    console.error('PoseLandmarker initialization error:', error);
    alert('PoseLandmarker 초기화에 실패했습니다.');
  }
});

await initPoseLandmarker(qualitySelect.value);
await startWebcam();