import mongoose, { Types } from "mongoose";
import Counter from "./counterModel";
import Role from "./roleModel";

export interface IUser extends mongoose.Document {
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  phoneHistory?: Array<{
    phone: string;
    changedAt: Date;
    changedBy?: Types.ObjectId;
  }>;
  locality?: string;
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
  phoneVerified?: boolean;
  welcomeEmailSent?: boolean;
  /** Extended org profile for builder accounts (RERA, GST, media, etc.). */
  builderProfile?: {
    bio?: string;
    website?: string;
    gstin?: string;
    cin?: string;
    officeLocations?: string[];
    logo?: { url?: string; key?: string } | null;
    avatar?: { url?: string; key?: string } | null;
    coverImage?: { url?: string; key?: string } | null;
    rera?: {
      reraId?: string;
      isVerified?: boolean;
      providerResponse?: any;
    };
  };
  accountStatus?: "pending" | "location_pending" | "active";
  builderId?: Types.ObjectId;
  userCode: string;
  roleId?: Types.ObjectId;
  managerId?: Types.ObjectId;
  /** Staff (usually Sales Executive) who onboarded this public user on admin. */
  onboardedBy?: Types.ObjectId;
  isActive?: boolean;
  lastLoginAt?: Date;
  lastSeenAt?: Date;
  loginCount?: number;
  fcmToken?: string | null;
  /** CCE/staff geo territories for auto-assign (additive; home locality/city/state unchanged). */
  workingLocations?: Array<{
    state: string;
    city?: string;
    locality?: string;
  }>;
  /** Exclusive follow-up owner (one CCE). Prevents same case showing to multiple CCEs. */
  followUpAssignedTo?: Types.ObjectId;
  followUpAssignedAt?: Date;
  followUpAssignMethod?: "location_round_robin" | "round_robin";
  /**
   * CCE manual work process (separate from accountStatus / journey stage).
   * Auto-set to "assigned" when a CCE is attached; CCE/TL can move to in_progress / completed.
   */
  followUpWorkStatus?: "assigned" | "in_progress" | "completed" | null;
  followUpWorkUpdatedAt?: Date | null;
  followUpWorkUpdatedBy?: Types.ObjectId | null;
  /** Required when customer support marks the case completed. */
  followUpCompletionReason?: string | null;
  /**
   * Temporary browse/header location (city+state only) used for early CCE assign
   * before the Location step. Cleared when real locality/city/state/pincode are saved.
   */
  tempCity?: string | null;
  tempState?: string | null;
  tempLocationSource?: "header" | "geolocation" | "manual" | null;
  tempLocationAt?: Date | null;
  notificationSeenAt?: {
    builder?: Date | null;
    agent?: Date | null;
    user?: Date | null;
    admin?: Date | null;
  };
}

const getCityCode = (city?: string) => {
  const normalizedCity = city?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() ?? "";

  if (normalizedCity.length < 3) {
    throw new Error(
      "City must contain at least 3 letters to generate userCode",
    );
  }

  return normalizedCity.slice(0, 3);
};

const getEntityCode = async (roleId?: Types.ObjectId | null) => {
  if (!roleId) {
    return "USR";
  }

  const role = await Role.findById(roleId).select("name").lean();
  const roleName = role?.name?.toLowerCase();

  if (roleName === "agent" || roleName === "sales_agent") {
    return "AGT";
  }

  if (roleName === "builder") {
    return "BLD";
  }

  return "USR";
};

const getCounterKey = (
  entityCode: string,
  cityCode: string,
  yearCode: string,
) => `${entityCode}_${cityCode}_${yearCode}`;

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 42,
      index: true,
    },
    companyName: {
      type: String,
      trim: true,
      maxlength: 80,
      index: true,
    },
    email: {
      type: String,
      required: true, // ✅ make this optional if you're using phone too
      unique: false,
      // @ts-ignore override legacy required flag for phone-only accounts
      required: false,
      trim: true,
      lowercase: true,
      sparse: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email"],
    },
    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
      match: [/^\+?[1-9]\d{6,14}$/, "Invalid phone number"],
    },
    phoneHistory: [
      {
        phone: {
          type: String,
          trim: true,
          required: true,
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    locality: {
      type: String,
      trim: true,
      minlength: 3,
      maxlength: 45,
      index: true,
    },
    city: {
      type: String,
      trim: true,
      minlength: 3,
      maxlength: 45,
      index: true,
    },
    userCode: {
      type: String,
      unique: true,
      index: true,
      sparse: true,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
      minlength: 3,
      maxlength: 45,
      index: true,
    },
    pincode: {
      type: String,
      trim: true,
      minlength: 3,
      maxlength: 45,
      index: true,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    welcomeEmailSent: {
      type: Boolean,
      default: false,
    },
    accountStatus: {
      type: String,
      enum: ["pending", "location_pending", "active"],
      default: "active",
    },
    isUnsubscribedToEmail: Boolean,
    address: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    builderProfile: {
      bio: { type: String, trim: true, maxlength: 2000, default: "" },
      website: { type: String, trim: true, maxlength: 200, default: "" },
      gstin: { type: String, trim: true, maxlength: 20, default: "" },
      cin: { type: String, trim: true, maxlength: 30, default: "" },
      officeLocations: { type: [String], default: [] },
      logo: {
        type: { url: String, key: String },
        default: null,
      },
      avatar: {
        type: { url: String, key: String },
        default: null,
      },
      coverImage: {
        type: { url: String, key: String },
        default: null,
      },
      rera: {
        reraId: { type: String, trim: true, default: "" },
        isVerified: { type: Boolean, default: false },
        providerResponse: { type: mongoose.Schema.Types.Mixed },
      },
    },
    builderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Builder",
      required: false,
      index: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: false,
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    onboardedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },

    /** Geo territories for CCE auto-assign. Empty city = whole state; empty locality = whole city. */
    workingLocations: [
      {
        state: { type: String, trim: true, maxlength: 45 },
        city: { type: String, trim: true, maxlength: 45 },
        locality: { type: String, trim: true, maxlength: 45 },
      },
    ],

    /** One CCE owns this user's follow-up journey (exclusive). */
    followUpAssignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    followUpAssignedAt: { type: Date },
    followUpAssignMethod: {
      type: String,
      enum: ["location_round_robin", "round_robin"],
    },

    /** CCE work process — does not replace accountStatus / journey stage. */
    followUpWorkStatus: {
      type: String,
      enum: ["assigned", "in_progress", "completed"],
      default: null,
      index: true,
    },
    followUpWorkUpdatedAt: { type: Date, default: null },
    followUpWorkUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    followUpCompletionReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    /** Header/browse city+state until Location step completes (does not replace real fields). */
    tempCity: { type: String, trim: true, maxlength: 45, default: null },
    tempState: { type: String, trim: true, maxlength: 45, default: null },
    tempLocationSource: {
      type: String,
      enum: ["header", "geolocation", "manual"],
      default: null,
    },
    tempLocationAt: { type: Date, default: null },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    /** Throttled activity stamp for online/offline presence (admin + apps). */
    lastSeenAt: { type: Date },
    loginCount: { type: Number, default: 0 },

    fcmToken: {
      type: String,
      default: null,
    },
    notificationSeenAt: {
      builder: {
        type: Date,
        default: null,
      },
      agent: {
        type: Date,
        default: null,
      },
      user: {
        type: Date,
        default: null,
      },
      admin: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true, // automatically adds createdAt & updatedAt
  },
);

// 🛡️ Require at least one of email or phone
UserSchema.path("email").validate(function () {
  return this.email || this.phone;
}, "Either email or phone is required");

UserSchema.path("phone").validate(function () {
  return this.email || this.phone;
}, "Either email or phone is required");

UserSchema.pre("save", async function (next) {
  try {
    if (this.userCode) {
      return next();
    }

    if (!this.city) {
      return next();
    }

    const yearCode = new Date().getFullYear().toString().slice(-2);
    const cityCode = getCityCode(this.city);
    const entityCode = await getEntityCode(this.roleId);
    const counterKey = getCounterKey(entityCode, cityCode, yearCode);

    const counter = await Counter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    this.userCode = `P${yearCode}${cityCode}${entityCode}${String(counter.seq).padStart(6, "0")}`;

    next();
  } catch (error) {
    next(error as Error);
  }
});

UserSchema.index({ roleId: 1, createdAt: -1 });
UserSchema.index({ lastLoginAt: -1 });

// ✅ Use ESM export, not CommonJS
const User = mongoose.model<IUser>("User", UserSchema);
export default User;
