# Pose Vision

## 서버 실행

PowerShell에서 프로젝트 폴더로 이동한 뒤 아래 명령을 실행합니다.

```powershell
npx http-server -c-1 -p 8000
```

브라우저에서 다음 주소를 엽니다.

```text
http://127.0.0.1:8000/main.html
```

처음 실행할 때 `http-server` 설치 확인 메시지가 나오면 `y`를 입력합니다.
카메라 권한을 허용해야 영상과 포즈 인식이 작동합니다.

## 인식 기능

MediaPipe Holistic Landmarker를 사용해 포즈 33개, 얼굴 468개, 양손 21개씩을
실시간으로 추적합니다. 웹캠 아래의 3D 아바타가 포즈 world landmark를 따라 움직입니다.
모델 선택 메뉴의 Lite, Full, Heavy는 인식 민감도 프로필로 동작합니다.