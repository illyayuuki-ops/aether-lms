import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// settings.ts reads SYSTEM_SETTINGS_FILE at import time, so point it at a temp
// file before importing the module.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aether-settings-"));
const settingsFile = path.join(tmpDir, "system-settings.json");
process.env.SYSTEM_SETTINGS_FILE = settingsFile;

const { loadSettings, saveSettings, DEFAULT_SYSTEM_SETTINGS } = await import("./settings");

describe("settings", () => {
  beforeEach(() => {
    fs.rmSync(settingsFile, { force: true });
  });

  afterEach(() => {
    fs.rmSync(settingsFile, { force: true });
  });

  it("returns defaults when no file exists", () => {
    expect(loadSettings()).toEqual(DEFAULT_SYSTEM_SETTINGS);
  });

  it("round-trips a saved value", () => {
    saveSettings({ ...DEFAULT_SYSTEM_SETTINGS, inactivityLimitMinutes: 25 });
    expect(loadSettings().inactivityLimitMinutes).toBe(25);
  });

  it("merges unknown/missing keys with defaults", () => {
    fs.writeFileSync(settingsFile, JSON.stringify({ totalComputers: 42 }), "utf8");
    const loaded = loadSettings();
    expect(loaded.totalComputers).toBe(42);
    expect(loaded.sessionTimeLimitMinutes).toBe(DEFAULT_SYSTEM_SETTINGS.sessionTimeLimitMinutes);
  });

  it("falls back to defaults on corrupt JSON", () => {
    fs.writeFileSync(settingsFile, "{ not valid json", "utf8");
    expect(loadSettings()).toEqual(DEFAULT_SYSTEM_SETTINGS);
  });
});
