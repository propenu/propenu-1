import { Response } from "express";
import mongoose from "mongoose";
import FeaturedProject from "../models/featurePropertiesModel";
import {
  buildManualPromotion,
  buildNormalPromotion,
  cloneCoverage,
  describePromotion,
  isCoverageEmpty,
  normalizeSponsoredAd,
} from "../services/promotionService";
import { IPromotion } from "../models/sharedSchemas";
import { AuthRequest } from "../middlewares/authMiddleware";
import {
  canForceManualPromotion,
  resolveVisibleLeadLimit,
} from "../utils/promotionAccess";
import { notifyLifecycleEvent } from "../services/lifecycleNotificationService";
import { BuilderInvoiceRead } from "../models/builderPlanReadModels";
import { findActivePlan } from "../services/planPromotionService";

const INVOICE_REQUIRED_MESSAGE =
  "Invoice required: this project has no paid invoice. Create an invoice in Builder Plans and mark it as Paid, then start the promotion.";

async function invoiceRequiredResponse(
  res: Response,
  projectId: string,
  roleName?: string | null,
) {
  if (canForceManualPromotion(roleName)) return null;
  if (await findActivePlan(projectId)) return null;
  return res.status(403).json({
    success: false,
    needsInvoice: true,
    message: INVOICE_REQUIRED_MESSAGE,
  });
}

type PromotionType = "normal" | "featured" | "sponsored" | "prime";

const ALLOWED_TYPES: PromotionType[] = [
  "normal",
  "featured",
  "sponsored",
  "prime",
];

const MAX_PROMOTION_DAYS = 365;

function readBoolean(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function buildPromotedBy(req: AuthRequest) {
  return {
    userId:
      req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id)
        ? new mongoose.Types.ObjectId(req.user.id)
        : undefined,
    name: String(req.user?.name || "").trim() || undefined,
    email: String(req.user?.email || "").trim() || undefined,
    roleName: req.user?.roleName,
    at: new Date(),
  };
}

function planInvoiceIdOf(promotion: any) {
  return promotion?.source === "subscription" &&
    promotion?.plan?.invoiceId &&
    promotion?.type !== "normal"
    ? String(promotion.plan.invoiceId)
    : "";
}

async function markPlanInvoice(invoiceId: string, status: string, note: string) {
  if (!mongoose.Types.ObjectId.isValid(invoiceId)) return;
  const set: Record<string, unknown> = { promotionStatus: status, promotionNote: note };
  if (status === "cancelled") set.promotionEndedAt = new Date();
  await BuilderInvoiceRead.updateOne({ _id: new mongoose.Types.ObjectId(invoiceId) }, { $set: set });
}

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
    sponsoredEnabled: Boolean(promotion.sponsoredEnabled),
    mainCoverage: isCoverageEmpty(promotion.mainCoverage)
      ? undefined
      : promotion.mainCoverage,
    sponsoredAd: isCoverageEmpty(promotion.sponsoredAd)
      ? undefined
      : promotion.sponsoredAd,
    metadata: {
      previousPriority: previousPromotion.priority ?? 0,
      newPriority: promotion.priority ?? 0,
    },
  });
}

export const promoteProperty = async (req: AuthRequest, res: Response) => {
  try {
    const {
      type,
      days,
      visibleLeadLimit,
      sponsoredAd,
      startAt,
      mainCoverage,
      sponsoredEnabled,
      sponsoredSameAsMain,
    } = req.body;

    if (!type || !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid promotion type",
      });
    }

    const parsedPromoteDays =
      days == null || days === ""
        ? null
        : Math.trunc(Number(days));
    if (
      parsedPromoteDays != null &&
      (!Number.isFinite(parsedPromoteDays) ||
        parsedPromoteDays <= 0 ||
        parsedPromoteDays > MAX_PROMOTION_DAYS)
    ) {
      return res.status(400).json({
        success: false,
        message: `Duration must be between 1 and ${MAX_PROMOTION_DAYS} days`,
      });
    }

    const isMainPlacement = type === "prime" || type === "featured";
    const withSponsored = isMainPlacement && readBoolean(sponsoredEnabled);
    const sameAsMain = withSponsored && readBoolean(sponsoredSameAsMain);
    const nextMainCoverage = isMainPlacement ? normalizeSponsoredAd(mainCoverage) : {};
    const nextSponsoredAd =
      type === "sponsored"
        ? normalizeSponsoredAd(sponsoredAd)
        : withSponsored
          ? sameAsMain
            ? cloneCoverage(nextMainCoverage)
            : normalizeSponsoredAd(sponsoredAd)
          : {};

    if (withSponsored && sameAsMain && isCoverageEmpty(nextMainCoverage)) {
      return res.status(400).json({
        success: false,
        message:
          "Pick at least one location to copy into Sponsored, or choose separate Sponsored locations",
      });
    }
    if (withSponsored && isCoverageEmpty(nextSponsoredAd)) {
      return res.status(400).json({
        success: false,
        message: "Pick at least one Sponsored location",
      });
    }

    const property = await FeaturedProject.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    if (type !== "normal") {
      const blocked = await invoiceRequiredResponse(
        res,
        String(property._id),
        req.user?.roleName,
      );
      if (blocked) return blocked;
    }

    const previousType = property.promotion?.type || "normal";
    const now = new Date();
    const promotion: IPromotion =
      type === "normal" ? buildNormalPromotion(now) : buildManualPromotion(type);
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
      parsedPromoteDays != null && Number.isFinite(parsedPromoteDays)
        ? parsedPromoteDays
        : 30;
    promotion.startDate = startDate;
    if (type !== "normal") {
      promotion.boostExpiry = new Date(
        startDate.getTime() + durationDays * 24 * 60 * 60 * 1000,
      );
    }
    const isScheduled =
      type !== "normal" && startDate.getTime() > now.getTime() + 30_000;

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
    promotion.mainCoverage = nextMainCoverage;
    promotion.sponsoredEnabled = withSponsored;
    promotion.sponsoredSameAsMain = sameAsMain;
    promotion.sponsoredAd = nextSponsoredAd;
    promotion.promotedBy = buildPromotedBy(req);

    const label = describePromotion(promotion);
    appendPromotionHistory(
      property,
      req,
      promotion,
      isScheduled
        ? `Promotion scheduled as ${label}`
        : `Promotion changed to ${label}`,
    );

    const replacedPlanInvoiceId = planInvoiceIdOf(property.promotion);
    property.promotion = promotion as any;
    // Ensure nested numeric field is persisted even if previously null
    property.markModified("promotion");
    (property as any).promotionMode = "manual";

    // Place at end of target type list inside promote (no separate edit call).
    // Re-promoting the same type (e.g. a location change) keeps its rank.
    if (type !== "normal" && type !== previousType) {
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

    if (replacedPlanInvoiceId) {
      await markPlanInvoice(
        replacedPlanInvoiceId,
        "waiting_team",
        "Replaced by a direct promotion on the project card.",
      );
    }

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
    const parsedDays = Math.trunc(Number(days ?? 10));
    const renewalDays =
      Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : NaN;

    if (!Number.isFinite(renewalDays) || renewalDays <= 0) {
      return res.status(400).json({
        success: false,
        message: "Renewal days must be a positive number",
      });
    }

    if (renewalDays > 365) {
      return res.status(400).json({
        success: false,
        message: "Renewal days cannot exceed 365",
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
    const forceManual = canForceManualPromotion(req.user?.roleName);
    const previousPlanInvoiceId = planInvoiceIdOf(currentPromotion);

    if (previousPlanInvoiceId && !forceManual) {
      return res.status(400).json({
        success: false,
        needsInvoice: true,
        message: `This promotion comes from ${
          currentPromotion.plan?.title || "a builder plan"
        }. Renew it by creating a renewal invoice in Builder Plans; the promotion extends on its own.`,
      });
    }

    if (nextType === "normal") {
      return res.status(400).json({
        success: false,
        message: "Promotion type is required to renew a normal promotion",
      });
    }

    const blocked = await invoiceRequiredResponse(
      res,
      String(property._id),
      req.user?.roleName,
    );
    if (blocked) return blocked;

    const now = new Date();
    const currentExpiry = currentPromotion.boostExpiry
      ? new Date(currentPromotion.boostExpiry)
      : null;
    const baseDate =
      currentExpiry && currentExpiry.getTime() > now.getTime()
        ? currentExpiry
        : now;

    const keepPlacement = nextType === currentType;
    const promotion: IPromotion = {
      ...buildManualPromotion(nextType),
      startDate: now,
      boostExpiry: new Date(
        baseDate.getTime() + renewalDays * 24 * 60 * 60 * 1000,
      ),
      promotedBy: buildPromotedBy(req),
    };
    if (keepPlacement) {
      promotion.mainCoverage = cloneCoverage(currentPromotion.mainCoverage);
      promotion.sponsoredEnabled = Boolean(currentPromotion.sponsoredEnabled);
      promotion.sponsoredSameAsMain = Boolean(currentPromotion.sponsoredSameAsMain);
      promotion.sponsoredAd = cloneCoverage(currentPromotion.sponsoredAd);
    }

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

    const renewReason = previousPlanInvoiceId
      ? `Direct head renewal for ${renewalDays} day${
          renewalDays === 1 ? "" : "s"
        } (detached from builder plan invoice)`
      : `Promotion renewed for ${renewalDays} day${renewalDays === 1 ? "" : "s"}`;

    appendPromotionHistory(property, req, promotion, renewReason);

    property.promotion = promotion as any;
    if (previousPlanInvoiceId) {
      (property as any).promotionMode = "manual";
    }

    await property.save();

    if (previousPlanInvoiceId) {
      await markPlanInvoice(
        previousPlanInvoiceId,
        "cancelled",
        `Superseded by head direct renewal (${renewalDays} days)`,
      );
    }

    return res.status(200).json({
      success: true,
      message: `Promotion renewed for ${renewalDays} day${
        renewalDays === 1 ? "" : "s"
      }`,
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

    const promotion: IPromotion = {
      ...buildNormalPromotion(),
      promotedBy: buildPromotedBy(req),
    };

    const cancelledPlanInvoiceId = planInvoiceIdOf(property.promotion);
    const reasonText = sentenceCase(reason);

    appendPromotionHistory(
      property,
      req,
      promotion,
      cancelledPlanInvoiceId
        ? `Builder plan promotion cancelled. Reason: ${reasonText}`
        : `Promotion cancelled. Reason: ${reasonText}`,
    );

    property.promotion = promotion as any;
    if (cancelledPlanInvoiceId) (property as any).promotionMode = "manual";

    await property.save();

    if (cancelledPlanInvoiceId) {
      await markPlanInvoice(
        cancelledPlanInvoiceId,
        "cancelled",
        `Cancelled on the project card. Reason: ${reasonText}`,
      );
    }

    void notifyLifecycleEvent({
      type: "promotion_expired",
      listing: property,
      kind: "project",
      category: property.categoryType,
      promotionType: previousPromotionType,
      dedupeKey: `promotion_expired:${String(property._id)}:${previousPromotionType}`,
    });

    return res.json({
      success: true,
      message: "Promotion cancelled and set to normal",
    });
  } catch (err) {
    console.error("expirePromotion error:", err);
    res.status(500).json({ message: "Expire failed" });
  }
};

/** "date" → "Date." — capitalised first letter and a closing full stop. */
function sentenceCase(text: string) {
  const value = String(text || "").trim().replace(/\s+/g, " ");
  if (!value) return value;
  const capped = value.charAt(0).toUpperCase() + value.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

export const resetPromotion = async (req: AuthRequest, res: Response) => {
  try {
    const property = await FeaturedProject.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    const promotion: IPromotion = {
      ...buildNormalPromotion(),
      promotedBy: buildPromotedBy(req),
    };

    const resetPlanInvoiceId = planInvoiceIdOf(property.promotion);

    appendPromotionHistory(property, req, promotion, "Promotion reset to normal");

    property.promotion = promotion;
    if (resetPlanInvoiceId) (property as any).promotionMode = "manual";

    await property.save();

    if (resetPlanInvoiceId) {
      await markPlanInvoice(resetPlanInvoiceId, "cancelled", "Promotion reset to normal on the project card.");
    }

    res.json({ success: true, message: "Reset to normal" });
  } catch (err) {
    res.status(500).json({ message: "Reset failed" });
  }
};
