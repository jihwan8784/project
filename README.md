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