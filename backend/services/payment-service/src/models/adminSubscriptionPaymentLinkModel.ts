import { Schema, model, Types } from "mongoose";

const AdminSubscriptionPaymentLinkSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    userType: { type: String, enum: ["owner", "agent"], required: true },
    planId: { type: Types.ObjectId, ref: "Plan", required: true },
    planCode: { type: String, required: true },
    planName: { type: String, required: true },
    category: { type: String },
    tier: { type: String },
    durationDays: { type: Number, required: true },
    listPrice: { type: Number, required: true },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    finalPayable: { type: Number, required: true },
    gstRate: { type: Number, default: 18 },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    paymentId: { type: Types.ObjectId, ref: "Payment", required: true },
    createdBy: { type: Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["created", "paid", "expired", "cancelled"],
      default: "created",
      index: true,
    },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

AdminSubscriptionPaymentLinkSchema.index({ userId: 1, createdAt: -1 });

export const AdminSubscriptionPaymentLink = model(
  "AdminSubscriptionPaymentLink",
  AdminSubscriptionPaymentLinkSchema,
);
