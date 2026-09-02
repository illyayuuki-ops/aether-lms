import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "library-jwt-secret-change-me";

declare module "express" {
  interface Request {
    adminId?: number;
    adminRole?: string;
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { adminId: number; role: string };
    req.adminId = payload.adminId;
    req.adminRole = payload.role;
    next();
  } catch {
    res.status(401).json({ error: "token_expired" });
  }
}

// Store all connected kiosk SSE clients
const kioskClients = new Map<string, Response[]>();

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

  const clients = kioskClients.get(clientIp) ?? [];
  clients.push(res);
  kioskClients.set(clientIp, clients);

  res.write(`data: ${JSON.stringify({ type: "connected", clientId: clientIp })}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(keepAlive);
    const current = kioskClients.get(clientIp) ?? [];
    const filtered = current.filter((c) => c !== res);
    if (filtered.length === 0) {
      kioskClients.delete(clientIp);
    } else {
      kioskClients.set(clientIp, filtered);
    }
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
    const clients = kioskClients.get(targetIp) ?? [];
    for (const client of clients) {
      if (!client.destroyed) { client.write(message); sent++; }
    }
  } else {
    kioskClients.forEach((clients) => {
      for (const client of clients) {
        if (!client.destroyed) { client.write(message); sent++; }
      }
    });
  }

  return res.json({ success: true, sent, total: kioskClients.size });
});

// ── How many kiosks are connected ───────────────────────────────────────────
router.get("/status", requireAdmin, (_req, res) => {
  const clients = Array.from(kioskClients.entries()).map(([ip, conns]) => ({
    ip,
    connections: conns.length,
  }));
  const total = clients.reduce((sum, c) => sum + c.connections, 0);
  res.json({ connected: total, clients });
});

export default router;
