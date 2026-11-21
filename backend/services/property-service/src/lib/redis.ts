import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";
import dotenv from "dotenv";
import path from "path";

// Load env here too: static imports run before server.ts calls dotenv.config().
dotenv.config({
  path: path.resolve(process.cwd(), process.env.ENV_FILE || ".env"),
  quiet: true,
});

type SetOptions = { ex?: number };

/** Minimal key/value API shared by both backends (matches the Upstash call style). */
export interface KeyValueStore {
  get<T = string>(key: string): Promise<T | null>;
  set(key: string, value: string, opts?: SetOptions): Promise<unknown>;
  del(key: string): Promise<number>;
}

function createIORedisStore(url: string): KeyValueStore {
  const client = new IORedis(url, {
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    ...(url.startsWith("rediss://") ? { tls: {} } : {}),
  });
  let lastLog = 0;
  client.on("error", (err) => {
    if (Date.now() - lastLog < 60_000) return;
    lastLog = Date.now();
    console.error("Redis (kv) error:", err.message);
  });
  return {
    get: async <T>(key: string) => (await client.get(key)) as T | null,
    set: (key, value, opts) =>
      opts?.ex ? client.set(key, value, "EX", opts.ex) : client.set(key, value),
    del: (key) => client.del(key),
  };
}

function createStore(): KeyValueStore {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) return createIORedisStore(redisUrl);

  // Legacy fallback: Upstash REST.
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Set REDIS_URL (e.g. redis://:password@127.0.0.1:6379) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN",
    );
  }
  const upstash = new UpstashRedis({ url, token, automaticDeserialization: false });
  return {
    get: <T>(key: string) => upstash.get<T>(key),
    set: (key, value, opts) =>
      opts?.ex ? upstash.set(key, value, { ex: opts.ex }) : upstash.set(key, value),
    del: (key) => upstash.del(key),
  };
}

export const redis = createStore();
