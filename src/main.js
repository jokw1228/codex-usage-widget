const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron");
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const REFRESH_MS = 60_000;
const APP_NAME = "Codex Usage Widget";
const DEFAULT_SETTINGS = {
  opacity: 0.95
};

let mainWindow = null;
let latestPayload = null;
let refreshTimer = null;
let rpcClient = null;
let settings = DEFAULT_SETTINGS;

class CodexRpcClient {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.ready = false;
    const codexCommand = resolveCodexCommand();
    this.child = spawn(codexCommand, ["app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: isShellScript(codexCommand),
      windowsHide: true
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => this.onStderr(chunk));
    this.child.on("exit", () => this.onExit());
  }

  async initialize() {
    if (this.ready) return;

    await this.request("initialize", {
      clientInfo: {
        name: "codex-usage-widget",
        title: "Codex Usage Widget",
        version: app.getVersion()
      },
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: []
      }
    });

    this.ready = true;
  }

  async getRateLimits() {
    await this.initialize();
    return this.request("account/rateLimits/read", null);
  }

  request(method, params) {
    const id = this.nextId++;
    const message = { id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      try {
        this.child.stdin.write(`${JSON.stringify(message)}\n`);
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }

      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 12_000);
    });
  }

  onStdout(chunk) {
    this.buffer += chunk;

    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) break;

      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(message, "id")) {
        this.onNotification(message);
        continue;
      }

      const pending = this.pending.get(message.id);
      if (!pending) continue;

      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || "Codex app-server error"));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  onStderr(chunk) {
    const text = chunk.trim();
    if (text) {
      latestPayload = {
        status: "error",
        error: text,
        updatedAt: Date.now()
      };
      sendUsageUpdate();
    }
  }

  onNotification(message) {
    if (message.method !== "account/rateLimits/updated") return;

    latestPayload = {
      status: "ready",
      data: mergeRateLimitPayload(latestPayload?.data, message.params),
      source: "event",
      updatedAt: Date.now()
    };
    sendUsageUpdate();
  }

  onExit() {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Codex app-server exited"));
    }
    this.pending.clear();
    this.ready = false;
    if (rpcClient === this) {
      rpcClient = null;
    }
  }

  dispose() {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Codex app-server stopped"));
    }
    this.pending.clear();

    if (this.child && !this.child.killed) {
      this.child.kill();
    }
  }
}

function resolveCodexCommand() {
  const explicitPath = process.env.CODEX_CLI_PATH;
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }

  const candidates = [];

  try {
    const output = execFileSync("where.exe", ["codex"], {
      encoding: "utf8",
      windowsHide: true
    });
    candidates.push(...output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  } catch {
    // Fall through to common install paths.
  }

  const home = process.env.USERPROFILE;
  if (home) {
    candidates.push(path.join(home, "bin", "codex.exe"));
    candidates.push(path.join(home, "bin", "codex.cmd"));
  }

  const localAppData = process.env.LOCALAPPDATA;
  const codexBinRoot = localAppData && path.join(localAppData, "OpenAI", "Codex", "bin");
  if (codexBinRoot && fs.existsSync(codexBinRoot)) {
    for (const entry of fs.readdirSync(codexBinRoot)) {
      candidates.push(path.join(codexBinRoot, entry, "codex.exe"));
    }
  }

  const existing = candidates.filter((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });

  const exe = existing.find((candidate) => candidate.toLowerCase().endsWith(".exe"));
  if (exe) return exe;

  if (existing[0]) return existing[0];

  throw new Error("Codex CLI를 찾을 수 없습니다.");
}

function isShellScript(command) {
  return /\.(cmd|bat)$/i.test(command);
}

function createWindow() {
  settings = loadSettings();

  mainWindow = new BrowserWindow({
    width: 382,
    height: 220,
    minWidth: 230,
    minHeight: 104,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    icon: path.join(__dirname, "..", "assets", "app-icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setOpacity(settings.opacity);
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.once("ready-to-show", () => {
    positionWindow();
    mainWindow.showInactive();
    sendSettingsUpdate();
    refreshUsage();
  });
}

function positionWindow() {
  mainWindow.setPosition(24, 24, false);
}

async function refreshUsage(source = "poll") {
  latestPayload = {
    status: "loading",
    data: latestPayload && latestPayload.data ? latestPayload.data : null,
    source,
    updatedAt: Date.now()
  };
  sendUsageUpdate();

  try {
    if (!rpcClient) {
      rpcClient = new CodexRpcClient();
    }
    const data = await rpcClient.getRateLimits();
    latestPayload = {
      status: "ready",
      data,
      source,
      updatedAt: Date.now()
    };
  } catch (error) {
    if (rpcClient) {
      rpcClient.dispose();
      rpcClient = null;
    }
    latestPayload = {
      status: "error",
      error: error.message,
      source,
      updatedAt: Date.now()
    };
  }

  sendUsageUpdate();
}

function mergeRateLimitPayload(previous, update) {
  if (!previous) return update;
  if (!update) return previous;

  return {
    ...previous,
    ...update,
    rateLimits: mergeRateLimitSnapshot(previous.rateLimits, update.rateLimits),
    rateLimitsByLimitId: mergeRateLimitsById(
      previous.rateLimitsByLimitId,
      update.rateLimitsByLimitId
    )
  };
}

function mergeRateLimitsById(previous, update) {
  if (!previous) return update;
  if (!update) return previous;

  const merged = { ...previous };
  for (const [limitId, snapshot] of Object.entries(update)) {
    merged[limitId] = mergeRateLimitSnapshot(previous[limitId], snapshot);
  }
  return merged;
}

function mergeRateLimitSnapshot(previous, update) {
  if (!previous) return update;
  if (!update) return previous;

  return {
    ...previous,
    ...update,
    primary: update.primary ? { ...previous.primary, ...update.primary } : previous.primary,
    secondary: update.secondary ? { ...previous.secondary, ...update.secondary } : previous.secondary,
    credits: update.credits ? { ...previous.credits, ...update.credits } : previous.credits,
    individualLimit: update.individualLimit
      ? { ...previous.individualLimit, ...update.individualLimit }
      : previous.individualLimit
  };
}

function sendUsageUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("usage:update", latestPayload);
  }
}

function loadSettings() {
  const settingsPath = getSettingsPath();

  try {
    if (!fs.existsSync(settingsPath)) {
      return { ...DEFAULT_SETTINGS };
    }

    return normalizeSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(nextSettings) {
  settings = normalizeSettings(nextSettings);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOpacity(settings.opacity);
  }

  try {
    fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
    fs.writeFileSync(getSettingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  } catch {
    // Settings are non-critical; keep the live value even if persistence fails.
  }

  sendSettingsUpdate();
  return settings;
}

function normalizeSettings(value) {
  return {
    ...DEFAULT_SETTINGS,
    ...(value || {}),
    opacity: clamp(value?.opacity ?? DEFAULT_SETTINGS.opacity, 0.45, 1)
  };
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function sendSettingsUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("settings:update", settings);
  }
}

function clamp(value, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return min;
  return Math.min(max, Math.max(min, numericValue));
}

app.setName(APP_NAME);

app.whenReady().then(() => {
  createWindow();
  refreshTimer = setInterval(refreshUsage, REFRESH_MS);

  globalShortcut.register("CommandOrControl+Alt+U", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.showInactive();
    }
  });
});

ipcMain.handle("usage:refresh", () => refreshUsage());
ipcMain.handle("app:hide", () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});
ipcMain.handle("app:quit", () => app.quit());
ipcMain.handle("settings:read", () => settings);
ipcMain.handle("settings:write", (_event, nextSettings) => saveSettings(nextSettings));
ipcMain.on("window:moveBy", (_event, deltaX, deltaY) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(x + Math.round(deltaX), y + Math.round(deltaY), false);
});

app.on("before-quit", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  globalShortcut.unregisterAll();
  if (rpcClient) {
    rpcClient.dispose();
    rpcClient = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
