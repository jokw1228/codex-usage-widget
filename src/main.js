const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
const path = require("path");
const { CodexRpcClient } = require("./core/codex-client");
const { DEFAULT_BOUNDS, MIN_BOUNDS, normalizeWindowBounds, getResizedBounds } = require("./core/window-bounds");
const { DEFAULT_SETTINGS, createSettingsStore } = require("./core/settings-store");
const { mergeRateLimitPayload } = require("./core/rate-limits");

const REFRESH_MS = 60_000;
const APP_NAME = "Codex Usage Widget";
let mainWindow = null;
let latestPayload = null;
let refreshTimer = null;
let rpcClient = null;
let refreshInFlight = null;
let settings = { ...DEFAULT_SETTINGS };
let settingsStore = null;
let boundsSaveTimer = null;
let dragSession = null;
let resizeSession = null;

function createWindow() {
  settingsStore = createSettingsStore(path.join(app.getPath("userData"), "settings.json"));
  settings = settingsStore.load();
  const windowBounds = normalizeWindowBounds(settings.windowBounds);

  mainWindow = new BrowserWindow({
    width: windowBounds?.width ?? DEFAULT_BOUNDS.width,
    height: windowBounds?.height ?? DEFAULT_BOUNDS.height,
    x: windowBounds?.x,
    y: windowBounds?.y,
    minWidth: MIN_BOUNDS.width,
    minHeight: MIN_BOUNDS.height,
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
    if (!windowBounds || !Number.isFinite(windowBounds.x) || !Number.isFinite(windowBounds.y)) {
      positionWindow();
    }
    mainWindow.showInactive();
    sendSettingsUpdate();
    refreshUsage();
  });
  mainWindow.on("move", saveWindowBoundsSoon);
  mainWindow.on("resize", saveWindowBoundsSoon);
}

function positionWindow() {
  mainWindow.setPosition(24, 24, false);
}

function refreshUsage(source = "poll") {
  if (!refreshInFlight) {
    refreshInFlight = readUsage(source).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function createRpcClient() {
  const client = new CodexRpcClient({ version: app.getVersion() });
  client.on("diagnostic", (error) => {
    if (rpcClient !== client) return;
    latestPayload = { status: "error", error, updatedAt: Date.now() };
    sendUsageUpdate();
  });
  client.on("rate-limits", (update) => {
    if (rpcClient !== client) return;
    latestPayload = {
      status: "ready",
      data: mergeRateLimitPayload(latestPayload?.data, update),
      source: "event",
      updatedAt: Date.now()
    };
    sendUsageUpdate();
  });
  client.on("close", () => {
    if (rpcClient === client) rpcClient = null;
  });
  return client;
}

async function readUsage(source) {
  latestPayload = {
    status: "loading",
    data: latestPayload && latestPayload.data ? latestPayload.data : null,
    source,
    updatedAt: Date.now()
  };
  sendUsageUpdate();

  let client;
  try {
    if (!rpcClient) rpcClient = createRpcClient();
    client = rpcClient;
    const data = await client.getRateLimits();
    latestPayload = {
      status: "ready",
      data,
      source,
      updatedAt: Date.now()
    };
  } catch (error) {
    client?.dispose();
    if (rpcClient === client) rpcClient = null;
    latestPayload = {
      status: "error",
      error: error.message,
      source,
      updatedAt: Date.now()
    };
  }

  sendUsageUpdate();
}

function sendUsageUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("usage:update", latestPayload);
  }
}

function saveSettings(nextSettings) {
  settings = settingsStore.save({ ...settings, ...nextSettings });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOpacity(settings.opacity);
  }

  sendSettingsUpdate();
  return settings;
}

function saveWindowBoundsSoon() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (boundsSaveTimer) {
    clearTimeout(boundsSaveTimer);
  }

  boundsSaveTimer = setTimeout(() => {
    boundsSaveTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) return;

    saveSettings({ windowBounds: normalizeWindowBounds(mainWindow.getBounds()) });
  }, 250);
}

function resetSettings() {
  const nextSettings = {
    ...settings,
    opacity: DEFAULT_SETTINGS.opacity
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    const currentBounds = mainWindow.getBounds();
    const windowBounds = normalizeWindowBounds({
      ...currentBounds,
      width: DEFAULT_BOUNDS.width,
      height: DEFAULT_BOUNDS.height
    });

    mainWindow.setOpacity(DEFAULT_SETTINGS.opacity);
    mainWindow.setBounds(windowBounds, false);
    nextSettings.windowBounds = normalizeWindowBounds(mainWindow.getBounds());
  } else {
    nextSettings.windowBounds = {
      width: DEFAULT_BOUNDS.width,
      height: DEFAULT_BOUNDS.height
    };
  }

  return saveSettings(nextSettings);
}

function sendSettingsUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("settings:update", settings);
  }
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
ipcMain.handle("settings:reset", () => resetSettings());
ipcMain.on("window:drag-start", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  resizeSession = null;
  dragSession = {
    startMouse: screen.getCursorScreenPoint(),
    startBounds: mainWindow.getBounds()
  };
});
ipcMain.on("window:drag-move", () => {
  if (!mainWindow || mainWindow.isDestroyed() || !dragSession) return;

  const currentMouse = screen.getCursorScreenPoint();
  mainWindow.setBounds(
    {
      x: dragSession.startBounds.x + currentMouse.x - dragSession.startMouse.x,
      y: dragSession.startBounds.y + currentMouse.y - dragSession.startMouse.y,
      width: dragSession.startBounds.width,
      height: dragSession.startBounds.height
    },
    false
  );
});
ipcMain.on("window:drag-end", () => {
  dragSession = null;
  saveWindowBoundsSoon();
});
ipcMain.on("window:resize-start", (_event, direction) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  dragSession = null;
  resizeSession = {
    direction,
    startMouse: screen.getCursorScreenPoint(),
    startBounds: mainWindow.getBounds()
  };
});
ipcMain.on("window:resize-move", () => {
  if (!mainWindow || mainWindow.isDestroyed() || !resizeSession) return;

  const currentMouse = screen.getCursorScreenPoint();
  const deltaX = currentMouse.x - resizeSession.startMouse.x;
  const deltaY = currentMouse.y - resizeSession.startMouse.y;
  const bounds = getResizedBounds(resizeSession.startBounds, resizeSession.direction, deltaX, deltaY);
  mainWindow.setBounds(bounds, false);
});
ipcMain.on("window:resize-end", () => {
  resizeSession = null;
  saveWindowBoundsSoon();
});

app.on("before-quit", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (boundsSaveTimer) {
    clearTimeout(boundsSaveTimer);
    boundsSaveTimer = null;
  }
  dragSession = null;
  resizeSession = null;
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
