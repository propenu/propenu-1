import mongoose, { Schema, Types } from "mongoose";

export const PROFORMA_STATUSES = ["draft", "sent", "accepted", "converted", "cancelled"] as const;

const ProformaItemSchema = new Schema(
  {
    productName: { type: String, required: true, trim: true, maxlength: 200 },
    sacCode: { type: String, trim: true, maxlength: 20, default: "998362" },
    qty: { type: Number, min: 0, default: 1 },
    days: { type: Number, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

export const AttachmentSchema = new Schema(
  {
    name: { type: String, trim: true },
    url: { type: String, required: true, trim: true },
    key: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number, min: 0 },
    label: { type: String, trim: true, maxlength: 120 },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: Types.ObjectId, ref: "User" },
    uploadedByName: { type: String, trim: true },
  },
  { _id: true },
);

const ClientSchema = new Schema(
  {
    name: { type: String, trim: true },
    companyName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    userCode: { type: String, trim: true },
    address: { type: String, trim: true },
    locality: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 20 },
  },
  { _id: false },
);

const BuilderProformaSchema = new Schema(
  {
    proformaNumber: { type: String, required: true, unique: true, trim: true, index: true },
    proformaDate: { type: Date, required: true, default: Date.now },
    validUntil: { type: Date },

    /** Optional: a pro-forma can be raised for a lead who is not yet a builder user. */
    userId: { type: Types.ObjectId, ref: "User", default: null, index: true },
    client: { type: ClientSchema, default: {} },

    propertyId: { type: Types.ObjectId, ref: "featuredProject", default: null, index: true },
    projectName: { type: String, trim: true },
    projectCode: { type: String, trim: true },

    servicePlanId: { type: Types.ObjectId, ref: "BuilderPlan", default: null },
    servicePlanName: { type: String, trim: true },

    items: { type: [ProformaItemSchema], default: [] },
    subtotalAmount: { type: Number, min: 0, default: 0 },
    gstRate: { type: Number, min: 0, max: 100, default: 18 },
    gstAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, default: 0 },

    notes: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: PROFORMA_STATUSES, default: "draft", index: true },
    attachments: { type: [AttachmentSchema], default: [] },

    convertedInvoiceId: { type: Types.ObjectId, ref: "BuilderInvoice", default: null },
    convertedAt: { type: Date },

    createdBy: { type: Types.ObjectId, ref: "User" },
    createdByName: { type: String, trim: true },
    updatedBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

BuilderProformaSchema.index({ createdAt: -1, _id: -1 });
BuilderProformaSchema.index({ status: 1, createdAt: -1 });

export const BuilderProforma = mongoose.model("BuilderProforma", BuilderProformaSchema);
