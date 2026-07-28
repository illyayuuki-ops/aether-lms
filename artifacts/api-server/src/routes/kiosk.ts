import { Router, Request, Response, NextFunction } from "express";

const router = Router();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "library-admin-secret-token-2024";

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ") || auth.slice(7) !== ADMIN_TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

// Store all connected kiosk SSE clients
const kioskClients = new Map<string, Response>();

// ── SSE endpoint — each kiosk connects here on startup ──────────────────────
router.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket.remoteAddress
    || `unknown-${Date.now()}`;

  kioskClients.set(clientIp, res);
  res.write(`data: ${JSON.stringify({ type: "connected", clientId: clientIp })}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(keepAlive);
    kioskClients.delete(clientIp);
  });
});

// ── Broadcast lock/unlock to all or one kiosk ───────────────────────────────
router.post("/broadcast", requireAdmin, (req, res) => {
  const { command, targetIp } = req.body;

  if (!["lock", "unlock"].includes(command)) {
    return res.status(400).json({ error: "Invalid command." });
  }

  const message = `data: ${JSON.stringify({ type: command })}\n\n`;
  let sent = 0;

  if (targetIp) {
    const client = kioskClients.get(targetIp);
    if (client) { client.write(message); sent = 1; }
  } else {
    kioskClients.forEach((client) => { client.write(message); sent++; });
  }

  return res.json({ success: true, sent, total: kioskClients.size });
});

// ── How many kiosks are connected ───────────────────────────────────────────
router.get("/status", requireAdmin, (_req, res) => {
  res.json({ connected: kioskClients.size, clients: Array.from(kioskClients.keys()) });
});

export default router;
