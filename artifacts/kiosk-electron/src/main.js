"use strict";
const { app, BrowserWindow, globalShortcut, ipcMain, shell, screen, powerMonitor } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

let mainWindow = null;
let badgeWindow = null;
let isLocked = false;
let isSessionActive = false;
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

// ─── Global-shortcut lockdown helpers ──────────────────────────────────────────
// Block Alt+F4, Super, Super+D/L/R/Tab, Ctrl+Escape so students can't escape
// to the desktop while the session is locked or active.
const LOCKDOWN_SHORTCUTS = ["Alt+F4", "Super", "Super+D", "Super+L", "Super+R", "Super+Tab", "Ctrl+Escape"];

function registerShortcuts() {
  for (const a of LOCKDOWN_SHORTCUTS) {
    try { globalShortcut.register(a, () => {}); } catch { }
  }
}

function unregisterShortcuts() {
  for (const a of LOCKDOWN_SHORTCUTS) {
    try { globalShortcut.unregister(a); } catch { }
  }
}

// ─── Lock / Session-active / Unlock ────────────────────────────────────────────
// lock()            — full kiosk lockdown (server-initiated or set-locked true)
// sessionActive()   — same chrome as lock(), but session is still running
// unlock()          — release everything
function applyKioskChrome() {
  if (!mainWindow) return;
  mainWindow.setTitle("Aether LMS Kiosk");
  mainWindow.setFullScreen(true);
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setClosable(false);
  mainWindow.setMinimizable(true);
  mainWindow.show();
  mainWindow.focus();
  registerShortcuts();
}

function lock() {
  if (!mainWindow) return;
  isLocked = true;
  isSessionActive = false;
  isDesktopMode = false;
  closeBadge();
  applyKioskChrome();
}

function sessionActive() {
  if (!mainWindow) return;
  isSessionActive = true;
  isLocked = false;
  isDesktopMode = false;
  closeBadge();
  applyKioskChrome();
}

function unlock() {
  if (!mainWindow) return;
  isLocked = false;
  isSessionActive = false;
  unregisterShortcuts();
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
  const width = 340;
  const height = 108;

  badgeWindow = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + 16,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    // Fixed position: students must not be able to drag the session badge away.
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#0f172a",
    webPreferences: {
      // The badge is trusted app chrome, but it still must not run with Node
      // access. It talks to the main process via the shared preload bridge.
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const badgeHtml = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f172a;font-family:sans-serif;overflow:hidden;user-select:none">
  <div style="display:flex;flex-direction:column;gap:8px;padding:12px 14px;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:8px;height:8px;border-radius:50%;background:#4ade80;animation:pulse 2s infinite;flex-shrink:0"></div>
      <span style="color:white;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">${name}</span>
      <span style="color:rgba(255,255,255,0.5);font-size:12px;flex-shrink:0">PC ${pc}</span>
    </div>
    <div id="actions" style="display:flex;gap:10px">
      <button id="end" style="flex:1;background:#1e293b;color:#fca5a5;border:1px solid #7f1d1d;border-radius:10px;padding:10px 0;font-size:12px;font-weight:600;cursor:pointer">End Session</button>
      <button id="back" style="flex:1;background:#2563eb;color:white;border:none;border-radius:10px;padding:10px 0;font-size:13px;font-weight:700;cursor:pointer">↩ Back to Kiosk</button>
    </div>
    <div id="confirm" style="display:none;gap:10px">
      <span style="color:#fca5a5;font-size:11px;align-self:center;flex:1">End this session?</span>
      <button id="cancel" style="background:#334155;color:white;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer">Cancel</button>
      <button id="really" style="background:#dc2626;color:white;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer">Yes, end</button>
    </div>
  </div>
  <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}</style>
  <script>
    // "End Session" is destructive, so it asks for confirmation first — a
    // single misclick on the badge must never log the student out.
    const actions = document.getElementById('actions');
    const confirmBox = document.getElementById('confirm');

    document.getElementById('end').onclick = () => {
      actions.style.display = 'none';
      confirmBox.style.display = 'flex';
    };
    document.getElementById('cancel').onclick = () => {
      confirmBox.style.display = 'none';
      actions.style.display = 'flex';
    };
    document.getElementById('really').onclick = () => window.aetherKiosk.endSession();
    document.getElementById('back').onclick = () => window.aetherKiosk.restore();
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

  // "Desktop mode" means the student may use the PC, so Windows shortcuts are
  // released — but the kiosk window itself STAYS fullscreen and on top. It used
  // to call minimize(), which dropped the student onto a bare desktop with only
  // a small floating badge and no way to get back.
  mainWindow.setTitle("Aether LMS Session");
  mainWindow.setFullScreen(true);
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setClosable(false);
  mainWindow.show();
  mainWindow.focus();

  mainWindow.webContents.send("kiosk:desktop-mode-changed", true);
}

function exitDesktopMode() {
  isDesktopMode = false;
  closeBadge();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    // Re-apply kiosk chrome so the window is locked again before we hand
    // control back to the React layer.
    if (isLocked || isSessionActive) {
      applyKioskChrome();
      registerShortcuts();
    }
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
              else if (data.type === "session") sessionActive();
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
      // The preload only uses contextBridge/ipcRenderer, which work in a
      // sandboxed renderer, so enable the OS-level sandbox too.
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!isLocked && !isSessionActive) return;
    const key = input.key?.toLowerCase();
    if (key === "f12" ||
      (input.control && input.shift && key === "i") ||
      (input.control && input.shift && key === "j") ||
      (input.control && key === "u")) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("context-menu", (e) => { if (isLocked || isSessionActive) e.preventDefault(); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only hand http(s) links to the system browser; never launch arbitrary
    // protocols (file:, smb:, custom handlers) from the renderer.
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        shell.openExternal(url);
      }
    } catch {
      /* ignore malformed URLs */
    }
    return { action: "deny" };
  });

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

  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[kiosk] render-process-gone", details);
  });

  mainWindow.webContents.on("preload-error", (_e, preloadPath, err) => {
    console.error("[kiosk] preload-error", preloadPath, err);
  });

  mainWindow.on("close", (e) => { if (isLocked || isSessionActive) e.preventDefault(); });

  // Restored from the taskbar while in desktop mode — leave desktop mode
  mainWindow.on("restore", () => {
    if (isDesktopMode) exitDesktopMode();
  });
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.on("kiosk:lock", () => lock());
ipcMain.on("kiosk:unlock", () => unlock());
ipcMain.on("kiosk:session-active", () => sessionActive());
// Backwards-compatible: accepts boolean true/false (old API) or
// string "locked" | "session" | "unlocked" (new API).
ipcMain.on("kiosk:set-locked", (_e, locked) => {
  if (locked === "session") sessionActive();
  else if (locked === "locked" || locked === true) lock();
  else if (locked === "unlocked" || locked === false) unlock();
  else if (locked) lock(); // unknown truthy -> lock
  else unlock();
});

// System idle time (seconds) — used by kiosk to detect real OS-level inactivity
ipcMain.handle("kiosk:get-system-idle-time", async () => {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch {
    return 0;
  }
});

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
    isSessionActive = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setClosable(true);
      mainWindow.setFullScreen(false);
    }
    app.quit();
  });
  globalShortcut.register("Control+Q", () => {
    if (!isLocked && !isSessionActive) app.quit();
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
