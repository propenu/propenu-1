import mongoose from "mongoose";
import Residential from "../models/residentialModel";
import Commercial from "../models/commercialModel";
import LandPlot from "../models/landModel";
import Agricultural from "../models/agriculturalModel";
import User from "../models/userModel";
import { attachCreatedByProfiles } from "../utils/agentSubmission";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SORT = new Set(["newest", "oldest"]);
const ALLOWED_STATUS = new Set([
  "draft",
  "pending",
  "active",
  "expired",
  "deactivated",
  "archived",
  "rejected",
]);
const ALLOWED_CATEGORY = new Set([
  "residential",
  "commercial",
  "land",
  "agricultural",
]);
const ALLOWED_LISTING = new Set(["sale", "rent", "lease"]);
const ALLOWED_PROMO = new Set(["normal", "prime", "featured", "sponsored"]);
const ALLOWED_TRACKING = new Set([
  "all",
  "promoted",
  "active",
  "expiringSoon",
  "expired",
]);
const BOOSTED = ["prime", "featured", "sponsored"];

/**
 * Query pattern this service serves:
 *   optional status + location + createdAt range, then sort createdAt/_id, fixed page size 12.
 * Existing single-field indexes: status, city, createdAt (timestamps).
 * Recommended later if explain() shows in-memory sort on large status filters:
 *   { status: 1, createdAt: -1, _id: -1 }
 */

const toObjectIdOrNull = (input: unknown) => ({
  $convert: {
    input,
    to: "objectId",
    onError: null,
    onNull: null,
  },
});

const CARD_PROJECT = {
  title: 1,
  buildingName: 1,
  landName: 1,
  status: 1,
  listingType: 1,
  propertyType: 1,
  propertyCode: 1,
  locality: 1,
  city: 1,
  state: 1,
  pincode: 1,
  price: 1,
  createdAt: 1,
  updatedAt: 1,
  rejectedReason: 1,
  promotion: 1,
  promotionHistory: { $slice: ["$promotionHistory", -5] },
  lastPromotionType: 1,
  displayType: 1,
  heroImage: 1,
  gallery: { $slice: ["$gallery", 1] },
  images: { $slice: ["$images", 1] },
  createdBy: 1,
  postedBy: 1,
  listingSource: 1,
  slug: 1,
  meta: 1,
  completion: 1,
  followUpAssignedTo: 1,
  followUpWorkStatus: 1,
  followUpCompletionReason: 1,
  _category: 1,
};

const parseIstDay = (value: unknown, endOfDay = false) => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const raw = value.trim();
  if (ISO_DAY.test(raw)) {
    const date = new Date(
      `${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+05:30`,
    );
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const exactCi = (value: string) =>
  new RegExp(`^${escapeRegex(value)}$`, "i");

const findListingPeopleIds = async (rawQ: string) => {
  if (!rawQ) return [];
  const safe = escapeRegex(rawQ);
  const rx = new RegExp(safe, "i");
  const digits = rawQ.replace(/\D/g, "");
  const userOr: Record<string, any>[] = [
    { name: rx },
    { companyName: rx },
    { email: rx },
    { phone: rx },
  ];
  if (digits.length >= 6) {
    userOr.push({ phone: new RegExp(`${escapeRegex(digits)}$`) });
    userOr.push({ phone: new RegExp(escapeRegex(digits)) });
  }
  const [users, agents] = await Promise.all([
    User.find({ $or: userOr }).select("_id").limit(80).lean(),
    mongoose.connection
      .collection("agents")
      .find(
        {
          $or: [
            { name: rx },
            { agencyName: rx },
            { email: rx },
            { phone: rx },
            ...(digits.length >= 6
              ? [{ phone: new RegExp(escapeRegex(digits)) }]
              : []),
          ],
        },
        { projection: { _id: 1, user: 1 } },
      )
      .limit(40)
      .toArray(),
  ]);
  const ids = new Set<string>();
  for (const user of users) {
    if (user?._id) ids.add(String(user._id));
  }
  for (const agent of agents || []) {
    if (agent?._id) ids.add(String(agent._id));
    const userId = agent?.user?._id || agent?.user;
    if (userId) ids.add(String(userId));
  }
  return [...ids]
    .filter((id) => mongoose.Types.ObjectId.isValid(id) && id.length === 24)
    .map((id) => new mongoose.Types.ObjectId(id));
};

const CATEGORY_MODELS = [
  { category: "residential", model: Residential },
  { category: "commercial", model: Commercial },
  { category: "land", model: LandPlot },
  { category: "agricultural", model: Agricultural },
] as const;

const invalid = (message: string) =>
  Object.assign(new Error(message), { statusCode: 400 });

const andOr = (match: Record<string, any>, clause: Record<string, any>[]) => {
  if (match.$or) {
    match.$and = [...(match.$and || []), { $or: match.$or }, { $or: clause }];
    delete match.$or;
    return;
  }
  match.$or = clause;
};

const buildMatch = (
  query: Record<string, any>,
  options: {
    includePromotion?: boolean;
    includeTracking?: boolean;
    peopleIds?: mongoose.Types.ObjectId[];
  } = {},
) => {
  const includePromotion = options.includePromotion !== false;
  const includeTracking = options.includeTracking !== false;
  const peopleIds = options.peopleIds || [];
  const match: Record<string, any> = {};

  const status = String(query.status || "").trim().toLowerCase();
  if (status && status !== "all") {
    if (!ALLOWED_STATUS.has(status)) throw invalid("Invalid status");
    if (status === "rejected") {
      match.status = "draft";
      match.rejectedReason = { $exists: true, $nin: [null, ""] };
    } else {
      match.status = status;
    }
  }

  const listingType = String(query.listingType || "").trim().toLowerCase();
  if (listingType && listingType !== "all") {
    if (!ALLOWED_LISTING.has(listingType)) throw invalid("Invalid listingType");
    match.listingType =
      listingType === "rent" || listingType === "lease"
        ? { $regex: /^(rent|lease)$/i }
        : { $regex: /^sale$/i };
  }

  const state = String(query.state || "").trim();
  const city = String(query.city || "").trim();
  const locality = String(query.locality || "").trim();
  if (state) match.state = exactCi(state);
  if (city) match.city = exactCi(city);
  if (locality) match.locality = exactCi(locality);

  const locationQ = String(query.locationQ || query.locationSearch || "").trim();
  if (locationQ && !state && !city && !locality) {
    const locRx = new RegExp(escapeRegex(locationQ), "i");
    andOr(match, [{ state: locRx }, { city: locRx }, { locality: locRx }, { pincode: locRx }]);
  }

  const from = parseIstDay(
    query.from || query.startDate || query.createdFrom,
    false,
  );
  const to = parseIstDay(query.to || query.endDate || query.createdTo, true);
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lte = to;
  }

  const promotionType = String(query.promotionType || query.promotion || "")
    .trim()
    .toLowerCase();
  if (includePromotion && promotionType && promotionType !== "all") {
    if (!ALLOWED_PROMO.has(promotionType)) throw invalid("Invalid promotionType");
    match["promotion.type"] = promotionType;
  }

  const tracking = String(query.tracking || query.promotionStatus || "all")
    .trim()
    .replace(/[_-]+/g, "");
  const trackingKey = tracking === "expiringsoon" ? "expiringSoon" : tracking;
  if (includeTracking && trackingKey && trackingKey !== "all") {
    if (!ALLOWED_TRACKING.has(trackingKey)) {
      throw invalid("Invalid tracking filter");
    }
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const typeAlreadySet = Boolean(match["promotion.type"]);
    if (trackingKey === "promoted") {
      if (!typeAlreadySet) {
        andOr(match, [
          { "promotion.type": { $in: BOOSTED } },
          { lastPromotionType: { $in: BOOSTED } },
          { "promotionHistory.0": { $exists: true } },
        ]);
      }
    } else if (trackingKey === "active") {
      if (!typeAlreadySet) match["promotion.type"] = { $in: BOOSTED };
      andOr(match, [
        { "promotion.boostExpiry": { $exists: false } },
        { "promotion.boostExpiry": null },
        { "promotion.boostExpiry": { $gt: now } },
      ]);
    } else if (trackingKey === "expiringSoon") {
      if (!typeAlreadySet) match["promotion.type"] = { $in: BOOSTED };
      match["promotion.boostExpiry"] = { $gte: now, $lte: week };
    } else if (trackingKey === "expired") {
      andOr(match, [
        { "promotion.boostExpiry": { $lt: now }, "promotion.type": "normal" },
        { promotionHistory: { $elemMatch: { reason: /expired/i } } },
      ]);
    }
  }

  const rawQ = String(query.q || query.search || "").trim().slice(0, 120);
  if (rawQ) {
    const safe = escapeRegex(rawQ);
    const rx = new RegExp(safe, "i");
    const searchOr: Record<string, any>[] = [
      { title: rx },
      { buildingName: rx },
      { landName: rx },
      { locality: rx },
      { city: rx },
      { state: rx },
      { address: rx },
      { pincode: rx },
      { propertyCode: rx },
      { propertyType: rx },
      { listingType: rx },
      { slug: rx },
      { "postedBy.name": rx },
      { "postedBy.email": rx },
      { "postedBy.roleName": rx },
      { "lastUpdatedBy.name": rx },
      { "lastUpdatedBy.email": rx },
      { "createdBy.name": rx },
    ];
    if (peopleIds.length) {
      searchOr.push(
        { createdBy: { $in: peopleIds } },
        { "postedBy.userId": { $in: peopleIds } },
        { approvedBy: { $in: peopleIds } },
        { "approval.approvedByManager": { $in: peopleIds } },
        { ownerId: { $in: peopleIds } },
      );
    }
    if (mongoose.Types.ObjectId.isValid(rawQ) && rawQ.length === 24) {
      const asId = new mongoose.Types.ObjectId(rawQ);
      searchOr.push(
        { _id: asId },
        { createdBy: asId },
        { "postedBy.userId": asId },
      );
    }
    andOr(match, searchOr);
  }

  return match;
};

const zeroPromoFacets = () => {
  const promotionType: Record<string, number> = {
    all: 0,
    prime: 0,
    featured: 0,
    sponsored: 0,
    normal: 0,
  };
  const tracking: Record<string, number> = {
    all: 0,
    promoted: 0,
    active: 0,
    expiringSoon: 0,
    expired: 0,
  };
  return { promotionType, tracking };
};

export const listAdminProperties = async (query: Record<string, any> = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = 12;
  const includeFacets = !["0", "false"].includes(
    String(query.includeFacets ?? (page === 1 ? "1" : "0")).toLowerCase(),
  );
  const includeCount = !["0", "false"].includes(
    String(query.includeCount ?? (includeFacets ? "1" : "0")).toLowerCase(),
  );
  const skip = (page - 1) * limit;
  const sortKey = String(query.sort || query.sortBy || "newest").toLowerCase();
  if (sortKey && !ALLOWED_SORT.has(sortKey)) throw invalid("Invalid sort");
  const sortDir = (sortKey === "oldest" ? 1 : -1) as 1 | -1;

  const category = String(query.category || "all").trim().toLowerCase();
  if (category !== "all" && !ALLOWED_CATEGORY.has(category)) {
    throw invalid("Invalid category");
  }

  const promotionType = String(query.promotionType || query.promotion || "all")
    .trim()
    .toLowerCase() || "all";
  const trackingRaw = String(query.tracking || query.promotionStatus || "all")
    .trim()
    .replace(/[_-]+/g, "");
  const trackingKey =
    !trackingRaw || trackingRaw === "all"
      ? "all"
      : trackingRaw === "expiringsoon"
        ? "expiringSoon"
        : trackingRaw;
  if (promotionType !== "all" && !ALLOWED_PROMO.has(promotionType)) {
    throw invalid("Invalid promotionType");
  }
  if (trackingKey !== "all" && !ALLOWED_TRACKING.has(trackingKey)) {
    throw invalid("Invalid tracking filter");
  }

  const peopleIds = await findListingPeopleIds(
    String(query.q || query.search || "").trim().slice(0, 120),
  );

  const matchOptions = { peopleIds };
  const baseMatch = buildMatch(query, {
    ...matchOptions,
    includePromotion: false,
    includeTracking: false,
  });
  const listMatch = buildMatch(query, {
    ...matchOptions,
    includePromotion: true,
    includeTracking: true,
  });
  const promoFacetMatch = buildMatch(query, {
    ...matchOptions,
    includePromotion: false,
    includeTracking: true,
  });
  const trackingFacetMatch = buildMatch(query, {
    ...matchOptions,
    includePromotion: true,
    includeTracking: false,
  });

  const models =
    category === "all"
      ? CATEGORY_MODELS
      : CATEGORY_MODELS.filter((item) => item.category === category);

  const [primary, ...rest] = models;
  const unionStages = (match: Record<string, any>) =>
    rest.map((item) => ({
      $unionWith: {
        coll: item.model.collection.name,
        pipeline: [
          { $match: match },
          { $addFields: { _category: item.category } },
        ],
      },
    }));
  const restStages = unionStages(baseMatch);
  const cardItems = [
    {
      $sort: {
        "promotion.priority": -1 as const,
        createdAt: sortDir,
        _id: -1 as const,
      },
    },
    { $skip: skip },
    { $limit: limit },
    { $project: CARD_PROJECT },
    {
      $addFields: {
        _createdById: toObjectIdOrNull({
          $cond: [
            { $eq: [{ $type: "$createdBy" }, "object"] },
            { $ifNull: ["$createdBy._id", "$createdBy.id"] },
            "$createdBy",
          ],
        }),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_createdById",
        foreignField: "_id",
        as: "createdByDoc",
        pipeline: [
          {
            $project: {
              name: 1,
              companyName: 1,
              email: 1,
              phone: 1,
              role: 1,
              roleName: 1,
              roleId: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        _createdByRoleId: toObjectIdOrNull({
          $let: {
            vars: {
              rid: {
                $ifNull: [
                  { $arrayElemAt: ["$createdByDoc.roleId", 0] },
                  {
                    $cond: [
                      { $eq: [{ $type: "$createdBy" }, "object"] },
                      "$createdBy.roleId",
                      null,
                    ],
                  },
                ],
              },
            },
            in: {
              $cond: [
                { $eq: [{ $type: "$$rid" }, "object"] },
                { $ifNull: ["$$rid._id", "$$rid"] },
                "$$rid",
              ],
            },
          },
        }),
      },
    },
    {
      $lookup: {
        from: "roles",
        localField: "_createdByRoleId",
        foreignField: "_id",
        as: "createdByRoleDoc",
        pipeline: [{ $project: { name: 1, label: 1 } }],
      },
    },
    {
      $addFields: {
        createdBy: {
          $let: {
            vars: {
              userDoc: { $arrayElemAt: ["$createdByDoc", 0] },
              roleDoc: { $arrayElemAt: ["$createdByRoleDoc", 0] },
              existing: "$createdBy",
            },
            in: {
              _id: {
                $ifNull: ["$$userDoc._id", "$_createdById"],
              },
              name: {
                $ifNull: [
                  "$$userDoc.name",
                  {
                    $ifNull: [
                      {
                        $cond: [
                          { $eq: [{ $type: "$$existing" }, "object"] },
                          "$$existing.name",
                          null,
                        ],
                      },
                      "$$userDoc.companyName",
                    ],
                  },
                ],
              },
              companyName: {
                $ifNull: [
                  "$$userDoc.companyName",
                  {
                    $cond: [
                      { $eq: [{ $type: "$$existing" }, "object"] },
                      "$$existing.companyName",
                      null,
                    ],
                  },
                ],
              },
              email: {
                $ifNull: [
                  "$$userDoc.email",
                  {
                    $cond: [
                      { $eq: [{ $type: "$$existing" }, "object"] },
                      "$$existing.email",
                      null,
                    ],
                  },
                ],
              },
              phone: {
                $ifNull: [
                  "$$userDoc.phone",
                  {
                    $cond: [
                      { $eq: [{ $type: "$$existing" }, "object"] },
                      "$$existing.phone",
                      null,
                    ],
                  },
                ],
              },
              role: "$$userDoc.role",
              roleName: {
                $ifNull: [
                  "$$userDoc.roleName",
                  {
                    $ifNull: [
                      "$$roleDoc.label",
                      {
                        $ifNull: [
                          "$$roleDoc.name",
                          {
                            $ifNull: [
                              "$$userDoc.role",
                              {
                                $ifNull: [
                                  {
                                    $cond: [
                                      {
                                        $eq: [{ $type: "$$existing" }, "object"],
                                      },
                                      "$$existing.roleName",
                                      null,
                                    ],
                                  },
                                  "$listingSource",
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              roleId: {
                $cond: [
                  { $ifNull: ["$$roleDoc", false] },
                  {
                    _id: "$$roleDoc._id",
                    name: "$$roleDoc.name",
                    label: "$$roleDoc.label",
                  },
                  "$$userDoc.roleId",
                ],
              },
            },
          },
        },
      },
    },
    {
      $project: {
        createdByDoc: 0,
        createdByRoleDoc: 0,
        _createdById: 0,
        _createdByRoleId: 0,
      },
    },
  ];

  if (!includeFacets) {
    const [facet] = await primary.model
      .aggregate([
        { $match: listMatch },
        { $addFields: { _category: primary.category } },
        ...unionStages(listMatch),
        {
          $facet: {
            items: cardItems,
            ...(includeCount ? { total: [{ $count: "n" }] } : {}),
          },
        },
      ] as any)
      .option({ maxTimeMS: 15000 });

    const total = includeCount ? Number(facet?.total?.[0]?.n || 0) : 0;
    const pages = includeCount
      ? Math.max(1, Math.ceil(total / limit) || 1)
      : 0;
    return {
      items: await attachCreatedByProfiles(primary.model, facet?.items || []),
      meta: {
        total,
        page,
        limit,
        pages,
        hasNextPage: includeCount
          ? page < pages
          : (facet?.items || []).length >= limit,
        hasPreviousPage: page > 1,
        counted: includeCount,
      },
      facets: zeroPromoFacets(),
    };
  }

  const now = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [facet] = await primary.model
    .aggregate([
      { $match: baseMatch },
      { $addFields: { _category: primary.category } },
      ...restStages,
      {
        $addFields: {
          _promoType: {
            $toLower: { $ifNull: ["$promotion.type", "normal"] },
          },
          _isPromoted: {
            $or: [
              { $in: [{ $toLower: { $ifNull: ["$promotion.type", "normal"] } }, BOOSTED] },
              { $in: [{ $toLower: { $ifNull: ["$lastPromotionType", ""] } }, BOOSTED] },
              {
                $gt: [{ $size: { $ifNull: ["$promotionHistory", []] } }, 0],
              },
            ],
          },
          _isBoostActive: {
            $and: [
              { $in: [{ $toLower: { $ifNull: ["$promotion.type", "normal"] } }, BOOSTED] },
              {
                $or: [
                  { $eq: [{ $ifNull: ["$promotion.boostExpiry", null] }, null] },
                  { $gt: ["$promotion.boostExpiry", now] },
                ],
              },
            ],
          },
          _isExpiringSoon: {
            $and: [
              { $in: [{ $toLower: { $ifNull: ["$promotion.type", "normal"] } }, BOOSTED] },
              { $gte: ["$promotion.boostExpiry", now] },
              { $lte: ["$promotion.boostExpiry", week] },
            ],
          },
          _isExpiredBoost: {
            $or: [
              {
                $and: [
                  { $lt: ["$promotion.boostExpiry", now] },
                  {
                    $eq: [
                      { $toLower: { $ifNull: ["$promotion.type", "normal"] } },
                      "normal",
                    ],
                  },
                ],
              },
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: { $ifNull: ["$promotionHistory", []] },
                        as: "h",
                        cond: {
                          $regexMatch: {
                            input: { $ifNull: ["$$h.reason", ""] },
                            regex: "expired",
                            options: "i",
                          },
                        },
                      },
                    },
                  },
                  0,
                ],
              },
            ],
          },
        },
      },
      {
        $facet: {
          items: [{ $match: listMatch }, ...cardItems],
          total: [{ $match: listMatch }, { $count: "n" }],
          promotionType: [
            { $match: promoFacetMatch },
            { $group: { _id: "$_promoType", n: { $sum: 1 } } },
          ],
          tracking: [
            { $match: trackingFacetMatch },
            {
              $group: {
                _id: null,
                all: { $sum: 1 },
                promoted: { $sum: { $cond: ["$_isPromoted", 1, 0] } },
                active: { $sum: { $cond: ["$_isBoostActive", 1, 0] } },
                expiringSoon: { $sum: { $cond: ["$_isExpiringSoon", 1, 0] } },
                expired: { $sum: { $cond: ["$_isExpiredBoost", 1, 0] } },
              },
            },
          ],
        },
      },
    ] as any)
    .option({ maxTimeMS: 20000 });

  const total = Number(facet?.total?.[0]?.n || 0);
  const pages = Math.max(1, Math.ceil(total / limit) || 1);
  const facets = zeroPromoFacets();
  for (const row of facet?.promotionType || []) {
    const key = String(row?._id || "normal").toLowerCase();
    const n = Number(row?.n || 0);
    facets.promotionType.all = Number(facets.promotionType.all || 0) + n;
    if (Object.prototype.hasOwnProperty.call(facets.promotionType, key)) {
      facets.promotionType[key] = Number(facets.promotionType[key] || 0) + n;
    }
  }
  const trackingRow = facet?.tracking?.[0];
  if (trackingRow) {
    facets.tracking.all = Number(trackingRow.all || 0);
    facets.tracking.promoted = Number(trackingRow.promoted || 0);
    facets.tracking.active = Number(trackingRow.active || 0);
    facets.tracking.expiringSoon = Number(trackingRow.expiringSoon || 0);
    facets.tracking.expired = Number(trackingRow.expired || 0);
  }

  return {
    items: await attachCreatedByProfiles(primary.model, facet?.items || []),
    meta: {
      total,
      page,
      limit,
      pages,
      hasNextPage: page < pages,
      hasPreviousPage: page > 1,
      counted: true,
    },
    facets,
  };
};
