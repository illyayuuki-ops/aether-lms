import { app, BrowserWindow, globalShortcut, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {BrowserWindow | null} */
let mainWindow = null;
let isLocked = false;

function loadConfig() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");

  // All possible places the config could be
  const configPaths = [
    path.join(appData, "Aether LMS Kiosk", "config.json"),
    path.join(app.getPath("userData"), "config.json"),
    path.join(app.getAppPath(), "config.default.json"),
    path.join(process.resourcesPath, "config.default.json"),
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");
        const parsed = JSON.parse(raw);
        if (parsed.serverUrl) return parsed.serverUrl.replace(/\/+$/, "");
      }
    } catch { /* try next */ }
  }

  return "http://localhost:3000";
}

// ─── Lock / Unlock ────────────────────────────────────────────────────────────

function lock() {
  if (!mainWindow) return;
  isLocked = true;
  mainWindow.setFullScreen(true);
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setClosable(false);
  mainWindow.setMinimizable(false);
  mainWindow.show();
  mainWindow.focus();
}

function unlock() {
  if (!mainWindow) return;
  isLocked = false;
  mainWindow.setFullScreen(false);
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setClosable(true);
  mainWindow.setMinimizable(true);
  mainWindow.show();
  mainWindow.focus();
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
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Block right-click and DevTools while locked
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!isLocked) return;
    const key = input.key?.toLowerCase();
    if (
      key === "f12" ||
      (input.control && input.shift && key === "i") ||
      (input.control && input.shift && key === "j") ||
      (input.control && key === "u")
    ) { event.preventDefault(); }
  });

  mainWindow.webContents.on("context-menu", (e) => {
    if (isLocked) e.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Prevent white screen when navigating between pages
  mainWindow.webContents.on("did-navigate-in-page", () => {
    mainWindow?.webContents.executeJavaScript("document.body.style.visibility='visible'").catch(() => {});
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    if (code === -3) return; // ignore aborted (normal during SPA navigation)
    mainWindow?.loadURL(
      `data:text/html,<body style="background:#0f172a;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h2>Aether LMS</h2>
          <p>Cannot connect to server.</p>
          <p style="color:#94a3b8;font-size:13px">Make sure the server is running, then press Ctrl+R to retry.</p>
        </div>
      </body>`
    );
  });

  // Start as a normal window — NOT locked
  mainWindow.once("ready-to-show", () => {
    mainWindow.setClosable(true);
    mainWindow.setMinimizable(true);
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.loadURL(serverUrl).catch(() => {
    mainWindow?.loadURL(
      `data:text/html,<body style="background:#0f172a;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center;padding:2rem">
          <h1>Aether LMS</h1>
          <p>Cannot connect to server at <b>${serverUrl}</b></p>
          <p style="color:#94a3b8;font-size:14px">Make sure the server is running on the admin PC.</p>
        </div>
      </body>`
    );
  });

  mainWindow.on("close", (e) => {
    if (isLocked) e.preventDefault();
  });
}

// ─── IPC from the web page ────────────────────────────────────────────────────

ipcMain.on("kiosk:lock",   () => lock());
ipcMain.on("kiosk:unlock", () => unlock());
ipcMain.on("kiosk:set-locked", (_e, locked) => { if (locked) lock(); else unlock(); });

// Desktop mode — minimize main window, show small floating badge
ipcMain.on("kiosk:desktop-mode", (_e, sessionInfo) => {
  if (!mainWindow) return;

  // Minimize/hide the main kiosk window
  mainWindow.setAlwaysOnTop(false);
  mainWindow.minimize();

  // Create small floating badge window
  const badge = new BrowserWindow({
    width: 320,
    height: 90,
    x: 20,
    y: 20,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    focusable: true,
    transparent: false,
    backgroundColor: "#0f172a",
    webPreferences: { contextIsolation: false, nodeIntegration: true },
  });

  const name = sessionInfo?.name ?? "Student";
  const pc   = String(sessionInfo?.computerNumber ?? "?").padStart(2, "0");

  const badgeHtml = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f172a;font-family:sans-serif;overflow:hidden;-webkit-app-region:drag;user-select:none">
  <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;height:66px;box-sizing:border-box">
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
        <div style="width:8px;height:8px;border-radius:50%;background:#4ade80;animation:pulse 2s infinite;flex-shrink:0"></div>
        <span style="color:white;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
      </div>
      <span style="color:rgba(255,255,255,0.5);font-size:11px">PC ${pc} • Session Active</span>
    </div>
    <button id="btn" style="-webkit-app-region:no-drag;background:#2563eb;color:white;border:none;border-radius:10px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer">
      ↩ Session
    </button>
  </div>
  <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}</style>
  <script>
    const { ipcRenderer } = require('electron');
    document.getElementById('btn').onclick = () => ipcRenderer.send('kiosk:restore');
  </script>
</body>
</html>`;

  badge.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(badgeHtml));

  badge.on("closed", () => {
    // If badge is closed without restoring, still bring back main window
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      if (isLocked) lock();
    }
  });

  // Store reference so restore can close it
  app._badge = badge;
});

// Restore from desktop mode
ipcMain.on("kiosk:restore", () => {
  const badge = app._badge;
  if (badge && !badge.isDestroyed()) badge.close();
  app._badge = null;

  if (mainWindow) {
    mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (isLocked) lock();
  }
});

// ─── Global shortcuts — always work, even when locked ────────────────────────

app.whenReady().then(() => {
  createWindow();

  // Ctrl+R — refresh the page
  globalShortcut.register("Control+R", () => {
    mainWindow?.webContents.reload();
  });

  // Ctrl+Q — close app (only works when unlocked to prevent students closing)
  globalShortcut.register("Control+Q", () => {
    if (!isLocked) app.quit();
    else mainWindow?.webContents.reload(); // if locked, just refresh instead
  });

  // Ctrl+M — force close no matter what (admin emergency)
  globalShortcut.register("Control+M", () => {
    isLocked = false;
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

// Single instance only
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
