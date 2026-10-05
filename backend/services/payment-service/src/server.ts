import express from "express";
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


dotenv.config({ quiet: true });


const app = express();
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
