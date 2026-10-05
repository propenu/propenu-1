import mongoose, { Types } from "mongoose";
import { getActiveDeviceTokensForUsers } from "../../../../shared/notifications/deviceTokens";
import { sendBulkPush } from "../../../../shared/notifications/push.service";
import { Payment } from "../models/paymentModel";
import { Plan } from "../models/planModel";
import { Subscription } from "../models/subscriptionModel";

export type PaymentNotificationType =
  | "payment_success"
  | "payment_failed"
  | "subscription_activated"
  | "subscription_expiring"
  | "subscription_expired"
  | "plan_upgrade_reminder";

const WEBSITE = (process.env.FRONTEND_URL || "https://propenu.com").replace(
  /\/$/,
  "",
);

const stringifyData = (data: Record<string, unknown> = {}) =>
  Object.entries(data).reduce<Record<string, string>>((result, [key, value]) => {
    if (value === undefined || value === null) return result;
    result[key] = String(value);
    return result;
  }, {});

const formatAmount = (amount?: number | null) => {
  if (!Number.isFinite(Number(amount))) return "";
  return `₹${Number(amount).toLocaleString("en-IN")}`;
};

const formatDate = (value?: Date | string | null) => {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getCopy = ({
  type,
  planName,
  amount,
  endDate,
}: {
  type: PaymentNotificationType;
  planName?: string | null | undefined;
  amount?: number | null | undefined;
  endDate?: Date | string | null | undefined;
}) => {
  const planLabel = planName || "your plan";
  const amountLabel = formatAmount(amount);
  const dateLabel = formatDate(endDate);

  switch (type) {
    case "payment_success":
      return {
        title: "Payment Successful",
        body: amountLabel
          ? `Your payment of ${amountLabel} for ${planLabel} was successful.`
          : `Your payment for ${planLabel} was successful.`,
      };
    case "payment_failed":
      return {
        title: "Payment Failed",
        body: `Your payment for ${planLabel} could not be completed. Please try again.`,
      };
    case "subscription_activated":
      return {
        title: "Subscription Activated",
        body: dateLabel
          ? `${planLabel} is active until ${dateLabel}.`
          : `${planLabel} is now active.`,
      };
    case "subscription_expiring":
      return {
        title: "Subscription Expiring Soon",
        body: dateLabel
          ? `${planLabel} expires on ${dateLabel}. Renew to keep your benefits active.`
          : `${planLabel} is expiring soon. Renew to keep your benefits active.`,
      };
    case "subscription_expired":
      return {
        title: "Subscription Expired",
        body: `${planLabel} has expired. Renew to continue using your benefits.`,
      };
    case "plan_upgrade_reminder":
      return {
        title: "Upgrade Your Plan",
        body: `You are close to using all benefits in ${planLabel}. Upgrade for more access.`,
      };
    default:
      return {
        title: "Payment Update",
        body: `There is an update for ${planLabel}.`,
      };
  }
};

export const notifyPaymentEvent = async ({
  type,
  userId,
  planName,
  planCode,
  subscriptionId,
  paymentId,
  amount,
  endDate,
  invoiceUrl,
  dedupeKey,
  sendPush = true,
}: {
  type: PaymentNotificationType;
  userId: string | Types.ObjectId;
  planName?: string | null | undefined;
  planCode?: string | null | undefined;
  subscriptionId?: string | Types.ObjectId | null | undefined;
  paymentId?: string | Types.ObjectId | null | undefined;
  amount?: number | null | undefined;
  endDate?: Date | string | null | undefined;
  invoiceUrl?: string | null | undefined;
  dedupeKey?: string | undefined;
  sendPush?: boolean;
}) => {
  try {
    const recipientId = String(userId || "").trim();
    if (!recipientId || !Types.ObjectId.isValid(recipientId)) {
      return { sent: 0, recorded: false };
    }

    const path = invoiceUrl ? "/my-plan" : "/plans";
    const url = `${WEBSITE}${path}`;
    const copy = getCopy({ type, planName, amount, endDate });
    const notificationKey =
      dedupeKey ||
      `${type}:${recipientId}:${subscriptionId || paymentId || planCode || ""}`;
    const now = new Date();

    const db = mongoose.connection.db;
    if (db) {
      await db.collection("usernotifications").updateOne(
        { notificationKey },
        {
          $setOnInsert: {
            notificationKey,
            userId: new Types.ObjectId(recipientId),
            type,
            category: "payment",
            title: copy.title,
            body: copy.body,
            path,
            url,
            deepLink: `propenu://${path.replace(/^\//, "")}`,
            metadata: {
              planName: planName || null,
              planCode: planCode || null,
              subscriptionId: subscriptionId ? String(subscriptionId) : null,
              paymentId: paymentId ? String(paymentId) : null,
              amount: amount ?? null,
              endDate: endDate || null,
              invoiceUrl: invoiceUrl || null,
            },
            readAt: null,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
    }

    if (!sendPush) return { sent: 0, recorded: true };

    const tokens = await getActiveDeviceTokensForUsers([recipientId]);
    if (!tokens.length) return { sent: 0, recorded: true };

    const result = await sendBulkPush({
      tokens,
      title: copy.title,
      body: copy.body,
      data: stringifyData({
        type,
        category: "payment",
        audience: "user",
        path,
        url,
        planName,
        planCode,
        subscriptionId,
        paymentId,
        invoiceUrl,
      }),
    });

    return { sent: result.successCount, recorded: true };
  } catch (error) {
    console.error("Payment notification failed:", error);
    return { sent: 0, recorded: false };
  }
};

export const notifyPaymentFailedByOrderId = async ({
  razorpayOrderId,
  fallbackUserId,
}: {
  razorpayOrderId?: string | null;
  fallbackUserId?: string | null | undefined;
}) => {
  const payment = razorpayOrderId
    ? await Payment.findOne({ razorpayOrderId }).lean()
    : null;

  const userId = String(payment?.userId || fallbackUserId || "");
  if (!userId) return { sent: 0, recorded: false };

  const plan = payment?.planId ? await Plan.findById(payment.planId).lean() : null;

  if (payment?._id) {
    await Payment.updateOne(
      { _id: payment._id, status: { $ne: "paid" } },
      { $set: { status: "failed" } },
    );
  }

  return notifyPaymentEvent({
    type: "payment_failed",
    userId,
    planName: plan?.name || plan?.code || "your plan",
    planCode: plan?.code || payment?.newPlanCode,
    paymentId: payment?._id,
    amount: payment?.amount,
    dedupeKey: `payment_failed:${String(payment?._id || razorpayOrderId || userId)}`,
  });
};

export const notifySubscriptionActivated = async ({
  subscription,
  planName,
  amount,
  paymentId,
  invoiceUrl,
}: {
  subscription: any;
  planName?: string | null | undefined;
  amount?: number | null | undefined;
  paymentId?: string | Types.ObjectId | null | undefined;
  invoiceUrl?: string | null | undefined;
}) => {
  await notifyPaymentEvent({
    type: "subscription_activated",
    userId: String(subscription.userId),
    planName: planName || subscription.planCode,
    planCode: subscription.planCode,
    subscriptionId: subscription._id,
    paymentId,
    amount,
    endDate: subscription.endDate,
    invoiceUrl,
    dedupeKey: `subscription_activated:${String(subscription._id)}`,
  });
};

export const processSubscriptionNotifications = async () => {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const expiring = await Subscription.find({
    status: "active",
    endDate: { $gt: now, $lte: soon },
  }).lean();

  for (const subscription of expiring) {
    await notifyPaymentEvent({
      type: "subscription_expiring",
      userId: String(subscription.userId),
      planName: subscription.planCode,
      planCode: subscription.planCode,
      subscriptionId: subscription._id,
      endDate: subscription.endDate,
      dedupeKey: `subscription_expiring:${String(subscription._id)}:${new Date(
        subscription.endDate || now,
      )
        .toISOString()
        .slice(0, 10)}`,
    });
  }

  const expired = await Subscription.find({
    status: "active",
    endDate: { $lte: now },
  });

  for (const subscription of expired) {
    subscription.status = "expired";
    await subscription.save();

    await notifyPaymentEvent({
      type: "subscription_expired",
      userId: String(subscription.userId),
      planName: subscription.planCode,
      planCode: subscription.planCode,
      subscriptionId: subscription._id,
      endDate: subscription.endDate,
      dedupeKey: `subscription_expired:${String(subscription._id)}`,
    });
  }

  const upgradeCandidates = await Subscription.find({
    status: "active",
    "usage.contactLimit": { $gt: 0 },
  }).lean();

  for (const subscription of upgradeCandidates) {
    const used = Number((subscription as any).usage?.contactUsed || 0);
    const limit = Number((subscription as any).usage?.contactLimit || 0);
    if (!limit || used / limit < 0.8) continue;

    await notifyPaymentEvent({
      type: "plan_upgrade_reminder",
      userId: String(subscription.userId),
      planName: subscription.planCode,
      planCode: subscription.planCode,
      subscriptionId: subscription._id,
      endDate: subscription.endDate,
      dedupeKey: `plan_upgrade_reminder:${String(subscription._id)}:${used}:${limit}`,
    });
  }

  return {
    expiring: expiring.length,
    expired: expired.length,
  };
};

export const startSubscriptionNotificationJob = () => {
  processSubscriptionNotifications().catch((error) => {
    console.error("Subscription notification job failed:", error);
  });

  setInterval(
    () => {
      processSubscriptionNotifications().catch((error) => {
        console.error("Subscription notification job failed:", error);
      });
    },
    60 * 60 * 1000,
  );
};
