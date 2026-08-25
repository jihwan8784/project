import { initPoseLandmarker, getPoseData } from './poseLandmarker.js';
import { drawSkeleton } from './ui.js';

const qualitySelect = document.getElementById('qualitySelect');
const webcamVideo = document.getElementById('webcamVideo');
const webcamCanvas = document.getElementById('webcamCanvas');

let isWebcamActive = false;

async function startWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    webcamVideo.srcObject = stream;

    webcamVideo.addEventListener('loadeddata', () => {
      webcamCanvas.width = webcamVideo.videoWidth;
      webcamCanvas.height = webcamVideo.videoHeight;

      isWebcamActive = true;
      processWebcamFrame();
    });
  } catch (error) {
    console.error('Webcam access error:', error);
    alert('카메라에 접근할 수 없습니다. 권한을 확인해주세요.');
  }
}

async function processWebcamFrame() {
  if (!isWebcamActive || !poseLandmarker) return; // poseLandmarker 초기화 확인

  const poses = await getPoseData(webcamVideo);
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