import { Response } from "express";
import mongoose from "mongoose";
import FeaturedProject from "../models/featurePropertiesModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import { describePromotion } from "../services/promotionService";
import { BuilderInvoiceRead } from "../models/builderPlanReadModels";
import {
  PlanActor,
  applyPlanPromotion,
  describePackage,
  findActivePlan,
  getProjectPlanStatus,
  isProjectApproved,
  packageMainType,
  syncAllPlanPromotions,
  syncProjectPlanPromotion,
} from "../services/planPromotionService";

function actorFrom(req: AuthRequest): PlanActor {
  return {
    userId: req.user?.id,
    name: String(req.user?.name || "").trim() || undefined,
    email: String(req.user?.email || "").trim() || undefined,
    roleName: req.user?.roleName,
  };
}

function readBoolean(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function validProjectId(req: AuthRequest, res: Response) {
  const id = String(req.params.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: "Invalid project id" });
    return null;
  }
  return id;
}

function liveManualPromotion(promo: any) {
  if (!promo?.type || promo.type === "normal") return false;
  if (promo.source === "subscription" && promo.plan?.invoiceId) return false;
  return !promo.boostExpiry || new Date(promo.boostExpiry).getTime() > Date.now();
}

function replaceMessage(promo: any, planTitle: string | undefined) {
  const until = promo?.boostExpiry
    ? ` until ${new Date(promo.boostExpiry).toLocaleDateString("en-IN")}`
    : "";
  return `A direct ${describePromotion(promo)} promotion is running${until}. Replace it with ${
    planTitle || "the builder plan"
  }?`;
}

export const getPlanStatus = async (req: AuthRequest, res: Response) => {
  try {
    const id = validProjectId(req, res);
    if (!id) return;
    const status = await getProjectPlanStatus(id);
    if (!status) return res.status(404).json({ success: false, message: "Project not found" });
    return res.json({ success: true, data: status });
  } catch (err) {
    console.error("getPlanStatus error:", err);
    return res.status(500).json({ success: false, message: "Could not load plan status" });
  }
};

/** Project card dropdown: Automatic (plan drives everything) or Direct (team runs it). */
export const setPromotionMode = async (req: AuthRequest, res: Response) => {
  try {
    const id = validProjectId(req, res);
    if (!id) return;
    const mode = String(req.body?.mode || "");
    if (mode !== "auto" && mode !== "manual") {
      return res.status(400).json({ success: false, message: "Mode must be auto or manual" });
    }

    const project: any = await FeaturedProject.findById(id);
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });
    const promo = project.promotion || {};
    const linked = promo.source === "subscription" && promo.plan?.invoiceId;

    if (mode === "manual") {
      project.promotionMode = "manual";
      if (linked && promo.type !== "normal") {
        const invoiceId = String(promo.plan.invoiceId);
        project.promotionHistory = Array.isArray(project.promotionHistory)
          ? project.promotionHistory
          : [];
        const last = project.promotionHistory[project.promotionHistory.length - 1];
        if (last && !last.endedAt) last.endedAt = new Date();
        project.promotionHistory.push({
          fromType: promo.type,
          toType: promo.type,
          source: "manual",
          changedBy: mongoose.Types.ObjectId.isValid(String(req.user?.id))
            ? new mongoose.Types.ObjectId(String(req.user?.id))
            : undefined,
          changedByRole: req.user?.roleName,
          changedByName: actorFrom(req).name,
          changedByEmail: actorFrom(req).email,
          reason: `Switched to Direct; ${promo.plan.title || "builder plan"} no longer controls this promotion`,
          startedAt: new Date(),
          endedAt: null,
          expiresAt: promo.boostExpiry || null,
          sponsoredEnabled: Boolean(promo.sponsoredEnabled),
          mainCoverage: promo.mainCoverage,
          sponsoredAd: promo.sponsoredAd,
        });
        promo.source = "manual";
        promo.deliveryMode = "manual";
        promo.plan = undefined;
        project.markModified("promotion");
        await BuilderInvoiceRead.updateOne(
          { _id: new mongoose.Types.ObjectId(invoiceId) },
          {
            $set: {
              promotionStatus: "waiting_team",
              promotionNote: "Switched to Direct promotions on the project card.",
            },
          },
        );
      }
      await project.save();
      return res.json({
        success: true,
        message: "Direct promotions: the team controls this project's promotion",
        data: await getProjectPlanStatus(id),
      });
    }

    const active = await findActivePlan(id);
    if (!active) {
      return res.status(400).json({
        success: false,
        message: "No paid builder plan covers this project. Create an invoice in Builder Plans first.",
      });
    }
    if (packageMainType(active.pkg) === "normal") {
      return res.status(400).json({
        success: false,
        message: `${active.pkg.title || "This plan"} is listing only and has no promotion.`,
      });
    }

    const replacing = liveManualPromotion(promo);
    if (replacing && !readBoolean(req.body?.confirmReplace)) {
      return res.status(409).json({
        success: false,
        needsConfirm: true,
        message: replaceMessage(promo, active.pkg.title),
      });
    }

    project.promotionMode = "auto";
    if (linked && promo.type !== "normal") {
      promo.deliveryMode = "auto";
      project.markModified("promotion");
      await project.save();
      await syncProjectPlanPromotion(id);
    } else if (replacing) {
      if (!isProjectApproved(project)) {
        await project.save();
        return res.status(400).json({
          success: false,
          message: "Approve the project first. The plan starts automatically after approval.",
        });
      }
      const result = await applyPlanPromotion(project, active, {
        deliveryMode: "auto",
        actor: actorFrom(req),
        reason: `${active.pkg.title || "Builder plan"} (${describePackage(active.pkg)}) replaced the direct promotion`,
      });
      if (!result.ok) {
        await project.save();
        return res.status(400).json({ success: false, message: result.message });
      }
    } else {
      await project.save();
      await syncProjectPlanPromotion(id);
    }

    const status = await getProjectPlanStatus(id);
    const started = status?.linkedToPlan;
    return res.json({
      success: true,
      message: started
        ? `Automatic: ${describePackage(active.pkg)} runs from ${active.pkg.title || "the builder plan"}`
        : status?.plan?.note || "Automatic mode saved",
      data: status,
    });
  } catch (err) {
    console.error("setPromotionMode error:", err);
    return res.status(500).json({ success: false, message: "Could not change promotion mode" });
  }
};

/** One-button start: plan decides placement, dates and leads; the team may pick locations. */
export const startFromPlan = async (req: AuthRequest, res: Response) => {
  try {
    const id = validProjectId(req, res);
    if (!id) return;
    const project: any = await FeaturedProject.findById(id);
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    if (!isProjectApproved(project)) {
      return res.status(400).json({
        success: false,
        message: "Approve the project first. Only Active / Approved projects can be promoted.",
      });
    }

    const active = await findActivePlan(id);
    if (!active) {
      return res.status(400).json({
        success: false,
        message: "No paid builder plan covers this project. Create an invoice in Builder Plans first.",
      });
    }

    const promo = project.promotion || {};
    if (liveManualPromotion(promo) && !readBoolean(req.body?.confirmReplace)) {
      return res.status(409).json({
        success: false,
        needsConfirm: true,
        message: replaceMessage(promo, active.pkg.title),
      });
    }

    const { mainCoverage, sponsoredAd, sponsoredSameAsMain } = req.body || {};
    project.promotionMode = "plan";
    const result = await applyPlanPromotion(project, active, {
      deliveryMode: "plan",
      actor: actorFrom(req),
      override: {
        mainCoverage,
        sponsoredAd,
        sponsoredSameAsMain:
          sponsoredSameAsMain === undefined ? undefined : readBoolean(sponsoredSameAsMain),
      },
    });
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message });
    }

    return res.json({
      success: true,
      message: result.scheduled ? "Plan promotion scheduled" : "Plan promotion started",
      data: project,
    });
  } catch (err) {
    console.error("startFromPlan error:", err);
    return res.status(500).json({ success: false, message: "Could not start the plan promotion" });
  }
};

export const syncProjectPlan = async (req: AuthRequest, res: Response) => {
  try {
    const id = validProjectId(req, res);
    if (!id) return;
    const result = await syncProjectPlanPromotion(id);
    return res.json({ success: true, data: { ...result, status: await getProjectPlanStatus(id) } });
  } catch (err) {
    console.error("syncProjectPlan error:", err);
    return res.status(500).json({ success: false, message: "Plan sync failed" });
  }
};

export const syncAllPlans = async (_req: AuthRequest, res: Response) => {
  try {
    const processed = await syncAllPlanPromotions();
    return res.json({ success: true, data: { processed } });
  } catch (err) {
    console.error("syncAllPlans error:", err);
    return res.status(500).json({ success: false, message: "Plan sync failed" });
  }
};
