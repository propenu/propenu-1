// src/routes/featurePropertiesRoute.ts
import express, { Request, Response } from "express";
import multer from "multer";
import { createFeatureProperties, deleteFeatureGalleryImage, deleteFeatureProperties, permanentlyDeleteFeatureProperties, editFeatureProperties, getAllFeatureProperties, getCityFeatureProperties, getFeatureBySlug,getIndetailFeatureProperties, getSearchFeatureProperties, incrementFeatureClicks, getFeaturedLocationOptions, getProjectBoardFilterOptions,
} from "../controller/featurePropertiesController";
import {
  CreateFeaturePropertySchema,
  UpdateFeaturePropertySchema,
} from "../zod/validation";
import { validateBody } from "../middlewares/validate";
import { parseJsonFields } from "../middlewares/parseJsonFields";
import fallbackCoerceDefault from "../middlewares/fallbackCoerce";
import { authMiddleware } from "../middlewares/authMiddleware";
import { requirePermission } from "../middlewares/requirePermission";
import { expirePromotion, promoteProperty, renewPromotion, resetPromotion } from "../controller/promotionController";
import { uploadMedia } from "../middlewares/multer";
import builderOnboardingRoute from "./builderOnboardingRoute";

const router = express.Router();

// Draft + builder onboarding (must stay before generic "/:id" routes)
router.use(builderOnboardingRoute);

const upload = multer({ storage: multer.memoryStorage() });

// const cpUpload = upload.fields([
//   { name: "heroImage", maxCount: 1 },
//   { name: "heroVideo", maxCount: 1 },
//   { name: "galleryFiles", maxCount: 50 },
//   { name: "bhkPlanFiles", maxCount: 50 },
//   { name: "aboutImage", maxCount: 1 },
//   { name: "logo", maxCount: 1 },
//   { name: "brochure", maxCount: 1 }, 
// ]);

const jsonKeys = [
  "bhkSummary",
  "projectSummary",
  "specifications",
  "amenities",
  "nearbyPlaces",
  "gallerySummary",
  "sqftRange",
  "area",
  "leads",
  "banksApproved",
  "location",
  "city",
  "aboutSummary",
  "youtubeVideos"
];



router.post("/",  uploadMedia, parseJsonFields(jsonKeys), authMiddleware, requirePermission("project:create", [
  "builder",
  "sales_manager",
  "sales_agent",
  "sales_executive",
  "customer_care",
  "customer_care_executive",
  "customer_care_executives",
  "relationship_manager",
  "regional_manager",
  "operations_head",
  "business_development_head",
  "ceo",
  "team_lead",
]), fallbackCoerceDefault, validateBody(CreateFeaturePropertySchema),
  createFeatureProperties
);

// Promotion lifecycle MUST stay before generic PATCH /:id
router.patch("/:id/promote", authMiddleware, promoteProperty);
router.patch("/:id/renew", authMiddleware, renewPromotion);
router.patch("/:id/expire", authMiddleware, expirePromotion);
router.patch("/:id/reset", authMiddleware, resetPromotion);

router.patch("/:id", uploadMedia, parseJsonFields(jsonKeys), authMiddleware, requirePermission("project:edit", ["builder", "sales_manager"]), fallbackCoerceDefault, validateBody(UpdateFeaturePropertySchema),
editFeatureProperties
);

// router.get("/analytics", );
router.get("/", getAllFeatureProperties);
router.get("/location-options", getFeaturedLocationOptions);
router.get("/filter-options", getProjectBoardFilterOptions);
router.get("/city", getCityFeatureProperties);
router.get("/search", getSearchFeatureProperties);
router.get("/slug/:slug", getFeatureBySlug);
router.get("/:id", getIndetailFeatureProperties);
router.post("/:id/click", incrementFeatureClicks);
router.delete("/:id/gallery/:imageIndex", authMiddleware, deleteFeatureGalleryImage);
router.delete("/:id/permanent", authMiddleware, permanentlyDeleteFeatureProperties);
router.delete("/:id", authMiddleware, deleteFeatureProperties);

export default router;
