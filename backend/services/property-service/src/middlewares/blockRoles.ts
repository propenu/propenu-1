import { NextFunction, Response } from "express";
import { AuthRequest } from "./authMiddleware";

const normalizeRoleName = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export function blockRoles(blockedRoles: string[], message: string) {
  const blocked = new Set(blockedRoles.map(normalizeRoleName));

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const roleName = normalizeRoleName(req.user?.roleName);

    if (roleName && blocked.has(roleName)) {
      return res.status(403).json({
        success: false,
        code: "ROLE_NOT_ALLOWED",
        message,
      });
    }

    return next();
  };
}

export const blockBuilderPropertyPosting = blockRoles(
  ["builder", "builder_staff"],
  "Builder accounts can post featured projects only. Please use the project posting flow.",
);
