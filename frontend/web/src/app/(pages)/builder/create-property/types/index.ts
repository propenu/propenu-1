export interface IUnit {
  minSqft?: number;
  maxPrice?: number;
  availableCount?: number;
  plan?: {
    url?: string;
    key?: string;
    filename?: string;
    mimetype?: string;
  };
}

export interface IBhkSummary {
  bhk: number;
  bhkLabel?: string;
  units?: IUnit[];
}

export interface IGalleryItem {
  url: string | File;
  order?: number;
  title?: string;
  category?: string;
}

export interface IAboutSummary {
  builderName?: string;
  aboutDescription?: string;
  url?: string | File;
  rightContent: string;
  key?: string;
  filename?: string;
  mimetype?: string;
}

export interface IBrochure {
  key?: string;
  url?: string | File;
  filename?: string;
  mimetype?: string;
}

export interface IAmenity {
  key: string;
  title: string;
  category?: "Sports" | "Convenience" | "Safety" | "Environment" | string;
  icon?: string;
  description?: string;
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
  name: string;
  type: string;
  distanceText?: string;
  coordinates?: [number, number]; // [lng, lat]
  order?: number;
}

export interface ILogo {
  url?: string | File;
  key?: string;
  filename?: string;
  mimetype?: string;
}

export interface IFeaturedProject {
  _id?: string;
  title: string;
  slug?: string;
  logo?: ILogo;
  heroImage?: string | File;
  heroVideo?: string;
  heroTagline?: string;
  heroSubTagline?: string;
  heroDescription?: string;
  color?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  address: string;
  city: string;
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  mapEmbedUrl?: string;
  currency?: string;
  priceFrom?: number;
  priceTo?: number;
  bhkSummary?: IBhkSummary[];
  sqftRange?: {
    min?: number;
    max?: number;
  };
  possessionDate?: string;
  launchDate?: string;
  totalTowers?: number;
  totalFloors?: string;
  projectArea?: number;
  totalUnits?: number;
  availableUnits?: number;
  reraNumber?: string;
  banksApproved?: string[];
  gallerySummary?: IGalleryItem[];
  aboutSummary?: IAboutSummary[];
  brochure?: IBrochure;
  specifications?: ISpecification[];
  amenities?: IAmenity[];
  nearbyPlaces?: INearbyPlace[];
  isFeatured?: boolean;
  rank?: number;
  status?: 'active' | 'inactive' | 'archived';
  createdBy?: string;
}

export interface ICreatePropertyFormState extends IFeaturedProject {
  currentStep: number;
}

export const STEPS = [
  { id: 1, label: 'Basic Details' },
  { id: 2, label: 'Hero' },
  { id: 3, label: 'BHK Details' },
  { id: 4, label: 'Amenities' },
  { id: 5, label: 'Media' },
  { id: 6, label: 'About' },
  { id: 7, label: 'Location' },
  { id: 8, label: 'Property Profile' },
  { id: 9, label: 'SEO' },
];
