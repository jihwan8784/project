import { closeLandmarkers, initPoseLandmarker, getPoseData } from './poseLandmarker.js';
import { drawSkeleton, resetSkeletonState } from './ui.js';
import {
  create2DAvatar,
  DEFAULT_AVATAR_OPTIONS,
} from './avatar2d.js';
import {
  DEFAULT_SELECTION,
  OPTION_GROUPS,
  normalizeSelection,
  selectionToAppearance,
} from './avatarOptions.js';
import { resolveAvatarAssets } from './avatarAssets.js';

const optionReferenceCaption = document.getElementById('optionReferenceCaption');
const avatarPanel = document.querySelector('.avatar-panel');
const avatarPartCoordinates = document.getElementById('avatarPartCoordinates');
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
const randomizeOptionsButton = document.getElementById('randomizeOptionsButton');
const resetOptionsButton = document.getElementById('resetOptionsButton');
const optionSelects = {
  gender: document.getElementById('genderSelect'),
  age: document.getElementById('ageSelect'),
  body: document.getElementById('bodySelect'),
  faceShape: document.getElementById('faceShapeSelect'),
  occupation: document.getElementById('occupationSelect'),
  background: document.getElementById('backgroundSelect'),
  theme: document.getElementById('themeSelect'),
  hairStyle: document.getElementById('hairStyleSelect'),
  accessory: document.getElementById('accessorySelect'),
};
const colorPalettes = {
  skinColor: document.getElementById('skinColorPalette'),
  hairColor: document.getElementById('hairColorPalette'),
  eyeColor: document.getElementById('eyeColorPalette'),
  outfitColor: document.getElementById('outfitColorPalette'),
  accentColor: document.getElementById('accentColorPalette'),
};

const CORE_LANDMARKS = [11, 12, 23, 24];
const LOST_POSE_GRACE_MS = 650;
const LANDMARK_GRACE_MS = 500;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
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
let latestAvatarCoordinates = [];

const OPTION_LABELS = {
  gender: '성별', age: '연령대', body: '체형', faceShape: '얼굴형', occupation: '직업 의상',
  background: '배경', theme: '테마', hairStyle: '헤어스타일', accessory: '액세서리',
  skinColor: '피부색', hairColor: '헤어 컬러', eyeColor: '눈동자', outfitColor: '의상 컬러', accentColor: '포인트 컬러',
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

function fillPalette(group) {
  const palette = colorPalettes[group];
  palette.replaceChildren(...OPTION_GROUPS[group].map(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-swatch';
    button.dataset.value = option.value;
    button.style.setProperty('--swatch-color', option.value);
    button.title = option.label;
    button.setAttribute('aria-label', option.label);
    button.setAttribute('aria-pressed', String(option.value === currentSelection[group]));
    button.classList.toggle('is-selected', option.value === currentSelection[group]);
    button.addEventListener('click', () => {
      currentSelection[group] = option.value;
      syncPaletteSelection(group);
      applyOptionSelection(group);
    });
    return button;
  }));
}

function syncPaletteSelection(group) {
  colorPalettes[group].querySelectorAll('.color-swatch').forEach(button => {
    const selected = button.dataset.value === currentSelection[group];
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function showOptionReference(group) {
  const label = selectedLabel(group, currentSelection[group]);
  const assets = resolveAvatarAssets(currentSelection);
  optionReferenceCaption.textContent = assets.label
    ? `${OPTION_LABELS[group]} · ${label} · ${assets.label} 이미지 적용`
    : `${OPTION_LABELS[group]} · ${label} · 기본 2D 캐릭터`;
}

function renderPartCoordinates(coordinates = latestAvatarCoordinates) {
  latestAvatarCoordinates = coordinates;
  if (!coordinates.length) {
    const empty = document.createElement('p');
    empty.className = 'coordinate-empty';
    empty.textContent = '이 조합에 등록된 부위 이미지가 없습니다.';
    avatarPartCoordinates.replaceChildren(empty);
    return;
  }

  avatarPartCoordinates.replaceChildren(...coordinates.map(part => {
    const row = document.createElement('div');
    row.className = 'coordinate-row';
    row.setAttribute('role', 'row');
    [part.label, part.x, part.y, part.rotation].forEach((value, index) => {
      const cell = document.createElement('span');
      cell.setAttribute('role', 'cell');
      cell.textContent = index === 0 ? String(value) : Number(value).toFixed(2);
      row.appendChild(cell);
    });
    return row;
  }));
}

function applyOptionSelection(changedGroup = 'theme') {
  currentSelection = normalizeSelection({
    ...currentSelection,
    ...Object.fromEntries(Object.entries(optionSelects).map(([key, select]) => [key, select.value])),
  });
  localStorage.setItem('poseVisionAvatarSelection', JSON.stringify(currentSelection));
  liveAvatar?.updateAppearance(readStoredAvatarOptions());
  showOptionReference(changedGroup);
}

function syncControlsFromSelection() {
  fillSelect(optionSelects.gender, OPTION_GROUPS.gender, currentSelection.gender);
  fillSelect(optionSelects.age, OPTION_GROUPS.age, currentSelection.age);
  fillSelect(optionSelects.body, OPTION_GROUPS.bodyByGender[currentSelection.gender], currentSelection.body);
  fillSelect(optionSelects.faceShape, OPTION_GROUPS.faceShape, currentSelection.faceShape);
  fillSelect(optionSelects.occupation, OPTION_GROUPS.occupation, currentSelection.occupation);
  fillSelect(optionSelects.background, OPTION_GROUPS.background, currentSelection.background);
  fillSelect(optionSelects.theme, OPTION_GROUPS.theme, currentSelection.theme);
  fillSelect(optionSelects.hairStyle, OPTION_GROUPS.hairStyle, currentSelection.hairStyle);
  fillSelect(optionSelects.accessory, OPTION_GROUPS.accessory, currentSelection.accessory);
  Object.keys(colorPalettes).forEach(syncPaletteSelection);
}

function initializeOptionControls() {
  Object.keys(colorPalettes).forEach(fillPalette);
  syncControlsFromSelection();

  Object.entries(optionSelects).forEach(([group, select]) => {
    select.addEventListener('change', () => {
      if (group === 'gender') {
        currentSelection.gender = select.value;
        const bodies = OPTION_GROUPS.bodyByGender[currentSelection.gender];
        const nextBody = bodies.some(option => option.value === optionSelects.body.value)
          ? optionSelects.body.value
          : 'standard';
        fillSelect(optionSelects.body, bodies, nextBody);
      }
      applyOptionSelection(group);
    });
  });
}

function randomOption(group) {
  const options = group === 'body' ? OPTION_GROUPS.bodyByGender[currentSelection.gender] : OPTION_GROUPS[group];
  return options[Math.floor(Math.random() * options.length)].value;
}

function randomizeOptions() {
  currentSelection.gender = randomOption('gender');
  ['age', 'body', 'faceShape', 'occupation', 'background', 'theme', 'hairStyle', 'accessory',
    'skinColor', 'hairColor', 'eyeColor', 'outfitColor', 'accentColor']
    .forEach(group => { currentSelection[group] = randomOption(group); });
  currentSelection = normalizeSelection(currentSelection);
  syncControlsFromSelection();
  applyOptionSelection('hairStyle');
}

function resetOptions() {
  currentSelection = normalizeSelection(DEFAULT_SELECTION);
  syncControlsFromSelection();
  applyOptionSelection('theme');
}

function readStoredAvatarOptions() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem('poseVisionAvatarStyle') || '{}');
  } catch {}
  return {
    ...DEFAULT_AVATAR_OPTIONS,
    ...stored,
    ...selectionToAppearance(currentSelection),
    avatarAssets: resolveAvatarAssets(currentSelection),
  };
}

function createLiveAvatar() {
  if (liveAvatar) return;
  liveAvatar = create2DAvatar(liveAvatarOverlay, readStoredAvatarOptions(), {
    overlay: true,
    onCoordinatesChange: renderPartCoordinates,
  });
  liveAvatarOverlay.classList.add('is-visible');
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
      return previous && now - landmarkSeenAt[index] <= LANDMARK_GRACE_MS
        ? { ...previous, stale: true }
        : null;
    }
    landmarkSeenAt[index] = now;
    if (!previous) return { ...point, stale: false };
    const movement = Math.hypot(point.x - previous.x, point.y - previous.y);
    const response = Math.min(0.68, Math.max(0.1, 0.1 + (1 - smoothing) * 0.24 + movement * 2.4));
    return {
      ...point,
      x: previous.x + (point.x - previous.x) * response,
      y: previous.y + (point.y - previous.y) * response,
      z: previous.z == null || point.z == null
        ? point.z
        : previous.z + (point.z - previous.z) * response,
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
      detectionStatus.textContent = 'Pose Lite · 사람을 찾는 중';
    }
    captureButton.disabled = !holdingPose;
  } catch (error) {
    console.error('Tracking failed.', error);
  }
  scheduleNextFrame();
}

async function startTracking() {
  if (tracking || cameraStream) return;
  createLiveAvatar();
  stopCameraButton.disabled = true;
  detectionStatus.textContent = '카메라와 Pose Lite 준비 중';
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    });
    webcamVideo.srcObject = cameraStream;
    await webcamVideo.play();
    syncCanvasSize();

    landmarkSeenAt = new Array(33).fill(0);
    tracking = true;
    stopCameraButton.textContent = '추적 중지';
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
    detectionStatus.textContent = `카메라 없이 아바타 표시 · ${error.message}`;
    stopCameraButton.textContent = '추적 시작';
  } finally {
    stopCameraButton.disabled = false;
  }
}

function stopTracking() {
  tracking = false;
  cancelScheduledFrame();
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  webcamVideo.srcObject = null;
  closeLandmarkers();
  latestPose = null;
  lastReliablePoseAt = 0;
  landmarkSeenAt = new Array(33).fill(0);
  stopCameraButton.textContent = '추적 시작';
  detectionStatus.textContent = '카메라 추적 중지됨';
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
  if (!liveAvatar) return;
  captureButton.disabled = true;
  captureStatus.textContent = '현재 화면을 저장하고 있습니다.';
  try {
    const width = Math.max(1, avatarPanel.clientWidth);
    const height = Math.max(1, avatarPanel.clientHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(liveAvatar.domElement, 0, 0, width, height);

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
    captureButton.disabled = false;
  }
}

async function loadDriveConfig() {
  try {
    const response = await fetch('/api/google/status');
    const config = await response.json();
    googleClientId = config.clientId || '';
    driveConnectButton.disabled = !config.configured;
    driveConnectButton.title = config.configured ? '' : (config.reason || '.env에 GOOGLE_CLIENT_ID를 설정하세요.');
    if (!config.configured) captureStatus.textContent = '';
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

<<<<<<< HEAD
completeOptionsButton.addEventListener('click', startTracking);
randomizeOptionsButton.addEventListener('click', randomizeOptions);
resetOptionsButton.addEventListener('click', resetOptions);
=======
>>>>>>> 6ec7b2d53f84fb0d8420082ab0341a6aba1c28a0
captureButton.addEventListener('click', captureComposite);
driveConnectButton.addEventListener('click', connectGoogleDrive);
driveSaveButton.addEventListener('click', uploadCaptureToDrive);
stopCameraButton.addEventListener('click', () => tracking ? stopTracking() : startTracking());
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
}, { once: true });

initializeOptionControls();
loadSettings();
createLiveAvatar();
applyOptionSelection('theme');
loadDriveConfig();
startTracking();
