// src/routes/residentialRoutes.ts
import express from "express";
import multer from "multer";
import { validateBody } from "../middlewares/validate";
import { parseJsonFields } from "../middlewares/parseJsonFields";
import fallbackCoerceDefault from "../middlewares/fallbackCoerce";
import { ResidentialCreateSchema, ResidentialUpdateSchema } from "../zod/residentialZod";
import { approveProperty, createResidential, createResidentialDraft, deactivateProperty, deleteGalleryImage, deleteResidential, editResidential, finalizeResidential, getAllResidential, getAllResidentialDraftsForAdmin, getMyResidentialDraft, getResidentialBySlug, getResidentialDetail, updateBasicStep, updateDetailsStep, updateLocationStep, verifyResidentialDocument } from "../controller/residentialController";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";
import { authMiddleware, AuthRequest } from "../middlewares/authMiddleware";
import { uploadMedia } from "../middlewares/multer";
import { requirePermission } from "../middlewares/requirePermission";
import { createListingPromotionHandlers } from "../controller/listingPromotionController";
import { blockBuilderPropertyPosting } from "../middlewares/blockRoles";

const router = express.Router();
const listingPromo = createListingPromotionHandlers("residential");

/** json keys that arrive as JSON strings and need parsing */
const jsonKeys = [
  "specifications",
  "amenities",
  "nearbyPlaces",
  "gallery",
  "documents",
  "leads",
  "location",
  "legalChecks",
  "parkingDetails",
  "security",
  "fireSafetyDetails",
  "greenCertification",
  "smartHomeFeatures",
  "relatedProjects", 
  "approval",
  "promotion",
];


router.get("/draft/all", getAllResidentialDraftsForAdmin);
router.post("/draft", authMiddleware, blockBuilderPropertyPosting, createResidentialDraft);
router.get("/draft/me", authMiddleware, getMyResidentialDraft);
router.patch("/:id/basic", authMiddleware, blockBuilderPropertyPosting, uploadMedia, parseJsonFields(jsonKeys), updateBasicStep);
router.patch("/:id/location", authMiddleware, blockBuilderPropertyPosting, parseJsonFields(jsonKeys), updateLocationStep);
router.patch("/:id/details", authMiddleware, blockBuilderPropertyPosting, uploadMedia, parseJsonFields(jsonKeys), updateDetailsStep);
router.patch("/:id/verification", authMiddleware, blockBuilderPropertyPosting, uploadMedia, parseJsonFields(jsonKeys), finalizeResidential);
router.patch("/:id/verify-document", authMiddleware, requirePermission("residential:verify_document"), verifyResidentialDocument);

router.patch("/:id/promote", authMiddleware, listingPromo.promote);
router.patch("/:id/renew", authMiddleware, listingPromo.renew);
router.patch("/:id/expire", authMiddleware, listingPromo.expire);
router.patch("/:id/reset", authMiddleware, listingPromo.reset);

router.post("/:id/approve",  approveProperty);
router.post("/:id/deactive", authMiddleware, deactivateProperty );
router.delete("/:id/gallery/:imageIndex", authMiddleware, deleteGalleryImage);



router.post("/", authMiddleware, blockBuilderPropertyPosting, uploadMedia,parseJsonFields(jsonKeys), fallbackCoerceDefault,  validateBody(ResidentialCreateSchema), createResidential, requireActiveSubscription);
router.patch("/:id", authMiddleware, uploadMedia, parseJsonFields(jsonKeys), fallbackCoerceDefault, validateBody(ResidentialUpdateSchema), editResidential );
router.get("/", getAllResidential);
router.get("/slug/:slug", getResidentialBySlug);
router.get("/:id", getResidentialDetail);
router.delete("/:id", deleteResidential);

export default router;
