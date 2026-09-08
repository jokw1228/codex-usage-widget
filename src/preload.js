const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codexUsage", {
  onUpdate(callback) {
    ipcRenderer.on("usage:update", (_event, payload) => callback(payload));
  },
  onCompact(callback) {
    ipcRenderer.on("widget:compact", (_event, isCompact) => callback(isCompact));
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
  toggleCompact() {
    return ipcRenderer.invoke("widget:toggleCompact");
  }
});
