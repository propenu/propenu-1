import mongoose, { Schema } from "mongoose";
import { Agent } from "../types/agent";

// ================= SCHEMA =================

const AgentSchema = new Schema<Agent>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    name: {
      type: String,
      default: "",
      trim: true,
    },

    slug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },

    avatar: {
      type: {
        url: String,
        key: String,
      },
      default: null,
    },

    coverImage: {
      type: {
        url: String,
        key: String,
      },
      default: null,
    },

    bio: { type: String, default: "" },
    agencyName: { type: String, default: "" },
    licenseNumber: { type: String, default: "" },
    licenseValidTill: Date,

    areasServed: { type: [String], default: [] },

    locality: {
      type: String,
      trim: true,
      default: "",
    },

    city: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    experienceYears: { type: Number, default: 0 },
    dealsClosed: { type: Number, default: 0 },

    languages: { type: [String], default: [] },

    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    verificationDocuments: [
      {
        type: { type: String },
        url: String,
        providerResponse: Schema.Types.Mixed,
        status: String,
      },
    ],

    rera: {
      reraAgentId: { type: String, default: "" },
      providerResponse: Schema.Types.Mixed,
      isVerified: { type: Boolean, default: false },
    },

    stats: {
      totalProperties: { type: Number, default: 0 },
      publishedCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// ================= SLUG GENERATION =================

const slugify = (value?: string) =>
  (value ?? "")
    ?.toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");

AgentSchema.pre("save", function (next) {
  if (!this.slug) {
    this.slug = slugify(this.name) || `agent-${this._id}`;
  } else {
    this.slug = slugify(this.slug) || `agent-${this._id}`;
  }
  next();
});

// ================= SAFE UNIQUE SLUG =================

AgentSchema.pre("save", async function (next) {
  if (!this.slug) return next();

  const baseSlug = this.slug;
  let candidate = baseSlug;
  let suffix = 2;

  while (
    await (this.constructor as any).exists({
      slug: candidate,
      _id: { $ne: this._id },
    })
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  this.slug = candidate;

  next();
});

// ================= MODEL =================

const AgentModel = mongoose.model<Agent>("Agent", AgentSchema);

export default AgentModel;
