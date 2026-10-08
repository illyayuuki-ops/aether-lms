; Aether LMS Kiosk — NSIS custom installer macro
; Writes default config.json to $APPDATA\Aether LMS Kiosk\config.json
; so the app works immediately after install under any Windows account.

; Server URL constant — update here if the admin PC LAN IP changes
!define KIOSK_SERVER_URL "http://172.16.50.47:3000"
!define KIOSK_EMERGENCY_PIN "260306"
!define KIOSK_AUTO_LAUNCH "true"

!macro customInstall
  ; Ensure the app data directory exists
  CreateDirectory "$APPDATA\Aether LMS Kiosk"

  ; Write config.json with server URL, emergency PIN, and auto-launch
  FileOpen $0 "$APPDATA\Aether LMS Kiosk\config.json" w
  FileWrite $0 '$\r$\n'
  FileWrite $0 '{$\r$\n'
  FileWrite $0 '  "serverUrl": "${KIOSK_SERVER_URL}",$\r$\n'
  FileWrite $0 '  "emergencyPin": "${KIOSK_EMERGENCY_PIN}",$\r$\n'
  FileWrite $0 '  "autoLaunch": ${KIOSK_AUTO_LAUNCH}$\r$\n'
  FileWrite $0 '}$\r$\n'
  FileClose $0
!macroend