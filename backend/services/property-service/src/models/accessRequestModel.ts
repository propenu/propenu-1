import mongoose, { Schema } from "mongoose";
import { DELETED_ACCESS_AREAS } from "./deletedAccessModel";

export const ACCESS_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

const PersonSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    roleName: { type: String, default: "" },
  },
  { _id: false },
);

/**
 * A head asks Super Admin (scope "heads"); staff ask the nearest head above them (scope "team").
 * Each request is mirrored as a ticket in ticket-service.
 */
const AccessRequestSchema = new Schema(
  {
    area: { type: String, enum: DELETED_ACCESS_AREAS, required: true },
    scope: { type: String, enum: ["heads", "team"], required: true },
    requester: { type: PersonSchema, required: true },
    approver: { type: PersonSchema, required: true },
    reason: { type: String, default: "", maxlength: 500 },
    status: { type: String, enum: ACCESS_REQUEST_STATUSES, default: "pending" },
    ticketId: { type: String, default: "" },
    ticketCode: { type: String, default: "" },
    decidedBy: { type: PersonSchema, default: undefined },
    decidedAt: { type: Date },
    decisionNote: { type: String, default: "" },
  },
  { timestamps: true },
);

AccessRequestSchema.index({ status: 1, area: 1, scope: 1 });
AccessRequestSchema.index({ "requester.userId": 1, status: 1, createdAt: -1 });
AccessRequestSchema.index({ "approver.userId": 1, status: 1, createdAt: -1 });
AccessRequestSchema.index({ ticketId: 1 });

const modelName = "accessRequest";

export const AccessRequest =
  (mongoose.models[modelName] as mongoose.Model<any>) ||
  mongoose.model(modelName, AccessRequestSchema);
