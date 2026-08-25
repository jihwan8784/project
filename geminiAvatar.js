const STORAGE_KEY = 'poseVisionAvatarStyle';
const IMAGE_KEY = 'poseVisionGeminiImage';

const optionIds = [
  'skinColor', 'eyeColor', 'hairColor', 'topColor', 'bottomColor', 'accentColor', 'shoeColor',
  'bodyType', 'faceShape', 'hairStyle', 'outfitStyle', 'accessoryStyle',
  'heightScale', 'shoulderScale', 'headScale',
];

let lastAnalysis = null;

function getCurrentOptions() {
  return Object.fromEntries(optionIds.map(id => {
    const element = document.getElementById(id);
    const numeric = ['heightScale', 'shoulderScale', 'headScale'].includes(id);
    return [id, numeric ? Number(element?.value ?? 1) : element?.value];
  }));
}

function applyOptions(options) {
  optionIds.forEach(id => {
    const element = document.getElementById(id);
    if (!element || options?.[id] == null) return;
    element.value = String(options[id]);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function makePanel() {
  const aside = document.querySelector('.control-panel');
  if (!aside || document.getElementById('geminiAvatarPanel')) return;

  const panel = document.createElement('section');
  panel.id = 'geminiAvatarPanel';
  panel.className = 'control-section';
  panel.innerHTML = `
    <h3>Gemini AI 외형 분석</h3>
    <p style="margin:.35rem 0 .75rem;color:#aeb6c5;font-size:.9rem;line-height:1.5">
      촬영한 사진을 Gemini가 분석해 현재 3D 아바타 설정을 자동으로 맞춥니다.
      결과를 직접 수정한 뒤 학습시키면 다음 분석의 참고 예시로 사용합니다.
    </p>
    <div style="display:grid;gap:.55rem">
      <button id="geminiAnalyzeButton" class="primary-button" type="button">Gemini로 외형 분석</button>
      <button id="geminiLearnButton" class="secondary-button" type="button" disabled>수정 결과 학습시키기</button>
    </div>
    <p id="geminiStatus" class="save-message" aria-live="polite" style="min-height:1.4em;margin-top:.7rem"></p>
  `;

  const heading = aside.querySelector('.panel-heading');
  if (heading?.nextSibling) aside.insertBefore(panel, heading.nextSibling);
  else aside.prepend(panel);

  panel.querySelector('#geminiAnalyzeButton')?.addEventListener('click', analyzeAvatar);
  panel.querySelector('#geminiLearnButton')?.addEventListener('click', saveLearningExample);
}

function setStatus(message, isError = false) {
  const status = document.getElementById('geminiStatus');
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? '#ff9b9b' : '';
}

async function requestJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function analyzeAvatar() {
  const button = document.getElementById('geminiAnalyzeButton');
  const learnButton = document.getElementById('geminiLearnButton');
  const imageDataUrl = localStorage.getItem(IMAGE_KEY);
  if (!imageDataUrl) {
    setStatus('촬영 이미지가 없습니다. 메인 화면에서 다시 촬영해주세요.', true);
    return;
  }

  button.disabled = true;
  learnButton.disabled = true;
  setStatus('Gemini가 사진과 포즈를 분석하는 중...');

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getCurrentOptions()));
    learnButton.disabled = false;

    const confidence = Number.isFinite(result.confidence)
      ? ` · 신뢰도 ${Math.round(result.confidence * 100)}%`
      : '';
    setStatus(`분석 완료${confidence}. 마음에 안 드는 부분은 직접 수정해도 됩니다.`);
  } catch (error) {
    console.error(error);
    setStatus(`Gemini 분석 실패: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function saveLearningExample() {
  if (!lastAnalysis) {
    setStatus('먼저 Gemini 분석을 실행해주세요.', true);
    return;
  }

  const button = document.getElementById('geminiLearnButton');
  button.disabled = true;
  setStatus('수정한 결과를 학습 예시로 저장하는 중...');

  try {
    const result = await requestJson('/api/gemini/learn', {
      analysisSummary: lastAnalysis.analysisSummary,
      uncertainFields: lastAnalysis.uncertainFields || [],
      acceptedOptions: getCurrentOptions(),
    });
    setStatus(`학습 예시 저장 완료 · 현재 ${result.exampleCount}개`);
  } catch (error) {
    console.error(error);
    setStatus(`학습 저장 실패: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

makePanel();
