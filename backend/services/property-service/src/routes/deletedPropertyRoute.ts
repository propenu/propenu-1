import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  getDeletedProperties,
  getDeletedPropertyListing,
  purgeDeletedProperty,
} from "../controller/deletedPropertyController";
import {
  createAccessRequestController,
  decideAccessRequestController,
  getAccessRequestByTicketController,
  listAccessRequestsController,
  getDeletedAccessController,
  listDeletedAccessHistoryController,
  streamDeletedAccessController,
  updateDeletedAccessController,
} from "../controller/deletedAccessController";

const router = express.Router();

router.get("/access/stream", authMiddleware, streamDeletedAccessController);
router.get("/access", authMiddleware, getDeletedAccessController);
router.patch("/access", authMiddleware, updateDeletedAccessController);
router.get("/access/history", authMiddleware, listDeletedAccessHistoryController);
router.post("/access/requests", authMiddleware, createAccessRequestController);
router.get("/access/requests", authMiddleware, listAccessRequestsController);
router.get("/access/requests/by-ticket/:ticketId", authMiddleware, getAccessRequestByTicketController);
router.post("/access/requests/:id/approve", authMiddleware, decideAccessRequestController(true));
router.post("/access/requests/:id/reject", authMiddleware, decideAccessRequestController(false));

router.get("/", authMiddleware, getDeletedProperties);
router.get("/by-property/:category/:propertyId", authMiddleware, getDeletedPropertyListing);
router.delete("/:id", authMiddleware, purgeDeletedProperty);

export default router;
