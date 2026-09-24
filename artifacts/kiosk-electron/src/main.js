"use strict";
const { app, BrowserWindow, globalShortcut, ipcMain, shell, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

let mainWindow = null;
let badgeWindow = null;
let isLocked = false;
let isDesktopMode = false;

// Disable hardware acceleration BEFORE app is ready if config says so
let _earlyConfig = null;
try {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const earlyPaths = [
    path.join(appData, "Aether LMS Kiosk", "config.json"),
    path.join(__dirname, "..", "config.default.json"),
    path.join(process.resourcesPath, "config.default.json"),
  ];
  for (const p of earlyPaths) {
    if (fs.existsSync(p)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
        if (parsed.disableGpu || parsed.disableHardwareAcceleration) {
          app.disableHardwareAcceleration();
        }
        _earlyConfig = parsed;
        break;
      } catch { }
    }
  }
} catch { }

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
        const raw = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
        const parsed = JSON.parse(raw);
        if (parsed.serverUrl) {
          parsed.serverUrl = parsed.serverUrl.replace(/\/+$/, "");
          return parsed;
        }
      }
    } catch { }
  }
  return { serverUrl: "http://localhost:3000", autoLaunch: true };
}

// ─── Lock / Unlock ────────────────────────────────────────────────────────────
function lock() {
  if (!mainWindow) return;
  isLocked = true;
  isDesktopMode = false;
  closeBadge();
  mainWindow.setTitle("Aether LMS Kiosk");
  mainWindow.setFullScreen(true);
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setClosable(false);
  mainWindow.setMinimizable(true);
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

// ─── Desktop mode — badge floats on the side, desktop stays visible ──────────
function closeBadge() {
  if (badgeWindow && !badgeWindow.isDestroyed()) {
    const b = badgeWindow;
    badgeWindow = null;
    b.close();
  }
  badgeWindow = null;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createBadge(sessionInfo) {
  closeBadge();

  const name = escapeHtml((sessionInfo && sessionInfo.name) ? sessionInfo.name : "Student");
  const pc = String((sessionInfo && sessionInfo.computerNumber) ? sessionInfo.computerNumber : "?").padStart(2, "0");

  const workArea = screen.getPrimaryDisplay().workArea;
  const width = 300;
  const height = 96;

  badgeWindow = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + 16,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#0f172a",
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
    },
  });

  const badgeHtml = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f172a;font-family:sans-serif;overflow:hidden;-webkit-app-region:drag;user-select:none">
  <div style="display:flex;flex-direction:column;gap:8px;padding:12px 14px;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:8px;height:8px;border-radius:50%;background:#4ade80;animation:pulse 2s infinite;flex-shrink:0"></div>
      <span style="color:white;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">${name}</span>
      <span style="color:rgba(255,255,255,0.5);font-size:11px;flex-shrink:0">PC ${pc}</span>
    </div>
    <div style="display:flex;gap:8px">
      <button id="end" style="-webkit-app-region:no-drag;flex:1;background:#dc2626;color:white;border:none;border-radius:10px;padding:8px 0;font-size:12px;font-weight:600;cursor:pointer">End Session</button>
      <button id="back" style="-webkit-app-region:no-drag;flex:1;background:#2563eb;color:white;border:none;border-radius:10px;padding:8px 0;font-size:12px;font-weight:600;cursor:pointer">↩ Session</button>
    </div>
  </div>
  <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}</style>
  <script>
    const { ipcRenderer } = require('electron');
    document.getElementById('end').onclick  = () => ipcRenderer.send('kiosk:end-session');
    document.getElementById('back').onclick = () => ipcRenderer.send('kiosk:restore');
  </script>
</body>
</html>`;

  badgeWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(badgeHtml));

  badgeWindow.on("closed", () => {
    // Badge closed by hand — bring the kiosk window back
    if (badgeWindow !== null) {
      badgeWindow = null;
      if (isDesktopMode) exitDesktopMode();
    }
  });
}

function enterDesktopMode(sessionInfo) {
  if (!mainWindow || isDesktopMode) return;
  isDesktopMode = true;
  mainWindow.setTitle("Aether LMS Kiosk");
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setFullScreen(false);
  mainWindow.setMinimizable(true);
  mainWindow.minimize();
  createBadge(sessionInfo);
}

function exitDesktopMode() {
  isDesktopMode = false;
  closeBadge();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (isLocked) lock();
    mainWindow.webContents.send("kiosk:desktop-mode-changed", false);
  }
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
  const config = loadConfig();
  const serverUrl = config.serverUrl;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
    title: "Aether LMS Kiosk",
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
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

  mainWindow.loadURL(serverUrl).catch((err) => {
    console.error("[kiosk] Failed to load URL:", serverUrl, err);
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[kiosk] did-fail-load", { code, desc, url });
  });

  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[kiosk] render-process-gone", details);
  });

  mainWindow.webContents.on("preload-error", (_e, preloadPath, err) => {
    console.error("[kiosk] preload-error", preloadPath, err);
  });

  mainWindow.on("close", (e) => { if (isLocked) e.preventDefault(); });

  // Restored from the taskbar while in desktop mode — leave desktop mode
  mainWindow.on("restore", () => {
    if (isDesktopMode) exitDesktopMode();
  });
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.on("kiosk:lock", () => lock());
ipcMain.on("kiosk:unlock", () => unlock());
ipcMain.on("kiosk:set-locked", (_e, locked) => { if (locked) lock(); else unlock(); });

// Desktop mode from React session hook
ipcMain.on("kiosk:set-desktop-mode", (_e, enabled, sessionInfo) => {
  if (enabled) enterDesktopMode(sessionInfo);
  else if (isDesktopMode) exitDesktopMode();
});

// Go to Desktop button
ipcMain.on("kiosk:desktop-mode", (_e, sessionInfo) => enterDesktopMode(sessionInfo));

// Restore from desktop mode
ipcMain.on("kiosk:restore", () => exitDesktopMode());

// End Session button on the floating badge — forward to the React page
ipcMain.on("kiosk:end-session", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("kiosk:end-session");
  }
});

// ─── Global shortcuts ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const config = loadConfig();
  const serverUrl = config.serverUrl;

  if (config.autoLaunch !== false) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: false,
      name: "Aether LMS Kiosk",
    });
  }

  createWindow();
  connectToServerEvents(serverUrl);

  globalShortcut.register("Control+R", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`
        window.localStorage.setItem('kiosk_reload_in_progress', 'true');
      `).then(() => {
        mainWindow.webContents.reload();
      }).catch(() => {
        mainWindow.webContents.reload();
      });
    }
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
