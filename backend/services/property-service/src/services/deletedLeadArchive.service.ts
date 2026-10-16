import { Types } from "mongoose";
import DeletedLead from "../models/deletedLeadModel";
import PublicLead from "../models/PublicLead";
import Lead from "../models/LeadModel";
import User from "../models/userModel";
import FeaturedProject from "../models/featurePropertiesModel";
import { AuthRequest } from "../middlewares/authMiddleware";

export type LeadActor = {
  userId?: string;
  name: string;
  email: string;
  phone: string;
  roleName: string;
  at?: Date;
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function resolveLeadActor(req: AuthRequest): Promise<LeadActor> {
  const userId = String(req.user?.id || "");
  const user =
    userId && Types.ObjectId.isValid(userId)
      ? await User.findById(userId).select("name email phone").lean()
      : null;

  return {
    userId: userId && Types.ObjectId.isValid(userId) ? userId : undefined,
    name: String((user as any)?.name || req.user?.name || ""),
    email: String((user as any)?.email || req.user?.email || ""),
    phone: String((user as any)?.phone || ""),
    roleName: String(req.user?.roleName || ""),
  };
}

const actorFields = (actor?: Partial<LeadActor> | null, at?: Date) => {
  if (!actor) return undefined;
  const userId =
    actor.userId && Types.ObjectId.isValid(String(actor.userId))
      ? actor.userId
      : undefined;
  return {
    userId,
    name: String(actor.name || ""),
    email: String(actor.email || ""),
    phone: String(actor.phone || ""),
    roleName: String(actor.roleName || ""),
    at: at || actor.at || undefined,
  };
};

const toArchiveRow = (
  lead: any,
  actor: LeadActor,
  deletionType: "single" | "bulk",
  projectTitle = "",
) => ({
  leadId: lead._id,
  projectId: lead.projectId,
  projectTitle: String(lead?.propertySnapshot?.title || projectTitle || ""),
  propertyType: String(lead.propertyType || ""),
  listingKind:
    lead.propertyType && lead.propertyType !== "featuredprojects"
      ? "property"
      : "project",
  name: String(lead.name || ""),
  phone: String(lead.phone || ""),
  email: String(lead.email || ""),
  status: String(lead.status || ""),
  source: String(lead.source || ""),
  message: String(lead.message || ""),
  purchaseTimeline: String(lead.purchaseTimeline || ""),
  budgetRange: String(lead.budgetRange || ""),
  leadCreatedAt: lead.createdAt || undefined,
  importedBy: lead.importedBy
    ? actorFields(lead.importedBy, lead.importedBy.at)
    : undefined,
  deletionType,
  deletedAt: new Date(),
  deletedBy: actorFields(actor, new Date()),
});

const projectTitleFor = async (projectId: unknown) => {
  const id = String(projectId || "");
  if (!Types.ObjectId.isValid(id)) return "";
  const project = await FeaturedProject.findById(id)
    .select("title projectName buildingName")
    .lean();
  return String(
    (project as any)?.title ||
      (project as any)?.projectName ||
      (project as any)?.buildingName ||
      "",
  );
};

export async function archiveLeadById(
  leadId: string,
  actor: LeadActor,
  deletionType: "single" | "bulk" = "single",
) {
  if (!Types.ObjectId.isValid(leadId)) {
    throw new Error("Invalid Lead ID");
  }

  const publicLead = await PublicLead.findById(leadId).lean();
  const lead = publicLead || (await Lead.findById(leadId).lean());
  if (!lead) {
    throw new Error("Lead not found");
  }

  const title = await projectTitleFor((lead as any).projectId);
  await DeletedLead.create(toArchiveRow(lead, actor, deletionType, title));
  return lead;
}

export async function archiveProjectLeads(projectId: string, actor: LeadActor) {
  if (!Types.ObjectId.isValid(projectId)) {
    throw new Error("Invalid projectId");
  }

  const [publicLeads, propertyLeads, projectTitle] = await Promise.all([
    PublicLead.find({ projectId }).lean(),
    Lead.find({ projectId }).lean(),
    projectTitleFor(projectId),
  ]);

  const rows = [...publicLeads, ...propertyLeads].map((lead) =>
    toArchiveRow(lead, actor, "bulk", projectTitle),
  );

  if (rows.length) {
    await DeletedLead.insertMany(rows, { ordered: false });
  }

  return rows.length;
}

export async function listDeletedImportedLeads(projectId: string) {
  if (!Types.ObjectId.isValid(projectId)) return [];
  return DeletedLead.find({
    projectId,
    source: "imported",
    "importedBy.at": { $exists: true, $ne: null },
  })
    .select("importedBy source")
    .lean();
}

export async function listDeletedLeads(options?: {
  page?: number;
  limit?: number;
  q?: string;
  from?: string;
  to?: string;
  deletionType?: string;
  scope?: string;
}) {
  const page = Math.max(1, Number(options?.page) || 1);
  const limit = Math.min(48, Math.max(1, Number(options?.limit) || 12));
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = {};
  const q = String(options?.q || "").trim();

  if (q) {
    const rx = { $regex: escapeRegex(q), $options: "i" };
    filter.$or = [
      { name: rx },
      { phone: rx },
      { email: rx },
      { projectTitle: rx },
      { "deletedBy.name": rx },
      { "deletedBy.email": rx },
      { "importedBy.name": rx },
    ];
  }

  const deletionType = String(options?.deletionType || "").trim().toLowerCase();
  if (deletionType === "single" || deletionType === "bulk") {
    filter.deletionType = deletionType;
  }

  const scope = String(options?.scope || "").trim().toLowerCase();
  if (scope === "property") {
    filter.listingKind = "property";
  } else if (scope === "project") {
    filter.listingKind = { $ne: "property" };
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
    DeletedLead.find(filter)
      .sort({ deletedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DeletedLead.countDocuments(filter),
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

export async function purgeDeletedLead(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return DeletedLead.findByIdAndDelete(id).lean();
}

export async function purgeAllDeletedLeads() {
  const result = await DeletedLead.deleteMany({});
  return { deletedCount: result.deletedCount ?? 0 };
}
