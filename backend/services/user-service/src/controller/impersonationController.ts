import crypto from "crypto";
import { Response } from "express";
import mongoose from "mongoose";
import User from "../models/userModel";
import ImpersonationAudit from "../models/impersonationAuditModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import { generateToken } from "../utils/jwt";
import { getBuilderAccessForUser } from "../services/builderAccessService";
import {
  createExchangeCode,
  saveExchangeCode,
  consumeExchangeCode,
} from "../utils/impersonationStore";

const IMPERSONATION_TTL =
  (process.env.IMPERSONATION_TTL as `${number}m` | `${number}s`) || "15m";

const VIEWABLE_ROLES = new Set([
  "user",
  "builder",
  "builder_staff",
  "agent",
  "customer_care",
  "relationship_manager",
]);

function normalizeRole(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function redirectPathForRole(roleName: string): string {
  // Separate admin-access URLs (exact screens via frontend rewrite).
  if (roleName === "builder" || roleName === "builder_staff") {
    return "/admin-view/builder";
  }
  if (
    roleName === "agent" ||
    roleName === "customer_care" ||
    roleName === "relationship_manager"
  ) {
    return "/admin-view/agent";
  }
  return "/admin-view/owner";
}

function ttlSecondsFromEnv(): number {
  const raw = String(IMPERSONATION_TTL || "15m").trim();
  const match = raw.match(/^(\d+)(s|m|h)?$/i);
  if (!match) return 15 * 60;
  const n = Number(match[1]);
  const unit = (match[2] || "m").toLowerCase();
  if (unit === "h") return n * 3600;
  if (unit === "s") return n;
  return n * 60;
}

/**
 * SuperAdmin starts a short-lived read-only view-as session.
 * Returns a one-time exchange code (not the permanent user token).
 */
export const startImpersonation = async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = String(req.params.userId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    if (String(req.user?.sub) === targetUserId) {
      return res.status(400).json({
        message: "Cannot view-as your own Super Admin account",
      });
    }

    const target = await User.findById(targetUserId)
      .populate("roleId", "name permissions isActive")
      .lean();

    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }
    if (target.isActive === false) {
      return res.status(400).json({ message: "Target account is inactive" });
    }

    const roleDoc: any = target.roleId;
    const targetRoleName = normalizeRole(roleDoc?.name);
    if (!VIEWABLE_ROLES.has(targetRoleName)) {
      return res.status(400).json({
        message: `View-as is only available for builder, agent, or owner accounts (got: ${targetRoleName || "unknown"})`,
      });
    }
    if (roleDoc?.isActive === false) {
      return res.status(400).json({
        message: "Target user's role is deactivated",
      });
    }

    const builderAccess = await getBuilderAccessForUser({
      _id: target._id,
      roleName: roleDoc?.name,
    });

    const expiresInSec = ttlSecondsFromEnv();
    const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

    const payload: any = {
      sub: String(target._id),
      email: target.email,
      name: target.name,
      companyName: target.companyName,
      roleId: roleDoc ? String(roleDoc._id) : undefined,
      roleName: roleDoc?.name,
      builderAccess,
      accountStatus: target.accountStatus,
      impersonation: true,
      readOnly: true,
      impersonatorSub: String(req.user?.sub),
      impersonatorName: req.user?.name || "Super Admin",
    };

    if (target.phone) {
      payload.phone = Number(target.phone);
    }

    const token = generateToken(payload, IMPERSONATION_TTL);
    const exchangeCode = createExchangeCode();
    const redirectPath = redirectPathForRole(targetRoleName);

    await saveExchangeCode(exchangeCode, {
      token,
      redirectPath,
      targetUserId: String(target._id),
      targetName: String(target.name || ""),
      targetRoleName: String(roleDoc?.name || targetRoleName),
      impersonatorSub: String(req.user?.sub),
      expiresAt,
    });

    await ImpersonationAudit.create({
      action: "start",
      impersonatorId: String(req.user?.sub),
      impersonatorName: req.user?.name,
      targetUserId: String(target._id),
      targetName: target.name,
      targetRoleName: roleDoc?.name,
      meta: {
        expiresAt,
        redirectPath,
        exchangeId: crypto
          .createHash("sha256")
          .update(exchangeCode)
          .digest("hex")
          .slice(0, 12),
      },
    });

    return res.status(200).json({
      message: "Read-only view-as session created",
      exchangeCode,
      redirectPath,
      expiresAt,
      expiresInSeconds: expiresInSec,
      target: {
        id: String(target._id),
        name: target.name,
        roleName: roleDoc?.name,
      },
      // Never return a permanent user login token here.
    });
  } catch (err: any) {
    console.error("startImpersonation error:", err);
    return res.status(500).json({
      message: err?.message || "Failed to start view-as session",
    });
  }
};

/**
 * Web app redeems a one-time code for the short-lived view-as JWT.
 * Public endpoint — code is the secret (60s TTL, single use).
 */
export const exchangeImpersonation = async (req: AuthRequest, res: Response) => {
  try {
    const code = String(req.body?.code || req.body?.exchangeCode || "").trim();
    if (!code || code.length < 16) {
      return res.status(400).json({ message: "Invalid or missing exchange code" });
    }

    const payload = await consumeExchangeCode(code);
    if (!payload) {
      return res.status(400).json({
        message: "Exchange code expired or already used",
        code: "IMPERSONATION_EXCHANGE_INVALID",
      });
    }

    await ImpersonationAudit.create({
      action: "exchange",
      impersonatorId: payload.impersonatorSub,
      targetUserId: payload.targetUserId,
      targetName: payload.targetName,
      targetRoleName: payload.targetRoleName,
      meta: { expiresAt: payload.expiresAt },
    });

    return res.status(200).json({
      message: "View-as session ready",
      token: payload.token,
      redirectPath: payload.redirectPath,
      expiresAt: payload.expiresAt,
      target: {
        id: payload.targetUserId,
        name: payload.targetName,
        roleName: payload.targetRoleName,
      },
      impersonation: {
        active: true,
        readOnly: true,
        impersonatorSub: payload.impersonatorSub,
      },
    });
  } catch (err: any) {
    console.error("exchangeImpersonation error:", err);
    return res.status(500).json({
      message: err?.message || "Failed to exchange view-as code",
    });
  }
};

/** Audit + acknowledge exit from a view-as session (client clears cookie). */
export const stopImpersonation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.impersonation) {
      return res.status(400).json({
        message: "No active view-as session on this token",
      });
    }

    await ImpersonationAudit.create({
      action: "stop",
      impersonatorId: String(req.user.impersonatorSub || ""),
      impersonatorName: req.user.impersonatorName,
      targetUserId: String(req.user.sub),
      targetName: req.user.name,
      targetRoleName: req.user.roleName,
    });

    return res.status(200).json({
      message: "View-as session ended",
      impersonatorSub: req.user.impersonatorSub,
    });
  } catch (err: any) {
    return res.status(500).json({
      message: err?.message || "Failed to stop view-as session",
    });
  }
};
