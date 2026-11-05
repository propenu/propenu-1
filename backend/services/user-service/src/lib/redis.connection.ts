import dotenv from "dotenv";
import type { RedisOptions } from "ioredis";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), process.env.ENV_FILE || ".env"),
  quiet: true,
});

function wantsTls(hostname: string, protocol: string): boolean {
  if (protocol === "rediss:") return true;
  if (String(process.env.REDIS_TLS || "").toLowerCase() === "true") return true;
  // Upstash (and similar) require TLS even when URL is redis://
  const host = hostname.toLowerCase();
  return host.includes("upstash.io") || host.includes("redis.cloud");
}

const QUOTA_RETRY_MS = 5 * 60 * 1000;
const MAX_RECONNECT_DELAY_MS = 5000;
const ERROR_LOG_INTERVAL_MS = 60 * 1000;
let lastQuotaErrorAt = 0;
let lastQuotaLogAt = 0;
const lastErrorLogAt = new Map<string, number>();

function isQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || "");
  return message.includes("max requests limit");
}

/** Clears on its own once no quota error has been seen for QUOTA_RETRY_MS. */
export function isRedisQuotaPaused(): boolean {
  return lastQuotaErrorAt > 0 && Date.now() - lastQuotaErrorAt < QUOTA_RETRY_MS;
}

/** One line per message per minute. Stops the reconnect loop from dumping the BullMQ script. */
export function noteRedisError(err: unknown) {
  const now = Date.now();
  if (!isQuotaError(err)) {
    const message = err instanceof Error ? err.message : String(err || "Redis error");
    if (now - (lastErrorLogAt.get(message) || 0) < ERROR_LOG_INTERVAL_MS) return;
    lastErrorLogAt.set(message, now);
    console.error("Redis error:", message);
    return;
  }
  lastQuotaErrorAt = now;
  if (now - lastQuotaLogAt < QUOTA_RETRY_MS) return;
  lastQuotaLogAt = now;
  console.warn(
    "Redis paused: Upstash monthly request limit is used up. Workers will retry in 5 minutes.",
  );
}

export function bindRedisErrors(client: {
  on(event: "error", listener: (err: Error) => void): void;
}) {
  client.on("error", (err) => noteRedisError(err));
}

/** Long wait only while Upstash is over quota; otherwise reconnect within 5s. */
function retryStrategy(times: number): number {
  if (isRedisQuotaPaused()) return QUOTA_RETRY_MS;
  return Math.min(times * 1000, MAX_RECONNECT_DELAY_MS);
}

// Local campaigns use REDIS_URL. Upstash queue traffic stays off while that database is over its monthly limit.

/** BullMQ requires maxRetriesPerRequest: null or the worker exits on start. */
const buildRedisConnection = (): RedisOptions => {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (redisUrl) {
    const parsed = new URL(redisUrl);

    if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
      throw new Error("REDIS_URL must start with redis:// or rediss://");
    }

    const useTls = wantsTls(parsed.hostname, parsed.protocol);

    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 15000,
      keepAlive: 10000,
      retryStrategy,
      ...(parsed.username
        ? { username: decodeURIComponent(parsed.username) }
        : {}),
      ...(parsed.password
        ? { password: decodeURIComponent(parsed.password) }
        : {}),
      ...(useTls ? { tls: {} } : {}),
    };
  }

  const host = process.env.REDIS_HOST || "127.0.0.1";
  const useTls =
    String(process.env.REDIS_TLS || "").toLowerCase() === "true" ||
    wantsTls(host, "redis:");

  return {
    host,
    port: Number(process.env.REDIS_PORT || 6379),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 15000,
    keepAlive: 10000,
    retryStrategy,
    ...(process.env.REDIS_USERNAME
      ? { username: process.env.REDIS_USERNAME }
      : {}),
    ...(process.env.REDIS_PASSWORD
      ? { password: process.env.REDIS_PASSWORD }
      : {}),
    ...(useTls ? { tls: {} } : {}),
  };
};

export const redisConnection = buildRedisConnection();

export function describeRedisTarget(): string {
  const host =
    (redisConnection as any).host ||
    process.env.REDIS_HOST ||
    "unknown";
  const tls = Boolean((redisConnection as any).tls);
  return `${host} (tls=${tls ? "on" : "off"})`;
}
