const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aetherKiosk", {
  isElectron: true,
  lock:        () => ipcRenderer.send("kiosk:lock"),
  unlock:      () => ipcRenderer.send("kiosk:unlock"),
  desktopMode: (session) => ipcRenderer.send("kiosk:desktop-mode", session),
  restore:     () => ipcRenderer.send("kiosk:restore"),
  setLocked:   (locked) => ipcRenderer.send("kiosk:set-locked", locked),
});
