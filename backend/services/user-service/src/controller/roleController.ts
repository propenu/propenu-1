import { Response } from "express";
import Role from "../models/roleModel";
import User from "../models/userModel";
import mongoose from "mongoose";
import { AuthRequest } from "../middlewares/authMiddleware";
import { ALL_PERMISSIONS, PERMISSION_CATALOG, PERMISSION_SET } from "../constants/permissionCatalog";
import { BUSINESS_DEVELOPMENT_MANAGED_ROLE_NAMES, OPERATIONS_MANAGED_ROLE_NAMES } from "../utils/roleManagementPolicy";
import {
  canonicalRoleName,
  ensureCanonicalHierarchyRoles,
  getCanonicalParentRoleName,
  getDescendantRoleIds,
  normalizeHierarchyRoleKey,
} from "../utils/roleHierarchy";

const PROTECTED_ROLE_NAMES = new Set(["super_admin", "admin"]);

const normalizeRoleName = (name: string) => name.trim().toLowerCase();
const SYSTEM_ROLE_NAMES = new Set(["super_admin", "admin", "user", "builder", "builder_staff", "agent"]);
/** Do not allow creating a second Customer Support Team Lead under another name. */
const RESERVED_HIERARCHY_ROLE_CANONS = new Set([
  "customer_support_team_lead",
  "customer_support_head",
  "customer_care_executive",
  "relationship_manager",
  "operations_head",
  "super_admin",
  "marketing_head",
  "digital_marketing",
  "social_media",
  "content_team",
  "creative_team",
  "performance_marketing",
]);
/** Consumer / marketplace roles — never permanently deleted */
const NON_DELETABLE_PLATFORM_ROLE_NAMES = new Set([
  "super_admin",
  "user",
  "builder",
  "builder_staff",
  "agent",
]);

/**
 * Super Admin may permanently delete any dashboard role they created by mistake
 * (hierarchy, custom, or seeded) — except absolute platform/marketplace roles.
 * isProtected does NOT block Super Admin. Safe transfer is enforced in deleteRole.
 */
const canManageRoleLifecycle = (
  role: {
    name?: string | null;
    roleType?: string | null;
    isProtected?: boolean | null;
  },
  actorRoleName?: string | null,
) => {
  if (!role?.name) return false;
  const name = normalizeRoleName(role.name);
  // Never delete these — even Super Admin
  if (NON_DELETABLE_PLATFORM_ROLE_NAMES.has(name)) return false;

  const actor = normalizeRoleName(String(actorRoleName || ""));
  if (actor === "super_admin") return true;

  // Non–super-admin: custom / CCE only; respect isProtected
  if (role.isProtected || PROTECTED_ROLE_NAMES.has(name)) return false;
  if (role.roleType === "custom") return true;
  return (
    name === "customer_care" ||
    name === "customer_care_executive" ||
    name === "customer_care_executives"
  );
};

const normalizePermissions = (permissions: unknown[]) =>
  [...new Set(permissions.map((permission) => String(permission).trim().toLowerCase()))];

/** Older dashboard ticks. Kept so a save does not fail; they are not shown. */
const RETIRED_PERMISSIONS = new Set([
  "dashboard:view_analytics",
  "dashboard:view_reports",
  "dashboard:export",
]);

const getInvalidPermissions = (permissions: string[]) =>
  permissions.filter(
    (permission) => !PERMISSION_SET.has(permission) && !RETIRED_PERMISSIONS.has(permission),
  );

export const getPermissionCatalog = async (_req: AuthRequest, res: Response) =>
  res.json({
    success: true,
    moduleCount: PERMISSION_CATALOG.length,
    permissionCount: ALL_PERMISSIONS.length,
    modules: PERMISSION_CATALOG,
  });

const attachAssignedUserCounts = async (roles: any[]) => {
  if (!roles.length) return roles;
  const roleIds = roles.map((role) => role._id).filter(Boolean);
  const assignmentCounts = await User.aggregate([
    { $match: { roleId: { $in: roleIds } } },
    { $group: { _id: "$roleId", count: { $sum: 1 } } },
  ]);
  const countsByRole = new Map(
    assignmentCounts.map((item) => [String(item._id), item.count as number]),
  );
  return roles.map((role) => ({
    ...role,
    assignedUserCount: countsByRole.get(String(role._id)) || 0,
  }));
};

export const getAssignableRoles = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure Legal, HR, Support, Marketing, Tech, etc. exist under Operations Head tree.
    await ensureCanonicalHierarchyRoles();

    const roleFilter: any = {
      isActive: { $ne: false },
      name: { $nin: ["super_admin", "user", "builder", "builder_staff", "agent"] },
    };

    const actorRole = String(req.user?.roleName || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");
    const actorRoleCanon =
      actorRole === "team_lead" || actorRole === "team_leads"
        ? "customer_support_team_lead"
        : actorRole;
    // Only roles below the actor (descendants). Platform heads (super_admin/admin) see the full dashboard set.
    if (actorRoleCanon !== "super_admin" && actorRoleCanon !== "admin") {
      const actor = await User.findById(req.user?.sub).select("roleId").lean();
      const descendantRoleIds = actor?.roleId ? await getDescendantRoleIds(actor.roleId) : [];
      roleFilter._id = { $in: descendantRoleIds };
    }

    const roles = await Role.find(roleFilter)
      .select("name label permissions roleType isProtected parentRoleId")
      .populate("parentRoleId", "name label")
      .sort({ label: 1 })
      .lean();
    const rolesWithUsage = await attachAssignedUserCounts(roles);
    return res.json({ success: true, roles: rolesWithUsage });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch assignable roles", error: err.message });
  }
};

export const getTeamDirectoryRoles = async (req: AuthRequest, res: Response) => {
  try {
    await ensureCanonicalHierarchyRoles();

    const excluded = ["user", "builder", "builder_staff", "agent"];

    const roleFilter: any = {
      isActive: { $ne: false },
      name: { $nin: excluded },
    };

    const actor = await User.findById(req.user?.sub).select("roleId").lean();
    const actorRoleId = actor?.roleId || null;
    const actorRoleKey = String(req.user?.roleName || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");

    if (actorRoleKey !== "super_admin" && actorRoleKey !== "admin") {
      const descendantRoleIds = actorRoleId ? await getDescendantRoleIds(actorRoleId) : [];
      // Always return the known support-branch role docs even when empty,
      // so the Role filter still shows Team Lead / CCE / RM for CSH.
      roleFilter._id = { $in: descendantRoleIds.length ? descendantRoleIds : [] };
    }

    const roles = await Role.find(roleFilter)
      .select("name label parentRoleId")
      .populate("parentRoleId", "name label")
      .sort({ label: 1 })
      .lean();

    const rolesWithUsage = await attachAssignedUserCounts(roles);

    const hierarchyRoles = rolesWithUsage.map((role: any) => ({
      ...role,
      isCurrentRole: !!actorRoleId && String(role._id) === String(actorRoleId),
      effectiveParentRoleId:
        role.parentRoleId?._id
            ? String(role.parentRoleId._id)
            : role.parentRoleId
              ? String(role.parentRoleId)
              : (() => {
                  const canonicalParentName = getCanonicalParentRoleName(role.name);
                  const canonicalParent = rolesWithUsage.find((candidate: any) => candidate.name === canonicalParentName);
                  return canonicalParent ? String(canonicalParent._id) : null;
                })(),
    }));

    return res.json({ success: true, currentRoleId: actorRoleId ? String(actorRoleId) : null, roles: hierarchyRoles });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch team directory roles", error: err.message });
  }
};

const isRegionalManager = (req: AuthRequest) =>
  req.user?.roleName === "regional_manager";

const isOperationsHead = (req: AuthRequest) =>
  ["operations_head", "operation_head"].includes(req.user?.roleName || "");

const rejectRoleOutsideManagementScope = (
  req: AuthRequest,
  res: Response,
  roleName?: string | null,
) => {
  if (isOperationsHead(req) && (!roleName || !OPERATIONS_MANAGED_ROLE_NAMES.has(normalizeRoleName(roleName)))) {
    res.status(403).json({
      message: "You can manage only roles assigned below Operations Head",
    });
    return true;
  }
  return false;
};

const isProtectedRoleName = (name?: string | null) =>
  !!name && PROTECTED_ROLE_NAMES.has(normalizeRoleName(name));

const rejectProtectedRoleForRegionalManager = (
  req: AuthRequest,
  res: Response,
  roleName?: string | null,
) => {
  if (isRegionalManager(req) && isProtectedRoleName(roleName)) {
    res.status(403).json({
      message: "Regional Manager cannot manage Admin or Super Admin roles",
    });
    return true;
  }

  return false;
};

export const createRole = async (req: AuthRequest, res: Response) => {
  try {
    const { name, label, permissions, parentRoleId } = req.body;

    if (!name || !label) {
      return res.status(400).json({
        message: "name and label are required",
      });
    }

    const normalizedName = normalizeHierarchyRoleKey(name) || normalizeRoleName(name);
    const normalizedPermissions = normalizePermissions(Array.isArray(permissions) ? permissions : []);

    if (SYSTEM_ROLE_NAMES.has(normalizedName)) {
      return res.status(409).json({ message: "This name is reserved for a system role" });
    }

    const roleCanon = canonicalRoleName(normalizedName);
    if (RESERVED_HIERARCHY_ROLE_CANONS.has(roleCanon) || RESERVED_HIERARCHY_ROLE_CANONS.has(normalizedName)) {
      return res.status(409).json({
        message:
          roleCanon === "customer_support_team_lead"
            ? "Customer Support Team Lead already exists in the hierarchy. Use that role — do not create a duplicate."
            : `Role '${normalizedName}' is reserved in the organisation hierarchy`,
      });
    }

    const invalidPermissions = getInvalidPermissions(normalizedPermissions);
    if (invalidPermissions.length) {
      return res.status(400).json({ message: "One or more permissions are invalid", invalidPermissions });
    }

    if (rejectProtectedRoleForRegionalManager(req, res, normalizedName)) return;

    let parentRole = null;
    if (parentRoleId) {
      if (!mongoose.Types.ObjectId.isValid(parentRoleId)) {
        return res.status(400).json({ message: "Invalid parent role" });
      }
      parentRole = await Role.findById(parentRoleId).select("_id name label isActive");
      if (!parentRole) {
        return res.status(404).json({ message: "Parent role not found" });
      }
      if (parentRole.isActive === false) {
        return res.status(409).json({ message: "Select an active parent role" });
      }
      if (["user", "builder", "builder_staff", "agent"].includes(parentRole.name)) {
        return res.status(400).json({ message: "System account roles cannot be hierarchy parents" });
      }
    }

    const exists = await Role.findOne({ name: normalizedName });
    if (exists) {
      return res.status(409).json({
        message: `Role '${name}' already exists`,
      });
    }

    const role = await Role.create({
      name: normalizedName,
      label,
      permissions: normalizedPermissions,
      roleType: "custom",
      isProtected: false,
      parentRoleId: parentRole?._id || null,
    });

    return res.status(201).json({
      success: true,
      role,
    });
  } catch (err: any) {
    return res.status(500).json({
      message: "Failed to create role",
      error: err.message,
    });
  }
};


export const getAllRoles = async (req: AuthRequest, res: Response) => {
  try {
    const filter: any = {};
    const actorRoleKey = String(req.user?.roleName || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");
    if (actorRoleKey !== "super_admin" && actorRoleKey !== "admin") {
      const actor = await User.findById(req.user?.sub).select("roleId").lean();
      const descendantRoleIds = actor?.roleId
        ? await getDescendantRoleIds(actor.roleId)
        : [];
      filter._id = { $in: descendantRoleIds };
    }
    const roles = await Role.find(filter).populate("parentRoleId", "name label").sort({ createdAt: -1 }).lean();
    const rolesWithUsage = await attachAssignedUserCounts(roles);

    return res.json({
      success: true,
      count: rolesWithUsage.length,
      roles: rolesWithUsage,
    });
  } catch (err: any) {
    return res.status(500).json({
      message: "Failed to fetch roles",
      error: err.message,
    });
  }
};


export const getRoleById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

     if (!id) {
      return res.status(400).json({ message: "Role id is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid role id" });
    }

    const role = await Role.findById(id).populate("parentRoleId", "name label");
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }
    if (rejectRoleOutsideManagementScope(req, res, role.name)) return;

    return res.json({
      success: true,
      role,
    });
  } catch (err: any) {
    return res.status(500).json({
      message: "Failed to fetch role",
      error: err.message,
    });
  }
};


export const updateRolePermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        message: "permissions must be an array",
      });
    }

    const normalizedPermissions = normalizePermissions(permissions);
    const invalidPermissions = getInvalidPermissions(normalizedPermissions);
    if (invalidPermissions.length) {
      return res.status(400).json({ message: "One or more permissions are invalid", invalidPermissions });
    }

    const existingRole = await Role.findById(id);

    if (!existingRole) {
      return res.status(404).json({
        message: "Role not found",
      });
    }

    if (rejectProtectedRoleForRegionalManager(req, res, existingRole.name)) return;
    if (rejectRoleOutsideManagementScope(req, res, existingRole.name)) return;

    const role = await Role.findByIdAndUpdate(
      id,
      { permissions: normalizedPermissions },
      { new: true }
    );

    if (!role) {
      return res.status(404).json({
        message: "Role not found",
      });
    }

    return res.json({
      success: true,
      role,
    });
  } catch (err: any) {
    return res.status(500).json({
      message: "Failed to update permissions",
      error: err.message,
    });
  }
};

export const updateRole = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { parentRoleId } = req.body;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid role id" });
    }

    const role = await Role.findById(id);
    if (!role) return res.status(404).json({ message: "Role not found" });
    if (rejectRoleOutsideManagementScope(req, res, role.name)) return;

    if (parentRoleId) {
      if (!mongoose.Types.ObjectId.isValid(parentRoleId)) {
        return res.status(400).json({ message: "Invalid parent role" });
      }
      if (String(parentRoleId) === String(role._id)) {
        return res.status(400).json({ message: "A role cannot be its own parent" });
      }
      const parent = await Role.findById(parentRoleId).select("_id name isActive");
      if (!parent) return res.status(404).json({ message: "Parent role not found" });
      if (parent.isActive === false) return res.status(409).json({ message: "Select an active parent role" });
      if (["user", "builder", "builder_staff", "agent"].includes(parent.name)) {
        return res.status(400).json({ message: "System account roles cannot be hierarchy parents" });
      }
      const descendantIds = await getDescendantRoleIds(role._id);
      if (descendantIds.some((roleId) => String(roleId) === String(parentRoleId))) {
        return res.status(409).json({ message: "This parent would create a circular role hierarchy" });
      }
      role.parentRoleId = parent._id;
    } else {
      (role as any).parentRoleId = null;
    }

    await role.save();
    await role.populate("parentRoleId", "name label");
    return res.json({ success: true, role });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to update role hierarchy", error: err.message });
  }
};

export const updateRoleStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid role id" });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        message: "isActive must be a boolean",
      });
    }

    const existingRole = await Role.findById(id);

    if (!existingRole) {
      return res.status(404).json({
        message: "Role not found",
      });
    }

    if (rejectProtectedRoleForRegionalManager(req, res, existingRole.name)) return;
    if (rejectRoleOutsideManagementScope(req, res, existingRole.name)) return;

    const roleName = normalizeRoleName(existingRole.name);
    const actor = normalizeRoleName(String(req.user?.roleName || ""));
    // Never toggle absolute platform/marketplace roles
    if (NON_DELETABLE_PLATFORM_ROLE_NAMES.has(roleName)) {
      return res.status(403).json({
        message: "Protected platform roles cannot be activated or deactivated",
      });
    }
    // Super Admin may deactivate any other role (including hierarchy / isProtected) before safe delete
    if (actor !== "super_admin") {
      if (existingRole.isProtected || PROTECTED_ROLE_NAMES.has(roleName)) {
        return res.status(403).json({
          message: "Protected platform roles cannot be activated or deactivated",
        });
      }
    }

    existingRole.isActive = isActive;
    await existingRole.save();

    return res.json({
      success: true,
      role: existingRole,
    });
  } catch (err: any) {
    return res.status(500).json({
      message: "Failed to update role status",
      error: err.message,
    });
  }
};

export const deleteRole = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const transferToRoleId = String(req.body?.transferToRoleId || "").trim();

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid role id" });
    }

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }

    if (!canManageRoleLifecycle(role, req.user?.roleName)) {
      return res.status(403).json({
        message:
          "This platform role cannot be deleted (Super Admin, User, Builder, Agent). Other roles can be permanently deleted by Super Admin after safe user transfer.",
      });
    }

    if (role.isActive !== false) {
      return res.status(409).json({
        code: "ROLE_MUST_BE_DEACTIVATED",
        message: "Deactivate this role before permanently deleting it",
      });
    }

    const assignedUsers = await User.countDocuments({ roleId: role._id });
    const childRoles = await Role.countDocuments({ parentRoleId: role._id });
    const needsTransfer = assignedUsers > 0 || childRoles > 0;

    let transferRole: any = null;
    if (needsTransfer) {
      if (!transferToRoleId || !mongoose.Types.ObjectId.isValid(transferToRoleId)) {
        return res.status(400).json({
          code: "TRANSFER_ROLE_REQUIRED",
          assignedUsers,
          childRoles,
          message:
            "Select a transfer role to safely move assigned users and child roles before deletion",
        });
      }
      if (String(transferToRoleId) === String(role._id)) {
        return res.status(400).json({
          message: "Transfer role must be different from the role being deleted",
        });
      }

      transferRole = await Role.findById(transferToRoleId);
      if (!transferRole) {
        return res.status(404).json({ message: "Transfer role not found" });
      }
      if (transferRole.isActive === false) {
        return res.status(409).json({
          message: "Transfer role must be active",
        });
      }
      const transferName = normalizeRoleName(transferRole.name);
      // Allow transfer onto admin / hierarchy / custom — never onto marketplace consumer roles
      if (
        transferName === "user" ||
        transferName === "builder" ||
        transferName === "builder_staff" ||
        transferName === "agent"
      ) {
        return res.status(400).json({
          message: "Cannot transfer dashboard users onto marketplace account roles",
        });
      }
      if (transferName === "super_admin" && normalizeRoleName(role.name) !== "admin") {
        // Prefer not dumping whole teams onto super_admin unless deleting admin
        return res.status(400).json({
          message: "Choose a normal dashboard role for transfer (not Super Admin)",
        });
      }
    }

    let transferredUsers = 0;
    let reparentedChildren = 0;

    if (transferRole && assignedUsers > 0) {
      const move = await User.updateMany(
        { roleId: role._id },
        { $set: { roleId: transferRole._id } },
      );
      transferredUsers = move.modifiedCount || 0;
    }

    if (transferRole && childRoles > 0) {
      const reparent = await Role.updateMany(
        { parentRoleId: role._id },
        { $set: { parentRoleId: transferRole._id } },
      );
      reparentedChildren = reparent.modifiedCount || 0;
    }

    // Final safety check — never leave orphaned assignments
    const remainingUsers = await User.countDocuments({ roleId: role._id });
    const remainingChildren = await Role.countDocuments({ parentRoleId: role._id });
    if (remainingUsers > 0 || remainingChildren > 0) {
      return res.status(409).json({
        code: "ROLE_STILL_IN_USE",
        assignedUsers: remainingUsers,
        childRoles: remainingChildren,
        message: "Could not finish safe transfer. Role was not deleted.",
      });
    }

    await role.deleteOne();
    return res.json({
      success: true,
      deletedRole: { id: role._id, name: role.name, label: role.label },
      transferredUsers,
      reparentedChildren,
      transferToRoleId: transferRole ? String(transferRole._id) : null,
      message:
        transferredUsers > 0 || reparentedChildren > 0
          ? `Role '${role.label}' deleted after safely transferring ${transferredUsers} user(s) and ${reparentedChildren} child role(s)`
          : `Role '${role.label}' deleted successfully`,
    });
  } catch (err: any) {
    return res.status(500).json({
      message: "Failed to delete role",
      error: err.message,
    });
  }
};
