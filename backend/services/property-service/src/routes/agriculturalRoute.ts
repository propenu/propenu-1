// src/routes/agriculturalRoutes.ts
import express from "express";
import multer from "multer";
import { parseJsonFields } from "../middlewares/parseJsonFields";
import fallbackCoerceDefault from "../middlewares/fallbackCoerce";
import { validateBody } from "../middlewares/validate";
import { AgriculturalCreateSchema, AgriculturalUpdateSchema } from "../zod/agriculturalZod";
import { approveAgriculturalProperty, createAgricultural, createAgriculturalDraft, deactivateAgriculturalProperty, deleteAgricultural, deleteAgriculturalGalleryImage, editAgricultural, finalizeAgricultural, getAgriculturalBySlug, getAgriculturalDetail, getAllAgricultural, getAllAgriculturalDraftsForAdmin, getMyAgriculturalDraft, updateAgriculturalBasicStep, updateAgriculturalDetailsStep, updateAgriculturalLocationStep, verifyAgricultiralDocument } from "../controller/agriculturalController";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";
import { authMiddleware, AuthRequest } from "../middlewares/authMiddleware";
import { uploadMedia } from "../middlewares/multer";
import { requirePermission } from "../middlewares/requirePermission";
import { createListingPromotionHandlers } from "../controller/listingPromotionController";
import { blockBuilderPropertyPosting } from "../middlewares/blockRoles";
const router = express.Router();
const listingPromo = createListingPromotionHandlers("agricultural");



/** keys that may arrive as JSON strings (multipart/form-data) */
const jsonKeys = [
  "gallery",
  "documents",
  "borewellDetails",
  "totalArea",
  "roadWidth",
  "leads",
  "location",
  "legalChecks",
  "approval",
  "promotion",
];

router.post(
  "/",
  authMiddleware,
  blockBuilderPropertyPosting,
  uploadMedia,
  parseJsonFields(jsonKeys),
  fallbackCoerceDefault,
  validateBody(AgriculturalCreateSchema),
  requireActiveSubscription,
  createAgricultural
);

// Promotion lifecycle MUST stay before generic PATCH /:id
router.patch("/:id/promote", authMiddleware, listingPromo.promote);
router.patch("/:id/renew", authMiddleware, listingPromo.renew);
router.patch("/:id/expire", authMiddleware, listingPromo.expire);
router.patch("/:id/reset", authMiddleware, listingPromo.reset);

router.patch(
  "/:id",
  uploadMedia,
  parseJsonFields(jsonKeys),
  fallbackCoerceDefault,
  validateBody(AgriculturalUpdateSchema),
  editAgricultural
);


router.get("/draft/me", authMiddleware, getMyAgriculturalDraft)
router.get("/draft/all", getAllAgriculturalDraftsForAdmin);

router.get("/", getAllAgricultural);
router.get("/slug/:slug", getAgriculturalBySlug);
router.get("/:id", getAgriculturalDetail);
router.delete("/:id", deleteAgricultural);

router.post("/draft", authMiddleware, blockBuilderPropertyPosting, createAgriculturalDraft);
router.patch(
  "/:id/basic",
  authMiddleware,
  blockBuilderPropertyPosting,
  uploadMedia,
  parseJsonFields(jsonKeys),
  updateAgriculturalBasicStep,
);
router.patch("/:id/location",authMiddleware, blockBuilderPropertyPosting,parseJsonFields(jsonKeys),updateAgriculturalLocationStep,);
router.patch("/:id/details", authMiddleware, blockBuilderPropertyPosting, uploadMedia, parseJsonFields(jsonKeys),updateAgriculturalDetailsStep);
router.patch("/:id/verification", authMiddleware, blockBuilderPropertyPosting, uploadMedia,parseJsonFields(jsonKeys),   finalizeAgricultural);


router.patch("/:id/verify-document", authMiddleware, requirePermission("agricultural:verify_document"), verifyAgricultiralDocument);


router.post("/:id/approve",  approveAgriculturalProperty);
router.post("/:id/deactive", authMiddleware, deactivateAgriculturalProperty);

router.delete("/:id/gallery/:imageIndex", authMiddleware, deleteAgriculturalGalleryImage);



export default router;
