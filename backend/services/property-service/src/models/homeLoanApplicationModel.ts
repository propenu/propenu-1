import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type HomeLoanApplicationStatus =
  | "new"
  | "contacted"
  | "follow_up"
  | "converted"
  | "closed";

export interface IHomeLoanApplicationDocument extends Document {
  userId?: Types.ObjectId | null;
  fullName: string;
  mobileNumber: string;
  email?: string | null;
  source: string;
  pageUrl?: string | null;
  status: HomeLoanApplicationStatus;
  assignedTo?: Types.ObjectId | null;
  assignedAt?: Date | null;
  assignMethod?: "location_round_robin" | "round_robin" | "existing_owner" | null;
  completionReason?: string | null;
  notes: Array<{
    text: string;
    createdBy?: Types.ObjectId | null;
    createdAt: Date;
  }>;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const noteSchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const homeLoanApplicationSchema = new Schema<IHomeLoanApplicationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    fullName: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
      match: /^[6-9]\d{9}$/,
      index: true,
    },
    email: { type: String, trim: true, lowercase: true, default: null },
    source: { type: String, required: true, trim: true, default: "home_loans", index: true },
    pageUrl: { type: String, trim: true, maxlength: 2048, default: null },
    status: {
      type: String,
      enum: ["new", "contacted", "follow_up", "converted", "closed"],
      default: "new",
      index: true,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    assignedAt: { type: Date, default: null },
    assignMethod: {
      type: String,
      enum: ["location_round_robin", "round_robin", "existing_owner"],
      default: undefined,
    },
    completionReason: { type: String, trim: true, maxlength: 500, default: null },
    notes: { type: [noteSchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    collection: "homeLoanApplications",
    timestamps: true,
    minimize: true,
  },
);

homeLoanApplicationSchema.index({ createdAt: -1 });
homeLoanApplicationSchema.index({ status: 1, createdAt: -1 });
homeLoanApplicationSchema.index({ assignedTo: 1, createdAt: -1 });
homeLoanApplicationSchema.index({ userId: 1, createdAt: -1 });

const HomeLoanApplication: Model<IHomeLoanApplicationDocument> =
  (mongoose.models.HomeLoanApplication as Model<IHomeLoanApplicationDocument>) ||
  mongoose.model<IHomeLoanApplicationDocument>(
    "HomeLoanApplication",
    homeLoanApplicationSchema,
  );

export default HomeLoanApplication;
