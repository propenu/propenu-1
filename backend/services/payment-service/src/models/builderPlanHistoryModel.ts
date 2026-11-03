import mongoose, { Schema } from "mongoose";
import { PlanActorSchema } from "./builderPlanModel";

/** Audit trail for builder subscription plans. Kept after a plan is deleted. */
const BuilderPlanHistorySchema = new Schema(
  {
    plan: { type: Schema.Types.ObjectId, required: true },
    planCode: { type: String, required: true, trim: true },
    planTitle: { type: String, default: "" },
    action: { type: String, enum: ["created", "updated", "deleted"], required: true },
    changes: {
      type: [
        new Schema(
          {
            field: { type: String, required: true },
            label: { type: String, default: "" },
            from: { type: Schema.Types.Mixed, default: null },
            to: { type: Schema.Types.Mixed, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    actor: { type: PlanActorSchema, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

BuilderPlanHistorySchema.index({ planCode: 1, createdAt: -1 });
BuilderPlanHistorySchema.index({ createdAt: -1 });

export const BuilderPlanHistory = mongoose.model("BuilderPlanHistory", BuilderPlanHistorySchema);
