import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import User from "../../../user-service/src/models/userModel";
import Role from "../../../user-service/src/models/roleModel";
import { verifyToken } from "../utils/jwt";
import { JwtUserPayload } from "../types/auth";

export interface AuthRequest extends Request {
  user?: JwtUserPayload & { id: string };
}

const normalizePermission = (value: unknown) => String(value || "").trim().toLowerCase();

const normalizePermissions = (permissions: unknown) =>
  Array.isArray(permissions)
    ? [...new Set(permissions.map(normalizePermission).filter(Boolean))]
    : [];

/**
 * Prefer live role permissions from DB so Super Admin permission edits
 * apply immediately (JWT can still hold an older permissions snapshot).
 */
async function resolveLiveAccess(decoded: JwtUserPayload) {
  let roleName = decoded.roleName;
  let permissions = normalizePermissions(decoded.permissions);
  let liveRoleId = decoded.roleId ? String(decoded.roleId) : "";

  if (decoded.sub && mongoose.Types.ObjectId.isValid(decoded.sub)) {
    try {
      const activeUser = await User.findById(decoded.sub).select("roleId isActive").lean();
      if (activeUser?.isActive === false) {
        return { error: { status: 401, message: "Account is no longer active" } as const };
      }
      if (activeUser?.roleId) {
        liveRoleId = String(activeUser.roleId);
      }
    } catch {
      // Keep JWT roleId.
    }
  }

  if (liveRoleId && mongoose.Types.ObjectId.isValid(liveRoleId)) {
    const currentRole = await Role.findById(liveRoleId).select("name permissions isActive").lean();
    if (currentRole) {
      if ((currentRole as any).isActive === false) {
        return {
          error: {
            status: 403,
            message:
              "This role is deactivated. Dashboard access is blocked until a Super Admin activates the role again.",
            code: "ROLE_DEACTIVATED",
          } as const,
        };
      }
      roleName = String(currentRole.name);
      permissions = normalizePermissions(currentRole.permissions);
    }
  }

  return { roleName, permissions };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token missing" });
  }

  try {
    const decoded = verifyToken(token);
    const resolved = await resolveLiveAccess(decoded);

    if ("error" in resolved && resolved.error) {
      return res.status(resolved.error.status).json({
        message: resolved.error.message,
        ...(resolved.error.code ? { code: resolved.error.code } : {}),
      });
    }

    const { roleName, permissions } = resolved as {
      roleName: JwtUserPayload["roleName"];
      permissions: string[];
    };

    const user = {
      ...decoded,
      roleName,
      permissions,
      id: decoded.sub,
      impersonation: Boolean(decoded.impersonation),
      readOnly: Boolean(decoded.readOnly),
      ...(decoded.impersonatorSub
        ? { impersonatorSub: decoded.impersonatorSub }
        : {}),
      ...(decoded.impersonatorName
        ? { impersonatorName: decoded.impersonatorName }
        : {}),
    };
    req.user = user;

    if (
      user.impersonation &&
      user.readOnly &&
      !["GET", "HEAD", "OPTIONS"].includes(String(req.method || "").toUpperCase())
    ) {
      return res.status(403).json({
        message:
          "Read-only view-as session: changes are blocked. Exit view-as to continue as Super Admin.",
        code: "IMPERSONATION_READ_ONLY",
      });
    }

    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}
