import { Response } from "express";
import { Types } from "mongoose";
import crypto from "crypto";
import User from "../../../user-service/src/models/userModel";
import FeaturedProject from "../../../user-service/src/models/featurePropertiesModel";
import { BuilderPlan } from "../models/builderPlanModel";
import { BuilderInvoice, INVOICE_PAYMENT_METHODS } from "../models/builderInvoiceModel";
import { BuilderProforma, PROFORMA_STATUSES } from "../models/builderProformaModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import { generateProformaPdf } from "../utils/generateProformaPdf";
import { uploadFileToS3 } from "../utils/uploadFileToS3";
import {
  buildBuilderDetails,
  buildPlanSnapshot,
  describePlanPackage,
  resolveInvoiceDependencies,
  resolveRenewalWindow,
} from "./builderInvoice";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 10;
const DEFAULT_SAC = "998362";

type UploadedFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

const text = (value: unknown, max = 200) => {
  const out = String(value ?? "").trim();
  return out ? out.slice(0, max) : undefined;
};
const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
const round2 = (value: number) => Math.round(value * 100) / 100;
const dateOrUndefined = (value: unknown) => {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const validId = (value: unknown) => {
  const id = String(value ?? "").trim();
  return id && Types.ObjectId.isValid(id) ? id : null;
};
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const actorId = (req: AuthRequest) => (req.user?.id && Types.ObjectId.isValid(req.user.id) ? req.user.id : undefined);

function readItems(raw: unknown) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item: any) => ({
      productName: text(item?.productName, 200) || "",
      sacCode: text(item?.sacCode, 20) || DEFAULT_SAC,
      qty: Math.max(0, Math.trunc(num(item?.qty, 1))),
      days: Math.max(0, Math.trunc(num(item?.days, 0))),
      amount: round2(num(item?.amount, 0)),
    }))
    .filter((item) => item.productName);
}

function computeTotals(items: { amount: number }[], gstRateInput: unknown) {
  const gstRate = Math.min(100, num(gstRateInput, 18));
  const subtotalAmount = round2(items.reduce((sum, item) => sum + (item.amount || 0), 0));
  const gstAmount = round2((subtotalAmount * gstRate) / 100);
  return { gstRate, subtotalAmount, gstAmount, totalAmount: round2(subtotalAmount + gstAmount) };
}

async function nextProformaNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `PF-${stamp}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    if (!(await BuilderProforma.exists({ proformaNumber: candidate }))) return candidate;
  }
  return `PF-${stamp}-${Date.now().toString(36).toUpperCase()}`;
}

/** Fills client/project/plan fields from linked records without overwriting what the user typed. */
async function resolveLinks(body: any, existing?: any) {
  const userId = body.userId === null || body.userId === "" ? null : validId(body.userId) ?? (existing?.userId ? String(existing.userId) : null);
  const propertyId =
    body.propertyId === null || body.propertyId === "" ? null : validId(body.propertyId) ?? (existing?.propertyId ? String(existing.propertyId) : null);
  const servicePlanId =
    body.servicePlanId === null || body.servicePlanId === ""
      ? null
      : validId(body.servicePlanId) ?? (existing?.servicePlanId ? String(existing.servicePlanId) : null);

  const [user, project, plan]: any[] = await Promise.all([
    userId ? User.findById(userId).select("name companyName email phone userCode locality city state pincode address").lean() : null,
    propertyId ? FeaturedProject.findById(propertyId).select("title propertyCode createdBy").lean() : null,
    servicePlanId ? BuilderPlan.findById(servicePlanId).lean() : null,
  ]);

  if (userId && !user) return { error: "Selected builder not found" };
  if (propertyId && !project) return { error: "Selected project not found" };
  if (servicePlanId && !plan) return { error: "Selected plan not found" };
  if (user && project && String(project.createdBy) !== String(user._id)) {
    return { error: "Selected project does not belong to the selected builder" };
  }

  const prevClient = existing?.client ? (typeof existing.client.toObject === "function" ? existing.client.toObject() : existing.client) : {};
  const input = body.client || {};
  const fromUser = user ? buildBuilderDetails(user) : {};
  const pickClient = (key: string, max = 200) =>
    text(input[key], max) ?? (input[key] === "" ? undefined : prevClient[key] ?? (fromUser as any)[key]);
  const client = {
    name: pickClient("name", 120),
    companyName: pickClient("companyName", 160),
    email: pickClient("email", 160),
    phone: pickClient("phone", 30),
    userCode: pickClient("userCode", 40),
    address: pickClient("address", 400),
    locality: pickClient("locality", 120),
    city: pickClient("city", 120),
    state: pickClient("state", 120),
    pincode: pickClient("pincode", 12),
    gstin: pickClient("gstin", 20)?.toUpperCase(),
  };

  return {
    userId,
    propertyId,
    servicePlanId,
    client,
    projectName: text(body.projectName, 200) ?? (body.projectName === "" ? undefined : existing?.projectName ?? project?.title),
    projectCode: project?.propertyCode ?? existing?.projectCode,
    servicePlanName: plan?.title ?? (servicePlanId ? existing?.servicePlanName : undefined),
    plan,
  };
}

function planItem(plan: any) {
  const snapshot = buildPlanSnapshot(plan);
  return {
    productName: `${plan.title} - ${describePlanPackage(snapshot)} promotion`,
    sacCode: DEFAULT_SAC,
    qty: 1,
    days: snapshot.durationDays,
    amount: round2(Number(plan.finalPrice ?? plan.price) || 0),
  };
}

export async function listProformas(req: AuthRequest, res: Response) {
  try {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit) || 12)));
    const filter: Record<string, unknown> = {};
    const status = String(req.query.status || "").toLowerCase();
    if ((PROFORMA_STATUSES as readonly string[]).includes(status)) filter.status = status;
    const userId = validId(req.query.userId);
    if (userId) filter.userId = userId;
    const q = String(req.query.q || "").trim().slice(0, 80);
    if (q) {
      const pattern = new RegExp(escapeRegex(q), "i");
      filter.$or = ["proformaNumber", "client.name", "client.companyName", "client.phone", "client.email", "projectName", "servicePlanName"].map(
        (field) => ({ [field]: pattern }),
      );
    }

    const [total, proformas, counts] = await Promise.all([
      BuilderProforma.countDocuments(filter),
      BuilderProforma.find(filter)
        .populate("convertedInvoiceId", "invoiceNumber paymentStatus paidAmount totalAmount")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BuilderProforma.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$totalAmount" } } }]),
    ]);
    const pages = Math.max(1, Math.ceil(total / limit));
    return res.json({
      success: true,
      proformas,
      counts: Object.fromEntries(counts.map((row: any) => [row._id, { count: row.count, amount: row.amount }])),
      meta: { total, page, limit, pages, hasNextPage: page < pages, hasPreviousPage: page > 1 },
    });
  } catch (error) {
    console.error("[proforma] list failed", error);
    return res.status(500).json({ success: false, message: "Failed to load pro-forma invoices" });
  }
}

export async function getProforma(req: AuthRequest, res: Response) {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: "Invalid pro-forma id" });
  const proforma = await BuilderProforma.findById(id)
    .populate("convertedInvoiceId", "invoiceNumber paymentStatus paidAmount totalAmount")
    .lean();
  if (!proforma) return res.status(404).json({ success: false, message: "Pro-forma not found" });
  return res.json({ success: true, proforma });
}

export async function createProforma(req: AuthRequest, res: Response) {
  try {
    const body = req.body || {};
    const links = await resolveLinks(body);
    if ("error" in links) return res.status(400).json({ success: false, message: links.error });
    if (!links.client.name && !links.client.companyName) {
      return res.status(400).json({ success: false, message: "Enter the client / builder name" });
    }

    let items = readItems(body.items);
    if (!items.length && links.plan) items = [planItem(links.plan)];
    if (!items.length) return res.status(400).json({ success: false, message: "Add at least one product line" });
    if (items.length > MAX_ITEMS) return res.status(400).json({ success: false, message: `Up to ${MAX_ITEMS} product lines are allowed` });

    const proformaDate = dateOrUndefined(body.proformaDate) || new Date();
    const status = (PROFORMA_STATUSES as readonly string[]).includes(body.status) && body.status !== "converted" ? body.status : "draft";
    const proforma = await BuilderProforma.create({
      proformaNumber: await nextProformaNumber(),
      proformaDate,
      validUntil: dateOrUndefined(body.validUntil) || new Date(proformaDate.getTime() + 15 * DAY_MS),
      userId: links.userId,
      client: links.client,
      propertyId: links.propertyId,
      projectName: links.projectName,
      projectCode: links.projectCode,
      servicePlanId: links.servicePlanId,
      servicePlanName: links.servicePlanName,
      items,
      ...computeTotals(items, body.gstRate),
      notes: text(body.notes, 2000),
      status,
      createdBy: actorId(req),
      createdByName: req.user?.name,
    });
    return res.status(201).json({ success: true, message: `Pro-forma ${proforma.proformaNumber} created`, proforma });
  } catch (error: any) {
    console.error("[proforma] create failed", error);
    return res.status(400).json({ success: false, message: error?.message || "Could not create pro-forma" });
  }
}

export async function updateProforma(req: AuthRequest, res: Response) {
  try {
    const id = validId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid pro-forma id" });
    const proforma: any = await BuilderProforma.findById(id);
    if (!proforma) return res.status(404).json({ success: false, message: "Pro-forma not found" });
    const body = req.body || {};

    if (proforma.status === "converted") {
      if (body.notes !== undefined) proforma.notes = text(body.notes, 2000);
      await proforma.save();
      return res.json({ success: true, message: "Pro-forma already converted; only notes were updated", proforma });
    }

    const links = await resolveLinks(body, proforma);
    if ("error" in links) return res.status(400).json({ success: false, message: links.error });
    if (!links.client.name && !links.client.companyName) {
      return res.status(400).json({ success: false, message: "Enter the client / builder name" });
    }

    const items = body.items !== undefined ? readItems(body.items) : proforma.items.map((item: any) => item.toObject());
    if (!items.length) return res.status(400).json({ success: false, message: "Add at least one product line" });
    if (items.length > MAX_ITEMS) return res.status(400).json({ success: false, message: `Up to ${MAX_ITEMS} product lines are allowed` });

    Object.assign(proforma, {
      proformaDate: dateOrUndefined(body.proformaDate) || proforma.proformaDate,
      validUntil: body.validUntil === null ? null : dateOrUndefined(body.validUntil) || proforma.validUntil,
      userId: links.userId,
      client: links.client,
      propertyId: links.propertyId,
      projectName: links.projectName,
      projectCode: links.projectCode,
      servicePlanId: links.servicePlanId,
      servicePlanName: links.servicePlanName,
      items,
      ...computeTotals(items, body.gstRate ?? proforma.gstRate),
      notes: body.notes !== undefined ? text(body.notes, 2000) : proforma.notes,
      status: (PROFORMA_STATUSES as readonly string[]).includes(body.status) && body.status !== "converted" ? body.status : proforma.status,
      updatedBy: actorId(req),
    });
    await proforma.save();
    return res.json({ success: true, message: "Pro-forma updated", proforma });
  } catch (error: any) {
    console.error("[proforma] update failed", error);
    return res.status(400).json({ success: false, message: error?.message || "Could not update pro-forma" });
  }
}

export async function deleteProforma(req: AuthRequest, res: Response) {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: "Invalid pro-forma id" });
  const proforma: any = await BuilderProforma.findById(id);
  if (!proforma) return res.status(404).json({ success: false, message: "Pro-forma not found" });
  if (proforma.status === "converted") {
    return res.status(400).json({ success: false, message: "A converted pro-forma is linked to an invoice; cancel it instead" });
  }
  await proforma.deleteOne();
  return res.json({ success: true, message: "Pro-forma deleted" });
}

export async function getProformaPdf(req: AuthRequest, res: Response) {
  try {
    const id = validId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid pro-forma id" });
    const proforma: any = await BuilderProforma.findById(id).lean();
    if (!proforma) return res.status(404).json({ success: false, message: "Pro-forma not found" });

    const client = proforma.client || {};
    const pdf = await generateProformaPdf({
      proformaNumber: proforma.proformaNumber,
      proformaDate: proforma.proformaDate,
      validUntil: proforma.validUntil,
      clientName: client.name,
      companyName: client.companyName,
      projectName: proforma.projectName,
      clientAddress: [client.address, client.locality, client.city, client.state, client.pincode].filter(Boolean).join(", "),
      gstin: client.gstin,
      items: proforma.items || [],
      subtotalAmount: proforma.subtotalAmount || 0,
      gstRate: proforma.gstRate ?? 18,
      gstAmount: proforma.gstAmount || 0,
      totalAmount: proforma.totalAmount || 0,
      notes: proforma.notes,
    });
    const disposition = req.query.download === "true" ? "attachment" : "inline";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${proforma.proformaNumber}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    console.error("[proforma] PDF failed", error);
    return res.status(500).json({ success: false, message: "Failed to generate pro-forma PDF" });
  }
}

export async function uploadProformaAttachments(req: AuthRequest, res: Response) {
  try {
    const id = validId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid pro-forma id" });
    const proforma: any = await BuilderProforma.findById(id);
    if (!proforma) return res.status(404).json({ success: false, message: "Pro-forma not found" });

    const files = ((req as any).files || []) as UploadedFile[];
    if (!files.length) return res.status(400).json({ success: false, message: "Choose at least one file" });
    if (proforma.attachments.length + files.length > 30) {
      return res.status(400).json({ success: false, message: "A pro-forma can hold up to 30 documents" });
    }

    const label = text(req.body?.label, 120);
    const uploaded = await Promise.all(files.map((file) => uploadFileToS3(file, `builder-proformas/${id}`)));
    proforma.attachments.push(
      ...uploaded.map((file) => ({
        ...file,
        label,
        uploadedAt: new Date(),
        uploadedBy: actorId(req),
        uploadedByName: req.user?.name,
      })),
    );
    await proforma.save();
    return res.status(201).json({ success: true, message: `${uploaded.length} document(s) uploaded`, proforma });
  } catch (error: any) {
    console.error("[proforma] upload failed", error);
    return res.status(400).json({ success: false, message: error?.message || "Upload failed" });
  }
}

export async function deleteProformaAttachment(req: AuthRequest, res: Response) {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: "Invalid pro-forma id" });
  const proforma: any = await BuilderProforma.findById(id);
  if (!proforma) return res.status(404).json({ success: false, message: "Pro-forma not found" });
  const attachment = proforma.attachments.id(String(req.params.attachmentId || ""));
  if (!attachment) return res.status(404).json({ success: false, message: "Document not found" });
  attachment.deleteOne();
  await proforma.save();
  return res.json({ success: true, message: "Document removed", proforma });
}

/** Creates a pending Builder invoice from the pro-forma; payments are then recorded on the invoice. */
export async function convertProformaToInvoice(req: AuthRequest, res: Response) {
  try {
    const id = validId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid pro-forma id" });
    const proforma: any = await BuilderProforma.findById(id);
    if (!proforma) return res.status(404).json({ success: false, message: "Pro-forma not found" });
    if (proforma.status === "converted" && proforma.convertedInvoiceId) {
      return res.status(409).json({ success: false, message: "This pro-forma already has an invoice" });
    }
    if (proforma.status === "cancelled") {
      return res.status(400).json({ success: false, message: "Cancelled pro-forma cannot be converted" });
    }

    const body = req.body || {};
    const resolved = await resolveInvoiceDependencies({
      userId: validId(body.userId) ?? (proforma.userId ? String(proforma.userId) : ""),
      propertyId: validId(body.propertyId) ?? (proforma.propertyId ? String(proforma.propertyId) : ""),
      servicePlanId: validId(body.servicePlanId) ?? (proforma.servicePlanId ? String(proforma.servicePlanId) : ""),
    });
    if (!resolved.ok) {
      const hint = resolved.status === 400 ? " (choose the builder, project and plan to convert)" : "";
      return res.status(resolved.status).json({ success: false, message: `${resolved.message}${hint}` });
    }

    const itemDays = Math.max(0, ...proforma.items.map((item: any) => Number(item.days) || 0));
    const snapshot = buildPlanSnapshot(resolved.planDoc);
    if (itemDays > 0) snapshot.durationDays = itemDays;
    const requestedStart = dateOrUndefined(body.startDate) || new Date();
    const window = await resolveRenewalWindow({
      propertyId: String(resolved.propertyDoc._id),
      durationDays: snapshot.durationDays,
      requestedStart,
    });
    const method = (INVOICE_PAYMENT_METHODS as readonly string[]).includes(body.paymentMethod) ? body.paymentMethod : "other";

    const invoice = await BuilderInvoice.create({
      invoiceNumber: `BLD-INV-${Date.now()}`,
      invoiceDate: new Date(),
      userId: String(resolved.targetUser._id),
      builderDetails: buildBuilderDetails(resolved.targetUser),
      propertyId: String(resolved.propertyDoc._id),
      propertyTitle: resolved.propertyDoc.title,
      projectCode: (resolved.propertyDoc as any).propertyCode,
      servicePlanId: String(resolved.planDoc._id),
      servicePlanName: resolved.planDoc.title,
      serviceType: describePlanPackage(snapshot),
      planSnapshot: snapshot,
      deliveryMode: body.deliveryMode === "team" ? "team" : snapshot.startMode === "team" ? "team" : "auto",
      startDate: window.startDate,
      endDate: window.endDate,
      timePeriod: `${snapshot.durationDays} days`,
      renewalOf: window.renewalOf,
      promotionStatus: "waiting_payment",
      subtotalAmount: proforma.subtotalAmount,
      totalAmount: proforma.totalAmount,
      discountValue: 0,
      discountAmount: 0,
      gstRate: proforma.gstRate,
      gstAmount: proforma.gstAmount,
      paidAmount: 0,
      paymentMethod: method,
      paymentStatus: "pending",
      proformaId: proforma._id,
      proformaNumber: proforma.proformaNumber,
    });

    Object.assign(proforma, {
      status: "converted",
      convertedInvoiceId: invoice._id,
      convertedAt: new Date(),
      userId: resolved.targetUser._id,
      propertyId: resolved.propertyDoc._id,
      servicePlanId: resolved.planDoc._id,
      servicePlanName: resolved.planDoc.title,
      updatedBy: actorId(req),
    });
    await proforma.save();

    return res.status(201).json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} created from ${proforma.proformaNumber}`,
      invoice,
      proforma,
    });
  } catch (error: any) {
    console.error("[proforma] convert failed", error);
    return res.status(400).json({ success: false, message: error?.message || "Could not create invoice" });
  }
}
