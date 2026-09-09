const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codexUsage", {
  onUpdate(callback) {
    ipcRenderer.on("usage:update", (_event, payload) => callback(payload));
  },
  onSettingsUpdate(callback) {
    ipcRenderer.on("settings:update", (_event, settings) => callback(settings));
  },
  refresh() {
    return ipcRenderer.invoke("usage:refresh");
  },
  hide() {
    return ipcRenderer.invoke("app:hide");
  },
  quit() {
    return ipcRenderer.invoke("app:quit");
  },
  startDrag() {
    ipcRenderer.send("window:drag-start");
  },
  dragMove() {
    ipcRenderer.send("window:drag-move");
  },
  endDrag() {
    ipcRenderer.send("window:drag-end");
  },
  startResize(direction) {
    ipcRenderer.send("window:resize-start", direction);
  },
  resizeMove() {
    ipcRenderer.send("window:resize-move");
  },
  endResize() {
    ipcRenderer.send("window:resize-end");
  },
  readSettings() {
    return ipcRenderer.invoke("settings:read");
  },
  writeSettings(settings) {
    return ipcRenderer.invoke("settings:write", settings);
  },
  resetSettings() {
    return ipcRenderer.invoke("settings:reset");
  }
});
