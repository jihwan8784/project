import { closeLandmarkers, initPoseLandmarker, getPoseData } from './poseLandmarker.js';
import { drawSkeleton, resetSkeletonState } from './ui.js';

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
const welcomePanel = document.getElementById('welcomePanel');
const cameraHud = document.getElementById('cameraHud');
const closeSettingsButton = document.getElementById('closeSettingsButton');

let isWebcamActive = false;
let scheduledFrameId = null;
let scheduledFrameType = null;
let latestPose = null;
let latestPoseSourceIndex = -1;
let latestHolisticResult = null;
let poseTracks = [];
let nextPoseTrackId = 1;
let cameraStream = null;
let lastFrameTime = performance.now();
let frameCount = 0;
let displayedFps = 0;

const MAX_PEOPLE = 4;
const POSE_TRACK_TTL_MS = 500;
const POSE_MATCH_DISTANCE = 0.32;
const CORE_LANDMARKS = [11, 12, 23, 24];

function setCameraUiState(active) {
  welcomePanel.toggleAttribute('hidden', active);
  cameraHud.toggleAttribute('hidden', !active);
  document.body.classList.toggle('camera-active', active);
  startCameraButton.disabled = active;
  stopCameraButton.disabled = !active;
  if (!active) {
    settingsPanel.hidden = true;
    settingsButton.setAttribute('aria-expanded', 'false');
  }
}

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

function getDetectedPoses(result) {
  const landmarks = result?.landmarks ?? [];
  if (!Array.isArray(landmarks)) return [];
  return Array.isArray(landmarks[0]) ? landmarks : landmarks.length ? [landmarks] : [];
}

function getPoseCenter(pose) {
  if (!pose?.length) return null;
  let points = CORE_LANDMARKS
    .map(index => pose[index])
    .filter(point =>
      Number.isFinite(point?.x) &&
      Number.isFinite(point?.y) &&
      Math.min(point.visibility ?? 1, point.presence ?? 1) >= 0.15
    );

  if (points.length === 0) {
    points = pose.filter(point =>
      Number.isFinite(point?.x) && Number.isFinite(point?.y)
    );
  }
  if (points.length === 0) return null;

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function syncCanvasSize() {
  if (webcamVideo.videoWidth === 0 || webcamVideo.videoHeight === 0) return;
  if (
    webcamCanvas.width === webcamVideo.videoWidth &&
    webcamCanvas.height === webcamVideo.videoHeight
  ) return;
  webcamCanvas.width = webcamVideo.videoWidth;
  webcamCanvas.height = webcamVideo.videoHeight;
  resetSkeletonState();
}

function smoothPose(pose, previousPose) {
  if (!pose?.length) return null;
  const settings = getSettings();
  return pose.map((landmark, index) => {
    const previous = previousPose?.[index];
    if (!landmark) return previous ?? null;

    const confidence = Math.min(
      landmark.visibility ?? 1,
      landmark.presence ?? 1,
    );
    if (!previous) return landmark;

    if (confidence < settings.confidence * 0.7) {
      return {
        ...previous,
        visibility: landmark.visibility,
        presence: landmark.presence,
      };
    }

    const movement = Math.hypot(
      landmark.x - previous.x,
      landmark.y - previous.y,
    );
    const baseResponse = 1 - settings.smoothing;
    const response = Math.min(1, Math.max(0.08, baseResponse + movement * 5));

    return {
      ...landmark,
      x: previous.x + (landmark.x - previous.x) * response,
      y: previous.y + (landmark.y - previous.y) * response,
      z: previous.z == null || landmark.z == null
        ? landmark.z
        : previous.z + (landmark.z - previous.z) * response,
    };
  });
}

function hasReliablePose(pose, confidence) {
  if (!pose?.length) return false;
  const reliableCorePoints = CORE_LANDMARKS.filter(index => {
    const point = pose[index];
    return point &&
      Math.min(point.visibility ?? 1, point.presence ?? 1) >= confidence;
  }).length;
  return reliableCorePoints >= 2;
}

function updatePoseTracks(rawPoses, now) {
  const activeTracks = poseTracks.filter(
    track => now - track.lastSeenAt <= POSE_TRACK_TTL_MS,
  );
  const unmatchedTrackIndexes = new Set(activeTracks.map((_, index) => index));
  const updatedTracks = rawPoses.slice(0, MAX_PEOPLE).map((pose, sourceIndex) => {
    const center = getPoseCenter(pose);
    let matchedIndex = -1;
    let closestDistance = POSE_MATCH_DISTANCE;

    if (center) {
      unmatchedTrackIndexes.forEach(trackIndex => {
        const previousCenter = activeTracks[trackIndex].center;
        if (!previousCenter) return;
        const distance = Math.hypot(
          center.x - previousCenter.x,
          center.y - previousCenter.y,
        );
        if (distance < closestDistance) {
          closestDistance = distance;
          matchedIndex = trackIndex;
        }
      });
    }

    const previousTrack = matchedIndex >= 0 ? activeTracks[matchedIndex] : null;
    if (matchedIndex >= 0) unmatchedTrackIndexes.delete(matchedIndex);
    const landmarks = smoothPose(pose, previousTrack?.landmarks);

    return {
      id: previousTrack?.id ?? nextPoseTrackId++,
      landmarks,
      center: getPoseCenter(landmarks) ?? center,
      lastSeenAt: now,
      sourceIndex,
    };
  });

  const retainedTracks = [...unmatchedTrackIndexes].map(
    index => activeTracks[index],
  );
  poseTracks = [...updatedTracks, ...retainedTracks];
  return updatedTracks.sort((a, b) => a.id - b.id);
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
    setCameraUiState(true);

    const modelReady = await initPoseLandmarker(qualitySelect.value);
    if (!modelReady) detectionStatus.textContent = '인식 모델을 불러오지 못했습니다.';
    scheduleNextFrame();
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
  cancelScheduledFrame();
  poseTracks = [];
  nextPoseTrackId = 1;
  latestPose = null;
  latestPoseSourceIndex = -1;
  latestHolisticResult = null;
  resetSkeletonState();
  webcamCanvas.getContext('2d').clearRect(0, 0, webcamCanvas.width, webcamCanvas.height);
  saveAvatarButton.disabled = true;
  setCameraUiState(false);
  detectionStatus.textContent = '카메라가 중지되었습니다.';
}

function scheduleNextFrame() {
  if (!isWebcamActive) return;
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    scheduledFrameType = 'video';
    scheduledFrameId = webcamVideo.requestVideoFrameCallback(processWebcamFrame);
  } else {
    scheduledFrameType = 'animation';
    scheduledFrameId = requestAnimationFrame(processWebcamFrame);
  }
}

function cancelScheduledFrame() {
  if (scheduledFrameId == null) return;
  if (scheduledFrameType === 'video') webcamVideo.cancelVideoFrameCallback(scheduledFrameId);
  else cancelAnimationFrame(scheduledFrameId);
  scheduledFrameId = null;
}

function processWebcamFrame(now) {
  scheduledFrameId = null;
  if (!isWebcamActive) return;
  try {
    const frameTimestamp = Number.isFinite(now) ? now : performance.now();
    const result = getPoseData(webcamVideo, frameTimestamp);
    if (result) {
      const measuredAt = performance.now();
      const trackedPoses = updatePoseTracks(getDetectedPoses(result), measuredAt);
      const settings = getSettings();
      const reliableTracks = trackedPoses.filter(track =>
        hasReliablePose(track.landmarks, settings.confidence)
      );
      const primaryTrack = reliableTracks[0] ?? null;

      latestPose = primaryTrack?.landmarks ?? null;
      latestPoseSourceIndex = primaryTrack?.sourceIndex ?? -1;
      latestHolisticResult = {
        ...result,
        poseLandmarks: trackedPoses.map(track => track.landmarks),
        poseTrackIds: trackedPoses.map(track => track.id),
      };
      drawSkeleton(webcamCanvas, latestHolisticResult, settings);

      frameCount += 1;
      const measuredFpsAt = performance.now();
      if (measuredFpsAt - lastFrameTime >= 1000) {
        displayedFps = frameCount;
        frameCount = 0;
        lastFrameTime = measuredFpsAt;
      }

      const personCount = reliableTracks.length;
      const statusLabel = personCount > 0
        ? `${personCount}\uBA85 \uC778\uC2DD\uB428`
        : '\uC0AC\uB78C\uC744 \uCC3E\uB294 \uC911...';
      detectionStatus.textContent = settings.debug
        ? `${statusLabel} · FPS ${displayedFps} · \uAE30\uC900 ${settings.confidence.toFixed(2)}`
        : statusLabel;
      saveAvatarButton.disabled = !primaryTrack;
    }
  } catch (error) {
    console.error('Pose detection error:', error);
  }
  scheduleNextFrame();
}
webcamVideo.addEventListener('loadedmetadata', syncCanvasSize);
qualitySelect.addEventListener('change', async () => {
  persistSettings();
  qualitySelect.disabled = true;
  try {
    const initialized = await initPoseLandmarker(qualitySelect.value);
    if (initialized) {
      poseTracks = [];
      nextPoseTrackId = 1;
      latestPoseSourceIndex = -1;
      resetSkeletonState();
    }
  } finally {
    qualitySelect.disabled = false;
  }
});
settingsButton.addEventListener('click', () => {
  const shouldOpen = settingsPanel.hasAttribute('hidden');
  settingsPanel.toggleAttribute('hidden', !shouldOpen);
  settingsButton.setAttribute('aria-expanded', String(shouldOpen));
});
closeSettingsButton.addEventListener('click', () => {
  settingsPanel.hidden = true;
  settingsButton.setAttribute('aria-expanded', 'false');
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
    poseWorldLandmarks: latestPoseSourceIndex >= 0
      ? latestHolisticResult.worldLandmarks?.[latestPoseSourceIndex] ?? []
      : [],
    faceLandmarks: latestHolisticResult.faceLandmarks?.[0] ?? [],
    leftHandLandmarks: getHandByLabel('Left'),
    rightHandLandmarks: getHandByLabel('Right'),
  }));
  window.location.href = 'avatar.html';
});

function getHandByLabel(label) {
  const index = latestHolisticResult?.handedness?.findIndex(categories =>
    categories?.some(category =>
      category.categoryName === label || category.displayName === label,
    ),
  );
  return index >= 0 ? latestHolisticResult.handLandmarks?.[index] ?? [] : [];
}

window.addEventListener('pagehide', () => {
  stopWebcam();
  closeLandmarkers();
}, { once: true });

persistSettings();
setCameraUiState(false);
