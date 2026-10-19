import mongoose, { Schema } from "mongoose";

/**
 * Builder plans and invoices are owned by the payment service (same database).
 * The property service reads them to deliver plan promotions and only writes
 * the invoice promotion status fields.
 */
const looseOptions = { strict: false, timestamps: false } as const;

const BuilderPlanReadSchema = new Schema({}, { ...looseOptions, collection: "builderplans" });

const BuilderInvoiceReadSchema = new Schema(
  {
    propertyId: { type: Schema.Types.ObjectId, index: true },
    servicePlanId: { type: Schema.Types.ObjectId },
    paymentStatus: { type: String },
    promotionStatus: { type: String },
    deliveryMode: { type: String },
    startDate: { type: Date },
    endDate: { type: Date },
    invoiceDate: { type: Date },
  },
  { ...looseOptions, collection: "builderinvoices" },
);

export const BuilderPlanRead =
  (mongoose.models.BuilderPlanRead as mongoose.Model<any>) ||
  mongoose.model("BuilderPlanRead", BuilderPlanReadSchema);

export const BuilderInvoiceRead =
  (mongoose.models.BuilderInvoiceRead as mongoose.Model<any>) ||
  mongoose.model("BuilderInvoiceRead", BuilderInvoiceReadSchema);
