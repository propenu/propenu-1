import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { requirePermission } from "../middlewares/requirePermission";
import { uploadMedia } from "../middlewares/multer";
import { parseJsonFields } from "../middlewares/parseJsonFields";
import {
  BUILDER_ONBOARDING_STAFF_ROLES,
  assignExistingBuilder,
  checkPublicInvitePhone,
  claimPublicInviteAfterSignup,
  completePublicInviteOnboarding,
  createProjectDraft,
  directCreateBuilder,
  getBuilderOnboarding,
  getPublicBuilderInvite,
  lookupBuilder,
  requestDirectBuilderOtp,
  requestPublicInviteOtp,
  saveProjectContacts,
  returnActiveProjectToDraft,
  sendBuilderInvite,
  submitProjectForApproval,
  trackInviteEmailClick,
  trackInviteEmailOpen,
  verifyDirectBuilderOtp,
} from "../controller/builderOnboardingController";

const router = express.Router();

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
  "youtubeVideos",
  "projectContacts",
  "contacts",
];

const staffAuth = [
  authMiddleware,
  requirePermission("project:create", BUILDER_ONBOARDING_STAFF_ROLES),
];

/** Staff authenticated routes (mounted under /api/properties/featured-project) */
router.post(
  "/draft",
  uploadMedia,
  parseJsonFields(jsonKeys),
  ...staffAuth,
  createProjectDraft,
);

router.get("/builders/lookup", ...staffAuth, lookupBuilder);

router.get("/:id/builder-onboarding", ...staffAuth, getBuilderOnboarding);

router.post(
  "/:id/builder/assign-existing",
  ...staffAuth,
  assignExistingBuilder,
);

router.post(
  "/:id/builder/return-to-draft",
  ...staffAuth,
  returnActiveProjectToDraft,
);

router.post("/:id/builder/invite", ...staffAuth, sendBuilderInvite);

router.post(
  "/:id/builder/direct-otp/request",
  ...staffAuth,
  requestDirectBuilderOtp,
);

router.post(
  "/:id/builder/direct-otp/verify",
  ...staffAuth,
  verifyDirectBuilderOtp,
);

router.post(
  "/:id/builder/direct-create",
  ...staffAuth,
  directCreateBuilder,
);

router.put("/:id/project-contacts", ...staffAuth, saveProjectContacts);

router.post(
  "/:id/submit-for-approval",
  ...staffAuth,
  submitProjectForApproval,
);

export const builderOnboardingPublicRouter = express.Router();

builderOnboardingPublicRouter.get(
  "/email/open/:trackingId",
  trackInviteEmailOpen,
);

builderOnboardingPublicRouter.get(
  "/builder-invite/:trackingId/click",
  trackInviteEmailClick,
);

builderOnboardingPublicRouter.get(
  "/builder-invite/:token",
  getPublicBuilderInvite,
);

builderOnboardingPublicRouter.post(
  "/builder-invite/:token/send-otp",
  requestPublicInviteOtp,
);

builderOnboardingPublicRouter.post(
  "/builder-invite/:token/complete",
  completePublicInviteOnboarding,
);

builderOnboardingPublicRouter.post(
  "/builder-invite/:token/check-phone",
  checkPublicInvitePhone,
);

builderOnboardingPublicRouter.post(
  "/builder-invite/:token/claim",
  claimPublicInviteAfterSignup,
);

export default router;
