; installer.nsh — Aether LMS Kiosk NSIS custom install script
;
; Included via the nsis "include" option in package.json. Electron-builder
; calls customInstall() after the app files are copied and before the
; shortcut/finish page, and customUnInstall() during uninstall.
;
; The kiosk reads its runtime config from
;   %APPDATA%\Aether LMS Kiosk\config.json
; (see src/main.js loadConfig / earlyPaths). This script writes that file at
; install time so student PCs work with zero manual PowerShell — the admin
; just runs the installer.
;
; The server IP is overridable without rebuilding: drop a text file named
; server-ip.txt next to the installer exe and its first line is used as the
; serverUrl. If the file is absent, the baked-in default is used.
;
; All helpers are NSIS preprocessor macros (not Functions) so that
; !ifmacrodef customInstall in electron-builder's installSection.nsh sees a
; real macro and the compiler does not warn about unreferenced functions.

!define DEFAULT_SERVER_URL "http://172.16.50.47:3000"
!define DEFAULT_EMERGENCY_PIN ""

!define KIOSK_APPDATA_DIR "$APPDATA\Aether LMS Kiosk"
!define KIOSK_CONFIG_FILE "${KIOSK_APPDATA_DIR}\config.json"
!define SERVER_IP_FILE "$EXEDIR\server-ip.txt"

; ─── Trim trailing CR / LF from a string ─────────────────────────────────────
; Expects the string on the stack, returns the trimmed string on the stack.
; Pure built-in NSIS — no ${TrimNewLines} macro (not always available).
; FileRead appends at most one "\r\n" at the end of the line it returns, so a
; fixed two-pass strip is enough and needs no labels (which would collide
; across macro expansions).
!macro TrimTrailing
  Exch $0
  StrCpy $1 $0 1 -1
  StrCmp $1 "$\r" 0 +2
    StrCpy $0 $0 "" -1
  StrCpy $1 $0 1 -1
  StrCmp $1 "$\n" 0 +2
    StrCpy $0 $0 "" -1
  Exch $0
!macroend

; ─── Read an optional server-ip.txt next to the installer ────────────────────
; Pushes the override URL on the stack, or "" if the file is missing/invalid
; (the caller then substitutes the baked-in default). Written label-free so
; the macro can expand more than once without duplicate-label errors.
!macro ReadServerUrl
  Push $0
  Push $1
  Push $2
  StrCpy $0 ""
  IfFileExists "${SERVER_IP_FILE}" 0 +4
    FileOpen $1 "${SERVER_IP_FILE}" "r"
    StrCmp $1 "" 0 +3
      FileRead $1 $2
      FileClose $1
      Push $2
      !insertmacro TrimTrailing
      Pop $0
  ; Reject anything that doesn't start with http:// or https://
  ; (StrCmp is exact-match only, so compare the first 7/8 chars.)
  StrCpy $1 $0 7
  StrCmp $1 "http://" 0 +3
    Goto keep
  StrCpy $1 $0 8
  StrCmp $1 "https://" 0 +2
    Goto keep
  StrCpy $0 ""
keep:
  Pop $2
  Pop $1
  Exch $0
!macroend

; ─── Write %APPDATA%\Aether LMS Kiosk\config.json ────────────────────────────
!macro WriteKioskConfig
  Push $0
  Push $1
  Push $2
  ; Ensure the appdata directory exists (CreateDirectory returns 0 on success)
  CreateDirectory "${KIOSK_APPDATA_DIR}"
  ; Read the server URL (override file or default)
  !insertmacro ReadServerUrl
  Pop $0
  StrCmp $0 "" 0 +2
    StrCpy $0 "${DEFAULT_SERVER_URL}"
  ; $1 = emergencyPin
  StrCpy $1 "${DEFAULT_EMERGENCY_PIN}"
  ; Build the JSON payload. NSIS FileWrite needs (handle, text).
  FileOpen  $2 "${KIOSK_CONFIG_FILE}" "w"
  StrCmp $2 "" 0 +2
    Goto WriteDone
  FileWrite $2 '{"serverUrl":"'
  FileWrite $2 $0
  FileWrite $2 '","emergencyPin":"'
  FileWrite $2 $1
  FileWrite $2 '","autoLaunch":true}'
  FileClose $2
WriteDone:
  Pop $2
  Pop $1
  Pop $0
!macroend

; ─── Install-time hook (electron-builder's installSection.nsh uses
; ─── !ifmacrodef customInstall, so this must be a preprocessor macro) ────────
!macro customInstall
  !insertmacro WriteKioskConfig
!macroend

; ─── Uninstall-time hook (uninstaller.nsh uses !ifmacrodef customUnInstall)
; ─── deleteAppDataOnUninstall (set in package.json) already removes
; ─── %APPDATA%\Aether LMS Kiosk, so config.json is gone automatically. This
; ─── hook is intentionally a no-op so we never accidentally preserve a stale
; ─── config across a reinstall on a different network.
!macro customUnInstall
  ; No-op: deleteAppDataOnUninstall handles cleanup.
!macroend