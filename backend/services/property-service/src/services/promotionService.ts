type PromotionType = "normal" | "featured" | "sponsored" | "prime";

const PRIORITY: Record<PromotionType, number> = {
  normal: 0,
  featured: 1,
  sponsored: 2,
  prime: 3,
};

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
    sponsoredAd: {} as Record<string, Record<string, string[]>>,
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
