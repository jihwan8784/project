const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const LEARNING_FILE = path.join(DATA_DIR, 'avatar-learning.json');
const MAX_EXAMPLES = 24;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('요청 데이터가 너무 큽니다.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('JSON 형식이 올바르지 않습니다.')); }
    });
    req.on('error', reject);
  });
}

function loadExamples() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LEARNING_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed.slice(-MAX_EXAMPLES) : [];
  } catch {
    return [];
  }
}

function saveExamples(examples) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LEARNING_FILE, JSON.stringify(examples.slice(-MAX_EXAMPLES), null, 2));
}

function parseImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(dataUrl || '');
  if (!match) throw new Error('지원되는 촬영 이미지가 없습니다.');
  return { mimeType: match[1], data: match[2] };
}

function summarizePose(pose) {
  const landmarks = pose?.poseLandmarks || [];
  const world = pose?.poseWorldLandmarks || [];
  const valid = Array.isArray(landmarks) ? landmarks.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)).length : 0;
  return {
    detectedPosePoints: valid,
    hasWorldPose: Array.isArray(world) && world.length > 0,
    hasFace: Array.isArray(pose?.faceLandmarks) && pose.faceLandmarks.length > 0,
    hasLeftHand: Array.isArray(pose?.leftHandLandmarks) && pose.leftHandLandmarks.length > 0,
    hasRightHand: Array.isArray(pose?.rightHandLandmarks) && pose.rightHandLandmarks.length > 0,
  };
}

function buildPrompt(body, examples) {
  const exampleText = examples.length
    ? examples.map((item, index) => `예시 ${index + 1}: 관찰 요약=${item.analysisSummary}\n사용자가 최종 확정한 설정=${JSON.stringify(item.acceptedOptions)}`).join('\n\n')
    : '아직 사용자 피드백 예시가 없습니다.';

  return `너는 Pose Vision 프로젝트의 3D 아바타 외형 분석기다.
촬영 이미지에서 화면에 실제로 보이는 외형만 분석하고, 아래 제한된 옵션으로 아바타 설정을 반환하라.
나이, 성별, 인종, 민족, 건강 상태, 장애, 종교 등 민감하거나 보이지 않는 속성을 추측하지 마라.
사진에서 확실하지 않은 값은 중립적인 기본값을 선택하고 uncertainFields에 기록하라.
색상은 반드시 #RRGGBB 형식으로 반환한다.

허용 옵션:
bodyType: slim | balanced | athletic
faceShape: oval | round | angular
hairStyle: crop | wave | long | bun | none
outfitStyle: casual | sport | formal
accessoryStyle: none | glasses | headphones | earrings
heightScale: 0.92~1.10
shoulderScale: 0.86~1.18
headScale: 0.90~1.12

현재 포즈 인식 요약: ${JSON.stringify(summarizePose(body.pose))}
현재 아바타 설정(참고만 할 것): ${JSON.stringify(body.currentOptions || {})}

이 프로젝트에서 사용자가 이전에 수정·확정한 예시:
${exampleText}

중요: 과거 예시는 동일 사용자의 선호 보정에만 참고하고, 현재 사진의 명백한 특징보다 우선하지 마라.
analysisSummary에는 민감정보를 제외하고 머리 길이/색, 눈에 보이는 피부색 톤, 얼굴 윤곽, 옷 색·스타일, 체형 실루엣처럼 아바타 생성에 필요한 시각 특징만 짧게 기록하라.`;
}

const schema = {
  type: 'object',
  properties: {
    avatarOptions: {
      type: 'object',
      properties: {
        skinColor: { type: 'string' }, eyeColor: { type: 'string' }, hairColor: { type: 'string' },
        topColor: { type: 'string' }, bottomColor: { type: 'string' }, accentColor: { type: 'string' }, shoeColor: { type: 'string' },
        bodyType: { type: 'string', enum: ['slim', 'balanced', 'athletic'] },
        faceShape: { type: 'string', enum: ['oval', 'round', 'angular'] },
        hairStyle: { type: 'string', enum: ['crop', 'wave', 'long', 'bun', 'none'] },
        outfitStyle: { type: 'string', enum: ['casual', 'sport', 'formal'] },
        accessoryStyle: { type: 'string', enum: ['none', 'glasses', 'headphones', 'earrings'] },
        heightScale: { type: 'number', minimum: 0.92, maximum: 1.10 },
        shoulderScale: { type: 'number', minimum: 0.86, maximum: 1.18 },
        headScale: { type: 'number', minimum: 0.90, maximum: 1.12 },
      },
      required: ['skinColor','eyeColor','hairColor','topColor','bottomColor','accentColor','shoeColor','bodyType','faceShape','hairStyle','outfitStyle','accessoryStyle','heightScale','shoulderScale','headScale'],
    },
    analysisSummary: { type: 'string' },
    uncertainFields: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['avatarOptions', 'analysisSummary', 'uncertainFields', 'confidence'],
};

async function analyzeWithGemini(body) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  const image = parseImageDataUrl(body.imageDataUrl);
  const examples = loadExamples();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [
        { inlineData: { mimeType: image.mimeType, data: image.data } },
        { text: buildPrompt(body, examples) },
      ] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini API 오류 ${response.status}`);
  const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  if (!text) throw new Error('Gemini가 분석 결과를 반환하지 않았습니다.');
  return JSON.parse(text);
}

async function handleApi(req, res) {
  if (req.method === 'GET' && req.url === '/api/gemini/status') {
    return sendJson(res, 200, { configured: Boolean(GEMINI_API_KEY), model: GEMINI_MODEL, exampleCount: loadExamples().length });
  }

  if (req.method === 'POST' && req.url === '/api/gemini/avatar-analyze') {
    try {
      const body = await readBody(req);
      const result = await analyzeWithGemini(body);
      return sendJson(res, 200, result);
    } catch (error) {
      console.error(error);
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === 'POST' && req.url === '/api/gemini/learn') {
    try {
      const body = await readBody(req, 512 * 1024);
      if (!body.analysisSummary || !body.acceptedOptions) throw new Error('학습 예시 데이터가 부족합니다.');
      const examples = loadExamples();
      examples.push({
        createdAt: new Date().toISOString(),
        analysisSummary: String(body.analysisSummary).slice(0, 1200),
        uncertainFields: Array.isArray(body.uncertainFields) ? body.uncertainFields.slice(0, 30) : [],
        acceptedOptions: body.acceptedOptions,
      });
      saveExamples(examples);
      return sendJson(res, 200, { ok: true, exampleCount: loadExamples().length });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  return false;
}

function serveStatic(req, res) {
  const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const requested = rawPath === '/' ? '/main.html' : rawPath;
  const filePath = path.resolve(ROOT, '.' + requested);
  if (!filePath.startsWith(path.resolve(ROOT))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  if ((req.url || '').startsWith('/api/')) {
    const handled = await handleApi(req, res);
    if (handled !== false) return;
  }
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`Pose Vision: http://127.0.0.1:${PORT}/main.html`);
  console.log(`Gemini model: ${GEMINI_MODEL}`);
  console.log(GEMINI_API_KEY ? 'Gemini API key configured.' : 'GEMINI_API_KEY is not configured.');
});
