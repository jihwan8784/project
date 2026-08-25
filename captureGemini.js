const avatarButton = document.getElementById('saveAvatarButton');
const video = document.getElementById('webcamVideo');

function captureFrame() {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

  const maxSide = 768;
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 실제 얼굴 방향을 그대로 보낸다. 화면 미러링 여부와 무관하게 원본 프레임을 분석한다.
  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

avatarButton?.addEventListener('click', () => {
  const imageDataUrl = captureFrame();
  if (!imageDataUrl) return;

  try {
    localStorage.setItem('poseVisionGeminiImage', imageDataUrl);
    localStorage.setItem('poseVisionGeminiCapturedAt', String(Date.now()));
  } catch (error) {
    console.warn('Gemini 분석용 사진을 저장하지 못했습니다.', error);
  }
});
