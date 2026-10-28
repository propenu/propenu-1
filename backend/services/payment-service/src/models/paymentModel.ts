// models/payment.model.ts
import { Schema, model, Types } from "mongoose";

const PaymentSchema = new Schema(
  {
    
    userId: { type: Types.ObjectId, ref: "User", required: true },
    subscriptionId: Types.ObjectId,
    userType: String,
    paymentType: {
      type: String,
      enum: ["new", "upgrade", "renewal", "downgrade"],
      default: "new",
    },
    oldPlanCode: {
      type: String,
    },
    newPlanCode: {
      type: String,
    },
    creditAdjusted: {
      type: Number,
      default: 0,
    },
    remainingDays: {
      type: Number,
      default: 0,
    },
    finalPayable: {
      type: Number,
      default: 0,
    },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    adminCreatedBy: { type: Types.ObjectId, ref: "User" },
    adminPaymentLinkId: { type: Types.ObjectId, ref: "AdminSubscriptionPaymentLink", index: true },
    provider: { type: String, default: "razorpay" },
    orderId: String,
    paymentId: String,
    orderNumber: { type: String, unique: true, index: true },
    invoiceNumber: { type: String, unique: true, sparse: true, index: true },
    planId: {
      type: Types.ObjectId,
      ref: "Plan", // 👈 needed for populate
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    amount: Number,
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["created", "paid", "failed"],
      default: "created",
    },
  },

  { timestamps: true },
);

PaymentSchema.index({ status: 1, createdAt: -1 });

export const Payment = model("Payment", PaymentSchema);
