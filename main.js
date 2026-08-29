import { closeLandmarkers, initPoseLandmarker, getPoseData } from './poseLandmarker.js';
import { drawSkeleton, resetSkeletonState } from './ui.js';
import { create2DAvatar, DEFAULT_AVATAR_OPTIONS } from './avatarObj.js';
import {
  OPTION_GROUPS,
  normalizeSelection,
  selectionToAppearance,
} from './avatarOptions.js';

const optionSetup = document.getElementById('optionSetup');
const optionPreview = document.getElementById('optionAvatarPreview');
const optionReferenceCaption = document.getElementById('optionReferenceCaption');
const completeOptionsButton = document.getElementById('completeOptionsButton');
const setupStatus = document.getElementById('setupStatus');
const trackingStage = document.getElementById('trackingStage');
const cameraPanel = document.querySelector('.camera-panel');
const avatarPanel = document.querySelector('.avatar-panel');
const webcamVideo = document.getElementById('webcamVideo');
const webcamCanvas = document.getElementById('webcamCanvas');
const liveAvatarOverlay = document.getElementById('liveAvatarOverlay');
const detectionStatus = document.getElementById('detectionStatus');
const captureButton = document.getElementById('captureButton');
const driveConnectButton = document.getElementById('driveConnectButton');
const driveSaveButton = document.getElementById('driveSaveButton');
const stopCameraButton = document.getElementById('stopCameraButton');
const settingsButton = document.getElementById('settingsButton');
const avatarEditButton = document.getElementById('avatarEditButton');
const cameraViewButton = document.getElementById('cameraViewButton');
const liveAvatarEditor = document.getElementById('liveAvatarEditor');
const closeAvatarEditorButton = document.getElementById('closeAvatarEditorButton');
const liveOptionStatus = document.getElementById('liveOptionStatus');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettingsButton = document.getElementById('closeSettingsButton');
const smoothingRange = document.getElementById('smoothingRange');
const smoothingValue = document.getElementById('smoothingValue');
const confidenceRange = document.getElementById('confidenceRange');
const confidenceValue = document.getElementById('confidenceValue');
const showSkeletonCheckbox = document.getElementById('showSkeletonCheckbox');
const mirrorCameraCheckbox = document.getElementById('mirrorCameraCheckbox');
const captureStatus = document.getElementById('captureStatus');
const optionSelects = {
  gender: document.getElementById('genderSelect'),
  occupation: document.getElementById('occupationSelect'),
  background: document.getElementById('backgroundSelect'),
  hairStyle: document.getElementById('hairStyleSelect'),
};
const liveOptionSelects = {
  gender: document.getElementById('liveGenderSelect'),
  occupation: document.getElementById('liveOccupationSelect'),
  background: document.getElementById('liveBackgroundSelect'),
  hairStyle: document.getElementById('liveHairStyleSelect'),
};
const avatarColorInputs = {
  skinColor: document.getElementById('skinColorInput'),
  hairColor: document.getElementById('hairColorInput'),
  eyeColor: document.getElementById('eyeColorInput'),
  topColor: document.getElementById('topColorInput'),
  bottomColor: document.getElementById('bottomColorInput'),
  accentColor: document.getElementById('accentColorInput'),
  shoeColor: document.getElementById('shoeColorInput'),
};
const resetAvatarColorsButton = document.getElementById('resetAvatarColorsButton');

const CORE_LANDMARKS = [11, 12, 23, 24];
const LOST_POSE_GRACE_MS = 650;
const LANDMARK_GRACE_MS = 850;
const MAX_PREDICTION_STEP = 0.025;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
let previewAvatar = null;
let liveAvatar = null;
let cameraStream = null;
let scheduledFrameId = null;
let scheduledFrameType = null;
let tracking = false;
let latestPose = null;
let lastReliablePoseAt = 0;
let landmarkSeenAt = new Array(33).fill(0);
let lastCaptureBlob = null;
let lastCaptureName = '';
let googleClientId = '';
let googleTokenClient = null;
let googleAccessToken = '';
let googleTokenExpiresAt = 0;
let googleIdentityPromise = null;
let currentSelection = readStoredSelection();
let customAvatarColors = readStoredAvatarColors();
let cameraPanelVisible = true;

const OPTION_LABELS = {
  gender: '성별', age: '연령대', body: '체형', occupation: '직업군', background: '배경', theme: '테마', hairStyle: '헤어스타일',
};

function readStoredSelection() {
  try {
    return normalizeSelection(JSON.parse(localStorage.getItem('poseVisionAvatarSelection') || '{}'));
  } catch {
    return normalizeSelection();
  }
}

function fillSelect(select, options, value) {
  select.replaceChildren(...options.map(option => {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    return element;
  }));
  select.value = value;
}

function selectedLabel(group, value) {
  const options = group === 'body'
    ? OPTION_GROUPS.bodyByGender[currentSelection.gender]
    : OPTION_GROUPS[group];
  return options.find(option => option.value === value)?.label || value;
}

function showOptionReference(group) {
  const label = selectedLabel(group, currentSelection[group]);
  optionReferenceCaption.textContent = `${OPTION_LABELS[group]} · ${label} · GLB 캐릭터`;
}

function applyOptionSelection(changedGroup = 'occupation', sourceSelects = optionSelects) {
  currentSelection = normalizeSelection(Object.fromEntries(
    Object.entries(sourceSelects).map(([key, select]) => [key, select.value]),
  ));
  localStorage.setItem('poseVisionAvatarSelection', JSON.stringify(currentSelection));
  previewAvatar?.updateAppearance(currentAppearance());
  liveAvatar?.updateAppearance(currentAppearance());
  Object.entries(optionSelects).forEach(([key, select]) => { select.value = currentSelection[key]; });
  Object.entries(liveOptionSelects).forEach(([key, select]) => { select.value = currentSelection[key]; });
  if (liveOptionStatus) liveOptionStatus.textContent = `${selectedLabel(changedGroup, currentSelection[changedGroup])} 적용 완료`;
  showOptionReference(changedGroup);
}

function readStoredAvatarColors() {
  try {
    const stored = JSON.parse(localStorage.getItem('poseVisionAvatarStyle') || '{}');
    return Object.fromEntries(Object.keys(avatarColorInputs)
      .filter(key => /^#[0-9a-f]{6}$/i.test(stored[key]))
      .map(key => [key, stored[key]]));
  } catch { return {}; }
}

function currentAppearance() {
  return { ...selectionToAppearance(currentSelection), ...customAvatarColors };
}

function initializeOptionControls() {
  fillSelect(optionSelects.gender, OPTION_GROUPS.gender, currentSelection.gender);
  fillSelect(optionSelects.occupation, OPTION_GROUPS.occupation, currentSelection.occupation);
  fillSelect(optionSelects.background, OPTION_GROUPS.background, currentSelection.background);
  fillSelect(optionSelects.hairStyle, OPTION_GROUPS.hairStyle, currentSelection.hairStyle);

  Object.entries(optionSelects).forEach(([group, select]) => {
    select.addEventListener('change', () => {
      applyOptionSelection(group);
    });
  });

  fillSelect(liveOptionSelects.gender, OPTION_GROUPS.gender, currentSelection.gender);
  fillSelect(liveOptionSelects.occupation, OPTION_GROUPS.occupation, currentSelection.occupation);
  fillSelect(liveOptionSelects.background, OPTION_GROUPS.background, currentSelection.background);
  fillSelect(liveOptionSelects.hairStyle, OPTION_GROUPS.hairStyle, currentSelection.hairStyle);
  Object.entries(liveOptionSelects).forEach(([group, select]) => {
    select.addEventListener('change', () => {
      applyOptionSelection(group, liveOptionSelects);
    });
  });
}

function readStoredAvatarOptions() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem('poseVisionAvatarStyle') || '{}');
  } catch {}
  return { ...DEFAULT_AVATAR_OPTIONS, ...selectionToAppearance(currentSelection), ...stored };
}

function initializeAvatarColorControls() {
  const appearance = { ...DEFAULT_AVATAR_OPTIONS, ...currentAppearance() };
  Object.entries(avatarColorInputs).forEach(([key, input]) => {
    input.value = appearance[key];
    input.addEventListener('input', () => {
      customAvatarColors[key] = input.value;
      localStorage.setItem('poseVisionAvatarStyle', JSON.stringify(customAvatarColors));
      previewAvatar?.updateAppearance(currentAppearance());
      liveAvatar?.updateAppearance(currentAppearance());
      liveOptionStatus.textContent = `${input.previousElementSibling.textContent} 색상 적용 완료`;
    });
  });
  resetAvatarColorsButton.addEventListener('click', () => {
    customAvatarColors = {};
    localStorage.removeItem('poseVisionAvatarStyle');
    const defaults = { ...DEFAULT_AVATAR_OPTIONS, ...selectionToAppearance(currentSelection) };
    Object.entries(avatarColorInputs).forEach(([key, input]) => { input.value = defaults[key]; });
    previewAvatar?.updateAppearance(defaults);
    liveAvatar?.updateAppearance(defaults);
    liveOptionStatus.textContent = '직업·테마 기본색으로 복원했습니다';
  });
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
  // Skeleton feedback is enabled by default so the user can immediately see
  // whether the camera recognizer is receiving a usable pose.
  showSkeletonCheckbox.checked = true;
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

function smoothPose(pose, previousPose, now) {
  if (!pose?.length) return null;
  const smoothing = getSettings().smoothing;
  return Array.from({ length: 33 }, (_, index) => {
    const point = pose[index];
    const previous = previousPose?.[index];
    const confidence = point
      ? Math.min(point.visibility ?? 1, point.presence ?? 1)
      : 0;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || confidence < 0.14) {
      if (!previous || now - landmarkSeenAt[index] > LANDMARK_GRACE_MS) return null;
      const missingAge = now - landmarkSeenAt[index];
      const decay = Math.max(0, 1 - missingAge / LANDMARK_GRACE_MS);
      const vx = Math.max(-MAX_PREDICTION_STEP, Math.min(MAX_PREDICTION_STEP, previous.vx || 0)) * decay;
      const vy = Math.max(-MAX_PREDICTION_STEP, Math.min(MAX_PREDICTION_STEP, previous.vy || 0)) * decay;
      const vz = Math.max(-MAX_PREDICTION_STEP, Math.min(MAX_PREDICTION_STEP, previous.vz || 0)) * decay;
      return {
        ...previous,
        x: previous.x + vx,
        y: previous.y + vy,
        z: previous.z == null ? previous.z : previous.z + vz,
        vx: vx * 0.72,
        vy: vy * 0.72,
        vz: vz * 0.72,
        stale: true,
      };
    }
    landmarkSeenAt[index] = now;
    if (!previous) return { ...point, stale: false };
    const movement = Math.hypot(point.x - previous.x, point.y - previous.y);
    // Track the live camera closely while retaining just enough damping to
    // remove single-frame landmark noise.
    const response = Math.min(0.94, Math.max(0.34, 0.34 + (1 - smoothing) * 0.38 + movement * 3.2));
    return {
      ...point,
      x: previous.x + (point.x - previous.x) * response,
      y: previous.y + (point.y - previous.y) * response,
      z: previous.z == null || point.z == null
        ? point.z
        : previous.z + (point.z - previous.z) * response,
      vx: (point.x - previous.x) * response,
      vy: (point.y - previous.y) * response,
      vz: previous.z == null || point.z == null ? 0 : (point.z - previous.z) * response,
      stale: false,
    };
  });
}

function hasReliablePose(pose) {
  const confidence = getSettings().confidence;
  const reliable = index => {
    const point = pose?.[index];
    return point && !point.stale && Math.min(point.visibility ?? 1, point.presence ?? 1) >= confidence;
  };
  const reliableCount = CORE_LANDMARKS.filter(reliable).length;
  // A partial body is still useful for the avatar. Requiring three of four
  // points made tracking disappear whenever one shoulder or hip was occluded.
  return reliableCount >= 2 && [11, 12].some(reliable) && [23, 24].some(reliable);
}

function getDetectedBodyParts(pose, result) {
  const threshold = getSettings().confidence;
  const visible = index => {
    const point = pose?.[index];
    return Boolean(point && !point.stale &&
      Math.min(point.visibility ?? 1, point.presence ?? 1) >= threshold);
  };
  const has = indices => indices.filter(visible).length >= Math.ceil(indices.length * 0.67);
  return {
    face: Boolean(result?.faceLandmarks?.[0]?.length) || has([0, 2, 5, 7, 8]),
    torso: has([11, 12, 23, 24]),
    leftArm: has([11, 13, 15]),
    rightArm: has([12, 14, 16]),
    leftLeg: has([23, 25, 27]),
    rightLeg: has([24, 26, 28]),
  };
}

function bodyPartStatus(parts) {
  const labels = [];
  if (parts.face) labels.push('얼굴');
  if (parts.torso) labels.push('몸통');
  if (parts.leftArm || parts.rightArm) labels.push(`팔 ${Number(parts.leftArm) + Number(parts.rightArm)}/2`);
  if (parts.leftLeg || parts.rightLeg) labels.push(`다리 ${Number(parts.leftLeg) + Number(parts.rightLeg)}/2`);
  return labels.join(' · ');
}

function setCameraPanelVisible(visible) {
  cameraPanelVisible = visible;
  trackingStage.classList.toggle('avatar-only', !visible);
  cameraViewButton.textContent = visible ? '카메라 숨기기' : '카메라 보기';
  cameraViewButton.setAttribute('aria-pressed', String(!visible));
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
  const width = Math.max(1, avatarPanel.clientWidth);
  const height = Math.max(1, avatarPanel.clientHeight);
  liveAvatar.applyPose({
    poseLandmarks: pose,
    faceBlendshapes: getFaceBlendshapes(result),
    // The camera and avatar are separate panels. Keep the pose normalized so
    // the avatar is positioned inside its own panel, not in camera coordinates.
    mapping: { x: 0, y: 0, width, height, mirror: getSettings().mirror },
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
    const pose = smoothPose(rawPose, latestPose, frameNow);
    const detectedParts = getDetectedBodyParts(pose, result);
    const reliable = hasReliablePose(pose);
    const trackable = detectedParts.torso || detectedParts.leftArm || detectedParts.rightArm ||
      detectedParts.leftLeg || detectedParts.rightLeg;
    if (pose && trackable) {
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
      detectionStatus.textContent = `인식 중 · ${bodyPartStatus(detectedParts)}`;
    } else if (trackable) {
      detectionStatus.textContent = `부분 추적 중 · ${bodyPartStatus(detectedParts)}`;
    } else if (holdingPose) {
      detectionStatus.textContent = `부분 인식 · ${bodyPartStatus(detectedParts) || '자세 유지'}`;
    } else {
      latestPose = null;
      liveAvatar?.clearPose();
      detectionStatus.textContent = detectedParts.face ? '얼굴 인식 · 전신을 화면에 맞춰 주세요' : '얼굴 · 몸통 · 팔 · 다리를 찾는 중';
    }
    captureButton.disabled = !holdingPose;
  } catch (error) {
    console.error('Tracking failed.', error);
  }
  scheduleNextFrame();
}

async function startTracking() {
  completeOptionsButton.disabled = true;
  optionSetup.hidden = true;
  trackingStage.hidden = false;
  setCameraPanelVisible(true);
  setupStatus.textContent = '카메라와 Pose Lite를 준비하고 있습니다.';
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    });
    webcamVideo.srcObject = cameraStream;
    await webcamVideo.play();
    syncCanvasSize();

    previewAvatar?.dispose();
    previewAvatar = null;
    liveAvatarOverlay.hidden = false;
    liveAvatarOverlay.classList.add('is-visible');
    liveAvatar = create2DAvatar(liveAvatarOverlay, readStoredAvatarOptions(), {
      overlay: true,
    });
    landmarkSeenAt = new Array(33).fill(0);
    tracking = true;
    scheduleNextFrame();

    // The camera/avatar stage should not be blocked by a slow or unavailable
    // landmark model. Tracking can start in a waiting state and recover when
    // the model is ready.
    const poseReady = await initPoseLandmarker();
    detectionStatus.textContent = poseReady
      ? 'Pose Lite · 실시간 아바타 추적 준비 완료'
      : '카메라 연결됨 · Pose Lite를 준비하지 못했습니다.';
  } catch (error) {
    console.error('Camera start failed.', error);
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = null;
    detectionStatus.textContent = `카메라 시작 실패: ${error.message}`;
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
  landmarkSeenAt = new Array(33).fill(0);
  trackingStage.hidden = true;
  setCameraPanelVisible(true);
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

function drawCameraPanel(context, x, y, width, height, mirror) {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.translate(x, y);
  drawVideoCover(context, width, height, mirror);
  context.restore();
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
    const stageRect = trackingStage.getBoundingClientRect();
    const cameraRect = cameraPanel.getBoundingClientRect();
    const avatarRect = avatarPanel.getBoundingClientRect();
    const cameraX = cameraRect.left - stageRect.left;
    const cameraY = cameraRect.top - stageRect.top;
    const avatarX = avatarRect.left - stageRect.left;
    const avatarY = avatarRect.top - stageRect.top;
    const panelWidth = Math.max(1, avatarRect.width);
    const panelHeight = Math.max(1, avatarRect.height);
    const avatarGradient = context.createLinearGradient(avatarX, avatarY, avatarX + panelWidth, avatarY + panelHeight);
    avatarGradient.addColorStop(0, '#17152e');
    avatarGradient.addColorStop(1, '#081018');
    context.fillStyle = avatarGradient;
    context.fillRect(avatarX, avatarY, panelWidth, panelHeight);
    drawCameraPanel(context, cameraX, cameraY, cameraRect.width, cameraRect.height, getSettings().mirror);

    if (getSettings().showSkeleton) {
      context.drawImage(webcamCanvas, cameraX, cameraY, cameraRect.width, cameraRect.height);
    }

    context.drawImage(liveAvatar.domElement, avatarX, avatarY, panelWidth, panelHeight);

    lastCaptureBlob = await canvasToBlob(canvas);
    lastCaptureName = timestampName();
    const link = document.createElement('a');
    link.download = lastCaptureName;
    link.href = URL.createObjectURL(lastCaptureBlob);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    driveSaveButton.disabled = !hasValidDriveToken();
    captureStatus.textContent = hasValidDriveToken()
      ? '사진 저장 완료. Drive에 업로드할 수 있습니다.'
      : '사진 저장 완료. Drive 연결 후 업로드할 수 있습니다.';
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
    driveConnectButton.title = config.configured ? '' : (config.reason || '.env에 GOOGLE_CLIENT_ID를 설정하세요.');
    if (!config.configured) captureStatus.textContent = config.reason || 'Google Drive OAuth 설정이 필요합니다.';
  } catch (error) {
    driveConnectButton.disabled = true;
    driveConnectButton.title = 'Google Drive 설정을 확인할 수 없습니다.';
    console.error('Drive configuration check failed.', error);
  }
}

function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (googleIdentityPromise) return googleIdentityPromise;
  googleIdentityPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.async = true;
    script.onload = () => window.google?.accounts?.oauth2
      ? resolve()
      : reject(new Error('Google 로그인 모듈을 초기화하지 못했습니다.'));
    script.onerror = () => reject(new Error('Google 로그인 모듈을 불러오지 못했습니다.'));
    document.head.appendChild(script);
  }).catch(error => {
    googleIdentityPromise = null;
    throw error;
  });
  return googleIdentityPromise;
}

function hasValidDriveToken() {
  return Boolean(googleAccessToken && Date.now() < googleTokenExpiresAt);
}

function clearDriveToken(message = '') {
  googleAccessToken = '';
  googleTokenExpiresAt = 0;
  driveConnectButton.textContent = 'Google Drive 연결';
  driveSaveButton.disabled = true;
  if (message) captureStatus.textContent = message;
}

async function connectGoogleDrive() {
  if (!googleClientId) {
    captureStatus.textContent = '.env에 유효한 GOOGLE_CLIENT_ID를 설정하고 서버를 다시 시작하세요.';
    return;
  }
  if (hasValidDriveToken()) {
    captureStatus.textContent = 'Google Drive가 이미 연결되어 있습니다.';
    return;
  }

  driveConnectButton.disabled = true;
  driveConnectButton.textContent = 'Drive 연결 중';
  captureStatus.textContent = 'Google 로그인 창을 준비하고 있습니다.';
  try {
    await loadGoogleIdentity();
    if (!googleTokenClient) {
      googleTokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: DRIVE_SCOPE,
        callback: response => {
          driveConnectButton.disabled = false;
          if (response.error || !response.access_token) {
            clearDriveToken(`Drive 인증 실패: ${response.error_description || response.error || '토큰 없음'}`);
            return;
          }
          const scopeGranted = window.google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE);
          if (!scopeGranted) {
            clearDriveToken('Drive 파일 저장 권한이 허용되지 않았습니다. 다시 연결해 권한을 승인하세요.');
            return;
          }
          googleAccessToken = response.access_token;
          googleTokenExpiresAt = Date.now() + Math.max(60, Number(response.expires_in) || 3600) * 1000 - 60_000;
          driveConnectButton.textContent = 'Drive 연결됨';
          driveSaveButton.disabled = !lastCaptureBlob;
          captureStatus.textContent = 'Google Drive 연결 완료.';
        },
        error_callback: error => {
          driveConnectButton.disabled = false;
          clearDriveToken(error.type === 'popup_closed'
            ? 'Google 로그인 창이 닫혔습니다.'
            : 'Google 로그인 팝업을 열지 못했습니다. 팝업 차단을 해제하세요.');
        },
      });
    }
    googleTokenClient.requestAccessToken({ prompt: 'consent' });
  } catch (error) {
    driveConnectButton.disabled = false;
    clearDriveToken(`Drive 연결 실패: ${error.message}`);
  }
}

function createDriveMultipartBody(file, boundary) {
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  return new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify({ name: file.name, mimeType: file.type }),
    delimiter,
    `Content-Type: ${file.type}\r\n\r\n`,
    file,
    closeDelimiter,
  ]);
}

function driveUploadError(response, result) {
  const apiMessage = result.error?.message;
  const reason = result.error?.errors?.[0]?.reason;
  if (response.status === 401) return '로그인 토큰이 만료되었습니다. Drive를 다시 연결하세요.';
  if (response.status === 403) {
    return reason === 'accessNotConfigured'
      ? 'Google Cloud 프로젝트에서 Drive API를 사용 설정하세요.'
      : 'Drive 권한이 없습니다. OAuth 테스트 사용자와 drive.file 권한을 확인하세요.';
  }
  return apiMessage || `Drive API 오류 (${response.status})`;
}

async function uploadCaptureToDrive() {
  if (!lastCaptureBlob) {
    captureStatus.textContent = '먼저 사진을 캡처하세요.';
    return;
  }
  if (!hasValidDriveToken()) {
    clearDriveToken('Drive 연결이 없거나 만료되었습니다. 다시 연결하세요.');
    return;
  }

  driveSaveButton.disabled = true;
  driveSaveButton.textContent = '업로드 중';
  captureStatus.textContent = 'Google Drive에 업로드하고 있습니다.';
  const boundary = `pose_vision_${Date.now()}`;
  const file = new File([lastCaptureBlob], lastCaptureName || timestampName(), { type: 'image/png' });
  const body = createDriveMultipartBody(file, boundary);

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
    if (!response.ok) {
      const error = new Error(driveUploadError(response, result));
      error.status = response.status;
      throw error;
    }
    captureStatus.textContent = `Drive 저장 완료: ${result.name}`;
    captureStatus.title = result.webViewLink || '';
  } catch (error) {
    if (error.status === 401) clearDriveToken();
    captureStatus.textContent = `Drive 저장 실패: ${error.message}`;
  } finally {
    driveSaveButton.textContent = 'Drive에 저장';
    driveSaveButton.disabled = !lastCaptureBlob || !hasValidDriveToken();
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
avatarEditButton.addEventListener('click', () => {
  liveAvatarEditor.hidden = !liveAvatarEditor.hidden;
  settingsPanel.hidden = true;
  settingsButton.setAttribute('aria-expanded', 'false');
  avatarEditButton.setAttribute('aria-expanded', String(!liveAvatarEditor.hidden));
});
cameraViewButton.addEventListener('click', () => setCameraPanelVisible(!cameraPanelVisible));
closeAvatarEditorButton.addEventListener('click', () => {
  liveAvatarEditor.hidden = true;
  avatarEditButton.setAttribute('aria-expanded', 'false');
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

initializeOptionControls();
initializeAvatarColorControls();
loadSettings();
createPreview();
applyOptionSelection('occupation');
loadDriveConfig();
