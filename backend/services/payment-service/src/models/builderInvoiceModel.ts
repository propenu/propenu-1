import mongoose, { Schema, Types } from "mongoose";

const BuilderDetailsSchema = new Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    companyName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    userCode: {
      type: String,
      trim: true,
    },
    locality: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const BuilderInvoiceSchema = new Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    invoiceDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    builderDetails: {
      type: BuilderDetailsSchema,
      default: {},
    },

    propertyId: {
      type: Types.ObjectId,
      ref: "featuredProject",
      required: true,
      index: true,
    },

    propertyTitle: {
      type: String,
      trim: true,
    },

    projectCode: {
      type: String,
      trim: true,
      index: true,
    },

    servicePlanId: {
      type: Types.ObjectId,
      ref: "BuilderPlan",
      required: true,
      index: true,
    },

    servicePlanName: {
      type: String,
      required: true,
      trim: true,
    },

    serviceType: {
      type: String,
      required: true,
      trim: true,
    },

    timePeriod: {
      type: String,
      required: true,
      trim: true,
    },

    startDate: {
      type: Date,
    },

    endDate: {
      type: Date,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    subtotalAmount: {
      type: Number,
      min: 0,
    },

    discountType: {
      type: String,
      default: "percentage",
      trim: true,
    },

    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    gstRate: {
      type: Number,
      default: 0,
      min: 0,
    },

    gstAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    paidAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentMethod: {
      type: String,
      required: true,
      enum: ["razorpay", "upi", "card", "netbanking", "cheque", "cash"],
      trim: true,
    },

    paymentStatus: {
      type: String,
      required: true,
      enum: ["pending", "paid", "partial", "failed"],
      default: "pending",
      index: true,
    },

    paymentId: {
      type: String,
      trim: true,
    },

    orderId: {
      type: String,
      trim: true,
    },

    /** Paid invoice this one extends; its period starts where that one ends. */
    renewalOf: {
      type: Types.ObjectId,
      ref: "BuilderInvoice",
      default: null,
    },

    /** Promotion package as sold; later plan edits don't change this invoice. */
    planSnapshot: {
      type: Schema.Types.Mixed,
      default: undefined,
    },

    /** auto: starts when paid · team: waits for "Start from plan" on the project card. */
    deliveryMode: {
      type: String,
      enum: ["auto", "team"],
      default: "auto",
    },

    /** Maintained by the property service's plan promotion sync. */
    promotionStatus: {
      type: String,
      enum: [
        "not_started",
        "waiting_payment",
        "waiting_approval",
        "waiting_team",
        "scheduled",
        "running",
        "ended",
        "cancelled",
      ],
      default: "not_started",
      index: true,
    },
    promotionNote: { type: String, trim: true },
    promotionStartedAt: { type: Date },
    promotionEndedAt: { type: Date },
  },
  { timestamps: true },
);

BuilderInvoiceSchema.index({ userId: 1, invoiceDate: -1 });
BuilderInvoiceSchema.index({ propertyId: 1, servicePlanId: 1 });
BuilderInvoiceSchema.index({ propertyId: 1, paymentStatus: 1, endDate: -1 });

export const BuilderInvoice = mongoose.model(
  "BuilderInvoice",
  BuilderInvoiceSchema,
);
