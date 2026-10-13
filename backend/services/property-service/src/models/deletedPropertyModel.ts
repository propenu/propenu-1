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
 * Full listing copy kept after a property is permanently removed.
 * Deactivated listings stay in the live collection and are not stored here.
 */
const DeletedPropertySchema = new Schema(
  {
    category: {
      type: String,
      required: true,
      enum: ["residential", "commercial", "land", "agricultural"],
      index: true,
    },
    propertyId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, default: "", index: true },
    slug: { type: String, default: "" },
    propertyCode: { type: String, default: "", index: true },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    locality: { type: String, default: "" },
    price: { type: Number },
    heroImage: { type: String, default: "" },
    createdByName: { type: String, default: "" },
    deactivatedAt: { type: Date },
    deactivatedBy: { type: ActorSchema, default: () => ({}) },
    deletedAt: { type: Date, required: true, index: true },
    deletedBy: { type: ActorSchema, default: () => ({}) },
    purgedFromLive: { type: Boolean, default: false, index: true },
    activity: { type: [ActivitySchema], default: [] },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

DeletedPropertySchema.index({ category: 1, propertyId: 1 }, { unique: true });
DeletedPropertySchema.index({ deletedAt: -1, title: 1 });

const modelName = "deletedProperty";
const DeletedProperty =
  (mongoose.models[modelName] as mongoose.Model<any>) ||
  mongoose.model(modelName, DeletedPropertySchema);

export default DeletedProperty;
