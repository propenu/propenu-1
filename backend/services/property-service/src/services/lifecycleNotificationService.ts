import mongoose, { Types } from "mongoose";
import { sendBulkPush } from "../../../../shared/notifications/push.service";
import { getActiveDeviceTokensForUsers } from "../../../../shared/notifications/deviceTokens";

export type LifecycleNotificationType =
  | "property_approved"
  | "property_rejected"
  | "project_approved"
  | "project_rejected"
  | "listing_expiring"
  | "listing_expired"
  | "promotion_started"
  | "promotion_expired";

type ListingKind = "property" | "project";

const WEBSITE = (process.env.FRONTEND_URL || "https://propenu.com").replace(
  /\/$/,
  "",
);

const stringifyData = (data: Record<string, unknown> = {}) =>
  Object.entries(data).reduce<Record<string, string>>((result, [key, value]) => {
    if (value === undefined || value === null) return result;
    result[key] = String(value);
    return result;
  }, {});

const normalizeCategory = (value: unknown) => {
  const token = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

  if (token === "residential") return "residential";
  if (token === "commercial") return "commercial";
  if (token === "agricultural" || token === "agriculture") return "agricultural";
  if (token === "land" || token === "plot" || token === "plots" || token === "landplot") {
    return "land";
  }

  return token || "";
};

const getListingTitle = (listing: Record<string, any>) =>
  String(
    listing.title ||
      listing.projectName ||
      listing.buildingName ||
      "your listing",
  ).trim();

const getOwnerId = (listing: Record<string, any>) =>
  String(
    listing.createdBy?._id ||
      listing.createdBy ||
      listing.ownerId?._id ||
      listing.ownerId ||
      "",
  ).trim();

const getListingPath = ({
  listing,
  kind,
  category,
}: {
  listing: Record<string, any>;
  kind: ListingKind;
  category: string;
}) => {
  const slug = String(listing.slug || "").trim();
  if (!slug) return kind === "project" ? "/builder/my-projects" : "/my-properties";

  if (kind === "project") {
    const promotionType = String(listing.promotion?.type || "").trim().toLowerCase();
    return promotionType === "prime" ? `/prime/${slug}` : `/project/${slug}`;
  }

  return category ? `/properties/${category}/${slug}` : "/my-properties";
};

const getCopy = ({
  type,
  title,
  promotionType,
  rejectedReason,
  expiresAt,
}: {
  type: LifecycleNotificationType;
  title: string;
  promotionType?: string | null | undefined;
  rejectedReason?: string | null | undefined;
  expiresAt?: Date | string | null | undefined;
}) => {
  const promotionLabel = promotionType
    ? `${promotionType.charAt(0).toUpperCase()}${promotionType.slice(1)}`
    : "Promotion";
  const dateLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

  switch (type) {
    case "property_approved":
      return {
        title: "Property Approved",
        body: `${title} is now live on Propenu.`,
      };
    case "property_rejected":
      return {
        title: "Property Rejected",
        body: rejectedReason
          ? `${title} was rejected: ${rejectedReason}`
          : `${title} was rejected. Please review and resubmit.`,
      };
    case "project_approved":
      return {
        title: "Project Approved",
        body: `${title} is now live on Propenu.`,
      };
    case "project_rejected":
      return {
        title: "Project Rejected",
        body: rejectedReason
          ? `${title} was rejected: ${rejectedReason}`
          : `${title} was rejected. Please review and resubmit.`,
      };
    case "listing_expiring":
      return {
        title: "Listing Expiring Soon",
        body: dateLabel
          ? `${title} will expire on ${dateLabel}.`
          : `${title} is expiring soon.`,
      };
    case "listing_expired":
      return {
        title: "Listing Expired",
        body: `${title} has expired and is no longer live.`,
      };
    case "promotion_started":
      return {
        title: `${promotionLabel} Started`,
        body: `${promotionLabel} promotion is active for ${title}.`,
      };
    case "promotion_expired":
      return {
        title: "Promotion Expired",
        body: `${promotionLabel} promotion ended for ${title}.`,
      };
    default:
      return {
        title: "Listing Update",
        body: `${title} has a new update.`,
      };
  }
};

export const notifyLifecycleEvent = async ({
  type,
  listing,
  kind = "property",
  category,
  userId,
  promotionType,
  rejectedReason,
  expiresAt,
  dedupeKey,
  sendPush = true,
}: {
  type: LifecycleNotificationType;
  listing: Record<string, any>;
  kind?: ListingKind;
  category?: string | undefined;
  userId?: string | Types.ObjectId | null | undefined;
  promotionType?: string | null | undefined;
  rejectedReason?: string | null | undefined;
  expiresAt?: Date | string | null | undefined;
  dedupeKey?: string;
  sendPush?: boolean;
}) => {
  try {
    const listingObject =
      typeof listing?.toObject === "function" ? listing.toObject() : listing;
    const recipientId = String(userId || getOwnerId(listingObject)).trim();

    if (!recipientId || !Types.ObjectId.isValid(recipientId)) {
      return { sent: 0, recorded: false };
    }

    const listingId = String(listingObject?._id || "").trim();
    const resolvedCategory = normalizeCategory(
      category ||
        listingObject.categoryType ||
        listingObject.category ||
        listingObject.propertyType ||
        listingObject.type,
    );
    const listingTitle = getListingTitle(listingObject);
    const path = getListingPath({
      listing: listingObject,
      kind,
      category: resolvedCategory,
    });
    const url = `${WEBSITE}${path}`;
    const deepLink = `propenu://${path.replace(/^\//, "")}`;
    const copy = getCopy({
      type,
      title: listingTitle,
      promotionType,
      rejectedReason,
      expiresAt,
    });
    const now = new Date();
    const notificationKey =
      dedupeKey || `${type}:${recipientId}:${listingId || path}:${promotionType || ""}`;

    const db = mongoose.connection.db;
    if (db) {
      await db.collection("usernotifications").updateOne(
        { notificationKey },
        {
          $setOnInsert: {
            notificationKey,
            userId: new Types.ObjectId(recipientId),
            type,
            category: "lifecycle",
            title: copy.title,
            body: copy.body,
            listingKind: kind,
            listingId: listingId || null,
            listingCategory: resolvedCategory || null,
            slug: listingObject.slug || null,
            path,
            url,
            deepLink,
            metadata: {
              promotionType: promotionType || null,
              rejectedReason: rejectedReason || null,
              expiresAt: expiresAt || null,
            },
            readAt: null,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
    }

    if (!sendPush) {
      return { sent: 0, recorded: true };
    }

    const tokens = await getActiveDeviceTokensForUsers([recipientId]);
    if (!tokens.length) {
      return { sent: 0, recorded: true };
    }

    const result = await sendBulkPush({
      tokens,
      title: copy.title,
      body: copy.body,
      data: stringifyData({
        type,
        category: "lifecycle",
        audience: kind === "project" ? "builder" : "owner",
        listingKind: kind,
        listingId,
        propertyType: resolvedCategory,
        categoryType: resolvedCategory,
        slug: listingObject.slug,
        path,
        url,
        deepLink,
        promotionType,
        rejectedReason,
      }),
    });

    return { sent: result.successCount, recorded: true };
  } catch (error) {
    console.error("Lifecycle notification failed:", error);
    return { sent: 0, recorded: false };
  }
};
