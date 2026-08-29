# Google Drive 연결

1. Google Cloud 프로젝트에서 **Google Drive API**를 사용 설정합니다.
2. Google Auth Platform에서 OAuth 동의 화면을 설정하고 본인 계정을 테스트 사용자로 추가합니다.
3. OAuth 클라이언트 유형을 **웹 애플리케이션**으로 생성합니다.
4. 승인된 JavaScript 원본에 아래 두 주소를 추가합니다.

```text
http://127.0.0.1:8000
http://localhost:8000
```

5. 발급된 클라이언트 ID를 `.env`에 넣습니다. Client Secret은 사용하지 않습니다.

```dotenv
GOOGLE_CLIENT_ID=발급된_ID.apps.googleusercontent.com
```

6. 서버를 완전히 종료한 뒤 `node server.cjs`로 다시 실행합니다.
7. 사진을 캡처한 다음 **Google Drive 연결 → Drive에 저장** 순서로 사용합니다.

앱은 `drive.file` 권한만 요청합니다. `origin_mismatch`는 접속 주소와 승인된 JavaScript 원본의 주소·포트가 다를 때 발생합니다. `access_denied`가 나오면 OAuth 테스트 사용자 및 동의 화면의 Drive 권한을 확인하세요.
