import { Router } from 'express';
import multer from "multer";
import { assignLeadController, checkLeadController, checkPublicProjectLeadController, createLeadController, createPublicLeadController, createPublicPropertyLeadController, deleteLeadController, deleteProjectLeadsController, downloadLeadsCSVController, exportAdminLeadsController, getAdminLeadsController, getLeadByIdController, getLeadsController, getMyContactedProperties, getProjectLeadsController, importProjectLeadsCSVController, importPropertyLeadsCSVController, listDeletedLeadsController, purgeAllDeletedLeadsController, purgeDeletedLeadController, requestPublicProjectLeadOtpController, requestPublicPropertyLeadOtpController, trackProjectBrochureDownloadController, trackProjectViewDurationController, trackPropertyViewDurationController, updatePublicLeadIntentionController, updateLeadStatusController, updateProjectLeadStatusController, verifyPublicProjectLeadOtpController, verifyPublicPropertyLeadOtpController } from "../controller/leadController"
import { LeadCreateSchema } from '../zod/leadZod';
import { validateBody } from '../middlewares/validate';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireActiveSubscription } from '../middlewares/requireActiveSubscription';
import { requireContactOwnerLimit } from '../middlewares/requireContactOwnerLimit';
import { requirePermission } from '../middlewares/requirePermission';
import {
  loadBuilderAccess,
  loadLeadProjectAccess,
  requireAssignableBuilderMember,
  requireBuilderPermission,
  requireProjectParamAccess,
} from '../middlewares/builderAccess';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});


router.post('/', (req, res, next) => {
    console.log("🧪 ROUTE HIT /leads");
    console.log("🧪 req.body BEFORE validation:", req.body);
    next();
  },

  validateBody(LeadCreateSchema),
  authMiddleware,
  requireContactOwnerLimit,
  createLeadController
);


router.post("/project/lead",  createPublicLeadController);
router.post("/project/lead/request-otp", requestPublicProjectLeadOtpController);
router.post("/project/lead/verify-otp", verifyPublicProjectLeadOtpController);
router.post("/public/lead", createPublicPropertyLeadController);
router.post("/public/lead/request-otp", requestPublicPropertyLeadOtpController);
router.post("/public/lead/verify-otp", verifyPublicPropertyLeadOtpController);
router.get("/project/lead/check", checkPublicProjectLeadController);
router.patch("/project/lead/:id/intention", updatePublicLeadIntentionController);
router.post("/project/:projectId/brochure-download", authMiddleware, trackProjectBrochureDownloadController);
router.post("/project/:projectId/view-duration", authMiddleware, trackProjectViewDurationController);
router.post("/property/:propertyType/:projectId/view-duration", authMiddleware, trackPropertyViewDurationController);
router.get(
  "/project/:projectId/leads",
  authMiddleware,
  loadBuilderAccess,
  requireBuilderPermission("lead:view"),
  requireProjectParamAccess("projectId"),
  getProjectLeadsController,
);
router.post(
  "/project/:projectId/leads/import",
  authMiddleware,
  loadBuilderAccess,
  requireBuilderPermission("lead:import"),
  requireProjectParamAccess("projectId"),
  upload.single("file"),
  importProjectLeadsCSVController,
);
router.post(
  "/property/:propertyType/:propertyId/leads/import",
  authMiddleware,
  loadBuilderAccess,
  requireBuilderPermission("lead:import"),
  upload.single("file"),
  importPropertyLeadsCSVController,
);
router.patch(
  "/project/:id/status",
  authMiddleware,
  loadBuilderAccess,
  requireBuilderPermission("lead:update"),
  loadLeadProjectAccess("id"),
  updateProjectLeadStatusController,
);
router.get(
  "/project/:projectId/leads/csv",
  authMiddleware,
  loadBuilderAccess,
  requireBuilderPermission("lead:download"),
  requireProjectParamAccess("projectId"),
  downloadLeadsCSVController,
);
router.delete(
  "/project/:projectId/leads",
  authMiddleware,
  loadBuilderAccess,
  requireBuilderPermission("lead:delete"),
  requireProjectParamAccess("projectId"),
  deleteProjectLeadsController,
);



router.get('/my-contacts', authMiddleware, getMyContactedProperties);
router.get("/check", authMiddleware, checkLeadController);
router.get(
  "/admin/overview",
  authMiddleware,
  requirePermission("lead:view"),
  getAdminLeadsController,
);
router.get("/admin/export", authMiddleware, requirePermission("lead:export"), exportAdminLeadsController);
router.get("/deleted", authMiddleware, listDeletedLeadsController);
router.delete("/deleted", authMiddleware, purgeAllDeletedLeadsController);
router.delete("/deleted/:id", authMiddleware, purgeDeletedLeadController);
router.patch(
  '/:id/assign',
  authMiddleware,
  loadBuilderAccess,
  requireBuilderPermission("lead:assign"),
  loadLeadProjectAccess("id"),
  requireAssignableBuilderMember,
  assignLeadController,
);
router.patch(
  '/:id/status',
  authMiddleware,
  loadBuilderAccess,
  requireBuilderPermission("lead:update"),
  loadLeadProjectAccess("id"),
  updateLeadStatusController,
);
router.delete(
  '/:id',
  authMiddleware,
  loadBuilderAccess,
  requireBuilderPermission("lead:delete"),
  loadLeadProjectAccess("id"),
  deleteLeadController,
);
router.get('/', getLeadsController);
router.get('/:id', getLeadByIdController);

export default router;

