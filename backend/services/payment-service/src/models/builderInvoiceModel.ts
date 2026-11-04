import mongoose, { Schema, Types } from "mongoose";
import { AttachmentSchema } from "./builderProformaModel";

export const INVOICE_PAYMENT_METHODS = ["razorpay", "upi", "card", "netbanking", "cheque", "cash", "other"] as const;
export const CHEQUE_STATUSES = ["received", "deposited", "cleared", "bounced", "cancelled"] as const;

/** One money receipt against an invoice. Card entries never hold the full card number or CVV. */
const PaymentEntrySchema = new Schema(
  {
    method: { type: String, enum: INVOICE_PAYMENT_METHODS, required: true },
    amount: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, default: Date.now },
    receivedByName: { type: String, trim: true, maxlength: 120 },
    receivedById: { type: Types.ObjectId, ref: "User" },
    receiptNumber: { type: String, trim: true, maxlength: 60 },
    payerName: { type: String, trim: true, maxlength: 120 },
    transactionId: { type: String, trim: true, maxlength: 120 },

    cheque: {
      instrumentType: { type: String, enum: ["cheque", "dd"], default: undefined },
      number: { type: String, trim: true, maxlength: 30 },
      date: { type: Date },
      bankName: { type: String, trim: true, maxlength: 120 },
      branch: { type: String, trim: true, maxlength: 120 },
      ifsc: { type: String, trim: true, uppercase: true, maxlength: 15 },
      accountHolder: { type: String, trim: true, maxlength: 120 },
      status: { type: String, enum: CHEQUE_STATUSES, default: undefined },
      statusNote: { type: String, trim: true, maxlength: 300 },
      clearedAt: { type: Date },
    },
    upi: {
      upiId: { type: String, trim: true, maxlength: 120 },
      app: { type: String, trim: true, maxlength: 60 },
    },
    card: {
      cardType: { type: String, enum: ["credit", "debit", "prepaid"], default: undefined },
      network: { type: String, trim: true, maxlength: 40 },
      last4: { type: String, trim: true, match: /^\d{4}$/ },
      cardHolder: { type: String, trim: true, maxlength: 120 },
      approvalCode: { type: String, trim: true, maxlength: 40 },
      terminalId: { type: String, trim: true, maxlength: 60 },
    },
    netbanking: {
      transferMode: { type: String, enum: ["neft", "rtgs", "imps", "other"], default: undefined },
      bankName: { type: String, trim: true, maxlength: 120 },
      accountLast4: { type: String, trim: true, maxlength: 8 },
    },
    other: {
      methodName: { type: String, trim: true, maxlength: 80 },
      reference: { type: String, trim: true, maxlength: 200 },
    },

    proofs: { type: [AttachmentSchema], default: [] },
    note: { type: String, trim: true, maxlength: 1000 },
    recordedBy: { type: Types.ObjectId, ref: "User" },
    recordedByName: { type: String, trim: true },
  },
  { _id: true, timestamps: true },
);

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
      enum: INVOICE_PAYMENT_METHODS,
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

    /** Pro-forma this invoice was converted from. */
    proformaId: { type: Types.ObjectId, ref: "BuilderProforma", default: null },
    proformaNumber: { type: String, trim: true },

    /** Receipts recorded by the team; when present they drive paidAmount and paymentStatus. */
    payments: { type: [PaymentEntrySchema], default: [] },
  },
  { timestamps: true },
);

BuilderInvoiceSchema.index({ createdAt: -1, _id: -1 });
BuilderInvoiceSchema.index({ paymentStatus: 1, createdAt: -1 });
BuilderInvoiceSchema.index({ "builderDetails.state": 1, "builderDetails.city": 1, "builderDetails.locality": 1 });
BuilderInvoiceSchema.index({ userId: 1, invoiceDate: -1 });
BuilderInvoiceSchema.index({ userId: 1, createdAt: -1 });
BuilderInvoiceSchema.index({ userId: 1, propertyId: 1, createdAt: -1 });
BuilderInvoiceSchema.index({ propertyId: 1, servicePlanId: 1 });
BuilderInvoiceSchema.index({ propertyId: 1, paymentStatus: 1, endDate: -1 });

export const BuilderInvoice = mongoose.model(
  "BuilderInvoice",
  BuilderInvoiceSchema,
);
