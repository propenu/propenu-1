import { Router } from "express";
import multer from "multer";
import {
  getAssignableAgents,
  getAssignableRoles,
  getCloudHealth,
  getConversations,
  getMessageMedia,
  getMessages,
  patchConversation,
  postMarkRead,
  postMessage,
  postRegisterWebhook,
  postStartConversation,
  postSyncFromLogs,
  streamInboxEvents,
} from "./whatsappInbox.controller";

const router = Router();
const inboxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.get("/health", getCloudHealth);
router.post("/webhook/register", postRegisterWebhook);
router.get("/stream", streamInboxEvents);
router.get("/assignable-roles", getAssignableRoles);
router.get("/assignable-agents", getAssignableAgents);
router.get("/conversations", getConversations);
router.post("/conversations", postStartConversation);
router.post("/sync", postSyncFromLogs);
router.patch("/conversations/:waId", patchConversation);
router.get("/conversations/:waId/messages", getMessages);
router.get("/conversations/:waId/messages/:messageId/media", getMessageMedia);
router.post(
  "/conversations/:waId/messages",
  inboxUpload.single("file"),
  postMessage,
);
router.post("/conversations/:waId/read", postMarkRead);

export default router;
