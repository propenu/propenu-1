import Agricultural from "../../models/agriculturalModel";
import Commercial from "../../models/commercialModel";
import FeaturedProject from "../../models/featurePropertiesModel";
import LandPlot from "../../models/landModel";
import Residential from "../../models/residentialModel";
import { promotionHasStartedMatch } from "../../services/promotionService";

function attachType(data: any[], type: string) {
  return data.map((item) => withSponsoredDisplayFields(item, type));
}

function readName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readFilterValues(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [value];

  return [
    ...new Set(
      rawValues
        .flatMap((item) => String(item ?? "").split(","))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function buildSponsoredAdTargetFilter(filters: any) {
  const state = readName(filters.state);
  const city = readName(filters.city);
  const localities = readFilterValues(filters.locality);

  if (!state || !city) return undefined;

  const cityTargetExpr = {
    $let: {
      vars: {
        stateTarget: {
          $getField: {
            field: state,
            input: "$promotion.sponsoredAd",
          },
        },
      },
      in: {
        $getField: {
          field: city,
          input: "$$stateTarget",
        },
      },
    },
  };

  if (localities.length === 0) {
    return {
      $expr: {
        $isArray: cityTargetExpr,
      },
    };
  }

  return {
    $expr: {
      $let: {
        vars: {
          cityTarget: cityTargetExpr,
        },
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

function readObjectName(value: unknown) {
  if (!value || typeof value !== "object") return "";

  const source = value as {
    builderName?: string;
    companyName?: string;
    name?: string;
    fullName?: string;
  };

  return (
    readName(source.builderName) ||
    readName(source.companyName) ||
    readName(source.name) ||
    readName(source.fullName)
  );
}

function getAboutSummaryBuilderName(aboutSummary: unknown): string {
  if (Array.isArray(aboutSummary)) {
    return aboutSummary.map(readObjectName).find(Boolean) || "";
  }

  if (aboutSummary && typeof aboutSummary === "object") {
    const payload = aboutSummary as { aboutSummary?: unknown };
    return readObjectName(aboutSummary) || getAboutSummaryBuilderName(payload.aboutSummary);
  }

  return "";
}

function withSponsoredDisplayFields(item: any, type: string) {
  const property = {
    ...(item.toObject?.() || item),
    type,
  };

  const builderName =
    getAboutSummaryBuilderName(property.aboutSummary) ||
    readObjectName(property.developer) ||
    readObjectName(property.createdBy) ||
    readObjectName(property.postedBy) ||
    readName(property.builderName) ||
    readName(property.companyName);

  if (!builderName) {
    return property;
  }

  const aboutSummary = Array.isArray(property.aboutSummary)
    ? property.aboutSummary
    : [];

  return {
    ...property,
    aboutSummary:
      aboutSummary.length > 0
        ? aboutSummary.map((about: any, index: number) =>
            index === 0 ? { ...about, builderName: about.builderName || builderName } : about,
          )
        : [{ builderName }],
  };
}

function findSponsored(model: any, filter: any, limit = 10) {
  return model
    .find(filter)
    .populate("createdBy", "name fullName companyName email phone role roleName roleId")
    .populate("createdBy.roleId", "name label")
    .limit(limit);
}

function shuffleItems<T>(items: T[]) {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = shuffled[i] as T;
    const replacement = shuffled[j] as T;
    shuffled[i] = replacement;
    shuffled[j] = current;
  }

  return shuffled;
}

function buildBaseSponsoredFilter(filters: any) {
  const now = new Date();
  const filter: any = {
    status: "active",
    "promotion.type": "sponsored",
    $and: [
      {
        $or: [
          { "promotion.boostExpiry": { $gt: now } },
          { "promotion.boostExpiry": { $exists: false } },
        ],
      },
      promotionHasStartedMatch(now),
    ],
  };

  const sponsoredAdTargetFilter = buildSponsoredAdTargetFilter(filters);
  if (sponsoredAdTargetFilter) {
    filter.$and.push(sponsoredAdTargetFilter);
  }

  return filter;
}

function buildListingSponsoredFilter(filters: any) {
  const filter = buildBaseSponsoredFilter(filters);

  if (filters.listingType) filter.listingType = filters.listingType;

  return filter;
}

function buildProjectSponsoredFilter(filters: any, categoryType?: string) {
  const filter = buildBaseSponsoredFilter(filters);

  if (categoryType) filter.categoryType = categoryType;

  return filter;
}

async function findSponsoredListingsAndProjects(
  model: any,
  filters: any,
  listingType: string,
  projectCategoryType: string,
) {
  const listingFilter = buildListingSponsoredFilter(filters);
  const projectFilter = buildProjectSponsoredFilter(filters, projectCategoryType);
  const shouldIncludeProjects =
    !filters.listingType || String(filters.listingType).toLowerCase() === "sale";

  const [listings, projects] = await Promise.all([
    findSponsored(model, listingFilter),
    shouldIncludeProjects ? findSponsored(FeaturedProject, projectFilter) : Promise.resolve([]),
  ]);

  return [
    ...shuffleItems(attachType(projects, "featuredproject")),
    ...shuffleItems(attachType(listings, listingType)),
  ];
}

export const getSponsoredProperties = async (filters: any) => {
  const listingFilter = buildListingSponsoredFilter(filters);
  const projectFilter = buildProjectSponsoredFilter(filters);

  let data: any[] = [];

  switch (filters.category?.toLowerCase()) {
    case "residential":
      data = await findSponsoredListingsAndProjects(
        Residential,
        filters,
        "residential",
        "residential",
      );
      break;
    case "commercial":
      data = await findSponsoredListingsAndProjects(
        Commercial,
        filters,
        "commercial",
        "commercial",
      );
      break;
    case "land":
      data = await findSponsoredListingsAndProjects(LandPlot, filters, "land", "land");
      break;
    case "agricultural":
      data = await findSponsoredListingsAndProjects(
        Agricultural,
        filters,
        "agricultural",
        "agricultural",
      );
      break;
    case "featuredproject":
    case "featured-project":
    case "project":
      data = shuffleItems(
        attachType(await findSponsored(FeaturedProject, projectFilter), "featuredproject"),
      );
      break;
    default:
      const [res, com, land, agri, projects] = await Promise.all([
        findSponsored(Residential, listingFilter),
        findSponsored(Commercial, listingFilter),
        findSponsored(LandPlot, listingFilter),
        findSponsored(Agricultural, listingFilter),
        findSponsored(FeaturedProject, projectFilter)
      ]);
      data = [
        ...shuffleItems(attachType(projects, "featuredproject")),
        ...shuffleItems([
          ...attachType(res, "residential"),
          ...attachType(com, "commercial"),
          ...attachType(land, "land"),
          ...attachType(agri, "agricultural"),
        ]),
      ];
  }

  return data;
};
