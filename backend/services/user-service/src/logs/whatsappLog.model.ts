import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    to: { type: String, required: true },
    templateName: { type: String, required: true },

    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
      index: true,
    },

    error: String,

    response: mongoose.Schema.Types.Mixed,

    /** Body variables used for this send — required for retry */
    variables: { type: [String], default: undefined },
    language: { type: String },
    category: { type: String },
    headerImageUrl: { type: String },
    headerMediaId: { type: String },

    recordId: String,
    campaignId: { type: String, index: true },
    scheduledAt: { type: Date, index: true },
  },
  { timestamps: true },
);

export const WhatsAppLog = mongoose.model("WhatsAppLog", schema);
