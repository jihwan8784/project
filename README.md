# Pose Vision

## 실행

```powershell
Copy-Item .env.example .env
notepad .env
node server.cjs
```

브라우저에서 `http://127.0.0.1:8000/main.html`을 엽니다.

## 현재 흐름

1. 성별·연령대·체형·직업군·배경·테마 선택
2. 카메라 시작 및 MediaPipe Pose Lite 트래킹
3. 사람 관절 위치에 2D VTuber 아바타 합성
4. 현재 화면 PNG 캡처
5. 선택적으로 Google Drive 저장

## 구성

- `main.html`, `main.css`, `main.js`: 화면과 실시간 합성
- `poseLandmarker.js`, `ui.js`: 포즈·표정 인식과 스켈레톤
- `avatar2d.js`: 캔버스 기반 2D 아바타
- `avatarOptions.js`: 옵션 목록, 이미지 경로와 세분화 파츠 매니페스트
- `server.cjs`: 정적 서버, Gemini 및 Google 설정 API
- `GEMINI_API_SETUP.md`, `GOOGLE_DRIVE_SETUP.md`: API 연결 방법

옵션 이미지와 파츠 제작 규격은 `AVATAR_ASSET_GUIDE.md`를 참고하세요. Gemini 분석 API는 이후 옵션 이미지 학습 및 아바타 생성에 연결할 수 있도록 서버에 유지했습니다.
npm install -g @google/gemini-cli
gemini