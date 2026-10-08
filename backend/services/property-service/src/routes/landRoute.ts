import express from "express";
import multer from "multer";
import { parseJsonFields } from "../middlewares/parseJsonFields";
import fallbackCoerceDefault from "../middlewares/fallbackCoerce";
import { validateBody } from "../middlewares/validate";
import {
  createLand,
  deleteLand,
  editLand,
  getLandBySlug,
  getLandDetail,
  getAllLands,
  createLandDraft,
  updateLandBasicStep, 
  updateLandLocationStep,
  updateLandDetailsStep,
  finalizeLand,
  getAllLandDraftsForAdmin,
  verifyLandDocument,
  getMyLandDraft,
  approveLandProperty,
  deactivateLandProperty,
  deleteLandGalleryImage,
} from "../controller/landController";
import { CreateLandSchema, UpdateLandSchema } from "../zod/landZod";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";
import { authMiddleware, AuthRequest } from "../middlewares/authMiddleware";
import { uploadMedia } from "../middlewares/multer";
import { requirePermission } from "../middlewares/requirePermission";
import { createListingPromotionHandlers } from "../controller/listingPromotionController";
import { blockBuilderPropertyPosting } from "../middlewares/blockRoles";

const router = express.Router();
const listingPromo = createListingPromotionHandlers("land");

const jsonKeys = [
  "specifications",
  "amenities",
  "nearbyPlaces",
  "documents",
  "gallery",
  "dimensions",
  "leads",
  "approvedByAuthority",
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

  requireActiveSubscription,
  fallbackCoerceDefault,
  validateBody(CreateLandSchema),
  createLand
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
  validateBody(UpdateLandSchema),
  editLand
);

router.get("/draft/me",authMiddleware, getMyLandDraft );
router.get("/draft/all", getAllLandDraftsForAdmin);

router.get("/", getAllLands);
router.get("/slug/:slug", getLandBySlug);
router.get("/:id", getLandDetail);
router.delete("/:id", deleteLand);


router.patch("/:id/verify-document", authMiddleware, requirePermission("land:verify_document"), verifyLandDocument);



router.post("/:id/approve",  approveLandProperty);
router.post("/:id/deactive", authMiddleware, deactivateLandProperty);

router.delete("/:id/gallery/:imageIndex", authMiddleware, deleteLandGalleryImage);


router.post("/draft", authMiddleware, blockBuilderPropertyPosting, createLandDraft);
router.patch("/:id/basic",authMiddleware, blockBuilderPropertyPosting, uploadMedia,parseJsonFields(jsonKeys),updateLandBasicStep);
router.patch("/:id/location", authMiddleware, blockBuilderPropertyPosting, parseJsonFields(jsonKeys), updateLandLocationStep);
router.patch("/:id/details", authMiddleware, blockBuilderPropertyPosting, uploadMedia, parseJsonFields(jsonKeys), updateLandDetailsStep);
router.patch(
  "/:id/verification",
  authMiddleware,
  blockBuilderPropertyPosting,
  uploadMedia,
  parseJsonFields(jsonKeys),
  finalizeLand
);


export default router;
