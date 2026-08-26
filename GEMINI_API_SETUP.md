# Gemini API 연결

1. Google AI Studio에서 API 키를 발급합니다.
2. `.env.example`을 `.env`로 복사합니다.
3. 아래 값을 입력하고 서버를 다시 실행합니다.

```dotenv
GEMINI_API_KEY=발급받은_API_KEY
GEMINI_MODEL=gemini-3.7-flash
PORT=8000
```

```powershell
node server.cjs
Invoke-RestMethod http://127.0.0.1:8000/api/gemini/status
```

`configured`가 `True`면 연결 준비가 완료된 것입니다. API 키는 브라우저 코드에 넣지 말고 `.env`에만 보관합니다.
