/** Bridge between the React kiosk UI and the Electron shell (when running as .exe). */

export interface KioskSessionInfo {
  name?: string;
  computerNumber?: number;
}

declare global {
  interface Window {
    aetherKiosk?: {
      isElectron: boolean;
      setLocked: (locked: boolean) => void;
      setDesktopMode: (enabled: boolean, session?: KioskSessionInfo) => void;
      onEndSession?: (cb: () => void) => () => void;
      onDesktopModeChanged?: (cb: (enabled: boolean) => void) => () => void;
    };
  }
}

export function isElectronKiosk(): boolean {
  return Boolean(window.aetherKiosk?.isElectron);
}

export function setKioskLocked(locked: boolean): void {
  window.aetherKiosk?.setLocked(locked);
}

export function setKioskDesktopMode(enabled: boolean, session?: KioskSessionInfo): void {
  window.aetherKiosk?.setDesktopMode(enabled, session);
}

/** Fired when the floating badge's "End Session" button is clicked. Returns an unsubscribe fn. */
export function onKioskEndSession(cb: () => void): () => void {
  return window.aetherKiosk?.onEndSession?.(cb) ?? (() => {});
}

/** Fired when the Electron shell enters/leaves desktop mode. Returns an unsubscribe fn. */
export function onKioskDesktopModeChanged(cb: (enabled: boolean) => void): () => void {
  return window.aetherKiosk?.onDesktopModeChanged?.(cb) ?? (() => {});
}
