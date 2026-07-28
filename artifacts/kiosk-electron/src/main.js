"use strict";
const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

let mainWindow = null;
let isLocked = false;
let isDesktopMode = false;

// ─── Load config ─────────────────────────────────────────────────────────────
function loadConfig() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const configPaths = [
    path.join(appData, "Aether LMS Kiosk", "config.json"),
    path.join(app.getPath("userData"), "config.json"),
    path.join(__dirname, "..", "config.default.json"),
    path.join(process.resourcesPath, "config.default.json"),
  ];
  for (const p of configPaths) {
    try {
      if (fs.existsSync(p)) {
        const parsed = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
        if (parsed.serverUrl) return parsed.serverUrl.replace(/\/+$/, "");
      }
    } catch { }
  }
  return "http://localhost:3000";
}

// ─── Lock / Unlock ────────────────────────────────────────────────────────────
function lock() {
  if (!mainWindow) return;
  isLocked = true;
  mainWindow.setTitle("Aether LMS Kiosk");
  mainWindow.setFullScreen(true);
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setClosable(false);
  // Keep minimizable TRUE so Go to Desktop still works when locked
  mainWindow.setMinimizable(true);
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
  for (const a of ["Alt+F4", "Super", "Super+D", "Super+L", "Super+R", "Super+Tab", "Ctrl+Escape"]) {
    try { globalShortcut.register(a, () => {}); } catch { }
  }
}

function unlock() {
  if (!mainWindow) return;
  isLocked = false;
  for (const a of ["Alt+F4", "Super", "Super+D", "Super+L", "Super+R", "Super+Tab", "Ctrl+Escape"]) {
    try { globalShortcut.unregister(a); } catch { }
  }
  mainWindow.setFullScreen(false);
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setClosable(true);
  mainWindow.setMinimizable(true);
  mainWindow.show();
  mainWindow.focus();
}

// ─── Connect to server SSE for remote lock/unlock ─────────────────────────────
function connectToServerEvents(serverUrl) {
  const url = new URL(`${serverUrl}/api/kiosk/events`);
  const protocol = url.protocol === "https:" ? require("https") : require("http");

  function connect() {
    const req = protocol.get(url.href, (res) => {
      res.setEncoding("utf8");
      let buffer = "";
      res.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "lock") lock();
              else if (data.type === "unlock") unlock();
            } catch { }
          }
        }
      });
      res.on("end", () => setTimeout(connect, 5000));
    });
    req.on("error", () => setTimeout(connect, 5000));
    req.end();
  }
  connect();
}

// ─── Create window ────────────────────────────────────────────────────────────
function createWindow() {
  const serverUrl = loadConfig();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
    title: "Aether LMS Kiosk",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!isLocked) return;
    const key = input.key?.toLowerCase();
    if (key === "f12" ||
      (input.control && input.shift && key === "i") ||
      (input.control && input.shift && key === "j") ||
      (input.control && key === "u")) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("context-menu", (e) => { if (isLocked) e.preventDefault(); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });

  mainWindow.webContents.on("did-fail-load", (_e, code) => {
    if (code === -3) return;
    mainWindow && mainWindow.loadURL(
      `data:text/html,<body style="background:#0f172a;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Aether LMS</h2><p>Cannot connect to server.</p><p style="color:#94a3b8;font-size:13px">Make sure the server is running, then press Ctrl+R to retry.</p></div></body>`
    );
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.setClosable(true);
    mainWindow.setMinimizable(true);
    mainWindow.setFullScreen(false);
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.loadURL(serverUrl);
  mainWindow.on("close", (e) => { if (isLocked) e.preventDefault(); });
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.on("kiosk:lock", () => lock());
ipcMain.on("kiosk:unlock", () => unlock());
ipcMain.on("kiosk:set-locked", () => { });

// Desktop mode from React session hook
ipcMain.on("kiosk:set-desktop-mode", (_e, enabled) => {
  if (!mainWindow) return;
  if (enabled && !isDesktopMode) {
    isDesktopMode = true;
    mainWindow.setMinimizable(true);
    mainWindow.minimize();
  }
});

// Go to Desktop button
ipcMain.on("kiosk:desktop-mode", (_e, sessionInfo) => {
  if (!mainWindow) return;
  isDesktopMode = true;
  const name = (sessionInfo && sessionInfo.name) ? sessionInfo.name : "Student";
  const pc = String((sessionInfo && sessionInfo.computerNumber) ? sessionInfo.computerNumber : "?").padStart(2, "0");
  mainWindow.setTitle(`${name} | PC ${pc} — Click to return`);
  mainWindow.setMinimizable(true);
  mainWindow.minimize();
});

// Restore from desktop mode
ipcMain.on("kiosk:restore", () => {
  isDesktopMode = false;
  if (mainWindow) {
    mainWindow.setTitle("Aether LMS Kiosk");
    mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (isLocked) lock();
  }
});

// ─── Global shortcuts ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const serverUrl = loadConfig();
  createWindow();
  connectToServerEvents(serverUrl);

  globalShortcut.register("Control+R", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
  });
  globalShortcut.register("Control+M", () => {
    isLocked = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setClosable(true);
      mainWindow.setFullScreen(false);
    }
    app.quit();
  });
  globalShortcut.register("Control+Q", () => {
    if (!isLocked) app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => { globalShortcut.unregisterAll(); });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
