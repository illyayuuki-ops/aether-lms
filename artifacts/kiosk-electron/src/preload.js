"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aetherKiosk", {
  isElectron: true,
  lock:          () => ipcRenderer.send("kiosk:lock"),
  unlock:        () => ipcRenderer.send("kiosk:unlock"),
  sessionActive: () => ipcRenderer.send("kiosk:session-active"),
  desktopMode:   (session) => ipcRenderer.send("kiosk:desktop-mode", session),
  restore:       () => ipcRenderer.send("kiosk:restore"),
  setLocked:     (locked) => ipcRenderer.send("kiosk:set-locked", locked),
  setDesktopMode: (enabled, session) => ipcRenderer.send("kiosk:set-desktop-mode", enabled, session),
  onEndSession: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("kiosk:end-session", listener);
    return () => ipcRenderer.removeListener("kiosk:end-session", listener);
  },
  onDesktopModeChanged: (cb) => {
    const listener = (_e, enabled) => cb(enabled);
    ipcRenderer.on("kiosk:desktop-mode-changed", listener);
    return () => ipcRenderer.removeListener("kiosk:desktop-mode-changed", listener);
  },
  getSystemIdleSeconds: () => ipcRenderer.invoke("kiosk:get-system-idle-time"),
});
