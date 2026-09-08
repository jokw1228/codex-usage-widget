# ADR-0001: Codex 로컬 app-server 사용

## 상태

채택

## 맥락

Codex 사용량을 위젯에서 표시하려면 데이터 소스가 필요하다. 공식 OpenAI 공개 API로 Codex 사용량을 조회하는 방법은 확인되지 않았다.

로컬 환경에서는 `codex app-server --stdio`가 JSON-RPC 형태로 동작하고, `account/rateLimits/read` 메서드가 현재 계정의 사용량 스냅샷을 반환한다.

## 결정

위젯은 자체 로그인 기능을 만들지 않고, 로컬 Codex 클라이언트에 이미 로그인된 계정을 기준으로 사용량을 읽는다.

## 결과

장점:

- 사용자의 ChatGPT 비밀번호나 세션 토큰을 직접 다루지 않는다.
- 현재 PC에서 Codex가 보는 사용량과 같은 데이터를 표시할 수 있다.
- 구현이 작고 로컬에서만 동작한다.

단점:

- Codex Desktop 또는 Codex CLI 설치와 로그인이 필요하다.
- 로컬 app-server 프로토콜이 바뀌면 앱 수정이 필요할 수 있다.
