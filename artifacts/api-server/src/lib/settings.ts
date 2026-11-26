import fs from "node:fs";
import path from "node:path";

/**
 * System settings persistence (inactivity/time limits, courses, PC count).
 *
 * This used to live inside routes/admin.ts, which forced sessions.ts and
 * index.ts to import from a route module (creating a route→route cycle).
 */

export interface SystemSettings {
  inactivityLimitMinutes: number;
  sessionTimeLimitMinutes: number;
  totalComputers: number;
  courses: string[];
  yearLevels: string[];
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  inactivityLimitMinutes: 10,
  sessionTimeLimitMinutes: 60,
  totalComputers: 20,
  courses: [
    "BEED", "BSA", "BSBA", "BSED", "BSHM", "BSIE", "BSIT", "BSMA", "BSP", "BSTM",
    "SHS", "STEM", "ABM", "HUMSS", "GAS",
    "TVL - ICT", "TVL - HE", "TVL - IA", "TVL - AFA",
    "SPORTS", "ARTS & DESIGN",
    "JHS", "MS", "LS", "KS",
  ],
  yearLevels: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
};

// Anchor next to the server install, not the process CWD.
const SETTINGS_FILE = process.env.SYSTEM_SETTINGS_FILE
  ? path.resolve(process.env.SYSTEM_SETTINGS_FILE)
  : path.join(__dirname, "../../system-settings.json");
const LEGACY_SETTINGS_FILE = path.join(process.cwd(), "system-settings.json");

function migrateSettingsFile(): void {
  try {
    if (!fs.existsSync(SETTINGS_FILE) && fs.existsSync(LEGACY_SETTINGS_FILE)) {
      fs.copyFileSync(LEGACY_SETTINGS_FILE, SETTINGS_FILE);
    }
  } catch {
    /* non-critical — defaults will be used */
  }
}
migrateSettingsFile();

export function loadSettings(): SystemSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
      return { ...DEFAULT_SYSTEM_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_SYSTEM_SETTINGS };
}

export function saveSettings(settings: SystemSettings): void {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
  } catch {
    /* caller decides whether this is fatal */
  }
}

/** In-memory cache; the source of truth is the settings file. */
let systemSettings: SystemSettings = loadSettings();

export function getSystemSettings(): SystemSettings {
  return systemSettings;
}

export function updateSystemSettings(patch: Partial<SystemSettings>): SystemSettings {
  systemSettings = { ...systemSettings, ...patch };
  saveSettings(systemSettings);
  return systemSettings;
}
