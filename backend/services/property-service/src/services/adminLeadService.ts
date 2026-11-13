import { Types } from "mongoose";
import Lead from "../models/LeadModel";
import PublicLead from "../models/PublicLead";
import FeaturedProject from "../models/featurePropertiesModel";
import Residential from "../models/residentialModel";
import Commercial from "../models/commercialModel";
import Agricultural from "../models/agriculturalModel";
import LandPlot from "../models/landModel";

const categoryModels = {
  featured: FeaturedProject,
  residential: Residential,
  commercial: Commercial,
  agricultural: Agricultural,
  land: LandPlot,
} as const;
type Category = keyof typeof categoryModels;

const STATUS_RANK: Record<string, number> = {
  sale: 6,
  site_visit: 5,
  follow_up: 4,
  interested: 3,
  new_lead: 2,
  not_interested: 1,
};

const leadCategory = (lead: any): Category => {
  const value = String(lead.propertyType || lead.propertyModel || "").toLowerCase();
  if (value.includes("featured")) return "featured";
  if (value.includes("residential")) return "residential";
  if (value.includes("commercial")) return "commercial";
  if (value.includes("agricultural")) return "agricultural";
  if (value.includes("land")) return "land";
  if (lead.source === "site" || lead.source === "imported") return "featured";
  return "featured";
};

const safeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** IST calendar day bounds — matches Super Admin dashboard timezone. */
const parseDayBound = (value?: string, endOfDay = false): Date | null => {
  if (!value) return null;
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    const date = new Date(
      `${match[1]}-${match[2]}-${match[3]}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+05:30`,
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const localDayKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizePhone = (value?: string) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const pickRicher = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
};

const bestStatus = (statuses: string[]) =>
  statuses.reduce((best, status) => {
    const rank = STATUS_RANK[status] || 0;
    const bestRank = STATUS_RANK[best] || 0;
    return rank > bestRank ? status : best;
  }, statuses[0] || "new_lead");

const buildOrigin = (row: any) => {
  const source = String(row.source || "site").toLowerCase();
  const category = String(row.project?.category || "featured");
  const isProject = category === "featured";

  if (source === "imported") {
    return {
      channel: "Imported",
      entryPoint: isProject ? "CSV / bulk import · Featured project" : "CSV / bulk import · Property",
      path: ["Import", isProject ? "Featured project" : "Property listing", "Lead created"],
      label: "Imported",
    };
  }
  if (source === "direct") {
    return {
      channel: "Logged-in user",
      entryPoint: isProject
        ? "App / website · Contact on project"
        : "App / website · Contact on property",
      path: [
        "Website / App",
        isProject ? "Project detail" : "Property detail",
        "Contact owner / enquiry",
      ],
      label: "Direct",
    };
  }
  return {
    channel: "Website (guest)",
    entryPoint: "Site · Featured project enquiry form",
    path: ["Website", "Featured project page", "Lead form submitted"],
    label: "Site",
  };
};

const dedupeKey = (row: any) => {
  const projectId = String(row.project?._id || "");
  const phone = normalizePhone(row.phone);
  const email = String(row.email || "")
    .trim()
    .toLowerCase();
  if (phone) return `p:${phone}::${projectId}`;
  if (email) return `e:${email}::${projectId}`;
  return `id:${row._id}::${projectId}`;
};

/** Collapse same person + same project/property into one unique lead row. */
const collapseDuplicateLeads = (rows: any[]) => {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const key = dedupeKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return [...groups.values()]
    .map((group) => {
      const sorted = [...group].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const primary = {
        ...first,
        name: pickRicher(...sorted.map((row) => row.name).reverse()) || first.name,
        email: pickRicher(...sorted.map((row) => row.email).reverse()) || first.email,
        phone: pickRicher(...sorted.map((row) => row.phone)) || first.phone,
        message:
          pickRicher(...sorted.map((row) => row.message).reverse()) || first.message,
        purchaseTimeline:
          pickRicher(...sorted.map((row) => row.purchaseTimeline).reverse()) ||
          first.purchaseTimeline,
        budgetRange:
          pickRicher(...sorted.map((row) => row.budgetRange).reverse()) ||
          first.budgetRange,
        status: bestStatus(sorted.map((row) => String(row.status || "new_lead"))),
        listingType: pickRicher(...sorted.map((row) => row.listingType)) || "",
        firstTouchAt: first.createdAt,
        lastTouchAt: last.createdAt,
        createdAt: last.createdAt,
        duplicateCount: Math.max(0, sorted.length - 1),
        submissionCount: sorted.length,
        submissions: sorted.map((row) => ({
          _id: row._id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          status: row.status,
          source: row.source,
          message: row.message,
          createdAt: row.createdAt,
        })),
      };
      primary.origin = buildOrigin(primary);
      return primary;
    })
    .sort(
      (a, b) =>
        new Date(b.lastTouchAt || b.createdAt).getTime() -
        new Date(a.lastTouchAt || a.createdAt).getTime(),
    );
};

const PROPERTY_CARD_SELECT =
  "title projectName buildingName propertyCode state city locality createdBy postedBy slug heroImage gallery price priceFrom priceTo listingType promotion status";

const ownerId = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "object") {
    const nested = (value as any)?._id ?? (value as any)?.userId ?? (value as any)?.id;
    return nested ? String(nested) : "";
  }
  return String(value);
};

const inferCategory = (row: any): Category => leadCategory(row);

async function loadPropertiesByIds(idsByCategory: Record<Category, string[]>) {
  const propertyEntries = await Promise.all(
    (Object.keys(categoryModels) as Category[]).map(async (category) => {
      const ids = [...new Set(idsByCategory[category] || [])].filter(Boolean);
      if (!ids.length) return [];
      const model: any = categoryModels[category];
      const docs = await model.find({ _id: { $in: ids } }).select(PROPERTY_CARD_SELECT).lean();
      return docs.map((doc: any) => [String(doc._id), { ...doc, category }] as const);
    }),
  );
  return new Map(propertyEntries.flat());
}

const shapeLeadRow = (row: any, property: any = {}) => {
  const snapshot: any = row.propertySnapshot || {};
  const hasLiveProperty = Boolean(property._id);
  const heroImage =
    property.heroImage?.url ||
    property.heroImage ||
    property.gallery?.[0]?.url ||
    property.gallery?.[0] ||
    snapshot.heroImage ||
    "";
  const category = inferCategory({ ...row, propertyType: row.propertyType || snapshot.category });
  const intention = Array.isArray(row.intention) ? row.intention : [];
  const intentionAnswer = (matches: (question: string) => boolean) =>
    intention.find((item: any) => matches(String(item?.question || "").toLowerCase()))?.answer || "";
  const purchaseTimeline =
    row.purchaseTimeline ||
    intentionAnswer((question) => question.includes("plan to buy") || question.includes("planning to purchase"));
  const budgetRange =
    row.budgetRange || intentionAnswer((question) => question.includes("budget"));

  return {
    _id: row._id,
    name: row.name,
    phone: row.phone,
    email: row.email || "",
    status: row.status || "new_lead",
    source: row.source,
    message: row.message || row.remarks || "",
    purchaseTimeline,
    budgetRange,
    listingType: row.listingType || property.listingType || snapshot.listingType || "",
    createdAt: row.createdAt,
    customer:
      row.createdBy && typeof row.createdBy === "object" ? row.createdBy : null,
    project: {
      _id: row.projectId,
      title:
        property.title ||
        property.projectName ||
        property.buildingName ||
        snapshot.title ||
        (hasLiveProperty ? "Untitled property" : "Deleted property"),
      code: property.propertyCode || snapshot.code || "",
      category: snapshot.category || property.category || category,
      state: property.state || snapshot.state || "",
      city: property.city || snapshot.city || "",
      locality: property.locality || snapshot.locality || "",
      createdBy: ownerId(property.createdBy),
      postedBy: ownerId(property.postedBy?.userId ?? property.postedBy),
      slug: property.slug || snapshot.slug || "",
      heroImage,
      price: property.price ?? snapshot.price ?? null,
      priceFrom: property.priceFrom ?? snapshot.priceFrom ?? null,
      priceTo: property.priceTo ?? snapshot.priceTo ?? null,
      listingType: property.listingType || row.listingType || snapshot.listingType || "",
      promotionType: property.promotion?.type || snapshot.promotionType || "",
      status: property.status || snapshot.status || (hasLiveProperty ? "" : "deleted"),
      isDeleted: !hasLiveProperty,
    },
  };
};

const categorySwitch = {
  $switch: {
    branches: [
      { case: { $regexMatch: { input: "$_catRaw", regex: "featured", options: "i" } }, then: "featured" },
      { case: { $regexMatch: { input: "$_catRaw", regex: "residential", options: "i" } }, then: "residential" },
      { case: { $regexMatch: { input: "$_catRaw", regex: "commercial", options: "i" } }, then: "commercial" },
      { case: { $regexMatch: { input: "$_catRaw", regex: "agricultural", options: "i" } }, then: "agricultural" },
      { case: { $regexMatch: { input: "$_catRaw", regex: "land", options: "i" } }, then: "land" },
    ],
    default: "featured",
  },
};

export interface AdminLeadQuery {
  page?: string;
  limit?: string;
  search?: string;
  category?: string;
  projectId?: string;
  status?: string;
  source?: string;
  state?: string;
  city?: string;
  locality?: string;
  from?: string;
  to?: string;
  startDate?: string;
  endDate?: string;
  summaryOnly?: string;
  includeSummary?: string;
  includeFacets?: string;
  creatorIds?: string;
}

export const getAdminLeadDashboard = async (
  query: AdminLeadQuery,
  exportAll = false,
) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = 12;
  const creatorIds = String(query.creatorIds || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => Types.ObjectId.isValid(id));
  const creatorSet = new Set(creatorIds);
  const dateFilter: Record<string, Date> = {};
  const fromDate = parseDayBound(query.from || query.startDate, false);
  const toDate = parseDayBound(query.to || query.endDate, true);
  if (fromDate) dateFilter.$gte = fromDate;
  if (toDate) dateFilter.$lte = toDate;
  const base: any = {};
  if (query.projectId) {
    const projectIds = query.projectId
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (!projectIds.length || projectIds.some((id) => !Types.ObjectId.isValid(id))) {
      throw new Error("Invalid projectId");
    }
    base.projectId = projectIds.length === 1 ? projectIds[0] : { $in: projectIds };
  }
  // Status applied after dedupe so merged "best status" is filterable.
  if (Object.keys(dateFilter).length) base.createdAt = dateFilter;

  const includePublic =
    (!query.category || query.category === "all" || query.category === "featured") &&
    (!query.source || ["all", "site", "imported"].includes(query.source));
  const includeDirect =
    !query.source || ["all", "direct"].includes(query.source);

  const summaryOnly =
    String(query.summaryOnly || "").trim() === "1" ||
    String(query.summaryOnly || "").toLowerCase() === "true";

  if (summaryOnly) {
    const publicMatch = {
      ...base,
      ...(query.source && query.source !== "all" ? { source: query.source } : {}),
    };
    const [publicGroups, directGroups] = await Promise.all([
      includePublic
        ? PublicLead.aggregate([
            { $match: publicMatch },
            {
              $group: {
                _id: {
                  phone: "$phone",
                  projectId: "$projectId",
                },
                status: { $first: "$status" },
                source: { $first: { $ifNull: ["$source", "site"] } },
              },
            },
            {
              $group: {
                _id: { status: "$status", source: "$source" },
                count: { $sum: 1 },
              },
            },
          ])
        : [],
      includeDirect
        ? Lead.aggregate([
            { $match: base },
            {
              $group: {
                _id: {
                  phone: "$phone",
                  projectId: "$projectId",
                },
                status: { $first: "$status" },
              },
            },
            {
              $group: {
                _id: { status: "$status", source: "direct" },
                count: { $sum: 1 },
              },
            },
          ])
        : [],
    ]);

    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let total = 0;
    for (const row of [...publicGroups, ...directGroups]) {
      const status = String(row?._id?.status || "new_lead");
      const source = String(row?._id?.source || "site");
      const count = Number(row?.count) || 0;
      byStatus[status] = (byStatus[status] || 0) + count;
      bySource[source] = (bySource[source] || 0) + count;
      total += count;
    }

    return {
      leads: [],
      pagination: {
        page: 1,
        limit: 1,
        total,
        pages: total ? 1 : 0,
      },
      summary: {
        total,
        rawSubmissions: total,
        duplicatesHidden: 0,
        byCategory: {},
        byStatus,
        bySource,
        dailyTrend: [],
      },
      facets: { states: [], cities: [], localities: [] },
    };
  }

  if (creatorSet.size) {
    const ownerIds = [...creatorSet].map((id) => new Types.ObjectId(id));
    const owned = await Promise.all(
      (Object.keys(categoryModels) as Category[]).map((category) =>
        (categoryModels[category] as any)
          .find({
            $or: [{ createdBy: { $in: ownerIds } }, { "postedBy.userId": { $in: ownerIds } }],
          })
          .select("_id")
          .limit(2000)
          .lean(),
      ),
    );
    const ownedIds = owned.flat().map((doc: any) => String(doc._id));
    if (!ownedIds.length) {
      return {
        leads: [],
        pagination: { page, limit, total: 0, pages: 0, counted: true },
        summary: {
          total: 0,
          rawSubmissions: 0,
          duplicatesHidden: 0,
          byCategory: {},
          byStatus: {},
          bySource: {},
          dailyTrend: [],
        },
        facets: { states: [], cities: [], localities: [] },
        projects: [],
      };
    }
    const extra = ownedIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (base.projectId) {
      const current = base.projectId.$in || [base.projectId];
      const currentIds = (Array.isArray(current) ? current : [current]).map(String);
      const allowed = new Set(ownedIds);
      const next = currentIds.filter((id) => allowed.has(id));
      base.projectId = next.length === 1 ? next[0] : { $in: next };
    } else {
      base.projectId = extra.length === 1 ? extra[0] : { $in: extra };
    }
  }

  const includeSummary =
    exportAll ||
    (page === 1 &&
      !["0", "false"].includes(String(query.includeSummary ?? "1").toLowerCase()));
  const includeFacets =
    exportAll ||
    (page === 1 &&
      !["0", "false"].includes(String(query.includeFacets ?? "1").toLowerCase()));

  const searchRaw = String(query.search || "").trim().slice(0, 80);
  const extraMatch: Record<string, any> = {};
  const extraAnd: Record<string, any>[] = [];
  if (searchRaw) {
    const rx = new RegExp(safeRegex(searchRaw), "i");
    extraAnd.push({
      $or: [
        { name: rx },
        { phone: rx },
        { email: rx },
        { "propertySnapshot.title": rx },
        { "propertySnapshot.code": rx },
        { "propertySnapshot.state": rx },
        { "propertySnapshot.city": rx },
        { "propertySnapshot.locality": rx },
      ],
    });
  }
  if (query.state && query.state !== "all") extraMatch["propertySnapshot.state"] = query.state;
  if (query.city && query.city !== "all") extraMatch["propertySnapshot.city"] = query.city;
  if (query.locality && query.locality !== "all") extraMatch["propertySnapshot.locality"] = query.locality;
  if (extraAnd.length) extraMatch.$and = extraAnd;

  const publicMatch = {
    ...base,
    ...(query.source && query.source !== "all" ? { source: query.source } : {}),
    ...extraMatch,
  };
  const directMatch = { ...base, ...extraMatch };

  const enrichStages: any[] = [
    {
      $addFields: {
        _phoneKey: {
          $let: {
            vars: {
              digits: {
                $replaceAll: {
                  input: {
                    $replaceAll: {
                      input: {
                        $replaceAll: {
                          input: { $ifNull: ["$phone", ""] },
                          find: " ",
                          replacement: "",
                        },
                      },
                      find: "-",
                      replacement: "",
                    },
                  },
                  find: "+",
                  replacement: "",
                },
              },
            },
            in: {
              $cond: [
                { $gte: [{ $strLenCP: "$$digits" }, 10] },
                { $substrCP: ["$$digits", { $subtract: [{ $strLenCP: "$$digits" }, 10] }, 10] },
                "$$digits",
              ],
            },
          },
        },
        _catRaw: {
          $toLower: {
            $ifNull: [
              "$propertySnapshot.category",
              { $ifNull: ["$propertyType", { $ifNull: ["$propertyModel", ""] }] },
            ],
          },
        },
        _statusRank: {
          $switch: {
            branches: [
              { case: { $eq: ["$status", "sale"] }, then: 6 },
              { case: { $eq: ["$status", "site_visit"] }, then: 5 },
              { case: { $eq: ["$status", "follow_up"] }, then: 4 },
              { case: { $eq: ["$status", "interested"] }, then: 3 },
              { case: { $eq: ["$status", "new_lead"] }, then: 2 },
              { case: { $eq: ["$status", "not_interested"] }, then: 1 },
            ],
            default: 0,
          },
        },
      },
    },
    { $addFields: { _category: categorySwitch } },
  ];

  if (query.category && query.category !== "all") {
    enrichStages.push({ $match: { _category: query.category } });
  }

  const groupStages: any[] = [
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: {
          phone: "$_phoneKey",
          project: { $toString: "$projectId" },
        },
        last: { $first: "$$ROOT" },
        firstCreated: { $last: "$createdAt" },
        lastCreated: { $first: "$createdAt" },
        statuses: { $push: { s: "$status", r: "$_statusRank" } },
        count: { $sum: 1 },
      },
    },
    {
      $addFields: {
        best: {
          $reduce: {
            input: "$statuses",
            initialValue: { s: "new_lead", r: 0 },
            in: {
              $cond: [{ $gt: ["$$this.r", "$$value.r"] }, "$$this", "$$value"],
            },
          },
        },
      },
    },
    {
      $addFields: {
        "last.status": "$best.s",
        "last.firstTouchAt": "$firstCreated",
        "last.lastTouchAt": "$lastCreated",
        "last.duplicateCount": { $max: [0, { $subtract: ["$count", 1] }] },
        "last.submissionCount": "$count",
      },
    },
    { $replaceRoot: { newRoot: "$last" } },
  ];

  if (query.status && query.status !== "all") {
    groupStages.push({ $match: { status: query.status } });
  }

  const skip = (page - 1) * limit;
  const facet: Record<string, any> = {
    items: exportAll
      ? [{ $sort: { createdAt: -1, _id: -1 } }, { $limit: 5000 }]
      : [{ $sort: { createdAt: -1, _id: -1 } }, { $skip: skip }, { $limit: limit }],
    total: [{ $count: "n" }],
    rawCount: [
      { $group: { _id: null, n: { $sum: { $ifNull: ["$submissionCount", 1] } } } },
    ],
  };
  if (includeSummary) {
    facet.byStatus = [{ $group: { _id: "$status", n: { $sum: 1 } } }];
    facet.byCategory = [{ $group: { _id: "$_category", n: { $sum: 1 } } }];
    facet.bySource = [{ $group: { _id: "$source", n: { $sum: 1 } } }];
  }
  if (includeFacets) {
    facet.states = [
      { $group: { _id: "$propertySnapshot.state" } },
      { $match: { _id: { $nin: [null, ""] } } },
      { $sort: { _id: 1 } },
      { $limit: 80 },
    ];
    facet.cities = [
      { $group: { _id: "$propertySnapshot.city" } },
      { $match: { _id: { $nin: [null, ""] } } },
      { $sort: { _id: 1 } },
      { $limit: 80 },
    ];
    facet.localities = [
      { $group: { _id: "$propertySnapshot.locality" } },
      { $match: { _id: { $nin: [null, ""] } } },
      { $sort: { _id: 1 } },
      { $limit: 80 },
    ];
    facet.projects = [{ $group: { _id: "$projectId" } }, { $limit: 40 }];
  }

  const startModel = includePublic ? PublicLead : Lead;
  const startMatch = includePublic ? publicMatch : directMatch;
  const startSource = includePublic ? "site" : "direct";
  const unionStages: any[] = [];
  if (includePublic && includeDirect) {
    unionStages.push({
      $unionWith: {
        coll: Lead.collection.name,
        pipeline: [
          { $match: directMatch },
          { $addFields: { source: "direct" } },
        ],
      },
    });
  }

  const [facetOut] = await startModel
    .aggregate([
      { $match: startMatch },
      { $addFields: { source: { $ifNull: ["$source", startSource] } } },
      ...unionStages,
      ...enrichStages,
      ...groupStages,
      { $facet: facet },
    ])
    .option({ maxTimeMS: exportAll ? 60000 : 20000, allowDiskUse: true });

  const pageItems = facetOut?.items || [];
  const total = Number(facetOut?.total?.[0]?.n || 0);
  const rawSubmissionCount = Number(facetOut?.rawCount?.[0]?.n || 0);

  const idsByCategory: Record<Category, string[]> = {
    featured: [],
    residential: [],
    commercial: [],
    agricultural: [],
    land: [],
  };
  for (const row of pageItems) {
    idsByCategory[inferCategory(row)].push(String(row.projectId));
  }
  const pickerIds = (facetOut?.projects || [])
    .map((row: any) => String(row._id || ""))
    .filter(Boolean);
  for (const id of pickerIds) idsByCategory.featured.push(id);

  const properties = await loadPropertiesByIds(idsByCategory);
  const shaped = pageItems.map((row: any) =>
    shapeLeadRow(row, properties.get(String(row.projectId)) || {}),
  );
  const unique = collapseDuplicateLeads(shaped);

  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  if (includeSummary) {
    for (const row of facetOut?.byStatus || []) {
      const key = String(row._id || "new_lead");
      byStatus[key] = Number(row.n || 0);
    }
    for (const row of facetOut?.byCategory || []) {
      const key = String(row._id || "featured");
      byCategory[key] = Number(row.n || 0);
    }
    for (const row of facetOut?.bySource || []) {
      const key = String(row._id || "site");
      bySource[key] = Number(row.n || 0);
    }
  }

  const facetValues = (key: string) =>
    [...new Set((facetOut?.[key] || []).map((row: any) => row._id).filter(Boolean))].sort();

  const projects = [
    ...new Map(
      unique.map((row) => [
        String(row.project._id),
        {
          _id: row.project._id,
          title: row.project.title,
          code: row.project.code,
          category: row.project.category,
          city: row.project.city,
          locality: row.project.locality,
        },
      ]),
    ).values(),
  ];

  return {
    leads: unique,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 0,
      counted: true,
    },
    summary: includeSummary
      ? {
          total,
          rawSubmissions: rawSubmissionCount,
          duplicatesHidden: Math.max(0, rawSubmissionCount - total),
          byCategory,
          byStatus,
          bySource,
          dailyTrend: [],
        }
      : {
          total,
          rawSubmissions: rawSubmissionCount,
          duplicatesHidden: Math.max(0, rawSubmissionCount - total),
          byCategory: {},
          byStatus: {},
          bySource: {},
          dailyTrend: [],
        },
    facets: includeFacets
      ? {
          states: facetValues("states"),
          cities: facetValues("cities"),
          localities: facetValues("localities"),
        }
      : { states: [], cities: [], localities: [] },
    projects,
  };
};
