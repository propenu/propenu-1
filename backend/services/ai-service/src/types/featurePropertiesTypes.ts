import mongoose, { Document, Model, Types } from "mongoose";
import { IPromotion } from "../models/sharedSchemas";

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

export interface IFeaturedProject {
  title: string;
  slug: string;
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
  // legal / banks
  reraNumber?: string;
  banksApproved?: string[];

  // media & gallery
  gallerySummary: IGalleryItem[];
  brochure: Ibrochure;
  // specifications & amenities
  specifications: ISpecification[];
  amenities: IAmenity[];

  // nearby places
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
  updatedBy?: Types.ObjectId | string;
  relatedProjects?: Array<Types.ObjectId | string>;
}
