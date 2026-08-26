const STORAGE_KEY = 'poseVisionAvatarStyle';
const IMAGE_KEY = 'poseVisionGeminiImage';
const CAPTURED_AT_KEY = 'poseVisionGeminiCapturedAt';
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_IMAGE_AGE_MS = 2 * 60 * 60 * 1000;

const optionIds = [
  'skinColor', 'eyeColor', 'hairColor', 'topColor', 'bottomColor', 'accentColor', 'shoeColor',
  'bodyType', 'faceShape', 'hairStyle', 'outfitStyle', 'accessoryStyle',
  'heightScale', 'shoulderScale', 'headScale',
];
const numericOptionIds = new Set(['heightScale', 'shoulderScale', 'headScale']);

const analyzeButton = document.getElementById('geminiAnalyzeButton');
const learnButton = document.getElementById('geminiLearnButton');
const modelBadge = document.getElementById('geminiModelBadge');
let lastAnalysis = null;

function getCurrentOptions() {
  return Object.fromEntries(optionIds.flatMap(id => {
    const element = document.getElementById(id);
    if (!element) return [];
    return [[id, numericOptionIds.has(id) ? Number(element.value) : element.value]];
  }));
}

function applyOptions(options) {
  optionIds.forEach(id => {
    const element = document.getElementById(id);
    if (!element || options?.[id] == null) return;
    element.value = String(options[id]);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function readTemporaryValue(key) {
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getCapturedImage() {
  const imageDataUrl = readTemporaryValue(IMAGE_KEY);
  const capturedAt = Number(readTemporaryValue(CAPTURED_AT_KEY));
  if (!imageDataUrl) return null;
  if (Number.isFinite(capturedAt) && Date.now() - capturedAt > MAX_IMAGE_AGE_MS) return null;
  return imageDataUrl;
}

function clearLegacyImage() {
  try {
    localStorage.removeItem(IMAGE_KEY);
    localStorage.removeItem(CAPTURED_AT_KEY);
  } catch {}
}

function setStatus(message, state = '') {
  const status = document.getElementById('geminiStatus');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

async function requestJson(url, payload, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: payload == null ? 'GET' : 'POST',
      headers: payload == null ? undefined : { 'Content-Type': 'application/json' },
      body: payload == null ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function analyzeAvatar() {
  const imageDataUrl = getCapturedImage();
  if (!imageDataUrl) {
    setStatus('촬영 이미지가 없거나 만료되었습니다. 메인 화면에서 다시 촬영해주세요.', 'error');
    return;
  }

  setBusy(analyzeButton, true);
  learnButton.disabled = true;
  setStatus('Gemini가 사진과 포즈를 분석하고 있습니다.');

  try {
    let pose = null;
    try { pose = JSON.parse(localStorage.getItem('savedHolisticResult') || 'null'); } catch {}

    const result = await requestJson('/api/gemini/avatar-analyze', {
      imageDataUrl,
      pose,
      currentOptions: getCurrentOptions(),
    });

    lastAnalysis = result;
    applyOptions(result.avatarOptions);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(getCurrentOptions())); } catch {}
    clearLegacyImage();
    learnButton.disabled = false;

    const confidence = Number.isFinite(result.confidence)
      ? ` · 신뢰도 ${Math.round(result.confidence * 100)}%`
      : '';
    const uncertain = result.uncertainFields?.length
      ? ` · 확인 권장: ${result.uncertainFields.join(', ')}`
      : '';
    setStatus(`아바타 생성 완료${confidence}${uncertain}`, 'success');
  } catch (error) {
    console.error('Gemini avatar analysis failed.', error);
    setStatus(`Gemini 분석 실패: ${error.message}`, 'error');
  } finally {
    setBusy(analyzeButton, false);
  }
}

async function saveLearningExample() {
  if (!lastAnalysis) {
    setStatus('먼저 Gemini 분석을 실행해주세요.', 'error');
    return;
  }

  setBusy(learnButton, true);
  setStatus('수정한 결과를 보정 예시로 저장하고 있습니다.');

  try {
    const result = await requestJson('/api/gemini/learn', {
      analysisSummary: lastAnalysis.analysisSummary,
      uncertainFields: lastAnalysis.uncertainFields || [],
      acceptedOptions: getCurrentOptions(),
    });
    lastAnalysis = null;
    setStatus(`보정 예시 저장 완료 · 현재 ${result.exampleCount}개`, 'success');
  } catch (error) {
    console.error('Gemini correction save failed.', error);
    setStatus(`보정 예시 저장 실패: ${error.message}`, 'error');
  } finally {
    setBusy(learnButton, false);
    learnButton.disabled = !lastAnalysis;
  }
}

async function initializeGeminiPanel() {
  if (!analyzeButton || !learnButton || !modelBadge) return;

  try {
    const status = await requestJson('/api/gemini/status', null, 8_000);
    modelBadge.textContent = status.model;
    modelBadge.dataset.state = status.configured ? 'ready' : 'error';

    if (!status.configured) {
      setStatus('서버의 .env 파일에 GEMINI_API_KEY를 설정해주세요.', 'error');
      return;
    }

    const hasImage = Boolean(getCapturedImage());
    analyzeButton.disabled = !hasImage;
    setStatus(
      hasImage
        ? `Gemini 연결 완료 · 보정 예시 ${status.exampleCount}개`
        : '촬영 이미지가 없습니다. 메인 화면에서 사람을 촬영해주세요.',
      hasImage ? 'success' : 'error',
    );
  } catch (error) {
    modelBadge.textContent = '연결 오류';
    modelBadge.dataset.state = 'error';
    setStatus(`Gemini 서버에 연결하지 못했습니다: ${error.message}`, 'error');
  }
}

analyzeButton?.addEventListener('click', analyzeAvatar);
learnButton?.addEventListener('click', saveLearningExample);
initializeGeminiPanel();
