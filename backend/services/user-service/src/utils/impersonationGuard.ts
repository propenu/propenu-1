import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import ImpersonationAudit from "../models/impersonationAuditModel";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Paths allowed even during read-only impersonation (session lifecycle). */
const WRITE_ALLOWLIST_PREFIXES = [
  "/api/users/auth/impersonate/stop",
  "/api/users/auth/impersonate/exchange",
];

export function isImpersonationReadOnly(user?: {
  impersonation?: boolean;
  readOnly?: boolean;
}): boolean {
  return Boolean(user?.impersonation && user?.readOnly);
}

export function isSafeHttpMethod(method?: string): boolean {
  return SAFE_METHODS.has(String(method || "").toUpperCase());
}

export function isImpersonationWriteAllowlisted(path?: string): boolean {
  const p = String(path || "");
  if (p.includes("/impersonate/stop") || p.includes("/impersonate/exchange")) {
    return true;
  }
  return WRITE_ALLOWLIST_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`),
  );
}

/**
 * Blocks mutating requests while SuperAdmin is in read-only view-as.
 * Call after req.user is set. Returns true if the response was already sent.
 */
export function rejectImpersonationWrites(
  req: AuthRequest,
  res: Response,
): boolean {
  if (!isImpersonationReadOnly(req.user)) return false;
  if (isSafeHttpMethod(req.method)) return false;
  if (isImpersonationWriteAllowlisted(req.originalUrl || req.path)) {
    return false;
  }

  void ImpersonationAudit.create({
    action: "blocked_write",
    impersonatorId: String(req.user?.impersonatorSub || ""),
    impersonatorName: req.user?.impersonatorName,
    targetUserId: String(req.user?.sub || ""),
    targetName: req.user?.name,
    targetRoleName: req.user?.roleName,
    meta: {
      method: req.method,
      path: req.originalUrl || req.path,
    },
  }).catch(() => undefined);

  res.status(403).json({
    message:
      "Read-only view-as session: changes are blocked. Exit view-as to continue as Super Admin.",
    code: "IMPERSONATION_READ_ONLY",
  });
  return true;
}
