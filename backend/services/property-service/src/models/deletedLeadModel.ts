import mongoose, { Schema } from "mongoose";

const ActorSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    roleName: { type: String, default: "" },
    at: { type: Date },
  },
  { _id: false },
);

/**
 * Copy of a lead after it is removed from the live lead lists.
 * One row per deleted lead, including when a whole project is cleared.
 */
const DeletedLeadSchema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, index: true },
    projectId: { type: Schema.Types.ObjectId, index: true },
    projectTitle: { type: String, default: "", index: true },
    propertyType: { type: String, default: "" },
    listingKind: {
      type: String,
      enum: ["project", "property"],
      default: "project",
      index: true,
    },
    name: { type: String, default: "", index: true },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    status: { type: String, default: "" },
    source: { type: String, default: "" },
    message: { type: String, default: "" },
    purchaseTimeline: { type: String, default: "" },
    budgetRange: { type: String, default: "" },
    leadCreatedAt: { type: Date },
    importedBy: { type: ActorSchema, default: undefined },
    deletionType: {
      type: String,
      enum: ["single", "bulk"],
      required: true,
      index: true,
    },
    deletedAt: { type: Date, required: true, index: true },
    deletedBy: { type: ActorSchema, default: () => ({}) },
  },
  { timestamps: true },
);

DeletedLeadSchema.index({ deletedAt: -1, name: 1 });

const modelName = "deletedLead";
const DeletedLead =
  (mongoose.models[modelName] as mongoose.Model<any>) ||
  mongoose.model(modelName, DeletedLeadSchema);

export default DeletedLead;
