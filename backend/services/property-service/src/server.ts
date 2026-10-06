import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db";
import featurePropertiesRoute from "./routes/featurePropertiesRoute";
import { builderOnboardingPublicRouter } from "./routes/builderOnboardingRoute";
import popularOwnerPropertiesRoute from "./routes/popularOwnerPropertiesRoute";
import highlightProjectsRoute from "./routes/highlightProjectsRoute";
import residentialRoute from "./routes/residentialRoute";
import commercialRoutes from "./routes/commercialRoute";
import landRoutes from "./routes/landRoute";
import agriculturalRoutes from "./routes/agriculturalRoute";
import listingPromotionRoute from "./routes/listingPromotionRoute";
import searchRoute from "./routes/searchRoute";
import leadRoute from "./routes/leadRoute";
import "./models"; 
import analyticsRouter from "./routes/analyticsRoute";
import sponsoredRoute from "./features/sponsored/sponsored.route";
import blogRoute from "./blogs/blog.route";
import siteBrandingRoute from "./siteBranding/siteBranding.route";
import homeLoanApplicationRoute from "./routes/homeLoanApplicationRoute";
import { startPromotionExpiryJob } from "./jobs/promotionExpiry.job";
import userInteractionRoute from "./routes/userInteractionRoute";
import mongoose from "mongoose";
import { syncLocationsFromActiveListings } from "./services/locationServices";

dotenv.config({ quiet: true });

const app = express();
// Admin edit sends the loaded listing as JSON. The website basic step stays small.
// 100kb (the default) rejects that admin save before the route runs.
const jsonBodyLimit = "50mb";
app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: jsonBodyLimit }));

const port = process.env.PORT ?? 4003;

const ensureNotificationRetentionIndexes = async () => {
  await Promise.all([
    mongoose.connection.collection("brochuredownloads").createIndex(
      { createdAt: 1 },
      {
        expireAfterSeconds: 60 * 60 * 24 * 30,
        name: "brochure_download_retention_30_days",
      },
    ),
    mongoose.connection.collection("projectviewdurations").createIndex(
      { createdAt: 1 },
      {
        expireAfterSeconds: 60 * 60 * 24 * 30,
        name: "project_view_duration_retention_30_days",
      },
    ),
  ]);
};

async function start() {
  try {
    await connectDB();
    await ensureNotificationRetentionIndexes();

    syncLocationsFromActiveListings()
      .then((result) => {
        if (result.updatedCities > 0 || result.removedLocalities > 0) {
          console.log("Locations synced from active listings:", result);
        }
      })
      .catch((error) => {
        console.error("Active listing location sync failed:", error);
      });
    startPromotionExpiryJob();

    app.get("/", (req, res) => {
      res.json({ message: "Property Service is running" });
    });

    app.use("/api/properties/featured-project", featurePropertiesRoute);
    app.use("/api/properties/public", builderOnboardingPublicRouter);
    app.use("/api/properties/owners-properties", popularOwnerPropertiesRoute);
    app.use("/api/properties/highlight-projects", highlightProjectsRoute);

    // Listing promote/renew/expire/reset — mount before category routers
    // so PATCH /api/properties/{category}/:id/promote always resolves.
    app.use("/api/properties", listingPromotionRoute);

    app.use("/api/properties/residential", residentialRoute);
    app.use("/api/properties/commercial", commercialRoutes);
    app.use("/api/properties/land", landRoutes);
    app.use("/api/properties/agricultural", agriculturalRoutes);
    
    app.use("/api/properties/search", searchRoute);
    app.use('/api/properties/leads', leadRoute);
    app.use('/api/properties', analyticsRouter);
    app.use("/api/properties/sponsored", sponsoredRoute);
    app.use("/api/properties/blogs", blogRoute);
    app.use("/api/properties/site-branding", siteBrandingRoute);
    app.use("/api/properties/home-loans", homeLoanApplicationRoute);
    app.use("/api/properties/interactions", userInteractionRoute);

    app.use(
      (
        err: any,
        _req: express.Request,
        res: express.Response,
        next: express.NextFunction,
      ) => {
        if (res.headersSent) {
          next(err);
          return;
        }
        if (err?.type === "entity.too.large" || err?.name === "PayloadTooLargeError") {
          res.status(413).json({
            message:
              "This save is too large. Save the written details here, and upload photos on the gallery step.",
          });
          return;
        }
        next(err);
      },
    );

    app.listen(Number(port), "0.0.0.0", () => {
      console.log(`proportey running on 0.0.0.0:${port} json limit ${jsonBodyLimit}`);
    });
  } catch (err) {
    console.error("Failed to start proportey server", err);
    process.exit(1);
  }
}

start();
