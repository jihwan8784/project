import {
  createVirtualAvatar,
  DEFAULT_AVATAR_OPTIONS,
} from './avatar3d.js';

const viewport = document.getElementById('avatarViewport');
const poseState = document.getElementById('poseState');
const poseStateText = document.getElementById('poseStateText');
const rotateButton = document.getElementById('rotateButton');
const cameraButton = document.getElementById('cameraButton');
const captureButton = document.getElementById('captureButton');
const randomizeButton = document.getElementById('randomizeButton');
const resetButton = document.getElementById('resetButton');
const savePresetButton = document.getElementById('savePresetButton');
const saveMessage = document.getElementById('saveMessage');

const controls = {
  skinColor: document.getElementById('skinColor'),
  eyeColor: document.getElementById('eyeColor'),
  hairColor: document.getElementById('hairColor'),
  topColor: document.getElementById('topColor'),
  bottomColor: document.getElementById('bottomColor'),
  accentColor: document.getElementById('accentColor'),
  shoeColor: document.getElementById('shoeColor'),
  bodyType: document.getElementById('bodyType'),
  faceShape: document.getElementById('faceShape'),
  hairStyle: document.getElementById('hairStyle'),
  outfitStyle: document.getElementById('outfitStyle'),
  accessoryStyle: document.getElementById('accessoryStyle'),
  heightScale: document.getElementById('heightScale'),
  shoulderScale: document.getElementById('shoulderScale'),
  headScale: document.getElementById('headScale'),
};

const outputs = {
  heightScale: document.getElementById('heightValue'),
  shoulderScale: document.getElementById('shoulderValue'),
  headScale: document.getElementById('headValue'),
};

const STORAGE_KEY = 'poseVisionAvatarStyle';
let updateFrameId = 0;
let autoRotate = true;
let messageTimer = 0;

function readJsonStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Stored avatar data could not be read.', error);
    return null;
  }
}

function hasPoseData(result) {
  const world = Array.isArray(result?.poseWorldLandmarks?.[0])
    ? result.poseWorldLandmarks[0]
    : result?.poseWorldLandmarks;
  const normalized = Array.isArray(result?.poseLandmarks?.[0])
    ? result.poseLandmarks[0]
    : result?.poseLandmarks;
  return (Array.isArray(world) && world.length >= 29) ||
    (Array.isArray(normalized) && normalized.length >= 29);
}

function readOptions() {
  return {
    skinColor: controls.skinColor.value,
    eyeColor: controls.eyeColor.value,
    hairColor: controls.hairColor.value,
    topColor: controls.topColor.value,
    bottomColor: controls.bottomColor.value,
    accentColor: controls.accentColor.value,
    shoeColor: controls.shoeColor.value,
    bodyType: controls.bodyType.value,
    faceShape: controls.faceShape.value,
    hairStyle: controls.hairStyle.value,
    outfitStyle: controls.outfitStyle.value,
    accessoryStyle: controls.accessoryStyle.value,
    heightScale: Number(controls.heightScale.value),
    shoulderScale: Number(controls.shoulderScale.value),
    headScale: Number(controls.headScale.value),
  };
}

function applyOptionsToControls(options) {
  Object.entries(controls).forEach(([key, control]) => {
    if (options[key] == null) return;
    control.value = String(options[key]);
  });
  updateOutputs();
}

function updateOutputs() {
  Object.entries(outputs).forEach(([key, output]) => {
    output.value = Math.round(Number(controls[key].value) * 100) + '%';
  });
}

function showMessage(message) {
  window.clearTimeout(messageTimer);
  saveMessage.textContent = message;
  messageTimer = window.setTimeout(() => {
    saveMessage.textContent = '';
  }, 2600);
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomColor(palette) {
  return randomChoice(palette);
}

const storedPose = readJsonStorage('savedHolisticResult') ?? (
  readJsonStorage('savedPoseLandmarks')
    ? { poseLandmarks: readJsonStorage('savedPoseLandmarks') }
    : null
);
const storedStyle = readJsonStorage(STORAGE_KEY);
const initialOptions = {
  ...DEFAULT_AVATAR_OPTIONS,
  ...(storedStyle ?? {}),
};

applyOptionsToControls(initialOptions);
const avatar = createVirtualAvatar(viewport, readOptions());
avatar.applyPose(storedPose);

if (hasPoseData(storedPose)) {
  poseStateText.textContent = '촬영 포즈 적용됨';
} else {
  poseState.classList.add('is-neutral');
  poseStateText.textContent = '기본 포즈로 생성됨';
}

function scheduleAppearanceUpdate() {
  updateOutputs();
  cancelAnimationFrame(updateFrameId);
  updateFrameId = requestAnimationFrame(() => {
    avatar.updateAppearance(readOptions());
  });
}

Object.values(controls).forEach(control => {
  control.addEventListener('input', scheduleAppearanceUpdate);
  control.addEventListener('change', scheduleAppearanceUpdate);
});

rotateButton.addEventListener('click', () => {
  autoRotate = !autoRotate;
  avatar.setAutoRotate(autoRotate);
  rotateButton.classList.toggle('is-active', autoRotate);
  rotateButton.setAttribute('aria-pressed', String(autoRotate));
});

cameraButton.addEventListener('click', () => {
  avatar.resetCamera();
  showMessage('카메라 위치를 초기화했습니다.');
});

captureButton.addEventListener('click', () => {
  avatar.capture();
  showMessage('아바타 이미지를 저장했습니다.');
});

randomizeButton.addEventListener('click', () => {
  const randomized = {
    bodyType: randomChoice(['slim', 'balanced', 'athletic']),
    faceShape: randomChoice(['oval', 'round', 'angular']),
    hairStyle: randomChoice(['crop', 'wave', 'long', 'bun', 'none']),
    outfitStyle: randomChoice(['casual', 'sport', 'formal']),
    accessoryStyle: randomChoice(['none', 'glasses', 'headphones', 'earrings']),
    skinColor: randomColor(['#f3c6a8', '#dfa27d', '#c98462', '#9a5f43', '#70452f']),
    eyeColor: randomColor(['#3d3029', '#58634c', '#31516c', '#6b4c36']),
    hairColor: randomColor(['#181313', '#302019', '#4b3428', '#7a543d', '#aa8b6d']),
    topColor: randomColor(['#354f77', '#4f3b78', '#3b6d5a', '#873f4f', '#d2d8e0']),
    bottomColor: randomColor(['#202733', '#2f3542', '#3a3348', '#1f3940']),
    accentColor: randomColor(['#69e6d5', '#ffb45e', '#9e8cff', '#ff7f9c']),
    shoeColor: randomColor(['#e9edf2', '#22252c', '#b9a58d', '#5f6570']),
    heightScale: (0.94 + Math.random() * 0.14).toFixed(2),
    shoulderScale: (0.88 + Math.random() * 0.27).toFixed(2),
    headScale: (0.92 + Math.random() * 0.17).toFixed(2),
  };
  applyOptionsToControls(randomized);
  scheduleAppearanceUpdate();
  showMessage('새로운 조합을 생성했습니다.');
});

resetButton.addEventListener('click', () => {
  applyOptionsToControls(DEFAULT_AVATAR_OPTIONS);
  scheduleAppearanceUpdate();
  showMessage('기본 스타일로 돌아왔습니다.');
});

savePresetButton.addEventListener('click', () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readOptions()));
    showMessage('이 스타일을 브라우저에 저장했습니다.');
  } catch (error) {
    console.error('Avatar preset save failed.', error);
    showMessage('스타일을 저장하지 못했습니다.');
  }
});

window.addEventListener('pagehide', () => {
  cancelAnimationFrame(updateFrameId);
  avatar.dispose();
}, { once: true });