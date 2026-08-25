const POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [11, 23], [12, 24],
  [23, 24], [23, 25], [25, 27], [27, 29], [27, 31], [24, 26], [26, 28],
  [28, 30], [28, 32], [5, 11], [6, 12], [5, 6], [5, 7], [6, 8], [7, 9], [8, 10],
];

export function drawSkeleton(canvas, poses) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const poseLandmarks = poses?.poseLandmarks ?? poses?.landmarks ?? [];
  const detectedLandmarks = Array.isArray(poseLandmarks[0]) ? poseLandmarks : [poseLandmarks];
  if (detectedLandmarks.length === 0) return;

  detectedLandmarks.forEach(landmarks => {
    ctx.strokeStyle = '#5fe0d0';
    ctx.lineWidth = Math.max(3, canvas.width / 240);
    ctx.lineCap = 'round';

    POSE_CONNECTIONS.forEach(([startIndex, endIndex]) => {
      const start = landmarks[startIndex];
      const end = landmarks[endIndex];
      if (!start || !end || (start.visibility ?? 1) < 0.35 || (end.visibility ?? 1) < 0.35) return;

      ctx.beginPath();
      ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
      ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
      ctx.stroke();
    });

    landmarks.forEach(keypoint => {
      if (keypoint && keypoint.x != null && keypoint.y != null && (keypoint.visibility ?? 1) >= 0.35) {
        ctx.beginPath();
        ctx.arc(keypoint.x * canvas.width, keypoint.y * canvas.height, Math.max(4, canvas.width / 320), 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    });
  });

}

