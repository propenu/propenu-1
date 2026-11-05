import { IPromotion } from "@/app/(pages)/properties/cards/FeaturedPropertyCard";

// types/property.ts
export interface Meta {
  startedAt?: string;
  defaultsApplied?: {
    category?: string;
  };
  total?: number;
  includeFeaturedProjects?: boolean;
  resultMode?: "listings-only" | "mixed-results" | "projects-only";
  searchScopeReason?: string;
  commonFilterKeys?: string[];
  propertyOnlyFilterKeys?: string[];
  featuredOnlyFilterKeys?: string[];
}


export interface Property {
  id: string;
  _id: string;
  title: string;
  slug?: string;
  address?: string;
  city?: string;
  location?: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
  gallery?: {
    url: string;
    key: string;
    filename: string;
    order: number;
  }[];
  price?: number;
  pricePerSqft?: number;
  superBuiltUpArea?: number; // sqft
  bedrooms?: number;
  furnishing?: "furnished" | "unfurnished" | "semi-furnished" | string;
  parkingDetails?:{
    visitorParking?: boolean;
    twoWheeler?: number;
    fourWheeler?: number;
  }
  promotion?:IPromotion;
  isSponsored?: boolean;
  createdAt?: string;
  floorNumber?:number | string;
  totalFloors?:number | string;
  dimensions?: {
    length?: number;
    width?: number;
  }
  buildingName?: string;
  propertyType?: string;
  listingType?: string;
  transactionType?: string;
  locality?: string;
  priceFrom?: number;
  priceTo?: number;
  sqftRange?: {
    min?: number;
    max?: number;
  };
  projectArea?: number;
  bhk?: number | number[];
  bhkSummary?: {
    bhk: number;
    label?: string;
    bhkLabel?: string;
    units?: {
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
    }[];
  }[];
  projectSummary?: Property["bhkSummary"];
  builtUpArea?: number | {
    min?: number;
    max?: number;
  };
  gallerySummary?: {
    title?: string;
    url: string;
    category?: string;
    fileName?: string;
    order?: number;
    key?: string;
    mimetype?: string;
  }[];
  amenities?: {
    key?: string;
    title?: string;
    imageUrl?: string;
  }[];
  amenitiesCount?: number;
  type: "Residential" | "Commercial" | "Land" | "Agricultural" | "FeaturedProject";
}


export interface ApiResponse {
  __meta?: Meta;
  // your API might return either a single object or an array, so we allow both
  properties?: Property[];      // preferred: when API returns array
  property?: Property | null;   // some endpoints may return a single object
}


export interface RequestOtpPayload {
  phone: string;
}

export interface VerifyOtpPayload {
  phone: string;
  otp: string;
}

export interface VerifyOtpResponse {
  message: string;
  token: string;
  kycStatus?: string;
}

export interface VerifyPublicPropertyLeadOtpResponse {
  success: boolean;
  message: string;
  verified: boolean;
  autoLoggedIn?: boolean;
  token?: string;
  user?: {
    _id: string;
    name?: string;
    email?: string;
    phone?: string;
    roleName?: string;
    accountStatus?: string;
  };
}

export interface PublicPropertyLeadResponse {
  success: boolean;
  message: string;
  data?: {
    contactAccess?: "full" | "masked";
    ownerId?: {
      _id?: string;
      name?: string;
      phone?: string;
      email?: string;
    } | null;
    projectId?: {
      _id?: string;
      title?: string;
      price?: number;
      priceFrom?: number;
      priceTo?: number;
      createdAt?: string;
    } | null;
  };
}

export interface RequestOtpResponse {
  message: string;
}

export interface createRequestOtpPayload {
  phone: string;
}

export interface createVerifyOtpPayload {
  name: string
  companyName?: string
  email?: string
  role: "user" | "builder" | "agent"
  phone: string
  otp: string
  viewerPlanCategory?: "buy" | "rent_view"
  /** Optional header/browse city for early CCE assign (before Location step). */
  tempCity?: string
  tempState?: string
  tempLocationSource?: "header" | "geolocation" | "manual"
}

export interface Leads {
  name: string;
  phone: string;
  email: string;
  projectId: string;
  propertyType: "residentials" | "commercials" | "agriculturals" | "landplots" | "featuredprojects";
  remarks?: string;
}
