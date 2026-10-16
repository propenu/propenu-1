import mongoose, { Schema } from "mongoose";

const ActorSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    roleName: { type: String, default: "" },
  },
  { _id: false },
);

/** Single switch: when enabled, every staff role with Leads page access sees full contacts. */
const LeadContactVisibilitySchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    updatedBy: { type: ActorSchema, default: undefined },
  },
  { timestamps: true },
);

/** One row each time the switch is turned on or off. */
const LeadContactVisibilityLogSchema = new Schema(
  {
    enabled: { type: Boolean, required: true },
    actor: { type: ActorSchema, default: () => ({}) },
    at: { type: Date, required: true, index: true },
  },
  { timestamps: false },
);

LeadContactVisibilityLogSchema.index({ at: -1 });

const settingName = "leadContactVisibility";
const logName = "leadContactVisibilityLog";

export const LeadContactVisibility =
  (mongoose.models[settingName] as mongoose.Model<any>) ||
  mongoose.model(settingName, LeadContactVisibilitySchema);

export const LeadContactVisibilityLog =
  (mongoose.models[logName] as mongoose.Model<any>) ||
  mongoose.model(logName, LeadContactVisibilityLogSchema);
