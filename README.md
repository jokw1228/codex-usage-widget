# Codex Usage Widget

Tiny always-on-top Windows widget that reads Codex usage from the local Codex app-server and displays the 5-hour and weekly remaining percentages.

## Run

```powershell
npm install
npm start
```

## Package

Create a portable Windows executable:

```powershell
npm run package:win
```

Create a Windows installer:

```powershell
npm run dist:win
```

Outputs are written to `dist/`.

## Controls

- Drag the widget from anywhere on the card.
- Right-click for Refresh, Compact, and Quit.
- Press `Esc` while focused to hide the widget.
- Use `Ctrl+Alt+U` to show or hide it globally.

## Notes

This uses the local Codex app-server protocol (`codex app-server --stdio`) and the `account/rateLimits/read` method. It is a local desktop helper, not a public OpenAI API integration.

For other users, the widget reads whichever ChatGPT account is already signed in through their local Codex client. It does not collect, proxy, or store ChatGPT passwords or session tokens.

## Distribution Model

This app intentionally does not implement its own ChatGPT login flow.

Expected user setup:

1. Install ChatGPT/Codex Desktop or Codex CLI.
2. Sign in to Codex with their own ChatGPT account.
3. Run Codex Usage Widget.

The widget then asks the local Codex app-server for the signed-in account's usage limits. If OpenAI changes or removes that local protocol, this app may need an update.
