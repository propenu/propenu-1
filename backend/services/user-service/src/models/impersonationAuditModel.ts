import mongoose, { Document, Schema } from "mongoose";

export type ImpersonationAuditAction =
  | "start"
  | "exchange"
  | "stop"
  | "blocked_write";

export interface IImpersonationAudit extends Document {
  action: ImpersonationAuditAction;
  impersonatorId: string;
  impersonatorName?: string;
  targetUserId: string;
  targetName?: string;
  targetRoleName?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const ImpersonationAuditSchema = new Schema<IImpersonationAudit>(
  {
    action: {
      type: String,
      enum: ["start", "exchange", "stop", "blocked_write"],
      required: true,
      index: true,
    },
    impersonatorId: { type: String, required: true, index: true },
    impersonatorName: { type: String },
    targetUserId: { type: String, required: true, index: true },
    targetName: { type: String },
    targetRoleName: { type: String },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default (mongoose.models.ImpersonationAudit as mongoose.Model<IImpersonationAudit>) ||
  mongoose.model<IImpersonationAudit>(
    "ImpersonationAudit",
    ImpersonationAuditSchema,
  );
