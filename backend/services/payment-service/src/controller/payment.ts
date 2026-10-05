import { Request, Response } from "express";
import {
  createPaymentOrder,
  verifyPaymentAndActivate,
} from "../services/payment";
import { AuthRequest } from "../middlewares/authMiddleware";
import { sendSubscriptionActivatedEmail } from "../../../../shared/email/email.helper";
import {
  sendPaymentSuccess,
  sendSubscriptionActivated,
} from "../../../../shared/whatsapp/whatsapp.helper";
import User from "../../../user-service/src/models/userModel";
import { notifyPaymentFailedByOrderId } from "../services/paymentNotificationService";

const isAgentRole = (roleName?: string) =>
  roleName === "agent" || roleName === "sales_agent";

async function sendSubscriptionWhatsAppNotification(
  userId: string,
  subscriptionUserType: string | undefined,
  subscriptionName: string,
) {
  try {
    const user = await User.findById(userId).select("name phone").lean();

    if (!user?.phone || !user?.name) {
      return false;
    }

    const parameters = [user.name.trim() || "Customer", subscriptionName];

    if (isAgentRole(subscriptionUserType)) {
      await sendSubscriptionActivated(user.phone, parameters);
    } else {
      await sendPaymentSuccess(user.phone, parameters);
    }

    return true;
  } catch (whatsAppError: any) {
    console.error("[payment] failed to send subscription activation WhatsApp", {
      userId,
      subscriptionUserType,
      subscriptionName,
      error: whatsAppError?.message,
      response: whatsAppError?.response,
    });

    return false;
  }
}

/* ---------------- CREATE PAYMENT ---------------- */

export async function createPayment(req: AuthRequest, res: Response) {
  try {
    const { planId, userId } = req.body;

    if (!planId) {
      return res.status(400).json({ message: "planId is required" });
    }

    const role = req.user!.roleName;

    const userType =
      role === "user"
        ? "buyer"
        : role === "builder"
          ? "owner"
          : role === "agent"
            ? "agent"
            : "buyer";

    const result = await createPaymentOrder(planId, userId, userType);

    let whatsappSent = false;

    if (
      "free" in result &&
      !result.alreadyActive &&
      result.subscriptionName &&
      req.user?.id
    ) {
      whatsappSent = await sendSubscriptionWhatsAppNotification(
        req.user.id,
        userType,
        result.subscriptionName,
      );
    }

    if ("free" in result) {
      return res.json({
        success: true,
        free: true,
        alreadyActive: result.alreadyActive || false, // 🔥 IMPORTANT
        whatsappSent,
        message: result.alreadyActive
          ? "You already have an active plan"
          : "Free plan activated 🎉",
      });
    }

    res.json(result);
  } catch (error: any) {
    try {
      await notifyPaymentFailedByOrderId({
        razorpayOrderId: req.body?.razorpay_order_id,
        fallbackUserId: req.user?.id || null,
      });
    } catch (notifyError) {
      console.error("[payment] failed to send payment failure notification", notifyError);
    }
    res.status(400).json({ message: error.message });
  }
}

/* ---------------- VERIFY PAYMENT ---------------- */

export async function verifyPayment(req: AuthRequest, res: Response) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const result = await verifyPaymentAndActivate(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      {
        name: req.user?.name,
        phone: req.user?.phone,
      },
    );

    let emailSent = false;
    let whatsappSent = false;

    if (!result.alreadyPaid && result.subscriptionName && req.user?.email) {
      try {
        await sendSubscriptionActivatedEmail(
          req.user.email,
          req.user.name?.trim() || "Customer",
          result.subscriptionName,
          {
            roleName: result.subscriptionUserType,
            invoiceLink: result.invoiceUrl,
          },
        );

        emailSent = true;
      } catch (emailError: any) {
        console.error(
          "[payment] failed to send subscription activation email",
          {
            email: req.user.email,
            subscriptionName: result.subscriptionName,
            error: emailError?.message,
            response: emailError?.response,
          },
        );
      }
    }

    if (!result.alreadyPaid && result.subscriptionName && req.user?.id) {
      whatsappSent = await sendSubscriptionWhatsAppNotification(
        req.user.id,
        result.subscriptionUserType,
        result.subscriptionName,
      );
    }

    res.json({
      message: result.message || "Payment verified & subscription activated",
      emailSent,
      whatsappSent,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}
