import mongoose, { Schema, Document, Model, Types } from "mongoose";
import {
  IAboutSummary,
  IAmenity,
  IArea,
  Ibrochure,
  IFeaturedProject,
  IGalleryItem,
  ILead,
  ILogo,
  INearbyPlace,
  IProjectSummary,
  ISpecification,
  ISpecItem,
} from "../types/featurePropertiesTypes";
import {
  PromotionSchema,
  RelationshipManagerAssignmentSchema,
} from "./sharedSchemas";
import {
  generatePropertyCode,
  PropertyCodeCategory,
} from "../utils/generatePropertyCode";
import { listingFollowUpPlugin } from "../utils/listingFollowUpAssign";

const FEATURED_CATEGORY_CODES: Record<
  NonNullable<IFeaturedProject["categoryType"]>,
  PropertyCodeCategory
> = {
  residential: "RES",
  commercial: "COM",
  land: "LAN",
  agricultural: "AGR",
};

function generateSlug(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface IFeaturedProjectDocument extends IFeaturedProject, Document {}
export interface ILeadDocument extends ILead, Document {
  projectId: Types.ObjectId;
}

const AreaSchema = new Schema<IArea>(
  {
    value: { type: Number, required: true },
    unit: {
      type: String,
      enum: [
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
      ],
      required: true,
    },
    sqftValue: { type: Number, required: true },
  },
  { _id: false },
);

const UnitSchema = new Schema(
  {
    minSqft: { type: Number },
    maxSqft: { type: Number },
    minPrice: { type: Number },
    maxPrice: { type: Number },
    availableCount: { type: Number, default: 0 },
    area: { type: AreaSchema },

    plan: {
      url: { type: String },
      key: { type: String },
      filename: { type: String },
      mimetype: { type: String },
    },
  },
  { _id: false },
);

const ProjectSummarySchema = new Schema<IProjectSummary>(
  {
    bhk: { type: Number, required: true },
    label: { type: String },
    units: { type: [UnitSchema] },
  },
  { _id: false },
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
  { _id: false },
);

const AboutSummarySchema = new Schema<IAboutSummary>(
  {
    builderName: { type: String },
    aboutDescription: { type: String },
    url: { type: String },
    rightContent: { type: String, required: true },
    key: { type: String },
    filename: { type: String },
    mimetype: { type: String },
  },
  { _id: false },
);

const brochureSchema = new Schema<Ibrochure>(
  {
    key: { type: String },
    url: { type: String },
    filename: { type: String },
    mimetype: { type: String },
  },
  { _id: false },
);

const AmenitySchema = new Schema<IAmenity>(
  {
    key: { type: String },
    title: { type: String },
    description: { type: String },
  },
  { _id: false },
);

const SpecificationItemSchema = new Schema<ISpecItem>(
  {
    title: { type: String },
    description: { type: String },
  },
  { _id: false },
);

const SpecificationSchema = new Schema<ISpecification>(
  {
    category: { type: String },
    items: { type: [SpecificationItemSchema] },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const YoutubeVideoSchema = new Schema(
  {
    title: { type: String },
    url: { type: String, required: true },
    order: { type: Number, default: 0 },
  },
  { _id: false },
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
  { _id: false },
);

const LogoSchema = new Schema<ILogo>({
  url: { type: String },
  key: { type: String },
  filename: { type: String },
  mimetype: { type: String },
});

const PromotionHistorySchema = new Schema(
  {
    fromType: {
      type: String,
      enum: ["normal", "featured", "prime", "sponsored"],
    },
    toType: {
      type: String,
      enum: ["normal", "featured", "prime", "sponsored"],
      required: true,
    },
    source: {
      type: String,
      enum: ["manual", "subscription", "system"],
      default: "manual",
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    changedByRole: { type: String },
    changedByName: { type: String },
    changedByEmail: { type: String },
    reason: { type: String },
    startedAt: { type: Date },
    endedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    metadata: {
      previousPriority: { type: Number },
      newPriority: { type: Number },
    },
  },
  { _id: false },
);

/* ------------------------- Main schema  -------------------------*/
const FeaturePropertySchema = new Schema<IFeaturedProjectDocument>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, index: true },
    propertyCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
    },
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
    propertyType: { type: String, required: true },
    address: { type: String, required: true },
    categoryType: {
      type: String,
      enum: ["residential", "land", "commercial", "agricultural"],
    },
    city: { type: String, index: true, required: true },
    locality: { type: String, index: true, required: true },
    state: { type: String, index: true, required: true },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], index: "2dsphere" },
    },
    mapEmbedUrl: { type: String },
    currency: { type: String, default: "INR" },
    priceFrom: { type: Number, index: true },
    priceTo: { type: Number, index: true },
    projectSummary: { type: [ProjectSummarySchema] },
    possessionDate: { type: String },
    launchDate: { type: String },
    totalTowers: { type: Number },
    redirectUrl: { type: String, trim: true },
    totalFloors: { type: String },
    projectArea: { type: Number },
    totalUnits: { type: Number },
    availableUnits: { type: Number },
    reraNumber: { type: String },
    banksApproved: { type: [String] },
    gallerySummary: { type: [GallerySummarySchema] },
    youtubeVideos: { type: [YoutubeVideoSchema] },
    aboutSummary: { type: [AboutSummarySchema] },
    brochure: { type: brochureSchema, default: null },
    specifications: { type: [SpecificationSchema] },
    amenities: { type: [AmenitySchema] },
    nearbyPlaces: { type: [NearbyPlaceSchema] },
    rank: { type: Number, default: 0, index: true },
    meta: {
      views: { type: Number, default: 0 },
      inquiries: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ["draft", "pending", "active", "inactive", "archived", "rejected"],
      default: "pending",
      index: true,
    },
    /** Optional while status=draft (builder assignment pending). Required before pending/active. */
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    builderOnboarding: {
      enabled: { type: Boolean, default: false, index: true },
      mode: {
        type: String,
        enum: [
          "existing_builder",
          "invite_link",
          "staff_direct",
          "staff_direct_no_otp",
          "",
        ],
        default: "",
      },
      assignStatus: {
        type: String,
        enum: [
          "pending",
          "invited",
          "opened",
          "not_opened",
          "clicked",
          "interested",
          "otp_pending",
          "verified",
          "rejected",
          "expired",
        ],
        default: "pending",
        index: true,
      },
      inviteId: { type: Schema.Types.ObjectId, ref: "ProjectBuilderInvite" },
      inviteEmail: { type: String, trim: true, lowercase: true },
      invitePhone: { type: String, trim: true },
      emailStatus: { type: String, trim: true },
      emailUiStatus: { type: String, trim: true, index: true },
      lastEmailAt: { type: Date },
      openedAt: { type: Date },
      clickedAt: { type: Date },
      verifiedAt: { type: Date },
      verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
      builderSnapshot: {
        companyName: { type: String },
        contactName: { type: String },
        email: { type: String },
        phone: { type: String },
      },
    },
    /** People handling this specific project (sales/CRM contacts). */
    projectContacts: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          phone: { type: String, required: true, trim: true },
          email: { type: String, trim: true, lowercase: true },
          role: { type: String, trim: true },
          isPrimary: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    /** Exclusive CCE owner (from creator at post time). */
    followUpAssignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    followUpAssignedAt: { type: Date, default: null },
    followUpWorkStatus: {
      type: String,
      enum: ["assigned", "in_progress", "completed"],
      default: null,
      index: true,
    },
    followUpWorkUpdatedAt: { type: Date, default: null },
    followUpWorkUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    followUpCompletionReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    relationshipManager: {
      type: RelationshipManagerAssignmentSchema,
      default: null,
    },
    relationshipManagerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },

    promotion: {
      type: PromotionSchema,
      default: () => ({
        type: "normal",
        priority: 0,
        source: "manual",
      }),
    },

    promotionHistory: {
      type: [PromotionHistorySchema],
      default: [],
    },

    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    approvedAt: {
      type: Date,
    },

    rejectedReason: {
      type: String,
    },

    lastPromotionType: {
      type: String,
      enum: ["normal", "featured", "prime", "sponsored"],
    },

    postedBy: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      name: String,
      email: String,
      roleName: String,

      postedAt: {
        type: Date,
        default: Date.now,
      },
    },

    lastUpdatedBy: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      name: String,
      email: String,
      roleName: String,
      updatedAt: Date,
    },

    /** Soft-delete audit (Delete in admin = deactivate, status → inactive). */
    deletedAt: { type: Date, index: true },
    deletedBy: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      name: String,
      email: String,
      roleName: String,
    },

    updateCount: {
      type: Number,
      default: 0,
    },

    updateHistory: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },

        name: String,
        email: String,
        roleName: String,

        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    relatedProjects: { type: [Schema.Types.ObjectId], ref: "featuredProject" },
  },
  { timestamps: true },
);

FeaturePropertySchema.index(
  { title: "text", address: "text", city: "text" },
  { name: "Idx_Text_Search" },
);

FeaturePropertySchema.index(
  { status: 1, rank: -1, createdAt: -1 },
  { name: "Idx_Featured_Status_Rank_CreatedAt" },
);

FeaturePropertySchema.index(
  { city: 1, rank: -1 },
  { name: "Idx_Featured_City_Rank" },
);

FeaturePropertySchema.index(
  { priceFrom: 1, priceTo: 1 },
  { name: "Idx_PriceRange" },
);

FeaturePropertySchema.index(
  { "location.coordinates": "2dsphere" },
  { name: "Idx_Location_2dsphere" },
);

FeaturePropertySchema.plugin(listingFollowUpPlugin);

FeaturePropertySchema.pre<IFeaturedProjectDocument>("save", function (next) {
  const legacySummary = (this as any).bhkSummary;
  if (
    (!Array.isArray(this.projectSummary) || this.projectSummary.length === 0) &&
    Array.isArray(legacySummary)
  ) {
    this.projectSummary = legacySummary.map((item: any) => {
      const { bhkLabel, ...rest } = item;
      return {
        ...rest,
        label: item.label ?? bhkLabel,
      };
    });
  }

  next();
});

FeaturePropertySchema.pre<IFeaturedProjectDocument>(
  "save",
  async function (next) {
    if (!this.isModified("title") && this.slug) return next();

    const parts = [this.title, this.locality, this.city].filter(Boolean);
    let baseSlug = generateSlug(parts.join(" "));
    let slug = baseSlug;
    let count = 1;

    // check duplicates
    while (await FeaturedProject.exists({ slug })) {
      slug = `${baseSlug}-${count++}`;
    }

    this.slug = slug;
    next();
  },
);

FeaturePropertySchema.pre<IFeaturedProjectDocument>(
  "save",
  async function (next) {
    try {
      if (this.propertyCode) return next();

      const category = this.categoryType
        ? FEATURED_CATEGORY_CODES[this.categoryType]
        : undefined;

      if (!category) return next();

      const propertyCode = await generatePropertyCode({
        city: this.city,
        locality: this.locality,
        category,
      });

      if (propertyCode) this.propertyCode = propertyCode;

      next();
    } catch (error) {
      next(error as Error);
    }
  },
);

FeaturePropertySchema.pre<IFeaturedProjectDocument>("save", function (next) {
  try {
    const projectSummary = this.projectSummary ?? (this as any).bhkSummary;

    if (Array.isArray(projectSummary) && projectSummary.length) {
      const prices: number[] = [];

      for (const b of projectSummary) {
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
    FeaturePropertySchema,
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
  { timestamps: false },
);
LeadSchemaFull.index({ projectId: 1, createdAt: -1 });

const leadModelName = "Lead";
const Lead: Model<ILeadDocument> =
  (mongoose.models && (mongoose.models as any)[leadModelName]) ||
  mongoose.model<ILeadDocument>(leadModelName, LeadSchemaFull);

/* exports */
export { FeaturedProject, Lead };
export default FeaturedProject;
