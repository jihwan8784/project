import { initPoseLandmarker, getPoseData } from './poseLandmarker.js';
import { drawSkeleton } from './ui.js';

const qualitySelect = document.getElementById('qualitySelect');
const webcamVideo = document.getElementById('webcamVideo');
const webcamCanvas = document.getElementById('webcamCanvas');
const saveAvatarButton = document.getElementById('saveAvatarButton');
const detectionStatus = document.getElementById('detectionStatus');

let isWebcamActive = false;
let isProcessingFrame = false;
let latestPose = null;

function syncCanvasSize() {
  if (webcamVideo.videoWidth === 0 || webcamVideo.videoHeight === 0) return;

  webcamCanvas.width = webcamVideo.videoWidth;
  webcamCanvas.height = webcamVideo.videoHeight;
}

async function startWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
    });
    webcamVideo.srcObject = stream;
    webcamVideo.muted = true;
    await webcamVideo.play();
    syncCanvasSize();
    isWebcamActive = true;

    await initPoseLandmarker(qualitySelect.value);
    processWebcamFrame();
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

webcamVideo.addEventListener('loadedmetadata', syncCanvasSize);

async function processWebcamFrame() {
  if (!isWebcamActive || isProcessingFrame) {
    return;
  }

  isProcessingFrame = true;
  try {
    const poses = await getPoseData(webcamVideo);
    if (poses) {
      drawSkeleton(webcamCanvas, poses);
      latestPose = poses.landmarks?.[0] ?? null;
      detectionStatus.textContent = latestPose ? '사람 인식됨' : '사람을 찾는 중...';
      saveAvatarButton.disabled = !latestPose;
    }
  } catch (error) {
    console.error('Pose detection error:', error);
  } finally {
    isProcessingFrame = false;
  }

  requestAnimationFrame(processWebcamFrame);
}

// 품질 선택 이벤트 리스너
qualitySelect.addEventListener('change', async () => {
  await initPoseLandmarker(qualitySelect.value);
});

saveAvatarButton.addEventListener('click', () => {
  if (!latestPose) {
    detectionStatus.textContent = '저장할 사람을 먼저 인식하세요.';
    return;
  }

  localStorage.setItem('savedPoseLandmarks', JSON.stringify(latestPose));
  window.location.href = 'avatar.html';
});

// 웹캠 시작
startWebcam();