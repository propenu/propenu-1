import { Response, NextFunction } from "express";
import { AuthRequest } from "./authMiddleware";

const normalizeRoleName = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizePermission = (value: unknown) => String(value || "").trim().toLowerCase();

function callerCan(req: AuthRequest, permission: string, legacyRoles: string[] = []) {
  const permissions = (Array.isArray(req.user?.permissions) ? req.user.permissions : []).map(
    normalizePermission,
  );
  const roleName = normalizeRoleName(req.user?.roleName);
  const required = normalizePermission(permission);

  if (roleName === "super_admin" || roleName === "admin" || permissions.includes("*")) {
    return true;
  }
  if (roleName && legacyRoles.map(normalizeRoleName).includes(roleName)) {
    return true;
  }
  return permissions.includes(required);
}

function permissionDenied(res: Response, required: string) {
  return res.status(403).json({
    success: false,
    code: "PERMISSION_REQUIRED",
    message: `You do not have permission for this action. Please request the '${required}' permission from a Super Admin.`,
    requiredPermission: required,
  });
}

export type OwnBuilderInvoiceRequest = AuthRequest & { ownBuilderInvoices?: boolean };

/**
 * Staff with builder_invoice:view (and admin / super admin) keep full invoice access.
 * A builder account may read invoices, but only their own — enforced in the controller.
 */
export function requireBuilderInvoiceRead(
  req: OwnBuilderInvoiceRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (callerCan(req, "builder_invoice:view")) {
    return next();
  }

  if (normalizeRoleName(req.user.roleName) === "builder") {
    req.ownBuilderInvoices = true;
    return next();
  }

  return permissionDenied(res, "builder_invoice:view");
}

export function requirePermission(permission: string, legacyRoles: string[] = []) {
  const required = normalizePermission(permission);

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (callerCan(req, required, legacyRoles)) {
      return next();
    }

    return permissionDenied(res, required);
  };
}

export function requireAnyPermission(permissionsList: string[], legacyRoles: string[] = []) {
  const required = permissionsList.map(normalizePermission).filter(Boolean);

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const permissions = (Array.isArray(req.user.permissions) ? req.user.permissions : []).map(
      normalizePermission,
    );
    const roleName = normalizeRoleName(req.user.roleName);

    if (roleName === "super_admin" || roleName === "admin" || permissions.includes("*")) {
      return next();
    }

    if (roleName && legacyRoles.map(normalizeRoleName).includes(roleName)) {
      return next();
    }

    if (required.some((permission) => permissions.includes(permission))) {
      return next();
    }

    return res.status(403).json({
      success: false,
      code: "PERMISSION_REQUIRED",
      message: `You do not have permission for this action. Please request one of: ${required.join(", ")}.`,
      requiredPermissions: required,
    });
  };
}
