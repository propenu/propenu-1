import dotenv from "dotenv";
import type { RedisOptions } from "ioredis";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), process.env.ENV_FILE || ".env"),
  quiet: true,
});

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

/** BullMQ requires the Upstash TLS/TCP URL; its REST API cannot run BullMQ scripts. */
const buildRedisConnection = (): RedisOptions => {
  // Keep queue traffic on its own database so worker polling cannot consume
  // the REST database's quota. Require the dedicated setting to prevent
  // accidentally reconnecting BullMQ to the shared REST database.
  const redisUrl = process.env.UPSTASH_QUEUE_REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error(
      "UPSTASH_QUEUE_REDIS_URL is required for BullMQ. Set it to a dedicated Upstash rediss:// TCP URL; UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are REST-only.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error("UPSTASH_QUEUE_REDIS_URL must be a valid Upstash rediss:// TCP URL");
  }

  if (parsed.protocol !== "rediss:") {
    throw new Error("UPSTASH_QUEUE_REDIS_URL must use rediss:// for Upstash TLS connections");
  }
  if (!parsed.hostname.toLowerCase().endsWith(".upstash.io")) {
    throw new Error("UPSTASH_QUEUE_REDIS_URL must point to an Upstash .upstash.io endpoint");
  }

  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  if (restUrl) {
    let restHost = "";
    try {
      restHost = new URL(restUrl).hostname.toLowerCase();
    } catch {
      // The REST client validates its own URL; don't expose its value here.
    }
    if (restHost && restHost === parsed.hostname.toLowerCase()) {
      throw new Error(
        "UPSTASH_QUEUE_REDIS_URL must use a separate Upstash database from UPSTASH_REDIS_REST_URL",
      );
    }
  }

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
    tls: {},
  };
};

export const redisConnection = buildRedisConnection();

export function describeRedisTarget(): string {
  return `${(redisConnection as any).host} (tls=on)`;
}
