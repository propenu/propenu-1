// src/services/featurePropertiesServices.ts
import mongoose from "mongoose";
import s3 from "../config/s3";
import FeaturedProject from "../models/featurePropertiesModel";
// Register models so createdBy / RM / postedBy populate resolves User + Role.
import User from "../models/userModel";
import "../models/roleModel";
import {
  CreateFeaturePropertyDTO,
  UpdateFeaturePropertyDTO,
} from "../zod/validation";
import dotenv from "dotenv";
import fs from "fs";
import { uploadFile } from "../utils/uploadFile";
import {
  createWatermarkedBuffer,
  getUploadedFileBuffer,
} from "../utils/imageProcessing";
import { upsertActiveListingCityAndLocality, getListingLocationOptions } from "./locationServices";
import {
  normalizeListingAuditFields,
  restoreCreatedById,
} from "../utils/agentSubmission";
import { applyOwnerUserFilter, ownerListLimit } from "../utils/ownerUserFilter";
import { getPrimeDisplayMode } from "../siteBranding/siteBranding.service";
import { promotionHasStartedMatch } from "./promotionService";

dotenv.config({ quiet: true });

const CREATED_BY_USER_FIELDS =
  "name email phone city state locality pincode companyName role roleName roleId";
const AUDIT_USER_FIELDS =
  "name email phone role roleName roleId managerId";

/** Nested staff manager populate: SE → RM → BDH → Ops → Super (up to 4 levels). */
function staffManagerPopulate(depth: number): any[] {
  const rolePop = { path: "roleId", select: "name label" };
  if (depth <= 0) return [rolePop];
  return [
    rolePop,
    {
      path: "managerId",
      select: AUDIT_USER_FIELDS,
      populate: staffManagerPopulate(depth - 1),
    },
  ];
}

/** Populate owner + poster + RM so API returns user details (not bare ObjectIds). */
function applyFeaturedUserPopulates(query: any) {
  const withRoleAndManager = {
    select: AUDIT_USER_FIELDS,
    populate: staffManagerPopulate(4),
  };

  return query
    .populate({
      path: "createdBy",
      select: CREATED_BY_USER_FIELDS,
      populate: { path: "roleId", select: "name label" },
    })
    .populate({
      path: "relationshipManagerId",
      ...withRoleAndManager,
    })
    .populate({
      path: "relationshipManager.userId",
      ...withRoleAndManager,
    })
    .populate({
      path: "postedBy.userId",
      ...withRoleAndManager,
    })
    .populate({
      path: "approvedBy",
      select: AUDIT_USER_FIELDS,
      populate: staffManagerPopulate(2),
    })
    .populate({
      path: "lastUpdatedBy.userId",
      ...withRoleAndManager,
    })
    .populate({
      path: "updateHistory.userId",
      ...withRoleAndManager,
    })
    .populate({
      path: "promotionHistory.changedBy",
      select: "name email roleName companyName",
    });
}

/**
 * Lightweight list populate — skips updateHistory + deep manager chains.
 * Full populate made status=draft&limit=100 ~1.8MB and timed out in production admin.
 */
function applyFeaturedListPopulates(query: any) {
  return query
    .select("-updateHistory -youtubeVideos")
    .populate({
      path: "createdBy",
      select: CREATED_BY_USER_FIELDS,
      populate: { path: "roleId", select: "name label" },
    })
    .populate({
      path: "relationshipManagerId",
      select: AUDIT_USER_FIELDS,
      populate: { path: "roleId", select: "name label" },
    })
    .populate({
      path: "relationshipManager.userId",
      select: AUDIT_USER_FIELDS,
      populate: { path: "roleId", select: "name label" },
    })
    .populate({
      path: "postedBy.userId",
      select: AUDIT_USER_FIELDS,
      populate: { path: "roleId", select: "name label" },
    })
    .populate({
      path: "approvedBy",
      select: "name email phone roleName roleId",
      populate: { path: "roleId", select: "name label" },
    })
    .populate({
      path: "lastUpdatedBy.userId",
      select: "name email roleName",
    });
}

async function loadFeaturedWithUsers(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid id");
  }

  const original = await FeaturedProject.findById(id).select("createdBy").lean();
  const doc = await applyFeaturedUserPopulates(FeaturedProject.findById(id)).lean();

  return serializeFeaturedProject(
    await restoreCreatedById(FeaturedProject, doc, original?.createdBy),
  );
}

async function enrichFeaturedListWithUsers(items: any[]) {
  return Promise.all(
    items.map(async (item) => {
      const originalCreatedBy =
        item?.createdBy?._id ?? item?.createdBy ?? null;
      return serializeFeaturedProject(
        await restoreCreatedById(FeaturedProject, item, originalCreatedBy),
      );
    }),
  );
}

type MulterFiles = { [fieldname: string]: Express.Multer.File[] } | undefined;

type LocationParams = {
  locality?: string;
  city?: string;
  state?: string;
};

type RankScope = {
  state: string;
  city: string;
};

function normalizeScopeValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRankScope(source: any): RankScope {
  return {
    state: normalizeScopeValue(source?.state),
    city: normalizeScopeValue(source?.city),
  };
}

function rankScopesEqual(a: RankScope, b: RankScope) {
  return (
    a.state.toLowerCase() === b.state.toLowerCase() &&
    a.city.toLowerCase() === b.city.toLowerCase()
  );
}

function buildRankScopeFilter(scope: RankScope) {
  const fieldFilter = (value?: string) =>
    value ? exactCaseInsensitive(value) : null;

  return {
    state: fieldFilter(scope.state),
    city: fieldFilter(scope.city),
  };
}

function normalizeRank(value: unknown) {
  const rank = Number(value);
  return Number.isFinite(rank) ? Math.max(1, Math.trunc(rank)) : 1;
}

async function reserveFeatureProjectRankForCreate(toCreate: any) {
  const rank = normalizeRank(toCreate.rank);
  toCreate.rank = rank;

  await FeaturedProject.updateMany(
    {
      ...buildRankScopeFilter(getRankScope(toCreate)),
      rank: { $gte: rank },
    },
    { $inc: { rank: 1 } },
  );
}

async function reorderFeatureProjectRank(existing: any, safeUpdate: any) {
  if (typeof safeUpdate.rank !== "number") return;

  const oldRank = normalizeRank(existing.rank);
  const newRank = normalizeRank(safeUpdate.rank);
  safeUpdate.rank = newRank;

  const oldScope = getRankScope(existing);
  const nextScope = getRankScope({ ...existing.toObject(), ...safeUpdate });
  const sameScope = rankScopesEqual(oldScope, nextScope);

  if (sameScope && oldRank === newRank) return;

  const idFilter = { _id: { $ne: existing._id } };

  if (sameScope) {
    const scopeFilter = buildRankScopeFilter(nextScope);

    if (newRank < oldRank) {
      await FeaturedProject.updateMany(
        {
          ...scopeFilter,
          ...idFilter,
          rank: { $gte: newRank, $lt: oldRank },
        },
        { $inc: { rank: 1 } },
      );
      return;
    }

    await FeaturedProject.updateMany(
      {
        ...scopeFilter,
        ...idFilter,
        rank: { $gt: oldRank, $lte: newRank },
      },
      { $inc: { rank: -1 } },
    );
    return;
  }

  await FeaturedProject.updateMany(
    {
      ...buildRankScopeFilter(oldScope),
      ...idFilter,
      rank: { $gt: oldRank },
    },
    { $inc: { rank: -1 } },
  );

  await FeaturedProject.updateMany(
    {
      ...buildRankScopeFilter(nextScope),
      ...idFilter,
      rank: { $gte: newRank },
    },
    { $inc: { rank: 1 } },
  );
}

function exactCaseInsensitive(value: string) {
  return {
    $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    $options: "i",
  };
}

function buildPromotionTypeMatch(types: string[]) {
  const normalizedTypes = types.map((type) => type.trim()).filter(Boolean);

  if (normalizedTypes.length === 0) return undefined;

  const conditions: any[] = [];
  const explicitTypes = normalizedTypes.filter((type) => type !== "normal");

  if (explicitTypes.length > 0) {
    conditions.push({ "promotion.type": { $in: explicitTypes } });
  }

  if (normalizedTypes.includes("normal")) {
    conditions.push(
      { "promotion.type": "normal" },
      { "promotion.type": { $exists: false } },
      { "promotion.type": null },
    );
  }

  return conditions.length === 1 ? conditions[0] : { $or: conditions };
}

const emptyPromotionCounts = () => ({
  prime: 0,
  featured: 0,
  normal: 0,
  sponsored: 0,
});

const promotedPromotionTypes = ["featured", "sponsored", "prime"];

async function countPromotionTypes(filter: any) {
  const counts = emptyPromotionCounts();

  const grouped = await FeaturedProject.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { $ifNull: ["$promotion.type", "normal"] },
        count: { $sum: 1 },
      },
    },
  ]);

  for (const item of grouped) {
    const key = String(item._id || "normal");
    if (key in counts) {
      counts[key as keyof ReturnType<typeof emptyPromotionCounts>] = item.count;
    }
  }

  return counts;
}

async function findFeatured(filter: any) {
  const items = await FeaturedProject.find(filter)
    .select({
      title: 1,
      heroImage: 1,
      priceFrom: 1,
      priceTo: 1,
      slug: 1,
      propertyCode: 1,
      city: 1,
      locality: 1,
      state: 1,
      logo: 1,
      projectSummary: 1,
      bhkSummary: 1,
      amenities: 1,
    })
    .lean();

  return serializeFeaturedProjectList(items);
}

/** compute price range from bhkSummary */
function computePriceRangeFromBhk(bhkSummary?: any[]) {
  if (!Array.isArray(bhkSummary) || bhkSummary.length === 0)
    return { priceFrom: undefined, priceTo: undefined };
  const mins = bhkSummary
    .map((b) => (typeof b?.minPrice === "number" ? b.minPrice : undefined))
    .filter((v) => typeof v === "number") as number[];
  const maxs = bhkSummary
    .map((b) => (typeof b?.maxPrice === "number" ? b.maxPrice : undefined))
    .filter((v) => typeof v === "number") as number[];
  const priceFrom = mins.length ? Math.min(...mins) : undefined;
  const priceTo = maxs.length ? Math.max(...maxs) : undefined;
  return { priceFrom, priceTo };
}

async function deleteS3ObjectIfExists(key?: string) {
  if (!key) return;
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    console.warn("deleteS3ObjectIfExists: AWS_S3_BUCKET not configured");
    return;
  }
  try {
    await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
  } catch (e: any) {
    console.error(
      "deleteS3ObjectIfExists failed for key:",
      key,
      e?.message || e,
    );
    // don't rethrow — allow operation to continue
  }
}

function pickDefined<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => typeof v !== "undefined"),
  ) as Partial<T>;
}

/** Same editor, same project: extra saves inside this window do not add another update. */
const PROJECT_EDIT_COUNT_WINDOW_MS = 30 * 60 * 1000;

function sameAuditUser(left: unknown, right: unknown) {
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

function httpMediaUrl(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

function plainAboutRow(row: any) {
  const src =
    row && typeof row.toObject === "function" ? row.toObject() : row || {};
  return {
    builderName: src.builderName != null ? String(src.builderName) : "",
    aboutDescription:
      src.aboutDescription != null ? String(src.aboutDescription) : "",
    rightContent: src.rightContent != null ? String(src.rightContent) : "",
    url: httpMediaUrl(src.url),
    key: src.key != null ? String(src.key) : "",
    filename: src.filename != null ? String(src.filename) : "",
    mimetype: src.mimetype != null ? String(src.mimetype) : "",
  };
}

/**
 * Record who saved the project. The same logged-in user does not add another
 * history row or increase updateCount until 30 minutes after their last counted edit.
 */
function recordProjectEditAudit(existing: any, user: any) {
  const now = new Date();
  const history = Array.isArray(existing.updateHistory)
    ? existing.updateHistory.map((row: any) =>
        row && typeof row.toObject === "function" ? row.toObject() : { ...row },
      )
    : [];
  const last = history[history.length - 1];
  const lastAt = last?.updatedAt ? new Date(last.updatedAt).getTime() : NaN;
  const withinWindow =
    Boolean(last) &&
    sameAuditUser(last.userId, user?.id) &&
    Number.isFinite(lastAt) &&
    now.getTime() - lastAt < PROJECT_EDIT_COUNT_WINDOW_MS;

  existing.lastUpdatedBy = {
    userId: user.id,
    name: user.name,
    email: user.email,
    roleName: user.roleName,
    updatedAt: now,
  };

  if (withinWindow) return;

  existing.updateCount = Number(existing.updateCount || 0) + 1;
  existing.updateHistory = [
    ...history,
    {
      userId: user.id,
      name: user.name,
      email: user.email,
      roleName: user.roleName,
      updatedAt: now,
    },
  ];
}

function normalizeGalleryInput(payload: any) {
  if (!payload || typeof payload !== "object") return;
  if (
    Array.isArray(payload.gallery) &&
    !Array.isArray(payload.gallerySummary)
  ) {
    payload.gallerySummary = payload.gallery;
  }
}

function normalizeAmenityKey(value?: string) {
  if (!value || typeof value !== "string") return value;
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeAmenitiesInputs(amenities?: any[]) {
  if (!Array.isArray(amenities)) return amenities;
  return amenities.map((a) => {
    if (!a || typeof a !== "object") return a;
    const normalized = { ...a };
    const sourceKey = normalized.key ?? normalized.title;
    const normalizedKey = normalizeAmenityKey(sourceKey);
    if (normalizedKey) normalized.key = normalizedKey;
    return normalized;
  });
}

function isResidentialProjectPayload(payload?: any) {
  const categoryType = String(payload?.categoryType ?? "")
    .trim()
    .toLowerCase();
  const propertyType = String(payload?.propertyType ?? "")
    .trim()
    .toLowerCase();

  if (categoryType === "land") return false;
  if (categoryType === "residential") return true;

  return ["apartment", "flat", "villa"].some((type) =>
    propertyType.includes(type),
  );
}

function normalizeResidentialUnitArea(unit: any) {
  if (!unit || typeof unit !== "object") return unit;

  const normalized = { ...unit };
  const area = normalized.area;
  const fallbackSqft =
    typeof normalized.minSqft === "number" && Number.isFinite(normalized.minSqft)
      ? normalized.minSqft
      : typeof area?.sqftValue === "number" && Number.isFinite(area.sqftValue)
        ? area.sqftValue
        : typeof area?.value === "number" && Number.isFinite(area.value)
          ? area.value
          : undefined;

  if (
    typeof normalized.minSqft !== "number" &&
    typeof fallbackSqft === "number" &&
    fallbackSqft > 0
  ) {
    normalized.minSqft = fallbackSqft;
  }

  if (
    typeof normalized.maxSqft !== "number" &&
    typeof fallbackSqft === "number" &&
    fallbackSqft > 0
  ) {
    normalized.maxSqft = fallbackSqft;
  }

  delete normalized.area;
  return normalized;
}

function normalizeProjectSummaryInput(summary?: any[], payload?: any) {
  if (!Array.isArray(summary)) return summary;
  const shouldNormalizeResidentialArea = isResidentialProjectPayload(payload);

  return summary.map((item) => {
    if (!item || typeof item !== "object") return item;

    const { bhkLabel, ...rest } = item;
    const units =
      shouldNormalizeResidentialArea && Array.isArray(rest.units)
        ? rest.units.map(normalizeResidentialUnitArea)
        : rest.units;

    return {
      ...rest,
      label: item.label ?? bhkLabel,
      ...(Array.isArray(units) && { units }),
    };
  });
}

function getCanonicalProjectSummary(payload: any) {
  return normalizeProjectSummaryInput(
    payload?.projectSummary ?? payload?.bhkSummary,
    payload,
  );
}

function getProjectSummaryKey(item: any, fallbackIndex?: number) {
  if (!item || typeof item !== "object") return `index:${fallbackIndex ?? 0}`;

  const label = String(item.label ?? item.bhkLabel ?? "")
    .trim()
    .toLowerCase();

  if (label) {
    return `bhk:${item.bhk ?? ""}|label:${label}`;
  }

  if (typeof item.bhk !== "undefined") {
    return `bhk:${item.bhk}`;
  }

  return `index:${fallbackIndex ?? 0}`;
}

function serializeFeaturedProject<T extends any>(doc: T): T {
  if (!doc || typeof doc !== "object") return doc;

  const obj: any =
    typeof (doc as any).toObject === "function"
      ? (doc as any).toObject({ virtuals: false, aliases: false })
      : { ...(doc as any) };

  const projectSummary = getCanonicalProjectSummary(obj);
  if (Array.isArray(projectSummary)) {
    obj.projectSummary = projectSummary;
  }

  normalizeListingAuditFields(obj);
  if (Array.isArray(obj.updateHistory)) {
    obj.updateCount = Math.max(
      Number(obj.updateCount || 0),
      obj.updateHistory.length,
    );
  }

  delete obj.bhkSummary;

  return obj;
}

function serializeFeaturedProjectList<T extends any[]>(items: T): T {
  return items.map((item) => serializeFeaturedProject(item)) as T;
}

const PUBLIC_PROJECT_CARD_SELECT = [
  "title",
  "slug",
  "heroImage",
  "heroTagline",
  "city",
  "locality",
  "state",
  "address",
  "priceFrom",
  "priceTo",
  "possessionDate",
  "launchDate",
  "reraNumber",
  "categoryType",
  "propertyType",
  "projectArea",
  "sqftRange",
  "projectSummary.bhk",
  "projectSummary.label",
  "bhkSummary.bhk",
  "bhkSummary.label",
  "amenities.title",
  "promotion.type",
  "promotion.priority",
  "promotion.startDate",
  "promotion.boostExpiry",
  "aboutSummary.builderName",
  "logo.url",
  "gallerySummary.url",
  "brochure.url",
  "createdAt",
].join(" ");

function parseBhkFilter(raw?: string) {
  const exact: number[] = [];
  let minInclusive: number | null = null;

  String(raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      if (value.endsWith("+")) {
        const min = Number(value.slice(0, -1));
        if (Number.isFinite(min)) {
          minInclusive = minInclusive == null ? min : Math.min(minInclusive, min);
        }
        return;
      }

      const bhk = Number(value);
      if (Number.isFinite(bhk)) exact.push(bhk);
    });

  if (!exact.length && minInclusive == null) return null;
  return { exact, minInclusive };
}

function splitFilterValues(raw?: string) {
  return String(raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function exactFieldMatch(field: string, values: string[]) {
  return {
    $or: values.map((value) => ({
      [field]: {
        $regex: `^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
        $options: "i",
      },
    })),
  };
}

function buildDiscoveryFilters(options?: {
  locality?: string;
  minPrice?: number;
  maxPrice?: number;
  bhk?: string;
  rera?: boolean;
  possession?: string;
  builder?: string;
  propertyType?: string;
  minSqft?: number;
  maxSqft?: number;
}) {
  const clauses: any[] = [];
  const localities = splitFilterValues(options?.locality);
  if (localities.length) {
    clauses.push(exactFieldMatch("locality", localities));
  }

  const minPrice = Number(options?.minPrice);
  const maxPrice = Number(options?.maxPrice);
  const hasMinPrice = Number.isFinite(minPrice) && minPrice > 0;
  const hasMaxPrice = Number.isFinite(maxPrice) && maxPrice > 0;
  if (hasMinPrice || hasMaxPrice) {
    const priceMatch: any[] = [];
    if (hasMaxPrice) priceMatch.push({ priceFrom: { $lte: maxPrice } });
    if (hasMinPrice) {
      priceMatch.push({
        $or: [{ priceTo: { $gte: minPrice } }, { priceFrom: { $gte: minPrice } }],
      });
    }
    clauses.push({ $and: priceMatch });
  }

  const bhkFilter = parseBhkFilter(options?.bhk);
  if (bhkFilter) {
    const bhkMatch: any[] = [];
    const labelPattern = (expression: string) => ({
      $regex: expression,
      $options: "i",
    });
    if (bhkFilter.exact.length) {
      bhkMatch.push({ "projectSummary.bhk": { $in: bhkFilter.exact } });
      bhkMatch.push({ "bhkSummary.bhk": { $in: bhkFilter.exact } });
      bhkFilter.exact.forEach((value) => {
        const pattern = labelPattern(`\\b${value}\\s*BHK`);
        bhkMatch.push({ "projectSummary.label": pattern });
        bhkMatch.push({ "bhkSummary.label": pattern });
        bhkMatch.push({ "bhkSummary.bhkLabel": pattern });
      });
    }
    if (bhkFilter.minInclusive != null) {
      bhkMatch.push({ "projectSummary.bhk": { $gte: bhkFilter.minInclusive } });
      bhkMatch.push({ "bhkSummary.bhk": { $gte: bhkFilter.minInclusive } });
      const pattern = labelPattern("\\b([5-9]|[1-9]\\d+)\\s*BHK");
      bhkMatch.push({ "projectSummary.label": pattern });
      bhkMatch.push({ "bhkSummary.label": pattern });
      bhkMatch.push({ "bhkSummary.bhkLabel": pattern });
    }
    if (bhkMatch.length) clauses.push({ $or: bhkMatch });
  }

  if (options?.rera) {
    clauses.push({ reraNumber: { $regex: "\\S" } });
  }

  const possession = splitFilterValues(options?.possession);
  if (possession.length) {
    const today = new Date().toISOString().slice(0, 10);
    const launchSince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const possessionMatch = possession
      .map((token) => {
        if (token === "ready") {
          return {
            $or: [
              { possessionDate: { $regex: "ready", $options: "i" } },
              {
                possessionDate: {
                  $regex: "^\\d{4}-\\d{2}-\\d{2}",
                  $lte: today,
                },
              },
            ],
          };
        }
        if (token === "new-launch") {
          return { createdAt: { $gte: launchSince } };
        }
        if (/^20\d{2}$/.test(token)) {
          return {
            possessionDate: { $regex: `(^|[^0-9])${token}([^0-9]|$)` },
          };
        }
        return null;
      })
      .filter(Boolean);
    if (possessionMatch.length) clauses.push({ $or: possessionMatch });
  }

  const builders = splitFilterValues(options?.builder);
  if (builders.length) {
    clauses.push({
      $or: builders.flatMap((name) => {
        const pattern = {
          $regex: `^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
          $options: "i",
        };
        return [
          { "aboutSummary.builderName": pattern },
          { builderName: pattern },
        ];
      }),
    });
  }

  const propertyTypes = splitFilterValues(options?.propertyType);
  if (propertyTypes.length) {
    clauses.push(exactFieldMatch("propertyType", propertyTypes));
  }

  const minSqft = Number(options?.minSqft);
  const maxSqft = Number(options?.maxSqft);
  const hasMinArea = Number.isFinite(minSqft) && minSqft > 0;
  const hasMaxArea = Number.isFinite(maxSqft) && maxSqft > 0;
  if (hasMinArea || hasMaxArea) {
    const min = hasMinArea ? minSqft : 0;
    const max = hasMaxArea ? maxSqft : 100000000;
    const range = { $gte: min, $lte: max };
    clauses.push({
      $or: [
        {
          "sqftRange.min": { $lte: max },
          "sqftRange.max": { $gte: min },
        },
        { "projectSummary.units.minSqft": range },
        { "projectSummary.units.maxSqft": range },
        { "projectSummary.units.area.sqftValue": range },
        { "bhkSummary.units.minSqft": range },
        { "bhkSummary.units.maxSqft": range },
        { "bhkSummary.units.area.sqftValue": range },
      ],
    });
  }

  return clauses;
}

function summarizePossessionFacets(
  rows: { _id?: string; count?: number }[],
  newLaunchCount: number,
) {
  const today = new Date().toISOString().slice(0, 10);
  const years = new Map<string, number>();
  let ready = 0;

  rows.forEach((row) => {
    const value = String(row._id || "");
    const count = Number(row.count || 0);
    const year = value.match(/(20\d{2})/)?.[1];
    if (year) years.set(year, (years.get(year) || 0) + count);
    const iso = value.slice(0, 10);
    if (
      /ready/i.test(value) ||
      (/^\d{4}-\d{2}-\d{2}/.test(value) && iso <= today)
    ) {
      ready += count;
    }
  });

  return {
    ready,
    newLaunch: newLaunchCount,
    years: Array.from(years.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => Number(b.year) - Number(a.year)),
  };
}

async function collectPublicProjectFacets(match: Record<string, any>) {
  const launchSince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [row] = await FeaturedProject.aggregate([
    { $match: match },
    {
      $project: {
        locality: 1,
        propertyType: 1,
        possessionDate: 1,
        createdAt: 1,
        builderName: {
          $let: {
            vars: {
              fromSummary: {
                $convert: {
                  input: { $arrayElemAt: ["$aboutSummary.builderName", 0] },
                  to: "string",
                  onError: "",
                  onNull: "",
                },
              },
              fromRoot: {
                $convert: {
                  input: "$builderName",
                  to: "string",
                  onError: "",
                  onNull: "",
                },
              },
            },
            in: {
              $cond: [
                { $gt: [{ $strLenCP: "$$fromSummary" }, 0] },
                "$$fromSummary",
                "$$fromRoot",
              ],
            },
          },
        },
      },
    },
    {
      $facet: {
        localities: [
          { $match: { locality: { $type: "string", $nin: ["", null] } } },
          {
            $group: {
              _id: { $toLower: "$locality" },
              name: { $first: "$locality" },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1, name: 1 } },
          { $limit: 100 },
        ],
        builders: [
          { $match: { builderName: { $type: "string", $nin: ["", null] } } },
          {
            $group: {
              _id: { $toLower: "$builderName" },
              name: { $first: "$builderName" },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1, name: 1 } },
          { $limit: 60 },
        ],
        propertyTypes: [
          { $match: { propertyType: { $type: "string", $nin: ["", null] } } },
          {
            $group: {
              _id: { $toLower: "$propertyType" },
              name: { $first: "$propertyType" },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1, name: 1 } },
        ],
        possessionDates: [
          { $match: { possessionDate: { $type: "string", $nin: ["", null] } } },
          { $group: { _id: "$possessionDate", count: { $sum: 1 } } },
        ],
        newLaunch: [
          { $match: { createdAt: { $gte: launchSince } } },
          { $count: "count" },
        ],
      },
    },
  ]);

  const pick = (items?: { name?: string; count?: number }[]) => {
    const grouped = new Map<string, { name: string; count: number }>();
    (items || []).forEach((item) => {
      const name = String(item.name || "").replace(/\s+/g, " ").trim();
      const key = name.toLowerCase();
      if (!key) return;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, { name, count: Number(item.count || 0) });
        return;
      }
      current.count += Number(item.count || 0);
      if (name !== name.toLowerCase()) current.name = name;
    });
    return Array.from(grouped.values()).sort(
      (left, right) => right.count - left.count || left.name.localeCompare(right.name),
    );
  };

  return {
    localities: pick(row?.localities),
    builders: pick(row?.builders),
    propertyTypes: pick(row?.propertyTypes).map((item) => ({
      ...item,
      name: item.name.toLowerCase(),
    })),
    possession: summarizePossessionFacets(
      row?.possessionDates || [],
      Number(row?.newLaunch?.[0]?.count || 0),
    ),
  };
}

function toPublicProjectCard(item: any) {
  const serialized = hideUnstartedPromotion(serializeFeaturedProject(item));
  const gallery = Array.isArray(serialized.gallerySummary)
    ? serialized.gallerySummary.filter((file: any) => file?.url)
    : [];
  const summary = Array.isArray(serialized.projectSummary)
    ? serialized.projectSummary.map((entry: any) => ({
        bhk: entry?.bhk,
        label: entry?.label,
      }))
    : [];
  const amenities = Array.isArray(serialized.amenities)
    ? serialized.amenities
        .map((entry: any) => String(entry?.title || "").trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];
  const builderName = Array.isArray(serialized.aboutSummary)
    ? serialized.aboutSummary
        .map((entry: any) => String(entry?.builderName || "").trim())
        .find(Boolean) || ""
    : "";

  return {
    _id: serialized._id,
    title: serialized.title,
    slug: serialized.slug,
    heroImage: serialized.heroImage || gallery[0]?.url || "",
    heroTagline: serialized.heroTagline || "",
    city: serialized.city,
    locality: serialized.locality,
    state: serialized.state,
    address: serialized.address,
    priceFrom: serialized.priceFrom,
    priceTo: serialized.priceTo,
    possessionDate: serialized.possessionDate || "",
    launchDate: serialized.launchDate || "",
    reraNumber: serialized.reraNumber || "",
    categoryType: serialized.categoryType || "",
    propertyType: serialized.propertyType || "",
    projectArea: serialized.projectArea,
    sqftRange: serialized.sqftRange,
    projectSummary: summary,
    amenities,
    photoCount: gallery.length,
    builderName,
    logo: serialized.logo?.url ? { url: serialized.logo.url } : undefined,
    brochureUrl: serialized.brochure?.url || "",
    promotion: serialized.promotion?.type
      ? { type: serialized.promotion.type }
      : undefined,
    createdAt: serialized.createdAt,
  };
}

/** Public responses keep a future promotion off the live type until its start time. */
function hideUnstartedPromotion<T extends Record<string, any>>(item: T): T {
  const startRaw = item?.promotion?.startDate;
  const start = startRaw ? new Date(startRaw) : null;
  const type = item?.promotion?.type;
  if (!start || Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
    return item;
  }
  if (!type || type === "normal") return item;
  return {
    ...item,
    displayType: "normal",
    promotion: {
      ...item.promotion,
      type: "normal",
      priority: 0,
    },
  };
}

async function processBhkPlanUpdates(opts: {
  bhkSummaryExisting?: any[];
  bhkSummaryIncoming?: any[];
  bhkPlanFiles?: Express.Multer.File[];
  propertyId: string;
  deleteOldS3OnExternalUrl?: boolean;
}) {
  const {
    bhkSummaryIncoming = [],
    bhkPlanFiles = [],
    deleteOldS3OnExternalUrl = false,
  } = opts;

  // ✅ MAKE MUTABLE COPIES OF EXISTING
  const existingSummary: any[] = Array.isArray(opts.bhkSummaryExisting)
    ? opts.bhkSummaryExisting.map((b) => ({ ...b }))
    : [];
  const planUploadCache = new Map<
    string,
    Awaited<ReturnType<typeof uploadFile>>
  >();

  for (let b = 0; b < bhkSummaryIncoming.length; b++) {
    const incomingBhk = bhkSummaryIncoming[b];
    // const existingBhk = existingSummary[b] || { units: [] };
    const incomingKey = getProjectSummaryKey(incomingBhk, b);
    const existingBhk = existingSummary.find(
      (eb, index) => getProjectSummaryKey(eb, index) === incomingKey,
    ) || { units: [] };

    if (!Array.isArray(existingBhk.units)) {
      existingBhk.units = [];
    }

    for (let u = 0; u < incomingBhk.units.length; u++) {
      const incomingUnit = incomingBhk.units[u];
      // const existingUnit = existingBhk.units[u];

      const existingUnit = existingBhk.units.find(
        (eu: any) => eu._id?.toString() === incomingUnit._id?.toString(),
      );

      if (!incomingUnit) continue;

      /* 1️⃣ Match file by planFileName */
      const matchedFile = incomingUnit.planFileName
        ? bhkPlanFiles.find((f) => f.originalname === incomingUnit.planFileName)
        : undefined;

      console.log("=================================");
      console.log("Unit:", incomingUnit.label || incomingUnit._id);
      console.log("planFileName:", incomingUnit.planFileName);
      console.log("Matched:", matchedFile?.originalname);

      /* 2️⃣ Upload new plan */
      if (matchedFile) {
        console.log("File Path:", matchedFile.path);
        console.log("Exists Before Upload:", fs.existsSync(matchedFile.path));

        console.log("=================================");

        const cacheKey = matchedFile.path || matchedFile.originalname;
        let up = planUploadCache.get(cacheKey);

        if (!up) {
          up = await uploadFile({
            filePath: matchedFile.path,
            originalName: matchedFile.originalname,
            mimetype: matchedFile.mimetype,
            folder: "plans",
            propertyId: opts.propertyId,
          });
          planUploadCache.set(cacheKey, up);
        }

        if (existingUnit?.plan?.key) {
          await deleteS3ObjectIfExists(existingUnit.plan.key);
        }

        incomingUnit.plan = {
          url: up.url,
          key: up.key,
          filename: matchedFile.originalname,
          mimetype: matchedFile.mimetype,
        };

        delete incomingUnit.planFileName;
        delete incomingUnit.planUrl;
        continue;
      }

      /* 3️⃣ External URL */
      if (incomingUnit.planUrl) {
        if (deleteOldS3OnExternalUrl && existingUnit?.plan?.key) {
          await deleteS3ObjectIfExists(existingUnit.plan.key);
        }

        incomingUnit.plan = {
          url: incomingUnit.planUrl,
          key: undefined,
          filename: undefined,
          mimetype: undefined,
        };

        delete incomingUnit.planFileName;
        delete incomingUnit.planUrl;
        continue;
      }

      /* 4️⃣ Preserve existing */
      if (existingUnit?.plan) {
        incomingUnit.plan = existingUnit.plan;
        delete incomingUnit.planFileName;
        delete incomingUnit.planUrl;
        continue;
      }

      if (!incomingUnit.plan && existingUnit?.plan) {
        incomingUnit.plan = existingUnit.plan;
      }
    }
  }

  return bhkSummaryIncoming;
}

function mergeBhkSummary(existingArr: any[] = [], incomingArr: any[] = []) {
  const result: any[] = existingArr ? existingArr.slice() : [];
  for (let i = 0; i < incomingArr.length; i++) {
    const inc = incomingArr[i];
    const incomingKey = getProjectSummaryKey(inc, i);
    const idx = result.findIndex(
      (r, index) => getProjectSummaryKey(r, index) === incomingKey,
    );

    if (idx >= 0) {
      result[idx] = { ...result[idx], ...inc };
    } else {
      result.push(inc);
    }
  }
  return result;
}

async function mapAndUploadGallery({
  incomingGallerySummary,
  galleryFiles,
  propertyId,
}: {
  incomingGallerySummary?: any[]; // may be undefined or [] or array of partial metadata
  galleryFiles?: Express.Multer.File[];
  propertyId: string;
}) {
  const files = galleryFiles ?? [];
  const summary = Array.isArray(incomingGallerySummary)
    ? incomingGallerySummary.slice()
    : [];

  // build filename map
  const filesByName = new Map<string, Express.Multer.File>();
  for (const f of files) filesByName.set(f.originalname, f);

  // first, ensure summary array exists and has at least as many entries as files for index mapping convenience
  // (we'll expand as needed later)
  // Note: we avoid mutating original incoming array reference beyond 'summary' local copy
  for (let i = 0; i < files.length; i++) {
    if (i >= summary.length) summary.push({});
  }

  // upload each file and set url on matched summary entry
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // guard against sparse arrays / undefined entries
    if (!file) continue;

    // try match by filename first: find index in summary that declares same filename
    let matchedIndex = -1;
    for (let j = 0; j < summary.length; j++) {
      const declaredName =
        summary[j]?.filename ?? summary[j]?.fileName ?? summary[j]?.file;
      if (declaredName && declaredName === file.originalname) {
        matchedIndex = j;
        break;
      }
    }

    // fallback to same index
    if (matchedIndex === -1) matchedIndex = i;

    // perform upload
    const imageBuffer = getUploadedFileBuffer(file);
    const watermarkedBuffer = await createWatermarkedBuffer(imageBuffer);
    const up = await uploadFile({
      buffer: watermarkedBuffer,
      originalName: file.originalname,
      mimetype: file.mimetype,
      folder: "gallery",
    });

    // ensure entry exists
    if (!summary[matchedIndex]) summary[matchedIndex] = {};

    summary[matchedIndex].url = up.url;
    summary[matchedIndex].filename = file.originalname;
    // if title not provided, set to original name (nice fallback)
    if (!summary[matchedIndex].title)
      summary[matchedIndex].title = file.originalname;
    if (!summary[matchedIndex].category)
      summary[matchedIndex].category = "image";
    if (!summary[matchedIndex].order)
      summary[matchedIndex].order = matchedIndex + 1;
  }

  // final normalization: ensure every summary entry has url if it was an external link or uploaded file
  // entries with no url are left as-is (caller can decide to reject)
  return summary;
}

/* --------------------
   Service
   --------------------*/

function isPublicPrimeHomepageQuery(options?: {
  type?: string;
  page?: number;
  limit?: number;
  status?: string;
  sortBy?: string;
  q?: string;
  view?: string;
  createdBy?: string;
  ownerUserId?: string;
  postedBy?: string;
}) {
  if (String(options?.type || "").trim().toLowerCase() !== "prime") return false;
  if (options?.page != null || options?.limit != null) return false;
  if (options?.status || options?.sortBy || options?.q || options?.view) return false;
  if (options?.createdBy || options?.ownerUserId || options?.postedBy) return false;
  return true;
}

function sortListByRank<T extends { rank?: number }>(items: T[]) {
  return [...items].sort((a, b) => {
    const rankA = typeof a.rank === "number" ? a.rank : Number.MAX_SAFE_INTEGER;
    const rankB = typeof b.rank === "number" ? b.rank : Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });
}

function shuffleList<T>(items: T[]) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = shuffled[i] as T;
    shuffled[i] = shuffled[j] as T;
    shuffled[j] = current;
  }
  return shuffled;
}

export const FeaturePropertyService = {
  async createFeatureProperty(
    payload: CreateFeaturePropertyDTO,
    files?: MulterFiles,
    user?: any,
    options?: { mode?: "draft" | "standard" },
  ) {
    const uploadedPaths = new Set<string>();

    if (Array.isArray((payload as any).amenities)) {
      (payload as any).amenities = normalizeAmenitiesInputs(
        (payload as any).amenities,
      );
    }

    // 1) slug
    const slugSource =
      (payload.slug && String(payload.slug).trim()) || payload.title;

    // 2) compute prices
    const projectSummary = getCanonicalProjectSummary(payload);
    const { priceFrom, priceTo } = computePriceRangeFromBhk(projectSummary);

    // Ownership = Select Builder dropdown (payload.createdBy).
    // Actor = logged-in /me user (postedBy) — never overwrite createdBy with actor.
    // Draft mode allows unassigned builder (createdBy empty) until onboarding completes.
    const isDraftMode = options?.mode === "draft";
    const selectedOwnerId =
      (payload as any)?.createdBy &&
      mongoose.Types.ObjectId.isValid(String((payload as any).createdBy))
        ? String((payload as any).createdBy)
        : "";
    const actorIdRaw = user?.id || user?.sub || "";
    const actorId =
      actorIdRaw && mongoose.Types.ObjectId.isValid(String(actorIdRaw))
        ? String(actorIdRaw)
        : "";
    const ownerId = selectedOwnerId || (isDraftMode ? "" : actorId);
    if (!ownerId && !isDraftMode) {
      throw new Error("createdBy (selected builder) is required");
    }

    // 3) prepare base create payload
    const toCreate: any = {
      ...payload,
      projectSummary,
      priceFrom,
      priceTo,
      ...(ownerId
        ? { createdBy: new mongoose.Types.ObjectId(ownerId) }
        : { createdBy: undefined }),
      postedBy: actorId
        ? {
            userId: new mongoose.Types.ObjectId(actorId),
            name: user?.name || "",
            email: user?.email || "",
            roleName: user?.roleName || "",
            postedAt: new Date(),
          }
        : undefined,

      updateHistory: actorId
        ? [
            {
              userId: new mongoose.Types.ObjectId(actorId),
              name: user?.name || "",
              email: user?.email || "",
              roleName: user?.roleName || "",
              updatedAt: new Date(),
            },
          ]
        : [],
      updateCount: actorId ? 1 : 0,
      ...(isDraftMode
        ? {
            status: "draft",
            approvalStatus: "pending",
            builderOnboarding: {
              enabled: true,
              mode: "",
              assignStatus: "pending",
            },
          }
        : {}),
    };
    if (isDraftMode) {
      delete toCreate.createdBy;
    }
    delete toCreate.bhkSummary;
    // Ignore any client-sent postedBy; actor always comes from auth token (/me).
    if (!actorId) delete toCreate.postedBy;

    // create a preliminary doc instance to get _id for S3 key naming (no DB write yet)
    const preliminary = new FeaturedProject(toCreate);
    const propId = preliminary._id!.toString();

    // LOGO (single file)
    const logoFiles = files?.logo;
    if (logoFiles && logoFiles.length > 0) {
      const lf = logoFiles[0]!;
      uploadedPaths.add(lf.path);

      const up = await uploadFile({
        filePath: lf.path,

        originalName: lf.originalname,
        mimetype: lf.mimetype,
        folder: "logo",
      });
      // store full object so we can delete later
      toCreate.logo = {
        url: up.url,
        key: up.key,
        filename: lf.originalname,
        mimetype: lf.mimetype,
      };
    }

    // HERO IMAGE (single)
    const heroFiles = files?.heroImage;
    if (heroFiles && heroFiles.length > 0) {
      const f: Express.Multer.File = heroFiles[0]!;
      const imageBuffer = getUploadedFileBuffer(f);
      const watermarkedBuffer = await createWatermarkedBuffer(imageBuffer);
      const up = await uploadFile({
        buffer: watermarkedBuffer,
        originalName: f.originalname,
        mimetype: f.mimetype,
        folder: "Builder_hero",
      });
      toCreate.heroImage = up.url;
      // optional: store heroImageKey in DB to be able to delete later
      // toCreate.heroImageKey = up.key;
    }

    // HERO VIDEO (single)
    const heroVideoFiles = files?.heroVideo;
    if (heroVideoFiles && heroVideoFiles.length > 0) {
      const v: Express.Multer.File = heroVideoFiles[0]!;
      const up = await uploadFile({
        filePath: v.path,
        originalName: v.originalname,
        mimetype: v.mimetype,
        folder: "video",
      });
      toCreate.heroVideo = up.url;
      // toCreate.heroVideoKey = up.key;
    }

    // BROCHURE (single PDF)  <-- PASTE STARTS HERE
    const brochureFiles = files?.brochure;
    if (brochureFiles && brochureFiles.length > 0) {
      const bf = brochureFiles[0] as Express.Multer.File;

      // 1) Basic validations (adjust as needed)
      const allowedMimeTypes = ["application/pdf"];
      const maxSizeBytes = 20 * 1024 * 1024; // 20 MB

      if (!allowedMimeTypes.includes(bf.mimetype)) {
        throw new Error("Brochure must be a PDF (application/pdf)");
      }
      if (bf.size && bf.size > maxSizeBytes) {
        throw new Error("Brochure file too large (max 20MB)");
      }

      // 2) Upload to S3 (using your existing uploadFile util)
      const up = await uploadFile({
        filePath: bf.path,
        originalName: bf.originalname,
        mimetype: bf.mimetype,
        folder: "brochures", // folder/key prefix you want
        propertyId: propId, // optional, your upload util accepts it elsewhere
      });

      // 3) Save metadata into create payload
      toCreate.brochure = {
        url: up.url, // publicly accessible URL returned by uploadFile
        key: up.key, // S3 key (used for deletions later)
        filename: bf.originalname,
        mimetype: bf.mimetype,
      };
    } else if ((payload as any).brochureUrl) {
      // optional: client sent an external URL instead of uploading file
      toCreate.brochure = {
        url: (payload as any).brochureUrl,
        key: undefined,
        filename: undefined,
        mimetype: undefined,
      };
    }
    // BROCHURE block <-- PASTE ENDS HERE

    // GALLERY FILES (multiple)
    const galleryFiles = files?.galleryFiles ?? [];
    // incoming gallerySummary might be provided in payload (metadata)
    const incomingGallerySummary = (payload as any).gallerySummary;
    // map and upload; returns a normalized summary array (entries with url where uploaded)
    const mappedGallerySummary = await mapAndUploadGallery({
      incomingGallerySummary,
      galleryFiles,
      propertyId: propId,
    });

    // Merge with any incoming entries that had external URLs or metadata
    // If no incoming provided, mappedGallerySummary already contains created entries for uploaded files
    toCreate.gallerySummary = Array.isArray(mappedGallerySummary)
      ? mappedGallerySummary
      : [];

    // attach BHK plan files (create flow)
    const bhkPlanFiles = files?.bhkPlanFiles ?? [];
    toCreate.projectSummary = toCreate.projectSummary || [];
    // safety: ensure uploaded files count not greater than provided entries (index matching)
    // if (bhkPlanFiles.length > toCreate.bhkSummary.length) {
    //   // not fatal but probably a client error — reject to avoid mismapping
    //   throw new Error(
    //     "Too many bhkPlanFiles uploaded for provided bhkSummary entries",
    //   );
    // }

    const totalUnits = (toCreate.projectSummary || []).reduce(
      (sum: number, b: any) =>
        sum + (Array.isArray(b.units) ? b.units.length : 0),
      0,
    );

    if (bhkPlanFiles.length > totalUnits) {
      throw new Error("Too many bhkPlanFiles uploaded for provided bhk units");
    }

    toCreate.projectSummary = await processBhkPlanUpdates({
      bhkSummaryExisting: [], // none on create
      bhkSummaryIncoming: toCreate.projectSummary,
      bhkPlanFiles,
      propertyId: propId,
      deleteOldS3OnExternalUrl: false,
    });

    //About Image (create section)
    // ---- About image (create) - normalize into aboutSummary array ----
    {
      // normalize incoming about shapes into an array: prefer payload.aboutSummary, fallback to payload.about
      const incomingAboutArr: any[] = Array.isArray(
        (toCreate as any).aboutSummary,
      )
        ? (toCreate as any).aboutSummary.slice()
        : (toCreate as any).about
          ? [{ ...(toCreate as any).about }]
          : [];

      const aboutFiles = files?.aboutImage;
      if (aboutFiles && aboutFiles.length > 0) {
        const f = aboutFiles[0];
        if (!f) throw new Error("Uploaded aboutImage file is missing");

        const up = await uploadFile({
          filePath: f.path,
          originalName: f.originalname,
          mimetype: f.mimetype,
          folder: "about",
        });

        // ensure at least one element (provide required rightContent)
        if (incomingAboutArr.length === 0)
          incomingAboutArr.push({ rightContent: "" });

        // write S3 metadata into first element (you can change index strategy if you need)
        incomingAboutArr[0].url = up.url;
        incomingAboutArr[0].key = up.key;
        incomingAboutArr[0].filename = f.originalname;
        incomingAboutArr[0].mimetype = f.mimetype;
      }

      // persist normalized array into create payload
      (toCreate as any).aboutSummary = incomingAboutArr;
      // keep convenience single object synced with first item
      if (incomingAboutArr.length > 0)
        (toCreate as any).about = { ...incomingAboutArr[0] };
    }
    // -----------------------------------------------------------------

    // sanitize aboutDescription if present
    // if (toCreate.about?.aboutDescription && typeof toCreate.about.aboutDescription === "string") {
    //   toCreate.about.aboutDescription = sanitizeHtml(toCreate.about.aboutDescription, {
    //     allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    //     allowedAttributes: {
    //       a: ["href", "name", "target"],
    //       img: ["src", "alt"],
    //     },
    //   });
    // }

    // finally create document in DB
    const createdDoc = await FeaturedProject.create(toCreate);

    for (const filePath of uploadedPaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log("Deleted temp file:", filePath);
        }
      } catch (error) {
        console.error("Failed deleting temp file:", filePath, error);
      }
    }

    await upsertActiveListingCityAndLocality(createdDoc);

    // Return populated createdBy / postedBy / RM user details for UI cards.
    return loadFeaturedWithUsers(String(createdDoc._id));
  },

  async updateFeatureProperty(
    id: string,
    payload: UpdateFeaturePropertyDTO,
    files?: MulterFiles,
    user?: any,
  ) {

      const uploadedPaths = new Set<string>();

      
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");
    const existing = await FeaturedProject.findById(id);
    if (!existing) return null;

    // normalize legacy gallery key if present on input
    normalizeGalleryInput(payload as any);

    // ---------- PRICE RANGE (if client provided bhkSummary) ----------
    const incomingProjectSummary = getCanonicalProjectSummary(payload);
    if (Array.isArray(incomingProjectSummary)) {
      const { priceFrom, priceTo } = computePriceRangeFromBhk(
        incomingProjectSummary,
      );
      if (priceFrom !== undefined) existing.priceFrom = priceFrom;
      if (priceTo !== undefined) existing.priceTo = priceTo;
    }

    // ---------- SAFE APPLY (do not blindly overwrite arrays) ----------
    const safeUpdate = pickDefined(payload as any);
    if (Array.isArray(incomingProjectSummary)) {
      (safeUpdate as any).projectSummary = incomingProjectSummary;
    }
    delete (safeUpdate as any).bhkSummary;
    if (Array.isArray((safeUpdate as any).amenities)) {
      (safeUpdate as any).amenities = normalizeAmenitiesInputs(
        (safeUpdate as any).amenities,
      );
    }

    // extract gallerySummary from safeUpdate before removing it so we know client's explicit intent
    const incomingGallerySummary = (safeUpdate as any).gallerySummary;
    delete (safeUpdate as any).gallerySummary;

    // Keep the stored about image. A text-only About save omits url/key, and
    // Object.assign would replace the whole subdocument and wipe the picture.
    const preservedAboutMedia = (
      Array.isArray((existing as any).aboutSummary)
        ? (existing as any).aboutSummary
        : []
    ).map((row: any) => plainAboutRow(row));
    const incomingAboutSummary = (safeUpdate as any).aboutSummary;
    delete (safeUpdate as any).aboutSummary;

    await reorderFeatureProjectRank(existing, safeUpdate);

    // apply other fields (shallow)
    Object.assign(existing, safeUpdate);

    if (user) recordProjectEditAudit(existing, user);

    const propId = existing._id!.toString();

    // --------- process BHK updates (files + planRemove + external URL) ----------
    const bhkPlanFiles = files?.bhkPlanFiles ?? [];

    if (Array.isArray(incomingProjectSummary)) {
      const totalUnits = incomingProjectSummary.reduce(
        (sum: number, bhk: any) =>
          sum + (Array.isArray(bhk.units) ? bhk.units.length : 0),
        0,
      );

      if (bhkPlanFiles.length > totalUnits) {
        throw new Error(
          "Too many bhkPlanFiles uploaded for provided bhk units",
        );
      }

      const mergedIncoming = mergeBhkSummary(
        (existing as any).projectSummary || (existing as any).bhkSummary || [],
        incomingProjectSummary,
      );

      const processed = await processBhkPlanUpdates({
        bhkSummaryExisting:
          (existing as any).projectSummary ||
          (existing as any).bhkSummary ||
          [],
        bhkSummaryIncoming: mergedIncoming,
        bhkPlanFiles,
        propertyId: propId,
        deleteOldS3OnExternalUrl: true,
      });

      (existing as any).projectSummary =
        getCanonicalProjectSummary({
          ...existing.toObject(),
          ...payload,
          projectSummary: processed,
        }) ?? processed;
      (existing as any).bhkSummary = undefined;
    }

    // --------- LOGO replacement ----------
    const logoFiles = files?.logo;
    if (logoFiles && logoFiles.length > 0) {
      const lf = logoFiles[0]!;
      const up = await uploadFile({
        filePath: lf.path,
        originalName: lf.originalname,
        mimetype: lf.mimetype,
        folder: "logo",
        propertyId: propId,
      });

      const oldLogoKey = (existing as any).logo?.key;
      if (oldLogoKey) await deleteS3ObjectIfExists(oldLogoKey);

      (existing as any).logo = {
        url: up.url,
        key: up.key,
        filename: lf.originalname,
        mimetype: lf.mimetype,
      };
    }

    // --------- HERO image/video ----------
    const heroFiles = files?.heroImage;
    if (heroFiles && heroFiles.length > 0) {
      const f = heroFiles[0]!;
      const imageBuffer = getUploadedFileBuffer(f);
      const watermarkedBuffer = await createWatermarkedBuffer(imageBuffer);
      const up = await uploadFile({
        buffer: watermarkedBuffer,
        originalName: f.originalname,
        mimetype: f.mimetype,
        folder: "hero",
        propertyId: propId,
      });
      existing.heroImage = up.url;
    }

    const heroVideoFiles = files?.heroVideo;
    if (heroVideoFiles && heroVideoFiles.length > 0) {
      const v = heroVideoFiles[0]!;
      uploadedPaths.add(v.path);
      const up = await uploadFile({
        filePath: v.path,
        originalName: v.originalname,
        mimetype: v.mimetype,
        folder: "video",
        propertyId: propId,
      });
      existing.heroVideo = up.url;
    }

    // --------- BROCHURE replacement ----------
    const brochureFiles = files?.brochure;
    if (brochureFiles && brochureFiles.length > 0) {
      const bf = brochureFiles[0] as Express.Multer.File;
      uploadedPaths.add(bf.path);
      const allowedMimeTypes = ["application/pdf"];
      const maxSizeBytes = 20 * 1024 * 1024;

      if (!allowedMimeTypes.includes(bf.mimetype)) {
        throw new Error("Brochure must be a PDF (application/pdf)");
      }

      if (bf.size && bf.size > maxSizeBytes) {
        throw new Error("Brochure file too large (max 20MB)");
      }

      const up = await uploadFile({
        filePath: bf.path,
        originalName: bf.originalname,
        mimetype: bf.mimetype,
        folder: "brochures",
        propertyId: propId,
      });

      const oldBrochureKey = (existing as any).brochure?.key;
      if (oldBrochureKey) await deleteS3ObjectIfExists(oldBrochureKey);

      (existing as any).brochure = {
        url: up.url,
        key: up.key,
        filename: bf.originalname,
        mimetype: bf.mimetype,
      };
    }

    // ---------- GALLERY handling (preserve when omitted; clear only when explicit [] ) ----------
    const galleryFiles = files?.galleryFiles ?? [];

    // If client omitted gallerySummary and no files uploaded -> preserve existing gallerySummary
    if (
      typeof incomingGallerySummary === "undefined" &&
      galleryFiles.length === 0
    ) {
      // preserve existing.gallerySummary; migrate legacy `gallery` if present
      if (
        !Array.isArray((existing as any).gallerySummary) &&
        Array.isArray((existing as any).gallery)
      ) {
        (existing as any).gallerySummary = (existing as any).gallery.slice();
      }
    } else {
      // we will touch gallerySummary (client provided meta (maybe []) or files exist)
      if (
        !Array.isArray((existing as any).gallerySummary) &&
        Array.isArray((existing as any).gallery)
      ) {
        (existing as any).gallerySummary = (existing as any).gallery.slice();
      } else if (!Array.isArray((existing as any).gallerySummary)) {
        (existing as any).gallerySummary = [];
      }

      // If client explicitly provided gallerySummary array
      if (Array.isArray(incomingGallerySummary)) {
        if (incomingGallerySummary.length === 0) {
          // explicit clear requested
          (existing as any).gallerySummary = [];
        } else {
          for (let i = 0; i < incomingGallerySummary.length; i++) {
            const inc = incomingGallerySummary[i];
            if (i < (existing as any).gallerySummary.length) {
              (existing as any).gallerySummary[i] = {
                ...(existing as any).gallerySummary[i],
                ...inc,
              };
            } else {
              (existing as any).gallerySummary.push({ ...inc });
            }
          }
        }
      }

      // Map uploaded files into gallerySummary (match by filename, then fill empty slots or append)
      if (galleryFiles.length > 0) {
        const filesByName = new Map<string, Express.Multer.File>();
        for (const f of galleryFiles) filesByName.set(f.originalname, f);

        // match by declared filename first
        for (
          let i = 0;
          i < (existing as any).gallerySummary.length && filesByName.size > 0;
          i++
        ) {
          const entry = (existing as any).gallerySummary[i] as any;
          const declared = entry?.filename ?? entry?.fileName ?? entry?.file;
          if (declared && filesByName.has(declared)) {
            const f = filesByName.get(declared)!;
            const imageBuffer = getUploadedFileBuffer(f);
            const watermarkedBuffer = await createWatermarkedBuffer(imageBuffer);
            const up = await uploadFile({
              buffer: watermarkedBuffer,
              originalName: f.originalname,
              mimetype: f.mimetype,
              folder: "gallery",
              propertyId: propId,
            });
            entry.url = up.url;
            entry.key = up.key;
            entry.filename = f.originalname;
            filesByName.delete(declared);
          }
        }

        // remaining files -> fill first empty slots, else append
        const remainingFiles = Array.from(filesByName.values());
        for (const file of remainingFiles) {
          if (!file) continue;
          const imageBuffer = getUploadedFileBuffer(file);
          const watermarkedBuffer = await createWatermarkedBuffer(imageBuffer);
          const up = await uploadFile({
            buffer: watermarkedBuffer,
            originalName: file.originalname,
            mimetype: file.mimetype,
            folder: "gallery",
            propertyId: propId,
          });
          const emptySlotIndex = (existing as any).gallerySummary.findIndex(
            (e: any) => !e?.url,
          );
          if (emptySlotIndex >= 0) {
            const slot = (existing as any).gallerySummary[
              emptySlotIndex
            ] as any;
            slot.url = up.url;
            slot.key = up.key;
            slot.filename = file.originalname;
            slot.title = slot.title ?? file.originalname;
            slot.category = slot.category ?? "image";
            slot.order = slot.order ?? emptySlotIndex + 1;
          } else {
            (existing as any).gallerySummary.push({
              title: file.originalname,
              url: up.url,
              key: up.key,
              filename: file.originalname,
              category: "image",
              order: ((existing as any).gallerySummary.length || 0) + 1,
            } as any);
          }
        }
      }
    } // end gallery handling

    // ---------- ABOUT merge & aboutImage replacement ----------
    {
      const incomingAboutArr: any[] = Array.isArray(incomingAboutSummary)
        ? incomingAboutSummary.slice()
        : Array.isArray((payload as any).aboutSummary)
          ? (payload as any).aboutSummary.slice()
          : (payload as any).about
            ? [{ ...(payload as any).about }]
            : [];

      const aboutFiles = files?.aboutImage;
      const hasAboutFile = Boolean(aboutFiles && aboutFiles.length > 0);

      if (incomingAboutArr.length > 0 || hasAboutFile) {
        const merged =
          preservedAboutMedia.length > 0
            ? preservedAboutMedia.map((row: any) => ({ ...row }))
            : [plainAboutRow(null)];

        for (let i = 0; i < incomingAboutArr.length; i++) {
          const incoming = incomingAboutArr[i] || {};
          const previous = merged[i] || plainAboutRow(null);
          const nextUrl = httpMediaUrl(incoming.url);
          const next = {
            builderName:
              incoming.builderName !== undefined
                ? String(incoming.builderName ?? "")
                : previous.builderName,
            aboutDescription:
              incoming.aboutDescription !== undefined
                ? String(incoming.aboutDescription ?? "")
                : previous.aboutDescription,
            rightContent:
              incoming.rightContent !== undefined
                ? String(incoming.rightContent ?? "")
                : previous.rightContent,
            url: nextUrl || previous.url || "",
            key: nextUrl
              ? String(incoming.key || previous.key || "")
              : previous.key || "",
            filename: nextUrl
              ? String(incoming.filename || previous.filename || "")
              : previous.filename || "",
            mimetype: nextUrl
              ? String(incoming.mimetype || previous.mimetype || "")
              : previous.mimetype || "",
          };
          if (i < merged.length) merged[i] = next;
          else merged.push(next);
        }

        if (hasAboutFile) {
          const f = aboutFiles![0]!;
          uploadedPaths.add(f.path);
          const up = await uploadFile({
            filePath: f.path,
            originalName: f.originalname,
            mimetype: f.mimetype,
            folder: "about",
            propertyId: propId,
          });

          const oldKey = merged[0]?.key;
          if (oldKey && oldKey !== up.key) {
            await deleteS3ObjectIfExists(oldKey);
          }

          if (!merged[0]) merged[0] = plainAboutRow({ rightContent: "" });
          merged[0].url = up.url;
          merged[0].key = up.key;
          merged[0].filename = f.originalname;
          merged[0].mimetype = f.mimetype;
          if (!merged[0].rightContent) merged[0].rightContent = "";
        }

        (existing as any).aboutSummary = merged;
        existing.markModified("aboutSummary");
      }
    }

    // save and return populated user details
    await existing.save();
    await upsertActiveListingCityAndLocality(existing);
    return loadFeaturedWithUsers(String(existing._id));
  },

  async getMyHightlightProjects(userId: string, projectIds?: string[] | null) {
    const filter: any = {
      createdBy: userId,
      "promotion.type": { $ne: "prime" },
    };

    if (projectIds) {
      filter._id = { $in: projectIds };
    }

    const projects = await applyFeaturedUserPopulates(
      FeaturedProject.find(filter),
    ).lean();

    return enrichFeaturedListWithUsers(projects);
  },

  async getMyFeaturedProjects(userId: string, projectIds?: string[] | null) {
    const filter: any = {
      createdBy: userId,
      "promotion.type": "prime",
    };

    if (projectIds) {
      filter._id = { $in: projectIds };
    }

    const projects = await applyFeaturedUserPopulates(
      FeaturedProject.find(filter),
    ).lean();

    return enrichFeaturedListWithUsers(projects);
  },

  async getFeatureBySlug(slug: string) {
    if (!slug || typeof slug !== "string") {
      throw new Error("Invalid slug");
    }

    const original = await FeaturedProject.findOne({ slug })
      .select("createdBy")
      .lean();
    const doc = await applyFeaturedUserPopulates(
      FeaturedProject.findOne({ slug }),
    ).lean();

    return hideUnstartedPromotion(
      serializeFeaturedProject(
        await restoreCreatedById(FeaturedProject, doc, original?.createdBy),
      ),
    );
  },

  async getFeatureById(id: string) {
    return loadFeaturedWithUsers(id);
  },

  async getFeaturesByCity({ locality, city, state }: LocationParams) {
    // 🥇 1. Try LOCALITY
    const featuredNow = new Date();
    const baseFilter = {
      status: "active",
      "promotion.type": { $in: ["featured", "sponsored"] },
      "promotion.boostExpiry": { $gt: featuredNow },
      ...promotionHasStartedMatch(featuredNow),
    };
    if (locality) {
      const items = await findFeatured({
        ...baseFilter,
        locality: exactCaseInsensitive(locality),
      });

      if (items.length > 0) {
        return {
          level: "locality",
          value: locality,
          total: items.length,
          items,
        };
      }
    }

    if (city) {
      const items = await findFeatured({
        ...baseFilter,
        city: exactCaseInsensitive(city),
      });

      if (items.length > 0) {
        return { level: "city", value: city, total: items.length, items };
      }
    }

    // 🥉 3. Try STATE
    if (state) {
      const items = await findFeatured({
        ...baseFilter,
        state: exactCaseInsensitive(state),
      });

      if (items.length > 0) {
        return { level: "state", value: state, total: items.length, items };
      }
    }

    return {
      level: "none",
      total: 0,
      items: [],
    };
  },

  async getAllFeatures(options?: {
    page?: number;
    limit?: number;
    q?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    promotionStatus?: "active" | "expired" | "scheduled" | "all";
    type?: string; // 🔥 NEW
    city?: string; // 🔥 NEW
    state?: string; // 🔥 NEW
    locality?: string; // 🔥 NEW
    propertyCode?: string;
    from?: string;
    to?: string;
    minPrice?: number;
    maxPrice?: number;
    bhk?: string;
    rera?: boolean;
    categoryType?: string;
    view?: "card";
    possession?: string;
    builder?: string;
    propertyType?: string;
    minSqft?: number;
    maxSqft?: number;
  }) {
    const page = Math.max(1, options?.page ?? 1);
    const ownerUserId = (options as any)?.ownerUserId as string | undefined;
    const limit = ownerListLimit({ ownerUserId, limit: options?.limit });
    const skip = (page - 1) * limit;

    const statusOpt = String(options?.status || "").trim().toLowerCase();
    const hasDateRange = Boolean(options?.from || options?.to);
    // Date drill-downs (sidebar "today") must include pending/draft/inactive.
    // Default public list stays active-only.
    // status=all → no status filter (admin dropdown "All Status").
    const filter: any = {};
    if (statusOpt === "all") {
      /* Admin "All Status" — every project including inactive/rejected/archived */
    } else if (statusOpt) {
      if (
        statusOpt === "deleted" ||
        statusOpt === "inactive" ||
        statusOpt === "deactivated"
      ) {
        filter.status = { $in: ["inactive", "archived"] };
      } else if (
        statusOpt === "draft" ||
        statusOpt === "onboarding" ||
        statusOpt === "incomplete"
      ) {
        filter.status = {
          $in: ["draft", "onboarding", "incomplete"],
        };
      } else if (
        statusOpt === "approved" ||
        statusOpt === "live" ||
        statusOpt === "active"
      ) {
        filter.status = "active";
      } else if (statusOpt === "pending") {
        filter.status = "pending";
      } else if (statusOpt === "rejected") {
        filter.status = "rejected";
      } else if (statusOpt === "archived") {
        filter.status = "archived";
      } else {
        filter.status = statusOpt;
      }
    } else if (!hasDateRange) {
      filter.status = "active";
    }
    const andFilters: any[] = [];
    const escapeRegex = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    if (options?.from || options?.to) {
      const createdAt: Record<string, Date> = {};
      if (options.from) {
        createdAt.$gte = new Date(`${String(options.from).slice(0, 10)}T00:00:00.000+05:30`);
      }
      if (options.to) {
        createdAt.$lte = new Date(`${String(options.to).slice(0, 10)}T23:59:59.999+05:30`);
      }
      filter.createdAt = createdAt;
    }

    // Title / location / code search. Token regex so "morton villas" matches
    // title "Morton Villas" even when the row is not in the loaded page set.
    // $text is not used here — it misses partial titles and fails if the
    // text index is unavailable.
    if (options?.q) {
      const tokens = String(options.q)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8);
      if (tokens.length) {
        andFilters.push({
          $and: tokens.map((token) => {
            const pattern = escapeRegex(token);
            return {
              $or: [
                { title: { $regex: pattern, $options: "i" } },
                { slug: { $regex: pattern, $options: "i" } },
                { address: { $regex: pattern, $options: "i" } },
                { city: { $regex: pattern, $options: "i" } },
                { locality: { $regex: pattern, $options: "i" } },
                { state: { $regex: pattern, $options: "i" } },
                { propertyCode: { $regex: pattern, $options: "i" } },
                { heroTagline: { $regex: pattern, $options: "i" } },
                { metaTitle: { $regex: pattern, $options: "i" } },
                { "about.builderName": { $regex: pattern, $options: "i" } },
                { "aboutSummary.builderName": { $regex: pattern, $options: "i" } },
                { builderName: { $regex: pattern, $options: "i" } },
                { "createdBy.name": { $regex: pattern, $options: "i" } },
                { "createdBy.fullName": { $regex: pattern, $options: "i" } },
                { "createdBy.companyName": { $regex: pattern, $options: "i" } },
              ],
            };
          }),
        });
      }
    }

    // 🔥 PROMOTION TYPE FILTER
    if (options?.type) {
      const promotionTypeMatch = buildPromotionTypeMatch(
        options.type.split(","),
      );

      if (promotionTypeMatch) {
        andFilters.push(promotionTypeMatch);
      }
    }

    // 🌍 LOCATION FILTER
    const makeRegex = (value?: string) =>
      value ? { $regex: `^${value.trim()}$`, $options: "i" } : undefined;

    if (options?.city) filter.city = makeRegex(options.city);
    if (options?.state) filter.state = makeRegex(options.state);

    const category = String(options?.categoryType || "").trim().toLowerCase();
    if (
      category === "residential" ||
      category === "commercial" ||
      category === "land" ||
      category === "agricultural"
    ) {
      filter.categoryType = category;
    }

    if (options?.propertyCode) {
      filter.propertyCode = {
        $regex: escapeRegex(options.propertyCode.trim()),
        $options: "i",
      };
    }
    if ((options as any)?.ownerUserId) {
      applyOwnerUserFilter(filter, (options as any).ownerUserId);
    } else {
      if ((options as any)?.createdBy) {
        filter.createdBy = new mongoose.Types.ObjectId((options as any).createdBy);
      }
      if ((options as any)?.postedBy) {
        filter["postedBy.userId"] = new mongoose.Types.ObjectId(
          (options as any).postedBy,
        );
      }
    }

    // 🔥 EXCLUDE EXPIRED PROMOTIONS
    // Admin status filters (draft/pending/all/…) must not inherit public
    // "active promotion only" default — that hid drafts in production.
    const promotionStatus =
      options?.promotionStatus ||
      (statusOpt && statusOpt !== "active" ? "all" : "active");
    const now = new Date();

    if (promotionStatus !== "all" && options?.type) {
      const wantsBoost = String(options.type)
        .split(",")
        .some((part) => {
          const key = part.trim();
          return key && key !== "normal";
        });
      if (wantsBoost) andFilters.push(promotionHasStartedMatch(now));
    }

    if (promotionStatus === "scheduled") {
      andFilters.push({
        "promotion.type": { $in: promotedPromotionTypes },
        "promotion.startDate": { $gt: now },
      });
    } else if (promotionStatus === "expired") {
      andFilters.push({
        $or: [
          {
            "promotion.type": { $in: promotedPromotionTypes },
            "promotion.boostExpiry": { $lte: now },
          },
          {
            $and: [
              {
                $or: [
                  { "promotion.type": "normal" },
                  { "promotion.type": { $exists: false } },
                  { "promotion.type": null },
                ],
              },
              {
                promotionHistory: {
                  $elemMatch: {
                    fromType: { $in: promotedPromotionTypes },
                    toType: "normal",
                    reason: { $regex: "expired", $options: "i" },
                  },
                },
              },
            ],
          },
        ],
      });
    } else if (promotionStatus !== "all") {
      andFilters.push({
        $or: [
          {
            $and: [
              { "promotion.boostExpiry": { $gt: now } },
              promotionHasStartedMatch(now),
            ],
          },
          { "promotion.type": "normal" },
          { "promotion.type": { $exists: false } },
          { "promotion.type": null },
          {
            $and: [
              { "promotion.type": { $in: ["prime", "featured", "sponsored"] } },
              { "promotion.startDate": { $gt: now } },
            ],
          },
        ],
      });
    }

    if (andFilters.length > 0) {
      filter.$and = [...(filter.$and || []), ...andFilters];
    }

    const cardView = options?.view === "card";
    const facetMatch = cardView
      ? {
          ...filter,
          ...(filter.$and ? { $and: [...filter.$and] } : {}),
        }
      : null;
    const discoveryFilters = buildDiscoveryFilters(options);
    if (discoveryFilters.length) {
      filter.$and = [...(filter.$and || []), ...discoveryFilters];
    }

    // 🥇 SORT
    const sort: any = {
      "promotion.priority": -1,
    };

    if (options?.sortBy) {
      sort[options.sortBy] = options.sortOrder === "asc" ? 1 : -1;
    } else {
      sort.createdAt = -1;
    }

    const itemsQuery = FeaturedProject.find(filter).sort(sort).skip(skip).limit(limit);
    if (cardView) itemsQuery.select(PUBLIC_PROJECT_CARD_SELECT);

    const [rawItems, total, facets, promotionCounts] = await Promise.all([
      (cardView ? itemsQuery : applyFeaturedListPopulates(itemsQuery))
        .lean()
        .exec(),

      FeaturedProject.countDocuments(filter),

      facetMatch ? collectPublicProjectFacets(facetMatch) : Promise.resolve(undefined),

      (options as any)?.createdBy || (options as any)?.ownerUserId
        ? countPromotionTypes(filter)
        : Promise.resolve(undefined),
    ]);

    const enriched = cardView
      ? rawItems.map((item: any) => toPublicProjectCard(item))
      : await enrichFeaturedListWithUsers(rawItems);
    let items = cardView
      ? enriched
      : promotionStatus === "all" || promotionStatus === "scheduled"
        ? enriched
        : enriched.map((item: any) => hideUnstartedPromotion(item));

    // Homepage prime list only. Admin lists pass page, limit, or status and stay in rank order.
    let displayMode: "ranked" | "shuffle" | undefined;
    if (isPublicPrimeHomepageQuery(options)) {
      displayMode = await getPrimeDisplayMode();
      items =
        displayMode === "shuffle" ? shuffleList(items) : sortListByRank(items);
    }

    return {
      items,
      ...(displayMode ? { displayMode } : {}),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        ...(promotionCounts ? { promotionCounts } : {}),
      },
      ...(facets ? { facets } : {}),
    };
  },

  async getHighlightByLocation({
    state,
    city,
    locality,
  }: {
    state?: string;
    city?: string;
    locality?: string;
  }) {
    const highlightNow = new Date();
    const baseFilter: any = {
      status: "active",
      "promotion.type": { $in: ["featured", "sponsored"] },
      "promotion.boostExpiry": { $gt: highlightNow }, // 🔥 NOT expired
      ...promotionHasStartedMatch(highlightNow),
    };

    const makeRegex = (value?: string) =>
      value ? { $regex: `^${value.trim()}$`, $options: "i" } : undefined;

    // 1️⃣ Locality level
    if (state || city || locality) {
      const localityFilter = {
        ...baseFilter,
        ...(state && { state: makeRegex(state) }),
        ...(city && { city: makeRegex(city) }),
        ...(locality && { locality: makeRegex(locality) }),
      };

      //checking
      const localityItems = await FeaturedProject.find(localityFilter)
        .select(
          "title heroImage priceFrom priceTo slug propertyCode city state locality logo amenities projectSummary bhkSummary",
        )
        .sort({ rank: 1 })
        .limit(5)
        .lean();

      if (localityItems.length > 0) {
        return {
          level: "locality",
          total: localityItems.length,
          items: serializeFeaturedProjectList(localityItems),
        };
      }
    }

    // 2️⃣ City level fallback
    if (state || city) {
      const cityFilter = {
        ...baseFilter,
        ...(state && { state: makeRegex(state) }),
        ...(city && { city: makeRegex(city) }),
      };

      const cityItems = await FeaturedProject.find(cityFilter)
        .select("title heroImage priceFrom priceTo slug propertyCode city state locality")
        .sort({ rank: 1 })
        .limit(5)
        .lean();

      if (cityItems.length > 0) {
        return {
          level: "city",
          total: cityItems.length,
          items: serializeFeaturedProjectList(cityItems),
        };
      }
    }

    // 3️⃣ State level fallback
    if (state) {
      const stateFilter = {
        ...baseFilter,
        state: makeRegex(state),
      };

      const stateItems = await FeaturedProject.find(stateFilter)
        .select("title heroImage priceFrom priceTo slug propertyCode city state locality")
        .sort({ rank: 1 })
        .limit(5)
        .lean();

      return {
        level: "state",
        total: stateItems.length,
        items: serializeFeaturedProjectList(stateItems),
      };
    }

    return {
      level: "none",
      total: 0,
      items: [],
    };
  },

  async getAllHighlightProjects(options?: {
    page?: number;
    limit?: number;
    q?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, options?.limit ?? 20);
    const skip = (page - 1) * limit;
    const filter: any = {
      status: "active",
    };
    if (options?.q) filter.$text = { $search: options.q };
    if (options?.status) filter.status = options.status;

    filter.$or = [
      { "promotion.type": "normal" },
      { "promotion.type": { $exists: false } },
      { "promotion.type": null },
    ];

    const sort: any = {
      "promotion.priority": -1, // 🔥 MAIN LOGIC
      rank: -1,
      createdAt: -1,
    };
    if (options?.sortBy)
      sort[options.sortBy] = options.sortOrder === "asc" ? 1 : -1;
    else sort.createdAt = -1;
    const [items, total] = await Promise.all([
      applyFeaturedUserPopulates(
        FeaturedProject.find(filter).sort(sort).skip(skip).limit(limit),
      )
        .lean()
        .exec(),
      FeaturedProject.countDocuments(filter).exec(),
    ]);
    return {
      items: await enrichFeaturedListWithUsers(items as any),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  },

  /**
   * Soft-delete (deactivate): keep media/docs; mark inactive and stamp who deleted.
   */
  async deleteFeatureProperty(
    id: string,
    actor?: {
      id?: string;
      name?: string;
      email?: string;
      roleName?: string;
    } | null,
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");

    const existing = await FeaturedProject.findById(id).exec();
    if (!existing) return null;

    const now = new Date();
    existing.status = "inactive";
    (existing as any).deletedAt = now;
    (existing as any).deletedBy = {
      userId:
        actor?.id && mongoose.Types.ObjectId.isValid(actor.id)
          ? new mongoose.Types.ObjectId(actor.id)
          : undefined,
      name: actor?.name || "",
      email: actor?.email || "",
      roleName: actor?.roleName || "",
    };
    if (actor?.id && mongoose.Types.ObjectId.isValid(actor.id)) {
      existing.updatedBy = new mongoose.Types.ObjectId(actor.id) as any;
    }
    (existing as any).lastUpdatedBy = {
      userId:
        actor?.id && mongoose.Types.ObjectId.isValid(actor.id)
          ? new mongoose.Types.ObjectId(actor.id)
          : undefined,
      name: actor?.name || "",
      email: actor?.email || "",
      roleName: actor?.roleName || "",
      updatedAt: now,
    };

    const history = Array.isArray((existing as any).updateHistory)
      ? (existing as any).updateHistory
      : [];
    history.push({
      userId:
        actor?.id && mongoose.Types.ObjectId.isValid(actor.id)
          ? new mongoose.Types.ObjectId(actor.id)
          : undefined,
      name: actor?.name || "",
      email: actor?.email || "",
      roleName: actor?.roleName || "",
      updatedAt: now,
      action: "deleted",
    });
    (existing as any).updateHistory = history;
    (existing as any).updateCount = Number((existing as any).updateCount || 0) + 1;

    await existing.save();
    return existing.toObject();
  },

  /**
   * Hard delete: remove DB row + best-effort S3 cleanup.
   * Intended only after soft-delete (inactive), for privileged roles.
   */
  async permanentlyDeleteFeatureProperty(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");

    const existing = await FeaturedProject.findById(id).lean();
    if (!existing) return null;

    const status = String((existing as any).status || "").toLowerCase();
    if (status !== "inactive" && !(existing as any).deletedAt) {
      throw new Error(
        "Project must be deactivated first before permanent delete",
      );
    }

    const projectSummary =
      (existing as any).projectSummary ?? existing.bhkSummary;
    if (Array.isArray(projectSummary)) {
      for (const b of projectSummary) {
        for (const u of b.units || []) {
          if (u?.plan?.key) {
            await deleteS3ObjectIfExists(u.plan.key);
          }
        }
      }
    }

    if (Array.isArray(existing.gallerySummary)) {
      for (const g of existing.gallerySummary) {
        if ((g as any)?.key) {
          await deleteS3ObjectIfExists((g as any).key);
        }
      }
    }

    const logoKey = (existing as any).logo?.key;
    if (logoKey) await deleteS3ObjectIfExists(logoKey);

    const brochureKey = (existing as any).brochure?.key;
    if (brochureKey) await deleteS3ObjectIfExists(brochureKey);

    const deleted = await FeaturedProject.findByIdAndDelete(id).exec();
    return deleted;
  },

  async incrementViews(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");
    await FeaturedProject.findByIdAndUpdate(id, {
      $inc: { "meta.views": 1 },
    }).exec();
  },

  async incrementClicks(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");
    await FeaturedProject.findByIdAndUpdate(id, {
      $inc: { "meta.clicks": 1 },
    }).exec();
  },

  async getFeaturedLocationOptions(state?: string) {
    return getListingLocationOptions(state);
  },

  /**
   * Cascading admin board facets.
   * State / city / locality follow the selected builder.
   * Builder follows the selected state / city / locality.
   * Each list ignores its own selection so the user can switch.
   */
  async getProjectBoardFilterOptions(options?: {
    state?: string | undefined;
    city?: string | undefined;
    locality?: string | undefined;
    createdBy?: string | undefined;
  }) {
    const escapeRegex = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exactCi = (field: string, raw?: string) => {
      const value = String(raw || "").trim();
      if (!value) return null;
      return {
        [field]: {
          $regex: `^\\s*${escapeRegex(value)}\\s*$`,
          $options: "i",
        },
      };
    };
    const textField = (field: string) => ({
      [field]: { $type: "string", $nin: ["", null] },
    });
    const trimmedLower = (field: string) => ({
      $toLower: {
        $trim: { input: { $ifNull: [`$${field}`, ""] } },
      },
    });

    const createdBy = String(options?.createdBy || "").trim();
    const builderScope =
      mongoose.Types.ObjectId.isValid(createdBy)
        ? { createdBy: new mongoose.Types.ObjectId(createdBy) }
        : {};

    const stateClause = exactCi("state", options?.state);
    const cityClause = exactCi("city", options?.city);
    const localityClause = exactCi("locality", options?.locality);

    const cityMatch = {
      ...builderScope,
      ...(stateClause || {}),
      ...textField("city"),
    };
    const localityMatch = {
      ...builderScope,
      ...(stateClause || {}),
      ...(cityClause || {}),
      ...textField("locality"),
    };
    const builderMatch: Record<string, unknown> = {
      createdBy: { $type: "objectId" },
      ...(stateClause || {}),
      ...(cityClause || {}),
      ...(localityClause || {}),
    };

    const promotionScope = {
      ...builderScope,
      ...(stateClause || {}),
      ...(cityClause || {}),
      ...(localityClause || {}),
    };

    const [states, cities, localities, builderRows, promotionRows] =
      await Promise.all([
      FeaturedProject.aggregate([
        { $match: { ...builderScope, ...textField("state") } },
        {
          $group: {
            _id: trimmedLower("state"),
            name: { $first: "$state" },
            count: { $sum: 1 },
          },
        },
        { $sort: { name: 1 } },
      ]),
      FeaturedProject.aggregate([
        { $match: cityMatch },
        {
          $group: {
            _id: {
              state: trimmedLower("state"),
              city: trimmedLower("city"),
            },
            name: { $first: "$city" },
            state: { $first: "$state" },
            count: { $sum: 1 },
          },
        },
        { $sort: { name: 1 } },
      ]),
      options?.city || createdBy
        ? FeaturedProject.aggregate([
            { $match: localityMatch },
            {
              $group: {
                _id: {
                  state: trimmedLower("state"),
                  city: trimmedLower("city"),
                  locality: trimmedLower("locality"),
                },
                name: { $first: "$locality" },
                city: { $first: "$city" },
                state: { $first: "$state" },
                count: { $sum: 1 },
              },
            },
            { $sort: { name: 1 } },
          ])
        : Promise.resolve([]),
      FeaturedProject.aggregate([
        { $match: builderMatch },
        {
          $group: {
            _id: "$createdBy",
            count: { $sum: 1 },
            fallbackName: {
              $first: { $arrayElemAt: ["$aboutSummary.builderName", 0] },
            },
          },
        },
        {
          $lookup: {
            from: User.collection.name,
            localField: "_id",
            foreignField: "_id",
            pipeline: [
              { $project: { name: 1, companyName: 1, email: 1 } },
            ],
            as: "user",
          },
        },
        {
          $project: {
            count: 1,
            name: {
              $ifNull: [
                { $arrayElemAt: ["$user.name", 0] },
                {
                  $ifNull: [
                    { $arrayElemAt: ["$user.companyName", 0] },
                    {
                      $ifNull: [
                        "$fallbackName",
                        { $arrayElemAt: ["$user.email", 0] },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        { $match: { name: { $type: "string", $nin: ["", null] } } },
        { $sort: { name: 1 } },
      ]),
      FeaturedProject.aggregate([
        { $match: promotionScope },
        {
          $group: {
            _id: {
              $toLower: {
                $ifNull: ["$promotion.type", "normal"],
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const clean = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

    return {
      states: (states || [])
        .map((row: { name?: string; count?: number }) => ({
          name: clean(row.name),
          count: Number(row.count || 0),
        }))
        .filter((row: { name: string }) => row.name),
      cities: (cities || [])
        .map((row: { name?: string; state?: string; count?: number }) => ({
          name: clean(row.name),
          state: clean(row.state),
          count: Number(row.count || 0),
        }))
        .filter((row: { name: string }) => row.name),
      localities: (localities || [])
        .map(
          (row: {
            name?: string;
            city?: string;
            state?: string;
            count?: number;
          }) => ({
            name: clean(row.name),
            city: clean(row.city),
            state: clean(row.state),
            count: Number(row.count || 0),
          }),
        )
        .filter((row: { name: string }) => row.name),
      builders: (builderRows || [])
        .map((row: { _id?: unknown; name?: string; count?: number }) => ({
          id: String(row._id || ""),
          name: clean(row.name),
          count: Number(row.count || 0),
        }))
        .filter((row: { id: string; name: string }) => row.id && row.name),
      promotions: (promotionRows || []).reduce(
        (
          totals: {
            normal: number;
            featured: number;
            prime: number;
            sponsored: number;
          },
          row: { _id?: string; count?: number },
        ) => {
          const key = String(row._id || "normal");
          const count = Number(row.count || 0);
          if (key === "featured" || key === "prime" || key === "sponsored") {
            totals[key] += count;
          } else {
            totals.normal += count;
          }
          return totals;
        },
        { normal: 0, featured: 0, prime: 0, sponsored: 0 },
      ),
    };
  },
};

