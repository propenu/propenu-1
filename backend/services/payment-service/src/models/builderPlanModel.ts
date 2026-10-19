import mongoose, { Schema } from "mongoose";

const BuilderPlanSchema = new Schema(
  {
    code: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    discount: {
      type: Number,
      default: 0,
      min: 0,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    /** Derived from mainPlacement + sponsoredEnabled; kept for older readers. */
    promotionType: {
      type: String,
      required: true,
      trim: true,
    },

    /** Prime / Top Selling section, or none (Sponsored only / listing plan). */
    mainPlacement: {
      type: String,
      enum: ["none", "prime", "featured"],
    },

    sponsoredEnabled: {
      type: Boolean,
      default: false,
    },

    /**
     * all_india: every saved location · team_picks: team chooses when starting ·
     * fixed: coverage stored on the plan. project_city is legacy only (not accepted on new plans).
     */
    locationRule: {
      type: String,
      enum: ["project_city", "all_india", "team_picks", "fixed"],
      default: "project_city",
    },

    /** { state: { city: localities[] } } — used only when locationRule is "fixed". */
    mainCoverage: {
      type: Schema.Types.Mixed,
      default: {},
    },

    sponsoredSameAsMain: {
      type: Boolean,
      default: true,
    },

    sponsoredAd: {
      type: Schema.Types.Mixed,
      default: {},
    },

    visibleLeadLimit: {
      type: Number,
      default: 0,
      min: 0,
    },

    /** auto: promotion starts when the invoice is paid · team: waits for the one-button start. */
    startMode: {
      type: String,
      enum: ["auto", "team"],
      default: "auto",
    },

    finalPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    durationDays: {
      type: Number,
      default: 30,
      min: 1,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const LEGACY_PLACEMENT: Record<string, { main: string; sponsored: boolean }> = {
  prime: { main: "prime", sponsored: false },
  featured: { main: "featured", sponsored: false },
  sponsored: { main: "none", sponsored: true },
  normal: { main: "none", sponsored: false },
};

BuilderPlanSchema.pre("validate", function () {
  this.finalPrice = Math.max(this.price - this.discount, 0);

  if (!this.mainPlacement) {
    const legacy =
      LEGACY_PLACEMENT[String(this.promotionType || "normal").toLowerCase()] ||
      LEGACY_PLACEMENT.normal!;
    this.mainPlacement = legacy.main as any;
    this.sponsoredEnabled = legacy.sponsored;
  }

  this.promotionType =
    this.mainPlacement === "prime" || this.mainPlacement === "featured"
      ? this.mainPlacement
      : this.sponsoredEnabled
        ? "sponsored"
        : "normal";

  const hasMain = this.mainPlacement !== "none";
  const hasPromotion = hasMain || this.sponsoredEnabled;
  if (
    hasPromotion &&
    this.locationRule === "project_city" &&
    (this.isNew || this.isModified("locationRule") || this.isModified("mainPlacement") || this.isModified("sponsoredEnabled"))
  ) {
    throw new Error("Choose which cities this plan runs in: All India, Team chooses or Selected cities");
  }

  if (this.locationRule !== "fixed") {
    this.mainCoverage = {};
    this.sponsoredAd = {};
    return;
  }

  const isEmpty = (map: unknown) =>
    !map || typeof map !== "object" || Object.keys(map as object).length === 0;
  if (!hasMain) this.mainCoverage = {};
  if (hasMain && isEmpty(this.mainCoverage)) {
    throw new Error("Pick at least one city for the homepage spot");
  }
  if (this.sponsoredEnabled && hasMain && this.sponsoredSameAsMain) {
    if (isEmpty(this.mainCoverage)) {
      throw new Error("Pick at least one plan location to share with Sponsored");
    }
    this.sponsoredAd = this.mainCoverage;
  }
  if (this.sponsoredEnabled && isEmpty(this.sponsoredAd)) {
    throw new Error("Pick at least one Sponsored location for this plan");
  }
  if (!this.sponsoredEnabled) this.sponsoredAd = {};
});

export const BuilderPlan = mongoose.model("BuilderPlan", BuilderPlanSchema);
