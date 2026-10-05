import FeaturedProject from "../models/featurePropertiesModel";
import { CATEGORY_MODELS } from "../controller/listingPromotionController";
import { notifyLifecycleEvent } from "../services/lifecycleNotificationService";

const ONE_HOUR_MS = 60 * 60 * 1000;
const PROMOTED_TYPES = ["featured", "sponsored", "prime"];

async function resetExpiredOnModel(
  Model: any,
  label: string,
  kind: "property" | "project" = "property",
) {
  const now = new Date();

  const expiredDocs = await Model.find({
    "promotion.type": { $in: PROMOTED_TYPES },
    $or: [
      { "promotion.boostExpiry": { $lte: now } },
      { "promotion.boostExpiry": { $exists: false } },
      { "promotion.boostExpiry": null },
    ],
  });

  for (const doc of expiredDocs) {
    const docAny = doc as any;
    const previousPromotion = docAny.promotion || {};
    const history = Array.isArray(docAny.promotionHistory)
      ? docAny.promotionHistory
      : [];
    const lastHistory = history[history.length - 1];

    if (lastHistory && !lastHistory.endedAt) {
      lastHistory.endedAt = now;
    }

    docAny.promotionHistory = history;
    docAny.lastPromotionType = previousPromotion.type || "normal";
    docAny.promotionHistory.push({
      fromType: previousPromotion.type || "normal",
      toType: "normal",
      source: "system",
      reason: "Promotion expired automatically",
      startedAt: now,
      endedAt: null,
      expiresAt: null,
      metadata: {
        previousPriority: previousPromotion.priority ?? 0,
        newPriority: 0,
      },
    });

    docAny.promotion = {
      type: "normal",
      priority: 0,
      source: "manual",
      startDate: now,
      visibleLeadLimit: 0,
    };
    docAny.markModified?.("promotion");

    await doc.save();

    void notifyLifecycleEvent({
      type: "promotion_expired",
      listing: doc,
      kind,
      category: kind === "project" ? docAny.categoryType : label,
      promotionType: previousPromotion.type || "normal",
      dedupeKey: `promotion_expired:${String(docAny._id)}:${previousPromotion.type || "normal"}`,
    });
  }

  if (expiredDocs.length > 0) {
    console.log(
      `Reset ${expiredDocs.length} expired ${label} promotions to normal`,
    );
  }

  return expiredDocs.length;
}

export async function resetExpiredPromotions() {
  let total = 0;
  total += await resetExpiredOnModel(FeaturedProject, "project", "project");

  for (const [category, Model] of Object.entries(CATEGORY_MODELS)) {
    total += await resetExpiredOnModel(Model, category);
  }

  return total;
}

async function notifyListingExpiriesOnModel(Model: any, label: string) {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const expiringDocs = await Model.find({
    status: "active",
    subscriptionEndDate: { $gt: now, $lte: soon },
  });

  for (const doc of expiringDocs) {
    const docAny = doc as any;
    void notifyLifecycleEvent({
      type: "listing_expiring",
      listing: doc,
      kind: "property",
      category: label,
      expiresAt: docAny.subscriptionEndDate,
      dedupeKey: `listing_expiring:${String(docAny._id)}:${new Date(
        docAny.subscriptionEndDate,
      )
        .toISOString()
        .slice(0, 10)}`,
    });
  }

  const expiredDocs = await Model.find({
    status: "active",
    subscriptionEndDate: { $lte: now },
  });

  for (const doc of expiredDocs) {
    const docAny = doc as any;
    docAny.status = "expired";
    docAny.isPublished = false;
    await doc.save();

    void notifyLifecycleEvent({
      type: "listing_expired",
      listing: doc,
      kind: "property",
      category: label,
      expiresAt: docAny.subscriptionEndDate,
      dedupeKey: `listing_expired:${String(docAny._id)}`,
    });
  }

  return {
    expiring: expiringDocs.length,
    expired: expiredDocs.length,
  };
}

export async function processListingExpiries() {
  let expiring = 0;
  let expired = 0;

  for (const [category, Model] of Object.entries(CATEGORY_MODELS)) {
    const result = await notifyListingExpiriesOnModel(Model, category);
    expiring += result.expiring;
    expired += result.expired;
  }

  if (expiring || expired) {
    console.log(`Processed listing expiry notifications: ${expiring} expiring, ${expired} expired`);
  }

  return { expiring, expired };
}

export function startPromotionExpiryJob() {
  resetExpiredPromotions().catch((error) => {
    console.error("Promotion expiry cleanup failed:", error);
  });
  processListingExpiries().catch((error) => {
    console.error("Listing expiry cleanup failed:", error);
  });

  setInterval(() => {
    resetExpiredPromotions().catch((error) => {
      console.error("Promotion expiry cleanup failed:", error);
    });
    processListingExpiries().catch((error) => {
      console.error("Listing expiry cleanup failed:", error);
    });
  }, ONE_HOUR_MS);
}
