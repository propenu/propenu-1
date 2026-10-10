// src/models/featurePropertiesModel.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import {
  IAboutSummary,
  IAmenity,
  IBhkSummary,
  Ibrochure,
  IFeaturedProject,
  IGalleryItem,
  ILead,
  ILogo,
  INearbyPlace,
  ISpecification,
  ISpecItem,
} from "../types/featurePropertiesTypes";

export interface IFeaturedProjectDocument extends IFeaturedProject, Document {}
export interface ILeadDocument extends ILead, Document {
  projectId: Types.ObjectId;
}

const UnitSchema = new Schema(
  {
    minSqft: { type: Number },
    maxPrice: { type: Number },
    availableCount: { type: Number, default: 0 },
    plan: {
      url: { type: String },
      key: { type: String },
      filename: { type: String },
      mimetype: { type: String },
    },
  },
  { _id: false }
);

const BhkSummarySchema = new Schema<IBhkSummary>(
  {
    bhk: { type: Number, required: true },
    bhkLabel: { type: String },
    units: { type: [UnitSchema] },
  },
  { _id: false }
);

const GallerySummarySchema = new Schema<IGalleryItem>(
  {
    title: { type: String },
    url: { type: String, required: true },
    category: { type: String },
    fileName: { type: String },
    order: { type: Number, default: 0 },
    key: { type: String },
    mimetype: { type: String },
  },
  { _id: false }
);

const AboutSummarySchema = new Schema<IAboutSummary>(
  {
    aboutDescription: { type: String },
    url: { type: String },
    rightContent: { type: String, required: true },
    key: { type: String },
    filename: { type: String },
    mimetype: { type: String },
  },
  { _id: false }
);

const brochureSchema = new Schema<Ibrochure>(
  {
    key: { type: String },
    url: { type: String },
    filename: { type: String },
    mimetype: { type: String },
  },
  { _id: false }
);

const AmenitySchema = new Schema<IAmenity>(
  {
    key: { type: String },
    title: { type: String },
    description: { type: String },
  },
  { _id: false }
);

const SpecificationItemSchema = new Schema<ISpecItem>(
  {
    title: { type: String },
    description: { type: String },
  },
  { _id: false }
);

const SpecificationSchema = new Schema<ISpecification>(
  {
    category: { type: String },
    items: { type: [SpecificationItemSchema] },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const NearbyPlaceSchema = new Schema<INearbyPlace>(
  {
    name: { type: String },
    type: { type: String },
    distanceText: { type: String },
    coordinates: {
      type: [Number],
      validate: {
        validator: (v: number[]) => !v || v.length === 2,
        message: "coordinates must be [lng, lat]",
      },
    },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const LogoSchema = new Schema<ILogo>({
  url: { type: String },
  key: { type: String },
  filename: { type: String },
  mimetype: { type: String },
});

/* -------------------------
   Main schema
   -------------------------*/
const FeaturePropertySchema = new Schema<IFeaturedProjectDocument>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    logo: { type: LogoSchema },
    heroImage: { type: String },
    heroVideo: { type: String },
    heroTagline: { type: String },
    heroSubTagline: { type: String },
    heroDescription: { type: String },
    color: { type: String },
    metaTitle: { type: String },
    metaDescription: { type: String },
    metaKeywords: { type: String },
    address: { type: String, required: true },
    city: { type: String, index: true, required: true },
    locality: { type: String, index: true, required: true },
    state: { type: String, index: true, required: true},
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], index: "2dsphere" },
    },
    mapEmbedUrl: { type: String },
    currency: { type: String, default: "INR" },
    priceFrom: { type: Number, index: true },
    priceTo: { type: Number, index: true },
    bhkSummary: { type: [BhkSummarySchema] },
    sqftRange: {
      min: { type: Number },
      max: { type: Number },
    },
    possessionDate: { type: String },
    launchDate: { type: String },
    totalTowers: { type: Number },
    totalFloors: { type: String },
    projectArea: { type: Number },
    totalUnits: { type: Number },
    availableUnits: { type: Number },
    reraNumber: { type: String },
    banksApproved: { type: [String] },
    gallerySummary: { type: [GallerySummarySchema] },
    aboutSummary: { type: [AboutSummarySchema] },
    brochure: { type: brochureSchema, default: null },
    specifications: { type: [SpecificationSchema] },
    amenities: { type: [AmenitySchema] },
    nearbyPlaces: { type: [NearbyPlaceSchema] },
    isFeatured: { type: Boolean, default: false, index: true },
    rank: { type: Number, default: 1, index: true },
    meta: {
      views: { type: Number, default: 0 },
      inquiries: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    relatedProjects: { type: [Schema.Types.ObjectId], ref: "featuredProject" },
  },
  { timestamps: true }
);

FeaturePropertySchema.index(
  { title: "text", address: "text", city: "text" },
  { name: "Idx_Text_Search" }
);

FeaturePropertySchema.index({ isFeatured: 1 }, { name: "Idx_IsFeatured" });

FeaturePropertySchema.index(
  { isFeatured: 1, status: 1, rank: -1, createdAt: -1 },
  { name: "Idx_Featured_Status_Rank_CreatedAt" }
);

FeaturePropertySchema.index(
  { isFeatured: 1, city: 1, rank: -1 },
  { name: "Idx_Featured_City_Rank" }
);

FeaturePropertySchema.index(
  { priceFrom: 1, priceTo: 1 },
  { name: "Idx_PriceRange" }
);

FeaturePropertySchema.index(
  { "location.coordinates": "2dsphere" },
  { name: "Idx_Location_2dsphere" }
);

FeaturePropertySchema.pre<IFeaturedProjectDocument>(
  "validate",
  function (next) {
    if (!this.slug && this.title) {
      this.slug = String(this.title)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }
    next();
  }
);

FeaturePropertySchema.pre<IFeaturedProjectDocument>("save", function (next) {
  try {
    if (Array.isArray(this.bhkSummary) && this.bhkSummary.length) {
      const prices: number[] = [];

      for (const b of this.bhkSummary) {
        // include any top-level price fields if present (defensive)
        const maybeMin = (b as any).minPrice;
        const maybeMax = (b as any).maxPrice;
        if (typeof maybeMin === "number" && Number.isFinite(maybeMin))
          prices.push(maybeMin);
        if (typeof maybeMax === "number" && Number.isFinite(maybeMax))
          prices.push(maybeMax);

        // include any unit-level prices
        if (Array.isArray((b as any).units)) {
          for (const u of (b as any).units) {
            const uMin = (u as any).minPrice;
            const uMax = (u as any).maxPrice;
            if (typeof uMin === "number" && Number.isFinite(uMin))
              prices.push(uMin);
            if (typeof uMax === "number" && Number.isFinite(uMax))
              prices.push(uMax);
          }
        }
      }

      if (prices.length) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        // @ts-ignore assign possible undefined
        this.priceFrom = Number.isFinite(min) ? min : undefined;
        // @ts-ignore
        this.priceTo = Number.isFinite(max) ? max : undefined;
      } else {
        // @ts-ignore
        this.priceFrom = undefined;
        // @ts-ignore
        this.priceTo = undefined;
      }
    } else {
      // @ts-ignore
      this.priceFrom = undefined;
      // @ts-ignore
      this.priceTo = undefined;
    }
  } catch (e) {
    console.warn("Error computing priceFrom/priceTo:", e);
  }
  next();
});

const featuredModelName = "featuredProject";
const FeaturedProject: Model<IFeaturedProjectDocument> =
  (mongoose.models && (mongoose.models as any)[featuredModelName]) ||
  mongoose.model<IFeaturedProjectDocument>(
    featuredModelName,
    FeaturePropertySchema
  );

/* Optional: separate Lead model (if you want to scale leads out later) */
const LeadSchemaFull = new Schema<ILeadDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: featuredModelName,
      index: true,
    },
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true, index: true },
    location: { type: String },
    message: { type: String },
    createdAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);
LeadSchemaFull.index({ projectId: 1, createdAt: -1 });

const leadModelName = "Lead";
const Lead: Model<ILeadDocument> =
  (mongoose.models && (mongoose.models as any)[leadModelName]) ||
  mongoose.model<ILeadDocument>(leadModelName, LeadSchemaFull);

/* exports */
export { FeaturedProject, Lead };
export default FeaturedProject;
