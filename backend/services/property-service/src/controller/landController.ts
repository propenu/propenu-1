import { Request, Response } from "express";
import { ZodError } from "zod";
import { CreateLandSchema, UpdateLandSchema } from "../zod/landZod";
import LandService, { findRelatedLand } from "../services/landService";
import { AuthRequest } from "../middlewares/authMiddleware";
import LandPlot from "../models/landModel";
import { uploadFile } from "../utils/uploadFile";
import Location from "../models/locationModel";
import User from "../models/userModel";
import { syncListingFollowUpAfterLocation } from "../utils/listingFollowUpAssign";
import { sendManagerApprovalMail } from "../utils/sendManagerMail";
import mongoose from "mongoose";
import { readOwnerUserId } from "../utils/ownerUserFilter";
import { deleteS3ObjectIfExists } from "../utils/s3Helpers";
import {
  sendListingApprovedAgent,
  sendListingApprovedOwner,
  sendListingSubmittedVerification,
} from "../../../../shared/whatsapp/whatsapp.helper";
import {
  sendListingApprovedEmail,
  sendListingDeactivatedEmail,
  sendListingRejectedEmail,
} from "../../../../shared/email/email.helper";
import { sendTemplateNotification } from "../../../../shared/notifications/push.service";
import { notifySearchMatchesForListing } from "../services/searchMatchNotificationService";
import { notifyLifecycleEvent } from "../services/lifecycleNotificationService";
import {
  buildPostedByAudit,
  isDirectAgentRole,
  populateListingAuditFields,
  shouldSubmitListingForReview,
  stampListingApproved,
  submitAgentListingForReview,
} from "../utils/agentSubmission";
import { stripInlineMediaFromBasicStep } from "../utils/basicStepPayload";

/** helper to parse JSON-like values already handled by middleware; keep for safety */
function parseMaybeJSON<T = any>(value: any): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

const auditUserPopulate = [
  { path: "approvedBy", select: "name email phone role roleId" },
  { path: "lastUpdatedBy.userId", select: "name email phone role roleId" },
  { path: "updateHistory.userId", select: "name email phone role roleId" },
];

const SERVER_MANAGED_STEP_FIELDS = [
  "_id",
  "id",
  "__v",
  "approval",
  "approvalStatus",
  "approvedBy",
  "approvedAt",
  "createdAt",
  "updatedAt",
  "deactivatedAt",
  "deactivatedBy",
  "isPublished",
  "lastUpdatedBy",
  "meta",
  "postedBy",
  "promotion",
  "rejectedReason",
  "slug",
  "status",
  "subscriptionEndDate",
  "updateCount",
  "updateHistory",
  "updatedBy",
];

function sanitizeStepPayload(payload: any) {
  if (!payload || typeof payload !== "object") return {};
  const sanitized = stripInlineMediaFromBasicStep({ ...payload });
  for (const field of SERVER_MANAGED_STEP_FIELDS) {
    delete sanitized[field];
  }
  return sanitized;
}

/** CREATE */
export const createLand = async (req: Request, res: Response) => {
  try {
    const raw = { ...(req.body || {}) };
    const parsed = {
      ...raw,
      specifications: parseMaybeJSON(raw.specifications),
      amenities: parseMaybeJSON(raw.amenities),
      nearbyPlaces: parseMaybeJSON(raw.nearbyPlaces),
      gallery: parseMaybeJSON(raw.gallery),
      documents: parseMaybeJSON(raw.documents),
      leads: parseMaybeJSON(raw.leads),
      location: parseMaybeJSON(raw.location),
      approvedByAuthority: parseMaybeJSON(raw.approvedByAuthority),
      // soilTestReport / conversionCertificateFile / encumbranceCertificateFile
      soilTestReport: parseMaybeJSON(raw.soilTestReport),
      conversionCertificateFile: parseMaybeJSON(raw.conversionCertificateFile),
      encumbranceCertificateFile: parseMaybeJSON(
        raw.encumbranceCertificateFile,
      ),
    };

    // validate (throws ZodError)
    const payload = CreateLandSchema.parse(parsed) as any;
    const authUser = (req as AuthRequest).user;
    if (authUser?.id) {
      payload.createdBy ??= authUser.id;
      payload.postedBy = await buildPostedByAudit(
        LandPlot,
        payload.createdBy,
        payload.postedBy,
        authUser,
      );
    }

    console.log(payload);
    const files = req.files as
      | { [field: string]: Express.Multer.File[] }
      | undefined;

    const created = await LandService.create(payload as any, files);

    // return created document (lean)
    return res.status(201).json({ data: created });
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(422).json({ errors: err.flatten() });
    }
    if (err && err.code === "SLUG_TAKEN") {
      return res.status(409).json({ error: "Slug already in use" });
    }
    console.error("createLand:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
};

/** LIST */
export const getAllLands = async (req: Request, res: Response) => {
  try {
    // simple pagination/filtering
    const options: any = {};
    const { page, limit, q, city, status, createdBy, postedBy, postedByUserId } =
      req.query;
    if (typeof page === "string") options.page = Number(page);
    if (typeof limit === "string") options.limit = Number(limit);
    if (typeof q === "string") options.q = q;
    if (typeof city === "string") options.city = city;
    if (typeof status === "string") options.status = status;
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

    const result = await LandService.list(options);

    const formattedItems = result.items.map((item: any) => ({
      ...item,
      displayType: item.promotion?.type || "normal",
    }));

    return res.json({
      ...result,
      items: formattedItems,
    });
  } catch (err: any) {
    console.error("getAllLands:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
};

export const getMyLandDraft = async (req: AuthRequest, res: Response) => {
  const statusFilter = isDirectAgentRole(req.user?.roleName)
    ? "draft"
    : { $in: ["draft", "pending"] };

  const draft = await LandPlot.findOne({
    createdBy: req.user!.id,
    status: statusFilter,
  })
    .populate("createdBy", "name email phone role roleId")
    .populate("createdBy.roleId", "name label")
    .populate(auditUserPopulate)
    .lean();

  if (!draft) {
    return res.status(404).json({ error: "No draft found for this user" });
  }

  res.json({ data: draft });
};

/** GET BY SLUG */
export const getLandBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    if (!slug) {
      return res.status(400).json({ error: "Missing slug" });
    }

    // 1️⃣ Fetch property
    const property = await LandService.getBySlug(slug);
    if (!property) {
      return res.status(404).json({ error: "Not found" });
    }

    // 2️⃣ Find related land properties
    const relatedProjects = await findRelatedLand(property);

    // 3️⃣ Response
    return res.json({
      data: property,
      relatedProjects,
    });
  } catch (err: any) {
    console.error("getLandBySlug:", err);
    return res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
};

/** GET DETAIL BY ID */
export const getLandDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing id" });
    const doc = await LandService.getById(id, true);
    if (!doc) return res.status(404).json({ error: "Not found" });

    return res.json({ data: doc });
  } catch (err: any) {
    console.error("getLandDetail:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
};

/** UPDATE */
export const editLand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing id" });

    const raw = { ...(req.body || {}) };
    const parsed = {
      ...raw,
      specifications: parseMaybeJSON(raw.specifications),
      amenities: parseMaybeJSON(raw.amenities),
      nearbyPlaces: parseMaybeJSON(raw.nearbyPlaces),
      gallery: parseMaybeJSON(raw.gallery),
      documents: parseMaybeJSON(raw.documents),
      leads: parseMaybeJSON(raw.leads),
      location: parseMaybeJSON(raw.location),
      approvedByAuthority: parseMaybeJSON(raw.approvedByAuthority),
      soilTestReport: parseMaybeJSON(raw.soilTestReport),
      conversionCertificateFile: parseMaybeJSON(raw.conversionCertificateFile),
      encumbranceCertificateFile: parseMaybeJSON(
        raw.encumbranceCertificateFile,
      ),
    };

    const payload = UpdateLandSchema.parse(parsed);

    const files = req.files as
      | { [field: string]: Express.Multer.File[] }
      | undefined;

    const updated = await LandService.update(id, payload as any, files);
    if (!updated) return res.status(404).json({ error: "Not found" });

    const fresh = await LandService.getById(id);
    return res.json({ data: fresh });
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(422).json({ errors: err.flatten() });
    }
    if (err && err.code === "SLUG_TAKEN") {
      return res.status(409).json({ error: "Slug already in use" });
    }
    console.error("editLand:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
};

/** DELETE */
export const deleteLand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing id" });

    const deleted = await LandService.delete(id);
    if (!deleted) return res.status(404).json({ error: "Not found" });

    return res.json({ data: deleted, message: "Deleted" });
  } catch (err: any) {
    console.error("deleteLand:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
};

export const createLandDraft = async (req: AuthRequest, res: Response) => {
  try {
    const statusFilter = isDirectAgentRole(req.user?.roleName)
      ? "draft"
      : { $in: ["draft", "pending"] };
    const listingType =
      req.body?.listingType === "rent" || req.body?.listingType === "lease"
        ? req.body.listingType
        : "sale";

    const existing = await LandPlot.findOne({
      createdBy: req.user!.id,
      status: statusFilter,
    });

    if (existing) {
      if (existing.listingType !== listingType) {
        existing.listingType = listingType;
        await existing.save();
      }
      const populated = await populateListingAuditFields(LandPlot, existing._id);
      return res.status(200).json({ data: populated ?? existing });
    }

    const draft = await LandPlot.create({
      createdBy: req.user!.id,
      status: "draft",
      listingType,
      title: "Draft Land Plot Property", // explicit
      completion: {
        percent: 0,
        step: 1,
        lastSection: "basic",
      },
    });

    const populated = await populateListingAuditFields(LandPlot, draft._id);
    return res.status(201).json({ data: populated ?? draft });
  } catch (err: any) {
    console.error("createLandDraft:", err);
    return res.status(500).json({
      error: "Failed to create land draft",
    });
  }
};

export const updateLandBasicStep = async (req: AuthRequest, res: Response) => {
  const doc = await LandPlot.findById(req.params.id);
  if (!doc) {
    return res.status(404).json({ error: "Land draft not found" });
  }

  Object.assign(doc, sanitizeStepPayload(req.body));

  doc.completion = {
    ...doc.completion,
    percent: 25,
    step: 2,
    lastSection: "basic",
  };

  await doc.save(); // 🔥 title + slug build here

  const fresh = await populateListingAuditFields(LandPlot, doc._id);
  res.json({ data: fresh ?? doc });
};

export const updateLandLocationStep = async (
  req: AuthRequest,
  res: Response,
) => {
  const doc = await LandPlot.findById(req.params.id);
  if (!doc) {
    return res.status(404).json({ error: "Land draft not found" });
  }

  Object.assign(doc, {
    address: req.body.address,
    city: req.body.city,
    state: req.body.state,
    pincode: req.body.pincode,
    locality: req.body.locality,
    location: req.body.location,
    landName: req.body.landName,
    nearbyPlaces: req.body.nearbyPlaces,
  });

  doc.completion = {
    ...doc.completion,
    percent: 45,
    step: 3,
    lastSection: "location",
  };

  await syncListingFollowUpAfterLocation(doc);

  await doc.save(); // 🔥 title improves with location

  if (doc.city && doc.locality) {
    const coordinates = doc.location?.coordinates || [0, 0];

    // Step 1 — find city doc
    let cityDoc = await Location.findOne({
      city: doc.city,
      state: doc.state,
    });

    // Step 2 — if city not exists → create
    if (!cityDoc) {
      await Location.create({
        city: doc.city,
        state: doc.state,
        category: "land",
        localities: [
          {
            name: doc.locality,
            location: {
              type: "Point",
              coordinates,
            },
          },
        ],
      });
    } else {
      // Step 3 — check if locality exists
      const exists = cityDoc.localities.some(
        (loc: any) => loc.name.toLowerCase() === doc.locality.toLowerCase(),
      );

      // Step 4 — push new locality if not exists
      if (!exists) {
        cityDoc.localities.push({
          name: doc.locality,
          location: {
            type: "Point",
            coordinates,
          },
        });

        await cityDoc.save();
      }
    }
  }

  const fresh = await populateListingAuditFields(LandPlot, doc._id);
  res.json({ data: fresh ?? doc });
};

export const updateLandDetailsStep = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const files = req.files as
      | { [field: string]: Express.Multer.File[] }
      | undefined;

    const parsed = {
      ...req.body,
      approvedByAuthority: parseMaybeJSON(req.body.approvedByAuthority),
      dimensions: parseMaybeJSON(req.body.dimensions),
    };

    const updated = await LandService.update(
      req.params.id,
      {
        ...parsed,
        completion: {
          percent: 70,
          step: 4,
          lastSection: "details",
        },
      },
      files,
    );

    if (!updated) {
      return res.status(404).json({ error: "Land draft not found" });
    }

    const fresh = await LandService.getById(req.params.id);
    if (await shouldSubmitListingForReview(LandPlot, req.params.id, req.user, fresh)) {
      await submitAgentListingForReview(
        LandPlot,
        req.params.id,
        req.user,
      );
      const submitted = await populateListingAuditFields(LandPlot, req.params.id);
      return res.json({ data: submitted ?? fresh });
    }

    const populated = await populateListingAuditFields(LandPlot, req.params.id);
    return res.json({ data: populated ?? fresh });
  } catch (err: any) {
    console.error("updateLandDetailsStep:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
};

export const finalizeLand = async (req: AuthRequest, res: Response) => {
  try {
    const property = await LandPlot.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    const files = req.files as
      | { [field: string]: Express.Multer.File[] }
      | undefined;

    const verificationFiles = files?.verificationDocuments ?? [];

    // ---------- Upload Docs ----------
    if (verificationFiles.length > 0) {
      property.verificationDocuments ??= [];

      for (const file of verificationFiles) {
        const up = await uploadFile({
          filePath: file.path,
          originalName: file.originalname,
          mimetype: file.mimetype,
          folder: "land/verification",
          entityId: property._id.toString(),
        });

        property.verificationDocuments.push({
          type: req.body.verificationType,
          title: file.originalname,
          url: up.url,
          key: up.key,
          filename: file.originalname,
          mimetype: file.mimetype,
          status: "pending",
        });
      }
    }

    // ---------- Check verified ----------
    const hasVerified = Boolean(
      property.verificationDocuments?.some(
        (doc: any) => doc.status === "verified",
      ),
    );
    const hasVerificationDocuments = Boolean(
      property.verificationDocuments?.length,
    );

    property.completion ??= {
      percent: 0,
      step: 1,
      lastSection: "verification",
    };

    property.completion.lastSection = "verification";

    const role = req.user?.roleName;

    if (verificationFiles.length > 0) {
      if (role === "sales_agent") {
        property.status = "pending";
        property.isPublished = false;
        property.completion.percent = 80;
        property.completion.step = 4;

        property.approval ??= {};
        property.approval.isApprovedByManager = false;
        property.approval.approvalToken = crypto.randomUUID();

        const agent = await User.findById(property.createdBy).populate(
          "managerId",
        );

        if (agent?.managerId && (agent.managerId as any).email) {
          await sendManagerApprovalMail({
            managerEmail: (agent.managerId as any).email,
            property: {
              id: property._id,
              title: property.title,
              price: property.price,
              city: property.city,
              locality: property.locality,
              image: property.gallery?.[0]?.url,
              area: property.plotArea,
            },
            agent: {
              name: agent.name,
              email: agent.email,
            },
            token: property.approval.approvalToken,
          });
        }
      } else if (hasVerified) {
        property.status = "active";
        property.isPublished = true;
        property.completion.percent = 100;
        property.completion.step = 5;
      } else {
        property.status = "pending";
        property.isPublished = false;
        property.completion.percent = 80;
        property.completion.step = 4;
      }
    } else if (hasVerificationDocuments) {
      property.status = hasVerified ? "active" : "pending";
      property.isPublished = hasVerified;
      property.completion.percent = hasVerified ? 100 : 80;
      property.completion.step = hasVerified ? 5 : 4;
    } else {
      property.status = "draft";
      property.isPublished = false;
      property.completion.percent = 80;
      property.completion.step = 4;
    }

    if (property.status !== "draft") {
      property.postedBy = await buildPostedByAudit(
        LandPlot,
        property.createdBy,
        property.postedBy,
        req.user,
      );
    }

    await property.save();

    const fresh = await LandPlot.findById(property._id)
      .populate("createdBy", "name email phone role roleId")
      .populate("createdBy.roleId", "name label")
      .lean();

    try {
      const owner: any = fresh?.createdBy;

      if (owner?.phone && owner?.name) {
        console.log("📩 Sending listing submitted WhatsApp message...");

        await sendListingSubmittedVerification(
          owner.phone,
          owner.name,
          property.title || "Property",
        );

        console.log("✅ Listing submitted WhatsApp sent");
      }
    } catch (err) {
      console.error("⚠️ WhatsApp listing message failed:", err);
    }

    return res.json({
      success: true,
      verified: hasVerified,
      data: fresh,
    });
  } catch (err: any) {
    console.error("finalizeLand:", err);
    return res.status(500).json({ message: err.message });
  }
};

export const getAllLandDraftsForAdmin = async (req: Request, res: Response) => {
  try {
    const { page = "1", limit = "20", q, city, userId } = req.query;

    const filter: any = { status: "draft" };

    if (city) filter.city = city;
    if (userId) filter.createdBy = userId;

    if (q) {
      filter.$or = [
        { title: new RegExp(q as string, "i") },
        { locality: new RegExp(q as string, "i") },
        { city: new RegExp(q as string, "i") },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      LandPlot.find(filter)
        .populate("createdBy", "name email phone role roleId")
        .populate("createdBy.roleId", "name label")
        .populate(auditUserPopulate)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),

      LandPlot.countDocuments(filter),
    ]);

    res.json({
      items,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err: any) {
    console.error("getAllLandDraftsForAdmin:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
};

export const verifyLandDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    let { documentIndex, status = "verified", rejectedReason = "" } =
      req.body ?? {};

    if (!["verified", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status (must be verified or rejected)",
      });
    }

    if (status === "rejected" && typeof rejectedReason !== "string") {
      return res.status(400).json({
        success: false,
        message: "Rejected reason must be a string",
      });
    }

    documentIndex =
      documentIndex === undefined || documentIndex === null || documentIndex === ""
        ? 0
        : Number(documentIndex);

    if (!Number.isInteger(documentIndex) || documentIndex < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid document index (must be zero or a positive integer)",
      });
    }

    const existingProperty = await LandPlot.findById(id)
      .select("status createdBy postedBy ownerId")
      .populate("createdBy", "roleName role name email");
    if (!existingProperty) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }
    const { assertCanApproveListing } = await import(
      "../utils/listingApprovalGuard"
    );
    if (
      !assertCanApproveListing(req, res, existingProperty, [
        "land:verify_document",
        "land:approve",
      ])
    ) {
      return;
    }

    const updated = await LandService.verifyDocument(
      id,
      documentIndex,
      status,
      rejectedReason,
      req.user?.id ?? null,
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    if ((updated as any).success === false) {
      return res.status((updated as any).status || 400).json(updated);
    }

    const notificationStatus = {
      email: false,
      whatsapp: false,
      push: false,
    };

    if (existingProperty?.status !== "active" && updated.status === "active") {
      void notifySearchMatchesForListing({
        listing: updated as any,
        kind: "property",
        category: "land",
      });

      try {
        const userId = (updated as any).createdBy || (updated as any).ownerId;
        const user = await User.findById(userId).populate("roleId").lean();
        const propertyTitle = (updated as any).title || "Property";
        const propertyLocation =
          (updated as any).city || (updated as any).locality || "your area";
        const userRole =
          (user as any)?.roleId?.name || (user as any)?.roleName || "";
        const isAgent = isDirectAgentRole(userRole);
        const propertiesLink = isAgent
          ? `${process.env.FRONTEND_URL || "https://propenu.com"}/agent/my-properties`
          : `${process.env.FRONTEND_URL || "https://propenu.com"}/my-properties`;

        if (user?.email && user?.name) {
          await sendListingApprovedEmail(
            user.email,
            user.name,
            propertyTitle,
            {
              roleName: isAgent ? "sales_agent" : "owner",
              location: propertyLocation,
              link: propertiesLink,
            },
          );
          notificationStatus.email = true;
        }

        if (user?.phone && user?.name) {
          if (isAgent) {
            await sendListingApprovedAgent(user.phone, [user.name, propertyTitle]);
          } else {
            await sendListingApprovedOwner(user.phone, [user.name, propertyTitle]);
          }
          notificationStatus.whatsapp = true;
        }

        const pushResult = await sendTemplateNotification({
          userId,
          token: user?.fcmToken || undefined,
          templateKey: "PROPERTY_APPROVED",
          data: {
            name: user?.name || "User",
            propertyTitle,
          },
        });
        if ((pushResult?.successCount ?? 0) > 0) {
          notificationStatus.push = true;
        }
        await notifyLifecycleEvent({
          type: "property_approved",
          listing: updated as any,
          kind: "property",
          category: "land",
          userId,
          sendPush: false,
        });
      } catch (notifyError) {
        console.error("Notification error:", notifyError);
      }
    }

    if (status === "rejected") {
      try {
        const userId = (updated as any).createdBy || (updated as any).ownerId;
        const user = await User.findById(userId).populate("roleId").lean();
        const propertyTitle = (updated as any).title || "Property";
        const propertyLocation =
          (updated as any).city || (updated as any).locality || "your area";
        const reason = (updated as any).rejectedReason || rejectedReason || "";
        const userRole =
          (user as any)?.roleId?.name || (user as any)?.roleName || "";
        const isAgent = isDirectAgentRole(userRole);
        const propertiesLink = isAgent
          ? `${process.env.FRONTEND_URL || "https://propenu.com"}/agent/my-properties`
          : `${process.env.FRONTEND_URL || "https://propenu.com"}/my-properties`;

        if (user?.email && user?.name && !(user as any)?.isUnsubscribedToEmail) {
          await sendListingRejectedEmail(
            user.email,
            user.name,
            propertyTitle,
            {
              roleName: isAgent ? "sales_agent" : "owner",
              location: propertyLocation,
              reason,
              link: propertiesLink,
            },
          );
          notificationStatus.email = true;
        }

        const pushResult = await sendTemplateNotification({
          userId,
          token: user?.fcmToken || undefined,
          templateKey: "PROPERTY_REJECTED",
          data: {
            name: user?.name || "User",
            propertyTitle,
            rejectedReason: reason,
          },
        });
        if ((pushResult?.successCount ?? 0) > 0) {
          notificationStatus.push = true;
        }
        await notifyLifecycleEvent({
          type: "property_rejected",
          listing: updated as any,
          kind: "property",
          category: "land",
          userId,
          rejectedReason: reason,
          sendPush: false,
        });
      } catch (notifyError) {
        console.error("Rejection notification error:", notifyError);
      }
    }

    res.json({
      success: true,
      verified: updated.status === "active",
      notifications: notificationStatus,
      data: updated,
    });
  } catch (err: any) {
    console.error("verifyResidentialDocument:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};

export const approveLandProperty = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { token } = req.body;

    const property = await LandPlot.findById(id);
    if (!property)
      return res.status(404).json({ message: "Property not found" });

    if (!property.approval?.approvalToken)
      return res.status(400).json({ message: "No approval required" });

    if (property.approval.approvalToken !== token)
      return res.status(400).json({ message: "Invalid approval link" });

    stampListingApproved(property, req.user?.id ?? null);
    if (property.approval) {
      (property.approval as any).isApprovedByManager = true;
      property.approval.approvalToken = undefined;
    }

    await property.save();
    void notifySearchMatchesForListing({
      listing: property as any,
      kind: "property",
      category: "land",
    });

    const notificationStatus = {
      email: false,
      whatsapp: false,
      push: false,
    };

    try {
      const agent = await User.findById(property.createdBy).populate("roleId").lean();
      const propertyTitle = property.title || "Property";
      const propertyLocation = property.city || property.locality || "your area";
      const agentRole =
        (agent as any)?.roleId?.name || (agent as any)?.roleName || "";
      const isAgent = isDirectAgentRole(agentRole);
      const propertiesLink = isAgent
        ? `${process.env.FRONTEND_URL || "https://propenu.com"}/agent/my-properties`
        : `${process.env.FRONTEND_URL || "https://propenu.com"}/my-properties`;

      if (agent?.email && agent?.name) {
        await sendListingApprovedEmail(
          agent.email,
          agent.name,
          propertyTitle,
          {
            roleName: isAgent ? "sales_agent" : "owner",
            location: propertyLocation,
            link: propertiesLink,
          },
        );
        notificationStatus.email = true;
      }

      if (agent?.phone && agent?.name) {
        if (isAgent) {
          await sendListingApprovedAgent(agent.phone, [
            agent.name,
            propertyTitle,
          ]);
        } else {
          await sendListingApprovedOwner(agent.phone, [
            agent.name,
            propertyTitle,
          ]);
        }
        notificationStatus.whatsapp = true;
      }

      const pushResult = await sendTemplateNotification({
        userId: (agent as any)?._id,
        token: agent?.fcmToken || undefined,
        templateKey: "PROPERTY_APPROVED",
        data: {
          name: agent?.name || "User",
          propertyTitle,
        },
      });
      if ((pushResult?.successCount ?? 0) > 0) {
        notificationStatus.push = true;
      }
      await notifyLifecycleEvent({
        type: "property_approved",
        listing: property as any,
        kind: "property",
        category: "land",
        userId: (agent as any)?._id,
        sendPush: false,
      });
    } catch (err) {
      console.error("Approval notification sending failed:", err);
    }

    res.json({
      success: true,
      message: "Property approved successfully",
      propertyId: property._id,
      notifications: notificationStatus,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const deactivateLandProperty = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;

    const property = await LandPlot.findById(id);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    property.status = "deactivated";
    property.isPublished = false;
    property.updatedBy = new mongoose.Types.ObjectId(req.user!.id);
    await property.save();

    try {
      const ownerId = property.createdBy || (property as any).ownerId;
      const owner = await User.findById(ownerId).populate("roleId").lean();
      if (owner?.email && owner?.name && !(owner as any)?.isUnsubscribedToEmail) {
        const userRole = (owner as any)?.roleId?.name || (owner as any)?.roleName || "";
        const isAgent = isDirectAgentRole(userRole);
        const propertyLocation =
          property.city ||
          property.locality ||
          (property as any).address ||
          (typeof (property as any).location === "object" && (property as any).location?.city) ||
          "your area";
        await sendListingDeactivatedEmail(
          owner.email,
          owner.name,
          property.title || "Your Property",
          {
            roleName: isAgent ? "sales_agent" : "owner",
            location: propertyLocation,
          },
        );
      }
    } catch (emailErr) {
      console.error("[deactivateLandProperty] email error:", emailErr);
    }

    res.json({
      success: true,
      message: "Property deactivated",
      data: property,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const deleteLandGalleryImage = async (req: Request, res: Response) => {
  try {
    const { id, imageIndex } = req.params;
    if (!id || imageIndex === undefined) {
      return res.status(400).json({ message: "Missing params" });
    }
    const property = await LandPlot.findById(id);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }
    const index = Number(imageIndex);
    if (!property.gallery?.[index]) {
      return res.status(404).json({ message: "Image not found" });
    }
    const image = property.gallery[index];
    if (image.key) {
      await deleteS3ObjectIfExists(image.key);
    }
    property.gallery.splice(index, 1);
    await property.save();
    res.json({ success: true, data: property.gallery });
  } catch (err: any) {
    console.error("deleteGalleryImage:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};
