import crypto from "crypto";
import { razorpay } from "../config/razorpay";
import { Payment } from "../models/paymentModel";
import { Subscription } from "../models/subscriptionModel";
import { Plan } from "../models/planModel";
import { Types } from "mongoose";
import { SubscriptionHistory } from "../models/subscriptionHistoryModel";
import { uploadPdfToS3 } from "../utils/uploadPdfToS3";
import { generateInvoicePdf } from "../utils/generateInvoicePdf";
import User from "../../../user-service/src/models/userModel";
import { generateBusinessNumber } from "../utils/generateBusinessNumber";
import { PLAN_RANK } from "../utils/planRank";
import {
  notifyPaymentEvent,
  notifySubscriptionActivated,
} from "./paymentNotificationService";

type VerifyPaymentResult = {
  success: true;
  alreadyPaid?: boolean;
  subscriptionName?: string;
  subscriptionUserType?: string;
  invoiceUrl?: string;
  subscriptionId?: string;
  paymentId?: string;
  planCode?: string;
  amount?: number | null | undefined;
  endDate?: Date | null | undefined;
  message?: string;
};

type InvoiceCustomer = {
  name?: string | undefined;
  phone?: string | undefined;
};

const GST_RATE = 0.18;

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getContactLimitFromPlan(plan: any) {
  const limit =
    typeof plan?.features?.get === "function"
      ? plan.features.get("CONTACT_OWNER_LIMIT") ?? plan.features.get("CONTACT_LIMIT")
      : plan?.features?.CONTACT_OWNER_LIMIT ?? plan?.features?.CONTACT_LIMIT;

  return typeof limit === "number" ? limit : undefined;
}

/* ======================================================
   CREATE PAYMENT ORDER
====================================================== */

export async function createPaymentOrder(
  planId: string,
  userId: string,
  userType: "buyer" | "owner" | "agent",
) {
  if (!Types.ObjectId.isValid(planId)) {
    throw new Error("Invalid planId");
  }

  const plan = await Plan.findById(planId).lean();

  if (!plan) {
    throw new Error("Plan not found");
  }

  const activeSubscription = await Subscription.findOne({
    userId,
    status: "active",
    endDate: { $gt: new Date() },
  });

  let paymentType: "new" | "upgrade" | "renewal" | "downgrade" = "new";

  let oldPlanCode: string | null = null;

  let creditAdjusted = 0;

  let remainingDays = 0;

  let finalPayable = plan.price;

  if (activeSubscription) {
    const oldPlan = await Plan.findOne({
      code: activeSubscription.planCode,
    }).lean();

    if (oldPlan) {
      const oldRank = PLAN_RANK[oldPlan.tier];

      const newRank = PLAN_RANK[plan.tier];

      if (newRank > oldRank) {
        paymentType = "upgrade";

        oldPlanCode = oldPlan.code;
        creditAdjusted = oldPlan.price;
        finalPayable = Math.max(plan.price - oldPlan.price, 0);
      }

      if (newRank < oldRank) {
        paymentType = "downgrade";

        throw new Error("Downgrade will activate after current plan expiry");
      }

      if (newRank === oldRank) {
        paymentType = "renewal";

        finalPayable = plan.price;
      }
    }
  }

  /* ======================================================
     FREE PLAN FLOW
  ====================================================== */

  if (plan.price === 0) {
    // Check if same plan already active
    const existing = await Subscription.findOne({
      userId,
      userType: plan.userType,
      category: plan.category,
      status: "active",
      endDate: { $gt: new Date() },
    });

    if (existing) {
      return {
        free: true,
        alreadyActive: true,
        subscriptionName: plan.name || plan.code,
        message: "Free plan already active",
      };
    }

    // Expire old plans of same category
    await Subscription.updateMany(
      {
        userId,
        userType: plan.userType,
        category: plan.category,
        status: "active",
      },
      { status: "expired" },
    );

    // Create subscription
    const subscription = await Subscription.create({
      userId,
      userType: plan.userType,
      category: plan.category || "both",
      planCode: plan.code,
      tier: plan.tier,
      startDate: new Date(),
      endDate: new Date(
        Date.now() + (plan.durationDays || 30) * 24 * 60 * 60 * 1000,
      ),
      status: "active",
      usage: {
        contactUsed: 0,
        enquiryUsed: 0,
        contactLimit: getContactLimitFromPlan(plan),
      },
    });

    await notifySubscriptionActivated({
      subscription,
      planName: plan.name || plan.code,
      amount: 0,
    });

    return {
      free: true,
      subscriptionName: plan.name || plan.code,
      subscriptionId: String(subscription._id),
      message: "Free plan activated",
    };
  }

  /* ======================================================
     PAID PLAN → CREATE RAZORPAY ORDER
  ====================================================== */

  const gstAmount = roundCurrency(finalPayable * GST_RATE);
  const totalPayable = roundCurrency(finalPayable + gstAmount);

  const order = await razorpay.orders.create({
    amount: Math.round(totalPayable * 100),
    currency: "INR",
    receipt: `pl_${plan._id.toString().slice(-6)}_${Date.now()}`,
    notes: {
      planId: plan._id.toString(),
      userId,
      userType: plan.userType,
      baseAmount: String(finalPayable),
      gstRate: String(GST_RATE * 100),
      gstAmount: String(gstAmount),
    },
  });

  const orderNumber = await generateBusinessNumber("ORD");

  const payment = await Payment.create({
    userId,
    userType,
    planId: plan._id,
    orderNumber,
    amount: totalPayable,
    paymentType,
    oldPlanCode,
    newPlanCode: plan.code,
    creditAdjusted,
    remainingDays,
    finalPayable,
    razorpayOrderId: order.id,
    status: "created",
  });

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    paymentType,
    oldPlanCode,
    creditAdjusted,
    remainingDays,
    finalPayable,
    gstRate: GST_RATE * 100,
    gstAmount,
    totalPayable,
    key: process.env.RAZORPAY_KEY_ID!,
  };
}

/* ======================================================
   VERIFY PAYMENT & ACTIVATE SUBSCRIPTION
====================================================== */

export async function verifyPaymentAndActivate(
  razorpay_order_id: string,
  razorpay_payment_id: string,
  razorpay_signature: string,
  invoiceCustomer?: InvoiceCustomer,
): Promise<VerifyPaymentResult> {
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    throw new Error("Invalid payment signature");
  }

  const payment = await Payment.findOne({
    razorpayOrderId: razorpay_order_id,
  });

  const invoiceNumber = await generateBusinessNumber("INV");

  if (!payment) {
    throw new Error("Payment record not found");
  }

  if (payment.status === "paid") {
    const existingPlan = await Plan.findById(payment.planId).lean();

    const resolvedName = existingPlan?.name || existingPlan?.code;
    return {
      success: true,
      alreadyPaid: true,
      ...(resolvedName && { subscriptionName: resolvedName }),
      ...(existingPlan?.userType && { subscriptionUserType: existingPlan.userType }),
      message: "Payment already verified",
    };
  }

  payment.status = "paid";
  payment.razorpayPaymentId = razorpay_payment_id;
  payment.razorpaySignature = razorpay_signature;
  payment.invoiceNumber = invoiceNumber;

  await payment.save();

  const plan = await Plan.findById(payment.planId);

  if (!plan) {
    throw new Error("Plan not found");
  }

  const activeSubscription = await Subscription.findOne({
    userId: String(payment.userId),
    category: plan.category,
    status: "active",
  });

  const baseContactLimit = getContactLimitFromPlan(plan);
  let carryForwardContacts = 0;

  if (
    payment.paymentType === "renewal" &&
    typeof baseContactLimit === "number" &&
    activeSubscription
  ) {
    const currentLimit =
      (activeSubscription as any).usage?.contactLimit ?? baseContactLimit;
    const currentUsed = (activeSubscription as any).usage?.contactUsed ?? 0;
    carryForwardContacts = Math.max(currentLimit - currentUsed, 0);
  }

  const totalContactLimit =
    typeof baseContactLimit === "number"
      ? baseContactLimit + carryForwardContacts
      : undefined;

  /* ======================================================
     EXPIRE OLD SUBSCRIPTIONS
  ====================================================== */

  await Subscription.updateMany(
    {
      userId: payment.userId,
      category: plan.category,
      status: "active",
    },
    { status: payment.paymentType === "upgrade" ? "upgraded" : "expired" },
  );

  /* ======================================================
     GENERATE INVOICE
  ====================================================== */

  if (!payment.userId) {
    throw new Error("Invalid payment: userId missing");
  }

  const user = await User.findById(payment.userId).select("name phone").lean();

  const invoiceBuffer = await generateInvoicePdf({
    invoiceNo: invoiceNumber,
    orderNo: payment.orderNumber || "N/A",

    userName:
      invoiceCustomer?.name?.trim() ||
      user?.name?.trim() ||
      payment.userId.toString(),
    userPhone: invoiceCustomer?.phone || user?.phone,
    planName: plan.name || plan.code,
    amount: payment.finalPayable || plan.price,
    date: new Date().toISOString().split("T")[0] || "",
  });

  const s3Key = `invoices/${payment.userId}/${payment._id}.pdf`;

  const invoiceUrl = await uploadPdfToS3(invoiceBuffer, s3Key);

  /* ======================================================
     CREATE NEW SUBSCRIPTION
  ====================================================== */

  const subscription = await Subscription.create({
    userId: payment.userId,
    userType: plan.userType,
    upgradedFrom: payment.oldPlanCode,

    creditAdjusted: payment.creditAdjusted,

    
    paymentId: payment._id,
    category: plan.category || "both",
    planCode: plan.code,
    tier: plan.tier,
    startDate: new Date(),
    endDate: new Date(
      Date.now() + (plan.durationDays || 30) * 24 * 60 * 60 * 1000,
    ),
    status: "active",
    invoiceUrl,
    usage: {
      contactUsed: 0,
      enquiryUsed: 0,
      contactLimit: totalContactLimit,
    },
  });

  /* ======================================================
     SAVE SUBSCRIPTION HISTORY
  ====================================================== */

  await SubscriptionHistory.create({
    paymentType: payment.paymentType,
    upgradedFrom: payment.oldPlanCode,
    creditAdjusted: payment.creditAdjusted,
    proratedAmount: payment.finalPayable,
    userId: payment.userId,
    userType: plan.userType,
    planCode: plan.code,
    tier: plan.tier,
    category: plan.category,
    price: plan.price,
    status: "active",
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    paymentId: payment._id,
    orderNumber: payment.orderNumber,
    invoiceNumber,
    invoiceUrl,
    purchasedAt: new Date(),
  });

  console.log("✅ Subscription activated:", subscription._id);

  await notifyPaymentEvent({
    type: "payment_success",
    userId: String(payment.userId),
    planName: plan.name || plan.code,
    planCode: plan.code,
    subscriptionId: subscription._id,
    paymentId: payment._id,
    amount: payment.amount,
    invoiceUrl,
    dedupeKey: `payment_success:${String(payment._id)}`,
  });

  await notifySubscriptionActivated({
    subscription,
    planName: plan.name || plan.code,
    amount: payment.amount,
    paymentId: payment._id,
    invoiceUrl,
  });

  return {
    success: true,
    subscriptionName: plan.name || plan.code,
    subscriptionUserType: plan.userType,
    subscriptionId: String(subscription._id),
    paymentId: String(payment._id),
    planCode: plan.code,
    amount: payment.amount,
    endDate: subscription.endDate,
    invoiceUrl,
    message: "Payment verified & subscription activated",
  };
}
