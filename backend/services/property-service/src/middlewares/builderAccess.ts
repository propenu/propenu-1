import { NextFunction, Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "./authMiddleware";
import BuilderMember from "../models/builderMemberModel";
import Lead from "../models/LeadModel";
import PublicLead from "../models/PublicLead";
import FeaturedProject from "../models/featurePropertiesModel";
import { isDirectAgentRole } from "../utils/agentSubmission";

type BuilderAccess = {
  builderId: string;
  memberId: string | null;
  roleId: string | null;
  roleName: string;
  permissions: string[];
  projectIds: string[];
  isOwner: boolean;
  isGlobalScope: boolean;
};

type BuilderAccessRequest = AuthRequest & {
  builderAccess?: BuilderAccess;
  builderProjectId?: string;
};

const hasPermission = (access: BuilderAccess, permission: string) =>
  access.permissions.includes("*") || access.permissions.includes(permission);

const hasProjectAccess = (access: BuilderAccess, projectId: string) =>
  access.projectIds.includes("*") || access.projectIds.includes(projectId);

export const loadBuilderAccess = async (
  req: BuilderAccessRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (req.user.roleName === "builder") {
      req.builderAccess = {
        builderId: req.user.id,
        memberId: null,
        roleId: null,
        roleName: "Owner",
        permissions: ["*"],
        projectIds: ["*"],
        isOwner: true,
        isGlobalScope: false,
      };
      return next();
    }

    if (isDirectAgentRole(req.user.roleName)) {
      req.builderAccess = {
        builderId: req.user.id,
        memberId: null,
        roleId: null,
        roleName: req.user.roleName ?? "DirectAccess",
        permissions: ["*"],
        projectIds: ["*"],
        isOwner: false,
        isGlobalScope: false,
      };
      return next();
    }

    // Admin-dashboard roles are governed by the dynamically assigned lead:*
    // permissions. They are not builder members, so give them cross-project
    // scope while requireBuilderPermission still validates each action.
    const dashboardPermissions = req.user.permissions ?? [];
    const hasDashboardLeadAccess =
      ["super_admin", "admin"].includes(req.user.roleName || "") ||
      dashboardPermissions.some((permission) => permission === "*" || permission.startsWith("lead:"));
    if (req.user.roleName !== "builder_staff" && hasDashboardLeadAccess) {
      req.builderAccess = {
        builderId: "*",
        memberId: null,
        roleId: null,
        roleName: req.user.roleName ?? "DashboardRole",
        permissions: ["super_admin", "admin"].includes(req.user.roleName || "") ? ["*"] : dashboardPermissions,
        projectIds: ["*"],
        isOwner: false,
        isGlobalScope: true,
      };
      return next();
    }

    const member = (await BuilderMember.findOne({
      userId: req.user.id,
      isActive: true,
    })
      .populate("builderRoleId")
      .lean()) as any;

    if (!member) {
      return res.status(403).json({ message: "Builder access not found" });
    }

    const role = member.builderRoleId as any;
    if (!role || role.isActive === false) {
      return res.status(403).json({ message: "Builder role is inactive" });
    }

    req.builderAccess = {
      builderId: String(member.builderId),
      memberId: String(member._id),
      roleId: String(role._id),
      roleName: role.name,
      permissions: role.permissions ?? [],
      projectIds: (member.projectIds ?? []).map(String),
      isOwner: false,
      isGlobalScope: false,
    };

    next();
  } catch (error) {
    res.status(500).json({ message: "Failed to load builder access" });
  }
};

export const requireBuilderPermission = (permission: string) => {
  return (req: BuilderAccessRequest, res: Response, next: NextFunction) => {
    if (isDirectAgentRole(req.user?.roleName)) {
      return next();
    }

    if (!req.builderAccess) {
      return res.status(403).json({ message: "Builder access required" });
    }

    if (!hasPermission(req.builderAccess, permission)) {
      return res.status(403).json({
        success: false,
        code: "PERMISSION_REQUIRED",
        message: `You do not have permission for this action. Please request the '${permission}' permission from a Super Admin.`,
        requiredPermission: permission,
      });
    }

    next();
  };
};

export const requireProjectParamAccess = (paramName = "projectId") => {
  return async (
    req: BuilderAccessRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const projectId = req.params[paramName];

    if (!req.builderAccess || !projectId) {
      return res.status(403).json({ message: "Project access required" });
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: "Invalid projectId" });
    }

    const project = await FeaturedProject.findById(projectId)
      .select("createdBy")
      .lean();

    if (!project) {
      if (isDirectAgentRole(req.user?.roleName) || req.builderAccess.isGlobalScope) {
        req.builderProjectId = projectId;
        return next();
      }
      return res.status(404).json({ message: "Project not found" });
    }

    if (isDirectAgentRole(req.user?.roleName) || req.builderAccess.isGlobalScope) {
      req.builderProjectId = projectId;
      return next();
    }

    if (String(project.createdBy) !== req.builderAccess.builderId) {
      return res.status(403).json({ message: "Project belongs to another builder" });
    }

    if (!hasProjectAccess(req.builderAccess, projectId)) {
      return res.status(403).json({ message: "Project not assigned to this user" });
    }

    req.builderProjectId = projectId;
    next();
  };
};

export const loadLeadProjectAccess = (paramName = "id") => {
  return async (
    req: BuilderAccessRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const leadId = req.params[paramName];

    if (!req.builderAccess || !leadId) {
      return res.status(403).json({ message: "Lead access required" });
    }

    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({ message: "Invalid lead id" });
    }

    const lead =
      (await PublicLead.findById(leadId).select("projectId").lean()) ||
      (await Lead.findById(leadId).select("projectId ownerId").lean());

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const projectId = String((lead as any).projectId);
    const project = await FeaturedProject.findById(projectId)
      .select("createdBy")
      .lean();

    const canAccessAnyProject =
      req.builderAccess.isGlobalScope || isDirectAgentRole(req.user?.roleName);

    if (!project) {
      if (canAccessAnyProject) {
        req.builderProjectId = projectId;
        return next();
      }
      return res.status(404).json({ message: "Project not found" });
    }

    if (canAccessAnyProject) {
      req.builderProjectId = projectId;
      return next();
    }

    if (String(project.createdBy) !== req.builderAccess.builderId) {
      return res.status(403).json({ message: "Lead belongs to another builder" });
    }

    if (!hasProjectAccess(req.builderAccess, projectId)) {
      return res.status(403).json({ message: "Project not assigned to this user" });
    }

    req.builderProjectId = projectId;
    next();
  };
};

export const requireAssignableBuilderMember = async (
  req: BuilderAccessRequest,
  res: Response,
  next: NextFunction,
) => {
  const assignedTo = req.body.assignedTo;
  const projectId = req.builderProjectId;

  if (!req.builderAccess || !assignedTo || !projectId) {
    return res.status(400).json({ message: "assignedTo is required" });
  }

  if (!mongoose.Types.ObjectId.isValid(String(assignedTo))) {
    return res.status(400).json({ message: "Invalid assignedTo user id" });
  }

  const member = await BuilderMember.findOne({
    builderId: req.builderAccess.builderId,
    userId: assignedTo,
    isActive: true,
    projectIds: projectId,
  }).lean();

  if (!member) {
    return res.status(400).json({
      message: "Assigned user is not an active member for this builder project",
    });
  }

  next();
};
