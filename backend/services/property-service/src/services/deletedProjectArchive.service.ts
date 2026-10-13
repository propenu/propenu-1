import mongoose from "mongoose";
import FeaturedProject from "../models/featurePropertiesModel";
import DeletedProject from "../models/deletedProjectModel";
import User from "../models/userModel";

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
  projectId?: unknown;
  deletedAt?: Date;
  deletedBy?: unknown;
};

const oneArchive = (
  value: ArchiveRow | ArchiveRow[] | null | undefined,
): ArchiveRow | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

const LIST_SELECT =
  "projectId title slug propertyCode city state locality address categoryType propertyType priceFrom priceTo heroImage builderName createdByName promotionType deletedAt deletedBy purgedFromLive";

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

const builderNameOf = (doc: any) => {
  const about = Array.isArray(doc?.aboutSummary) ? doc.aboutSummary : [];
  return String(
    about.find((row: { builderName?: string }) => row?.builderName)?.builderName ||
      doc?.builderName ||
      doc?.createdBy?.name ||
      doc?.postedBy?.name ||
      "",
  ).trim();
};

const historyActivity = (doc: any): ArchiveEvent[] => {
  const rows = Array.isArray(doc?.updateHistory) ? doc.updateHistory : [];
  return rows.map((row: any) => ({
    action: String(row?.action || "updated"),
    at: row?.updatedAt ? new Date(row.updatedAt) : new Date(),
    userId: asId(row?.userId),
    name: String(row?.name || ""),
    email: String(row?.email || ""),
    roleName: String(row?.roleName || ""),
  }));
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

const snapshotOf = (doc: any) => {
  const plain = typeof doc?.toObject === "function" ? doc.toObject() : { ...doc };
  delete plain.__v;
  return JSON.parse(JSON.stringify(plain));
};

const summaryOf = async (doc: any) => {
  const snapshot = snapshotOf(doc);
  let createdByName = String(doc?.createdBy?.name || doc?.postedBy?.name || "");
  if (!createdByName) {
    const creatorId = asId(doc?.createdBy);
    if (creatorId) {
      const creator = await User.findById(creatorId).select("name companyName").lean();
      createdByName = String(creator?.name || creator?.companyName || "");
    }
  }
  return {
    projectId: doc._id,
    title: String(doc.title || "Untitled project"),
    slug: String(doc.slug || ""),
    propertyCode: String(doc.propertyCode || ""),
    city: String(doc.city || ""),
    state: String(doc.state || ""),
    locality: String(doc.locality || ""),
    address: String(doc.address || ""),
    categoryType: String(doc.categoryType || ""),
    propertyType: String(doc.propertyType || ""),
    priceFrom: doc.priceFrom,
    priceTo: doc.priceTo,
    heroImage: typeof doc.heroImage === "string" ? doc.heroImage : "",
    builderName: builderNameOf(doc) || createdByName,
    createdByName,
    promotionType: String(doc?.promotion?.type || "normal"),
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt) : new Date(),
    deletedBy: {
      userId: asId(doc?.deletedBy?.userId),
      name: String(doc?.deletedBy?.name || ""),
      email: String(doc?.deletedBy?.email || ""),
      roleName: String(doc?.deletedBy?.roleName || ""),
    },
    snapshot,
  };
};

/** Store or refresh the deleted-project copy. Safe to call more than once. */
export async function archiveDeletedProject(
  doc: any,
  options?: { event?: ArchiveEvent; purged?: boolean },
) {
  if (!doc?._id) return null;
  const fields = await summaryOf(doc);
  if (options?.purged && options.event) {
    fields.deletedAt = options.event.at;
    fields.deletedBy = {
      userId: options.event.userId,
      name: options.event.name,
      email: options.event.email,
      roleName: options.event.roleName,
    };
  }
  const existing = await DeletedProject.findOne({ projectId: doc._id })
    .select("deletedAt")
    .lean();

  if (!existing) {
    const activity = historyActivity(doc);
    if (options?.event) {
      const isDeactivate =
        options.event.action === "deactivated" || options.event.action === "deleted";
      const sameMoment = activity.some((row) => {
        const close =
          Math.abs(new Date(row.at).getTime() - options.event!.at.getTime()) < 2000;
        if (!close) return false;
        if (row.action === options.event?.action) return true;
        return (
          isDeactivate &&
          (row.action === "deleted" || row.action === "deactivated")
        );
      });
      if (!sameMoment) activity.push(options.event);
    }
    return DeletedProject.create({
      ...fields,
      purgedFromLive: Boolean(options?.purged),
      activity,
    });
  }

  const update: Record<string, unknown> = {
    $set: {
      ...fields,
      ...(options?.purged ? { purgedFromLive: true } : {}),
    },
  };
  const deletedAtChanged =
    options?.event &&
    new Date((existing as { deletedAt?: Date }).deletedAt || 0).getTime() !==
      fields.deletedAt.getTime();
  if (options?.event && (options.purged || deletedAtChanged)) {
    update.$push = { activity: options.event };
  }
  await DeletedProject.updateOne({ projectId: doc._id }, update);
  return DeletedProject.findOne({ projectId: doc._id }).lean();
}

/**
 * Older permanent deletes may already have a saved copy while the live row is gone.
 * Mark those copies so the deleted-projects page can show them.
 */
async function revealArchivesRemovedFromLive() {
  const pending = await DeletedProject.find({ purgedFromLive: { $ne: true } })
    .select("projectId")
    .lean();
  if (!pending.length) return;
  const ids = pending.map((row) => row.projectId).filter(Boolean);
  const stillLive = await FeaturedProject.find({ _id: { $in: ids } })
    .select("_id")
    .lean();
  const liveIds = new Set(stillLive.map((row) => String(row._id)));
  const removed = ids.filter((id) => !liveIds.has(String(id)));
  if (!removed.length) return;
  await DeletedProject.updateMany(
    { projectId: { $in: removed } },
    { $set: { purgedFromLive: true } },
  );
}

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listDeletedProjects(options?: {
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
      { builderName: rx },
      { createdByName: rx },
      { "deletedBy.name": rx },
      { "deletedBy.email": rx },
    ];
  }
  const category = String(options?.category || "").trim().toLowerCase();
  if (
    category === "residential" ||
    category === "commercial" ||
    category === "land" ||
    category === "agricultural"
  ) {
    filter.categoryType = category;
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
    DeletedProject.find(filter)
      .select(LIST_SELECT)
      .sort({ deletedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DeletedProject.countDocuments(filter),
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

/** Remove the saved deleted-project copy from the database. */
export async function purgeDeletedProjectArchive(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return oneArchive(
    await DeletedProject.findOneAndDelete({
      _id: id,
      purgedFromLive: true,
    }).lean(),
  );
}

export async function getDeletedProject(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const byArchive = oneArchive(
    await DeletedProject.findOne({
      _id: id,
      purgedFromLive: true,
    }).lean(),
  );
  if (byArchive) return byArchive;
  return oneArchive(
    await DeletedProject.findOne({ projectId: id, purgedFromLive: true }).lean(),
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

/** Saved copy, shaped like a live featured project, for the project details page. */
export async function projectFromDeletedArchive(id: string) {
  const archive = await getDeletedProject(id);
  const snapshot = archive?.snapshot;
  if (!snapshot || typeof snapshot !== "object") return null;

  const project: any = {
    ...snapshot,
    _id: archive.projectId || snapshot._id,
    permanentlyDeleted: true,
    permanentlyDeletedAt: archive.deletedAt || snapshot.deletedAt || null,
    permanentlyDeletedBy: archive.deletedBy || snapshot.deletedBy || null,
  };

  const ids = new Set<string>();
  const collect = (value: unknown) => {
    const userId = userIdOf(value);
    if (userId) ids.add(userId);
  };
  collect(project.createdBy);
  collect(project.approvedBy);
  collect(project.updatedBy);
  collect(project.relationshipManagerId);
  collect(project.postedBy?.userId);
  collect(project.lastUpdatedBy?.userId);
  collect(project.deletedBy?.userId);
  collect(project.permanentlyDeletedBy?.userId);
  collect(project.relationshipManager?.userId);
  if (Array.isArray(project.updateHistory)) {
    project.updateHistory.forEach((row: { userId?: unknown }) => collect(row?.userId));
  }

  if (!ids.size) return project;

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
      phone: bucket.phone || user.phone,
      roleName: bucket.roleName || (user as { roleName?: string }).roleName,
    };
  };

  project.createdBy = asUser(project.createdBy);
  project.approvedBy = asUser(project.approvedBy);
  project.updatedBy = asUser(project.updatedBy);
  project.relationshipManagerId = asUser(project.relationshipManagerId);
  project.postedBy = fillAudit(project.postedBy);
  project.lastUpdatedBy = fillAudit(project.lastUpdatedBy);
  project.deletedBy = fillAudit(project.deletedBy);
  project.permanentlyDeletedBy = fillAudit(project.permanentlyDeletedBy);
  project.relationshipManager = fillAudit(project.relationshipManager);
  if (Array.isArray(project.updateHistory)) {
    project.updateHistory = project.updateHistory.map((row: any) => fillAudit(row));
  }

  return project;
}
