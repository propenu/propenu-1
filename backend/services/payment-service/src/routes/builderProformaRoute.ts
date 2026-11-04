import { Router } from "express";
import {
  convertProformaToInvoice,
  createProforma,
  deleteProforma,
  deleteProformaAttachment,
  getProforma,
  getProformaPdf,
  listProformas,
  updateProforma,
  uploadProformaAttachments,
} from "../controller/builderProforma";
import { authMiddleware } from "../middlewares/authMiddleware";
import { requirePermission } from "../middlewares/requirePermission";
import { uploadDocuments } from "../middlewares/uploadDocuments";

const router = Router();

router.get("/", authMiddleware, requirePermission("builder_invoice:view"), listProformas);
router.get("/:id/pdf", authMiddleware, requirePermission("builder_invoice:view"), getProformaPdf);
router.get("/:id", authMiddleware, requirePermission("builder_invoice:view"), getProforma);
router.post("/", authMiddleware, requirePermission("builder_invoice:create"), createProforma);
router.post(
  "/:id/attachments",
  authMiddleware,
  requirePermission("builder_invoice:update"),
  uploadDocuments("files"),
  uploadProformaAttachments,
);
router.delete(
  "/:id/attachments/:attachmentId",
  authMiddleware,
  requirePermission("builder_invoice:update"),
  deleteProformaAttachment,
);
router.post("/:id/convert", authMiddleware, requirePermission("builder_invoice:create"), convertProformaToInvoice);
router.patch("/:id", authMiddleware, requirePermission("builder_invoice:update"), updateProforma);
router.delete("/:id", authMiddleware, requirePermission("builder_invoice:delete"), deleteProforma);

export default router;
