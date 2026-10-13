import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import Residential from "../models/residentialModel";
import Commercial from "../models/commercialModel";
import LandPlot from "../models/landModel";
import Agricultural from "../models/agriculturalModel";
import {
  listDeletedProperties,
  propertyFromDeletedArchive,
  purgeDeletedPropertyArchive,
  ListingCategory,
} from "../services/deletedPropertyArchive.service";
import { permanentlyDeleteListing } from "../services/listingDeletion.service";

const PERMANENT_DELETE_ROLES = new Set([
  "super_admin",
  "business_development_head",
]);

const normalizeActorRole = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const isSuperAdmin = (req: AuthRequest) =>
  normalizeActorRole(req.user?.roleName) === "super_admin";

const actorOf = (req: AuthRequest) => ({
  id: req.user?.id,
  name: (req.user as { name?: string } | undefined)?.name,
  email: (req.user as { email?: string } | undefined)?.email,
  roleName: req.user?.roleName,
});

const MODELS = {
  residential: Residential,
  commercial: Commercial,
  land: LandPlot,
  agricultural: Agricultural,
} as const;

export const permanentlyDeleteResidential = permanentHandler("residential");
export const permanentlyDeleteCommercial = permanentHandler("commercial");
export const permanentlyDeleteLand = permanentHandler("land");
export const permanentlyDeleteAgricultural = permanentHandler("agricultural");

function permanentHandler(category: ListingCategory) {
  return async (req: AuthRequest, res: Response) => {
    try {
      const role = normalizeActorRole(req.user?.roleName);
      if (!PERMANENT_DELETE_ROLES.has(role)) {
        return res.status(403).json({
          error:
            "Only Super Admin or Business Development Head can permanently delete properties",
        });
      }
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: "Missing property ID" });
      const deleted = await permanentlyDeleteListing(
        MODELS[category],
        category,
        id,
        actorOf(req),
      );
      if (!deleted) return res.status(404).json({ error: "Property not found" });
      return res.json({ data: deleted, message: "Property deleted permanently" });
    } catch (err: any) {
      console.error("permanentlyDeleteProperty:", err);
      const message = err?.message || "Bad request";
      const status = /deactivated first/i.test(message) ? 400 : 400;
      return res.status(status).json({ error: message });
    }
  };
}

export const getDeletedProperties = async (req: AuthRequest, res: Response) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ error: "Only Super Admin can view deleted properties" });
    }
    const page = typeof req.query.page === "string" ? Number(req.query.page) : 1;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 12;
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const category = typeof req.query.category === "string" ? req.query.category : "";
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    const result = await listDeletedProperties({ page, limit, q, category, from, to });
    return res.json(result);
  } catch (err: any) {
    console.error("getDeletedProperties:", err);
    return res.status(500).json({ error: err.message || "Failed to load deleted properties" });
  }
};

export const getDeletedPropertyListing = async (req: AuthRequest, res: Response) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ error: "Only Super Admin can view deleted properties" });
    }
    const category = String(req.params.category || "");
    const propertyId = String(req.params.propertyId || "");
    const property = await propertyFromDeletedArchive(category, propertyId);
    if (!property) return res.status(404).json({ error: "Deleted property not found" });
    return res.json({ property });
  } catch (err: any) {
    console.error("getDeletedPropertyListing:", err);
    return res.status(500).json({ error: err.message || "Failed to load deleted property" });
  }
};

export const purgeDeletedProperty = async (req: AuthRequest, res: Response) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ error: "Only Super Admin can remove a deleted property" });
    }
    const removed = await purgeDeletedPropertyArchive(String(req.params.id || ""));
    if (!removed) return res.status(404).json({ error: "Deleted property not found" });
    return res.json({ success: true, id: String(removed._id) });
  } catch (err: any) {
    console.error("purgeDeletedProperty:", err);
    return res.status(500).json({ error: err.message || "Failed to remove deleted property" });
  }
};
