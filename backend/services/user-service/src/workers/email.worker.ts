import dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";
import { sendEmail } from "../../../../shared/email/email.service";
import { EmailLog } from "../logs/emailLog.model";
import { bindRedisErrors, redisConnection } from "../lib/redis.connection";
import { connectDB } from "../config/db";

interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  logId?: string;
  campaignId?: string;
}

const startWorker = async () => {
  try {
    
    await connectDB();
    
    console.log("✅ MongoDB connected in worker");
    
    const worker = new Worker<EmailJobData>(
      "email-queue",
      async (job) => {
        // console.log("━━━━━━━━━━━━━━━━━━━━━━━");
        // console.log("📨 Processing job:", job.id);
        // console.log("📩 Email:", job.data.to);
        // console.log("🧾 logId:", job.data.logId);
        // console.log("📦 FULL JOB DATA:", job.data);  

        // 🔍 CHECK IF LOG EXISTS
        if (job.data.logId) {
          const existing = await EmailLog.findById(job.data.logId);
          console.log("🔍 Existing log:", existing);

          if (!existing) {
            console.log("❌ LOG NOT FOUND IN DB");
          }

          if (existing?.status === "success") {
            console.log("⚠️ Already sent, skipping:", job.data.to);
            return;
          }
        } else {
          console.log("❌ logId is missing!");
        }

        try {
          // ✅ SEND EMAIL
          await sendEmail(job.data.to, job.data.subject, job.data.html);
          console.log("✅ Email sent:", job.data.to);

          // 🔥 UPDATE LOG
          if (job.data.logId) {
            try {
              const updated = await EmailLog.findByIdAndUpdate(
                job.data.logId,
                { status: "success" },
                { new: true }
              );

              console.log("✅ Updated log result:", updated);

              if (!updated) {
                console.log("❌ UPDATE FAILED → log not found");
              }
            } catch (dbError) {
              console.error("⚠️ DB update error:", dbError);
            }
          }
        } catch (err: any) {
          console.error("❌ Email failed:", err.message);

          if (job.data.logId) {
            await EmailLog.findByIdAndUpdate(job.data.logId, {
              status: "failed",
              error: err.message,
            });
          }

          throw err;
        }
      },
      {
        connection: redisConnection,
        concurrency: 1,
        // Upstash charges every idle queue poll; use Redis' maximum block wait.
        drainDelay: 10,
        limiter: {
          max: 5,
          duration: 60000,
        },
      }
    );

    bindRedisErrors(worker);
  } catch (err) {
    console.error("❌ Worker DB connection failed:", err);
    process.exit(1);
  }
};

export { startWorker as startEmailWorker };

if (process.env.EMAIL_WORKER_EMBEDDED !== "1") {
  startWorker();
}
