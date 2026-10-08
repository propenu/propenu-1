import express from "express";
import { parseJsonFields } from "../middlewares/parseJsonFields";
import fallbackCoerceDefault from "../middlewares/fallbackCoerce";

const router = express.Router();


const jsonKeys = [
  "location",
  "gallery",
  "tenantInfo",
  "buildingManagement",
  "pantry",
  "amenities",
  "specifications",
  "nearbyPlaces",
  "legalChecks",
  "parkingDetails",
  "fireSafety",
  "approval",
  "promotion",
];

import {  createCommercial,  editCommercial,  getAllCommercial,  getCommercialBySlug,  getCommercialDetail,  deleteCommercial, createCommercialDraft, updateCommercialBasicStep, updateCommercialLocationStep, updateCommercialDetailsStep, finalizeCommercial, getAllCommercialDraftsForAdmin, verifyCommercialDocument, getMyCommercialDraft, approveCommercialProperty, deactivateCommercialProperty, deleteCommercialGalleryImage} from "../controller/commercialController";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";
import { authMiddleware, AuthRequest } from "../middlewares/authMiddleware";
import { uploadMedia } from "../middlewares/multer";
import { requirePermission } from "../middlewares/requirePermission";
import { createListingPromotionHandlers } from "../controller/listingPromotionController";
import { blockBuilderPropertyPosting } from "../middlewares/blockRoles";

/** POST */
const listingPromo = createListingPromotionHandlers("commercial");

router.post("/", authMiddleware, blockBuilderPropertyPosting, uploadMedia,  parseJsonFields(jsonKeys), fallbackCoerceDefault, createCommercial,  requireActiveSubscription);
router.patch("/:id/promote", authMiddleware, listingPromo.promote);
router.patch("/:id/renew", authMiddleware, listingPromo.renew);
router.patch("/:id/expire", authMiddleware, listingPromo.expire);
router.patch("/:id/reset", authMiddleware, listingPromo.reset);
router.patch("/:id", uploadMedia, parseJsonFields(jsonKeys), fallbackCoerceDefault, editCommercial);
router.get("/draft/all", getAllCommercialDraftsForAdmin);
router.get("/draft/me", authMiddleware, getMyCommercialDraft);
router.get("/", getAllCommercial);
router.get("/slug/:slug", getCommercialBySlug);
router.get("/:id", getCommercialDetail);
router.delete("/:id", deleteCommercial);


router.patch("/:id/verify-document", authMiddleware, requirePermission("commercial:verify_document"), verifyCommercialDocument);


router.post("/:id/approve",  approveCommercialProperty);
router.post("/:id/deactive", authMiddleware, deactivateCommercialProperty);

router.delete("/:id/gallery/:imageIndex", authMiddleware, deleteCommercialGalleryImage);


router.post("/draft", authMiddleware, blockBuilderPropertyPosting, createCommercialDraft);
router.patch("/:id/basic", authMiddleware, blockBuilderPropertyPosting, uploadMedia, parseJsonFields(jsonKeys), updateCommercialBasicStep);
router.patch("/:id/location", authMiddleware, blockBuilderPropertyPosting, parseJsonFields(jsonKeys), updateCommercialLocationStep);
router.patch("/:id/details", authMiddleware, blockBuilderPropertyPosting, uploadMedia, parseJsonFields(jsonKeys), updateCommercialDetailsStep);
router.patch("/:id/verification", authMiddleware, blockBuilderPropertyPosting, uploadMedia, parseJsonFields(jsonKeys),  finalizeCommercial);


export default router;
