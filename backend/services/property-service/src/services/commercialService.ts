import mongoose from "mongoose";
import s3 from "../config/s3";
import dotenv from "dotenv";
import Commercial from "../models/commercialModel";
import User from "../models/userModel";
import Role from "../models/roleModel";
import { cleanupUploadedFile, uploadFile } from "../utils/uploadFile";
import { extendCommercialFilters } from "./filters/commercialFilters";
import { upsertActiveListingCityAndLocality } from "./locationServices";
import { findRankedRelatedProperties } from "./relatedPropertyUtils";
import {
  createWatermarkedBuffer,
  getUploadedFileBuffer,
} from "../utils/imageProcessing";
import {
  getCreatedByRoleName,
  isAgentReviewProperty,
  restoreCreatedById,
  stampListingApproved,
  stampListingRejected,
} from "../utils/agentSubmission";
import { applyOwnerUserFilter, ownerListLimit } from "../utils/ownerUserFilter";
dotenv.config({ quiet: true });

type MulterFiles = { [field: string]: Express.Multer.File[] } | undefined;

const auditUserPopulate = [
  { path: "approvedBy", select: "name email phone role roleId" },
  { path: "lastUpdatedBy.userId", select: "name email phone role roleId" },
  { path: "updateHistory.userId", select: "name email phone role roleId" },
];

/* -------------------- Helpers -------------------- */

function getUploadSource(file: Express.Multer.File) {
  if (file.buffer && Buffer.isBuffer(file.buffer)) {
    return { buffer: file.buffer };
  }

  if (file.path) {
    return { filePath: file.path };
  }

  return { buffer: getUploadedFileBuffer(file) };
}

function normalizePayload(obj: any) {
  if (!obj) return obj;
  if (typeof obj.title === "string") obj.title = obj.title.trim();
  if (obj.price === "") obj.price = undefined;
  if (obj.createdBy) obj.createdBy = String(obj.createdBy);
  if (Array.isArray(obj.amenities))
    obj.amenities = normalizeAmenitiesInput(obj.amenities);
  return obj;
}

const SERVER_MANAGED_UPDATE_FIELDS = [
  "_id",
  "id",
  "__v",
  "createdBy",
  "updatedBy",
  "createdAt",
  "updatedAt",
  "postedBy",
  "lastUpdatedBy",
  "updateHistory",
  "updateCount",
  "approvedBy",
  "approvedAt",
  "approval",
  "approvalStatus",
  "isPublished",
  "meta",
  "promotion",
  "slug",
  "propertyCode",
];

function sanitizeUpdatePayload(payload: any) {
  if (!payload || typeof payload !== "object") return {};
  const sanitized = { ...payload };
  for (const field of SERVER_MANAGED_UPDATE_FIELDS) {
    delete sanitized[field];
  }
  return sanitized;
}

function normalizeAmenityKey(value?: string) {
  if (!value || typeof value !== "string") return value;
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeAmenitiesInput(amenities?: any[]) {
  if (!Array.isArray(amenities)) return amenities;
  return amenities.map((a) => {
    if (!a || typeof a !== "object") return a;
    const normalized = { ...a };
    const sourceKey = normalized.key ?? normalized.title;
    const normalizedKey = normalizeAmenityKey(sourceKey);
    if (normalizedKey) normalized.key = normalizedKey;
    return normalized;
  });
}

function normalizeCreatedByRoleFilterToken(token: string) {
  const normalized = token.trim().toLowerCase().replace(/[-\s]+/g, "_");

  if (
    ["owner", "owners", "user", "property_owner", "property_owners", "seller", "sellers"].includes(
      normalized,
    )
  ) return "user";
  if (["agent", "agents", "sales_agent", "sales_manager"].includes(normalized)) {
    return "agent";
  }
  if (["builder", "builders"].includes(normalized)) return "builder";

  return normalized;
}

export async function findRelatedCommercial(property: any) {
  if (!property?._id) return [];

  return findRankedRelatedProperties(Commercial, property, {
    select:
      "title slug price city locality builtUpArea gallery propertyType listingType furnishedStatus parkingDetails constructionStatus",
    numericBands: [
      { field: "price", tolerance: 0.3, points: 20 },
      { field: "builtUpArea", tolerance: 0.25, points: 18 },
    ],
  });
}

async function deleteS3ObjectIfExists(key?: string) {
  if (!key) return;
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return;
  try {
    await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
  } catch (e: any) {
    console.error(
      "deleteS3ObjectIfExists failed for key:",
      key,
      e?.message || e,
    );
  }
}

/* -------------------- gallery helper -------------------- */

async function mapAndUploadGallery({
  incomingGallery,
  galleryFiles,
  propertyId,
}: {
  incomingGallery?: any[];
  galleryFiles?: Express.Multer.File[];
  propertyId: string;
}): Promise<any[]> {
  const files = galleryFiles ?? [];
  const summary = Array.isArray(incomingGallery) ? incomingGallery.slice() : [];

  const filesByName = new Map<string, Express.Multer.File>();
  for (const f of files) filesByName.set(f.originalname, f);

  for (let i = 0; i < files.length; i++) {
    if (i >= summary.length) summary.push({});
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;

    let matchedIndex = -1;
    for (let j = 0; j < summary.length; j++) {
      const declaredName =
        summary[j]?.filename ?? summary[j]?.fileName ?? summary[j]?.file;
      if (declaredName && declaredName === file.originalname) {
        matchedIndex = j;
        break;
      }
    }
    if (matchedIndex === -1) matchedIndex = i;

    const imageBuffer = getUploadedFileBuffer(file);
    const watermarkedBuffer = await createWatermarkedBuffer(imageBuffer);

    const up = await uploadFile({
      buffer: watermarkedBuffer,
      originalName: file.originalname,
      mimetype: file.mimetype,
      propertyId,
      folder: "commercial/gallery",
    });
    cleanupUploadedFile(file.path);

    if (!summary[matchedIndex]) summary[matchedIndex] = {};
    summary[matchedIndex].url = up.url;
    summary[matchedIndex].key = up.key;
    summary[matchedIndex].filename = file.originalname;
    if (!summary[matchedIndex].title)
      summary[matchedIndex].title = file.originalname;
    if (!summary[matchedIndex].order)
      summary[matchedIndex].order = matchedIndex + 1;
  }

  return summary;
}

/* -------------------- Service API -------------------- */

export const CommercialService = {
  async create(payload: any, files?: MulterFiles) {
    let toCreate = normalizePayload({ ...payload });

    // preliminary instance for id
    const preliminary = new Commercial(toCreate);
    const propId = preliminary._id
      ? preliminary._id.toString()
      : String(Date.now());

    // gallery
    const galleryFiles = files?.galleryFiles ?? [];
    const mappedGallery = await mapAndUploadGallery({
      incomingGallery: toCreate.gallery,
      galleryFiles,
      propertyId: propId,
    });
    toCreate.gallery = Array.isArray(mappedGallery) ? mappedGallery : [];

    // documents
    const documentsFiles = files?.documents ?? [];
    if (documentsFiles.length > 0) {
      const docRefs: any[] = Array.isArray(toCreate.documents)
        ? toCreate.documents.slice()
        : [];
      for (const f of documentsFiles) {
        const up = await uploadFile({
          ...getUploadSource(f),
          originalName: f.originalname,
          mimetype: f.mimetype,
          propertyId: propId,
          folder: "commercial/documents",
        });
        docRefs.push({
          title: f.originalname,
          url: up.url,
          key: up.key,
          filename: f.originalname,
          mimetype: f.mimetype,
        });
      }
      toCreate.documents = docRefs;
    }

    // leaseDocuments
    const leaseFiles = files?.leaseDocuments ?? [];
    if (leaseFiles.length > 0) {
      toCreate.leaseDocuments = Array.isArray(toCreate.leaseDocuments)
        ? toCreate.leaseDocuments.slice()
        : [];
      for (const f of leaseFiles) {
        const up = await uploadFile({
          ...getUploadSource(f),
          originalName: f.originalname,
          mimetype: f.mimetype,
          propertyId: propId,
          folder: "commercial/leases",
        });
        toCreate.leaseDocuments.push({
          title: f.originalname,
          url: up.url,
          key: up.key,
          filename: f.originalname,
          mimetype: f.mimetype,
        });
      }
    }

    // fireNOCFile (single)
    const fireFiles = files?.fireNOCFile;
    const firstFire = fireFiles?.[0];
    if (firstFire) {
      const up = await uploadFile({
        ...getUploadSource(firstFire),
        originalName: firstFire.originalname,
        mimetype: firstFire.mimetype,
        propertyId: propId,
        folder: "commercial/fire",
      });
      toCreate.fireNOCFile = {
        url: up.url,
        key: up.key,
        filename: firstFire.originalname,
        mimetype: firstFire.mimetype,
      };
    }

    // occupancyCertificateFile (single)
    const occFiles = files?.occupancyCertificateFile;
    const firstOcc = occFiles?.[0];
    if (firstOcc) {
      const up = await uploadFile({
        ...getUploadSource(firstOcc),
        originalName: firstOcc.originalname,
        mimetype: firstOcc.mimetype,
        propertyId: propId,
        folder: "commercial/occupancy",
      });
      toCreate.occupancyCertificateFile = {
        url: up.url,
        key: up.key,
        filename: firstOcc.originalname,
        mimetype: firstOcc.mimetype,
      };
    }

    const createdDoc = await Commercial.create(toCreate);

    await upsertActiveListingCityAndLocality(createdDoc);
    const populated = await Commercial.findById(createdDoc._id)
      .populate("createdBy", "name email phone role roleId")
      .populate("createdBy.roleId", "name label")
      .lean()
      .exec();
    return (
      populated ?? (createdDoc.toObject ? createdDoc.toObject() : createdDoc)
    );
  },

  async update(id: string, payload: any, files?: MulterFiles) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");
    const existing = await Commercial.findById(id);
    if (!existing) return null;
    const safePayload = normalizePayload(sanitizeUpdatePayload(payload));
    if (Array.isArray(safePayload?.amenities)) {
      safePayload.amenities = normalizeAmenitiesInput(safePayload.amenities);
    }

    // slug/title changes (use any cast to avoid strict typing issues)
    const exAny: any = existing;
    if (
      (safePayload.slug && safePayload.slug !== exAny.slug) ||
      (safePayload.title && safePayload.title !== exAny.title)
    ) {
      const slugSource =
        (safePayload.slug && String(safePayload.slug).trim()) ||
        (safePayload.title as string);
      const slug = slugSource
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const found = await Commercial.findOne({ slug }).select("_id").lean();
      if (found && found._id.toString() !== id) {
        const err: any = new Error("Slug already in use");
        err.code = "SLUG_TAKEN";
        throw err;
      }
      exAny.slug = slug;
    }

    // shallow merge of payload onto existing
    Object.keys(safePayload || {}).forEach((k) => {
      (existing as any)[k] = (safePayload as any)[k];
    });

    const propId = existing._id ? existing._id.toString() : String(Date.now());

    // gallery merge & upload
    const galleryFiles = files?.galleryFiles ?? [];
    const incomingGallery = (safePayload as any).gallery;
    (existing as any).gallery = Array.isArray((existing as any).gallery)
      ? (existing as any).gallery
      : [];
    if (Array.isArray(incomingGallery)) {
      for (let i = 0; i < incomingGallery.length; i++) {
        const inc = incomingGallery[i];
        if (i < (existing as any).gallery.length)
          (existing as any).gallery[i] = {
            ...(existing as any).gallery[i],
            ...inc,
          };
        else (existing as any).gallery.push({ ...inc });
      }
    }

    if (galleryFiles.length > 0) {
      const filesByName = new Map<string, Express.Multer.File>();
      for (const f of galleryFiles) filesByName.set(f.originalname, f);

      for (
        let i = 0;
        i < (existing as any).gallery.length && filesByName.size > 0;
        i++
      ) {
        const entry = (existing as any).gallery[i] as any;
        const declared = entry?.filename ?? entry?.fileName ?? entry?.file;
        if (declared && filesByName.has(declared)) {
          const f = filesByName.get(declared);
          if (!f) continue;
          const imageBuffer = getUploadedFileBuffer(f);
          const watermarkedBuffer = await createWatermarkedBuffer(imageBuffer);
          const up = await uploadFile({
            buffer: watermarkedBuffer,
            originalName: f.originalname,
            mimetype: f.mimetype,
            propertyId: propId,
            folder: "commercial/gallery",
          });
          cleanupUploadedFile(f.path);
          entry.url = up.url;
          entry.key = up.key;
          entry.filename = f.originalname;
          filesByName.delete(declared);
        }
      }

      const remainingFiles = Array.from(filesByName.values());
      for (const file of remainingFiles) {
        const imageBuffer = getUploadedFileBuffer(file);
        const watermarkedBuffer = await createWatermarkedBuffer(imageBuffer);
        const up = await uploadFile({
          buffer: watermarkedBuffer,
          originalName: file.originalname,
          mimetype: file.mimetype,
          propertyId: propId,
          folder: "commercial/gallery",
        });
        cleanupUploadedFile(file.path);
        const emptySlotIndex = (existing as any).gallery.findIndex(
          (e: any) => !e.url,
        );
        if (emptySlotIndex >= 0) {
          const slot = (existing as any).gallery[emptySlotIndex] as any;
          if (slot) {
            slot.url = up.url;
            slot.key = up.key;
            slot.filename = file.originalname;
            if (!slot.title) slot.title = file.originalname;
            if (!slot.order) slot.order = emptySlotIndex + 1;
          } else {
            (existing as any).gallery.push({
              title: file.originalname,
              url: up.url,
              key: up.key,
              filename: file.originalname,
              order: ((existing as any).gallery.length || 0) + 1,
            });
          }
        } else {
          (existing as any).gallery.push({
            title: file.originalname,
            url: up.url,
            key: up.key,
            filename: file.originalname,
            order: ((existing as any).gallery.length || 0) + 1,
          });
        }
      }
    }

    // leaseDocuments
    const leaseFiles = files?.leaseDocuments ?? [];
    if (leaseFiles.length > 0) {
      (existing as any).leaseDocuments = Array.isArray(existing.leaseDocuments)
        ? existing.leaseDocuments
        : [];
      for (const f of leaseFiles) {
        const up = await uploadFile({
          ...getUploadSource(f),
          originalName: f.originalname,
          mimetype: f.mimetype,
          propertyId: propId,
          folder: "commercial/leases",
        });
        (existing as any).leaseDocuments.push({
          title: f.originalname,
          url: up.url,
          key: up.key,
          filename: f.originalname,
          mimetype: f.mimetype,
        });
      }
    }

    // fireNOCFile replacement
    const fireFiles = files?.fireNOCFile;
    const firstFire2 = fireFiles?.[0];
    if (firstFire2) {
      const up = await uploadFile({
        ...getUploadSource(firstFire2),
        originalName: firstFire2.originalname,
        mimetype: firstFire2.mimetype,
        propertyId: propId,
        folder: "commercial/fire",
      });
      const oldKey = (existing as any).fireNOCFile?.key;
      if (oldKey) await deleteS3ObjectIfExists(oldKey);
      (existing as any).fireNOCFile = {
        url: up.url,
        key: up.key,
        filename: firstFire2.originalname,
        mimetype: firstFire2.mimetype,
      };
    }

    // occupancy certificate replacement
    const occFiles = files?.occupancyCertificateFile;
    const firstOcc2 = occFiles?.[0];
    if (firstOcc2) {
      const up = await uploadFile({
        ...getUploadSource(firstOcc2),
        originalName: firstOcc2.originalname,
        mimetype: firstOcc2.mimetype,
        propertyId: propId,
        folder: "commercial/occupancy",
      });
      const oldKey = (existing as any).occupancyCertificateFile?.key;
      if (oldKey) await deleteS3ObjectIfExists(oldKey);
      (existing as any).occupancyCertificateFile = {
        url: up.url,
        key: up.key,
        filename: firstOcc2.originalname,
        mimetype: firstOcc2.mimetype,
      };
    }

    await existing.save();
    await upsertActiveListingCityAndLocality(existing);
    return existing.toObject ? existing.toObject() : existing;
  },

  /* pushFilesToListing (optional helper) */
  async pushFilesToListing(id: string, pushMap: Record<string, any[]>) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const pushObj: any = {};
    for (const [field, arr] of Object.entries(pushMap)) {
      if (!Array.isArray(arr) || arr.length === 0) continue;
      if (field === "leaseDocuments" || field === "documents") {
        pushObj[field] = pushObj[field] || { $each: [] };
        pushObj[field].$each = pushObj[field].$each.concat(arr);
      } else if (field === "galleryFiles") {
        pushObj["gallery"] = pushObj["gallery"] || { $each: [] };
        pushObj["gallery"].$each = pushObj["gallery"].$each.concat(arr);
      } else {
        pushObj[field] = pushObj[field] || { $each: [] };
        pushObj[field].$each = pushObj[field].$each.concat(arr);
      }
    }
    if (!Object.keys(pushObj).length) return this.getById(id);
    await Commercial.findByIdAndUpdate(id, { $push: pushObj } as any).exec();
    return this.getById(id);
  },

  async getById(id: string, includeAudit = false) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const original = await Commercial.findById(id).select("createdBy").lean();
    const query = Commercial.findById(id)
      .populate("createdBy", "name email phone role roleId")
      .populate("approvedBy", "name email phone role roleName roleId");
    query.populate("createdBy.roleId", "name label");
    if (includeAudit) query.populate(auditUserPopulate);
    const doc = await query.lean().exec();
    return restoreCreatedById(Commercial, doc, original?.createdBy);
  },

  async getBySlug(slug: string) {
    if (!slug || typeof slug !== "string") throw new Error("Invalid slug");
    const original = await Commercial.findOne({ slug }).select("createdBy").lean();
    const doc = await Commercial.findOne({ slug })
      .populate("createdBy", "name email phone role roleId")
      .populate("createdBy.roleId", "name label")
      .populate(auditUserPopulate)
      .lean()
      .exec();
    return restoreCreatedById(Commercial, doc, original?.createdBy);
  },

  async list(options?: {
    page?: number;
    limit?: number;
    q?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    city?: string;
    minPrice?: number;
    maxPrice?: number;
    createdBy?: string;
    postedBy?: string;
  }) {
    const page = Math.max(1, options?.page ?? 1);
    const ownerUserId = (options as any)?.ownerUserId as string | undefined;
    const limit = ownerListLimit({ ownerUserId, limit: options?.limit });
    const skip = (page - 1) * limit;
    const filter: any = {};
    if (options?.q) filter.$text = { $search: options.q };
    const statusOpt = String(options?.status || "").trim().toLowerCase();
    if (statusOpt && statusOpt !== "all") filter.status = statusOpt;
    if (ownerUserId) {
      applyOwnerUserFilter(filter, ownerUserId);
    } else {
      if (options?.createdBy) {
        filter.createdBy = new mongoose.Types.ObjectId(options.createdBy);
      }
      if (options?.postedBy) {
        filter["postedBy.userId"] = new mongoose.Types.ObjectId(options.postedBy);
      }
    }
    if (typeof options?.city === "string") filter.city = options.city;
    if (
      typeof options?.minPrice === "number" ||
      typeof options?.maxPrice === "number"
    ) {
      filter.price = {};
      if (typeof options?.minPrice === "number")
        filter.price.$gte = options!.minPrice;
      if (typeof options?.maxPrice === "number")
        filter.price.$lte = options!.maxPrice;
    }

    const sort: any = {};

    // 🔥 PRIORITY SORT (MAIN LOGIC)
    sort["promotion.priority"] = -1;

    // existing logic
    if (options?.sortBy) {
      sort[options.sortBy] = options.sortOrder === "asc" ? 1 : -1;
    } else {
      sort.createdAt = -1;
    }

    const [items, rawItems, total] = await Promise.all([
      Commercial.find(filter)
        .sort(sort)
        .populate("createdBy", "name email phone role roleId")
        .populate("createdBy.roleId", "name label")
        .populate(auditUserPopulate)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Commercial.find(filter)
        .sort(sort)
        .select("createdBy")
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Commercial.countDocuments(filter).exec(),
    ]);

    return {
      items: await Promise.all(
        (items as any[]).map((item, index) =>
          restoreCreatedById(Commercial, item, rawItems[index]?.createdBy),
        ),
      ),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  },

  async delete(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");
    const existing = await Commercial.findById(id).lean().exec();
    if (!existing) return null;

    // remove stored S3 keys for gallery/documents/leases/fire/occupancy (best effort)
    if (Array.isArray((existing as any).gallery)) {
      for (const g of (existing as any).gallery) {
        if ((g as any)?.key) await deleteS3ObjectIfExists((g as any).key);
      }
    }
    if (Array.isArray((existing as any).documents)) {
      for (const d of (existing as any).documents) {
        if ((d as any)?.key) await deleteS3ObjectIfExists((d as any).key);
      }
    }
    if (Array.isArray((existing as any).leaseDocuments)) {
      for (const l of (existing as any).leaseDocuments) {
        if ((l as any)?.key) await deleteS3ObjectIfExists((l as any).key);
      }
    }
    if ((existing as any).fireNOCFile?.key)
      await deleteS3ObjectIfExists((existing as any).fireNOCFile.key);
    if ((existing as any).occupancyCertificateFile?.key)
      await deleteS3ObjectIfExists(
        (existing as any).occupancyCertificateFile.key,
      );

    const deleted = await Commercial.findByIdAndDelete(id).exec();
    return deleted;
  },

  async incrementViews(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    await Commercial.findByIdAndUpdate(id, {
      $inc: { "meta.views": 1 },
    }).exec();
    return null;
  },

  async verifyDocument(
    propertyId: string,
    documentIndex: number,
    status: "verified" | "rejected",
    rejectedReason = "",
    approverId?: string | null,
  ) {
    // ✅ Validate propertyId
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      throw new Error("Invalid property ID");
    }

    const property = await Commercial.findById(propertyId);

    if (!property) {
      return null;
    }

    const docs = property.verificationDocuments;
    if (documentIndex === 1 && docs?.length === 1 && docs[0]) {
      documentIndex = 0;
    }

    if (!docs?.[documentIndex]) {
      const roleName =
        (property as any).listingSource ||
        (await getCreatedByRoleName(Commercial, property.createdBy));

      if (isAgentReviewProperty(property, roleName)) {
        if (status === "verified") {
          stampListingApproved(property, approverId);
        } else {
          stampListingRejected(property, rejectedReason);
        }
        await property.save();
        await upsertActiveListingCityAndLocality(property);
        return property;
      }
    }

    // ✅ Validate documents existence
    if (!docs || !Array.isArray(docs)) {
      throw new Error("Verification documents not found");
    }

    // ✅ Validate index range
    if (
      !Number.isInteger(documentIndex) ||
      documentIndex < 0 ||
      documentIndex >= docs.length
    ) {
      throw new Error(`Invalid document index: ${documentIndex}`);
    }

    const doc = docs[documentIndex];

    // ✅ Double safety (TypeScript + runtime)
    if (!doc) {
      throw new Error(`Document not found at index: ${documentIndex}`);
    }

    // ✅ Update status
    doc.status = status;
    property.rejectedReason = status === "rejected" ? rejectedReason.trim() : "";

    // ✅ Check if any document is verified
    const hasVerified = docs.some((d) => d.status === "verified");

    if (hasVerified) {
      stampListingApproved(property, approverId);
    } else {
      stampListingRejected(property, rejectedReason);
    }

    await property.save();
    await upsertActiveListingCityAndLocality(property);

    return property;
  },

  model: Commercial,

  getPipeline(filters: any) {
    const createdByRoleTokens =
      typeof filters?.createdByRole === "string"
        ? filters.createdByRole
            .split(",")
            .map((token: string) => normalizeCreatedByRoleFilterToken(token))
            .filter(Boolean)
        : [];

    const match = extendCommercialFilters(
      {
        ...filters,
        createdByRole: undefined,
      },
      {},
    );
    return [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdByUser",
        },
      },
      {
        $addFields: {
          createdByUser: { $arrayElemAt: ["$createdByUser", 0] },
        },
      },
      {
        $lookup: {
          from: "roles",
          localField: "createdByUser.roleId",
          foreignField: "_id",
          as: "createdByRole",
        },
      },
      {
        $addFields: {
          createdByRole: { $arrayElemAt: ["$createdByRole", 0] },
          createdByRoleRaw: {
            $ifNull: [
              "$listingSource",
              {
                $ifNull: [
                  "$createdByUser.roleName",
                  {
                    $ifNull: [
                      "$createdByUser.role",
                      {
                        $ifNull: ["$createdByRole.name", "$createdByRole.label"],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $addFields: {
          createdByRoleName: {
            $toLower: {
              $cond: [
                { $isArray: "$createdByRoleRaw" },
                {
                  $ifNull: [{ $arrayElemAt: ["$createdByRoleRaw", 0] }, ""],
                },
                {
                  $ifNull: ["$createdByRoleRaw", ""],
                },
              ],
            },
          },
        },
      },
      {
        $addFields: {
          createdByRoleGroup: {
            $switch: {
              branches: [
                {
                  case: {
                    $in: [
                      "$createdByRoleName",
                      [
                        "owner",
                        "owners",
                        "user",
                        "property owner",
                        "property_owner",
                        "property-owner",
                        "property owners",
                        "property_owners",
                        "property-owners",
                        "seller",
                        "sellers",
                      ],
                    ],
                  },
                  then: "user",
                },
                {
                  case: {
                    $in: [
                      "$createdByRoleName",
                      ["agent", "agents", "sales_agent", "sales_manager"],
                    ],
                  },
                  then: "agent",
                },
                {
                  case: {
                    $in: [
                      "$createdByRoleName",
                      ["builder", "builders"],
                    ],
                  },
                  then: "builder",
                },
              ],
              default: "$createdByRoleName",
            },
          },
        },
      },
      ...(createdByRoleTokens.length === 1
        ? [{ $match: { createdByRoleGroup: createdByRoleTokens[0] } }]
        : createdByRoleTokens.length > 1
          ? [{ $match: { createdByRoleGroup: { $in: createdByRoleTokens } } }]
          : []),
      {
        $project: {
          _id: 0,
          id: "$_id",
          type: { $literal: "Commercial" },
          title: 1,
          slug: 1,
          gallery: 1,
          propertySubType: 1,
          builtUpArea: 1,
          constructionStatus: 1,
          furnishing: 1,
          pricePerSqft: 1,
          buildingName: 1,
          furnishedStatus: 1,
          floorNumber: 1,
          totalFloors: 1,
          listingSource: {
            $ifNull: [
              "$listingSource",
              { $ifNull: ["$createdByRole.name", "user"] },
            ],
          },
          price: 1,
          location: 1,
          createdAt: 1,
          createdBy: {
            _id: "$createdByUser._id",
            name: "$createdByUser.name",
            email: "$createdByUser.email",
            phone: "$createdByUser.phone",
            roleId: "$createdByUser.roleId",
            roleName: "$createdByRoleGroup",
          },
        },
      },
    ];
  },
};

export default CommercialService;
