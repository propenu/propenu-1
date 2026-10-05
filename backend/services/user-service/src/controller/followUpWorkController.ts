import { Response } from "express";
import mongoose from "mongoose";
import User from "../models/userModel";
import { AuthRequest } from "../middlewares/authMiddleware";

const WORK_STATUSES = ["assigned", "in_progress", "completed"] as const;
export type FollowUpWorkStatus = (typeof WORK_STATUSES)[number];

const normalizeRole = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

const isCceRole = (roleName = "") => {
  const key = normalizeRole(roleName);
  return (
    key.includes("customer_care") ||
    key === "customer_care" ||
    key === "customer_care_executive" ||
    key === "customer_care_executives"
  );
};

const isOversightRole = (roleName = "") => {
  const key = normalizeRole(roleName);
  return (
    key === "super_admin" ||
    key === "admin" ||
    key === "team_lead" ||
    key === "customer_support_team_lead" ||
    key === "team_leads" ||
    key.includes("team_lead") ||
    key.includes("support_head") ||
    key === "customer_support_head"
  );
};

/**
 * PATCH /auth/:id/follow-up-work-status
 * CCE: only cases assigned to them.
 * Team Lead / Head / Admin: any case (oversight).
 * Does not change followUpAssignedTo, accountStatus, or journey fields.
 */
export const updateFollowUpWorkStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const targetId = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const rawStatus = String(req.body?.followUpWorkStatus || "")
      .trim()
      .toLowerCase();
    if (!WORK_STATUSES.includes(rawStatus as FollowUpWorkStatus)) {
      return res.status(400).json({
        message: "followUpWorkStatus must be assigned, in_progress, or completed",
        code: "VALIDATION_ERROR",
      });
    }

    const target = await User.findById(targetId).select(
      "name followUpAssignedTo followUpWorkStatus accountStatus",
    );
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    const actorRole = req.user.roleName || "";
    const actorId = String(req.user.sub);
    const assigneeId = target.followUpAssignedTo
      ? String(target.followUpAssignedTo)
      : "";

    const oversight = isOversightRole(actorRole);
    const cceOwner = isCceRole(actorRole) && assigneeId === actorId;

    if (!oversight && !cceOwner) {
      return res.status(403).json({
        message: "Only the assigned CCE (or Team Lead / admin) can update this follow-up process",
      });
    }

    if (!assigneeId && isCceRole(actorRole) && !oversight) {
      return res.status(400).json({
        message: "This case has no CCE assignee yet",
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

    target.followUpWorkStatus = rawStatus as FollowUpWorkStatus;
    target.followUpCompletionReason =
      rawStatus === "completed" ? completionReason : null;
    target.followUpWorkUpdatedAt = new Date();
    target.followUpWorkUpdatedBy = new mongoose.Types.ObjectId(actorId);
    await target.save();

    return res.status(200).json({
      success: true,
      message: "Follow-up process updated",
      data: {
        userId: String(target._id),
        followUpWorkStatus: target.followUpWorkStatus,
        followUpCompletionReason: target.followUpCompletionReason || null,
        followUpWorkUpdatedAt: target.followUpWorkUpdatedAt,
        followUpAssignedTo: assigneeId || null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to update follow-up process",
      error: error?.message,
    });
  }
};
