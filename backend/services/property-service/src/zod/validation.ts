// src/zod/validation.ts
import { z } from "zod";

const AreaUnitZ = z.enum([
  "sqft",
  "sqm",
  "sqyd",
  "acre",
  "hectare",
  "gunta",
  "cent",
  "bigha",
  "ankanam",
  "marla",
  "kanal",
]);

/**
 * Accepts loose website inputs (https.propenu.com, propenu.com, https://…)
 * and returns a normalized absolute URL, or undefined for empty/invalid.
 */
export function normalizeWebsiteUrl(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  let s = String(raw).trim();
  if (!s) return undefined;

  // https.propenu.com / http.example.com → https://propenu.com
  const dottedProto = s.match(
    /^(https?)\.([a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?)$/i,
  );
  if (dottedProto?.[1] && dottedProto?.[2]) {
    s = `${dottedProto[1].toLowerCase()}://${dottedProto[2]}`;
  }

  // https:/example.com → https://example.com
  s = s.replace(/^(https?):\/(?!\/)/i, "$1://");

  // Bare domain without scheme
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    s = `https://${s.replace(/^\/+/, "")}`;
  }

  // Collapse accidental https:///
  s = s.replace(/^(https?:)\/{3,}/i, "$1//");

  try {
    const url = new URL(s);
    if (!url.hostname) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Empty / null → undefined; otherwise normalize then validate as URL. */
const OptionalWebsiteUrlZ = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  const normalized = normalizeWebsiteUrl(val);
  return normalized ?? String(val).trim();
}, z.string().url("Invalid URL").optional());

const AreaSchemaZ = z.object({
  value: z.number().nonnegative(),
  unit: AreaUnitZ,
  sqftValue: z.number().nonnegative(),
});

export const UnitZ = z.object({
  minSqft: z.number().nonnegative().optional(),
  maxSqft: z.number().nonnegative().optional(),
  minPrice: z.number().nonnegative().optional(),
  price: z.number().nonnegative().optional(),
  maxPrice: z.number().nonnegative().optional(),
  availableCount: z.number().int().nonnegative().optional(),
  area: AreaSchemaZ.optional(),
  planFileName: z.string().optional(),
  planUrl: z.string().url().optional(),
  redirectUrl: OptionalWebsiteUrlZ,
  plan: z
    .object({
      url: z.string().optional(),
      key: z.string().optional(),
      filename: z.string().optional(),
      mimetype: z.string().optional(),
    })
    .optional(),
});

export const ProjectSummarySchemaZ = z.object({
  bhk: z.number().int().nonnegative(),
  label: z.string().optional(),
  bhkLabel: z.string().optional(),
  units: z.array(UnitZ).optional(),
});

export const BrochureSchema = z
  .object({
    key: z.string().optional(),
    url: z.string().url().optional(),
    filename: z.string().optional(),
    mimetype: z.string().optional(),
  })
  .optional();

export const AboutSummaryZ = z.object({
  builderName: z.string().optional(),
  aboutDescription: z.string().optional(),
  url: z
    .union([OptionalWebsiteUrlZ, z.literal(""), z.null()])
    .optional(),
  rightContent: z.string().optional().default(""),
  key: z.string().optional(),
  filename: z.string().optional(),
  mimetype: z.string().optional(),
});

const GallerySummarySchema = z.object({
  title: z.string().optional(),
  url: z.string().url().optional(),
  category: z.string().optional(),
  filename: z.string().optional(),
  order: z.number().int().optional(),
});

const AmenitySchema = z.object({
  key: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
});

const SpecificationItemSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
});

const SpecificationSchema = z.object({
  category: z.string().optional(),
  items: z.array(SpecificationItemSchema).optional(),
  order: z.number().int().optional().default(0),
});

const coerceCoord = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const NearbyPlaceSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  distanceText: z.string().optional(),
  fullAddress: z.string().optional(),
  locality: z.string().optional(),
  city: z.string().optional(),
  latitude: z.union([z.string(), z.number()]).optional(),
  longitude: z.union([z.string(), z.number()]).optional(),
  coordinates: z
    .preprocess((value) => {
      if (!Array.isArray(value) || value.length < 2) return [0, 0];
      return [coerceCoord(value[0]), coerceCoord(value[1])];
    }, z.tuple([z.number(), z.number()]))
    .optional(),
  order: z.number().int().optional().default(0),
});

const LeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  location: z.string().optional(),
  message: z.string().max(2000).optional(),
  createdAt: z.string().optional(),
});

export const FileMetaZ = z.object({
  url: z.string().url().optional(),
  key: z.string().optional(),
  filename: z.string().optional(),
  mimetype: z.string().optional(),
});

export const YoutubeVideoSchema = z.object({
  title: z.string().optional(),
  url: z.string().url().optional(),
  order: z.number().int().optional().default(0),
});

/* --------------------------- Create schema (for POST)=---------------*/
export const CreateFeaturePropertySchema = z.object({
  title: z.string().min(1),
  slug: z.string().optional(),
  logo: FileMetaZ.optional(),
  featuredTagline: z.string().optional(),
  address: z.string().min(1),
  city: z.string().optional(),
  locality: z.string().optional(),
  state: z.string().optional(),
  redirectUrl: OptionalWebsiteUrlZ,
  youtubeVideos: z.array(YoutubeVideoSchema).optional(),
  location: z
    .object({
      type: z.literal("Point").optional().default("Point"),
      coordinates: z.tuple([z.number(), z.number()]).optional(),
    })
    .optional(),

  mapEmbedUrl: OptionalWebsiteUrlZ,
  currency: z.string().optional().default("INR"),
  priceFrom: z.number().optional(),
  priceTo: z.number().optional(),
  area: AreaSchemaZ.optional(),

  projectSummary: z.array(ProjectSummarySchemaZ).optional(),
  bhkSummary: z.array(ProjectSummarySchemaZ).optional(),

  aboutSummary: z
    .union([AboutSummaryZ, z.array(AboutSummaryZ)])
    .optional()
    .transform((val) => {
      if (typeof val === "undefined") return [];
      return Array.isArray(val) ? val : [val];
    }),

  sqftRange: z
    .object({ min: z.number().optional(), max: z.number().optional() })
    .optional(),

  possessionDate: z.string().optional(),
  launchDate: z.string().optional(),
  totalTowers: z.number().int().optional(),
  totalFloors: z.string().optional(),
  projectArea: z.number().optional(),
  totalUnits: z.number().int().optional(),
  availableUnits: z.number().int().optional(),
  reraNumber: z.string().optional(),
  banksApproved: z.array(z.string()).optional(),
  heroImage: z.string().url().optional(),
  heroVideo: z.string().url().optional(),
  heroTagline: z.string().optional(),
  heroSubTagline: z.string().optional(),
  heroDescription: z.string().optional(),
  color: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  metaKeywords: z.string().optional(),
  propertyType: z.string().min(1, "Property type is required"),
  categoryType: z
    .enum(["residential", "land", "commercial", "agricultural"])
    .optional()
    .default("residential"),
  gallerySummary: z.array(GallerySummarySchema).optional().default([]),
  brochure: z.object(BrochureSchema).optional(),
  specifications: z.array(SpecificationSchema).optional(),
  amenities: z.array(AmenitySchema).optional(),
  nearbyPlaces: z.array(NearbyPlaceSchema).optional(),
  leads: z.array(LeadSchema).optional(),
  isFeatured: z.boolean().optional().default(false),
  rank: z.coerce.number().int().min(1).optional().default(1),
  meta: z
    .object({
      views: z.number().int().optional().default(0),
      inquiries: z.number().int().optional().default(0),
      clicks: z.number().int().optional().default(0),
    })
    .optional()
    .default(() => ({ views: 0, inquiries: 0, clicks: 0 }) as const),

  status: z
    .enum(["draft", "pending", "active", "inactive", "archived", "rejected"])
    .optional()
    .default("pending"),

  approvalStatus: z
    .enum(["pending", "approved", "rejected"])
    .optional()
    .default("pending"),

  approvedBy: z.string().optional(),

  approvedAt: z.date().optional(),

  rejectedReason: z.string().optional(),
  createdBy: z.string().optional(),
  relationshipManager: z
    .object({
      userId: z.string().optional().nullable(),
      designation: z.string().optional(),
      availability: z.string().optional(),
      responseTime: z.string().optional(),
    })
    .optional()
    .nullable(),
  relationshipManagerId: z.string().optional(),
  updatedBy: z.string().optional(),
});

/* --------------------------- Update schema (for PATCH)- This prevents Zod from inserting [] into the validated payload. --------------------------- */

export const UpdateFeaturePropertySchema = z
  .object({
    title: z.string().min(1).optional(),
    slug: z.string().optional(),
    logo: FileMetaZ.optional(),
    featuredTagline: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    locality: z.string().optional(),
    redirectUrl: OptionalWebsiteUrlZ,
    youtubeVideos: z.array(YoutubeVideoSchema).optional(),

    status: z
      .enum(["draft", "pending", "active", "inactive", "archived", "rejected"])
      .optional(),

    approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),

    approvedBy: z.string().optional(),

    approvedAt: z.date().optional(),

    rejectedReason: z.string().optional(),

    location: z
      .object({
        type: z.literal("Point").optional(),
        coordinates: z.tuple([z.number(), z.number()]).optional(),
      })
      .optional(),
    mapEmbedUrl: OptionalWebsiteUrlZ,
    currency: z.string().optional(),
    priceFrom: z.number().optional(),
    priceTo: z.number().optional(),
    area: AreaSchemaZ.optional(),
    projectSummary: z.array(ProjectSummarySchemaZ).optional(),
    bhkSummary: z.array(ProjectSummarySchemaZ).optional(),
    aboutSummary: z.union([AboutSummaryZ, z.array(AboutSummaryZ)]).optional(),
    sqftRange: z
      .object({ min: z.number().optional(), max: z.number().optional() })
      .optional(),
    possessionDate: z.string().optional(),
    launchDate: z.string().optional(),
    totalTowers: z.number().int().optional(),
    totalFloors: z.string().optional(),
    projectArea: z.number().optional(),
    totalUnits: z.number().int().optional(),
    availableUnits: z.number().int().optional(),
    reraNumber: z.string().optional(),
    banksApproved: z.array(z.string()).optional(),
    heroImage: z.string().url().optional(),
    heroVideo: z.string().url().optional(),
    heroTagline: z.string().optional(),
    heroSubTagline: z.string().optional(),
    heroDescription: z.string().optional(),
    color: z.string().optional(),
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    metaKeywords: z.string().optional(),
    propertyType: z.string().optional(),
    categoryType: z
      .enum(["residential", "land", "commercial", "agricultural"])
      .optional(),
    gallerySummary: z.array(GallerySummarySchema).optional(),
    brochure: z.object(BrochureSchema).optional(),
    specifications: z.array(SpecificationSchema).optional(),
    amenities: z.array(AmenitySchema).optional(),
    nearbyPlaces: z.array(NearbyPlaceSchema).optional(),
    leads: z.array(LeadSchema).optional(),
    isFeatured: z.boolean().optional(),
    rank: z.coerce.number().int().min(1).optional(),
    meta: z
      .object({
        views: z.number().int().optional(),
        inquiries: z.number().int().optional(),
        clicks: z.number().int().optional(),
      })
      .optional(),

    createdBy: z.string().optional(),
    relationshipManager: z
      .object({
        userId: z.string().optional().nullable(),
        designation: z.string().optional(),
        availability: z.string().optional(),
        responseTime: z.string().optional(),
      })
      .optional()
      .nullable(),
    relationshipManagerId: z.string().optional(),
    updatedBy: z.string().optional(),
  })
  .partial();
export type CreateFeaturePropertyDTO = z.infer<
  typeof CreateFeaturePropertySchema
>;
export type UpdateFeaturePropertyDTO = z.infer<
  typeof UpdateFeaturePropertySchema
>;
