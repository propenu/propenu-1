import { Request, Response } from "express";
import { Types } from "mongoose";
import { BuilderInvoice, INVOICE_PAYMENT_METHODS } from "../models/builderInvoiceModel";
import User from "../../../user-service/src/models/userModel";
import FeaturedProject from "../../../user-service/src/models/featurePropertiesModel";
import { BuilderPlan } from "../models/builderPlanModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import { OwnBuilderInvoiceRequest } from "../middlewares/requirePermission";
import { generateBuilderPlanInvoicePdf } from "../utils/generateBuilderPlanInvoicePdf";

function getRoleNameFromUser(user: any) {
  const role = user?.roleId;

  if (!role) return undefined;
  if (typeof role === "string") return undefined;
  if (typeof role?.name === "string") return role.name.toLowerCase();

  return undefined;
}

export function buildBuilderDetails(user: any) {
  return {
    name: user?.name,
    companyName: user?.companyName,
    email: user?.email,
    phone: user?.phone,
    userCode: user?.userCode,
    locality: user?.locality,
    city: user?.city,
    state: user?.state,
    pincode: user?.pincode,
    address: user?.address,
  };
}

function toNumberOrUndefined(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const PLACEMENT_LABEL: Record<string, string> = {
  prime: "Prime",
  featured: "Top Selling",
};

export function buildPlanSnapshot(plan: any) {
  const doc = typeof plan?.toObject === "function" ? plan.toObject() : plan || {};
  return {
    planId: doc._id,
    code: doc.code,
    title: doc.title,
    durationDays: Number(doc.durationDays) || 30,
    mainPlacement: doc.mainPlacement || "none",
    sponsoredEnabled: Boolean(doc.sponsoredEnabled),
    locationRule: doc.locationRule || "project_city",
    mainCoverage: doc.mainCoverage || {},
    sponsoredSameAsMain: doc.sponsoredSameAsMain !== false,
    sponsoredAd: doc.sponsoredAd || {},
    visibleLeadLimit: Number(doc.visibleLeadLimit) || 0,
    startMode: doc.startMode === "team" ? "team" : "auto",
  };
}

export function describePlanPackage(snapshot: {
  mainPlacement?: string;
  sponsoredEnabled?: boolean;
}) {
  const main = PLACEMENT_LABEL[snapshot.mainPlacement || ""];
  if (main) return snapshot.sponsoredEnabled ? `${main} + Sponsored` : main;
  return snapshot.sponsoredEnabled ? "Sponsored" : "Listing only";
}

function readDeliveryMode(value: unknown, fallback: "auto" | "team") {
  return value === "auto" || value === "team" ? value : fallback;
}

/** A new paid period for a project that is still covered starts when the current one ends. */
export async function resolveRenewalWindow(params: {
  propertyId: string;
  durationDays: number;
  requestedStart: Date;
  excludeId?: string;
}) {
  const filter: Record<string, unknown> = {
    propertyId: params.propertyId,
    paymentStatus: "paid",
    endDate: { $gt: params.requestedStart },
    promotionStatus: { $ne: "cancelled" },
  };
  if (params.excludeId) filter._id = { $ne: params.excludeId };

  const current = await BuilderInvoice.findOne(filter).sort({ endDate: -1 }).lean();
  const startDate = current?.endDate ? new Date(current.endDate) : params.requestedStart;
  return {
    renewalOf: current?._id ?? null,
    startDate,
    endDate: new Date(startDate.getTime() + params.durationDays * DAY_MS),
  };
}

export async function resolveInvoiceDependencies(params: {
  userId?: string;
  propertyId?: string;
  servicePlanId?: string;
}) {
  const { userId, propertyId, servicePlanId } = params;

  if (!userId || !Types.ObjectId.isValid(String(userId))) {
    return { ok: false as const, status: 400, message: "A valid builder userId is required" };
  }

  if (!propertyId || !Types.ObjectId.isValid(String(propertyId))) {
    return { ok: false as const, status: 400, message: "A valid propertyId is required" };
  }

  if (!servicePlanId || !Types.ObjectId.isValid(String(servicePlanId))) {
    return { ok: false as const, status: 400, message: "A valid servicePlanId is required" };
  }

  const [targetUser, propertyDoc, planDoc] = await Promise.all([
    User.findById(userId).populate("roleId", "name"),
    FeaturedProject.findById(propertyId).select("title createdBy propertyCode"),
    BuilderPlan.findById(servicePlanId),
  ]);

  if (!targetUser) {
    return { ok: false as const, status: 404, message: "Selected builder user not found" };
  }

  const targetRoleName = getRoleNameFromUser(targetUser);
  if (targetRoleName !== "builder") {
    return { ok: false as const, status: 400, message: "Selected user is not a builder" };
  }

  if (!propertyDoc) {
    return { ok: false as const, status: 404, message: "Selected project not found" };
  }

  if (String(propertyDoc.createdBy) !== String(targetUser._id)) {
    return {
      ok: false as const,
      status: 400,
      message: "Selected project does not belong to the selected builder",
    };
  }

  if (!planDoc) {
    return { ok: false as const, status: 404, message: "Selected builder plan not found" };
  }

  return {
    ok: true as const,
    targetUser,
    propertyDoc,
    planDoc,
  };
}

const USER_FIELDS = "name companyName email phone userCode locality city state pincode address";
const PROJECT_FIELDS = "title propertyCode locality city state pincode location";
const PLAN_FIELDS = "code title durationDays price discount mainPlacement sponsoredEnabled locationRule visibleLeadLimit startMode";
const PAYMENT_STATUSES = ["pending", "paid", "partial", "failed"];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const queryText = (value: unknown) => String(value ?? "").trim();
const objectIdOrNull = (value: unknown) => {
  const text = queryText(value);
  return text && Types.ObjectId.isValid(text) ? new Types.ObjectId(text) : null;
};

function ownBuilderUserId(req: Request) {
  const scoped = req as OwnBuilderInvoiceRequest;
  if (!scoped.ownBuilderInvoices) return null;
  const id = String(scoped.user?.id || "").trim();
  return Types.ObjectId.isValid(id) ? id : "";
}

function invoiceOwnerId(invoice: { userId?: unknown }) {
  const userId = invoice.userId as { _id?: unknown } | string | undefined;
  if (userId && typeof userId === "object" && userId._id) return String(userId._id);
  return String(userId || "");
}

function buildInvoiceListFilter(query: Request["query"]) {
  const filter: Record<string, unknown> = {};
  const userId = objectIdOrNull(query.userId);
  const propertyId = objectIdOrNull(query.propertyId);
  const servicePlanId = objectIdOrNull(query.servicePlanId);
  const status = queryText(query.paymentStatus).toLowerCase();
  const planName = queryText(query.planName);

  if (userId) filter.userId = userId;
  if (propertyId) filter.propertyId = propertyId;
  if (servicePlanId) filter.servicePlanId = servicePlanId;
  if (PAYMENT_STATUSES.includes(status)) filter.paymentStatus = status;
  if (planName) filter.servicePlanName = planName;
  if (queryText(query.invoiceNumber)) filter.invoiceNumber = queryText(query.invoiceNumber);
  const invoiceType = queryText(query.invoiceType).toLowerCase();
  if (invoiceType === "renewal") filter.renewalOf = { $ne: null };
  if (invoiceType === "new") filter.renewalOf = null;
  for (const key of ["state", "city", "locality"]) {
    const value = queryText(query[key]);
    if (value) filter[`builderDetails.${key}`] = value;
  }

  const q = queryText(query.q).slice(0, 80);
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      "invoiceNumber", "builderDetails.name", "builderDetails.companyName", "builderDetails.email",
      "builderDetails.phone", "builderDetails.userCode", "propertyTitle", "projectCode", "servicePlanName",
    ].map((field) => ({ [field]: pattern }));
  }
  return filter;
}

const sortedDistinct = (values: unknown[]) =>
  [...new Set(values.map((value) => queryText(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** Filter dropdown options; locations narrow by the level above them. */
async function invoiceFacets(query: Request["query"]) {
  const state = queryText(query.state);
  const city = queryText(query.city);
  const cityScope: Record<string, unknown> = state ? { "builderDetails.state": state } : {};
  const localityScope: Record<string, unknown> = { ...cityScope, ...(city ? { "builderDetails.city": city } : {}) };

  const [builders, projects, plans, states, cities, localities] = await Promise.all([
    BuilderInvoice.aggregate([
      { $group: { _id: "$userId", name: { $last: "$builderDetails.name" }, company: { $last: "$builderDetails.companyName" } } },
      { $sort: { company: 1, name: 1 } },
    ]),
    BuilderInvoice.aggregate([
      { $group: { _id: "$propertyId", title: { $last: "$propertyTitle" }, code: { $last: "$projectCode" } } },
      { $sort: { title: 1 } },
    ]),
    BuilderInvoice.distinct("servicePlanName"),
    BuilderInvoice.distinct("builderDetails.state"),
    BuilderInvoice.distinct("builderDetails.city", cityScope),
    BuilderInvoice.distinct("builderDetails.locality", localityScope),
  ]);

  return {
    builders: builders.map((row: any) => ({ value: String(row._id), label: row.company || row.name || "Builder", hint: row.company && row.name ? row.name : "" })),
    projects: projects.map((row: any) => ({ value: String(row._id), label: row.title || "Project", hint: row.code || "" })),
    plans: sortedDistinct(plans),
    state: sortedDistinct(states),
    city: sortedDistinct(cities),
    locality: sortedDistinct(localities),
  };
}

export async function getBuilderInvoices(req: Request, res: Response) {
  try {
    const ownId = ownBuilderUserId(req);
    if (ownId === "") {
      return res.status(403).json({ success: false, message: "You can only view your own invoices" });
    }
    if (ownId) {
      const requested = queryText(req.query.userId);
      if (requested && requested !== ownId) {
        return res.status(403).json({ success: false, message: "You can only view your own invoices" });
      }
    }

    const filter = buildInvoiceListFilter(ownId ? { ...req.query, userId: ownId } : req.query);
    const paged = req.query.page !== undefined;
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit) || 12)));

    const find = () =>
      BuilderInvoice.find(filter)
        .populate("userId", USER_FIELDS)
        .populate("propertyId", PROJECT_FIELDS)
        .populate("servicePlanId", PLAN_FIELDS)
        .populate("renewalOf", "invoiceNumber servicePlanName startDate endDate")
        .sort({ createdAt: -1, _id: -1 });

    if (!paged) {
      return res.json({ success: true, invoices: await find().lean() });
    }

    const [total, invoices, facets] = await Promise.all([
      BuilderInvoice.countDocuments(filter),
      find().skip((page - 1) * limit).limit(limit).lean(),
      ownId || req.query.facets === "0" ? Promise.resolve(undefined) : invoiceFacets(req.query),
    ]);
    const pages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      success: true,
      invoices,
      meta: { total, page, limit, pages, hasNextPage: page < pages, hasPreviousPage: page > 1 },
      ...(facets ? { facets } : {}),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch builder invoices",
    });
  }
}

export async function getBuilderInvoiceById(req: Request, res: Response) {
  try {
    const id = req.params.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Builder invoice id is required",
      });
    }

    const invoice = Types.ObjectId.isValid(id)
      ? await BuilderInvoice.findById(id)
          .populate("userId")
          .populate("propertyId")
          .populate("servicePlanId")
      : await BuilderInvoice.findOne({ invoiceNumber: id })
          .populate("userId")
          .populate("propertyId")
          .populate("servicePlanId");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Builder invoice not found",
      });
    }

    const ownId = ownBuilderUserId(req);
    if (ownId !== null && invoiceOwnerId(invoice) !== ownId) {
      return res.status(404).json({
        success: false,
        message: "Builder invoice not found",
      });
    }

    return res.json({
      success: true,
      invoice,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch builder invoice",
    });
  }
}

export async function getBuilderInvoicePdf(req: Request, res: Response) {
  try {
    const invoice = await BuilderInvoice.findById(req.params.id)
      .populate("userId")
      .populate("propertyId")
      .populate("servicePlanId");

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Builder invoice not found" });
    }

    const ownId = ownBuilderUserId(req);
    if (ownId !== null && invoiceOwnerId(invoice) !== ownId) {
      return res.status(404).json({ success: false, message: "Builder invoice not found" });
    }

    const data: any = invoice.toObject();
    const builder = data.builderDetails || data.userId || {};
    const property = data.propertyId || {};
    const plan = data.servicePlanId || {};
    const address = builder.address || [builder.locality, builder.city, builder.state, builder.pincode]
      .filter(Boolean).join(", ");
    const pdf = await generateBuilderPlanInvoicePdf({
      invoiceNumber: data.invoiceNumber,
      invoiceDate: new Date(data.invoiceDate).toLocaleDateString("en-IN"),
      orderId: data.orderId,
      builderName: builder.name || builder.companyName || "Builder",
      companyName: builder.companyName,
      builderPhone: builder.phone,
      builderEmail: builder.email,
      builderAddress: address,
      propertyTitle: data.propertyTitle || property.title || "Project",
      projectCode: data.projectCode || property.propertyCode,
      servicePlanName: data.servicePlanName || plan.title || "Builder plan",
      timePeriod: data.timePeriod,
      paymentMethod: data.paymentMethod,
      paymentStatus: data.paymentStatus,
      subtotalAmount: data.subtotalAmount ?? data.totalAmount,
      gstRate: data.gstRate ?? 0,
      gstAmount: data.gstAmount ?? 0,
      totalAmount: data.totalAmount,
      discountAmount: data.discountAmount ?? 0,
      paidAmount: data.paidAmount,
    });

    const disposition = req.query.download === "true" ? "attachment" : "inline";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${data.invoiceNumber}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    console.error("[builder-invoice] PDF generation failed", error);
    return res.status(500).json({ success: false, message: "Failed to generate builder invoice PDF" });
  }
}

export async function createBuilderInvoice(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const resolved = await resolveInvoiceDependencies({
      userId: req.body.userId,
      propertyId: req.body.propertyId,
      servicePlanId: req.body.servicePlanId,
    });

    if (!resolved.ok) {
      return res.status(resolved.status).json({
        success: false,
        message: resolved.message,
      });
    }

    const planSnapshot = buildPlanSnapshot(resolved.planDoc);
    const requestedStart = req.body.startDate ? new Date(req.body.startDate) : new Date();
    const window = await resolveRenewalWindow({
      propertyId: String(resolved.propertyDoc._id),
      durationDays: planSnapshot.durationDays,
      requestedStart: Number.isNaN(requestedStart.getTime()) ? new Date() : requestedStart,
    });

    const payload = {
      ...req.body,
      userId: String(resolved.targetUser._id),
      builderDetails: buildBuilderDetails(resolved.targetUser),
      propertyId: String(resolved.propertyDoc._id),
      propertyTitle: req.body.propertyTitle || resolved.propertyDoc.title,
      projectCode: req.body.projectCode || (resolved.propertyDoc as any).propertyCode,
      servicePlanId: String(resolved.planDoc._id),
      servicePlanName: req.body.servicePlanName || resolved.planDoc.title,
      serviceType: describePlanPackage(planSnapshot),
      planSnapshot,
      deliveryMode: readDeliveryMode(req.body.deliveryMode, planSnapshot.startMode as "auto" | "team"),
      startDate: window.startDate,
      endDate: window.endDate,
      timePeriod: req.body.timePeriod || `${planSnapshot.durationDays} days`,
      renewalOf: window.renewalOf,
      promotionStatus: req.body.paymentStatus === "paid" ? "not_started" : "waiting_payment",
      promotionNote: undefined,
      subtotalAmount:
        toNumberOrUndefined(req.body.subtotalAmount) ??
        toNumberOrUndefined(req.body.totalAmount) ??
        resolved.planDoc.price,
      totalAmount:
        toNumberOrUndefined(req.body.totalAmount) ??
        resolved.planDoc.finalPrice ??
        resolved.planDoc.price,
      discountValue:
        toNumberOrUndefined(req.body.discountValue) ??
        resolved.planDoc.discount ??
        0,
      discountAmount:
        toNumberOrUndefined(req.body.discountAmount) ??
        resolved.planDoc.discount ??
        0,
      gstRate: toNumberOrUndefined(req.body.gstRate) ?? 0,
      gstAmount: toNumberOrUndefined(req.body.gstAmount) ?? 0,
      paidAmount:
        toNumberOrUndefined(req.body.paidAmount) ??
        toNumberOrUndefined(req.body.totalAmount) ??
        resolved.planDoc.finalPrice ??
        resolved.planDoc.price,
    };

    const invoice = await BuilderInvoice.create(payload);

    return res.status(201).json({
      success: true,
      message: "Builder invoice created successfully",
      invoice,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * One builder's subscriptions grouped by project (paged), plus totals.
 * Each project row summarises its invoices: count, renewals, paid total, covered period and current state.
 */
export async function getBuilderSubscriptionProjects(req: Request, res: Response) {
  try {
    const userId = objectIdOrNull(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: "Invalid builder id" });
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit) || 10)));
    const q = queryText(req.query.q).slice(0, 80);
    const projectId = req.query.projectId ? objectIdOrNull(req.query.projectId) : null;
    if (req.query.projectId && !projectId) {
      return res.status(400).json({ success: false, message: "Invalid project id" });
    }
    const now = new Date();

    const live = { $and: [{ $eq: ["$paymentStatus", "paid"] }, { $ne: ["$promotionStatus", "cancelled"] }] };
    const covering = { $and: [live, { $gt: ["$endDate", now] }] };
    const started = { $and: [covering, { $lte: ["$startDate", now] }] };
    const searchStage = q
      ? [{ $match: { $or: [{ title: new RegExp(escapeRegex(q), "i") }, { code: new RegExp(escapeRegex(q), "i") }] } }]
      : [];

    const [result] = await BuilderInvoice.aggregate([
      { $match: projectId ? { userId, propertyId: projectId } : { userId } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$propertyId",
          title: { $first: "$propertyTitle" },
          code: { $first: "$projectCode" },
          invoices: { $sum: 1 },
          renewals: { $sum: { $cond: [{ $ifNull: ["$renewalOf", false] }, 1, 0] } },
          paidTotal: { $sum: { $cond: [{ $in: ["$paymentStatus", ["paid", "partial"]] }, { $ifNull: ["$paidAmount", 0] }, 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 0, 1] } },
          firstStart: { $min: { $cond: [live, "$startDate", null] } },
          lastEnd: { $max: { $cond: [live, "$endDate", null] } },
          coveringCount: { $sum: { $cond: [covering, 1, 0] } },
          runningCount: { $sum: { $cond: [started, 1, 0] } },
          currentPlan: { $max: { $cond: [started, "$servicePlanName", null] } },
          latestPlan: { $first: "$servicePlanName" },
          latestInvoiceNumber: { $first: "$invoiceNumber" },
          lastActivity: { $first: "$createdAt" },
        },
      },
      {
        $facet: {
          rows: [
            ...searchStage,
            { $sort: { lastActivity: -1, _id: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
          ],
          matched: [...searchStage, { $count: "count" }],
          totals: [
            {
              $group: {
                _id: null,
                projects: { $sum: 1 },
                invoices: { $sum: "$invoices" },
                renewals: { $sum: "$renewals" },
                paidTotal: { $sum: "$paidTotal" },
                active: { $sum: { $cond: [{ $gt: ["$runningCount", 0] }, 1, 0] } },
              },
            },
          ],
        },
      },
    ]);

    const totals = result?.totals?.[0] || { projects: 0, invoices: 0, renewals: 0, paidTotal: 0, active: 0 };
    const matched = Number(result?.matched?.[0]?.count) || 0;
    const rows: any[] = result?.rows || [];
    const projectDocs: any[] = rows.length
      ? await FeaturedProject.find({ _id: { $in: rows.map((row) => row._id) } })
          .select("heroImage logo gallerySummary city locality")
          .lean()
      : [];
    const docById = new Map(projectDocs.map((doc) => [String(doc._id), doc]));

    const projects = rows.map((row: any) => {
      const doc = docById.get(String(row._id)) || {};
      return {
      projectId: String(row._id),
      image: doc.heroImage || doc.logo?.url || doc.gallerySummary?.[0]?.url || null,
      location: [doc.locality, doc.city].filter(Boolean).join(", ") || null,
      title: row.title || "Project",
      code: row.code || null,
      invoices: row.invoices,
      renewals: row.renewals,
      pending: row.pending,
      paidTotal: row.paidTotal,
      firstStart: row.firstStart,
      lastEnd: row.lastEnd,
      currentPlan: row.currentPlan,
      latestPlan: row.latestPlan,
      latestInvoiceNumber: row.latestInvoiceNumber,
      state: row.runningCount > 0 ? "active" : row.coveringCount > 0 ? "scheduled" : row.lastEnd ? "expired" : "pending",
      };
    });

    return res.json({
      success: true,
      projects,
      totals: {
        projects: totals.projects,
        invoices: totals.invoices,
        renewals: totals.renewals,
        paidTotal: totals.paidTotal,
        active: totals.active,
      },
      meta: { page, limit, total: matched, pages: Math.max(1, Math.ceil(matched / limit)) },
    });
  } catch (error) {
    console.error("[builder-invoice] subscription projects failed", error);
    return res.status(500).json({ success: false, message: "Failed to load builder subscriptions" });
  }
}

/** How a builder's money was spent: totals, tax/discount split, and breakdowns by project, plan, month and method. */
export async function getBuilderSpendSummary(req: Request, res: Response) {
  try {
    const userId = objectIdOrNull(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: "Invalid builder id" });

    const monthsBack = 12;
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCMonth(since.getUTCMonth() - (monthsBack - 1));

    const total = { $ifNull: ["$totalAmount", 0] };
    const isPaid = { $eq: ["$paymentStatus", "paid"] };
    const isPartial = { $eq: ["$paymentStatus", "partial"] };
    // paidAmount is prefilled with the full amount on creation, so only paid/partial invoices count as received.
    const paid = { $cond: [{ $or: [isPaid, isPartial] }, { $ifNull: ["$paidAmount", 0] }, 0] };
    const outstanding = {
      $switch: {
        branches: [
          { case: { $eq: ["$paymentStatus", "pending"] }, then: total },
          { case: isPartial, then: { $max: [0, { $subtract: [total, { $ifNull: ["$paidAmount", 0] }] }] } },
        ],
        default: 0,
      },
    };
    const paidDate = { $ifNull: ["$invoiceDate", "$createdAt"] };

    const [result] = await BuilderInvoice.aggregate([
      { $match: { userId } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                invoices: { $sum: 1 },
                invoiced: { $sum: total },
                paid: { $sum: paid },
                outstanding: { $sum: outstanding },
                subtotal: { $sum: { $cond: [isPaid, { $ifNull: ["$subtotalAmount", 0] }, 0] } },
                discount: { $sum: { $cond: [isPaid, { $ifNull: ["$discountAmount", 0] }, 0] } },
                gst: { $sum: { $cond: [isPaid, { $ifNull: ["$gstAmount", 0] }, 0] } },
                newPaid: { $sum: { $cond: [{ $ifNull: ["$renewalOf", false] }, 0, paid] } },
                renewalPaid: { $sum: { $cond: [{ $ifNull: ["$renewalOf", false] }, paid, 0] } },
                firstPaidAt: { $min: { $cond: [isPaid, paidDate, null] } },
                lastPaidAt: { $max: { $cond: [isPaid, paidDate, null] } },
              },
            },
          ],
          byStatus: [{ $group: { _id: "$paymentStatus", count: { $sum: 1 }, amount: { $sum: total }, paid: { $sum: paid } } }],
          byProject: [
            {
              $group: {
                _id: "$propertyId",
                title: { $first: "$propertyTitle" },
                code: { $first: "$projectCode" },
                invoices: { $sum: 1 },
                paid: { $sum: paid },
                outstanding: { $sum: outstanding },
              },
            },
            { $sort: { paid: -1, invoices: -1 } },
            { $limit: 50 },
          ],
          byPlan: [
            { $group: { _id: { $ifNull: ["$servicePlanName", "Builder plan"] }, invoices: { $sum: 1 }, paid: { $sum: paid } } },
            { $sort: { paid: -1 } },
            { $limit: 20 },
          ],
          byMethod: [
            { $match: { paymentStatus: { $in: ["paid", "partial"] }, paidAmount: { $gt: 0 } } },
            { $group: { _id: { $ifNull: ["$paymentMethod", "other"] }, invoices: { $sum: 1 }, paid: { $sum: paid } } },
            { $sort: { paid: -1 } },
          ],
          byMonth: [
            { $match: { paymentStatus: { $in: ["paid", "partial"] }, paidAmount: { $gt: 0 } } },
            { $addFields: { at: paidDate } },
            { $match: { at: { $gte: since } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$at" } }, paid: { $sum: paid }, invoices: { $sum: 1 } } },
          ],
        },
      },
    ]);

    const t = result?.totals?.[0] || {};
    const monthMap = new Map((result?.byMonth || []).map((row: any) => [row._id, row]));
    const byMonth = Array.from({ length: monthsBack }, (_, index) => {
      const date = new Date(since);
      date.setUTCMonth(since.getUTCMonth() + index);
      const key = date.toISOString().slice(0, 7);
      const row: any = monthMap.get(key);
      return { month: key, paid: row?.paid || 0, invoices: row?.invoices || 0 };
    });

    return res.json({
      success: true,
      totals: {
        invoices: t.invoices || 0,
        invoiced: t.invoiced || 0,
        paid: t.paid || 0,
        outstanding: t.outstanding || 0,
        subtotal: t.subtotal || 0,
        discount: t.discount || 0,
        gst: t.gst || 0,
        newPaid: t.newPaid || 0,
        renewalPaid: t.renewalPaid || 0,
        firstPaidAt: t.firstPaidAt || null,
        lastPaidAt: t.lastPaidAt || null,
      },
      byStatus: (result?.byStatus || []).map((row: any) => ({ status: row._id || "pending", count: row.count, amount: row.amount, paid: row.paid })),
      byProject: (result?.byProject || []).map((row: any) => ({
        projectId: String(row._id),
        title: row.title || "Project",
        code: row.code || null,
        invoices: row.invoices,
        paid: row.paid,
        outstanding: row.outstanding,
      })),
      byPlan: (result?.byPlan || []).map((row: any) => ({ plan: row._id, invoices: row.invoices, paid: row.paid })),
      byMethod: (result?.byMethod || []).map((row: any) => ({ method: row._id, invoices: row.invoices, paid: row.paid })),
      byMonth,
    });
  } catch (error) {
    console.error("[builder-invoice] spend summary failed", error);
    return res.status(500).json({ success: false, message: "Failed to load builder spend" });
  }
}

const PAYMENT_METHODS: readonly string[] = INVOICE_PAYMENT_METHODS;

/** New invoice for the same project and plan as an old one; it starts when the current paid period ends. */
export async function renewBuilderInvoice(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const id = String(req.params.id || "");
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid invoice id" });
    }
    const source: any = await BuilderInvoice.findById(id).lean();
    if (!source) {
      return res.status(404).json({ success: false, message: "Builder invoice not found" });
    }

    const paymentStatus = String(req.body?.paymentStatus || "pending");
    if (!PAYMENT_STATUSES.includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: "Invalid payment status" });
    }
    const paymentMethod = String(req.body?.paymentMethod || source.paymentMethod || "upi");
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Invalid payment method" });
    }

    const resolved = await resolveInvoiceDependencies({
      userId: String(source.userId),
      propertyId: String(source.propertyId),
      servicePlanId: String(source.servicePlanId),
    });
    if (!resolved.ok) {
      return res.status(resolved.status).json({ success: false, message: resolved.message });
    }

    const planSnapshot = buildPlanSnapshot(resolved.planDoc);
    const window = await resolveRenewalWindow({
      propertyId: String(resolved.propertyDoc._id),
      durationDays: planSnapshot.durationDays,
      requestedStart: new Date(),
    });
    const now = new Date();

    const invoice = await BuilderInvoice.create({
      invoiceNumber: `BLD-INV-${Date.now()}`,
      invoiceDate: now,
      userId: String(resolved.targetUser._id),
      builderDetails: buildBuilderDetails(resolved.targetUser),
      propertyId: String(resolved.propertyDoc._id),
      propertyTitle: resolved.propertyDoc.title,
      projectCode: (resolved.propertyDoc as any).propertyCode,
      servicePlanId: String(resolved.planDoc._id),
      servicePlanName: resolved.planDoc.title,
      serviceType: describePlanPackage(planSnapshot),
      planSnapshot,
      deliveryMode: source.deliveryMode === "team" ? "team" : "auto",
      startDate: window.startDate,
      endDate: window.endDate,
      timePeriod: `${planSnapshot.durationDays} days`,
      renewalOf: window.renewalOf || source._id,
      promotionStatus: paymentStatus === "paid" ? "not_started" : "waiting_payment",
      subtotalAmount: source.subtotalAmount ?? source.totalAmount,
      totalAmount: source.totalAmount,
      discountType: source.discountType,
      discountValue: source.discountValue ?? 0,
      discountAmount: source.discountAmount ?? 0,
      gstRate: source.gstRate ?? 0,
      gstAmount: source.gstAmount ?? 0,
      paidAmount: paymentStatus === "paid" ? source.totalAmount : 0,
      paymentMethod,
      paymentStatus,
    });

    return res.status(201).json({
      success: true,
      message: `Renewal invoice ${invoice.invoiceNumber} created`,
      invoice,
    });
  } catch (error: any) {
    console.error("[builder-invoice] renew failed", error);
    return res.status(400).json({ success: false, message: error.message || "Could not renew invoice" });
  }
}

export async function updateBuilderInvoice(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Builder invoice id is required",
      });
    }

    const invoice = Types.ObjectId.isValid(id)
      ? await BuilderInvoice.findById(id)
      : await BuilderInvoice.findOne({ invoiceNumber: id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Builder invoice not found",
      });
    }

    const nextUserId = req.body.userId ?? String((invoice as any).userId);
    const nextPropertyId = req.body.propertyId ?? String((invoice as any).propertyId);
    const nextPlanId = req.body.servicePlanId ?? String((invoice as any).servicePlanId);

    const resolved = await resolveInvoiceDependencies({
      userId: nextUserId,
      propertyId: nextPropertyId,
      servicePlanId: nextPlanId,
    });

    if (!resolved.ok) {
      return res.status(resolved.status).json({
        success: false,
        message: resolved.message,
      });
    }

    const {
      planSnapshot: _ignoredSnapshot,
      promotionStatus: _ignoredStatus,
      promotionStartedAt: _ignoredStarted,
      promotionEndedAt: _ignoredEnded,
      renewalOf: _ignoredRenewal,
      payments: _ignoredPayments,
      proformaId: _ignoredProforma,
      proformaNumber: _ignoredProformaNumber,
      ...body
    } = req.body || {};
    const hasRecordedPayments = Array.isArray((invoice as any).payments) && (invoice as any).payments.length > 0;
    const planChanged = String((invoice as any).servicePlanId) !== String(resolved.planDoc._id);
    const snapshot =
      planChanged || !(invoice as any).planSnapshot
        ? buildPlanSnapshot(resolved.planDoc)
        : (invoice as any).planSnapshot;
    const previousStatus = (invoice as any).paymentStatus;
    const nextPaymentStatus = body.paymentStatus ?? previousStatus;
    const currentPromotionStatus = (invoice as any).promotionStatus || "not_started";
    const nextPromotionStatus =
      nextPaymentStatus !== "paid"
        ? currentPromotionStatus === "running" || currentPromotionStatus === "scheduled"
          ? currentPromotionStatus
          : "waiting_payment"
        : currentPromotionStatus === "waiting_payment"
          ? "not_started"
          : currentPromotionStatus;

    Object.assign(invoice, {
      ...body,
      planSnapshot: snapshot,
      serviceType: describePlanPackage(snapshot),
      deliveryMode: readDeliveryMode(
        body.deliveryMode,
        ((invoice as any).deliveryMode || snapshot.startMode || "auto") as "auto" | "team",
      ),
      promotionStatus: nextPromotionStatus,
      userId: String(resolved.targetUser._id),
      builderDetails: buildBuilderDetails(resolved.targetUser),
      propertyId: String(resolved.propertyDoc._id),
      propertyTitle: req.body.propertyTitle ?? (invoice as any).propertyTitle ?? resolved.propertyDoc.title,
      projectCode:
        req.body.projectCode ??
        (invoice as any).projectCode ??
        (resolved.propertyDoc as any).propertyCode,
      servicePlanId: String(resolved.planDoc._id),
      servicePlanName: req.body.servicePlanName ?? (invoice as any).servicePlanName ?? resolved.planDoc.title,
      subtotalAmount:
        toNumberOrUndefined(req.body.subtotalAmount) ??
        (invoice as any).subtotalAmount ??
        (invoice as any).totalAmount ??
        resolved.planDoc.price,
      totalAmount:
        toNumberOrUndefined(req.body.totalAmount) ??
        (invoice as any).totalAmount ??
        resolved.planDoc.finalPrice ??
        resolved.planDoc.price,
      discountValue:
        toNumberOrUndefined(req.body.discountValue) ??
        (invoice as any).discountValue ??
        resolved.planDoc.discount ??
        0,
      discountAmount:
        toNumberOrUndefined(req.body.discountAmount) ??
        (invoice as any).discountAmount ??
        resolved.planDoc.discount ??
        0,
      gstRate: toNumberOrUndefined(req.body.gstRate) ?? (invoice as any).gstRate ?? 0,
      gstAmount:
        toNumberOrUndefined(req.body.gstAmount) ?? (invoice as any).gstAmount ?? 0,
      paidAmount: hasRecordedPayments
        ? (invoice as any).paidAmount
        : toNumberOrUndefined(req.body.paidAmount) ??
          (invoice as any).paidAmount ??
          (invoice as any).totalAmount ??
          resolved.planDoc.finalPrice ??
          resolved.planDoc.price,
    });
    await invoice.save();

    return res.json({
      success: true,
      message: "Builder invoice updated successfully",
      invoice,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteBuilderInvoice(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Builder invoice id is required",
      });
    }

    const invoice = Types.ObjectId.isValid(id)
      ? await BuilderInvoice.findByIdAndDelete(id)
      : await BuilderInvoice.findOneAndDelete({ invoiceNumber: id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Builder invoice not found",
      });
    }

    return res.json({
      success: true,
      message: "Builder invoice deleted successfully",
      invoice,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete builder invoice",
    });
  }
}
