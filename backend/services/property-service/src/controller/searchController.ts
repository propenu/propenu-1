// src/controller/streamSearchHandler.ts

import type { RequestHandler } from "express";
import createStreamingHandler from "../factory/streamingFactory";
import buildSearchCursor, {
  analyzeSearchScope,
  CATEGORY_SERVICE_MAP,
  countSearchResults,
} from "../services/filters/searchService";
import { sanitizeSearchFilters } from "../services/filters/sanitizeFilters";
import { getActiveLocationsFromListings, getListingLocationOptions } from "../services/locationServices";
import Location from "../models/locationModel";
import FeaturedProject from "../models/featurePropertiesModel";

/**
 * Count applied filters safely
 * - ignores undefined / null
 * - handles nested objects (ranges)
 */
function countAppliedFilters(filters: Record<string, any>): number {
  let count = 0;

  for (const value of Object.values(filters)) {
    if (value === undefined || value === null) continue;

    if (typeof value === "object" && !Array.isArray(value)) {
      count += Object.keys(value).length;
    } else {
      count += 1;
    }
  }

  return count;
}

/**
 * STREAM SEARCH HANDLER (DO NOT RENAME / DO NOT REMOVE)
 */
const streamSearchHandler: RequestHandler = createStreamingHandler(
  // 🔹 STEP 3: Build cursor
  async (filters) => {
    return buildSearchCursor(filters);
  },
  {
    batchSize: 100,

    // 🔹 STEP 1 & 2: Sanitize filters
    sanitizeFilters: (req) => {
      


      const sanitized = sanitizeSearchFilters(req);

      if (process.env.NODE_ENV !== "production") {
        console.log("🔥 STEP 2: SANITIZED FILTERS =", sanitized);
      }

      return sanitized;
    },

    // 🔹 Meta info (filter count, category validation)
    initialMeta: async (filters) => {
      const actual = (filters as any)?.filter ?? filters ?? {};
      const category = actual.category;

      if (!category) {
        throw new Error("Category filter is required for search");
      }

      const service = CATEGORY_SERVICE_MAP[category];
      if (!service) {
        return { total: 0 };
      }

      const total = await countSearchResults({ filter: actual });
      const scope = analyzeSearchScope(actual);

      return {
        total,
        includeFeaturedProjects: scope.includeFeaturedProjects,
        resultMode: scope.mode,
        searchScopeReason: scope.reason,
        commonFilterKeys: scope.classification.commonKeys,
        propertyOnlyFilterKeys: scope.classification.propertyOnlyKeys,
        featuredOnlyFilterKeys: scope.classification.featuredOnlyKeys,
      };
    },

  }
);

// ✅ DEFAULT EXPORT (THIS FIXES YOUR TS ERROR)
export default streamSearchHandler;

export const getActiveLocationsHandler: RequestHandler = async (_req, res) => {
  try {
    const locations = await getActiveLocationsFromListings();
    return res.json({ locations });
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || "Failed to load active locations",
    });
  }
};

/** Distinct cities/localities from all listing types for admin dropdowns */
export const getListingLocationOptionsHandler: RequestHandler = async (
  req,
  res,
) => {
  try {
    const state =
      typeof req.query.state === "string" ? req.query.state : undefined;
    const data = await getListingLocationOptions(state);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || "Failed to load location options",
    });
  }
};

type SuggestionItem =
  | {
      kind: "city";
      cityId: string;
      label: string;
      subLabel: string;
      city: string;
      state: string;
    }
  | {
      kind: "locality";
      cityId: string;
      label: string;
      subLabel: string;
      city: string;
      state: string;
      locality: string;
    }
  | {
      kind: "project";
      label: string;
      subLabel: string;
      slug: string;
      city: string;
      state: string;
      locality: string;
      promotionType?: string;
    };

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rankMatch(value: string, query: string) {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return 3;
  if (normalizedValue === normalizedQuery) return 0;
  if (normalizedValue.startsWith(normalizedQuery)) return 1;
  if (normalizedValue.split(/\s+/).some((part) => part.startsWith(normalizedQuery))) {
    return 2;
  }
  if (normalizedValue.split(/[\s,-]+/).some((part) => part.startsWith(normalizedQuery))) {
    return 3;
  }
  if (normalizedQuery.length <= 2) return 99;
  if (normalizedValue.includes(normalizedQuery)) return 4;
  return 99;
}

function dedupeSuggestions(items: SuggestionItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key =
      item.kind === "city"
        ? `city:${item.city.trim().toLowerCase()}`
        : item.kind === "locality"
          ? `locality:${item.locality.trim().toLowerCase()}:${item.city.trim().toLowerCase()}`
          : `project:${item.slug.trim().toLowerCase()}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const getSearchSuggestionsHandler: RequestHandler = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const cityHint = String(req.query.city || "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20);
    const regex = q ? new RegExp(escapeRegex(q), "i") : null;

    const [locationDocs, projectDocs] = await Promise.all([
      regex
        ? Location.find({
            $or: [{ city: regex }, { "localities.name": regex }],
          })
            .select("city state localities")
            .limit(20)
            .lean()
        : Location.find({})
            .select("city state localities")
            .sort({ city: 1 })
            .limit(12)
            .lean(),
      regex
        ? FeaturedProject.find({
            status: "active",
            $or: [{ title: regex }, { city: regex }, { locality: regex }],
          })
            .select("title slug locality city state rank promotion.type")
            .sort({ rank: -1, createdAt: -1 })
            .limit(8)
            .lean()
        : FeaturedProject.find({ status: "active" })
            .select("title slug locality city state rank promotion.type")
            .sort({ rank: -1, createdAt: -1 })
            .limit(4)
            .lean(),
    ]);

    const citySuggestions: SuggestionItem[] = [];
    const localitySuggestions: SuggestionItem[] = [];

    for (const location of locationDocs) {
      const cityId = String((location as any)._id || "").trim();
      const city = String(location.city || "").trim();
      const state = String(location.state || "").trim();
      if (!city) continue;

      if (!regex || regex.test(city)) {
        citySuggestions.push({
          kind: "city",
          cityId,
          label: city,
          subLabel: state,
          city,
          state,
        });
      }

      for (const localityItem of location.localities || []) {
        const locality = String(localityItem?.name || "").trim();
        if (!locality) continue;
        if (regex && !regex.test(locality)) continue;

        localitySuggestions.push({
          kind: "locality",
          cityId,
          label: locality,
          subLabel: city,
          city,
          state,
          locality,
        });
      }
    }

    const projectSuggestions: SuggestionItem[] = projectDocs
      .map((project: any) => ({
        kind: "project" as const,
        label: String(project.title || "").trim(),
        subLabel: [project.locality, project.city].filter(Boolean).join(", "),
        slug: String(project.slug || "").trim(),
        city: String(project.city || "").trim(),
        state: String(project.state || "").trim(),
        locality: String(project.locality || "").trim(),
        promotionType: String(project.promotion?.type || "normal").trim().toLowerCase(),
      }))
      .filter((project) => project.label && project.slug);

    const suggestions = dedupeSuggestions([
      ...citySuggestions,
      ...localitySuggestions,
      ...projectSuggestions,
    ]).filter((item) => {
      if (!q) return true;

      const primary =
        item.kind === "city" ? item.city : item.kind === "locality" ? item.locality : item.label;
      const primaryRank = rankMatch(primary, q);
      const subRank = rankMatch(item.subLabel || "", q);

      return primaryRank < 99 || subRank < 99;
    }).sort((a, b) => {
      const aPrimary =
        a.kind === "city" ? a.city : a.kind === "locality" ? a.locality : a.label;
      const bPrimary =
        b.kind === "city" ? b.city : b.kind === "locality" ? b.locality : b.label;

      const aRank = rankMatch(aPrimary, q);
      const bRank = rankMatch(bPrimary, q);
      if (aRank !== bRank) return aRank - bRank;

      const aSubRank = rankMatch(a.subLabel || "", q);
      const bSubRank = rankMatch(b.subLabel || "", q);
      if (aSubRank !== bSubRank) return aSubRank - bSubRank;

      if (!q && cityHint) {
        const aBoost = a.city.trim().toLowerCase() === cityHint ? 0 : 1;
        const bBoost = b.city.trim().toLowerCase() === cityHint ? 0 : 1;
        if (aBoost !== bBoost) return aBoost - bBoost;
      }

      const kindOrder = { locality: 0, city: 1, project: 2 };
      if (kindOrder[a.kind] !== kindOrder[b.kind]) {
        return kindOrder[a.kind] - kindOrder[b.kind];
      }

      return aPrimary.localeCompare(bPrimary);
    });

    return res.json({
      recent: [],
      suggestions: suggestions.slice(0, limit),
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || "Failed to load search suggestions",
    });
  }
};
