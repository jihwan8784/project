export function drawSkeleton(canvas, poses) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const detectedLandmarks = poses?.landmarks ?? [];
  if (detectedLandmarks.length === 0) return;

  detectedLandmarks.forEach(landmarks => {
    landmarks.forEach(keypoint => {
      if (keypoint && keypoint.x != null && keypoint.y != null) { // keypoint 유효성 검사
        ctx.beginPath();
        ctx.arc(keypoint.x * canvas.width, keypoint.y * canvas.height, 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'cyan';
        ctx.fill();
      }
    });
  });
}