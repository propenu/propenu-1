import { Router } from "express";
import {
  createBuilderInvoice,
  deleteBuilderInvoice,
  getBuilderInvoiceById,
  getBuilderInvoicePdf,
  getBuilderInvoices,
  getBuilderSpendSummary,
  getBuilderSubscriptionProjects,
  renewBuilderInvoice,
  updateBuilderInvoice,
} from "../controller/builderInvoice";
import {
  deleteInvoicePayment,
  recordInvoicePayment,
  updateInvoicePayment,
} from "../controller/builderInvoicePayments";
import { authMiddleware } from "../middlewares/authMiddleware";
import { requireBuilderInvoiceRead, requirePermission } from "../middlewares/requirePermission";
import { uploadDocuments } from "../middlewares/uploadDocuments";

const router = Router();

router.get("/", authMiddleware, requireBuilderInvoiceRead, getBuilderInvoices);
router.get(
  "/builder/:userId/projects",
  authMiddleware,
  requirePermission("builder_invoice:view"),
  getBuilderSubscriptionProjects,
);
router.get(
  "/builder/:userId/spend",
  authMiddleware,
  requirePermission("builder_invoice:view"),
  getBuilderSpendSummary,
);
router.get("/:id/pdf", authMiddleware, requireBuilderInvoiceRead, getBuilderInvoicePdf);
router.get("/:id", authMiddleware, requireBuilderInvoiceRead, getBuilderInvoiceById);
router.post("/", authMiddleware, requirePermission("builder_invoice:create"), createBuilderInvoice);
router.post("/:id/renew", authMiddleware, requirePermission("builder_invoice:create"), renewBuilderInvoice);
router.post(
  "/:id/payments",
  authMiddleware,
  requirePermission("builder_invoice:update"),
  uploadDocuments("proofs"),
  recordInvoicePayment,
);
router.patch(
  "/:id/payments/:paymentId",
  authMiddleware,
  requirePermission("builder_invoice:update"),
  uploadDocuments("proofs"),
  updateInvoicePayment,
);
router.delete(
  "/:id/payments/:paymentId",
  authMiddleware,
  requirePermission("builder_invoice:delete"),
  deleteInvoicePayment,
);
router.patch("/:id", authMiddleware, requirePermission("builder_invoice:update"), updateBuilderInvoice);
router.delete("/:id", authMiddleware, requirePermission("builder_invoice:delete"), deleteBuilderInvoice);

export default router;
