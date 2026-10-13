import mongoose from "mongoose";
import Agricultural from "../models/agriculturalModel";
import Commercial from "../models/commercialModel";
import FeaturedProject from "../models/featurePropertiesModel";
import LandPlot from "../models/landModel";
import Residential from "../models/residentialModel";
import { connectDB } from "../config/db";

const activeQuery = {
  status: "active",
};

async function ensureDB() {
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }
}

function textRegex(value?: string) {
  return value ? new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : undefined;
}

function keywordQuery(keyword?: string) {
  const words = keyword
    ?.split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);

  if (!words?.length) return undefined;

  return words.map((word) => ({
    $or: [
      { title: textRegex(word) },
      { buildingName: textRegex(word) },
      { landName: textRegex(word) },
      { address: textRegex(word) },
      { description: textRegex(word) },
      { locality: textRegex(word) },
      { city: textRegex(word) },
    ],
  }));
}

function projectKeywordQuery(keyword?: string) {
  const words = keyword
    ?.split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);

  if (!words?.length) return undefined;

  return words.map((word) => ({
    $or: [
      { title: textRegex(word) },
      { propertyType: textRegex(word) },
      { address: textRegex(word) },
      { heroTagline: textRegex(word) },
      { heroSubTagline: textRegex(word) },
      { heroDescription: textRegex(word) },
      { locality: textRegex(word) },
      { city: textRegex(word) },
    ],
  }));
}

function buildBaseQuery(filters: any) {
  const query: any = { ...activeQuery };

  if (filters.city) query.city = textRegex(filters.city);
  if (filters.locality) query.locality = textRegex(filters.locality);
  if (filters.listingType) query.listingType = filters.listingType;
  if (filters.maxPrice) query.price = { $lte: Number(filters.maxPrice) };
  if (filters.isPriceNegotiable) query.isPriceNegotiable = true;
  if (filters.facing) query.facing = filters.facing;
  if (filters.keyword) {
    const conditions = keywordQuery(filters.keyword);
    if (conditions) query.$and = [...(query.$and || []), ...conditions];
  }

  return query;
}

function buildProjectQuery(filters: any) {
  const query: any = {
    status: "active",
  };

  if (filters.city) query.city = textRegex(filters.city);
  if (filters.locality) query.locality = textRegex(filters.locality);
  if (filters.propertyCategory) query.categoryType = filters.propertyCategory;
  if (filters.propertyType && filters.propertyType !== "apartment") query.propertyType = textRegex(filters.propertyType);
  if (filters.bhk) query["projectSummary.bhk"] = Number(filters.bhk);
  if (filters.maxPrice) {
    query.$or = [
      { priceFrom: { $lte: Number(filters.maxPrice) } },
      { priceTo: { $lte: Number(filters.maxPrice) } },
      { "projectSummary.units.minPrice": { $lte: Number(filters.maxPrice) } },
      { "projectSummary.units.maxPrice": { $lte: Number(filters.maxPrice) } },
    ];
  }
  if (filters.keyword) {
    const keywordConditions = projectKeywordQuery(filters.keyword);
    if (keywordConditions) {
      query.$and = [
        ...(query.$and || []),
        ...keywordConditions,
      ];
    }
  }

  return query;
}

function residentialQuery(filters: any) {
  const query = buildBaseQuery(filters);
  if (filters.bhk) query.$and = [...(query.$and || []), { $or: [{ bhk: Number(filters.bhk) }, { bedrooms: Number(filters.bhk) }] }];
  if (
    filters.propertyType &&
    filters.propertyType !== "plot" &&
    filters.propertyType !== "all" &&
    !filters.keyword
  ) {
    query.propertyType = textRegex(filters.propertyType);
  }
  if (filters.constructionStatus) query.constructionStatus = filters.constructionStatus;
  if (filters.furnishing) query.furnishing = filters.furnishing;
  return query;
}

function landQuery(filters: any) {
  const query = buildBaseQuery(filters);
  if (filters.readyToConstruct) query.readyToConstruct = true;
  if (filters.propertyType && filters.propertyType !== "plot") query.propertyType = textRegex(filters.propertyType);
  return query;
}

function commercialQuery(filters: any) {
  const query = buildBaseQuery(filters);
  if (filters.propertyType) {
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { propertyType: textRegex(filters.propertyType) },
          { propertySubType: textRegex(filters.propertyType) },
        ],
      },
    ];
  }
  if (filters.constructionStatus) query.constructionStatus = filters.constructionStatus;
  if (filters.furnishing) query.furnishedStatus = filters.furnishing;
  return query;
}

function agriculturalQuery(filters: any) {
  const query = buildBaseQuery(filters);
  if (filters.propertyType && filters.propertyType !== "plot") query.propertyType = textRegex(filters.propertyType);
  return query;
}

function sortByRelevance(query: any) {
  return query
    .sort({
      "promotion.priority": -1,
      rank: -1,
      "meta.inquiries": -1,
      createdAt: -1,
    })
    .limit(10)
    .lean();
}

function markKind(items: any[], kind: string) {
  return (items || []).map((item) => ({ ...item, cardKind: kind }));
}

function sortProjectsByRelevance(query: any) {
  return query
    .sort({
      "promotion.priority": -1,
      rank: -1,
      "meta.inquiries": -1,
      createdAt: -1,
    })
    .limit(10)
    .lean();
}

export async function searchProperties(filters: any) {
  await ensureDB();

  const category = filters.propertyCategory;

  async function relaxedLocationSearch() {
    const relaxedFilters = {
      city: filters.city,
      locality: filters.locality,
      propertyCategory: filters.propertyCategory,
      listingType: filters.listingType,
    };

    if (category === "residential") {
      return markKind(
        await sortByRelevance(Residential.find(residentialQuery(relaxedFilters))),
        "residential",
      );
    }

    if (category === "commercial") {
      return markKind(
        await sortByRelevance(Commercial.find(commercialQuery(relaxedFilters))),
        "commercial",
      );
    }

    if (category === "land") {
      return markKind(
        await sortByRelevance(LandPlot.find(landQuery(relaxedFilters))),
        "land",
      );
    }

    if (category === "agricultural") {
      return markKind(
        await sortByRelevance(Agricultural.find(agriculturalQuery(relaxedFilters))),
        "agricultural",
      );
    }

    const [residential, commercial, land, agricultural] = await Promise.all([
      sortByRelevance(Residential.find(residentialQuery(relaxedFilters)).limit(4)),
      sortByRelevance(Commercial.find(commercialQuery(relaxedFilters)).limit(4)),
      sortByRelevance(LandPlot.find(landQuery(relaxedFilters)).limit(4)),
      sortByRelevance(Agricultural.find(agriculturalQuery(relaxedFilters)).limit(4)),
    ]);

    return [
      ...markKind(residential, "residential"),
      ...markKind(commercial, "commercial"),
      ...markKind(land, "land"),
      ...markKind(agricultural, "agricultural"),
    ].slice(0, 12);
  }

  if (filters.keyword) {
    const [residential, land, commercial, agricultural, projects] = await Promise.all([
      sortByRelevance(Residential.find(residentialQuery(filters))),
      sortByRelevance(LandPlot.find(landQuery(filters))),
      sortByRelevance(Commercial.find(commercialQuery(filters))),
      sortByRelevance(Agricultural.find(agriculturalQuery(filters))),
      sortProjectsByRelevance(FeaturedProject.find(buildProjectQuery(filters))),
    ]);

    const strictResults = [
      ...markKind(residential, "residential"),
      ...markKind(projects, "featured"),
      ...markKind(commercial, "commercial"),
      ...markKind(land, "land"),
      ...markKind(agricultural, "agricultural"),
    ].slice(0, 12);

    if (strictResults.length) return strictResults;

    return relaxedLocationSearch();
  }

  if (category === "residential") {
    const [properties, projects] = await Promise.all([
      sortByRelevance(Residential.find(residentialQuery(filters))),
      sortProjectsByRelevance(FeaturedProject.find(buildProjectQuery(filters))),
    ]);

    return [
      ...markKind(properties, "residential"),
      ...markKind(projects, "featured"),
    ].slice(0, 12);
  }

  if (category === "land") {
    return markKind(await sortByRelevance(LandPlot.find(landQuery(filters))), "land");
  }

  if (category === "agricultural") {
    return markKind(
      await sortByRelevance(Agricultural.find(agriculturalQuery(filters))),
      "agricultural",
    );
  }

  if (category === "commercial") {
    const [properties, projects] = await Promise.all([
      sortByRelevance(Commercial.find(commercialQuery(filters))),
      sortProjectsByRelevance(FeaturedProject.find(buildProjectQuery(filters))),
    ]);

    return [
      ...markKind(properties, "commercial"),
      ...markKind(projects, "featured"),
    ].slice(0, 12);
  }

  const [residential, land, commercial, agricultural, projects] = await Promise.all([
    sortByRelevance(Residential.find(residentialQuery(filters)).limit(4)),
    sortByRelevance(LandPlot.find(landQuery(filters)).limit(4)),
    sortByRelevance(Commercial.find(commercialQuery(filters)).limit(4)),
    sortByRelevance(Agricultural.find(agriculturalQuery(filters)).limit(4)),
    sortProjectsByRelevance(FeaturedProject.find(buildProjectQuery(filters)).limit(4)),
  ]);

  return [
    ...markKind(residential, "residential"),
    ...markKind(land, "land"),
    ...markKind(commercial, "commercial"),
    ...markKind(agricultural, "agricultural"),
    ...markKind(projects, "featured"),
  ].slice(0, 12);
}
