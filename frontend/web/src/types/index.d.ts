import { IAgricultural } from "./agricultural";
import { ICommercial } from "./commercial";
import { ILand } from "./land";
import { IResidential } from "./residential";
import { ResidentialFilters } from "./sharedTypes";

export interface MediaFile {
  url: string;
  key?: string;
  filename?: string;
  mimetype?: string;
}
export interface YoutubeVideo {
  order: number;
  title: string;
  url: string;
}

export interface IPromotion {
  type: "normal" | "featured" | "prime" | "sponsored";
  priority: number;
  source: "manual" | "subscription";
  startDate?: string | Date;
  boostExpiry?: string | Date;
  enquiryLimit?: number;
  enquiriesUsed?: number;
}

export interface FeaturedProject {
  // basic
  _id: string;
  title: string;
  slug: string;
  logo: {
    url: string;
  };
  // relations
  developer?: Types.ObjectId | string;

  // hero section
  heroImage?: string;
  heroVideo?: string;
  heroTagline?: string;
  heroSubTagline?: string;
  heroDescription?: string;
  redirectUrl?: string;


  // SEO / branding
  color?: string; // hex e.g. '#000'
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;

  // address & geo
  categoryType?: string;
  address: string;
  city?: string;
  location?: {
    type: "Point";
    // [lng, lat]
    coordinates: [number, number] | number[];
  };
  mapEmbedUrl?: string;
  locality?: string;
  state?: string;
  promotion?: IPromotion;

  // pricing / bhk
  currency?: string; // default: 'INR'
  priceFrom?: number; // computed
  priceTo?: number; // computed
  projectSummary?: IBhkSummary[];
  bhkSummary?: IBhkSummary[];
  sqftRange?: { min?: number; max?: number };

  // timeline & counts
  possessionDate?: string;
  launchDate?: string;
  totalTowers?: number;
  totalFloors?: string;
  projectArea?: number;
  totalUnits?: number;
  availableUnits?: number;

  aboutSummary?: AboutItem[];

  // legal / banks
  reraNumber?: string;
  banksApproved?: string[];

  // media & gallery
  gallerySummary: IGalleryItem[];
  brochure?: MediaFile;
  brochureFileName?: string;

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
  status?: "active" | "inactive" | "archived";
  createdBy?: Types.ObjectId | string;
  updatedBy?: Types.ObjectId | string;
  createdAt?: string;
  updatedAt?: string;
  updateCount?: number;
  relatedProjects?: Array<Types.ObjectId | string>;
  propertyType?: string;
  youtubeVideos?: YoutubeVideo[];
}

export interface AgentConnect {
  name: string;
  slug: string;
  bio: string;
  agencyName: string;
  licenseValidTill: string;
  areasServed: string[];
  locality?: string;
  city: string;
  experienceYears: number;
  dealsClosed: number;
  languages: string[];
  verificationStatus: string;
  verificationDocuments: any[];
  avatar: Avatar;
  coverImage: CoverImage;
  rera: ReraInfo;
  stats: Stats;
  _id: string;
}

export interface AgentDetailsResponse {
  agent: AgentConnect;
  properties: {
    residential: IResidential[];
    commercial: ICommercial[];
    land: ILand[];
    agricultural: IAgricultural[];
  };
}

export interface IBhkPlan {
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
  area?: {
    value?: number;
    unit?: string;
    sqftValue?: number;
  };
  plan?: IBhkPlan;
}

// types/feature.ts
export interface AboutItem {
  builderName?: string;
  aboutDescription?: string;
  rightContent?: string; // newline separated bullets or lines starting with •
  url?: string; // S3 url, optional (server may not provide)
  key?: string;
  filename?: string;
  mimetype?: string;
}

export interface BhkSummary {
  bhk: number;
  label?: string;
  bhkLabel?: string;
  units?: IBhkUnit[];
}

export interface SqftRange {
  min: number;
  max: number;
}

export interface GalleryItem {
  title: string;
  url: string;
  category: string;
  order: number;
}

export interface SpecificationCategory {
  category: string;
  order: number;
  items: SpecificationItem[];
}

export interface SpecificationItem {
  title: string;
  description: string;
}

export interface IAmenity {
  key?: string;
  title?: string;
  category?: "Sports" | "Convenience" | "Safety" | "Environment" | string;
  icon?: string;
  description?: string;
}

export interface INearbyPlace {
  name?: string;
  type?: string;
  distanceText?: string;
  coordinates?: [number, number] | number[]; // [lng, lat]
  order?: number;
}

export interface PopularOwnerPropertiesResponse {
  success: boolean;
  message: string;
  count: number;
  properties: PopularOwnerProperty[];
}

export interface PopularOwnerProperty {
  _id: string;
  title: string;
  description: string;
  userId: string;

  listingType: string; // Rent / buy etc.
  category: string; // Residential, Commercial, etc.
  price: number;
  facing?: string | null;
  area?: number;

  isVerified: boolean;
  verificationStatus: string;
  verifiedBy?: string | null;
  verifiedAt?: string | null;

  address: {
    addressLine: string;
    nearbyLandmarks: string[];
    city: string;
    pincode: string;
  };

  amenities: {
    waterSupply: boolean;
    powerBackup: boolean;
    parking: boolean;
    security: boolean;
    gym: boolean;
    swimmingPool: boolean;
    clubhouse: boolean;
    lift: boolean;
  };

  images: {
    url: string;
    key: string;
    alt: string;
    size: number;
  }[];

  videos: {
    url?: string;
    title?: string;
  }[];

  details: {
    bhk: number;
    bathrooms: number;
    floor: number;
    propertyType: string;
  };

  listedDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Locality {
  name: string;
  isHome?: boolean;
}

export interface LocationItem {
  _id: string;
  city: string;
  state: string;
  category: string;
  isHome?: boolean;
  localities: Locality[];
}

export type PropertyFormValues = {
  title: string;
  description?: string;
  category: "Residential" | "Commercial" | "LandPlot" | "Agricultural";
  listingType: string;
  status?: "draft" | "published" | "archived";

  address: {
    addressLine?: string;
    nearbyLandmarks?: string[];
    city?: string;
    pincode?: string;
  };

  price?: number;
  area?: number;
  facing?: string;
  details?: Record<string, any>;

  amenities: {
    waterSupply?: boolean;
    powerBackup?: boolean;
    parking?: boolean;
    security?: boolean;
    gym?: boolean;
    swimmingPool?: boolean;
    clubhouse?: boolean;
    lift?: boolean;
  };

  images: { url: string; key: string; alt?: string; size?: number }[];
  videos: { url: string; key: string; alt?: string; size?: number }[];

  createdBy?: string;
  createdByRole?: "builder" | "agent" | "seller" | "admin";
  builder?: string | null;
  agent?: string | null;
  seller?: string | null;
};

export type categoryOption =
  | "Residential"
  | "Commercial"
  | "Land"
  | "Agricultural";

export type ListingOption = "Buy" | "Rent" | "Lease";

export type SearchItem = {
  id?: string;
  type?: string;
  title?: string;
  price?: number;
  currency?: string;
  city?: string;
  location?: any;
  [key: string]: any;
};

export type SearchFilters = {
  filter?: any;
  propertyType?: string;
  sort?: string;
  batchSize?: number;
  page?: number;
  skip?: number;
  options?: any;
};

type RESFilterKey =
  | "Property Type"
  | "Sales Type"
  | "Covered Area"
  | "Bathroom"
  | "Balcony"
  | "Parking"
  | "Furnishing"
  | "Amenities"
  | "Facing"
  | "Posted Since"
  | "Posted By"
  | "Possession Status";

export type CommercialFilterKey =
  | "Commercial Type"
  | "Commercial Sub Type"
  | "Transaction Type"
  | "Construction Status"
  | "Built-up Area"
  | "Carpet Area"
  | "Floor Number"
  | "Total Floors"
  | "Furnishing Status"
  | "Pantry"
  | "Power Capacity"
  | "Parking"
  | "Fire Safety"
  | "Flooring Type"
  | "Wall Finish"
  | "Tenant Available"
  | "Banks Approved"
  | "Verified Properties"
  | "Price Negotiable"
  | "Amenities"
  | "Posted Since"
  | "Posted By";

export type LandFilterKey =
  | "Land Type"
  | "Land Sub Type"
  | "Plot Area"
  | "Area Unit"
  | "Dimensions"
  | "Road Width"
  | "Facing"
  | "Corner Plot"
  | "Ready To Construct"
  | "Water Connection"
  | "Electricity Connection"
  | "Approved By"
  | "Land Use Zone"
  | "Banks Approved"
  | "Price Negotiable"
  | "Verified Properties"
  | "Amenities"
  | "Posted Since"
  | "Posted By";

export type AgriculturalFilterKey =
  | "Agricultural Type"
  | "Agricultural Sub Type"
  | "Total Area"
  | "Area Unit"
  | "Soil Type"
  | "Irrigation Type"
  | "Number of Borewells"
  | "Water Source"
  | "Electricity Connection"
  | "Current Crop"
  | "Plantation Age"
  | "Road Width"
  | "Access Road Type"
  | "Boundary Wall"
  | "State Restrictions"
  | "Price Negotiable"
  | "Verified Properties"
  | "Amenities"
  | "Posted Since"
  | "Posted By";

export type SelectionType = "single" | "multiple";

type SelectableButtonProps = {
  selectionType?: SelectionType;
};

export interface MoreFilterSection {
  key: RESFilterKey;
  label: string;
  filterKey?: keyof ResidentialFilters;
  options?: string[];
  selectionType?: SelectionType;
}

export interface MoreFilterSectionCom {
  key: CommercialFilterKey;
  label: string;
  options?: string[];
  filterKey?: keyof CommercialFilters;
  selectionType?: SelectionType;
}

export interface MoreFilterSectionLand {
  key: LandFilterKey;
  label: string;
  options?: string[];
  filterKey?: keyof LandFilters;
  selectionType?: SelectionType;
}

export interface MoreFilterSectionAGR {
  key: AgriculturalFilterKey;
  label: string;
  options?: string[];
  filterKey?: keyof AgriculturalFilters;
  selectionType?: SelectionType;
}

type Plan = {
  _id: string;
  code: string;

  userType: "buyer" | "builder" | "agent";
  category: "rent" | "sell" | "both";

  tier: "free" | "tier1" | "tier2" | "tier3";
  name: string;
  dprice: number;
  price: number;
  offerText?: string;
  durationDays?: number;
  validityDays?: number; // ✅ ADD THIS

  features?: {
    PROPERTY_LISTING_LIMIT?: number;
    BUYER_REACH_PERCENT?: number;
    BUYER_ACCESS?: boolean;
    LEAD_DASHBOARD?: boolean;
    TEAM_MEMBERS?: number;

    CONTACT_OWNER_LIMIT?: number;
    CONTACT_LIMIT?: number;

    PROPERTY_COMPARISON?: boolean;
    ENQUIRY_LIMIT?: number;
    // builder extras (safe to keep)
    TOP_LISTING_DAYS?: number;
    NEW_LEADS?: boolean;
    ACTIVE_LEADS?: boolean;
    FOLLOW_UPS?: boolean;
    CLOSED_DEALS?: boolean;
    PROJECT_WISE_LEADS?: boolean;
    PHOTOSHOOT?: boolean;
    WALKTHROUGH_3D?: boolean;
    BANNER?: boolean;
  };
};
