import "./config/loadEnv";
import express from "express";

import authRoute from "./routes/authRoute";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "./config/db";
import agentRoute from "./routes/agentRoute";
import nominatimRoute from "./routes/nominatimRoute";
import seedRolesRoute from "./routes/seedRolesRoute";
import shortlistRoutes from "./routes/shortlistRoute";
import roleRoute from "./routes/roleRoute";
import userRoutes from "./routes/userRoutes";
import festivalIconRoute from "./routes/festivalIconRoute";
import { startNotificationJob } from "./jobs/notification.job";
import { startEmailJob } from "./jobs/email.job";
import emailRouter from "./routes/emailRoute";
import whatsappRouter from "./routes/whatsappRoute";
import conversationFlowRouter from "./routes/conversationFlowRoute";
import builderAccessRoute from "./routes/builderAccessRoute";
import builderProfileRoute from "./routes/builderProfileRoute";
import { fieldMeetingRoute } from "./routes/fieldMeetingRoute";
import { cleanupDuplicateLocalities } from "./services/locationService";
import Role from "./models/roleModel";

dotenv.config({
  path: path.resolve(process.cwd(), process.env.ENV_FILE || ".env"),
  quiet: true,
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT ?? 4004;

/** Ensure roles that use Locations admin can save (fixes 403 on edit). */
async function ensureLocationManagePermissions() {
  const roleNames = [
    "admin",
    "super_admin",
    "business_development_head",
    "operations_head",
    "ceo",
    "regional_manager",
    "sales_manager",
    "founder",
  ];
  const perms = [
    "location:view",
    "location:create",
    "location:update",
    "location:delete",
  ];

  // Named staff roles that see Locations in sidebar
  await Role.updateMany(
    { name: { $in: roleNames } },
    { $addToSet: { permissions: { $each: perms } } },
  );

  // Any role that already has Locations sidebar (location:view) also gets manage
  const upgraded = await Role.updateMany(
    { permissions: "location:view" },
    {
      $addToSet: {
        permissions: {
          $each: ["location:create", "location:update", "location:delete"],
        },
      },
    },
  );

  if (upgraded.modifiedCount > 0) {
    console.log(
      `Location manage permissions synced on ${upgraded.modifiedCount} role(s)`,
    );
  }
}

async function start() {
  try {
    await connectDB();

    await ensureLocationManagePermissions().catch((error) => {
      console.error("ensureLocationManagePermissions failed:", error);
    });

    cleanupDuplicateLocalities()
      .then((result) => {
        if (result.removed > 0) {
          console.log("Duplicate localities cleaned on startup:", result);
        }
      })
      .catch((error) => {
        console.error("Duplicate locality cleanup failed:", error);
      });
    app.get("/", (req, res) => {
      res.json({ message: "User Service is running" });
    });

    app.use("/api/users/festival-icon", festivalIconRoute);
    app.use("/api/users/auth", authRoute);
    app.use("/api/users/field-meetings", fieldMeetingRoute);
    app.use("/api/users/location", nominatimRoute);
    app.use("/api/users/seeds", seedRolesRoute);
    app.use("/api/users/shortlist", shortlistRoutes);
    app.use("/api/users/builder", builderProfileRoute);
    app.use("/api/users/builder", shortlistRoutes);
    app.use("/api/users/agent", agentRoute);
    app.use("/api/users/roles", roleRoute);
    app.use("/api/users/builder-access", builderAccessRoute);
    app.use("/api/users/notifications", userRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/users/email", emailRouter);
    app.use("/api/users/whatsapp", whatsappRouter);
    // Meta / Bizrow-style callback (same handlers as /api/users/whatsapp/flow/webhook)
    app.use("/api/conversation-flow", conversationFlowRouter);
    

    process.env.EMAIL_WORKER_EMBEDDED = "1";
    process.env.WHATSAPP_WORKER_EMBEDDED = "1";
    Promise.resolve()
      .then(async () => {
        const { describeRedisTarget } = require(
          "./lib/redis.connection",
        ) as typeof import("./lib/redis.connection");
        console.log("🔗 Campaign Redis:", describeRedisTarget());

        const { startEmailWorker } = require(
          "./workers/email.worker",
        ) as typeof import("./workers/email.worker");
        const { startWhatsAppWorker } = require(
          "./workers/whatsapp.worker",
        ) as typeof import("./workers/whatsapp.worker");

        await Promise.all([startEmailWorker(), startWhatsAppWorker()]);
      })
      .then(() => console.log("Email and WhatsApp campaign workers started"))
      .catch((error) => {
        console.error("Campaign workers failed to start:", error);
      });

      app.listen(Number(port), "0.0.0.0", () => {
        console.log(`user service running on 0.0.0.0:${port}`);
        // startNotificationJob();
        startEmailJob();
      });
    
  } catch (err) {
    console.error("Failed to start server", err);
    process.exit(1);
  }
}
start();
