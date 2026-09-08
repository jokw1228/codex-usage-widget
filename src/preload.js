const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codexUsage", {
  onUpdate(callback) {
    ipcRenderer.on("usage:update", (_event, payload) => callback(payload));
  },
  onCompact(callback) {
    ipcRenderer.on("widget:compact", (_event, isCompact) => callback(isCompact));
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
  moveBy(deltaX, deltaY) {
    ipcRenderer.send("window:moveBy", deltaX, deltaY);
  },
  toggleCompact() {
    return ipcRenderer.invoke("widget:toggleCompact");
  },
  readSettings() {
    return ipcRenderer.invoke("settings:read");
  },
  writeSettings(settings) {
    return ipcRenderer.invoke("settings:write", settings);
  }
});
