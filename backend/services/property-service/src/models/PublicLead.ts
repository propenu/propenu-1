import mongoose, { Schema, Document } from "mongoose";
import { LEAD_STATUSES } from "../zod/leadZod";
import { LeadPropertyType, LeadStatus } from "../types/leadTypes";

const PropertySnapshotSchema = new Schema(
  {
    title: { type: String, trim: true },
    code: { type: String, trim: true },
    category: { type: String, trim: true },
    state: { type: String, trim: true },
    city: { type: String, trim: true },
    locality: { type: String, trim: true },
    slug: { type: String, trim: true },
    heroImage: { type: String, trim: true },
    price: { type: Number, default: null },
    priceFrom: { type: Number, default: null },
    priceTo: { type: Number, default: null },
    listingType: { type: String, trim: true },
    promotionType: { type: String, trim: true },
    status: { type: String, trim: true },
  },
  { _id: false },
);

export interface IPublicLead extends Document {
  projectId: mongoose.Types.ObjectId;
  ownerId?: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  message?: string;
  remarks?: string;
  source?: "site" | "imported";
  importedBy?: {
    userId?: mongoose.Types.ObjectId;
    name?: string;
    email?: string;
    phone?: string;
    roleName?: string;
    at?: Date;
  };
  extraFields?: Record<string, string>;
  sourceCreatedAt?: Date;
  purchaseTimeline?: string;
  budgetRange?: string;
  propertyType?: LeadPropertyType;
  propertyModel?: string;
  propertySnapshot?: {
    title?: string;
    code?: string;
    category?: string;
    state?: string;
    city?: string;
    locality?: string;
    slug?: string;
    heroImage?: string;
    price?: number | null;
    priceFrom?: number | null;
    priceTo?: number | null;
    listingType?: "sale" | "rent" | "lease" | string;
    promotionType?: string;
    status?: string;
  };
  listingType?: "sale" | "rent" | "lease";
  intention?: {
    question: string;
    answer: string;
  }[];
  createdAt: Date;
  status: LeadStatus;
}

const PublicLeadSchema = new Schema<IPublicLead>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "featuredProject",
      required: true,
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    message: { type: String },
    remarks: { type: String, trim: true },
    source: {
      type: String,
      enum: ["site", "imported"],
      default: "site",
      index: true,
    },
    importedBy: {
      userId: { type: Schema.Types.ObjectId, ref: "User" },
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      roleName: { type: String, default: "" },
      at: { type: Date },
    },
    extraFields: {
      type: Map,
      of: String,
      default: undefined,
    },
    sourceCreatedAt: { type: Date },
    purchaseTimeline: { type: String, trim: true },
    budgetRange: { type: String, trim: true },
    propertyType: {
      type: String,
      enum: ["featuredprojects", "residentials", "commercials", "agriculturals", "landplots"],
      index: true,
    },
    propertyModel: {
      type: String,
      enum: ["featuredProject", "FeaturedProject", "Residential", "Commercial", "Agricultural", "LandPlot"],
    },
    propertySnapshot: {
      type: PropertySnapshotSchema,
      default: undefined,
    },
    listingType: {
      type: String,
      enum: ["sale", "rent", "lease"],
      index: true,
    },
    intention: [
      {
        question: { type: String, trim: true },
        answer: { type: String, trim: true },
      },
    ],
    status: {
      type: String,
      enum: LEAD_STATUSES,
      default: "new_lead",
    },
  },
  { timestamps: true },
);

export default mongoose.model<IPublicLead>(
  "PublicLead",
  PublicLeadSchema,
);
