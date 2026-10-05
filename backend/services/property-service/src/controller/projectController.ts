import { Response } from "express";
import FeaturedProject from "../models/featurePropertiesModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import mongoose from "mongoose";
import { canApproveProjectByHierarchy } from "../utils/projectApprovalPolicy";
import { BuilderOnboardingService } from "../services/builderOnboardingService";
import { notifySearchMatchesForListing } from "../services/searchMatchNotificationService";
import { notifyLifecycleEvent } from "../services/lifecycleNotificationService";

const resolveCreatorMeta = (project: any) => {
  const createdBy = project?.createdBy;
  const postedBy = project?.postedBy;
  const creatorId =
    (createdBy && typeof createdBy === "object" ? createdBy._id : createdBy) ||
    postedBy?.userId ||
    null;
  const creatorRole =
    (createdBy && typeof createdBy === "object" ? createdBy.roleName : null) ||
    postedBy?.roleName ||
    null;
  return {
    creatorId: creatorId ? String(creatorId) : null,
    creatorRole: creatorRole ? String(creatorRole) : null,
  };
};

export const getPendingProjects = async (req: AuthRequest, res: Response) => {
  try {
    const projects = await FeaturedProject.find({
      approvalStatus: "pending",
      status: "pending",
    })
      .populate("createdBy", "fullName name email phone roleName")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      total: projects.length,
      data: projects,
    });
  } catch (error: any) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const approveProject = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const project = await FeaturedProject.findById(req.params.id).populate(
      "createdBy",
      "fullName name companyName email roleName",
    );

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (project.status !== "pending" && project.approvalStatus !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending projects can be approved",
      });
    }

    // New draft→onboarding flow: block approve until builder is verified.
    // Existing projects without builderOnboarding.enabled are unaffected.
    if (BuilderOnboardingService.isBuilderOnboardingBlocking(project)) {
      return res.status(400).json({
        success: false,
        code: "BUILDER_ONBOARDING_REQUIRED",
        message:
          "Builder must be assigned and verified before this project can be approved",
      });
    }

    const { creatorId, creatorRole } = resolveCreatorMeta(project);
    const permissions = Array.isArray(req.user.permissions)
      ? req.user.permissions
      : [];
    const decision = canApproveProjectByHierarchy({
      actorRole: req.user.roleName ?? null,
      actorId: req.user.id ?? null,
      creatorRole,
      creatorId,
      hasApprovePermission:
        permissions.includes("project:approve") || permissions.includes("*"),
    });

    if (!decision.ok) {
      return res.status(403).json({
        success: false,
        code: "HIERARCHY_APPROVAL_REQUIRED",
        message: decision.reason,
      });
    }

    project.status = "active";
    project.approvalStatus = "approved";
    project.approvedBy = new mongoose.Types.ObjectId(req.user.id);
    project.approvedAt = new Date();

    await project.save();
    void notifyLifecycleEvent({
      type: "project_approved",
      listing: project,
      kind: "project",
      category: project.categoryType as any,
    });
    void notifySearchMatchesForListing({
      listing: project,
      kind: "project",
      category: project.categoryType as any,
    });

    return res.status(200).json({
      success: true,
      message: "Project approved successfully and is now live",
      data: project,
    });
  } catch (error: any) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const rejectProject = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { reason } = req.body;
    const project = await FeaturedProject.findById(req.params.id).populate(
      "createdBy",
      "fullName name companyName email roleName",
    );

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (project.status !== "pending" && project.approvalStatus !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending projects can be rejected",
      });
    }

    const { creatorId, creatorRole } = resolveCreatorMeta(project);
    const permissions = Array.isArray(req.user.permissions)
      ? req.user.permissions
      : [];
    const decision = canApproveProjectByHierarchy({
      actorRole: req.user.roleName ?? null,
      actorId: req.user.id ?? null,
      creatorRole,
      creatorId,
      hasApprovePermission:
        permissions.includes("project:reject") ||
        permissions.includes("project:approve") ||
        permissions.includes("*"),
    });

    if (!decision.ok) {
      return res.status(403).json({
        success: false,
        code: "HIERARCHY_APPROVAL_REQUIRED",
        message: decision.reason,
      });
    }

    project.status = "rejected";
    project.approvalStatus = "rejected";
    project.rejectedReason = reason || "Rejected by manager";

    await project.save();
    void notifyLifecycleEvent({
      type: "project_rejected",
      listing: project,
      kind: "project",
      category: project.categoryType as any,
      rejectedReason: project.rejectedReason,
    });

    return res.status(200).json({
      success: true,
      message: "Project rejected successfully",
      data: project,
    });
  } catch (error: any) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
