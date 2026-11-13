import crypto from "crypto";
import { redis } from "../lib/redis";

const OTP_LENGTH = Number(process.env.OTP_CODE_LENGTH || 4);
const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS || 300);
const VERIFIED_TTL_SECONDS = Number(
  process.env.LEAD_VERIFIED_TTL_SECONDS || 900,
);
const OTP_HASH_SECRET = process.env.OTP_HASH_SECRET || "dev-secret";

const otpKey = (projectId: string, phone: string) =>
  `lead_otp:${projectId}:${phone}`;

const verifiedKey = (projectId: string, phone: string) =>
  `lead_verified:${projectId}:${phone}`;

const hashOtp = (otp: string) =>
  crypto.createHmac("sha256", OTP_HASH_SECRET).update(otp).digest("hex");

export const normalizeLeadPhone = (value?: string | null) =>
  String(value || "").replace(/[^\d+]/g, "").trim();

export const generateLeadOtp = () => {
  const upperBound = 10 ** OTP_LENGTH;
  return String(crypto.randomInt(0, upperBound)).padStart(OTP_LENGTH, "0");
};

export const saveLeadOtp = async (
  projectId: string,
  phone: string,
  otp: string,
) => {
  await redis.set(otpKey(projectId, phone), hashOtp(otp), {
    ex: OTP_TTL_SECONDS,
  });
};

export const verifyLeadOtp = async (
  projectId: string,
  phone: string,
  otp: string,
) => {
  const key = otpKey(projectId, phone);
  const stored = await redis.get<string | null>(key);

  if (!stored) {
    return { valid: false as const, reason: "expired" as const };
  }

  if (stored !== hashOtp(otp)) {
    return { valid: false as const, reason: "incorrect" as const };
  }

  await redis.del(key);
  await redis.set(verifiedKey(projectId, phone), "1", {
    ex: VERIFIED_TTL_SECONDS,
  });

  return { valid: true as const };
};

export const consumeVerifiedLeadPhone = async (
  projectId: string,
  phone: string,
) => {
  const key = verifiedKey(projectId, phone);
  const verified = await redis.get<string | null>(key);

  if (!verified) return false;

  await redis.del(key);
  return true;
};
