const avatarButton = document.getElementById('saveAvatarButton');
const video = document.getElementById('webcamVideo');
const IMAGE_KEY = 'poseVisionGeminiImage';
const CAPTURED_AT_KEY = 'poseVisionGeminiCapturedAt';

function captureFrame() {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

  const maxSide = 768;
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return null;

  // 화면 미러링 설정과 무관하게 원본 카메라 프레임을 분석한다.
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.84);
}

function saveTemporaryImage(imageDataUrl) {
  const capturedAt = String(Date.now());
  try {
    sessionStorage.setItem(IMAGE_KEY, imageDataUrl);
    sessionStorage.setItem(CAPTURED_AT_KEY, capturedAt);
    localStorage.removeItem(IMAGE_KEY);
    localStorage.removeItem(CAPTURED_AT_KEY);
    return;
  } catch (error) {
    console.warn('Session storage is unavailable; using a one-time local fallback.', error);
  }

  localStorage.setItem(IMAGE_KEY, imageDataUrl);
  localStorage.setItem(CAPTURED_AT_KEY, capturedAt);
}

avatarButton?.addEventListener('click', () => {
  const imageDataUrl = captureFrame();
  if (!imageDataUrl) return;

  try {
    saveTemporaryImage(imageDataUrl);
  } catch (error) {
    console.warn('Gemini 분석용 사진을 임시 저장하지 못했습니다.', error);
  }
});
