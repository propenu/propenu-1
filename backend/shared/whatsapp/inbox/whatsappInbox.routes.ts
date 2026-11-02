import { Router } from "express";
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
router.post("/conversations/:waId/messages", postMessage);
router.post("/conversations/:waId/read", postMarkRead);

export default router;
