// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import { JwtUserPayload } from "../types/auth";
import jwt from "jsonwebtoken";
import Role from "../models/roleModel";
import User from "../models/userModel";
import { ALL_PERMISSIONS } from "../constants/permissionCatalog";
import { touchUserPresence } from "../utils/presence";

export interface AuthRequest extends Request {
  user?: JwtUserPayload;
}

const normalizeRoleName = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function resolvePermissions(roleName?: string, permissions?: string[]) {
  const normalized = normalizeRoleName(roleName);
  if (normalized === "super_admin") return [...ALL_PERMISSIONS];
  return Array.isArray(permissions) ? permissions : [];
}

async function resolveRoleFromRequest(decoded: JwtUserPayload) {
  // 1) Prefer live User.roleId (source of truth — survives role renames / token drift)
  const activeUser = await User.findById(decoded.sub)
    .select("_id isActive roleId")
    .populate("roleId", "name permissions isActive")
    .lean();

  if (!activeUser) {
    return { error: { status: 401, message: "Account not found" } as const };
  }
  if (activeUser.isActive === false) {
    return {
      error: { status: 401, message: "Account is no longer active" } as const,
    };
  }

  let role: any = activeUser.roleId;

  // 2) Fallback: roleId embedded in JWT
  if (!role && decoded.roleId) {
    role = await Role.findById(decoded.roleId)
      .select("name permissions isActive")
      .lean();
  }

  if (role) {
    if (role.isActive === false) {
      return {
        error: {
          status: 403,
          message:
            "This role is deactivated. Dashboard access is blocked until a Super Admin activates the role again.",
          code: "ROLE_DEACTIVATED",
        } as const,
      };
    }
    return {
      userId: String(activeUser._id),
      roleName: role.name as string,
      permissions: resolvePermissions(role.name, role.permissions),
    };
  }

  // 3) Fallback: claims on the JWT itself (older tokens)
  const jwtRoleName = decoded.roleName || (decoded as any).role;
  if (jwtRoleName) {
    return {
      userId: String(activeUser._id),
      roleName: String(jwtRoleName),
      permissions: resolvePermissions(jwtRoleName, decoded.permissions),
    };
  }

  return {
    userId: String(activeUser._id),
    roleName: undefined,
    permissions: [] as string[],
  };
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


  const parts = authHeader.split(" ");
  const token = parts[1];

  if (!token) {
    return res.status(401).json({ message: "Token missing" });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as unknown as JwtUserPayload;

    if (!decoded.sub) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const resolved = await resolveRoleFromRequest(decoded);
    if ("error" in resolved && resolved.error) {
      return res.status(resolved.error.status).json({
        message: resolved.error.message,
        ...(resolved.error.code ? { code: resolved.error.code } : {}),
      });
    }

    const { userId, roleName, permissions } = resolved as {
      userId: string;
      roleName?: string;
      permissions: string[];
    };

    req.user = {
      ...decoded,
      _id: userId,
      id: userId,
      roleName,
      permissions,
    };

    void touchUserPresence(userId).catch(() => undefined);

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

/** Sets req.user when a valid Bearer token is present; never blocks the request. */
export async function optionalAuthMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  if (!token) return next();

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as unknown as JwtUserPayload;

    if (!decoded.sub) return next();

    const resolved = await resolveRoleFromRequest(decoded);
    if ("error" in resolved && resolved.error) return next();

    const { userId, roleName, permissions } = resolved as {
      userId: string;
      roleName?: string;
      permissions: string[];
    };

    req.user = {
      ...decoded,
      _id: userId,
      id: userId,
      roleName,
      permissions,
    };
  } catch {
    // Public callers stay unauthenticated
  }

  return next();
}
