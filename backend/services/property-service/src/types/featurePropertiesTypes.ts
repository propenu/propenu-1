import mongoose, { Document, Model, Types } from "mongoose";
import { IPromotion } from "../models/sharedSchemas";

export type PromotionType = "normal" | "featured" | "sponsored" | "prime";

export interface IPromotionHistory {
  fromType?: PromotionType;
  toType: PromotionType;
  source?: "manual" | "subscription" | "system";
  changedBy?: Types.ObjectId | string;
  changedByRole?: string;
  reason?: string;
  startedAt?: Date;
  endedAt?: Date | null;
  expiresAt?: Date | null;
  metadata?: {
    previousPriority?: number;
    newPriority?: number;
  };
}

export interface IBhkPlan {
  url?: string;
  key?: string;
  filename?: string;
  mimetype?: string;
}

export interface ILogo {
  url?: string;
  key?: string;
  filename?: string;
  mimetype?: string;
}

export interface IBhkUnit {
  minSqft?: number;
  maxSqft?: number;
  minPrice?: number;
  price?: number;
  maxPrice?: number;
  availableCount?: number;
  area?: IArea;
  plan?: IBhkPlan;
}

export interface IProjectSummary {
  bhk: number;
  label?: string;
  bhkLabel?: string;
  units?: IBhkUnit[];
}

export interface IGalleryItem {
  title?: string;
  url: string;
  category?: string;
  order?: number;
  fileName: string;
  key: string;
  mimetype: string;
}

export interface IAmenity {
  key?: string;
  title?: string;
  description?: string;
}

export interface Ibrochure {
  key?: string;
  url?: string;
  filename?: string;
  mimetype?: string;
}

export interface IAboutSummary {
  builderName?: string;
  aboutDescription?: string;
  url?: string;
  rightContent?: string;
  key?: string;
  filename?: string;
  mimetype?: string;
}

export interface ISpecItem {
  title?: string;
  description?: string;
}

export interface ISpecification {
  category?: string;
  items?: ISpecItem[];
  order?: number;
}

export interface INearbyPlace {
  name?: string;
  type?: string;
  distanceText?: string;
  coordinates?: [number, number] | number[]; // [lng, lat]
  order?: number;
}

export interface ILead {
  name: string;
  phone: string;
  location?: string;
  message?: string;
  createdAt?: Date;
}

export interface IYoutubeVideo {
  title?: string;
  url: string;
  order?: number;
}

export type AreaUnit =
  | "sqft"
  | "sqm"
  | "sqyd"
  | "acre"
  | "hectare"
  | "gunta"
  | "cent"
  | "bigha"
  | "ankanam"
  | "marla"
  | "kanal";

export interface IArea {
  value: number;
  unit: AreaUnit;
  sqftValue: number;
}

export interface IPostedBy {
  userId: Types.ObjectId | string;
  name?: string;
  email?: string;
  roleName?: string;
  postedAt?: Date;
}

export interface ILastUpdatedBy {
  userId: Types.ObjectId | string;
  name?: string;
  email?: string;
  roleName?: string;
  updatedAt?: Date;
}

export interface IDeletedBy {
  userId: Types.ObjectId | string;
  name?: string;
  email?: string;
  roleName?: string;
}

export interface IUpdateHistory {
  userId: Types.ObjectId | string;
  name?: string;
  email?: string;
  roleName?: string;
  updatedAt?: Date;
  action?: "created" | "updated" | "deleted";
}

export interface IFeaturedProject {
  title: string;
  slug: string;
  propertyCode?: string;
  logo?: ILogo | null;
  developer?: Types.ObjectId | string;
  heroImage?: string;
  heroVideo?: string;
  heroTagline?: string;
  heroSubTagline?: string;
  heroDescription?: string;
  color?: string;
  youtubeVideos?: IYoutubeVideo[];
  redirectUrl?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  propertyType?: string; // default: 'featuredProject'
  categoryType?: "residential" | "land" | "commercial" | "agricultural";
  address: string;
  promotion?: IPromotion;
  promotionHistory?: IPromotionHistory[];
  city?: string;
  location?: {
    type: "Point";
    coordinates: [number, number] | number[];
  };
  mapEmbedUrl?: string;
  state?: string;
  aboutSummary?: IAboutSummary;
  currency?: string; // default: 'INR'
  priceFrom?: number; // computed
  priceTo?: number; // computed
  area?: IArea;
  projectSummary: IProjectSummary[];
  bhkSummary?: IProjectSummary[];
  sqftRange?: { min?: number; max?: number };

  // timeline & counts
  possessionDate?: string;
  launchDate?: string;
  totalTowers?: number;
  totalFloors?: string;
  projectArea?: number;
  totalUnits?: number;
  availableUnits?: number;
  locality?: string;
  reraNumber?: string;
  banksApproved?: string[];
  gallerySummary: IGalleryItem[];
  brochure: Ibrochure;
  specifications: ISpecification[];
  amenities: IAmenity[];
  nearbyPlaces: INearbyPlace[];

  // leads (embedded) — small volume only; each entry follows ILead
  leads?: ILead[];

  // flags & meta
  isFeatured?: boolean;
  rank?: number;
  meta?: {
    views?: number;
    inquiries?: number;
    clicks?: number;
  };

  // status & audit
  status?:
    | "draft"
    | "pending"
    | "active"
    | "inactive"
    | "archived"
    | "rejected";

  createdBy?: Types.ObjectId | string;
  builderOnboarding?: {
    enabled?: boolean;
    mode?: "existing_builder" | "invite_link" | "staff_direct" | "";
    assignStatus?:
      | "pending"
      | "invited"
      | "opened"
      | "not_opened"
      | "clicked"
      | "interested"
      | "otp_pending"
      | "verified"
      | "rejected"
      | "expired";
    inviteId?: Types.ObjectId | string;
    inviteEmail?: string;
    invitePhone?: string;
    emailStatus?: string;
    emailUiStatus?: string;
    lastEmailAt?: Date;
    openedAt?: Date;
    clickedAt?: Date;
    verifiedAt?: Date;
    verifiedBy?: Types.ObjectId | string;
    builderSnapshot?: {
      companyName?: string;
      contactName?: string;
      email?: string;
      phone?: string;
    };
  };
  projectContacts?: Array<{
    name: string;
    phone: string;
    email?: string;
    role?: string;
    isPrimary?: boolean;
  }>;
  /** Exclusive CCE owner for Client Progress Queue. */
  followUpAssignedTo?: Types.ObjectId | string | null;
  followUpAssignedAt?: Date | null;
  followUpWorkStatus?: "assigned" | "in_progress" | "completed" | null;
  followUpWorkUpdatedAt?: Date | null;
  followUpWorkUpdatedBy?: Types.ObjectId | string | null;
  followUpCompletionReason?: string | null;
  relationshipManager?: {
    userId?: Types.ObjectId | string | null;
    designation?: string;
    availability?: string;
    responseTime?: string;
  } | null;
  relationshipManagerId?: Types.ObjectId | string | null;
  postedBy?: IPostedBy;
  lastUpdatedBy?: ILastUpdatedBy;
  deletedAt?: Date | null;
  deletedBy?: IDeletedBy | null;
  updateCount?: number;
  updateHistory?: IUpdateHistory[];

  updatedBy?: Types.ObjectId | string;
  relatedProjects?: Array<Types.ObjectId | string>;

  approvalStatus?: "pending" | "approved" | "rejected";

  approvedBy?: Types.ObjectId;

  approvedAt?: Date;

  rejectedReason?: string;

  lastPromotionType?: PromotionType;
}
