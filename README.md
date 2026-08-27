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
- `avatarObj.js`: GLB 리깅 아바타 로드 및 포즈 본 연결
- `avatarOptions.js`: GLB 아바타 옵션 목록과 스타일 매핑
- `server.cjs`: 정적 서버, Gemini 및 Google 설정 API
- `GOOGLE_DRIVE_SETUP.md`: Google Drive 연결 방법

아바타는 같은 폴더의 `final low poly character  rigged.glb`를 사용합니다. Gemini 분석 API는 선택 기능으로 서버에 유지되어 있습니다.
npm install -g @google/gemini-cli
gemini
