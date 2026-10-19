type PromotionType = "normal" | "featured" | "sponsored" | "prime";

const PRIORITY: Record<PromotionType, number> = {
  normal: 0,
  featured: 1,
  sponsored: 2,
  prime: 3,
};

export function promotionPriority(type: string) {
  return PRIORITY[type as PromotionType] ?? 0;
}

/** Normalize nested sponsoredAd: { state: { city: string[] } } */
export function normalizeSponsoredAd(
  raw: unknown,
): Record<string, Record<string, string[]>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, string[]>> = {};
  for (const [stateRaw, citiesRaw] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    const state = String(stateRaw || "").trim();
    if (!state || !citiesRaw || typeof citiesRaw !== "object" || Array.isArray(citiesRaw)) {
      continue;
    }
    const cityMap: Record<string, string[]> = {};
    for (const [cityRaw, locsRaw] of Object.entries(
      citiesRaw as Record<string, unknown>,
    )) {
      const city = String(cityRaw || "").trim();
      if (!city) continue;
      const locs = Array.isArray(locsRaw)
        ? [
            ...new Set(
              locsRaw
                .map((l) => String(l || "").trim())
                .filter(Boolean),
            ),
          ]
        : [];
      cityMap[city] = locs;
    }
    if (Object.keys(cityMap).length) {
      out[state] = cityMap;
    }
  }
  return out;
}

export type CoverageMap = Record<string, Record<string, string[]>>;

export function isCoverageEmpty(map: unknown) {
  return !map || typeof map !== "object" || Object.keys(map as object).length === 0;
}

export function cloneCoverage(map: CoverageMap | undefined): CoverageMap {
  return normalizeSponsoredAd(map ? JSON.parse(JSON.stringify(map)) : {});
}

/**
 * Mongo filter: the coverage map at `path` ({ state: { city: localities[] } })
 * covers the requested state / city / localities. An empty locality list means
 * the whole city. Returns undefined when no location was requested.
 */
export function buildCoverageMatch(
  path: string,
  target: {
    state?: string | undefined;
    city?: string | undefined;
    localities?: string[] | undefined;
  },
) {
  const state = String(target.state || "").trim();
  const city = String(target.city || "").trim();
  const localities = (target.localities || []).map((l) => l.trim()).filter(Boolean);

  if (!state) return undefined;

  const stateExpr = { $getField: { field: state, input: `$${path}` } };

  if (!city) {
    return { $expr: { $eq: [{ $type: stateExpr }, "object"] } };
  }

  const cityExpr = {
    $let: {
      vars: { stateTarget: stateExpr },
      in: { $getField: { field: city, input: "$$stateTarget" } },
    },
  };

  if (localities.length === 0) {
    return { $expr: { $isArray: cityExpr } };
  }

  return {
    $expr: {
      $let: {
        vars: { cityTarget: cityExpr },
        in: {
          $and: [
            { $isArray: "$$cityTarget" },
            {
              $or: [
                { $eq: [{ $size: "$$cityTarget" }, 0] },
                {
                  $gt: [
                    { $size: { $setIntersection: ["$$cityTarget", localities] } },
                    0,
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  };
}

/** Matches projects whose Sponsored slot is live: Sponsored-only or a Prime / Top Selling with the add-on. */
export function sponsoredSlotMatch() {
  return {
    $or: [
      { "promotion.type": "sponsored" },
      {
        "promotion.type": { $in: ["prime", "featured"] },
        "promotion.sponsoredEnabled": true,
      },
    ],
  };
}

export function buildNormalPromotion(now = new Date()) {
  return {
    type: "normal" as const,
    priority: 0,
    source: "manual" as const,
    startDate: now,
    visibleLeadLimit: 0,
    mainCoverage: {},
    sponsoredEnabled: false,
    sponsoredSameAsMain: false,
    sponsoredAd: {},
  };
}

const TYPE_LABEL: Record<PromotionType, string> = {
  normal: "normal",
  featured: "top selling",
  sponsored: "sponsored",
  prime: "prime",
};

export function describePromotion(promotion: {
  type?: string;
  sponsoredEnabled?: boolean;
}) {
  const type = (promotion?.type || "normal") as PromotionType;
  const base = TYPE_LABEL[type] || type;
  return promotion?.sponsoredEnabled && (type === "prime" || type === "featured")
    ? `${base} + sponsored`
    : base;
}

/** Public boosted slots ignore a promotion whose start is still in the future. */
export function promotionHasStartedMatch(now = new Date()) {
  return {
    $or: [
      { "promotion.startDate": { $exists: false } },
      { "promotion.startDate": null },
      { "promotion.startDate": { $lte: now } },
    ],
  };
}

export function buildManualPromotion(type: PromotionType) {
  return {
    type,
    priority: PRIORITY[type],
    source: "manual" as const,
    startDate: new Date(),
    boostExpiry: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    sponsoredAd: {} as CoverageMap,
    mainCoverage: {} as CoverageMap,
    sponsoredEnabled: false,
    sponsoredSameAsMain: false,
  };
}

export function buildPromotionFromPlan(plan: any) {
  const type: PromotionType = plan?.features?.PROMOTION_TYPE || "normal";

  return {
    type,
    priority: PRIORITY[type],
    source: "subscription" as const,
    startDate: new Date(),
    boostExpiry: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    visibleLeadLimit:
      typeof plan?.features?.VISIBLE_LEAD_LIMIT === "number"
        ? plan.features.VISIBLE_LEAD_LIMIT
        : undefined,
    enquiryLimit: plan?.features?.ENQUIRY_LIMIT || 0,
    enquiriesUsed: 0,
  };
}
