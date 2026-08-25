const POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [11, 23], [12, 24],
  [23, 24], [23, 25], [25, 27], [27, 29], [27, 31], [24, 26], [26, 28],
  [28, 30], [28, 32], [5, 11], [6, 12], [5, 6], [5, 7], [6, 8], [7, 9], [8, 10],
];

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

// 얼굴은 478개 점을 모두 인식하되 화면이 지나치게 복잡해지지 않도록
// 외곽선은 연결하고, 내부 랜드마크는 작은 점으로 표시한다.
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
  379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
  234, 127, 162, 21, 54, 103, 67, 109, 10,
];

const POSE_VISIBILITY_THRESHOLD = 0.18;
const POSE_PRESENCE_THRESHOLD = 0.15;
const POSE_POINT_TTL_MS = 350;
const MAX_POSES = 4;

// 각 포즈/관절별 마지막 정상 위치를 잠깐 보존한다.
// 한쪽 팔·다리 등이 한두 프레임 가려져도 전체 스켈레톤이 한꺼번에 사라지지 않는다.
const posePointCache = new Map();

function getPoseCache(trackId) {
  if (!posePointCache.has(trackId)) {
    posePointCache.set(
      trackId,
      Array.from({ length: 33 }, () => null),
    );
  }
  return posePointCache.get(trackId);
}

function isFiniteLandmark(point) {
  return Boolean(
    point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y),
  );
}

function isUsablePosePoint(point, confidence) {
  if (!isFiniteLandmark(point)) return false;
  const visibility = point.visibility ?? 1;
  const presence = point.presence ?? 1;
  const threshold = Math.max(
    POSE_VISIBILITY_THRESHOLD,
    POSE_PRESENCE_THRESHOLD,
    confidence,
  );
  return Math.min(visibility, presence) >= threshold;
}

function getRenderablePose(landmarks, trackId, now, confidence) {
  const cache = getPoseCache(trackId);
  const renderable = new Array(33).fill(null);

  for (let index = 0; index < 33; index += 1) {
    const point = landmarks?.[index];

    if (isUsablePosePoint(point, confidence)) {
      cache[index] = {
        point: { ...point },
        seenAt: now,
      };
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

function drawLine(ctx, canvas, start, end, alpha = 1, mirror = false) {
  if (!start || !end) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo((mirror ? 1 - start.x : start.x) * canvas.width, start.y * canvas.height);
  ctx.lineTo((mirror ? 1 - end.x : end.x) * canvas.width, end.y * canvas.height);
  ctx.stroke();
  ctx.restore();
}

function drawPoint(ctx, canvas, point, radius, alpha = 1, mirror = false) {
  if (!isFiniteLandmark(point)) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc((mirror ? 1 - point.x : point.x) * canvas.width, point.y * canvas.height, radius, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

function drawPose(ctx, canvas, landmarks, trackId, now, options) {
  const points = getRenderablePose(landmarks, trackId, now, options.confidence ?? 0.35);

  ctx.strokeStyle = '#5fe0d0';
  ctx.lineWidth = Math.max(3, canvas.width / 240);
  ctx.lineCap = 'round';

  POSE_CONNECTIONS.forEach(([startIndex, endIndex]) => {
    const start = points[startIndex];
    const end = points[endIndex];
    if (!start || !end) return;
    const alpha = start.stale || end.stale ? 0.35 : 1;
    drawLine(ctx, canvas, start.point, end.point, alpha, options.mirror);
  });

  ctx.fillStyle = '#ffffff';
  points.forEach(entry => {
    if (!entry) return;
    drawPoint(
      ctx,
      canvas,
      entry.point,
      Math.max(4, canvas.width / 320),
      entry.stale ? 0.35 : 1,
      options.mirror,
    );
  });
}

function drawHands(ctx, canvas, hands, options) {
  if (!hands?.length) return;

  ctx.strokeStyle = '#ffd166';
  ctx.fillStyle = '#fff4c2';
  ctx.lineWidth = Math.max(2, canvas.width / 360);
  ctx.lineCap = 'round';

  hands.forEach(hand => {
    HAND_CONNECTIONS.forEach(([startIndex, endIndex]) => {
      const start = hand?.[startIndex];
      const end = hand?.[endIndex];
      if (!isFiniteLandmark(start) || !isFiniteLandmark(end)) return;
      drawLine(ctx, canvas, start, end, 1, options.mirror);
    });

    hand.forEach(point => {
      drawPoint(ctx, canvas, point, Math.max(2.5, canvas.width / 520), 1, options.mirror);
    });
  });
}

function drawFace(ctx, canvas, faces, options) {
  if (!faces?.length) return;

  ctx.strokeStyle = '#ff9eb5';
  ctx.fillStyle = '#ffd7e1';
  ctx.lineWidth = Math.max(1.5, canvas.width / 640);
  ctx.lineCap = 'round';

  faces.forEach(face => {
    for (let index = 0; index < FACE_OVAL.length - 1; index += 1) {
      const start = face?.[FACE_OVAL[index]];
      const end = face?.[FACE_OVAL[index + 1]];
      if (!isFiniteLandmark(start) || !isFiniteLandmark(end)) continue;
      drawLine(ctx, canvas, start, end, 0.85, options.mirror);
    }

    // 478개 전부를 인식한다. 표시할 때는 작은 점으로 그려 얼굴 디테일을 살린다.
    face.forEach(point => {
      drawPoint(ctx, canvas, point, Math.max(0.8, canvas.width / 1400), 0.62, options.mirror);
    });
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

  const now = performance.now();
  // main.js가 만든 보정 결과를 우선 사용해야 흔들림 보정 설정이 실제 화면에 반영된다.
  const detectedPoses = result?.poseLandmarks ?? result?.landmarks ?? [];

  // 현재 포즈가 없어도 TTL 동안 이전에 살아 있던 관절만 부분 표시한다.
  const trackIds = result?.poseTrackIds ?? detectedPoses.map((_, index) => index);
  detectedPoses.slice(0, MAX_POSES).forEach((pose, poseIndex) => {
    drawPose(ctx, canvas, pose, trackIds[poseIndex] ?? poseIndex, now, options);
  });

  const activeTrackIds = new Set(trackIds);
  posePointCache.forEach((cache, trackId) => {
    if (activeTrackIds.has(trackId)) return;
    const latestSeenAt = cache.reduce(
      (latest, entry) => Math.max(latest, entry?.seenAt ?? 0),
      0,
    );
    if (now - latestSeenAt > POSE_POINT_TTL_MS) posePointCache.delete(trackId);
  });

  // Pose가 실패해도 손/얼굴은 독립 모델 결과가 있으면 그대로 표시된다.
  drawHands(ctx, canvas, result?.handLandmarks ?? [], options);
  drawFace(ctx, canvas, result?.faceLandmarks ?? [], options);
}
