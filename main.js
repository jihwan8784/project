import { closeLandmarkers, initPoseLandmarker, getPoseData } from './poseLandmarker.js';
import { drawSkeleton, resetSkeletonState } from './ui.js';
import { create2DAvatar, DEFAULT_AVATAR_OPTIONS } from './avatar2d.js';

const optionSetup = document.getElementById('optionSetup');
const optionPreview = document.getElementById('optionAvatarPreview');
const completeOptionsButton = document.getElementById('completeOptionsButton');
const setupStatus = document.getElementById('setupStatus');
const trackingStage = document.getElementById('trackingStage');
const webcamVideo = document.getElementById('webcamVideo');
const webcamCanvas = document.getElementById('webcamCanvas');
const liveAvatarOverlay = document.getElementById('liveAvatarOverlay');
const detectionStatus = document.getElementById('detectionStatus');
const captureButton = document.getElementById('captureButton');
const driveConnectButton = document.getElementById('driveConnectButton');
const driveSaveButton = document.getElementById('driveSaveButton');
const stopCameraButton = document.getElementById('stopCameraButton');
const settingsButton = document.getElementById('settingsButton');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettingsButton = document.getElementById('closeSettingsButton');
const smoothingRange = document.getElementById('smoothingRange');
const smoothingValue = document.getElementById('smoothingValue');
const confidenceRange = document.getElementById('confidenceRange');
const confidenceValue = document.getElementById('confidenceValue');
const showSkeletonCheckbox = document.getElementById('showSkeletonCheckbox');
const mirrorCameraCheckbox = document.getElementById('mirrorCameraCheckbox');
const captureStatus = document.getElementById('captureStatus');

const CORE_LANDMARKS = [11, 12, 23, 24];
const LOST_POSE_GRACE_MS = 650;
let previewAvatar = null;
let liveAvatar = null;
let cameraStream = null;
let scheduledFrameId = null;
let scheduledFrameType = null;
let tracking = false;
let latestPose = null;
let lastReliablePoseAt = 0;
let lastCaptureBlob = null;
let lastCaptureName = '';
let googleClientId = '';
let googleTokenClient = null;
let googleAccessToken = '';

function readStoredAvatarOptions() {
  try {
    return { ...DEFAULT_AVATAR_OPTIONS, ...JSON.parse(localStorage.getItem('poseVisionAvatarStyle') || '{}') };
  } catch {
    return { ...DEFAULT_AVATAR_OPTIONS };
  }
}

function createPreview() {
  if (!previewAvatar) previewAvatar = create2DAvatar(optionPreview, readStoredAvatarOptions());
}

function getSettings() {
  return {
    smoothing: Number(smoothingRange.value),
    confidence: Number(confidenceRange.value),
    showSkeleton: showSkeletonCheckbox.checked,
    mirror: mirrorCameraCheckbox.checked,
  };
}

function loadSettings() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('poseVisionSettings') || '{}'); } catch {}
  if (stored.smoothing != null) smoothingRange.value = stored.smoothing;
  if (stored.confidence != null) confidenceRange.value = stored.confidence;
  showSkeletonCheckbox.checked = stored.showSkeleton === true;
  mirrorCameraCheckbox.checked = stored.mirror !== false;
  persistSettings();
}

function persistSettings() {
  const settings = getSettings();
  localStorage.setItem('poseVisionSettings', JSON.stringify(settings));
  smoothingValue.value = settings.smoothing.toFixed(2);
  confidenceValue.value = settings.confidence.toFixed(2);
  webcamVideo.style.transform = settings.mirror ? 'scaleX(-1)' : 'none';
}

function syncCanvasSize() {
  if (!webcamVideo.videoWidth || !webcamVideo.videoHeight) return;
  webcamCanvas.width = webcamVideo.videoWidth;
  webcamCanvas.height = webcamVideo.videoHeight;
  resetSkeletonState();
}

function smoothPose(pose, previousPose) {
  if (!pose?.length) return null;
  const smoothing = getSettings().smoothing;
  return pose.map((point, index) => {
    const previous = previousPose?.[index];
    if (!point || !previous) return point;
    const movement = Math.hypot(point.x - previous.x, point.y - previous.y);
    const response = Math.min(0.72, Math.max(0.12, 0.12 + (1 - smoothing) * 0.28 + movement * 2.2));
    return {
      ...point,
      x: previous.x + (point.x - previous.x) * response,
      y: previous.y + (point.y - previous.y) * response,
      z: previous.z == null || point.z == null
        ? point.z
        : previous.z + (point.z - previous.z) * response,
    };
  });
}

function hasReliablePose(pose) {
  const confidence = getSettings().confidence;
  const reliable = index => {
    const point = pose?.[index];
    return point && Math.min(point.visibility ?? 1, point.presence ?? 1) >= confidence;
  };
  const reliableCount = CORE_LANDMARKS.filter(reliable).length;
  return reliableCount >= 3 && [11, 12].some(reliable) && [23, 24].some(reliable);
}

function getCoverMetrics(width, height) {
  const videoWidth = webcamVideo.videoWidth || width;
  const videoHeight = webcamVideo.videoHeight || height;
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const displayWidth = videoWidth * scale;
  const displayHeight = videoHeight * scale;
  return {
    x: (width - displayWidth) / 2,
    y: (height - displayHeight) / 2,
    width: displayWidth,
    height: displayHeight,
  };
}

function getFaceBlendshapes(result) {
  return result?.faceBlendshapes?.[0]?.categories ?? [];
}

function updateLiveAvatar(result, pose) {
  if (!liveAvatar) return;
  const cover = getCoverMetrics(trackingStage.clientWidth, trackingStage.clientHeight);
  liveAvatar.applyPose({
    poseLandmarks: pose,
    faceBlendshapes: getFaceBlendshapes(result),
    mapping: { ...cover, mirror: getSettings().mirror },
  });
  liveAvatarOverlay.classList.add('is-visible');
}

function scheduleNextFrame() {
  if (!tracking) return;
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    scheduledFrameType = 'video';
    scheduledFrameId = webcamVideo.requestVideoFrameCallback(processFrame);
  } else {
    scheduledFrameType = 'animation';
    scheduledFrameId = requestAnimationFrame(processFrame);
  }
}

function cancelScheduledFrame() {
  if (scheduledFrameId == null) return;
  if (scheduledFrameType === 'video') webcamVideo.cancelVideoFrameCallback(scheduledFrameId);
  else cancelAnimationFrame(scheduledFrameId);
  scheduledFrameId = null;
}

function processFrame(now) {
  scheduledFrameId = null;
  if (!tracking) return;
  try {
    const result = getPoseData(webcamVideo, Number.isFinite(now) ? now : performance.now());
    const frameNow = performance.now();
    const rawPose = result?.landmarks?.[0] ?? null;
    const pose = smoothPose(rawPose, latestPose);
    const reliable = hasReliablePose(pose);
    if (reliable) {
      latestPose = pose;
      lastReliablePoseAt = frameNow;
      updateLiveAvatar(result, pose);
    }
    const holdingPose = Boolean(latestPose && frameNow - lastReliablePoseAt <= LOST_POSE_GRACE_MS);

    drawSkeleton(webcamCanvas, {
      ...result,
      poseLandmarks: holdingPose ? [latestPose] : [],
      poseTrackIds: [1],
    }, getSettings());

    if (reliable) {
      detectionStatus.textContent = 'Pose Lite · 실시간 아바타 추적 중';
    } else if (holdingPose) {
      detectionStatus.textContent = 'Pose Lite · 위치 유지 중';
    } else {
      latestPose = null;
      liveAvatarOverlay.classList.remove('is-visible');
      detectionStatus.textContent = 'Pose Lite · 사람을 찾는 중';
    }
    captureButton.disabled = !holdingPose;
  } catch (error) {
    console.error('Tracking failed.', error);
  }
  scheduleNextFrame();
}

async function startTracking() {
  completeOptionsButton.disabled = true;
  setupStatus.textContent = '카메라와 Pose Lite를 준비하고 있습니다.';
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    });
    webcamVideo.srcObject = cameraStream;
    await webcamVideo.play();
    syncCanvasSize();
    if (!await initPoseLandmarker()) throw new Error('Pose Lite 모델을 불러오지 못했습니다.');

    previewAvatar?.dispose();
    previewAvatar = null;
    optionSetup.hidden = true;
    trackingStage.hidden = false;
    liveAvatarOverlay.hidden = false;
    liveAvatarOverlay.classList.remove('is-visible');
    liveAvatar = create2DAvatar(liveAvatarOverlay, readStoredAvatarOptions(), {
      overlay: true,
    });
    tracking = true;
    scheduleNextFrame();
  } catch (error) {
    console.error('Camera start failed.', error);
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = null;
    setupStatus.textContent = `시작 실패: ${error.message}`;
    completeOptionsButton.disabled = false;
  }
}

function stopTracking() {
  tracking = false;
  cancelScheduledFrame();
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  webcamVideo.srcObject = null;
  closeLandmarkers();
  liveAvatar?.dispose();
  liveAvatar = null;
  liveAvatarOverlay.classList.remove('is-visible');
  liveAvatarOverlay.hidden = true;
  latestPose = null;
  lastReliablePoseAt = 0;
  trackingStage.hidden = true;
  optionSetup.hidden = false;
  completeOptionsButton.disabled = false;
  setupStatus.textContent = '';
  createPreview();
}

function drawVideoCover(context, width, height, mirror) {
  const cover = getCoverMetrics(width, height);
  context.save();
  if (mirror) {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(webcamVideo, cover.x, cover.y, cover.width, cover.height);
  context.restore();
  return cover;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('이미지 생성에 실패했습니다.')), 'image/png');
  });
}

function timestampName() {
  return `pose-vision-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
}

async function captureComposite() {
  if (!latestPose || !liveAvatar) return;
  captureButton.disabled = true;
  captureStatus.textContent = '현재 화면을 저장하고 있습니다.';
  try {
    const width = trackingStage.clientWidth;
    const height = trackingStage.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    drawVideoCover(context, width, height, getSettings().mirror);

    if (getSettings().showSkeleton) {
      const cover = getCoverMetrics(width, height);
      context.drawImage(webcamCanvas, cover.x, cover.y, cover.width, cover.height);
    }

    context.drawImage(liveAvatar.domElement, 0, 0, width, height);

    lastCaptureBlob = await canvasToBlob(canvas);
    lastCaptureName = timestampName();
    const link = document.createElement('a');
    link.download = lastCaptureName;
    link.href = URL.createObjectURL(lastCaptureBlob);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    driveSaveButton.disabled = !googleAccessToken;
    captureStatus.textContent = '사진 저장 완료. Drive 연결 후 업로드할 수 있습니다.';
  } catch (error) {
    captureStatus.textContent = `캡처 실패: ${error.message}`;
  } finally {
    captureButton.disabled = !latestPose;
  }
}

async function loadDriveConfig() {
  try {
    const response = await fetch('/api/google/status');
    const config = await response.json();
    googleClientId = config.clientId || '';
    driveConnectButton.disabled = !config.configured;
    if (!config.configured) driveConnectButton.title = '.env에 GOOGLE_CLIENT_ID를 설정하세요.';
  } catch {
    driveConnectButton.disabled = true;
  }
}

function connectGoogleDrive() {
  if (!googleClientId) return;
  if (!window.google?.accounts?.oauth2) {
    captureStatus.textContent = 'Google 로그인 모듈을 불러오는 중입니다. 잠시 후 다시 시도하세요.';
    return;
  }
  if (!googleTokenClient) {
    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: response => {
        if (response.error) {
          captureStatus.textContent = `Drive 연결 실패: ${response.error}`;
          return;
        }
        googleAccessToken = response.access_token;
        driveConnectButton.textContent = 'Drive 연결됨';
        driveSaveButton.disabled = !lastCaptureBlob;
        captureStatus.textContent = 'Google Drive 연결 완료.';
      },
    });
  }
  googleTokenClient.requestAccessToken({ prompt: googleAccessToken ? '' : 'consent' });
}

async function uploadCaptureToDrive() {
  if (!lastCaptureBlob || !googleAccessToken) return;
  driveSaveButton.disabled = true;
  captureStatus.textContent = 'Google Drive에 업로드하고 있습니다.';
  const boundary = `pose_vision_${Date.now()}`;
  const metadata = { name: lastCaptureName || timestampName(), mimeType: 'image/png' };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: image/png\r\n\r\n`,
    lastCaptureBlob,
    `\r\n--${boundary}--`,
  ]);

  try {
    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || `HTTP ${response.status}`);
    captureStatus.textContent = `Drive 저장 완료: ${result.name}`;
  } catch (error) {
    if (/401|invalid.*credential/i.test(error.message)) googleAccessToken = '';
    captureStatus.textContent = `Drive 저장 실패: ${error.message}`;
  } finally {
    driveSaveButton.disabled = !lastCaptureBlob || !googleAccessToken;
  }
}

completeOptionsButton.addEventListener('click', startTracking);
captureButton.addEventListener('click', captureComposite);
driveConnectButton.addEventListener('click', connectGoogleDrive);
driveSaveButton.addEventListener('click', uploadCaptureToDrive);
stopCameraButton.addEventListener('click', stopTracking);
webcamVideo.addEventListener('loadedmetadata', syncCanvasSize);
settingsButton.addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsButton.setAttribute('aria-expanded', String(!settingsPanel.hidden));
});
closeSettingsButton.addEventListener('click', () => {
  settingsPanel.hidden = true;
  settingsButton.setAttribute('aria-expanded', 'false');
});
[smoothingRange, confidenceRange, showSkeletonCheckbox, mirrorCameraCheckbox]
  .forEach(control => {
    control.addEventListener('input', persistSettings);
    control.addEventListener('change', persistSettings);
  });

window.addEventListener('pagehide', () => {
  tracking = false;
  cancelScheduledFrame();
  cameraStream?.getTracks().forEach(track => track.stop());
  closeLandmarkers();
  liveAvatar?.dispose();
  previewAvatar?.dispose();
}, { once: true });

loadSettings();
createPreview();
loadDriveConfig();
