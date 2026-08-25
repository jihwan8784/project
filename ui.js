export function drawSkeleton(canvas, poses) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!poses || poses.length === 0) return; // 포즈 데이터가 없을 경우 반환

  poses.forEach(pose => {
    pose.keypoints.forEach(keypoint => {
      if (keypoint && keypoint.x != null && keypoint.y != null) { // keypoint 유효성 검사
        ctx.beginPath();
        ctx.arc(keypoint.x, keypoint.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'cyan';
        ctx.fill();
      }
    });
  });
}