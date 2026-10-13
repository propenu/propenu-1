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

const ActivitySchema = new Schema(
  {
    action: { type: String, required: true, trim: true },
    at: { type: Date, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    roleName: { type: String, default: "" },
  },
  { _id: false },
);

/**
 * Snapshot kept after a project is deactivated or permanently removed.
 * The live featured-project row can be hard-deleted; this copy stays.
 */
const DeletedProjectSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    title: { type: String, default: "", index: true },
    slug: { type: String, default: "" },
    propertyCode: { type: String, default: "", index: true },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    locality: { type: String, default: "" },
    address: { type: String, default: "" },
    categoryType: { type: String, default: "", index: true },
    propertyType: { type: String, default: "" },
    priceFrom: { type: Number },
    priceTo: { type: Number },
    heroImage: { type: String, default: "" },
    builderName: { type: String, default: "" },
    createdByName: { type: String, default: "" },
    promotionType: { type: String, default: "normal" },
    deletedAt: { type: Date, required: true, index: true },
    deletedBy: { type: ActorSchema, default: () => ({}) },
    purgedFromLive: { type: Boolean, default: false, index: true },
    activity: { type: [ActivitySchema], default: [] },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

DeletedProjectSchema.index({ deletedAt: -1, title: 1 });

const modelName = "deletedProject";
const DeletedProject =
  (mongoose.models[modelName] as mongoose.Model<any>) ||
  mongoose.model(modelName, DeletedProjectSchema);

export default DeletedProject;
