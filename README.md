# Pose Vision

## 실행

```powershell
Copy-Item .env.example .env
notepad .env
node server.cjs
```

브라우저에서 `http://127.0.0.1:8000/main.html`을 엽니다.

## 현재 흐름

1. 성별·연령대·체형·얼굴형·헤어·컬러·직업 의상·배경 커스텀
2. 카메라 시작 및 MediaPipe Pose Lite 트래킹
3. 사람 관절 위치에 2D VTuber 아바타 합성
4. 현재 화면 PNG 캡처
5. 선택적으로 Google Drive 저장

## 구성

- `main.html`, `main.css`, `main.js`: 화면과 실시간 합성
- `poseLandmarker.js`, `ui.js`: 포즈·표정 인식과 스켈레톤
- `avatarObj.js`: 파츠형 3D 아바타 생성 및 포즈 관절 연결
- `avatarOptions.js`: 아바타 커스텀 옵션과 스타일 매핑
- `server.cjs`: 정적 서버, Gemini 및 Google 설정 API
- `GOOGLE_DRIVE_SETUP.md`: Google Drive 연결 방법

아바타는 동일한 기본 실루엣에 선택한 헤어·얼굴·직업 장비·색상 파츠를 조합해 생성합니다. Gemini 분석 API는 선택 기능으로 서버에 유지되어 있습니다.
npm install -g @google/gemini-cli
gemini
--dangerously-bypass-approvals-and-sandbox 