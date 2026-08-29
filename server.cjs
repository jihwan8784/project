const http = require('http');
const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    lines.forEach(line => {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match || process.env[match[1]]) return;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    });
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('환경 설정 파일을 읽지 못했습니다.', error.message);
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 8000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_ID_VALID = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID);
const GEMINI_TIMEOUT_MS = 40_000;
const ROOT = path.resolve(__dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.bvh': 'text/plain; charset=utf-8',
};

const COLOR_KEYS = [
  'skinColor', 'eyeColor', 'hairColor', 'topColor', 'bottomColor', 'accentColor', 'shoeColor',
];
const ENUM_OPTIONS = {
  bodyType: ['slim', 'balanced', 'athletic'],
  faceShape: ['oval', 'round', 'angular'],
  hairStyle: ['crop', 'wave', 'long', 'twinTail', 'bun', 'none'],
  outfitStyle: ['casual', 'sport', 'formal', 'idol'],
  accessoryStyle: ['none', 'glasses', 'headphones', 'earrings', 'ribbon'],
};
const NUMBER_OPTIONS = {
  heightScale: [0.92, 1.10],
  shoulderScale: [0.86, 1.18],
  headScale: [0.90, 1.20],
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 8 * 1024 * 1024) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return Promise.reject(new HttpError(415, 'Content-Type은 application/json이어야 합니다.'));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(new HttpError(413, '요청 데이터가 너무 큽니다.'));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new HttpError(400, 'JSON 형식이 올바르지 않습니다.'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeAvatarOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, '아바타 설정 형식이 올바르지 않습니다.');
  }

  const result = {};
  COLOR_KEYS.forEach(key => {
    const color = String(value[key] || '').toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(color)) throw new HttpError(400, `${key} 색상 형식이 올바르지 않습니다.`);
    result[key] = color;
  });

  Object.entries(ENUM_OPTIONS).forEach(([key, allowed]) => {
    if (!allowed.includes(value[key])) throw new HttpError(400, `${key} 옵션이 올바르지 않습니다.`);
    result[key] = value[key];
  });

  Object.entries(NUMBER_OPTIONS).forEach(([key, [minimum, maximum]]) => {
    const number = Number(value[key]);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      throw new HttpError(400, `${key} 값이 허용 범위를 벗어났습니다.`);
    }
    result[key] = Math.round(number * 100) / 100;
  });

  return result;
}

function parseImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl || '');
  if (!match) throw new HttpError(400, '지원되는 촬영 이미지가 없습니다.');
  return { mimeType: match[1].toLowerCase(), data: match[2].replace(/\s/g, '') };
}

function summarizePose(pose) {
  const landmarks = pose?.poseLandmarks || [];
  const world = pose?.poseWorldLandmarks || [];
  const valid = Array.isArray(landmarks)
    ? landmarks.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)).length
    : 0;
  return {
    detectedPosePoints: valid,
    hasWorldPose: Array.isArray(world) && world.length > 0,
    hasFace: Array.isArray(pose?.faceLandmarks) && pose.faceLandmarks.length > 0,
  };
}

function getSafeCurrentOptions(value) {
  try {
    return normalizeAvatarOptions(value);
  } catch {
    return {};
  }
}

function buildPrompt(body) {
  return `너는 Pose Vision 프로젝트의 2D 아바타 외형 분석기다.
촬영 이미지에서 화면에 실제로 보이는 외형만 분석하고, 아래 제한된 옵션으로 아바타 설정을 반환하라.
출력은 사진을 그대로 복제하는 모델이 아니라 2D VTuber 캐릭터에 적용할 디자인 설정이다.
나이, 성별, 인종, 민족, 건강 상태, 장애, 종교 등 민감하거나 보이지 않는 속성을 추측하지 마라.
사진에서 확실하지 않은 값은 중립적인 기본값을 선택하고 uncertainFields에 기록하라.
색상은 반드시 #RRGGBB 형식으로 반환한다.

허용 옵션:
bodyType: slim | balanced | athletic
faceShape: oval | round | angular
hairStyle: crop | wave | long | twinTail | bun | none
outfitStyle: casual | sport | formal | idol
accessoryStyle: none | glasses | headphones | earrings | ribbon
heightScale: 0.92~1.10
shoulderScale: 0.86~1.18
headScale: 0.90~1.20

twinTail, idol, ribbon은 사진에서 비슷한 특징이 보이거나 현재 아바타 설정의 스타일을 유지할 때만 선택하라.

현재 포즈 인식 요약: ${JSON.stringify(summarizePose(body.pose))}
현재 아바타 설정(참고만 할 것): ${JSON.stringify(getSafeCurrentOptions(body.currentOptions))}

analysisSummary에는 민감정보를 제외하고 머리 길이/색, 눈에 보이는 피부색 톤, 얼굴 윤곽, 옷 색·스타일, 체형 실루엣처럼 아바타 생성에 필요한 시각 특징만 짧게 기록하라.`;
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    avatarOptions: {
      type: 'object',
      additionalProperties: false,
      properties: {
        skinColor: { type: 'string' },
        eyeColor: { type: 'string' },
        hairColor: { type: 'string' },
        topColor: { type: 'string' },
        bottomColor: { type: 'string' },
        accentColor: { type: 'string' },
        shoeColor: { type: 'string' },
        bodyType: { type: 'string', enum: ENUM_OPTIONS.bodyType },
        faceShape: { type: 'string', enum: ENUM_OPTIONS.faceShape },
        hairStyle: { type: 'string', enum: ENUM_OPTIONS.hairStyle },
        outfitStyle: { type: 'string', enum: ENUM_OPTIONS.outfitStyle },
        accessoryStyle: { type: 'string', enum: ENUM_OPTIONS.accessoryStyle },
        heightScale: { type: 'number', minimum: NUMBER_OPTIONS.heightScale[0], maximum: NUMBER_OPTIONS.heightScale[1] },
        shoulderScale: { type: 'number', minimum: NUMBER_OPTIONS.shoulderScale[0], maximum: NUMBER_OPTIONS.shoulderScale[1] },
        headScale: { type: 'number', minimum: NUMBER_OPTIONS.headScale[0], maximum: NUMBER_OPTIONS.headScale[1] },
      },
      required: [
        ...COLOR_KEYS,
        ...Object.keys(ENUM_OPTIONS),
        ...Object.keys(NUMBER_OPTIONS),
      ],
    },
    analysisSummary: { type: 'string' },
    uncertainFields: { type: 'array', items: { type: 'string' }, maxItems: 30 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['avatarOptions', 'analysisSummary', 'uncertainFields', 'confidence'],
};

function normalizeAnalysisResult(value) {
  if (!value || typeof value !== 'object') throw new Error('Gemini 응답 형식이 올바르지 않습니다.');
  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('Gemini 신뢰도 값이 올바르지 않습니다.');
  }
  return {
    avatarOptions: normalizeAvatarOptions(value.avatarOptions),
    analysisSummary: String(value.analysisSummary || '').slice(0, 1200),
    uncertainFields: Array.isArray(value.uncertainFields)
      ? value.uncertainFields.map(item => String(item).slice(0, 80)).slice(0, 30)
      : [],
    confidence,
  };
}

async function analyzeWithGemini(body) {
  if (!GEMINI_API_KEY) throw new HttpError(503, 'GEMINI_API_KEY가 설정되지 않았습니다.');
  const image = parseImageDataUrl(body.imageDataUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: image.mimeType, data: image.data } },
          { text: buildPrompt(body) },
        ] }],
        generationConfig: {
          thinkingConfig: { thinkingLevel: 'low' },
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
    });

    const raw = await response.text();
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) {
      console.error(`Gemini API ${response.status}:`, payload?.error?.message || raw.slice(0, 300));
      throw new HttpError(502, `Gemini API 요청에 실패했습니다. (${response.status})`);
    }

    const text = payload?.candidates?.[0]?.content?.parts
      ?.filter(part => !part.thought)
      .map(part => part.text || '')
      .join('') || '';
    if (!text) throw new HttpError(502, 'Gemini가 분석 결과를 반환하지 않았습니다.');

    try {
      return normalizeAnalysisResult(JSON.parse(text));
    } catch (error) {
      console.error('Invalid Gemini response:', error.message);
      throw new HttpError(502, 'Gemini 분석 결과의 형식이 올바르지 않습니다.');
    }
  } catch (error) {
    if (error.name === 'AbortError') throw new HttpError(504, 'Gemini API 응답 시간이 초과되었습니다.');
    if (error instanceof HttpError) throw error;
    console.error('Gemini request failed:', error);
    throw new HttpError(502, 'Gemini API에 연결하지 못했습니다.');
  } finally {
    clearTimeout(timeoutId);
  }
}

function apiPath(req) {
  try {
    return new URL(req.url || '/', 'http://localhost').pathname;
  } catch {
    return '';
  }
}

async function handleApi(req, res) {
  const pathname = apiPath(req);

  if (pathname === '/api/gemini/status') {
    if (req.method !== 'GET') throw new HttpError(405, '허용되지 않은 요청 방식입니다.');
    sendJson(res, 200, {
      configured: Boolean(GEMINI_API_KEY),
      model: GEMINI_MODEL,
    });
    return;
  }

  if (pathname === '/api/google/status') {
    if (req.method !== 'GET') throw new HttpError(405, '허용되지 않은 요청 방식입니다.');
    sendJson(res, 200, {
      configured: GOOGLE_CLIENT_ID_VALID,
      clientId: GOOGLE_CLIENT_ID_VALID ? GOOGLE_CLIENT_ID : '',
      reason: !GOOGLE_CLIENT_ID
        ? 'GOOGLE_CLIENT_ID가 설정되지 않았습니다.'
        : GOOGLE_CLIENT_ID_VALID ? '' : 'GOOGLE_CLIENT_ID 형식이 올바르지 않습니다.',
    });
    return;
  }

  if (pathname === '/api/gemini/avatar-analyze') {
    if (req.method !== 'POST') throw new HttpError(405, '허용되지 않은 요청 방식입니다.');
    const body = await readBody(req);
    sendJson(res, 200, await analyzeWithGemini(body));
    return;
  }

  throw new HttpError(404, 'API 경로를 찾을 수 없습니다.');
}

function serveStatic(req, res) {
  let rawPath;
  try {
    rawPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400); res.end('Bad request'); return;
  }

  const requested = rawPath === '/' ? '/main.html' : rawPath;
  const filePath = path.resolve(ROOT, `.${requested}`);
  const relativePath = path.relative(ROOT, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (apiPath(req).startsWith('/api/')) await handleApi(req, res);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res);
    else throw new HttpError(405, '허용되지 않은 요청 방식입니다.');
  } catch (error) {
    if (res.headersSent) return;
    const status = error instanceof HttpError ? error.status : 500;
    if ([500, 502, 504].includes(status)) console.error(error);
    sendJson(res, status, { error: status === 500 ? '서버 오류가 발생했습니다.' : error.message });
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`포트 ${PORT}는 이미 사용 중입니다. 기존 Pose Vision 서버가 실행 중이면 http://127.0.0.1:${PORT}/main.html 을 열어주세요.`);
    console.error(`다른 포트를 사용하려면 PowerShell에서 $env:PORT=8001; node server.cjs 를 실행하세요.`);
    process.exitCode = 1;
    return;
  }
  console.error('서버를 시작하지 못했습니다.', error);
  process.exitCode = 1;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Pose Vision: http://127.0.0.1:${PORT}`);
  console.log(`Gemini model: ${GEMINI_MODEL}`);
  console.log(GEMINI_API_KEY ? 'Gemini API key configured.' : 'GEMINI_API_KEY is not configured.');
  console.log(GOOGLE_CLIENT_ID_VALID ? 'Google Drive OAuth configured.' : 'GOOGLE_CLIENT_ID is not configured or invalid.');
});
