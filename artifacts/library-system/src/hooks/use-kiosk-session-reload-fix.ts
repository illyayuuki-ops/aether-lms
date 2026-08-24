=== FIX #6 (Frontend): Preserve session on Ctrl+R reload ===
File: artifacts/library-system/src/hooks/use-kiosk-session.ts
(Add this to the beforeunload handler)

CHANGE the handleUnload function FROM:
```typescript
  useEffect(() => {
    if (!session) return;

    const handleUnload = () => {
      const currentSession = sessionRef.current;
      if (!currentSession) return;
      const blob = new Blob(
        [JSON.stringify({ sessionId: currentSession.sessionId, reason: "manual" })],
        { type: "application/json" }
      );
      navigator.sendBeacon("/api/sessions/logout", blob);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [session]);
```

TO:
```typescript
  useEffect(() => {
    if (!session) return;

    const handleUnload = () => {
      const currentSession = sessionRef.current;
      if (!currentSession) return;
      
      // Check if this is an intentional reload (Ctrl+R)
      const isReload = localStorage.getItem('kiosk_reload_in_progress') === 'true';
      if (isReload) {
        localStorage.removeItem('kiosk_reload_in_progress');
        // Keep session in localStorage so it resumes after reload
        return;
      }
      
      // Only send logout beacon if this is a real unload (tab close, navigation away, etc)
      const blob = new Blob(
        [JSON.stringify({ sessionId: currentSession.sessionId, reason: "manual" })],
        { type: "application/json" }
      );
      navigator.sendBeacon("/api/sessions/logout", blob);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [session]);
```
