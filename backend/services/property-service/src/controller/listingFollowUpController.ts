import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middlewares/authMiddleware";
import Residential from "../models/residentialModel";
import Commercial from "../models/commercialModel";
import LandPlot from "../models/landModel";
import Agricultural from "../models/agriculturalModel";
import FeaturedProject from "../models/featurePropertiesModel";
import { applyListingFollowUpOwner } from "../utils/listingFollowUpAssign";

const WORK_STATUSES = ["assigned", "in_progress", "completed"] as const;

const ENTITY_MODELS: Record<string, mongoose.Model<any>> = {
  residential: Residential as any,
  commercial: Commercial as any,
  land: LandPlot as any,
  agricultural: Agricultural as any,
  agri: Agricultural as any,
  project: FeaturedProject as any,
  projects: FeaturedProject as any,
};

const normalizeRole = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

const isCceRole = (roleName = "") => {
  const key = normalizeRole(roleName);
  return key.includes("customer_care");
};

const isOversightRole = (roleName = "") => {
  const key = normalizeRole(roleName);
  return (
    key === "super_admin" ||
    key === "admin" ||
    key.includes("team_lead") ||
    key.includes("support_head")
  );
};

/**
 * PATCH /follow-up/:entity/:id/work-status
 * Body: { followUpWorkStatus: assigned|in_progress|completed }
 */
export const updateListingFollowUpWorkStatus = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const entity = String(req.params.entity || "")
      .trim()
      .toLowerCase();
    const id = String(req.params.id || "").trim();
    const Model = ENTITY_MODELS[entity];
    if (!Model) {
      return res.status(400).json({
        message: "Invalid entity. Use residential|commercial|land|agricultural|project",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid listing id" });
    }

    const rawStatus = String(req.body?.followUpWorkStatus || "")
      .trim()
      .toLowerCase();
    if (!WORK_STATUSES.includes(rawStatus as (typeof WORK_STATUSES)[number])) {
      return res.status(400).json({
        message: "followUpWorkStatus must be assigned, in_progress, or completed",
      });
    }

    const doc = await Model.findById(id);
    if (!doc) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Ensure exclusive owner exists (creator CCE) before process updates.
    await applyListingFollowUpOwner(doc);

    const actorId = String(req.user.sub);
    const actorRole = req.user.roleName || "";
    const ownerId = doc.followUpAssignedTo ? String(doc.followUpAssignedTo) : "";
    const oversight = isOversightRole(actorRole);
    const cceOwner = isCceRole(actorRole) && ownerId === actorId;

    if (!oversight && !cceOwner) {
      return res.status(403).json({
        message: "Only the assigned CCE (or Team Lead / admin) can update this process",
      });
    }

    const completionReason = String(req.body?.completionReason || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    if (rawStatus === "completed" && completionReason.length < 8) {
      return res.status(400).json({
        message: "Enter how this case was completed (at least 8 characters)",
        code: "COMPLETION_REASON_REQUIRED",
      });
    }

    doc.followUpWorkStatus = rawStatus;
    doc.followUpCompletionReason = rawStatus === "completed" ? completionReason : null;
    doc.followUpWorkUpdatedAt = new Date();
    doc.followUpWorkUpdatedBy = new mongoose.Types.ObjectId(actorId);
    await doc.save();

    return res.status(200).json({
      success: true,
      message: "Follow-up process updated",
      data: {
        id: String(doc._id),
        entity,
        followUpAssignedTo: ownerId || String(doc.followUpAssignedTo || "") || null,
        followUpWorkStatus: doc.followUpWorkStatus,
        followUpCompletionReason: doc.followUpCompletionReason || null,
        followUpWorkUpdatedAt: doc.followUpWorkUpdatedAt,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to update listing follow-up process",
      error: error?.message,
    });
  }
};
