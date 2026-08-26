# Google Drive 연결

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만듭니다.
2. **Google Drive API**를 사용 설정합니다.
3. OAuth 동의 화면을 설정하고 테스트 사용자를 등록합니다.
4. OAuth 클라이언트 유형을 **웹 애플리케이션**으로 만듭니다.
5. 승인된 JavaScript 원본에 아래 주소를 추가합니다.

```text
http://127.0.0.1:8000
http://localhost:8000
```

6. 발급된 클라이언트 ID를 `.env`에 넣습니다.

```dotenv
GOOGLE_CLIENT_ID=발급된_ID.apps.googleusercontent.com
```

7. `node server.cjs`를 다시 실행합니다.

앱은 사용자가 만든 캡처 파일만 저장할 수 있는 `drive.file` 권한만 요청합니다. 액세스 토큰은 브라우저 메모리에만 보관됩니다.

공식 문서: [웹 OAuth 토큰 방식](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive 업로드](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
