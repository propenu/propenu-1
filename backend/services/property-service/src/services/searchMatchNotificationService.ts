import mongoose, { Types } from "mongoose";
import { sendPlatformPush } from "../../../../shared/notifications/push.service";
import {
  getActiveDeviceTokenRowsForUsers,
} from "../../../../shared/notifications/deviceTokens";

const RECENT_SEARCH_DAYS =
  Number(process.env.SEARCH_MATCH_LOOKBACK_DAYS) || 30;
const MAX_MATCHED_USERS =
  Number(process.env.SEARCH_MATCH_MAX_USERS) || 200;
const WEBSITE = (process.env.FRONTEND_URL || "https://propenu.com").replace(
  /\/$/,
  "",
);

type ListingKind = "property" | "project";
type ListingCategory =
  | "residential"
  | "commercial"
  | "land"
  | "agricultural";

type SearchMatchListingInput = {
  listing: Record<string, any>;
  kind?: ListingKind;
  category?: ListingCategory;
};

type SearchActionRow = {
  userId: Types.ObjectId;
  action: {
    eventType?: string;
    searchContext?: Record<string, unknown>;
    serverTimestamp?: Date | string;
  };
};

function normalizeToken(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function normalizeCategory(value: unknown): ListingCategory | undefined {
  const token = normalizeToken(value);
  if (token === "residential") return "residential";
  if (token === "commercial") return "commercial";
  if (token === "agricultural" || token === "agriculture") return "agricultural";
  if (token === "land" || token === "plot" || token === "plots" || token === "landplot") {
    return "land";
  }
  return undefined;
}

function splitCsv(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getListingPriceRange(listing: Record<string, any>) {
  const prices = [
    listing.price,
    listing.priceFrom,
    listing.priceTo,
    ...(Array.isArray(listing.projectSummary)
      ? listing.projectSummary.flatMap((summary: any) =>
          Array.isArray(summary?.units)
            ? summary.units.flatMap((unit: any) => [
                unit?.minPrice,
                unit?.maxPrice,
              ])
            : [],
        )
      : []),
    ...(Array.isArray(listing.bhkSummary)
      ? listing.bhkSummary.flatMap((summary: any) => [
          summary?.minPrice,
          summary?.maxPrice,
          ...(Array.isArray(summary?.units)
            ? summary.units.flatMap((unit: any) => [
                unit?.minPrice,
                unit?.maxPrice,
              ])
            : []),
        ])
      : []),
  ]
    .map(toNumber)
    .filter((value): value is number => value !== undefined && value > 0);

  if (!prices.length) return {};

  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

function getListingBedrooms(listing: Record<string, any>) {
  const values = [
    listing.bhk,
    listing.bedrooms,
    ...(Array.isArray(listing.projectSummary)
      ? listing.projectSummary.map((summary: any) => summary?.bhk)
      : []),
    ...(Array.isArray(listing.bhkSummary)
      ? listing.bhkSummary.map((summary: any) => summary?.bhk)
      : []),
  ]
    .map(toNumber)
    .filter((value): value is number => value !== undefined && value > 0);

  return Array.from(new Set(values));
}

function getListingTitle(listing: Record<string, any>) {
  return (
    String(
      listing.title ||
        listing.projectName ||
        listing.buildingName ||
        "New property",
    ).trim() || "New property"
  );
}

function getListingCategory(
  listing: Record<string, any>,
  fallback?: ListingCategory,
) {
  return (
    fallback ||
    normalizeCategory(listing.categoryType) ||
    normalizeCategory(listing.category) ||
    normalizeCategory(listing.type) ||
    normalizeCategory(listing.propertyType)
  );
}

function getListingPath({
  listing,
  kind,
  category,
}: Required<SearchMatchListingInput>) {
  const slug = String(listing.slug || "").trim();
  if (!slug) return "/";

  if (kind === "project") {
    const promotionType = normalizeToken(listing.promotion?.type);
    return promotionType === "prime" ? `/prime/${slug}` : `/project/${slug}`;
  }

  return `/properties/${category}/${slug}`;
}

function hasLocationMatch(
  searchContext: Record<string, unknown>,
  listing: Record<string, any>,
) {
  const city = normalizeToken(searchContext.city);
  const state = normalizeToken(searchContext.state);
  const listingCity = normalizeToken(listing.city);
  const listingState = normalizeToken(listing.state);

  if (city && listingCity && city !== listingCity) return false;
  if (state && listingState && state !== listingState) return false;

  const searchedLocalities = splitCsv(searchContext.locality).map(normalizeToken);
  const listingLocality = normalizeToken(listing.locality);

  if (
    searchedLocalities.length > 0 &&
    listingLocality &&
    !searchedLocalities.includes(listingLocality)
  ) {
    return false;
  }

  return true;
}

function hasPriceMatch(
  searchContext: Record<string, unknown>,
  listing: Record<string, any>,
) {
  const minPrice = toNumber(searchContext.minPrice);
  const maxPrice = toNumber(searchContext.maxPrice);
  const listingPrice = getListingPriceRange(listing);

  if (!listingPrice.min && !listingPrice.max) return true;

  if (maxPrice && listingPrice.min && listingPrice.min > maxPrice) return false;
  if (minPrice && listingPrice.max && listingPrice.max < minPrice) return false;

  return true;
}

function hasBedroomMatch(
  searchContext: Record<string, unknown>,
  listing: Record<string, any>,
) {
  const requestedBedrooms = splitCsv(searchContext.bedrooms)
    .map((token) => token === "6plus" ? 6 : toNumber(token))
    .filter((value): value is number => value !== undefined && value > 0);

  if (!requestedBedrooms.length) return true;

  const listingBedrooms = getListingBedrooms(listing);
  if (!listingBedrooms.length) return true;

  return requestedBedrooms.some((bedroom) =>
    listingBedrooms.some((candidate) =>
      bedroom >= 6 ? candidate >= 6 : candidate === bedroom,
    ),
  );
}

function hasTextMatch(
  searchContext: Record<string, unknown>,
  listing: Record<string, any>,
) {
  const query = normalizeToken(searchContext.search || searchContext.query || searchContext.q);
  if (!query) return true;

  const searchable = [
    listing.title,
    listing.projectName,
    listing.buildingName,
    listing.locality,
    listing.city,
    listing.state,
    listing.propertyType,
    listing.propertySubType,
  ]
    .map(normalizeToken)
    .filter(Boolean)
    .join(" ");

  return searchable.includes(query);
}

function isSearchMatch({
  searchContext,
  listing,
  category,
}: {
  searchContext: Record<string, unknown>;
  listing: Record<string, any>;
  category: ListingCategory;
}) {
  const searchedCategory = normalizeCategory(searchContext.category || searchContext.type);
  if (searchedCategory && searchedCategory !== category) return false;

  const searchedListingType = normalizeToken(searchContext.listingType);
  const listingType = normalizeToken(listing.listingType);
  if (searchedListingType && listingType && searchedListingType !== listingType) {
    return false;
  }

  return (
    hasLocationMatch(searchContext, listing) &&
    hasPriceMatch(searchContext, listing) &&
    hasBedroomMatch(searchContext, listing) &&
    hasTextMatch(searchContext, listing)
  );
}

function getNotificationCopy({
  listing,
  category,
}: {
  listing: Record<string, any>;
  category: ListingCategory;
}) {
  const bedrooms = getListingBedrooms(listing).sort((a, b) => a - b);
  const bedroomLabel =
    category === "residential" && bedrooms.length
      ? `${bedrooms[0]} BHK `
      : "";
  const city = String(listing.city || listing.locality || "").trim();
  const title = `New ${bedroomLabel}${category === "land" ? "plot" : category} found`;
  const body = city
    ? `A verified listing in ${city} matches your recent search.`
    : `${getListingTitle(listing)} matches your recent search.`;

  return { title, body };
}

export async function notifySearchMatchesForListing({
  listing,
  kind = "property",
  category: providedCategory,
}: SearchMatchListingInput) {
  try {
    const listingObject = typeof listing?.toObject === "function"
      ? listing.toObject()
      : listing;
    const category = getListingCategory(listingObject, providedCategory);
    const listingId = String(listingObject?._id || "").trim();

    if (!listingId || !category || !listingObject?.slug) {
      return { matchedUsers: 0, sent: 0 };
    }

    const ownerId = String(listingObject.createdBy || listingObject.ownerId || "").trim();
    const cutoff = new Date(Date.now() - RECENT_SEARCH_DAYS * 24 * 60 * 60 * 1000);
    const db = mongoose.connection.db;
    if (!db) return { matchedUsers: 0, sent: 0 };

    const ownerObjectId =
      ownerId && Types.ObjectId.isValid(ownerId)
        ? new Types.ObjectId(ownerId)
        : null;

    const rows = await db
      .collection("userinteractions")
      .aggregate<SearchActionRow>([
        {
          $match: {
            kind: "account",
            ...(ownerObjectId ? { userId: { $ne: ownerObjectId } } : {}),
            actions: {
              $elemMatch: {
                eventType: { $in: ["search_performed", "filter_applied"] },
                serverTimestamp: { $gte: cutoff },
                searchContext: { $type: "object" },
              },
            },
          },
        },
        { $unwind: "$actions" },
        {
          $match: {
            "actions.eventType": { $in: ["search_performed", "filter_applied"] },
            "actions.serverTimestamp": { $gte: cutoff },
            "actions.searchContext": { $type: "object" },
          },
        },
        { $sort: { "actions.serverTimestamp": -1 } },
        {
          $group: {
            _id: "$userId",
            userId: { $first: "$userId" },
            action: { $first: "$actions" },
          },
        },
        { $limit: MAX_MATCHED_USERS },
      ])
      .toArray();

    const matchedUserIds = rows
      .filter((row) =>
        isSearchMatch({
          searchContext: row.action.searchContext || {},
          listing: listingObject,
          category,
        }),
      )
      .map((row) => row.userId);

    if (!matchedUserIds.length) return { matchedUsers: 0, sent: 0 };

    const notificationCollection = db.collection("searchmatchnotifications");
    const eligibleUserIds: Types.ObjectId[] = [];
    const now = new Date();

    for (const userId of matchedUserIds) {
      const result = await notificationCollection.updateOne(
        {
          userId,
          listingId,
          listingKind: kind,
        },
        {
          $setOnInsert: {
            userId,
            listingId,
            listingKind: kind,
            createdAt: now,
          },
        },
        { upsert: true },
      );

      if (result.upsertedCount > 0) {
        eligibleUserIds.push(userId);
      }
    }

    if (!eligibleUserIds.length) {
      return { matchedUsers: matchedUserIds.length, sent: 0 };
    }

    const deviceRows = await getActiveDeviceTokenRowsForUsers(eligibleUserIds);
    if (!deviceRows.length) {
      return { matchedUsers: matchedUserIds.length, sent: 0 };
    }

    const path = getListingPath({ listing: listingObject, kind, category });
    const url = `${WEBSITE}${path}`;
    const deepLink = `propenu://${path.replace(/^\//, "")}`;
    const { title, body } = getNotificationCopy({ listing: listingObject, category });
    const nowForFeed = new Date();
    await db.collection("usernotifications").insertMany(
      eligibleUserIds.map((userId) => ({
        notificationKey: `search_match:${String(userId)}:${kind}:${listingId}`,
        userId,
        type: "search_match",
        category: "search",
        title,
        body,
        listingKind: kind,
        listingId,
        listingCategory: category,
        slug: String(listingObject.slug),
        path,
        url,
        deepLink,
        metadata: {
          searchMatchedAt: nowForFeed,
        },
        readAt: null,
        createdAt: nowForFeed,
        updatedAt: nowForFeed,
      })),
      { ordered: false },
    ).catch((error: any) => {
      if (error?.code !== 11000) {
        console.error("Failed to store search match notifications:", error);
      }
    });

    const result = await sendPlatformPush({
      devices: deviceRows,
      title,
      body,
      data: {
        type: "search_match",
        audience: "user",
        listingKind: kind,
        listingId,
        category,
        slug: String(listingObject.slug),
        path,
        url,
        deepLink,
      },
    });

    return {
      matchedUsers: matchedUserIds.length,
      sent: result.successCount,
    };
  } catch (error) {
    console.error("Search match notification failed:", error);
    return { matchedUsers: 0, sent: 0 };
  }
}
