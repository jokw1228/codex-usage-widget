# Codex Usage Widget

Codex 사용량을 Windows 화면 위에 작게 띄워두는 투명/항상 위 위젯입니다.

![platform](https://img.shields.io/badge/platform-Windows-2563eb)
![license](https://img.shields.io/badge/license-MIT-22c55e)

## 무엇을 하나요?

- Codex 5시간 사용량과 주간 사용량의 남은 비율을 표시합니다.
- 프레임 없는 작은 위젯으로 화면 위에 계속 띄울 수 있습니다.
- Codex가 설치되어 있지 않거나 로그인되어 있지 않으면 설치/로그인 안내를 보여줍니다.
- 1분마다 자동 갱신하고, Codex 로컬 app-server 이벤트가 오면 즉시 반영합니다.
- 우클릭 옵션에서 위젯 투명도를 조절하고 저장할 수 있습니다.

## 다운로드

GitHub의 **Releases**에서 최신 `codex-usage-widget-*-portable-x64.exe` 파일을 내려받아 실행하면 됩니다.

> 이 앱은 Codex 자체를 포함하지 않습니다. 사용하려면 먼저 Codex Desktop 또는 Codex CLI가 설치되어 있고, 본인의 ChatGPT 계정으로 로그인되어 있어야 합니다.

## 사용법

- 위젯 이동: 카드 아무 곳이나 드래그
- 새로고침: 우측 상단 버튼
- 닫기: 우측 상단 `×` 버튼
- 옵션: 위젯 우클릭 후 `옵션`
- 투명도 조절: `옵션` 패널의 슬라이더
- 보이기/숨기기: `Ctrl+Alt+U`
- 숨기기: `Esc`

## 설정 저장

투명도 같은 사용자 설정은 Windows 사용자 데이터 경로에 저장합니다.

```text
%APPDATA%\Codex Usage Widget\settings.json
```

portable exe 옆에 설정을 쓰지 않는 이유는 실행 위치에 따라 쓰기 권한이 다를 수 있기 때문입니다. 사용자별 설정은 AppData에 두는 방식이 Windows 데스크톱 앱에서 더 안정적입니다.

## 기술 스택

- Electron: Windows 데스크톱 위젯 UI
- Node.js: Codex 로컬 app-server 프로세스 제어
- HTML/CSS/JavaScript: 렌더러 UI
- electron-builder: Windows portable exe 패키징
- GitHub Releases: 실행 파일 배포
- ImageGen: 앱 아이콘 초안 생성

## 동작 방식

이 앱은 공개 OpenAI API가 아니라 로컬 Codex app-server를 사용합니다.

1. `codex app-server --stdio`를 실행합니다.
2. `account/rateLimits/read`로 사용량 스냅샷을 가져옵니다.
3. `account/rateLimits/updated` 이벤트가 오면 화면을 갱신합니다.
4. 이벤트가 없더라도 60초마다 polling으로 다시 확인합니다.

오른쪽 상단의 `갱신 HH:MM:SS`는 마지막으로 사용량 데이터를 가져오거나 이벤트를 받은 시간입니다.

## 개발

```powershell
npm install
npm start
```

검증:

```powershell
npm run check
npm audit --omit=optional
```

Windows portable exe 생성:

```powershell
npm run package:win
```

빌드 전에 `assets/app-icon.png`에서 Windows용 `assets/app-icon.ico`를 생성합니다.

빌드 결과는 `release/` 폴더에 생성됩니다. 패키징 스크립트는 중간 산출물을 정리하고 portable exe만 남깁니다. 이 폴더는 Git에 커밋하지 않고, 배포 파일은 GitHub Releases에 업로드합니다.

## 라이선스

MIT
