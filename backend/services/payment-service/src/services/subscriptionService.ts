// subscriptionServices
import { Subscription } from "../models/subscriptionModel";
import { Plan } from "../models/planModel";
import { notifySubscriptionActivated } from "./paymentNotificationService";

export async function activateSubscription(userId: string, 
roleName: "user" | "agent" | "owner" | "builder",
 planCode: string) {
  const plan = await Plan.findOne({ code: planCode }).lean();
  if (!plan) throw new Error("Plan not found");

    const userType = roleName === "user" ? "buyer" : roleName;

  // 🔥 expire only SAME type plan
  const expireFilter: any = {
    userId,
    userType,
    status: "active",
  };

  if (plan.category) {
    expireFilter.category = plan.category;
  }

  await Subscription.updateMany(expireFilter, { status: "expired" });

  const payload: any = {
    userId,
    userType,
    planCode: plan.code,
    tier: plan.tier,
    status: "active",
    startDate: new Date(),
    endDate: new Date(Date.now() + plan.durationDays * 86400000),
    usage: { contactUsed: 0, enquiryUsed: 0 },
  };

  if (plan.category) {
    payload.category = plan.category;
  }

  const subscription = await Subscription.create(payload);
  await notifySubscriptionActivated({
    subscription,
    planName: plan.name || plan.code,
  });

  return subscription;
}

export async function upgradeSubscription(
  userId: string,
  newPlanId: string
) {

}
