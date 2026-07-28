/** Bridge between the React kiosk UI and the Electron shell (when running as .exe). */

declare global {
  interface Window {
    aetherKiosk?: {
      isElectron: boolean;
      setLocked: (locked: boolean) => void;
      setDesktopMode: (enabled: boolean) => void;
    };
  }
}

export function isElectronKiosk(): boolean {
  return Boolean(window.aetherKiosk?.isElectron);
}

export function setKioskLocked(locked: boolean): void {
  window.aetherKiosk?.setLocked(locked);
}

export function setKioskDesktopMode(enabled: boolean): void {
  window.aetherKiosk?.setDesktopMode(enabled);
}
