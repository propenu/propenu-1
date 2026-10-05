import cron from "node-cron";
import User from "../models/userModel";
import { sendBulkPush } from "../../../../shared/notifications/push.service";
import { getActiveDeviceTokensForUsers } from "../../../../shared/notifications/deviceTokens";

export const startNotificationJob = () => {
  if (process.env.ENABLE_TEST_PUSH_JOB !== "true") {
    return;
  }

  
  cron.schedule("*/1 * * * *", async () => {

    try {
      const users = await User.find({ isActive: { $ne: false } }).populate("roleId");

      // 👉 filter only agents
      const agentUsers = users.filter(
        (u: any) => u.roleId?.name?.toLowerCase() === "agent"
      );

      const tokens = await getActiveDeviceTokensForUsers(
        agentUsers.map((u: any) => u._id),
      );
  
      if (!tokens.length) return;

      await sendBulkPush({
        tokens,
        title: "Auto Notification 🚀",
        body: "This is automated test",
      });
      console.log("✅ Notification Sent");
    } catch (error) {
      console.error("❌ Job Error:", error);
    }
  });
};
