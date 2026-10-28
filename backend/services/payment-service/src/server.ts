import express from "express";
import crypto from "crypto";
import dotenv from "dotenv";
import paymentRoutes from "./routes/paymentRoutes";
import { connectDB } from "./config/db";
import planRoutes from "./routes/planRoute";
import subscriptionRoutes from "./routes/subscriptionRoute"
import pdfRawData from "./routes/pdfRawData";
import builderPlanPdfPreview from "./routes/builderPlanPdfPreview";
import accountRoutes from "./routes/accountRoutes";
import builderPlanRoutes from "./routes/builderPlanRoute";
import builderInvoiceRoutes from "./routes/builderInvoiceRoute";
import { startSubscriptionNotificationJob } from "./services/paymentNotificationService";
import adminSubscriptionPaymentLinkRoutes from "./routes/adminSubscriptionPaymentLinkRoutes";
import { Payment } from "./models/paymentModel";
import { verifyPaymentAndActivate } from "./services/payment";
import { razorpay } from "./config/razorpay";


dotenv.config({ quiet: true });


const app = express();

// Razorpay signs the exact request bytes, so this route must be registered before JSON parsing.
app.post("/api/payments/webhooks/razorpay", express.raw({ type: "application/json" }), async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = String(req.headers["x-razorpay-signature"] || "");
  if (!webhookSecret || !signature || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({ message: "Invalid Razorpay webhook configuration" });
  }

  const expected = crypto.createHmac("sha256", webhookSecret).update(req.body).digest("hex");
  const suppliedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return res.status(400).json({ message: "Invalid Razorpay webhook signature" });
  }

  try {
    const event = JSON.parse(req.body.toString("utf8"));
    if (event?.event === "payment.captured" || event?.event === "order.paid") {
      const paymentEntity = event?.payload?.payment?.entity;
      const orderEntity = event?.payload?.order?.entity;
      const paymentId = String(paymentEntity?.id || "");
      const orderId = String(paymentEntity?.order_id || orderEntity?.id || "");
      if (paymentId && orderId) {
        const payment = await Payment.findOne({ razorpayOrderId: orderId }).select("adminPaymentLinkId").lean();
        if (payment?.adminPaymentLinkId) {
          const providerPayment: any = await razorpay.payments.fetch(paymentId);
          if (providerPayment.status !== "captured" || String(providerPayment.order_id) !== orderId) {
            return res.status(400).json({ message: "Payment is not captured for this order" });
          }
          // The webhook HMAC above is the trust boundary; this signature lets the
          // existing subscription fulfillment path be shared with browser checkout.
          const checkoutSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
            .update(`${orderId}|${paymentId}`)
            .digest("hex");
          await verifyPaymentAndActivate(orderId, paymentId, checkoutSignature);
        }
      }
    }
    return res.json({ received: true });
  } catch (error) {
    console.error("[payment] Razorpay webhook processing failed", error);
    return res.status(500).json({ message: "Webhook processing failed" });
  }
});

app.use(express.json());

const PORT = process.env.PORT ?? 4002;

async function start() {
    
  try {

    await connectDB();
    startSubscriptionNotificationJob();

    app.get("/", (req, res) => {
      res.json({ message: "Payment Service is running" });
    });

    app.use("/api/payments", paymentRoutes);
    app.use("/api/payments/admin-links", adminSubscriptionPaymentLinkRoutes);
    app.use("/api/payments/plans", planRoutes);
    app.use("/api/payments/builder-plans", builderPlanRoutes);
    app.use("/api/payments/builder-invoices", builderInvoiceRoutes);
    app.use("/api/payments/subscriptions", subscriptionRoutes);
    app.use('/api/payments/accounts', accountRoutes)
    app.use("/api/payments/pdf/preview", pdfRawData);
    app.use("/api/payments/pdf/builder-plan-preview", builderPlanPdfPreview);


    app.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`payment Service running on 0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server", err);
    process.exit(1);
  }
}

start();
