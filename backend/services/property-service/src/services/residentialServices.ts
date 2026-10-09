// src/services/residential.service.ts
import mongoose from "mongoose";
import s3 from "../config/s3"; // your AWS.S3 v2 client
import dotenv from "dotenv";
import Residential from "../models/residentialModel";
import "../models/userModel";
import { cleanupUploadedFile, uploadFile } from "../utils/uploadFile";
import { extendResidentialFilters } from "./filters/residentialFilters";
import { ResidentialQuery } from "../types/filterTypes";
import { Request } from "express";
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
import { ResidentialUpdateSchema } from "../zod/residentialZod";
import { findRankedRelatedProperties } from "./relatedPropertyUtils";

type RequestWithResidentialQuery = Request<
  {}, // req.params
  any, // res body
  any, // req body
  ResidentialQuery // ✅ req.query
>;
dotenv.config();

type MulterFiles = { [field: string]: Express.Multer.File[] } | undefined;

const auditUserPopulate = [
  { path: "approvedBy", select: "name email phone role roleId" },
  { path: "lastUpdatedBy.userId", select: "name email phone role roleId" },
  { path: "updateHistory.userId", select: "name email phone role roleId" },
];

/* -------------------- Helpers -------------------- */
function pickDefined<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => typeof v !== "undefined"),
  );
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
  if (obj.propertyAge === "10-plus-years") obj.propertyAge = "20-plus-years";
  if (obj.createdBy) obj.createdBy = String(obj.createdBy);
  if (Array.isArray(obj.amenities))
    obj.amenities = normalizeAmenitiesInput(obj.amenities);
  return obj;
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

/* -------------------- Gallery helper -------------------- */

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

  // ensure summary length for index mapping
  for (let i = 0; i < files.length; i++) {
    if (i >= summary.length) summary.push({});
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;

    // match by declared filename if available
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

    // upload into residential folder
    const up = await uploadFile({
      buffer: watermarkedBuffer,
      originalName: file.originalname,
      mimetype: file.mimetype,
      folder: "featured/gallery",
    });
    cleanupUploadedFile(file.path);

    if (!summary[matchedIndex]) summary[matchedIndex] = {};
    summary[matchedIndex].url = up.url;
    summary[matchedIndex].key = up.key;
    summary[matchedIndex].filename = file.originalname;
    if (!summary[matchedIndex].title)
      summary[matchedIndex].title = file.originalname;
    if (!summary[matchedIndex].category)
      summary[matchedIndex].category = "image";
    if (!summary[matchedIndex].order)
      summary[matchedIndex].order = matchedIndex + 1;
  }

  return summary;
}

export async function findRelatedResidential(property: any) {
  if (!property?._id) return [];

  return findRankedRelatedProperties(Residential, property, {
    select:
      "title slug price city locality bhk bedrooms gallery propertyType listingType builtUpArea furnishing parkingDetails constructionStatus",
    numericBands: [
      { field: "price", tolerance: 0.3, points: 20 },
      { field: "builtUpArea", tolerance: 0.25, points: 12 },
    ],
    nearbyNumbers: [
      { field: "bhk", delta: 1, points: 18 },
      { field: "bedrooms", delta: 1, points: 12 },
    ],
  });
}

/* -------------------- Service API -------------------- */

export const ResidentialPropertyService = {
  async create(payload: any, files?: MulterFiles) {
    let toCreate = normalizePayload({ ...payload });

    const preliminary = new Residential(toCreate);
    const propId = preliminary._id
      ? preliminary._id.toString()
      : String(Date.now());

    /* Gallery */
    const galleryFiles = files?.galleryFiles ?? [];
    const mappedGallery = await mapAndUploadGallery({
      incomingGallery: toCreate.gallery,
      galleryFiles,
      propertyId: propId,
    });
    toCreate.gallery = Array.isArray(mappedGallery) ? mappedGallery : [];

    /* Verification Documents */
    const verificationFiles = files?.verificationDocuments ?? [];
    if (verificationFiles.length > 0) {
      toCreate.verificationDocuments = [];

      for (const file of verificationFiles) {
        const up = await uploadFile({
          ...getUploadSource(file),
          originalName: file.originalname,
          mimetype: file.mimetype,
          folder: "residential/verification",
          entityId: propId,
        });

        toCreate.verificationDocuments.push({
          type: payload.verificationType,
          title: file.originalname,
          url: up.url,
          key: up.key,
          filename: file.originalname,
          mimetype: file.mimetype,
          status: "pending",
        });
      }
    }

    const createdDoc = await Residential.create(toCreate);

    await upsertActiveListingCityAndLocality(createdDoc);

    const populated = await Residential.findById(createdDoc._id)
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
    const existingRaw = await Residential.findById(id);

    if (!existingRaw) return null;
    const existing: any = existingRaw;

    // Validate using your UpdateFeaturePropertySchema (assumes you exported it)
    const sanitizedPayload = normalizePayload(sanitizeUpdatePayload(payload));
    const parsed = ResidentialUpdateSchema.safeParse(sanitizedPayload);
    if (!parsed.success) {
      // handle validation error (return or throw)
      throw new Error(
        "Validation failed: " + JSON.stringify(parsed.error.issues),
      );
    }

    const data = parsed.data;
    const safeUpdate = pickDefined(data);
    if (Array.isArray((safeUpdate as any).amenities)) {
      (safeUpdate as any).amenities = normalizeAmenitiesInput(
        (safeUpdate as any).amenities,
      );
    }
    const incomingGallery = safeUpdate.gallery;
    delete safeUpdate.gallery;
    Object.assign(existing, safeUpdate);

    const propId = existing._id ? existing._id.toString() : String(Date.now());

    existing.gallery = Array.isArray(existing.gallery) ? existing.gallery : [];

    if (Array.isArray(incomingGallery)) {
      for (let i = 0; i < incomingGallery.length; i++) {
        const inc = incomingGallery[i];
        if (i < existing.gallery.length) {
          existing.gallery[i] = {
            ...existing.gallery[i],
            ...inc,
          };
        } else {
          existing.gallery.push({ ...inc });
        }
      }
    }

    const galleryFiles = files?.galleryFiles ?? [];

    // Ensure gallery array exists
    existing.gallery = Array.isArray(existing.gallery) ? existing.gallery : [];

    // Build filename → index map from existing gallery
    const galleryIndexByFilename = new Map<string, number>();

    existing.gallery.forEach((item: any, index: number) => {
      if (item?.filename) {
        galleryIndexByFilename.set(item.filename, index);
      }
    });

    for (const file of galleryFiles) {
      if (!file) continue;

      const imageBuffer = getUploadedFileBuffer(file);
      const watermarkedBuffer = await createWatermarkedBuffer(imageBuffer);
      const up = await uploadFile({
        buffer: watermarkedBuffer,
        originalName: file.originalname,
        mimetype: file.mimetype,
        folder: "featured/gallery",
        entityId: propId,
      });
      cleanupUploadedFile(file.path);

      // 1️⃣ Find matching gallery item by filename
      const existingIndex = galleryIndexByFilename.get(file.originalname);

      if (existingIndex !== undefined) {
        // ✅ Update existing slot
        existing.gallery[existingIndex] = {
          ...existing.gallery[existingIndex],
          url: up.url,
          key: up.key,
          filename: file.originalname,
          category: "image",
        };
      } else {
        // 2️⃣ Push as new gallery item
        existing.gallery.push({
          url: up.url,
          key: up.key,
          filename: file.originalname,
          category: "image",
          order: existing.gallery.length + 1,
        });
      }
    }

    /* Verification Documents */
    const verificationFiles = files?.verificationDocuments ?? [];
    if (verificationFiles.length > 0) {
      existing.verificationDocuments = Array.isArray(
        existing.verificationDocuments,
      )
        ? existing.verificationDocuments
        : [];

      for (const file of verificationFiles) {
        const up = await uploadFile({
          ...getUploadSource(file),
          originalName: file.originalname,
          mimetype: file.mimetype,
          folder: "residential/verification",
          entityId: propId,
        });

        existing.verificationDocuments.push({
          type: payload.verificationType,
          title: file.originalname,
          url: up.url,
          key: up.key,
          filename: file.originalname,
          mimetype: file.mimetype,
          status: "pending",
        });
      }
    }

    // Final save
    await existing.save();
    await upsertActiveListingCityAndLocality(existing);
    return existing.toObject ? existing.toObject() : existing;
  },

  async pushFilesToListing(id: string, pushMap: Record<string, any[]>) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const pushObj: any = {};
    for (const [field, arr] of Object.entries(pushMap)) {
      if (!Array.isArray(arr) || arr.length === 0) continue;
      if (field === "gallery" || field === "galleryFiles") {
        pushObj["gallery"] = pushObj["gallery"] || { $each: [] };
        pushObj["gallery"].$each = pushObj["gallery"].$each.concat(arr);
      } else if (field === "documents") {
        pushObj["documents"] = pushObj["documents"] || { $each: [] };
        pushObj["documents"].$each = pushObj["documents"].$each.concat(arr);
      } else {
        pushObj[field] = pushObj[field] || { $each: [] };
        pushObj[field].$each = pushObj[field].$each.concat(arr);
      }
    }

    if (!Object.keys(pushObj).length) return this.getById(id);

    await Residential.findByIdAndUpdate(id, { $push: pushObj } as any).exec();
    return this.getById(id);
  },

  async getById(id: string, includeAudit = false) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const original = await Residential.findById(id).select("createdBy").lean();
    const query = Residential.findById(id)
      .populate("createdBy", "name email phone role roleId")
      .populate("approvedBy", "name email phone role roleName roleId");
    query.populate("createdBy.roleId", "name label");
    if (includeAudit) query.populate(auditUserPopulate);
    const doc = await query.lean().exec();
    return restoreCreatedById(Residential, doc, original?.createdBy);
  },

  async getBySlug(slug: string) {
    if (!slug || typeof slug !== "string") throw new Error("Invalid slug");
    const original = await Residential.findOne({ slug }).select("createdBy").lean();
    const doc = await Residential.findOne({ slug })
      .populate("createdBy", "name email phone role roleId")
      .populate("createdBy.roleId", "name label")
      .populate(auditUserPopulate)
      .lean()
      .exec();
    return restoreCreatedById(Residential, doc, original?.createdBy);
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
    bedrooms?: number;
    bathrooms?: number;
    near?: string;
    maxDistance?: number;
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
    if (typeof options?.bedrooms === "number")
      filter.bedrooms = options!.bedrooms;
    if (typeof options?.bathrooms === "number")
      filter.bathrooms = options!.bathrooms;

    if (options?.near) {
      const [lngStr, latStr] = String(options.near).split(",");
      const lng = Number(lngStr);
      const lat = Number(latStr);
      if (!isNaN(lng) && !isNaN(lat)) {
        filter.location = {
          $near: {
            $geometry: { type: "Point", coordinates: [lng, lat] },
            $maxDistance: options?.maxDistance ?? 5000,
          },
        };
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
      Residential.find(filter)
        .sort(sort)
        .populate("createdBy", "name email phone role roleId")
        .populate("createdBy.roleId", "name label")
        .populate(auditUserPopulate)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Residential.find(filter)
        .sort(sort)
        .select("createdBy")
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Residential.countDocuments(filter).exec(),
    ]);
    return {
      items: await Promise.all(
        (items as any[]).map((item, index) =>
          restoreCreatedById(Residential, item, rawItems[index]?.createdBy),
        ),
      ),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  },

  async delete(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");
    const existing = await Residential.findById(id).lean().exec();
    if (!existing) return null;

    // remove stored S3 keys for gallery and documents (best effort)
    if (Array.isArray((existing as any).gallery)) {
      for (const g of (existing as any).gallery) {
        if ((g as any)?.key) {
          await deleteS3ObjectIfExists((g as any).key);
        }
      }
    }
    if (Array.isArray((existing as any).documents)) {
      for (const d of (existing as any).documents) {
        if ((d as any)?.key) {
          await deleteS3ObjectIfExists((d as any).key);
        }
      }
    }

    const deleted = await Residential.findByIdAndDelete(id).exec();
    return deleted;
  },

  async incrementViews(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    await Residential.findByIdAndUpdate(id, {
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
    const property = await Residential.findById(propertyId);
    if (!property) return null;

    const docs = property.verificationDocuments ?? [];
    if (documentIndex === 1 && docs.length === 1 && docs[0]) {
      documentIndex = 0;
    }

    if (!docs[documentIndex]) {
      const roleName =
        (property as any).listingSource ||
        (await getCreatedByRoleName(Residential, property.createdBy));

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

    // 3️⃣ Auto publish if verified — stamp approver + approvedAt (createdAt unchanged)
    if (hasVerified) {
      stampListingApproved(property, approverId);
    } else {
      stampListingRejected(property, rejectedReason);
    }

    await property.save();
    await upsertActiveListingCityAndLocality(property);
    return property;
  },

  model: Residential,

  getPipeline(filters: any) {
    const createdByRoleTokens =
      typeof filters?.createdByRole === "string"
        ? filters.createdByRole
            .split(",")
            .map((token: string) => normalizeCreatedByRoleFilterToken(token))
            .filter(Boolean)
        : [];

    const match = extendResidentialFilters(
      {
        ...filters,
        createdByRole: undefined,
      },
      {},
    );

    const pipeline: any[] = [
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
          as: "createdByRoleDoc",
        },
      },
      {
        $addFields: {
          createdByRoleDoc: { $arrayElemAt: ["$createdByRoleDoc", 0] },
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
                        $ifNull: ["$createdByRoleDoc.name", "$createdByRoleDoc.label"],
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
    ];

    if (createdByRoleTokens.length === 1) {
      pipeline.push({
        $match: { createdByRoleGroup: createdByRoleTokens[0] },
      });
    } else if (createdByRoleTokens.length > 1) {
      pipeline.push({
        $match: { createdByRoleGroup: { $in: createdByRoleTokens } },
      });
    }

    pipeline.push(
      {
        $project: {
          _id: 0,
          id: "$_id",
          type: { $literal: "Residential" },
          title: 1,
          locality: 1,
          city: 1,
          listingType: 1,
          transactionType: 1,
          builtUpArea: 1,
          constructionStatus: 1,
          furnishing: 1,
          parkingDetails: 1,
          pricePerSqft: 1,
          gallery: 1,
          buildingName: 1,
          price: 1,
          bhk: 1,
          bedrooms: 1,
          bathrooms: 1,
          balconies: 1,
          slug: 1,
          createdAt: 1,
          listingSource: 1,
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
    );

    return pipeline;
  },
};

export default ResidentialPropertyService;
