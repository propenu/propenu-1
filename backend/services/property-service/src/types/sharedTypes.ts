// ../types/sharedTypes.ts
import type { IndexDefinition } from 'mongoose';
import { Types } from 'mongoose';


/* -------------------------
   COMMON ENUMS / TYPES
   ------------------------- */
export type ListingType = 'sale' | 'rent' | 'lease';
export type AreaUnit = 'sqft' | 'sqmt' | 'sqyd' | 'acre' | 'guntha' | 'kanal' | 'hectare';
export type FurnishingStatus = 'unfurnished' | 'semi-furnished' | 'fully-furnished';
export type ConstructionStatus = 'ready-to-move' | 'under-construction';
export type PropertyStatus = 'active' | 'inactive' | 'archived';

export type VerificationType =
  | "ENCUMBRANCE_CERTIFICATE"
  | "MUNICIPAL_TAX"
  | "UTILITY_BILL"
  | "SALE_DEED";


export interface IVerificationDoc {
  type?: string;        // EC / Sale Deed / Tax etc
  title?: string;       // Display label
  url?: string;
  key?: string;
  filename?: string;
  mimetype?: string;
    status?: "pending" | "verified" | "rejected";

}



export const TEXT_INDEX_FIELDS: IndexDefinition = {
  title: 'text',
  address: 'text',
  city: 'text',
};


export interface IBaseListing {
  title: string;
  slug?: string;         // optional because you generate it in pre('validate')
  propertyCode?: string;
  address?: string;
  locality?:string;
  city?: string;
   state?: string;
  pincode?: string;
   updatedBy?: Types.ObjectId;
  location?: {
    type: "Point";
    coordinates: [number, number];
  };
  listingType: 'sale' | 'rent' | 'lease';
  listingSource?: string;
  createdBy?: Types.ObjectId;
  followUpAssignedTo?: Types.ObjectId | null;
  followUpAssignedAt?: Date | null;
  followUpWorkStatus?: "assigned" | "in_progress" | "completed" | null;
  followUpWorkUpdatedAt?: Date | null;
  followUpWorkUpdatedBy?: Types.ObjectId | null;
  followUpCompletionReason?: string | null;
  relationshipManager?: {
    userId?: Types.ObjectId | string | null;
    designation?: string;
    availability?: string;
    responseTime?: string;
  } | null;
  relationshipManagerId?: Types.ObjectId | string | null;
}




/* -------------------------
   FILE / MEDIA SCHEMAS
   ------------------------- */
export interface IFileRef {
  title?: string;
  url?: string;
  key?: string;
  filename?: string;
  mimetype?: string;
  uploadedAt?: Date;
}



export interface IImage {
  url: string;
  key?: string;
  filename?: string;
  mimetype?: string;
  order?: number;
  caption?: string;
}

export interface IUserAuditInfo {
  userId?: Types.ObjectId;
  name?: string;
  email?: string;
  roleName?: string;
}

export interface IListingAuditFields {
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  rejectedReason?: string;
  postedBy?: IUserAuditInfo & {
    postedAt?: Date;
  };
  lastUpdatedBy?: IUserAuditInfo & {
    updatedAt?: Date;
  };
  updateCount?: number;
  updateHistory?: (IUserAuditInfo & {
    updatedAt?: Date;
  })[];
}
