import express, { Request, Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import morgan from "morgan";
import dotenv from "dotenv";
import cors from "cors";
import { Socket } from "net";
import path from "path";
import {
  chatbotLimiter,
  globalApiLimiter,
  paymentLimiter,
} from "./middleware/rateLimiter";

dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

/** Drop accidental spaces so "http:// 192.168..." still reaches the service. */
const serviceUrl = (value: string | undefined) => String(value || "").replace(/\s+/g, "");

const PAYMENT_SERVICE_URL = serviceUrl(process.env.PAYMENT_SERVICE_URL);
const PROPERTY_SERVICE_URL = serviceUrl(process.env.PROPERTY_SERVICE_URL);
const USER_SERVICE_URL = serviceUrl(process.env.USER_SERVICE_URL);
const AI_SERVICE_URL = serviceUrl(process.env.AI_SERVICE_URL);
const TICKET_SERVICE_URL = serviceUrl(process.env.TICKET_SERVICE_URL);

if (!PAYMENT_SERVICE_URL || !PROPERTY_SERVICE_URL || !USER_SERVICE_URL || !AI_SERVICE_URL || !TICKET_SERVICE_URL) {
  console.error("❌ Missing service URL(s). Check your .env");
  process.exit(1);
}

const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS ?? 1);

app.set("trust proxy", TRUST_PROXY_HOPS);

// ===================== CORS CONFIG =====================

const allowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const isLocalDevOrigin = (origin: string) => {
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
    );
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // Postman / curl
      const clean = origin.replace(/\/+$/, "");
      if (!allowed.length || allowed.includes(clean) || isLocalDevOrigin(clean)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${clean}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-session-id",
      "x-request-monitor-id",
    ],
  })
);

app.use(morgan("dev"));

// ===================== RATE LIMITS =====================

app.use("/api/chatbot", chatbotLimiter);
app.use("/api/payments", paymentLimiter);
app.use("/api", globalApiLimiter);

// ===================== PROXY HELPER =====================

function proxy(serviceName: string, target: string, extras: Record<string, unknown> = {}) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: 120000,
    timeout: 120000,
    ...extras,

    // ✅ preserve full path like /api/users/location
    pathRewrite: (_path, req) => (req as any).originalUrl,

    on: {
      error(err: Error, req, res: Response | Socket) {
        console.error(`❌ ${serviceName} service error:`, err.message);
        if (res instanceof Socket) return;
        if (!res.headersSent) {
          res.status(502).json({
            error: `${serviceName} service down`,
            message:
              serviceName === "AI"
                ? "Propenu Assistant is not running on port 4006. Start backend/services/ai-service and try again."
                : `${serviceName} service is not reachable.`,
          });
        }
      },
    },
  });
}

// ===================== MICROSERVICE ROUTES =====================

// Long WhatsApp campaign / media routes (accept is fast; keep headroom for Meta validate)
app.use(
  "/api/users/whatsapp/send-whatsapp",
  proxy("USER", USER_SERVICE_URL, { proxyTimeout: 180000, timeout: 180000 }),
);
app.use(
  "/api/users/whatsapp/send-csv-bulk-whatsapp",
  proxy("USER", USER_SERVICE_URL, { proxyTimeout: 180000, timeout: 180000 }),
);

// Long-lived SSE for WhatsApp inbox realtime
app.use(
  "/api/users/whatsapp/inbox/stream",
  proxy("USER", USER_SERVICE_URL, { proxyTimeout: 0, timeout: 0 }),
);

// Meta webhook (Bizrow-compatible path → user-service)
app.use("/api/conversation-flow", proxy("USER", USER_SERVICE_URL));

app.use("/api/payments", proxy("PAYMENT", PAYMENT_SERVICE_URL));
app.use("/api/properties", proxy("PROPERTY", PROPERTY_SERVICE_URL));
app.use("/api/users", proxy("USER", USER_SERVICE_URL));
app.use("/api/chatbot", proxy("AI", AI_SERVICE_URL));
app.use("/api/tickets", proxy("TICKET", TICKET_SERVICE_URL));
app.use("/api/ticket-attachments", proxy("TICKET", TICKET_SERVICE_URL));
app.use("/api/ticket-categories", proxy("TICKET", TICKET_SERVICE_URL));
app.use("/api/ticket-comments", proxy("TICKET", TICKET_SERVICE_URL));
app.use("/api/ticket-dashboard", proxy("TICKET", TICKET_SERVICE_URL));
app.use("/api/ticket-departments", proxy("TICKET", TICKET_SERVICE_URL));


// ===================== SYSTEM ROUTES  =====================
app.get("/", (_req, res) => {
  res.json({ message: "✅ Gateway running" });
});

app.get("/health", async (_req: Request, res: Response) => {
  let aiReachable = false;

  try {
    const aiResponse = await fetch(`${AI_SERVICE_URL}/health`);
    aiReachable = aiResponse.ok;
  } catch {
    aiReachable = false;
  }

  res.json({
    ok: true,
    services: {
      payments: PAYMENT_SERVICE_URL,
      properties: PROPERTY_SERVICE_URL,
      users: USER_SERVICE_URL,
      ai: {
        url: AI_SERVICE_URL,
        reachable: aiReachable,
      },
      tickets: TICKET_SERVICE_URL,
    },
  });
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ===================== START SERVER  =====================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Gateway running on port ${PORT}`);
  console.log("Allowed origins:", allowed.length ? allowed : "(none)");
  console.log("Services:", {
    PAYMENT_SERVICE_URL,
    PROPERTY_SERVICE_URL,
    USER_SERVICE_URL,
    AI_SERVICE_URL,
    TICKET_SERVICE_URL,
  });
});
