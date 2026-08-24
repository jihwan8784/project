import { initPoseLandmarker, getPoseData } from './poseLandmarker.js';
import { drawSkeleton } from './ui.js';

const qualitySelect = document.getElementById('qualitySelect');
const webcamVideo = document.getElementById('webcamVideo');
const webcamCanvas = document.getElementById('webcamCanvas');

let isWebcamActive = false;

async function startWebcam() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  webcamVideo.srcObject = stream;
  isWebcamActive = true;

  webcamVideo.addEventListener('loadeddata', processWebcamFrame);
}

async function processWebcamFrame() {
  if (!isWebcamActive) return;

  const poses = getPoseData(webcamVideo);
  drawSkeleton(webcamCanvas, poses);

  requestAnimationFrame(processWebcamFrame);
}

qualitySelect.addEventListener('change', async () => {
  await initPoseLandmarker(qualitySelect.value);
});

await initPoseLandmarker(qualitySelect.value);
await startWebcam();