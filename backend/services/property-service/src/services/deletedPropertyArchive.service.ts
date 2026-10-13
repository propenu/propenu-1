import mongoose from "mongoose";
import DeletedProperty from "../models/deletedPropertyModel";
import Residential from "../models/residentialModel";
import Commercial from "../models/commercialModel";
import LandPlot from "../models/landModel";
import Agricultural from "../models/agriculturalModel";
import User from "../models/userModel";

export type ListingCategory =
  | "residential"
  | "commercial"
  | "land"
  | "agricultural";

export type ArchiveActor = {
  id?: string | undefined;
  name?: string | undefined;
  email?: string | undefined;
  roleName?: string | undefined;
};

type ArchiveEvent = {
  action: string;
  at: Date;
  userId?: mongoose.Types.ObjectId | undefined;
  name: string;
  email: string;
  roleName: string;
};

type ArchiveRow = {
  _id?: unknown;
  snapshot?: Record<string, any>;
  propertyId?: unknown;
  category?: string;
  deletedAt?: Date;
  deletedBy?: unknown;
  deactivatedBy?: unknown;
  deactivatedAt?: Date;
};

const oneArchive = (
  value: ArchiveRow | ArchiveRow[] | null | undefined,
): ArchiveRow | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

const CATEGORIES = new Set<ListingCategory>([
  "residential",
  "commercial",
  "land",
  "agricultural",
]);

const LIVE_MODELS: Record<ListingCategory, mongoose.Model<any>> = {
  residential: Residential,
  commercial: Commercial,
  land: LandPlot,
  agricultural: Agricultural,
};

const LIST_SELECT =
  "category propertyId title slug propertyCode city state locality price heroImage createdByName deactivatedAt deactivatedBy deletedAt deletedBy purgedFromLive";

const asId = (value: unknown) => {
  const raw =
    value && typeof value === "object" && "_id" in (value as object)
      ? (value as { _id?: unknown })._id
      : value;
  const id = String(raw || "");
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : undefined;
};

const heroOf = (doc: any) => {
  if (typeof doc?.heroImage === "string" && doc.heroImage) return doc.heroImage;
  const gallery = Array.isArray(doc?.gallery) ? doc.gallery : [];
  const images = Array.isArray(doc?.images) ? doc.images : [];
  return String(gallery[0]?.url || images[0]?.url || "");
};

const snapshotOf = (doc: any) => {
  const plain = typeof doc?.toObject === "function" ? doc.toObject() : { ...doc };
  delete plain.__v;
  return JSON.parse(JSON.stringify(plain));
};

export const archiveEventFromActor = (
  action: string,
  at: Date,
  actor?: ArchiveActor | null,
): ArchiveEvent => ({
  action,
  at,
  userId:
    actor?.id && mongoose.Types.ObjectId.isValid(actor.id)
      ? new mongoose.Types.ObjectId(actor.id)
      : undefined,
  name: actor?.name || "",
  email: actor?.email || "",
  roleName: actor?.roleName || "",
});

const actorFrom = (source: any) => ({
  userId: asId(source?.userId || source),
  name: String(source?.name || ""),
  email: String(source?.email || ""),
  roleName: String(source?.roleName || ""),
});

const summaryOf = async (category: ListingCategory, doc: any) => {
  const snapshot = snapshotOf(doc);
  let createdByName = String(doc?.createdBy?.name || doc?.postedBy?.name || "");
  if (!createdByName) {
    const creatorId = asId(doc?.createdBy);
    if (creatorId) {
      const creator = await User.findById(creatorId).select("name companyName").lean();
      createdByName = String(creator?.name || (creator as any)?.companyName || "");
    }
  }
  const deactivatedSource = doc?.deactivationActor?.name
    ? doc.deactivationActor
    : null;
  return {
    category,
    propertyId: doc._id,
    title: String(doc.title || doc.buildingName || doc.landName || "Untitled property"),
    slug: String(doc.slug || ""),
    propertyCode: String(doc.propertyCode || ""),
    city: String(doc.city || ""),
    state: String(doc.state || ""),
    locality: String(doc.locality || ""),
    price: doc.price,
    heroImage: heroOf(doc),
    createdByName,
    deactivatedAt: doc.deactivatedAt ? new Date(doc.deactivatedAt) : undefined,
    deactivatedBy: actorFrom(deactivatedSource),
    deletedAt: new Date(),
    deletedBy: actorFrom(null),
    snapshot,
  };
};

export async function archiveDeletedProperty(
  category: ListingCategory,
  doc: any,
  options?: { event?: ArchiveEvent; purged?: boolean },
) {
  if (!doc?._id || !CATEGORIES.has(category)) return null;
  const fields = await summaryOf(category, doc);
  if (options?.event) {
    fields.deletedAt = options.event.at;
    fields.deletedBy = {
      userId: options.event.userId,
      name: options.event.name,
      email: options.event.email,
      roleName: options.event.roleName,
    };
  }
  const existing = await DeletedProperty.findOne({
    category,
    propertyId: doc._id,
  })
    .select("activity")
    .lean();

  if (!existing) {
    const activity = options?.event ? [options.event] : [];
    return DeletedProperty.create({
      ...fields,
      purgedFromLive: Boolean(options?.purged),
      activity,
    });
  }

  await DeletedProperty.updateOne(
    { category, propertyId: doc._id },
    {
      $set: {
        ...fields,
        ...(options?.purged ? { purgedFromLive: true } : {}),
      },
      ...(options?.event ? { $push: { activity: options.event } } : {}),
    },
  );
  return DeletedProperty.findOne({ category, propertyId: doc._id }).lean();
}

async function revealArchivesRemovedFromLive() {
  const pending = await DeletedProperty.find({ purgedFromLive: { $ne: true } })
    .select("category propertyId")
    .lean();
  if (!pending.length) return;

  const removed: mongoose.Types.ObjectId[] = [];
  for (const category of CATEGORIES) {
    const rows = pending.filter((row) => row.category === category);
    if (!rows.length) continue;
    const ids = rows.map((row) => row.propertyId).filter(Boolean);
    const stillLive = await LIVE_MODELS[category]
      .find({ _id: { $in: ids } })
      .select("_id")
      .lean();
    const liveIds = new Set(stillLive.map((row) => String(row._id)));
    rows.forEach((row) => {
      if (row.propertyId && !liveIds.has(String(row.propertyId))) {
        removed.push(row.propertyId);
      }
    });
  }
  if (!removed.length) return;
  await DeletedProperty.updateMany(
    { propertyId: { $in: removed } },
    { $set: { purgedFromLive: true } },
  );
}

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listDeletedProperties(options?: {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  from?: string;
  to?: string;
}) {
  const page = Math.max(1, Number(options?.page) || 1);
  if (page === 1) {
    await revealArchivesRemovedFromLive();
  }
  const limit = Math.min(48, Math.max(1, Number(options?.limit) || 12));
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = { purgedFromLive: true };
  const q = String(options?.q || "").trim();
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: "i" };
    filter.$or = [
      { title: rx },
      { city: rx },
      { locality: rx },
      { state: rx },
      { propertyCode: rx },
      { createdByName: rx },
      { "deletedBy.name": rx },
      { "deletedBy.email": rx },
      { "deactivatedBy.name": rx },
    ];
  }
  const category = String(options?.category || "").trim().toLowerCase();
  if (CATEGORIES.has(category as ListingCategory)) {
    filter.category = category;
  }
  if (options?.from || options?.to) {
    const deletedAt: Record<string, Date> = {};
    if (options.from) {
      deletedAt.$gte = new Date(`${String(options.from).slice(0, 10)}T00:00:00.000+05:30`);
    }
    if (options.to) {
      deletedAt.$lte = new Date(`${String(options.to).slice(0, 10)}T23:59:59.999+05:30`);
    }
    filter.deletedAt = deletedAt;
  }

  const [items, total] = await Promise.all([
    DeletedProperty.find(filter)
      .select(LIST_SELECT)
      .sort({ deletedAt: -1, title: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DeletedProperty.countDocuments(filter),
  ]);

  return {
    items,
    meta: {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function purgeDeletedPropertyArchive(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return oneArchive(
    await DeletedProperty.findOneAndDelete({
      _id: id,
      purgedFromLive: true,
    }).lean(),
  );
}

export async function getDeletedPropertyByListing(
  category: string,
  propertyId: string,
) {
  if (!CATEGORIES.has(category as ListingCategory)) return null;
  if (!mongoose.Types.ObjectId.isValid(propertyId)) return null;
  return oneArchive(
    await DeletedProperty.findOne({
      category,
      propertyId,
      purgedFromLive: true,
    }).lean(),
  );
}

const userIdOf = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "string" && mongoose.Types.ObjectId.isValid(value)) return value;
  if (typeof value === "object") {
    const record = value as { _id?: unknown; userId?: unknown };
    if (record._id && mongoose.Types.ObjectId.isValid(String(record._id))) {
      return String(record._id);
    }
    if (record.userId) return userIdOf(record.userId);
  }
  return null;
};

export async function propertyFromDeletedArchive(
  category: string,
  propertyId: string,
) {
  const archive = await getDeletedPropertyByListing(category, propertyId);
  const snapshot = archive?.snapshot;
  if (!snapshot || typeof snapshot !== "object") return null;

  const property: any = {
    ...snapshot,
    _id: archive.propertyId || snapshot._id,
    _category: archive.category,
    permanentlyDeleted: true,
    permanentlyDeletedAt: archive.deletedAt || null,
    permanentlyDeletedBy: archive.deletedBy || null,
    deactivationActor: snapshot.deactivationActor?.name
      ? snapshot.deactivationActor
      : archive.deactivatedBy,
    deactivatedAt: snapshot.deactivatedAt || archive.deactivatedAt || null,
  };

  const ids = new Set<string>();
  const collect = (value: unknown) => {
    const userId = userIdOf(value);
    if (userId) ids.add(userId);
  };
  collect(property.createdBy);
  collect(property.approvedBy);
  collect(property.updatedBy);
  collect(property.deactivatedBy);
  collect(property.deactivationActor?.userId);
  collect(property.postedBy?.userId);
  collect(property.lastUpdatedBy?.userId);
  collect(property.permanentlyDeletedBy?.userId);
  if (Array.isArray(property.updateHistory)) {
    property.updateHistory.forEach((row: { userId?: unknown }) => collect(row?.userId));
  }
  if (!ids.size) return property;

  const users = await User.find({ _id: { $in: [...ids] } })
    .select("name email phone city state locality pincode companyName role roleName")
    .lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));
  const asUser = (value: unknown) => {
    const userId = userIdOf(value);
    if (!userId) return value;
    return byId.get(userId) || value;
  };
  const fillAudit = (bucket: any) => {
    if (!bucket || typeof bucket !== "object") return bucket;
    const user = byId.get(userIdOf(bucket.userId) || "");
    if (!user) return bucket;
    return {
      ...bucket,
      userId: user,
      name: bucket.name || user.name,
      email: bucket.email || user.email,
      roleName: bucket.roleName || (user as { roleName?: string }).roleName,
    };
  };

  property.createdBy = asUser(property.createdBy);
  property.approvedBy = asUser(property.approvedBy);
  property.updatedBy = asUser(property.updatedBy);
  property.deactivatedBy = asUser(property.deactivatedBy);
  property.deactivationActor = fillAudit(property.deactivationActor);
  property.postedBy = fillAudit(property.postedBy);
  property.lastUpdatedBy = fillAudit(property.lastUpdatedBy);
  property.permanentlyDeletedBy = fillAudit(property.permanentlyDeletedBy);
  if (Array.isArray(property.updateHistory)) {
    property.updateHistory = property.updateHistory.map((row: any) => fillAudit(row));
  }
  return property;
}
