import { Response } from "express";
import mongoose from "mongoose";
import FeaturedProject from "../models/featurePropertiesModel";
import { buildManualPromotion, normalizeSponsoredAd } from "../services/promotionService";
import { IPromotion } from "../models/sharedSchemas";
import { AuthRequest } from "../middlewares/authMiddleware";
import { resolveVisibleLeadLimit } from "../utils/promotionAccess";
import { notifyLifecycleEvent } from "../services/lifecycleNotificationService";

type PromotionType = "normal" | "featured" | "sponsored" | "prime";

const ALLOWED_TYPES: PromotionType[] = [
  "normal",
  "featured",
  "sponsored",
  "prime",
];

function appendPromotionHistory(
  property: any,
  req: AuthRequest,
  promotion: IPromotion,
  reason: string,
) {
  const now = new Date();
  const previousPromotion = property.promotion || {};
  const fromType = (previousPromotion.type || "normal") as PromotionType;
  const toType = (promotion.type || "normal") as PromotionType;
  const history = Array.isArray(property.promotionHistory)
    ? property.promotionHistory
    : [];
  const lastHistory = history[history.length - 1];

  if (lastHistory && !lastHistory.endedAt) {
    lastHistory.endedAt = now;
  }

  const changedBy =
    req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id)
      ? new mongoose.Types.ObjectId(req.user.id)
      : undefined;

  property.promotionHistory = history;
  property.lastPromotionType = fromType;
  property.promotionHistory.push({
    fromType,
    toType,
    source: promotion.source || "manual",
    changedBy,
    changedByRole: req.user?.roleName,
    changedByName: String(req.user?.name || "").trim() || undefined,
    changedByEmail: String(req.user?.email || "").trim() || undefined,
    reason,
    startedAt: promotion.startDate || now,
    endedAt: null,
    expiresAt: promotion.boostExpiry || null,
    metadata: {
      previousPriority: previousPromotion.priority ?? 0,
      newPriority: promotion.priority ?? 0,
    },
  });
}

export const promoteProperty = async (req: AuthRequest, res: Response) => {
  try {
    const { type, days, visibleLeadLimit, sponsoredAd, startAt } = req.body;

    if (!type || !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid promotion type",
      });
    }

    const property = await FeaturedProject.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    const promotion: IPromotion = buildManualPromotion(type);
    const now = new Date();
    let startDate = now;
    if (startAt != null && startAt !== "") {
      const requested = new Date(startAt);
      if (Number.isNaN(requested.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid promotion schedule time",
        });
      }
      if (requested.getTime() > now.getTime() + 30_000) {
        startDate = requested;
      }
    }
    const durationDays =
      typeof days === "number" && Number.isFinite(days) && days > 0 ? days : 10;
    promotion.startDate = startDate;
    promotion.boostExpiry = new Date(
      startDate.getTime() + durationDays * 24 * 60 * 60 * 1000,
    );
    const isScheduled = startDate.getTime() > now.getTime() + 30_000;

    const parsedLeadLimit = (() => {
      if (visibleLeadLimit === null || visibleLeadLimit === undefined || visibleLeadLimit === "") {
        return null;
      }
      const n = Number(visibleLeadLimit);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.trunc(n);
    })();

    const nextLeadLimit = resolveVisibleLeadLimit({
      roleName: req.user?.roleName,
      requested: parsedLeadLimit,
      current: property.promotion?.visibleLeadLimit,
      forceZero: type === "normal",
    });
    if (nextLeadLimit !== undefined) {
      promotion.visibleLeadLimit = nextLeadLimit;
    }
    if (type === "normal") {
      promotion.sponsoredAd = {};
    }

    if (type !== "normal") {
      // Location coverage is only used for Sponsored promotions
      promotion.sponsoredAd =
        type === "sponsored" ? normalizeSponsoredAd(sponsoredAd) : {};
    }

    appendPromotionHistory(
      property,
      req,
      promotion,
      isScheduled
        ? `Promotion scheduled as ${promotion.type}`
        : `Promotion changed to ${promotion.type}`,
    );

    property.promotion = promotion as any;
    // Ensure nested numeric field is persisted even if previously null
    property.markModified("promotion");

    // Place at end of target type list inside promote (no separate edit call).
    if (type !== "normal") {
      try {
        const top = await FeaturedProject.findOne({
          _id: { $ne: property._id },
          "promotion.type": type,
          status: { $ne: "inactive" },
        })
          .sort({ rank: -1 })
          .select("rank")
          .lean();
        const maxRank = Number(top?.rank) || 0;
        property.rank = maxRank + 1;
      } catch (rankErr) {
        console.warn("promoteProperty: rank placement skipped", rankErr);
      }
    }

    await property.save();

    if (type !== "normal" && !isScheduled) {
      void notifyLifecycleEvent({
        type: "promotion_started",
        listing: property,
        kind: "project",
        category: property.categoryType,
        promotionType: type,
        expiresAt: promotion.boostExpiry || null,
      });
    }

    return res.status(200).json({
      success: true,
      message: isScheduled
        ? "Promotion scheduled"
        : "Property promoted successfully",
      data: property,
    });
  } catch (err) {
    console.error("promoteProperty error:", err);
    return res.status(500).json({
      success: false,
      message: "Promotion failed",
    });
  }
};

export const renewPromotion = async (req: AuthRequest, res: Response) => {
  try {
    const { type, days, visibleLeadLimit } = req.body;
    const renewalDays = typeof days === "number" ? days : 10;

    if (!Number.isFinite(renewalDays) || renewalDays <= 0) {
      return res.status(400).json({
        success: false,
        message: "Renewal days must be a positive number",
      });
    }

    if (type && !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid promotion type",
      });
    }

    const property = await FeaturedProject.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    const currentPromotion = (property.promotion || {}) as Partial<IPromotion>;
    const currentType = (currentPromotion.type || "normal") as PromotionType;
    const nextType = (type || currentType) as PromotionType;

    if (nextType === "normal") {
      return res.status(400).json({
        success: false,
        message: "Promotion type is required to renew a normal promotion",
      });
    }

    const now = new Date();
    const currentExpiry = currentPromotion.boostExpiry
      ? new Date(currentPromotion.boostExpiry)
      : null;
    const baseDate =
      currentExpiry && currentExpiry.getTime() > now.getTime()
        ? currentExpiry
        : now;

    const promotion: IPromotion = {
      ...buildManualPromotion(nextType),
      startDate: now,
      boostExpiry: new Date(
        baseDate.getTime() + renewalDays * 24 * 60 * 60 * 1000,
      ),
    };

    const requestedLeadLimit = (() => {
      if (visibleLeadLimit === null || visibleLeadLimit === undefined || visibleLeadLimit === "") {
        return null;
      }
      const parsed = Number(visibleLeadLimit);
      if (!Number.isFinite(parsed) || parsed < 0) return null;
      return Math.trunc(parsed);
    })();
    const nextLeadLimit = resolveVisibleLeadLimit({
      roleName: req.user?.roleName,
      requested: requestedLeadLimit,
      current:
        typeof currentPromotion.visibleLeadLimit === "number"
          ? currentPromotion.visibleLeadLimit
          : null,
    });
    if (nextLeadLimit !== undefined) {
      promotion.visibleLeadLimit = nextLeadLimit;
    }

    appendPromotionHistory(
      property,
      req,
      promotion,
      `Promotion renewed for ${renewalDays} day${renewalDays === 1 ? "" : "s"}`,
    );

    property.promotion = promotion as any;

    await property.save();

    return res.status(200).json({
      success: true,
      message: "Promotion renewed successfully",
      data: property,
    });
  } catch (err) {
    console.error("renewPromotion error:", err);
    return res.status(500).json({
      success: false,
      message: "Promotion renewal failed",
    });
  }
};

export const expirePromotion = async (req: AuthRequest, res: Response) => {
  try {
    const property = await FeaturedProject.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    if (!property.promotion) {
      return res.status(400).json({
        message: "No promotion found for this property",
      });
    }

    const previousPromotionType = property.promotion?.type || "normal";
    if (previousPromotionType === "normal") {
      return res.status(400).json({
        success: false,
        message: "This project is already a normal listing",
      });
    }

    const reason = String(req.body?.reason || "").trim();
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "A reason is required to cancel this promotion",
      });
    }
    if (reason.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Reason must be 500 characters or less",
      });
    }

    const promotion = {
      type: "normal",
      priority: 0,
      source: "manual",
      startDate: new Date(),
      boostExpiry: null,
      sponsoredAd: {},
      visibleLeadLimit: 0,
    } as IPromotion;

    appendPromotionHistory(
      property,
      req,
      promotion,
      `Promotion cancelled: ${reason}`,
    );

    property.promotion = promotion as any;

    await property.save();

    if (previousPromotionType !== "normal") {
      void notifyLifecycleEvent({
        type: "promotion_expired",
        listing: property,
        kind: "project",
        category: property.categoryType,
        promotionType: previousPromotionType,
        dedupeKey: `promotion_expired:${String(property._id)}:${previousPromotionType}`,
      });
    }

    return res.json({
      success: true,
      message: "Promotion cancelled and set to normal",
    });
  } catch (err) {
    console.error("expirePromotion error:", err);
    res.status(500).json({ message: "Expire failed" });
  }
};

export const resetPromotion = async (req: AuthRequest, res: Response) => {
  try {
    const property = await FeaturedProject.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    const promotion = {
      type: "normal",
      priority: 0,
      source: "manual",
      startDate: new Date(),
      visibleLeadLimit: 0,
    } as IPromotion;

    appendPromotionHistory(property, req, promotion, "Promotion reset to normal");

    property.promotion = promotion;

    await property.save();

    res.json({ success: true, message: "Reset to normal" });
  } catch (err) {
    res.status(500).json({ message: "Reset failed" });
  }
};
