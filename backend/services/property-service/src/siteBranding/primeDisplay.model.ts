import mongoose, { Document, Model } from "mongoose";

const { Schema } = mongoose;

export const PRIME_DISPLAY_MODES = ["ranked", "shuffle"] as const;
export type PrimeDisplayMode = (typeof PRIME_DISPLAY_MODES)[number];

export interface IPrimeDisplaySettings extends Document {
  displayMode: PrimeDisplayMode;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const primeDisplaySchema = new Schema<IPrimeDisplaySettings>(
  {
    displayMode: {
      type: String,
      enum: PRIME_DISPLAY_MODES,
      default: "ranked",
      required: true,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

/** Singleton collection — at most one document. */
export const PrimeDisplaySettings: Model<IPrimeDisplaySettings> =
  mongoose.models.PrimeDisplaySettings ||
  mongoose.model<IPrimeDisplaySettings>("PrimeDisplaySettings", primeDisplaySchema);
