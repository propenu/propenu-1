import { Router } from "express";
import {
  createAdminSubscriptionPaymentLink,
  getSubscriptionPaymentCheckout,
  getSubscriptionPaymentLink,
} from "../controller/adminSubscriptionPaymentLinkController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { requirePermission } from "../middlewares/requirePermission";

const router = Router();

router.get("/:token", getSubscriptionPaymentLink);
router.post("/:token/checkout", authMiddleware, getSubscriptionPaymentCheckout);
router.post("/", authMiddleware, requirePermission("payment:create"), createAdminSubscriptionPaymentLink);

export default router;
