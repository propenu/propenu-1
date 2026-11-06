import express from "express";
import {
  createWhatsAppTemplate,
  deleteWhatsAppTemplate,
  getWhatsAppTemplates,
} from "../../../../shared/whatsapp/templates/whatsappTemplate.controller";
import whatsappLogRouter from "../logs/whatsappLog.routes";
import {
  scheduleWhatsAppUsers,
  sendWhatsAppCampaignDynamic,
} from "../../../../shared/whatsapp/templates/whatsappTemplate.service";
import { upload, uploadNotificationImage, uploadWhatsAppTemplateMediaMulter } from "../middlewares/upload";
import { sendWhatsAppCSV } from "../../../../shared/email/templates/template.controller";
import whatsappRoutes from "../whatsapp/whatsapp.routes";
import { whatsappInboxRouter } from "../../../../shared/whatsapp/inbox";
import { authMiddleware } from "../middlewares/authMiddleware";
import { requirePermission } from "../middlewares/requirePermission";
import {
  uploadWhatsAppCampaignImage,
  uploadWhatsAppTemplateMedia,
} from "../controller/whatsappCampaignUpload.controller";

const whatsappRouter = express.Router();

whatsappRouter.use("/flow", whatsappRoutes);
whatsappRouter.use("/inbox", authMiddleware, whatsappInboxRouter);
whatsappRouter.use("/whatsapp-logs", whatsappLogRouter);

whatsappRouter.post("/", createWhatsAppTemplate);
whatsappRouter.get("/", getWhatsAppTemplates);
whatsappRouter.post("/send-whatsapp", sendWhatsAppCampaignDynamic);
/**
 * Schedule a template for user IDs or the opted-in audience.
 * Body: { userIds?: string[], audience?: "whatsapp_opted_in", templateName: string, scheduledAt: ISO-8601 with timezone }
 */
whatsappRouter.post(
  "/schedule-users",
  authMiddleware,
  requirePermission("whatsapp_campaign:send"),
  scheduleWhatsAppUsers,
);
whatsappRouter.post(
  "/upload-campaign-image",
  uploadNotificationImage.single("image"),
  uploadWhatsAppCampaignImage,
);
/** Meta Resumable Upload → header_handle for IMAGE/VIDEO/DOCUMENT template create */
whatsappRouter.post(
  "/upload-template-media",
  uploadWhatsAppTemplateMediaMulter.single("file"),
  uploadWhatsAppTemplateMedia,
);
whatsappRouter.post(
  "/send-csv-bulk-whatsapp",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "headerImage", maxCount: 1 },
  ]),
  sendWhatsAppCSV,
);
whatsappRouter.delete("/:name", deleteWhatsAppTemplate);

export default whatsappRouter;
