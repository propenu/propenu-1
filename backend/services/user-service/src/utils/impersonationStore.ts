import crypto from "crypto";
import { redis } from "../lib/redis";

const EXCHANGE_TTL_SECONDS = Number(
  process.env.IMPERSONATION_EXCHANGE_TTL_SECONDS || 60,
);

type ExchangePayload = {
  token: string;
  redirectPath: string;
  targetUserId: string;
  targetName: string;
  targetRoleName: string;
  impersonatorSub: string;
  expiresAt: string;
};

const memoryCodes = new Map<
  string,
  { payload: ExchangePayload; expiresAt: number }
>();

function exchangeKey(code: string) {
  return `impersonate:exchange:${code}`;
}

export function createExchangeCode(): string {
  return crypto.randomBytes(24).toString("hex");
}

export async function saveExchangeCode(
  code: string,
  payload: ExchangePayload,
): Promise<void> {
  const key = exchangeKey(code);
  const serialized = JSON.stringify(payload);
  memoryCodes.set(key, {
    payload,
    expiresAt: Date.now() + EXCHANGE_TTL_SECONDS * 1000,
  });
  try {
    await redis.set(key, serialized, { ex: EXCHANGE_TTL_SECONDS });
  } catch {
    // Memory fallback already set
  }
}

export async function consumeExchangeCode(
  code: string,
): Promise<ExchangePayload | null> {
  const key = exchangeKey(code);
  let raw: string | null = null;

  try {
    raw = (await redis.get<string | null>(key)) ?? null;
    if (raw) await redis.del(key);
  } catch {
    raw = null;
  }

  const memory = memoryCodes.get(key);
  memoryCodes.delete(key);

  if (!raw && memory) {
    if (memory.expiresAt <= Date.now()) return null;
    return memory.payload;
  }

  if (!raw) return null;

  try {
    return JSON.parse(raw) as ExchangePayload;
  } catch {
    return null;
  }
}
