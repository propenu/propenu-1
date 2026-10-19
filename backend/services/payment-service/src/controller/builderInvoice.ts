import { Request, Response } from "express";
import { Types } from "mongoose";
import { BuilderInvoice } from "../models/builderInvoiceModel";
import User from "../../../user-service/src/models/userModel";
import FeaturedProject from "../../../user-service/src/models/featurePropertiesModel";
import { BuilderPlan } from "../models/builderPlanModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import { generateBuilderPlanInvoicePdf } from "../utils/generateBuilderPlanInvoicePdf";

function getRoleNameFromUser(user: any) {
  const role = user?.roleId;

  if (!role) return undefined;
  if (typeof role === "string") return undefined;
  if (typeof role?.name === "string") return role.name.toLowerCase();

  return undefined;
}

function buildBuilderDetails(user: any) {
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
async function resolveRenewalWindow(params: {
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

async function resolveInvoiceDependencies(params: {
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

export async function getBuilderInvoices(req: Request, res: Response) {
  try {
    const { userId, propertyId, servicePlanId, paymentStatus, invoiceNumber } =
      req.query;

    const filter: Record<string, unknown> = {};

    if (userId) filter.userId = userId;
    if (propertyId) filter.propertyId = propertyId;
    if (servicePlanId) filter.servicePlanId = servicePlanId;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (invoiceNumber) filter.invoiceNumber = invoiceNumber;

    const invoices = await BuilderInvoice.find(filter)
      .populate("userId")
      .populate("propertyId")
      .populate("servicePlanId")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      invoices,
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
      ...body
    } = req.body || {};
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
      paidAmount:
        toNumberOrUndefined(req.body.paidAmount) ??
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
