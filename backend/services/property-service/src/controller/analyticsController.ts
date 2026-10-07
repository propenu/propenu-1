// src/controllers/analyticsController.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import Residential from "../models/residentialModel";
import Commercial from "../models/commercialModel";
import LandPlot from "../models/landModel";
import Agricultural from "../models/agriculturalModel";
import User from "../models/userModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import FeaturedProject from "../models/featurePropertiesModel";
import { listAdminProperties } from "../services/adminPropertyListService";

/* =====================================================
   HELPER
===================================================== */




const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const parseIstDayBound = (value: unknown, endOfDay = false) => {
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

const applyCreatedAtRange = (matchFilter: Record<string, any>, query: Record<string, any>) => {
  const from = parseIstDayBound(query.from || query.startDate || query.createdFrom, false);
  const to = parseIstDayBound(query.to || query.endDate || query.createdTo, true);
  if (!from && !to) return;
  matchFilter.createdAt = {};
  if (from) matchFilter.createdAt.$gte = from;
  if (to) matchFilter.createdAt.$lte = to;
};

const zeroPropertyOverview = {
  totalProperties: 0,
  activeProperties: 0,
  pendingProperties: 0,
  draftProperties: 0,
  expiredProperties: 0,
  deactivatedProperties: 0,
  archivedProperties: 0,
  saleProperties: 0,
  rentProperties: 0,
  normalProperties: 0,
  featuredProperties: 0,
  primeProperties: 0,
  sponsoredProperties: 0,
  totalViews: 0,
  totalClicks: 0,
  totalInquiries: 0,
};

const sumFields = [
  "total",
  "active",
  "pending",
  "draft",
  "expired",
  "deactivated",
  "archived",
  "sale",
  "rent",
  "normal",
  "featured",
  "prime",
  "sponsored",
] as const;

type GroupRow = {
  _id: any;
  category?: string;
  total?: number;
  active?: number;
  pending?: number;
  draft?: number;
  expired?: number;
  deactivated?: number;
  archived?: number;
  sale?: number;
  rent?: number;
  normal?: number;
  featured?: number;
  prime?: number;
  sponsored?: number;
};

function propertyAnalyticsFacet(category: string, matchFilter: any): any[] {
  const countByStatusAndType = {
    total: { $sum: 1 },
    active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
    pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
    draft: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] } },
    expired: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } },
    deactivated: { $sum: { $cond: [{ $eq: ["$status", "deactivated"] }, 1, 0] } },
    archived: { $sum: { $cond: [{ $eq: ["$status", "archived"] }, 1, 0] } },
    sale: { $sum: { $cond: [{ $eq: ["$listingType", "sale"] }, 1, 0] } },
    rent: { $sum: { $cond: [{ $eq: ["$listingType", "rent"] }, 1, 0] } },
    normal: {
      $sum: {
        $cond: [{ $eq: [{ $ifNull: ["$promotion.type", "normal"] }, "normal"] }, 1, 0],
      },
    },
    featured: { $sum: { $cond: [{ $eq: ["$promotion.type", "featured"] }, 1, 0] } },
    prime: { $sum: { $cond: [{ $eq: ["$promotion.type", "prime"] }, 1, 0] } },
    sponsored: { $sum: { $cond: [{ $eq: ["$promotion.type", "sponsored"] }, 1, 0] } },
  };

  return [
    { $match: matchFilter },
    { $addFields: { __category: category } },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              totalProperties: { $sum: 1 },
              activeProperties: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
              pendingProperties: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
              draftProperties: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] } },
              expiredProperties: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } },
              deactivatedProperties: { $sum: { $cond: [{ $eq: ["$status", "deactivated"] }, 1, 0] } },
              archivedProperties: { $sum: { $cond: [{ $eq: ["$status", "archived"] }, 1, 0] } },
              saleProperties: { $sum: { $cond: [{ $eq: ["$listingType", "sale"] }, 1, 0] } },
              rentProperties: { $sum: { $cond: [{ $eq: ["$listingType", "rent"] }, 1, 0] } },
              normalProperties: {
                $sum: {
                  $cond: [{ $eq: [{ $ifNull: ["$promotion.type", "normal"] }, "normal"] }, 1, 0],
                },
              },
              featuredProperties: { $sum: { $cond: [{ $eq: ["$promotion.type", "featured"] }, 1, 0] } },
              primeProperties: { $sum: { $cond: [{ $eq: ["$promotion.type", "prime"] }, 1, 0] } },
              sponsoredProperties: { $sum: { $cond: [{ $eq: ["$promotion.type", "sponsored"] }, 1, 0] } },
              totalViews: { $sum: { $ifNull: ["$meta.views", 0] } },
              totalClicks: { $sum: { $ifNull: ["$meta.clicks", 0] } },
              totalInquiries: { $sum: { $ifNull: ["$meta.inquiries", 0] } },
            },
          },
        ],
        categoryWise: [{ $group: { _id: "$__category", ...countByStatusAndType } }, { $sort: { total: -1 } }],
        stateWise: [{ $group: { _id: "$state", ...countByStatusAndType } }, { $sort: { total: -1 } }],
        cityWise: [{ $group: { _id: "$city", ...countByStatusAndType } }, { $sort: { total: -1 } }],
        localityWise: [{ $group: { _id: "$locality", ...countByStatusAndType } }, { $sort: { total: -1 } }],
        statusWise: [{ $group: { _id: "$status", ...countByStatusAndType } }, { $sort: { total: -1 } }],
        listingTypeWise: [
          { $match: { listingType: { $in: ["sale", "rent"] } } },
          { $group: { _id: "$listingType", ...countByStatusAndType } },
          { $sort: { total: -1 } },
        ],
        propertyTypeWise: [
          {
            $group: {
              _id: { $ifNull: ["$propertyType", "unknown"] },
              category: { $first: "$__category" },
              ...countByStatusAndType,
            },
          },
          { $sort: { total: -1 } },
        ],
        promotionWise: [
          {
            $group: {
              _id: { $ifNull: ["$promotion.type", "normal"] },
              ...countByStatusAndType,
            },
          },
          { $sort: { total: -1 } },
        ],
      },
    },
  ];
}

function mergeOverview(items: any[]) {
  return items.reduce(
    (acc, item) => {
      for (const key of Object.keys(zeroPropertyOverview)) {
        acc[key] += Number(item?.[key] ?? 0);
      }
      return acc;
    },
    { ...zeroPropertyOverview } as Record<string, number>,
  );
}

function mergeGroupRows(rows: GroupRow[], keyGetter?: (row: GroupRow) => string) {
  const map = new Map<string, GroupRow>();

  for (const row of rows) {
    const key = keyGetter ? keyGetter(row) : String(row._id ?? "unknown");
    const existing = map.get(key);

    if (!existing) {
      map.set(key, { ...row, _id: row._id ?? "unknown" });
      continue;
    }

    for (const field of sumFields) {
      existing[field] = Number(existing[field] ?? 0) + Number(row[field] ?? 0);
    }
  }

  return Array.from(map.values()).sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0));
}

export const propertyAnalytics = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const state = req.query.state as string;
    const city = req.query.city as string;
    const locality = req.query.locality as string;
    const from = req.query.from as string;
    const to = req.query.to as string;
    const creatorIds = String(req.query.creatorIds || "").split(",").filter((id) => mongoose.Types.ObjectId.isValid(id));

    const matchFilter: any = {};

    if (state) matchFilter.state = state;
    if (city) matchFilter.city = city;
    if (locality) matchFilter.locality = locality;
    applyCreatedAtRange(matchFilter, req.query as Record<string, any>);
    if (creatorIds.length) matchFilter.createdBy = { $in: creatorIds.map((id) => new mongoose.Types.ObjectId(id)) };

    const propertyModels = [
      { category: "residential", model: Residential },
      { category: "commercial", model: Commercial },
      { category: "land", model: LandPlot },
      { category: "agricultural", model: Agricultural },
    ];

    const results = await Promise.all(
      propertyModels.map(({ category, model }) =>
        model.aggregate(propertyAnalyticsFacet(category, matchFilter)),
      ),
    );

    const facets = results.map((result) => result[0] || {});
    const overviewItems = facets.map((facet) => facet.overview?.[0] || zeroPropertyOverview);
    const collect = (key: string) => facets.flatMap((facet) => facet[key] || []);

    res.status(200).json({
      success: true,

      filters: {
        state: state || null,
        city: city || null,
        locality: locality || null,
      },

      data: {
        overview: mergeOverview(overviewItems),
        categoryWise: mergeGroupRows(collect("categoryWise")),
        stateWise: mergeGroupRows(collect("stateWise")),
        cityWise: mergeGroupRows(collect("cityWise")),
        localityWise: mergeGroupRows(collect("localityWise")),
        statusWise: mergeGroupRows(collect("statusWise")),
        listingTypeWise: mergeGroupRows(collect("listingTypeWise")),
        propertyTypeWise: mergeGroupRows(
          collect("propertyTypeWise"),
          (row) => `${row.category ?? "unknown"}:${row._id ?? "unknown"}`,
        ),
        promotionWise: mergeGroupRows(collect("promotionWise")),
      },
    });
  } catch (error) {
    console.error("Property analytics error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch property analytics",
    });
  }
};

export const propertyListings = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const result = await listAdminProperties(req.query as Record<string, any>);
    res.status(200).json({
      success: true,
      items: result.items,
      data: result.items,
      meta: result.meta,
      pagination: {
        page: result.meta.page,
        pageSize: result.meta.limit,
        total: result.meta.total,
        totalPages: result.meta.pages,
        hasNextPage: result.meta.hasNextPage,
        hasPreviousPage: result.meta.hasPreviousPage,
      },
      facets: result.facets,
    });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    res.status(status).json({
      success: false,
      message:
        status === 400
          ? error.message || "Invalid listings request"
          : "Failed to fetch property listings",
    });
  }
};

async function propertyStats(match: any = {}) {
  const stats = await Residential.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalProperties: { $sum: 1 },

        active: {
          $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
        },

        pending: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },

        draft: {
          $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] },
        },

        totalViews: { $sum: "$meta.views" },
      },
    },
  ]);

  return stats[0] || {
    totalProperties: 0,
    active: 0,
    pending: 0,
    draft: 0,
    totalViews: 0,
  };
}

export const projectAnalytics = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    /**
     * =========================================
     * QUERY PARAMS
     * =========================================
     */

    const state = req.query.state as string;
    const city = req.query.city as string;
    const locality = req.query.locality as string;
    const from = req.query.from as string;
    const to = req.query.to as string;
    const creatorIds = String(req.query.creatorIds || "").split(",").filter((id) => mongoose.Types.ObjectId.isValid(id));

    /**
     * =========================================
     * FILTER
     * =========================================
     */

    const matchFilter: any = {};

    const exactLocation = (value?: string) => {
      const trimmed = String(value || "").trim();
      if (!trimmed) return null;
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return { $regex: `^\\s*${escaped}\\s*$`, $options: "i" };
    };
    const stateMatch = exactLocation(state);
    const cityMatch = exactLocation(city);
    const localityMatch = exactLocation(locality);
    if (stateMatch) matchFilter.state = stateMatch;
    if (cityMatch) matchFilter.city = cityMatch;
    if (localityMatch) matchFilter.locality = localityMatch;
    applyCreatedAtRange(matchFilter, req.query as Record<string, any>);
    if (creatorIds.length) matchFilter.createdBy = { $in: creatorIds.map((id) => new mongoose.Types.ObjectId(id)) };

    /**
     * =========================================
     * OVERVIEW ANALYTICS
     * =========================================
     */

    const overviewPromise = FeaturedProject.aggregate([
      {
        $match: matchFilter,
      },

      {
        $group: {
          _id: null,

          totalProjects: {
            $sum: 1,
          },

          activeProjects: {
            $sum: {
              $cond: [{ $eq: ["$status", "active"] }, 1, 0],
            },
          },

          pendingProjects: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
            },
          },

          inactiveProjects: {
            $sum: {
              $cond: [{ $eq: ["$status", "inactive"] }, 1, 0],
            },
          },

          draftProjects: {
            $sum: {
              $cond: [
                {
                  $in: ["$status", ["draft", "onboarding", "incomplete"]],
                },
                1,
                0,
              ],
            },
          },

          rejectedProjects: {
            $sum: {
              $cond: [{ $eq: ["$status", "rejected"] }, 1, 0],
            },
          },

          archivedProjects: {
            $sum: {
              $cond: [{ $eq: ["$status", "archived"] }, 1, 0],
            },
          },

          normalProjects: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    {
                      $ifNull: ["$promotion.type", "normal"],
                    },
                    "normal",
                  ],
                },
                1,
                0,
              ],
            },
          },

          featuredProjects: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "featured"] },
                1,
                0,
              ],
            },
          },

          primeProjects: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "prime"] },
                1,
                0,
              ],
            },
          },

          sponsoredProjects: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "sponsored"] },
                1,
                0,
              ],
            },
          },

          totalViews: {
            $sum: "$meta.views",
          },

          totalClicks: {
            $sum: "$meta.clicks",
          },

          totalInquiries: {
            $sum: "$meta.inquiries",
          },
        },
      },
    ]);

    /**
     * =========================================
     * STATE WISE
     * =========================================
     */

    const stateWisePromise = FeaturedProject.aggregate([
      {
        $match: matchFilter,
      },

      {
        $group: {
          _id: "$state",

          total: {
            $sum: 1,
          },

          active: {
            $sum: {
              $cond: [{ $eq: ["$status", "active"] }, 1, 0],
            },
          },

          normal: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    {
                      $ifNull: ["$promotion.type", "normal"],
                    },
                    "normal",
                  ],
                },
                1,
                0,
              ],
            },
          },

          featured: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "featured"] },
                1,
                0,
              ],
            },
          },

          prime: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "prime"] },
                1,
                0,
              ],
            },
          },

          sponsored: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "sponsored"] },
                1,
                0,
              ],
            },
          },
        },
      },

      {
        $sort: {
          total: -1,
        },
      },
    ]);

    /**
     * =========================================
     * CITY WISE
     * =========================================
     */

    const cityWisePromise = FeaturedProject.aggregate([
      {
        $match: matchFilter,
      },

      {
        $group: {
          _id: {
            state: "$state",
            city: "$city",
          },

          total: {
            $sum: 1,
          },

          active: {
            $sum: {
              $cond: [{ $eq: ["$status", "active"] }, 1, 0],
            },
          },

          normal: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    {
                      $ifNull: ["$promotion.type", "normal"],
                    },
                    "normal",
                  ],
                },
                1,
                0,
              ],
            },
          },

          featured: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "featured"] },
                1,
                0,
              ],
            },
          },

          prime: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "prime"] },
                1,
                0,
              ],
            },
          },

          sponsored: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "sponsored"] },
                1,
                0,
              ],
            },
          },
        },
      },

      {
        $project: {
          _id: "$_id.city",
          state: "$_id.state",
          total: 1,
          active: 1,
          normal: 1,
          featured: 1,
          prime: 1,
          sponsored: 1,
        },
      },

      {
        $sort: {
          total: -1,
        },
      },
    ]);

    /**
     * =========================================
     * LOCALITY WISE
     * =========================================
     */

    const localityWisePromise = FeaturedProject.aggregate([
      {
        $match: matchFilter,
      },

      {
        $group: {
          _id: {
            state: "$state",
            city: "$city",
            locality: "$locality",
          },

          total: {
            $sum: 1,
          },

          active: {
            $sum: {
              $cond: [{ $eq: ["$status", "active"] }, 1, 0],
            },
          },

          normal: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    {
                      $ifNull: ["$promotion.type", "normal"],
                    },
                    "normal",
                  ],
                },
                1,
                0,
              ],
            },
          },

          featured: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "featured"] },
                1,
                0,
              ],
            },
          },

          prime: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "prime"] },
                1,
                0,
              ],
            },
          },

          sponsored: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "sponsored"] },
                1,
                0,
              ],
            },
          },
        },
      },

      {
        $project: {
          _id: "$_id.locality",
          state: "$_id.state",
          city: "$_id.city",
          total: 1,
          active: 1,
          normal: 1,
          featured: 1,
          prime: 1,
          sponsored: 1,
        },
      },

      {
        $sort: {
          total: -1,
        },
      },
    ]);

    /**
     * =========================================
     * CATEGORY WISE
     * =========================================
     */

    const categoryWisePromise = FeaturedProject.aggregate([
      {
        $match: matchFilter,
      },

      {
        $group: {
          _id: {
            $ifNull: ["$categoryType", "unknown"],
          },

          total: {
            $sum: 1,
          },

          active: {
            $sum: {
              $cond: [{ $eq: ["$status", "active"] }, 1, 0],
            },
          },

          pending: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
            },
          },

          inactive: {
            $sum: {
              $cond: [{ $eq: ["$status", "inactive"] }, 1, 0],
            },
          },

          normal: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    {
                      $ifNull: ["$promotion.type", "normal"],
                    },
                    "normal",
                  ],
                },
                1,
                0,
              ],
            },
          },

          featured: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "featured"] },
                1,
                0,
              ],
            },
          },

          prime: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "prime"] },
                1,
                0,
              ],
            },
          },

          sponsored: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "sponsored"] },
                1,
                0,
              ],
            },
          },
        },
      },

      {
        $sort: {
          total: -1,
        },
      },
    ]);

    /**
     * =========================================
     * STATUS WISE
     * =========================================
     */

    const statusWisePromise = FeaturedProject.aggregate([
      {
        $match: matchFilter,
      },

      {
        $group: {
          _id: "$status",

          total: {
            $sum: 1,
          },

          normal: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    {
                      $ifNull: ["$promotion.type", "normal"],
                    },
                    "normal",
                  ],
                },
                1,
                0,
              ],
            },
          },

          featured: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "featured"] },
                1,
                0,
              ],
            },
          },

          prime: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "prime"] },
                1,
                0,
              ],
            },
          },

          sponsored: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "sponsored"] },
                1,
                0,
              ],
            },
          },
        },
      },

      {
        $sort: {
          total: -1,
        },
      },
    ]);

    /**
     * =========================================
     * PROPERTY TYPE WISE
     * =========================================
     */

    const propertyTypeWisePromise = FeaturedProject.aggregate([
      {
        $match: matchFilter,
      },

      {
        $group: {
          _id: {
            $ifNull: ["$propertyType", "unknown"],
          },

          total: {
            $sum: 1,
          },

          active: {
            $sum: {
              $cond: [{ $eq: ["$status", "active"] }, 1, 0],
            },
          },

          normal: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    {
                      $ifNull: ["$promotion.type", "normal"],
                    },
                    "normal",
                  ],
                },
                1,
                0,
              ],
            },
          },

          featured: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "featured"] },
                1,
                0,
              ],
            },
          },

          prime: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "prime"] },
                1,
                0,
              ],
            },
          },

          sponsored: {
            $sum: {
              $cond: [
                { $eq: ["$promotion.type", "sponsored"] },
                1,
                0,
              ],
            },
          },
        },
      },

      {
        $sort: {
          total: -1,
        },
      },
    ]);

    /**
     * =========================================
     * PROMOTION WISE
     * =========================================
     */

    const promotionWisePromise = FeaturedProject.aggregate([
      {
        $match: matchFilter,
      },

      {
        $group: {
          _id: {
            promotionType: {
              $ifNull: ["$promotion.type", "normal"],
            },

            category: {
              $ifNull: ["$categoryType", "unknown"],
            },
          },

          total: {
            $sum: 1,
          },

          active: {
            $sum: {
              $cond: [{ $eq: ["$status", "active"] }, 1, 0],
            },
          },

          pending: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
            },
          },

          inactive: {
            $sum: {
              $cond: [{ $eq: ["$status", "inactive"] }, 1, 0],
            },
          },
        },
      },

      {
        $group: {
          _id: "$_id.promotionType",

          total: {
            $sum: "$total",
          },

          active: {
            $sum: "$active",
          },

          pending: {
            $sum: "$pending",
          },

          inactive: {
            $sum: "$inactive",
          },

          categories: {
            $push: {
              category: "$_id.category",
              count: "$total",
            },
          },
        },
      },

      {
        $sort: {
          total: -1,
        },
      },
    ]);

    /**
     * =========================================
     * EXECUTE ALL
     * =========================================
     */

    const [
      overview,
      stateWise,
      cityWise,
      localityWise,
      categoryWise,
      statusWise,
      propertyTypeWise,
      promotionWise,
    ] = await Promise.all([
      overviewPromise,
      stateWisePromise,
      cityWisePromise,
      localityWisePromise,
      categoryWisePromise,
      statusWisePromise,
      propertyTypeWisePromise,
      promotionWisePromise,
    ]);

    /**
     * =========================================
     * RESPONSE
     * =========================================
     */

    res.status(200).json({
      success: true,

      filters: {
        state: state || null,
        city: city || null,
        locality: locality || null,
      },

      data: {
        overview: overview[0] || {},

        stateWise,

        cityWise,

        localityWise,

        categoryWise,

        statusWise,

        propertyTypeWise,

        promotionWise,
      },
    });
  } catch (error) {
    console.error("Project analytics error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics",
    });
  }
};


/* =====================================================
   1️⃣ SUPER ADMIN All platform stats
===================================================== */

export const getSuperAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.countDocuments();
    const agents = await User.countDocuments({ roleName: "sales_agent" });
    const managers = await User.countDocuments({ roleName: "sales_manager" });

    const properties = await propertyStats();

    res.json({
      users,
      agents,
      managers,
      ...properties,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

/* =====================================================
   2️⃣ ADMIN Same as super admin but without users
===================================================== */

export const getAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const properties = await propertyStats();

    res.json({
      ...properties,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

/* =====================================================
   3️⃣ SALES MANAGER  Properties of agents under manager
===================================================== */

export const getsupermanager = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const managerId = new mongoose.Types.ObjectId(req.user!.id);

    const agents = await User.find({ managerId }).select("_id");

    const agentIds = agents.map((a) => a._id);

    const properties = await propertyStats({
      createdBy: { $in: agentIds },
    });

    res.json({
      totalAgents: agents.length,
      ...properties,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

/* =====================================================
   4️⃣ SALES AGENT / SALES EXECUTIVE
   Inventory created by OR posted by the actor (all categories).
===================================================== */

/** Local calendar day bounds — matches admin leads / IST "today". */
function parseLocalDayBound(value?: string, endOfDay = false): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return endOfDay
      ? new Date(year, month, day, 23, 59, 59, 999)
      : new Date(year, month, day, 0, 0, 0, 0);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) parsed.setHours(23, 59, 59, 999);
  else parsed.setHours(0, 0, 0, 0);
  return parsed;
}

async function agentInventoryStats(match: Record<string, any>) {
  // Use Model<any> so .find/.aggregate are callable across mixed category models.
  type InventoryModel = {
    aggregate: (pipeline: any[]) => Promise<any[]>;
    find: (filter: Record<string, any>) => {
      select: (fields: string) => {
        sort: (spec: Record<string, 1 | -1>) => {
          limit: (n: number) => {
            lean: () => Promise<any[]>;
          };
        };
      };
    };
  };

  const models: Array<{ model: InventoryModel; category: string }> = [
    { model: Residential as unknown as InventoryModel, category: "residential" },
    { model: Commercial as unknown as InventoryModel, category: "commercial" },
    { model: LandPlot as unknown as InventoryModel, category: "land" },
    { model: Agricultural as unknown as InventoryModel, category: "agricultural" },
    {
      model: FeaturedProject as unknown as InventoryModel,
      category: "featured",
    },
  ];

  const listingSelect =
    "title projectName buildingName status city locality state createdAt updatedAt meta.views propertyId listingId propertyCode slug";

  type StatRow = {
    totalProperties?: number;
    active?: number;
    pending?: number;
    draft?: number;
    totalViews?: number;
  };

  type ListingRow = {
    category: string;
    title: string;
    updatedAt?: Date | string;
    createdAt?: Date | string;
    [key: string]: any;
  };

  const [statRows, listingRows] = await Promise.all([
    Promise.all(
      models.map(({ model }) =>
        model.aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              totalProperties: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
              },
              pending: {
                $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
              },
              draft: {
                $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] },
              },
              totalViews: { $sum: { $ifNull: ["$meta.views", 0] } },
            },
          },
        ]) as Promise<StatRow[]>,
      ),
    ),
    Promise.all(
      models.map(({ model, category }) =>
        model
          .find(match)
          .select(listingSelect)
          .sort({ updatedAt: -1 })
          .limit(80)
          .lean()
          .then(
            (rows: any[]): ListingRow[] =>
              rows.map((row: any) => ({
                ...row,
                category,
                title:
                  row.title ||
                  row.projectName ||
                  row.buildingName ||
                  "Untitled listing",
              })),
          ),
      ),
    ),
  ]);

  const totals = {
    totalProperties: 0,
    active: 0,
    pending: 0,
    draft: 0,
    totalViews: 0,
  };

  for (const rows of statRows) {
    const row = rows[0];
    if (!row) continue;
    totals.totalProperties += Number(row.totalProperties || 0);
    totals.active += Number(row.active || 0);
    totals.pending += Number(row.pending || 0);
    totals.draft += Number(row.draft || 0);
    totals.totalViews += Number(row.totalViews || 0);
  }

  const listings = listingRows
    .flat()
    .sort(
      (a: ListingRow, b: ListingRow) =>
        new Date(b.updatedAt || b.createdAt || 0).getTime() -
        new Date(a.updatedAt || a.createdAt || 0).getTime(),
    )
    .slice(0, 80);

  return { ...totals, listings };
}

export const getsuperagent = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const agentId = new mongoose.Types.ObjectId(req.user!.id);
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    // SE posts attach postedBy; builder/owner inventory stays on createdBy.
    const match: Record<string, any> = {
      $or: [{ createdBy: agentId }, { "postedBy.userId": agentId }],
    };

    const fromDate = parseLocalDayBound(from, false);
    const toDate = parseLocalDayBound(to, true);
    if (fromDate || toDate) {
      match.createdAt = {};
      if (fromDate) match.createdAt.$gte = fromDate;
      if (toDate) match.createdAt.$lte = toDate;
    }

    const properties = await agentInventoryStats(match);

    res.json({
      ...properties,
      range: { from: from || null, to: to || null },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
