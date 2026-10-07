import { Request, Response } from "express";
import {
  CreateFeaturePropertyDTO,
  UpdateFeaturePropertyDTO,
  CreateFeaturePropertySchema,
  UpdateFeaturePropertySchema,
} from "../zod/validation";
import { FeaturePropertyService } from "../services/featurePropertiesServices";
import { ZodError } from "zod";
import { AuthRequest } from "../middlewares/authMiddleware";
import FeatureProperty from "../models/featurePropertiesModel";
import { deleteS3ObjectIfExists } from "../utils/s3Helpers";
import mongoose from "mongoose";
import { readOwnerUserId } from "../utils/ownerUserFilter";
import BuilderMember from "../models/builderMemberModel";
import { projectRequiresApprovalOnCreate } from "../utils/projectApprovalPolicy";

const getBuilderProjectScope = async (req: AuthRequest) => {
  if (!req.user?.id) {
    throw new Error("Unauthorized");
  }

  if (req.user.roleName !== "builder_staff") {
    return {
      createdBy: req.user.id,
      projectIds: null as string[] | null,
    };
  }

  const member = await BuilderMember.findOne({
    userId: req.user.id,
    isActive: true,
  })
    .select("builderId projectIds")
    .lean();

  if (!member) {
    return {
      createdBy: req.user.id,
      projectIds: [],
    };
  }

  return {
    createdBy: String((member as any).builderId),
    projectIds: ((member as any).projectIds ?? []).map(String),
  };
};

function parseMaybeJSON<T = any>(value: any): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    // not JSON — return as string
    return value as unknown as T;
  }
}

export const createFeatureProperties = async (req: Request, res: Response) => {
  try {
    // req.body fields (multipart) come as strings — parse arrays/objects
    const raw = { ...(req.body || {}) };

    // parse known complex fields that clients will send as JSON strings:
    const parsed = {
      ...raw,
      projectSummary: parseMaybeJSON(raw.projectSummary ?? raw.bhkSummary),
      bhkSummary: parseMaybeJSON(raw.projectSummary ?? raw.bhkSummary),
      specifications: parseMaybeJSON(raw.specifications),
      amenities: parseMaybeJSON(raw.amenities),
      nearbyPlaces: parseMaybeJSON(raw.nearbyPlaces),
      gallerySummary: parseMaybeJSON(raw.gallerySummary),
      sqftRange: parseMaybeJSON(raw.sqftRange),
      area: parseMaybeJSON(raw.area),
      leads: parseMaybeJSON(raw.leads),
      youtubeVideos: parseMaybeJSON(raw.youtubeVideos), // ⭐ ADD

      // add others as needed
    };

    // Validate with Zod (throws if invalid)
    const payload = CreateFeaturePropertySchema.parse(
      parsed,
    ) as CreateFeaturePropertyDTO;

    const authUser = (req as AuthRequest).user;
    const roleName = authUser?.roleName;
    const normalizedRole = String(roleName || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");
    const isSelfOwnerRole =
      normalizedRole === "builder" || normalizedRole === "builder_staff";
    const selectedBuilderId = String((payload as any).createdBy || "").trim();

    // Staff/admin must pick a builder in the dropdown → that id is createdBy.
    // Builder accounts may omit dropdown and own the project themselves.
    if (!isSelfOwnerRole) {
      if (!selectedBuilderId || !mongoose.Types.ObjectId.isValid(selectedBuilderId)) {
        return res.status(400).json({
          error: "Select a builder before posting. createdBy (builder) is required.",
        });
      }
    } else if (!selectedBuilderId && authUser?.id) {
      (payload as any).createdBy = authUser.id;
    }

    // Never let client dictate postedBy; service sets it from auth user (/me).
    delete (payload as any).postedBy;

    // CC / sales agent / other lower creators → pending for RM (or higher) approval.
    // RM / Ops / Admin / CEO / SM → live immediately.
    if (projectRequiresApprovalOnCreate(roleName ?? null)) {
      payload.status = "pending";
      payload.approvalStatus = "pending";
      delete (payload as any).approvedBy;
      delete (payload as any).approvedAt;
    } else {
      payload.status = "active";
      payload.approvalStatus = "approved";
      if (authUser?.id) {
        payload.approvedBy = authUser.id;
        payload.approvedAt = new Date();
      }
    }

    // files: multer puts them in req.files
    // heroImage: single file 'heroImage', galleryFiles: array
    const files = req.files as
      | { [fieldname: string]: Express.Multer.File[] }
      | undefined;

    const created = await FeaturePropertyService.createFeatureProperty(
      payload,
      files,
      (req as AuthRequest).user,
    );

    return res.status(201).json({ data: created });
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(422).json({ errors: err.flatten() });
    }
    console.error("createFeatureProperties:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
};

export const getMyHightlightProjectsController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const scope = await getBuilderProjectScope(req);
    const projects =
      await FeaturePropertyService.getMyHightlightProjects(
        scope.createdBy,
        scope.projectIds,
      );
    res.status(200).json({ success: true, data: projects });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyFeaturedProjectsController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const scope = await getBuilderProjectScope(req);
    const projects = await FeaturePropertyService.getMyFeaturedProjects(
      scope.createdBy,
      scope.projectIds,
    );
    res.status(200).json({ success: true, data: projects });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllFeatureProperties = async (req: Request, res: Response) => {
  try {
    const {
      page,
      limit,
      q,
      search,
      status,
      sortBy,
      sortOrder,
      type,
      city,
      state,
      locality,
      propertyCode,
      propertycode,
      createdBy,
      postedBy,
      postedByUserId,
      promotionStatus,
      from,
      to,
      createdFrom,
      createdTo,
      minPrice,
      maxPrice,
      bhk,
      rera,
      category,
      categoryType,
      view,
      possession,
      builder,
      propertyType,
      minSqft,
      maxSqft,
    } = req.query;
    const options: any = {};
    if (typeof page === "string") options.page = Number(page);
    if (typeof limit === "string") options.limit = Number(limit);
    const queryText =
      (typeof q === "string" && q.trim()) ||
      (typeof search === "string" && search.trim()) ||
      "";
    if (queryText) options.q = queryText;
    if (typeof status === "string") options.status = status;
    if (typeof sortBy === "string") options.sortBy = sortBy;
    options.sortOrder = sortOrder === "asc" ? "asc" : "desc";

    if (typeof type === "string") options.type = type;
    if (typeof city === "string") options.city = city;
    if (typeof state === "string") options.state = state;
    if (typeof locality === "string") options.locality = locality;
    if (typeof propertyCode === "string") options.propertyCode = propertyCode;
    if (typeof propertycode === "string") options.propertyCode = propertycode;
    if (typeof promotionStatus === "string") {
      options.promotionStatus = promotionStatus;
    }
    const fromDay =
      (typeof from === "string" && from) ||
      (typeof createdFrom === "string" && createdFrom) ||
      "";
    const toDay =
      (typeof to === "string" && to) ||
      (typeof createdTo === "string" && createdTo) ||
      "";
    if (fromDay) options.from = String(fromDay).slice(0, 10);
    if (toDay) options.to = String(toDay).slice(0, 10);
    const owner = readOwnerUserId(req.query as Record<string, any>);
    if (owner.error) return res.status(400).json({ error: owner.error });
    if (owner.ownerUserId) options.ownerUserId = owner.ownerUserId;
    if (typeof createdBy === "string") {
      if (!mongoose.Types.ObjectId.isValid(createdBy)) {
        return res.status(400).json({ error: "Invalid createdBy" });
      }
      options.createdBy = createdBy;
    }
    const postedByRaw =
      (typeof postedBy === "string" && postedBy) ||
      (typeof postedByUserId === "string" && postedByUserId) ||
      "";
    if (postedByRaw) {
      if (!mongoose.Types.ObjectId.isValid(postedByRaw)) {
        return res.status(400).json({ error: "Invalid postedBy" });
      }
      options.postedBy = postedByRaw;
    }
    if (typeof minPrice === "string" && minPrice.trim()) {
      options.minPrice = Number(minPrice);
    }
    if (typeof maxPrice === "string" && maxPrice.trim()) {
      options.maxPrice = Number(maxPrice);
    }
    if (typeof bhk === "string" && bhk.trim()) options.bhk = bhk.trim();
    if (rera === "1" || rera === "true") options.rera = true;
    const categoryValue =
      (typeof categoryType === "string" && categoryType.trim()) ||
      (typeof category === "string" && category.trim()) ||
      "";
    if (categoryValue) options.categoryType = categoryValue;
    if (view === "card") options.view = "card";
    if (typeof possession === "string" && possession.trim()) {
      options.possession = possession.trim();
    }
    if (typeof builder === "string" && builder.trim()) {
      options.builder = builder.trim();
    }
    if (typeof propertyType === "string" && propertyType.trim()) {
      options.propertyType = propertyType.trim();
    }
    if (typeof minSqft === "string" && minSqft.trim()) {
      options.minSqft = Number(minSqft);
    }
    if (typeof maxSqft === "string" && maxSqft.trim()) {
      options.maxSqft = Number(maxSqft);
    }

    const result = await FeaturePropertyService.getAllFeatures(options);
    return res.json(result);
  } catch (err: any) {
    console.error("getAllFeatureProperties:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
};

export const getAllHighlightProjects = async (req: Request, res: Response) => {
  try {
    const {
      page,
      limit,
      q,
      status,
      sortBy,
      sortOrder,
      type,
      city,
      state,
      locality,
    } = req.query;
    const options: any = {};
    if (typeof page === "string") options.page = Number(page);
    if (typeof limit === "string") options.limit = Number(limit);
    if (typeof q === "string") options.q = q;
    if (typeof status === "string") options.status = status;
    if (typeof sortBy === "string") options.sortBy = sortBy;
    options.sortOrder = sortOrder === "asc" ? "asc" : "desc";
    const result =
      await FeaturePropertyService.getAllHighlightProjects(options);
    return res.json(result);
  } catch (err: any) {
    console.error("getAllFeatureProperties:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
};

export const getHighlightProjectsByLocation = async (
  req: Request,
  res: Response,
) => {
  try {
    const { state, city, locality } = req.query as {
      state?: string;
      city?: string;
      locality?: string;
    };

    if (!state && !city && !locality) {
      return res.status(400).json({
        error: "At least one of state, city, or locality is required",
      });
    }

    const result = await FeaturePropertyService.getHighlightByLocation({
      ...(state && { state }),
      ...(city && { city }),
      ...(locality && { locality }),
    });

    return res.json(result);
  } catch (err: any) {
    console.error("getAllFeatureProperties:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
};

export const getCityFeatureProperties = async (req: Request, res: Response) => {
  try {
    let { locality, city, state } = req.query as {
      locality?: string;
      city?: string;
      state?: string;
    };

    if (!locality && !city && !state) {
      return res.status(400).json({
        error: "At least one of locality, city, or state is required",
      });
    }

    const clean = (v?: string) => v?.replace(/^['"]|['"]$/g, "").trim();

    locality = clean(locality);
    city = clean(city);
    state = clean(state);

    const result = await FeaturePropertyService.getFeaturesByCity({
      ...(locality && { locality }),
      ...(city && { city }),
      ...(state && { state }),
    });
    return res.json(result);
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
};

export const getSearchFeatureProperties = async (
  req: Request,
  res: Response,
) => {
  try {
  } catch (err: any) {
    console.error("getAllFeatureProperties:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
};

export const getFeatureBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    if (!slug) return res.status(400).json({ error: "Missing slug" });

    const doc = await FeaturePropertyService.getFeatureBySlug(slug);
    if (!doc) return res.status(404).json({ error: "Property not found" });

    return res.json({ data: doc });
  } catch (err: any) {
    console.error("getFeatureBySlug:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
};

export const getIndetailFeatureProperties = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing property ID" });
    const doc = await FeaturePropertyService.getFeatureById(id);
    if (!doc)
      return res.status(404).json({ error: "Feature property not found" });
    return res.json({ data: doc });
  } catch (err: any) {
    console.error("getIndetailFeatureProperties:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
};

export const editFeatureProperties = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing property ID" });

    const raw = { ...(req.body || {}) };
    const parsed = {
      ...raw,
      projectSummary: parseMaybeJSON(raw.projectSummary ?? raw.bhkSummary),
      bhkSummary: parseMaybeJSON(raw.projectSummary ?? raw.bhkSummary),
      specifications: parseMaybeJSON(raw.specifications),
      amenities: parseMaybeJSON(raw.amenities),
      nearbyPlaces: parseMaybeJSON(raw.nearbyPlaces),
      gallerySummary: parseMaybeJSON(raw.gallerySummary),
      sqftRange: parseMaybeJSON(raw.sqftRange),
      area: parseMaybeJSON(raw.area),
      leads: parseMaybeJSON(raw.leads),
      youtubeVideos: parseMaybeJSON(raw.youtubeVideos), // ⭐ ADD
    };

    const payload = UpdateFeaturePropertySchema.parse(
      parsed,
    ) as UpdateFeaturePropertyDTO;
    const files = req.files as
      | { [fieldname: string]: Express.Multer.File[] }
      | undefined;

    const updated = await FeaturePropertyService.updateFeatureProperty(
      id,
      payload,
      files,
      (req as AuthRequest).user,
    );
    if (!updated)
      return res.status(404).json({ error: "Feature property not found" });
    return res.json({ data: updated });
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(422).json({ errors: err.flatten() });
    }
    console.error("editFeatureProperties:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
};

export const deleteFeatureProperties = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing property ID" });
    const actor: {
      id?: string;
      name?: string;
      email?: string;
      roleName?: string;
    } = {};
    if (req.user?.id) actor.id = req.user.id;
    if (req.user?.name) actor.name = req.user.name;
    if (req.user?.email) actor.email = req.user.email;
    if (req.user?.roleName) actor.roleName = req.user.roleName;
    const deleted = await FeaturePropertyService.deleteFeatureProperty(
      id,
      Object.keys(actor).length ? actor : null,
    );
    if (!deleted)
      return res.status(404).json({ error: "Feature property not found" });
    return res.json({
      data: deleted,
      message: "Project deactivated successfully",
    });
  } catch (err: any) {
    console.error("deleteFeatureProperties:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
};

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

/** Hard delete — Super Admin + BDH only; project must already be soft-deleted. */
export const permanentlyDeleteFeatureProperties = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const role = normalizeActorRole(req.user?.roleName);
    if (!PERMANENT_DELETE_ROLES.has(role)) {
      return res.status(403).json({
        error:
          "Only Super Admin or Business Development Head can permanently delete projects",
      });
    }

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing property ID" });

    const deleted =
      await FeaturePropertyService.permanentlyDeleteFeatureProperty(id);
    if (!deleted)
      return res.status(404).json({ error: "Feature property not found" });

    return res.json({
      data: deleted,
      message: "Project permanently deleted",
    });
  } catch (err: any) {
    console.error("permanentlyDeleteFeatureProperties:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
};

export const deleteFeatureGalleryImage = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id, imageIndex } = req.params;

    if (!id || imageIndex === undefined) {
      return res.status(400).json({ message: "Missing params" });
    }

    const property = await FeatureProperty.findById(id);

    if (!property) {
      return res.status(404).json({ message: "Feature property not found" });
    }

    const index = Number(imageIndex);

    if (!property.gallerySummary?.[index]) {
      return res.status(404).json({ message: "Image not found" });
    }

    const image = property.gallerySummary[index];

    if (image.key) {
      await deleteS3ObjectIfExists(image.key);
    }

    property.gallerySummary.splice(index, 1);

    await property.save();

    return res.json({ success: true, data: property.gallerySummary });
  } catch (err: any) {
    console.error("deleteFeatureGalleryImage:", err);
    return res.status(500).json({ message: err.message });
  }
};

export const incrementFeatureClicks = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing property ID" });
    await FeaturePropertyService.incrementClicks(id);
    return res.json({ success: true, message: "Click recorded successfully" });
  } catch (err: any) {
    console.error("incrementFeatureClicks error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
};

/** State, city, locality, and builder lists for the projects board filters. */
export const getProjectBoardFilterOptions = async (
  req: Request,
  res: Response,
) => {
  try {
    const state =
      typeof req.query.state === "string" ? req.query.state : undefined;
    const city =
      typeof req.query.city === "string" ? req.query.city : undefined;
    const locality =
      typeof req.query.locality === "string" ? req.query.locality : undefined;
    const createdBy =
      typeof req.query.createdBy === "string" ? req.query.createdBy : undefined;
    if (createdBy && !mongoose.Types.ObjectId.isValid(createdBy)) {
      return res.status(400).json({ error: "Invalid createdBy" });
    }
    const data = await FeaturePropertyService.getProjectBoardFilterOptions({
      state,
      city,
      locality,
      createdBy,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error("getProjectBoardFilterOptions:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to load project filters" });
  }
};

/** Distinct cities/localities from featured projects for admin dropdowns */
export const getFeaturedLocationOptions = async (
  req: Request,
  res: Response,
) => {
  try {
    const state =
      typeof req.query.state === "string" ? req.query.state : undefined;
    const data = await FeaturePropertyService.getFeaturedLocationOptions(state);
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error("getFeaturedLocationOptions:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to load location options" });
  }
};
