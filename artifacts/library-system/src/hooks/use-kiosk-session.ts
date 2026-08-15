import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import { setKioskLocked } from "@/lib/electron-kiosk";

const SESSION_STORAGE_KEY = "kiosk_active_session";

const DEFAULT_INACTIVITY_LIMIT_MS = 5 * 60 * 1000;
const DEFAULT_WARNING_BEFORE_MS   = 60 * 1000;
const HEARTBEAT_INTERVAL_MS       = 10 * 1000;

export interface SessionResponse {
  sessionId: number;
  studentId: string;
  name: string;
  degree: string;
  yearLevel: string;
  computerNumber: number;
  researchTopic?: string | null;
  loginTime: string;
  timeLimitMinutes: number;
  inactivityLimitMinutes: number;
  mustChangePassword?: boolean;
}

export function useKioskSession() {
  const [session, setSession] = useState<SessionResponse | null>(() => {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isWarning, setIsWarning]           = useState(false);
  const [isLoggingOut, setIsLoggingOut]     = useState(false);

  const sessionRef       = useRef<SessionResponse | null>(session);
  const lastActivityRef  = useRef<number>(Date.now());
  const lastHeartbeatRef = useRef<number>(Date.now());
  const isWarningRef     = useRef(false);
  const isLoggingOutRef  = useRef(false);

  const { toast } = useToast();

  useEffect(() => {
    sessionRef.current = session;
    // Tell Electron shell: locked = login screen, unlocked = student is logged in
    setKioskLocked(!session);
  }, [session]);

  // ── Activity tracking ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      if (isWarningRef.current) {
        isWarningRef.current = false;
        setIsWarning(false);
      }
    };

    window.addEventListener("mousemove",  updateActivity);
    window.addEventListener("keydown",    updateActivity);
    window.addEventListener("click",      updateActivity);
    window.addEventListener("touchstart", updateActivity);

    return () => {
      window.removeEventListener("mousemove",  updateActivity);
      window.removeEventListener("keydown",    updateActivity);
      window.removeEventListener("click",      updateActivity);
      window.removeEventListener("touchstart", updateActivity);
    };
  }, [session]);

  // ── Auto-logout when browser/tab is closed ────────────────────────────────
  // FIX: uses sendBeacon so the request fires even during page unload.
  // This fixes sessions continuing to count after closing the browser.
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

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(
    async (reason: "manual" | "inactivity" | "time_limit" = "manual") => {
      const currentSession = sessionRef.current;
      if (!currentSession)        return;
      if (isLoggingOutRef.current) return;

      isLoggingOutRef.current = true;
      setIsLoggingOut(true);

      try {
        await fetch("/api/sessions/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: currentSession.sessionId, reason }),
        });
      } catch {
        // Ghost sweeper will close it server-side if fetch fails
      } finally {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        sessionRef.current      = null;
        isLoggingOutRef.current = false;
        setSession(null);
        setElapsedSeconds(0);
        setIsWarning(false);
        setIsLoggingOut(false);

        const messages = {
          manual:     "You have been logged out successfully.",
          inactivity: "Session ended due to inactivity.",
          time_limit: "Maximum session time reached.",
        };
        toast({
          title:       "Session Ended",
          description: messages[reason],
          variant:     reason === "manual" ? "default" : "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Main session loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) {
      setElapsedSeconds(0);
      setIsWarning(false);
      return;
    }

    const loginTimeMs       = new Date(session.loginTime).getTime();
    const inactivityLimitMs = (session.inactivityLimitMinutes ?? 5) * 60 * 1000;
    const warningMs         = inactivityLimitMs - DEFAULT_WARNING_BEFORE_MS;

    lastActivityRef.current  = Date.now();
    lastHeartbeatRef.current = Date.now();
    isLoggingOutRef.current  = false;

    const interval = setInterval(() => {
      if (!sessionRef.current) {
        clearInterval(interval);
        return;
      }

      const now        = Date.now();
      const elapsed    = Math.floor((now - loginTimeMs) / 1000);
      const inactiveMs = now - lastActivityRef.current;

      setElapsedSeconds(elapsed);

      if (inactiveMs >= inactivityLimitMs && !isLoggingOutRef.current) {
        clearInterval(interval);
        handleLogout("inactivity");
        return;
      }

      if (inactiveMs >= warningMs && !isWarningRef.current) {
        isWarningRef.current = true;
        setIsWarning(true);
      } else if (inactiveMs < warningMs && isWarningRef.current) {
        isWarningRef.current = false;
        setIsWarning(false);
      }

      // Heartbeat — check if session was force-ended by admin
      if (now - lastHeartbeatRef.current >= HEARTBEAT_INTERVAL_MS && sessionRef.current) {
        lastHeartbeatRef.current = now;

        fetch("/api/sessions/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionRef.current.sessionId }),
        })
          .then((r) => r.json())
          .then((data) => {
            // If server says session is no longer active, force logout
            if (data?.active === false || data?.error === "not_found" || data?.error === "session_ended") {
              clearInterval(interval);
              localStorage.removeItem(SESSION_STORAGE_KEY);
              sessionRef.current = null;
              isLoggingOutRef.current = false;
              setSession(null);
              setElapsedSeconds(0);
              setIsWarning(false);
              setIsLoggingOut(false);
              toast({
                title: "Session Ended",
                description: "Your session was ended by the librarian.",
                variant: "destructive",
              });
            }
          })
          .catch(() => {});
      }
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId]);

  const handleLogin = (newSession: SessionResponse) => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
    sessionRef.current      = newSession;
    lastActivityRef.current  = Date.now();
    lastHeartbeatRef.current = Date.now();
    isLoggingOutRef.current  = false;
    setSession(newSession);
    setElapsedSeconds(0);
    setIsWarning(false);
  };

  return {
    session,
    elapsedSeconds,
    isWarning,
    login:        handleLogin,
    logout:       () => handleLogout("manual"),
    isLoggingOut,
  };
}