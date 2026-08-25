import { initPoseLandmarker, getPoseData } from './poseLandmarker.js';
import { drawSkeleton } from './ui.js';

const qualitySelect = document.getElementById('qualitySelect');
const webcamVideo = document.getElementById('webcamVideo');
const webcamCanvas = document.getElementById('webcamCanvas');
const saveAvatarButton = document.getElementById('saveAvatarButton');
const detectionStatus = document.getElementById('detectionStatus');
const settingsButton = document.getElementById('settingsButton');
const settingsPanel = document.getElementById('settingsPanel');
const startCameraButton = document.getElementById('startCameraButton');
const stopCameraButton = document.getElementById('stopCameraButton');
const smoothingRange = document.getElementById('smoothingRange');
const smoothingValue = document.getElementById('smoothingValue');
const confidenceRange = document.getElementById('confidenceRange');
const confidenceValue = document.getElementById('confidenceValue');
const showSkeletonCheckbox = document.getElementById('showSkeletonCheckbox');
const mirrorCameraCheckbox = document.getElementById('mirrorCameraCheckbox');
const debugModeCheckbox = document.getElementById('debugModeCheckbox');

let isWebcamActive = false;
let isProcessingFrame = false;
let latestPose = null;
let latestHolisticResult = null;
let previousPose = null;
let cameraStream = null;
let lastFrameTime = performance.now();
let frameCount = 0;
let displayedFps = 0;

let storedSettings = {};
try {
  storedSettings = JSON.parse(localStorage.getItem('poseVisionSettings') || '{}');
} catch (error) {
  console.warn('저장된 설정을 읽지 못해 기본값을 사용합니다.', error);
  localStorage.removeItem('poseVisionSettings');
}
if (storedSettings.quality && qualitySelect.querySelector(`option[value="${storedSettings.quality}"]`)) qualitySelect.value = storedSettings.quality;
if (storedSettings.smoothing != null) smoothingRange.value = storedSettings.smoothing;
if (storedSettings.confidence != null) confidenceRange.value = storedSettings.confidence;
showSkeletonCheckbox.checked = storedSettings.showSkeleton !== false;
mirrorCameraCheckbox.checked = storedSettings.mirror !== false;
debugModeCheckbox.checked = storedSettings.debug === true;

function getSettings() {
  return {
    smoothing: Number(smoothingRange.value),
    confidence: Number(confidenceRange.value),
    showSkeleton: showSkeletonCheckbox.checked,
    mirror: mirrorCameraCheckbox.checked,
    debug: debugModeCheckbox.checked,
  };
}

function persistSettings() {
  localStorage.setItem('poseVisionSettings', JSON.stringify({ quality: qualitySelect.value, ...getSettings() }));
  smoothingValue.value = Number(smoothingRange.value).toFixed(2);
  confidenceValue.value = Number(confidenceRange.value).toFixed(2);
  webcamVideo.style.transform = mirrorCameraCheckbox.checked ? 'scaleX(-1)' : 'none';
}

function getFirstPose(result) {
  const landmarks = result?.poseLandmarks ?? result?.landmarks ?? [];
  return Array.isArray(landmarks[0]) ? landmarks[0] : landmarks;
}

function syncCanvasSize() {
  if (webcamVideo.videoWidth === 0 || webcamVideo.videoHeight === 0) return;
  webcamCanvas.width = webcamVideo.videoWidth;
  webcamCanvas.height = webcamVideo.videoHeight;
}

function smoothPose(pose) {
  if (!pose?.length) return null;
  const settings = getSettings();
  const filtered = pose.map((landmark, index) => {
    const previous = previousPose?.[index];
    const confidence = landmark?.visibility ?? landmark?.presence ?? 1;
    if (!landmark || !previous) return landmark;
    if (confidence < 0.4) return { ...previous, visibility: confidence };
    const amount = confidence < settings.confidence ? settings.smoothing * 0.5 : settings.smoothing;
    return {
      ...landmark,
      x: previous.x + (landmark.x - previous.x) * (1 - amount),
      y: previous.y + (landmark.y - previous.y) * (1 - amount),
      z: previous.z == null || landmark.z == null ? landmark.z : previous.z + (landmark.z - previous.z) * (1 - amount),
    };
  });
  previousPose = filtered;
  return filtered;
}

async function startWebcam() {
  if (isWebcamActive) return;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    });
    webcamVideo.srcObject = cameraStream;
    webcamVideo.muted = true;
    await webcamVideo.play();
    syncCanvasSize();
    isWebcamActive = true;
    startCameraButton.disabled = true;
    stopCameraButton.disabled = false;

    const modelReady = await initPoseLandmarker(qualitySelect.value);
    if (!modelReady) detectionStatus.textContent = '인식 모델을 불러오지 못했습니다.';
    processWebcamFrame();
  } catch (error) {
    console.error('Webcam access error:', error);
    if (error.name === 'NotAllowedError') alert('카메라 권한이 거부되었습니다. 브라우저 설정을 확인하세요.');
    else if (error.name === 'NotFoundError') alert('카메라를 찾을 수 없습니다. 카메라가 연결되어 있는지 확인하세요.');
    else alert('카메라에 접근할 수 없습니다. 오류: ' + error.message);
  }
}

function stopWebcam() {
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  webcamVideo.srcObject = null;
  isWebcamActive = false;
  isProcessingFrame = false;
  previousPose = null;
  latestPose = null;
  latestHolisticResult = null;
  webcamCanvas.getContext('2d').clearRect(0, 0, webcamCanvas.width, webcamCanvas.height);
  saveAvatarButton.disabled = true;
  startCameraButton.disabled = false;
  stopCameraButton.disabled = true;
  detectionStatus.textContent = '카메라가 중지되었습니다.';
}

async function processWebcamFrame() {
  if (!isWebcamActive || isProcessingFrame) return;
  isProcessingFrame = true;
  try {
    const poses = await getPoseData(webcamVideo);
    if (poses) {
      latestPose = smoothPose(getFirstPose(poses));
      latestHolisticResult = { ...poses, poseLandmarks: latestPose ? [latestPose] : [] };
      const settings = getSettings();
      drawSkeleton(webcamCanvas, latestHolisticResult, settings);
      if (latestPose?.length === 0) latestPose = null;
      frameCount += 1;
      const now = performance.now();
      if (now - lastFrameTime >= 1000) {
        displayedFps = frameCount;
        frameCount = 0;
        lastFrameTime = now;
      }
      detectionStatus.textContent = settings.debug
        ? `${latestPose ? '사람 인식됨' : '사람을 찾는 중...'} · FPS ${displayedFps} · 기준 ${settings.confidence.toFixed(2)}`
        : latestPose ? '사람 인식됨' : '사람을 찾는 중...';
      saveAvatarButton.disabled = !latestPose;
    }
  } catch (error) {
    console.error('Pose detection error:', error);
  } finally {
    isProcessingFrame = false;
  }
  requestAnimationFrame(processWebcamFrame);
}

webcamVideo.addEventListener('loadedmetadata', syncCanvasSize);
qualitySelect.addEventListener('change', async () => {
  persistSettings();
  await initPoseLandmarker(qualitySelect.value);
});
settingsButton.addEventListener('click', () => {
  const shouldOpen = settingsPanel.hasAttribute('hidden');
  settingsPanel.toggleAttribute('hidden', !shouldOpen);
  settingsButton.setAttribute('aria-expanded', String(shouldOpen));
});
[smoothingRange, confidenceRange, showSkeletonCheckbox, mirrorCameraCheckbox, debugModeCheckbox].forEach(control => {
  control.addEventListener('input', persistSettings);
  control.addEventListener('change', persistSettings);
});
startCameraButton.addEventListener('click', startWebcam);
stopCameraButton.addEventListener('click', stopWebcam);
saveAvatarButton.addEventListener('click', () => {
  if (!latestPose) {
    detectionStatus.textContent = '저장할 사람을 먼저 인식하세요.';
    return;
  }
  localStorage.setItem('savedHolisticResult', JSON.stringify({
    poseLandmarks: latestPose,
    poseWorldLandmarks: latestHolisticResult.worldLandmarks?.[0] ?? [],
    faceLandmarks: [],
    leftHandLandmarks: [],
    rightHandLandmarks: [],
  }));
  window.location.href = 'avatar.html';
});

persistSettings();
startWebcam();
