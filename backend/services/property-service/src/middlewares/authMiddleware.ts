import { Request, Response, NextFunction } from "express";
import { JwtUserPayload } from "../types/auth";
import { verifyToken } from "../utils/jwt";
import mongoose from "mongoose";
import Role from "../models/roleModel";

export interface AuthRequest extends Request<
  any,
  any,
  any,
  any
> {
  user?: JwtUserPayload & { id: string };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  // ✅ Guard: token is now guaranteed string
  if (!token) {
    return res.status(401).json({ message: "Token missing" });
  }

  try {
    const decoded = verifyToken(token);
    let roleName = decoded.roleName;
    let permissions = decoded.permissions ?? [];

    // Refresh permissions so role changes take effect without another login.
    if (decoded.roleId && mongoose.Types.ObjectId.isValid(decoded.roleId)) {
      const currentRole = await Role.findById(decoded.roleId)
        .select("name permissions")
        .lean();

      if (currentRole) {
        roleName = currentRole.name;
        permissions = currentRole.permissions ?? [];
      }
    }

    const user = {
      ...decoded,
      roleName,
      permissions,
      id: decoded.sub, // ✅ standardized user id
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

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}
