import crypto from "crypto";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { AuthRequest } from "../middlewares/authMiddleware";
import { AdminSubscriptionPaymentLink } from "../models/adminSubscriptionPaymentLinkModel";
import { Payment } from "../models/paymentModel";
import { Plan } from "../models/planModel";
import Role from "../../../user-service/src/models/roleModel";
import User from "../../../user-service/src/models/userModel";
import { createPaymentOrder } from "../services/payment";

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GST_RATE = 0.18;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizedRole(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function roleToPlanType(role: string): "owner" | "agent" | null {
  if (role === "owner" || role === "user") return "owner";
  if (role === "agent") return "agent";
  return null;
}

function getPlanName(plan: any) {
  return String(plan?.name || plan?.code || "Subscription");
}

export async function createAdminSubscriptionPaymentLink(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { userId, planId } = req.body || {};
    const discountPercent = Number(req.body?.discountPercent || 0);

    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(planId)) {
      return res.status(400).json({ message: "A valid user and plan are required" });
    }
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 50) {
      return res.status(400).json({ message: "Discount must be between 0% and 50%" });
    }

    const [target, plan] = await Promise.all([
      User.findById(userId).select("name email phone roleId isActive").lean(),
      Plan.findById(planId).lean(),
    ]);
    if (!target || target.isActive === false) {
      return res.status(404).json({ message: "Active customer account not found" });
    }
    if (!plan) return res.status(404).json({ message: "Subscription plan not found" });

    const role = target.roleId
      ? await Role.findById(target.roleId).select("name").lean()
      : null;
    const userType = roleToPlanType(normalizedRole(role?.name));
    if (!userType) {
      return res.status(400).json({ message: "Payment links are available for owners and agents only" });
    }
    if (plan.userType !== userType) {
      return res.status(400).json({ message: "Selected plan is not available for this account type" });
    }
    if (Number(plan.price) <= 0) {
      return res.status(400).json({ message: "A payment link cannot be created for a free plan" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);
    const link = await AdminSubscriptionPaymentLink.create({
      tokenHash: hashToken(token),
      userId: target._id,
      userType,
      planId: plan._id,
      planCode: plan.code,
      planName: getPlanName(plan),
      category: plan.category,
      tier: plan.tier,
      durationDays: Number(plan.durationDays || 30),
      listPrice: Number(plan.price),
      discountPercent,
      discountAmount: 0,
      finalPayable: Number(plan.price),
      gstAmount: 0,
      totalAmount: 0,
      paymentId: new Types.ObjectId(),
      createdBy: new Types.ObjectId(req.user!.id),
      expiresAt,
      status: "created",
    });

    try {
      const order = await createPaymentOrder(String(plan._id), String(target._id), userType, {
        discountPercent,
        adminCreatedBy: req.user!.id,
        adminPaymentLinkId: String(link._id),
      });
      if ("free" in order || !order.orderId) {
        await link.deleteOne();
        return res.status(400).json({ message: "This plan does not require payment" });
      }

      const payment = await Payment.findOne({ razorpayOrderId: order.orderId });
      if (!payment) throw new Error("Payment order was not saved");

      const listPrice = Number(order.listPrice ?? plan.price);
      const discountAmount = Number(order.discountAmount || 0);
      const finalPayable = Number(order.finalPayable || 0);
      const gstAmount = Number(order.gstAmount || 0);
      const totalAmount = Number(order.totalPayable || 0);

      link.set("paymentId", payment._id);
      link.listPrice = listPrice;
      link.discountPercent = discountPercent;
      link.discountAmount = discountAmount;
      link.finalPayable = finalPayable;
      link.gstAmount = gstAmount;
      link.totalAmount = totalAmount;
      await link.save();

      const frontendUrl = (process.env.APP_BASE_URL || process.env.FRONTEND_URL || "https://propenu.com").replace(/\/$/, "");
      return res.status(201).json({
        success: true,
        link: {
          id: String(link._id),
          url: `${frontendUrl}/pay/${token}`,
          expiresAt,
          status: link.status,
        },
        customer: {
          id: String(target._id),
          name: target.name,
          phone: target.phone,
          role: role?.name,
        },
        plan: {
          id: String(plan._id),
          code: plan.code,
          name: link.planName,
          userType,
          listPrice,
          discountPercent,
          discountAmount,
          subtotal: finalPayable,
          gstRate: GST_RATE * 100,
          gstAmount,
          totalAmount,
          currency: "INR",
        },
      });
    } catch (error) {
      await link.deleteOne().catch(() => undefined);
      throw error;
    }
  } catch (error: any) {
    console.error("[admin-payment-link] create failed", error);
    return res.status(400).json({ message: error?.message || "Could not create payment link" });
  }
}

export async function getSubscriptionPaymentLink(req: Request, res: Response) {
  try {
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(404).json({ message: "Payment link not found" });
    }

    const link = await AdminSubscriptionPaymentLink.findOne({ tokenHash: hashToken(token) }).lean();
    if (!link) return res.status(404).json({ message: "Payment link not found" });

    let status = link.status;
    if (status === "created" && link.expiresAt <= new Date()) {
      await AdminSubscriptionPaymentLink.updateOne(
        { _id: link._id, status: "created" },
        { $set: { status: "expired" } },
      );
      status = "expired";
    }

    const customer = await User.findById(link.userId).select("name phone").lean();
    return res.json({
      success: true,
      link: {
        status,
        expiresAt: link.expiresAt,
        customerName: customer?.name || "Customer",
        userType: link.userType,
        planName: link.planName,
        planCode: link.planCode,
        category: link.category,
        durationDays: link.durationDays,
        listPrice: link.listPrice,
        discountPercent: link.discountPercent,
        discountAmount: link.discountAmount,
        subtotal: link.finalPayable,
        gstRate: link.gstRate,
        gstAmount: link.gstAmount,
        totalAmount: link.totalAmount,
        currency: link.currency,
      },
    });
  } catch (error) {
    console.error("[admin-payment-link] fetch failed", error);
    return res.status(500).json({ message: "Could not load this payment link" });
  }
}

export async function getSubscriptionPaymentCheckout(req: AuthRequest, res: Response) {
  try {
    const token = String(req.params.token || "");
    const link = await AdminSubscriptionPaymentLink.findOne({ tokenHash: hashToken(token) });
    if (!link) return res.status(404).json({ message: "Payment link not found" });
    if (String(link.userId) !== String(req.user!.id)) {
      return res.status(403).json({ message: "Sign in to the account this payment link was created for" });
    }
    if (link.status === "paid") return res.json({ success: true, alreadyPaid: true });
    if (link.status !== "created" || link.expiresAt <= new Date()) {
      if (link.status === "created") {
        link.status = "expired";
        await link.save();
      }
      return res.status(410).json({ message: "This payment link has expired" });
    }

    const [payment, customer] = await Promise.all([
      Payment.findById(link.paymentId).lean(),
      User.findById(link.userId).select("name phone email").lean(),
    ]);
    if (!payment || !payment.razorpayOrderId) {
      return res.status(409).json({ message: "Payment order is unavailable; ask the admin to issue a new link" });
    }
    if (payment.status === "paid") {
      link.status = "paid";
      link.paidAt = new Date();
      await link.save();
      return res.json({ success: true, alreadyPaid: true });
    }

    return res.json({
      success: true,
      alreadyPaid: false,
      orderId: payment.razorpayOrderId,
      amount: Math.round(Number(payment.amount || link.totalAmount) * 100),
      currency: payment.currency || "INR",
      key: process.env.RAZORPAY_KEY_ID,
      description: `${link.planName} subscription`,
      prefill: {
        name: customer?.name || "",
        contact: customer?.phone || "",
        email: customer?.email || "",
      },
    });
  } catch (error) {
    console.error("[admin-payment-link] checkout failed", error);
    return res.status(500).json({ message: "Could not start checkout" });
  }
}

