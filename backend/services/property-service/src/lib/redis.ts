import { Redis } from "@upstash/redis";
import dotenv from "dotenv";
import path from "path";

// Load credentials here as well as in server.ts. Static imports are evaluated
// before the server module body, so its dotenv.config() runs too late for this
// module's Redis constructor.
dotenv.config({
  path: path.resolve(process.cwd(), process.env.ENV_FILE || ".env"),
  quiet: true,
});

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error(
    "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured",
  );
}

export const redis = new Redis({
  url,
  token,
});
