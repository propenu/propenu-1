import mongoose, { Schema } from "mongoose";

export const DELETED_ACCESS_AREAS = [
  "properties",
  "propertyLeads",
  "projects",
  "projectLeads",
  "leadContacts",
] as const;
export type DeletedAccessArea = (typeof DELETED_ACCESS_AREAS)[number];

const ActorSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    roleName: { type: String, default: "" },
  },
  { _id: false },
);

/**
 * scope "heads": Super Admin switch for all heads (headId empty).
 * scope "team": a head's switch for staff in their reporting tree.
 */
const DeletedAccessGrantSchema = new Schema(
  {
    area: { type: String, enum: DELETED_ACCESS_AREAS, required: true },
    scope: { type: String, enum: ["heads", "team"], required: true },
    headId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    enabled: { type: Boolean, default: false },
    updatedBy: { type: ActorSchema, default: undefined },
  },
  { timestamps: true },
);

DeletedAccessGrantSchema.index({ area: 1, scope: 1, headId: 1 }, { unique: true });

const DeletedAccessLogSchema = new Schema(
  {
    area: { type: String, enum: DELETED_ACCESS_AREAS, required: true },
    scope: { type: String, enum: ["heads", "team"], required: true },
    enabled: { type: Boolean, required: true },
    actor: { type: ActorSchema, default: () => ({}) },
    at: { type: Date, required: true },
  },
  { timestamps: false },
);

DeletedAccessLogSchema.index({ at: -1 });
DeletedAccessLogSchema.index({ "actor.userId": 1, at: -1 });

const grantName = "deletedAccessGrant";
const logName = "deletedAccessLog";

export const DeletedAccessGrant =
  (mongoose.models[grantName] as mongoose.Model<any>) ||
  mongoose.model(grantName, DeletedAccessGrantSchema);

export const DeletedAccessLog =
  (mongoose.models[logName] as mongoose.Model<any>) ||
  mongoose.model(logName, DeletedAccessLogSchema);
