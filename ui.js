const POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [27, 31],
  [24, 26], [26, 28], [28, 30], [28, 32], [29, 31], [30, 32],
];

const LEFT_POSE_LANDMARKS = new Set([
  1, 2, 3, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31,
]);
const RIGHT_POSE_LANDMARKS = new Set([
  4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32,
]);
const POSE_VISIBILITY_THRESHOLD = 0.18;
const POSE_PRESENCE_THRESHOLD = 0.15;
const POSE_POINT_TTL_MS = 650;
const posePointCache = new Map();

function getPoseCache(trackId) {
  if (!posePointCache.has(trackId)) {
    posePointCache.set(trackId, Array.from({ length: 33 }, () => null));
  }
  return posePointCache.get(trackId);
}

function isFiniteLandmark(point) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function isUsablePosePoint(point, confidence) {
  if (!isFiniteLandmark(point)) return false;
  const threshold = Math.max(
    POSE_VISIBILITY_THRESHOLD,
    POSE_PRESENCE_THRESHOLD,
    confidence,
  );
  return Math.min(point.visibility ?? 1, point.presence ?? 1) >= threshold;
}

function getRenderablePose(landmarks, trackId, now, confidence) {
  const cache = getPoseCache(trackId);
  const renderable = new Array(33).fill(null);
  for (let index = 0; index < 33; index += 1) {
    const point = landmarks?.[index];
    if (isUsablePosePoint(point, confidence)) {
      cache[index] = { point: { ...point }, seenAt: now };
      renderable[index] = { point, stale: false };
      continue;
    }
    const cached = cache[index];
    if (cached && now - cached.seenAt <= POSE_POINT_TTL_MS) {
      renderable[index] = { point: cached.point, stale: true };
    } else {
      cache[index] = null;
    }
  }
  return renderable;
}

function drawLine(ctx, canvas, start, end, alpha, mirror) {
  if (!start || !end) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo((mirror ? 1 - start.x : start.x) * canvas.width, start.y * canvas.height);
  ctx.lineTo((mirror ? 1 - end.x : end.x) * canvas.width, end.y * canvas.height);
  ctx.stroke();
  ctx.restore();
}

function drawPoint(ctx, canvas, point, radius, alpha, mirror) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc((mirror ? 1 - point.x : point.x) * canvas.width, point.y * canvas.height, radius, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

function drawPose(ctx, canvas, landmarks, trackId, now, options) {
  const points = getRenderablePose(landmarks, trackId, now, options.confidence ?? 0.35);
  ctx.strokeStyle = '#eef3f8';
  ctx.lineWidth = Math.max(3, canvas.width / 240);
  ctx.lineCap = 'round';
  POSE_CONNECTIONS.forEach(([startIndex, endIndex]) => {
    const start = points[startIndex];
    const end = points[endIndex];
    if (!start || !end) return;
    drawLine(ctx, canvas, start.point, end.point, start.stale || end.stale ? 0.35 : 1, options.mirror);
  });
  points.forEach((entry, index) => {
    if (!entry) return;
    ctx.fillStyle = LEFT_POSE_LANDMARKS.has(index)
      ? '#ff8a00'
      : RIGHT_POSE_LANDMARKS.has(index) ? '#00d9e7' : '#ffffff';
    drawPoint(ctx, canvas, entry.point, Math.max(4, canvas.width / 320), entry.stale ? 0.35 : 1, options.mirror);
  });
}

export function resetSkeletonState() {
  posePointCache.clear();
}

export function drawSkeleton(canvas, result, options = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (options.showSkeleton === false) return;
  const poses = result?.poseLandmarks ?? result?.landmarks ?? [];
  const trackIds = result?.poseTrackIds ?? poses.map((_, index) => index);
  poses.slice(0, 1).forEach((pose, poseIndex) => {
    drawPose(ctx, canvas, pose, trackIds[poseIndex] ?? poseIndex, performance.now(), options);
  });
}
