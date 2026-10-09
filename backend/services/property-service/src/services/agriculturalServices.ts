// src/services/agricultural.service.ts
import mongoose from "mongoose";
import s3 from "../config/s3";
import dotenv from "dotenv";
import Agricultural from "../models/agriculturalModel";
import { cleanupUploadedFile, uploadFile } from "../utils/uploadFile";
import { extendAgriculturalFilters } from "./filters/agriculturalFilters";

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
import { upsertActiveListingCityAndLocality } from "./locationServices";
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
import { findRankedRelatedProperties } from "./relatedPropertyUtils";

dotenv.config({ quiet: true });

type MulterFiles = { [field: string]: Express.Multer.File[] } | undefined;

const auditUserPopulate = [
  { path: "approvedBy", select: "name email phone role roleId" },
  { path: "lastUpdatedBy.userId", select: "name email phone role roleId" },
  { path: "updateHistory.userId", select: "name email phone role roleId" },
];

function getUploadSource(file: Express.Multer.File) {
  if (file.buffer && Buffer.isBuffer(file.buffer)) {
    return { buffer: file.buffer };
  }

  if (file.path) {
    return { filePath: file.path };
  }

  return { buffer: getUploadedFileBuffer(file) };
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

async function mapAndUploadGallery({
  incomingGallery,
  galleryFiles,
  propertyId,
}: {
  incomingGallery?: any[];
  galleryFiles?: Express.Multer.File[];
  propertyId: string;
}) {
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
      folder: "agricultural/gallery",
    });
    cleanupUploadedFile(file.path);

    if (!summary[matchedIndex]) summary[matchedIndex] = {};
    summary[matchedIndex].url = up.url;
    summary[matchedIndex].filename = file.originalname;
    if (!summary[matchedIndex].title)
      summary[matchedIndex].title = file.originalname;
    if (!summary[matchedIndex].order)
      summary[matchedIndex].order = matchedIndex + 1;
  }

  return summary;
}

/* --------------------  Search API  -------------------- */
export async function findRelatedAgriculture(property: any) {
  if (!property?._id) return [];

  return findRankedRelatedProperties(Agricultural, property, {
    select:
      "title slug price city locality landArea cropType gallery propertyType listingType",
    exactFields: [{ field: "cropType", points: 18 }],
    numericBands: [
      { field: "price", tolerance: 0.3, points: 20 },
      { field: "landArea", tolerance: 0.25, points: 18 },
    ],
  });
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

/* --------------------  Service API  -------------------- */

export const AgriculturalService = {
  async create(payload: any, files?: MulterFiles) {
    // build slug and ensure uniqueness

    let toCreate: any = { ...payload };

    toCreate = normalizePayload(toCreate);

    const preliminary = new Agricultural(toCreate);
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
          folder: "agricultural/documents",
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

    // soilTestReport single file
    const soilFiles = files?.soilTestReport ?? [];
    if (soilFiles && soilFiles.length > 0) {
      const f = soilFiles[0]!;
      const up = await uploadFile({
        ...getUploadSource(f),
        originalName: f.originalname,
        mimetype: f.mimetype,
        propertyId: propId,
        folder: "agricultural/soil",
      });

      toCreate.soilTestReport = {
        url: up.url,
        key: up.key,
        filename: f.originalname,
        mimetype: f.mimetype,
      };
    }

    const createdDoc = await Agricultural.create(toCreate);

    await upsertActiveListingCityAndLocality(createdDoc);

    const populated = await Agricultural.findById(createdDoc._id)
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
    const existing = await Agricultural.findById(id);
    if (!existing) return null;
    const safePayload = normalizePayload(sanitizeUpdatePayload(payload));
    if (Array.isArray(safePayload?.amenities)) {
      safePayload.amenities = normalizeAmenitiesInput(safePayload.amenities);
    }

    // slug/title change handling
    // inside your update function in agricultural.service.ts
    if (
      (safePayload.slug && safePayload.slug !== (existing as any).slug) ||
      (safePayload.title && safePayload.title !== (existing as any).title)
    ) {
      const slugSource =
        (safePayload.slug && String(safePayload.slug).trim()) ||
        (safePayload.title as string);
      const slug = slugSource
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const found = await Agricultural.findOne({ slug }).select("_id").lean();
      if (found && found._id.toString() !== id) {
        const err: any = new Error("Slug already in use");
        err.code = "SLUG_TAKEN";
        throw err;
      }
      (existing as any).slug = slug;
    }

    // shallow merge payload
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
            folder: "agricultural/gallery",
          });
          cleanupUploadedFile(f.path);
          entry.url = up.url;
          entry.filename = f.originalname;
          filesByName.delete(declared);
        }
      }

      for (const file of Array.from(filesByName.values())) {
        const imageBuffer = getUploadedFileBuffer(file);
        const watermarkedBuffer = await createWatermarkedBuffer(imageBuffer);
        const up = await uploadFile({
          buffer: watermarkedBuffer,
          originalName: file.originalname,
          mimetype: file.mimetype,
          propertyId: propId,
          folder: "agricultural/gallery",
        });
        cleanupUploadedFile(file.path);
        (existing as any).gallery.push({
          title: file.originalname,
          url: up.url,
          filename: file.originalname,
        });
      }
    }

    // documents -> append
    const documentFiles = files?.documents ?? [];
    if (documentFiles.length > 0) {
      (existing as any).documents = Array.isArray((existing as any).documents)
        ? (existing as any).documents
        : [];
      for (const f of documentFiles) {
        const up = await uploadFile({
          ...getUploadSource(f),
          originalName: f.originalname,
          mimetype: f.mimetype,
          propertyId: propId,
          folder: "agricultural/documents",
        });
        (existing as any).documents.push({
          title: f.originalname,
          url: up.url,
          key: up.key,
          filename: f.originalname,
          mimetype: f.mimetype,
        });
      }
    }

    // soilTestReport replacement (single file)
    const soilFiles = files?.soilTestReport;
    const firstSoil = soilFiles?.[0];

    if (firstSoil) {
      const up = await uploadFile({
        ...getUploadSource(firstSoil),
        originalName: firstSoil.originalname,
        mimetype: firstSoil.mimetype,
        propertyId: propId,
        folder: "agricultural/soil",
      });

      const oldKey = (existing as any).soilTestReport?.key;
      if (oldKey) {
        await deleteS3ObjectIfExists(oldKey);
      }

      (existing as any).soilTestReport = {
        url: up.url,
        key: up.key,
        filename: firstSoil.originalname,
        mimetype: firstSoil.mimetype,
      };
    }

    await existing.save();
    await upsertActiveListingCityAndLocality(existing);
    return existing.toObject ? existing.toObject() : existing;
  },

  async pushFilesToListing(id: string, pushMap: Record<string, any[]>) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const pushObj: any = {};
    for (const [field, arr] of Object.entries(pushMap)) {
      if (!Array.isArray(arr) || arr.length === 0) continue;
      if (field === "documents") {
        pushObj["documents"] = pushObj["documents"] || { $each: [] };
        pushObj["documents"].$each = pushObj["documents"].$each.concat(arr);
      } else if (field === "gallery") {
        pushObj["gallery"] = pushObj["gallery"] || { $each: [] };
        pushObj["gallery"].$each = pushObj["gallery"].$each.concat(arr);
      } else {
        pushObj[field] = pushObj[field] || { $each: [] };
        pushObj[field].$each = pushObj[field].$each.concat(arr);
      }
    }

    if (!Object.keys(pushObj).length) return this.getById(id);
    await Agricultural.findByIdAndUpdate(id, { $push: pushObj } as any).exec();
    return this.getById(id);
  },

  async getById(id: string, includeAudit = false) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const original = await Agricultural.findById(id).select("createdBy").lean();
    const query = Agricultural.findById(id)
      .populate("createdBy", "name email phone role roleId")
      .populate("approvedBy", "name email phone role roleName roleId");
    query.populate("createdBy.roleId", "name label");
    if (includeAudit) query.populate(auditUserPopulate);
    const doc = await query.lean().exec();
    return restoreCreatedById(Agricultural, doc, original?.createdBy);
  },

  async getBySlug(slug: string) {
    if (!slug || typeof slug !== "string") throw new Error("Invalid slug");
    const original = await Agricultural.findOne({ slug }).select("createdBy").lean();
    const doc = await Agricultural.findOne({ slug })
      .populate("createdBy", "name email phone role roleId")
      .populate("createdBy.roleId", "name label")
      .populate(auditUserPopulate)
      .lean()
      .exec();
    return restoreCreatedById(Agricultural, doc, original?.createdBy);
  },

  async list(options?: {
    page?: number;
    limit?: number;
    q?: string;
    city?: string;
    status?: string;
    createdBy?: string;
    postedBy?: string;
    sortBy?: string;               
    sortOrder?: "asc" | "desc";      
  }) {
    const page = Math.max(1, options?.page ?? 1);
    const ownerUserId = (options as any)?.ownerUserId as string | undefined;
    const limit = ownerListLimit({ ownerUserId, limit: options?.limit });
    const skip = (page - 1) * limit;
    const filter: any = {};
    if (options?.q) filter.$text = { $search: options.q };
    if (options?.city) filter.city = options.city;
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
      Agricultural.find(filter).populate("createdBy", "name email phone role roleId")
        .populate("createdBy.roleId", "name label")
        .populate(auditUserPopulate)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Agricultural.find(filter)
        .sort(sort)
        .select("createdBy")
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Agricultural.countDocuments(filter).exec(),
    ]);

    return {
      items: await Promise.all(
        (items as any[]).map((item, index) =>
          restoreCreatedById(Agricultural, item, rawItems[index]?.createdBy),
        ),
      ),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  },

  async delete(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");
    const existing = await Agricultural.findById(id).lean().exec();
    if (!existing) return null;

    // remove stored S3 keys (best-effort)
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
    if ((existing as any).soilTestReport?.key)
      await deleteS3ObjectIfExists((existing as any).soilTestReport.key);

    const deleted = await Agricultural.findByIdAndDelete(id).exec();
    return deleted;
  },

  async incrementViews(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    await Agricultural.findByIdAndUpdate(id, {
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
    const property = await Agricultural.findById(propertyId);
    if (!property) return null;

    const docs = property.verificationDocuments ?? [];
    if (documentIndex === 1 && docs.length === 1 && docs[0]) {
      documentIndex = 0;
    }

    if (!docs[documentIndex]) {
      const roleName =
        (property as any).listingSource ||
        (await getCreatedByRoleName(Agricultural, property.createdBy));

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

      return {
        success: false,
        status: 400,
        message: "Invalid document index",
      };
    }

    const doc = docs[documentIndex]!;

    // 1️⃣ Update document status
    doc.status = status;
    property.rejectedReason = status === "rejected" ? rejectedReason.trim() : "";

    // 2️⃣ Check if ANY document is verified
    const hasVerified = docs.some(
      (d) => d.status === "verified",
    );

    if (hasVerified) {
      stampListingApproved(property, approverId);
    } else {
      stampListingRejected(property, rejectedReason);
    }

    await property.save();
    await upsertActiveListingCityAndLocality(property);
    return property;
  },

  model: Agricultural,
  getPipeline: (filters: any) => {
    const createdByRoleTokens =
      typeof filters?.createdByRole === "string"
        ? filters.createdByRole
            .split(",")
            .map((token: string) => normalizeCreatedByRoleFilterToken(token))
            .filter(Boolean)
        : [];

    const match = extendAgriculturalFilters(
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
          totalArea: 1,
          type: { $literal: "Agricultural" },
          title: 1,
          gallery: 1,
          price: 1,
          slug: 1,
          pricePerSqft: 1,
          listingSource: {
            $ifNull: ["$listingSource", { $ifNull: ["$createdByRole.name", "user"] }],
          },
          landName: 1,

          soilType: 1,
          waterSource: 1,
          accessRoadType: 1,
          createdAt: 1,
        },
      },
    ];
  },
};

export default AgriculturalService;
