import dotenv from "dotenv";
dotenv.config();

import { Worker, Job } from "bullmq";
import { WhatsAppLog } from "../logs/whatsappLog.model";
import {
  redisConnection,
  describeRedisTarget,
  bindRedisErrors,
} from "../lib/redis.connection";
import {
  sendWhatsAppBulkMessages as sendWhatsAppMessage,
  processCrmCampaignFanout,
  processCsvCampaignFanout,
} from "../../../../shared/whatsapp/templates/whatsappTemplate.service";
import { recordOutboundTemplateMessage } from "../../../../shared/whatsapp/inbox/whatsappInbox.service";
import { connectDB } from "../config/db";
import type {
  WhatsAppSendJobData,
  WhatsAppCrmFanoutJobData,
  WhatsAppCsvFanoutJobData,
} from "../queues/whatsapp.queue";

const startWorker = async () => {
  try {
    await connectDB();
    console.log("✅ MongoDB connected in WhatsApp worker");
    console.log("🔗 Redis target:", describeRedisTarget());

    const worker = new Worker(
      "whatsapp-queue",
      async (job: Job) => {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📦 Processing job:", job.id, "name:", job.name);

        if (job.name === "fanout-crm-campaign") {
          const data = job.data as WhatsAppCrmFanoutJobData;
          console.log("🚀 CRM fan-out:", data.campaignId);
          return processCrmCampaignFanout(data);
        }

        if (job.name === "fanout-csv-campaign") {
          const data = job.data as WhatsAppCsvFanoutJobData;
          console.log(
            "🚀 CSV fan-out:",
            data.campaignId,
            "rows:",
            data.rows?.length || 0,
          );
          return processCsvCampaignFanout(data);
        }

        const data = job.data as WhatsAppSendJobData;
        console.log("📱 Phone:", data.to);
        console.log("🧾 logId:", data.logId);

        if (data.logId) {
          const existing = await WhatsAppLog.findById(data.logId);
          if (existing?.status === "success") {
            console.log("⚠️ Already sent, skipping:", data.to);
            return;
          }
        }

        try {
          const messageInput = {
            to: data.to,
            templateName: data.templateName,
            variables: data.variables || [],
            ...(data.language ? { language: data.language } : {}),
            ...(data.headerFormat ? { headerFormat: data.headerFormat } : {}),
            ...(data.headerMediaId
              ? { headerMediaId: data.headerMediaId }
              : {}),
            ...(data.headerImageUrl
              ? { headerImageUrl: data.headerImageUrl }
              : {}),
            ...(data.carouselCards?.length
              ? { carouselCards: data.carouselCards }
              : {}),
          };

          const response = await sendWhatsAppMessage(messageInput);
          console.log("✅ WhatsApp sent:", data.to);

          if (data.logId) {
            try {
              await WhatsAppLog.findByIdAndUpdate(
                data.logId,
                {
                  status: "success",
                  response: response?.data ?? response,
                },
                { new: true },
              );

              await recordOutboundTemplateMessage({
                to: data.to,
                templateName: data.templateName,
                status: "sent",
                logId: data.logId,
                response: response?.data ?? response,
                language: data.language,
                variables: data.variables || [],
                headerImageUrl: data.headerImageUrl,
                carouselCards: data.carouselCards,
              }).catch((inboxErr) => {
                console.error("⚠️ Inbox record error:", inboxErr);
              });
            } catch (dbError) {
              console.error("⚠️ DB update error:", dbError);
            }
          }
        } catch (err: any) {
          console.error("❌ WhatsApp failed:", err?.message);

          if (data.logId) {
            await WhatsAppLog.findByIdAndUpdate(data.logId, {
              status: "failed",
              error:
                typeof err?.message === "string"
                  ? err.message
                  : JSON.stringify(err?.response?.data || err || "failed"),
            });
          }

          throw err;
        }
      },
      {
        connection: redisConnection,
        concurrency: 5,
        // Upstash charges every idle queue poll; use Redis' maximum block wait.
        drainDelay: 10,
        lockDuration: 120000,
        stalledInterval: 60000,
      },
    );

    bindRedisErrors(worker);

    console.log("✅ WhatsApp campaign worker listening on whatsapp-queue");
  } catch (err) {
    console.error("❌ Worker startup failed:", err);
    if (process.env.WHATSAPP_WORKER_EMBEDDED === "1") return;
    process.exit(1);
  }
};

export { startWorker as startWhatsAppWorker };

if (process.env.WHATSAPP_WORKER_EMBEDDED !== "1") {
  startWorker();
}
