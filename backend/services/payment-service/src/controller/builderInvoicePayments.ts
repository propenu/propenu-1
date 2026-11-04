import { Response } from "express";
import { Types } from "mongoose";
import { BuilderInvoice, CHEQUE_STATUSES, INVOICE_PAYMENT_METHODS } from "../models/builderInvoiceModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import { uploadFileToS3 } from "../utils/uploadFileToS3";

type UploadedFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

const text = (value: unknown, max = 200) => {
  const out = String(value ?? "").trim();
  return out ? out.slice(0, max) : undefined;
};
const dateOrUndefined = (value: unknown) => {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const pick = <T extends string>(value: unknown, allowed: readonly T[]) =>
  allowed.includes(String(value || "").toLowerCase() as T) ? (String(value).toLowerCase() as T) : undefined;

/** Multipart requests carry the entry as a JSON string in `payload`; JSON requests send it as the body. */
function readPayload(body: any) {
  if (typeof body?.payload === "string") {
    try {
      return JSON.parse(body.payload);
    } catch {
      return null;
    }
  }
  return body || {};
}

async function uploadProofs(req: AuthRequest, invoiceId: string) {
  const files = ((req as any).files || []) as UploadedFile[];
  const uploaded = await Promise.all(
    files.map((file) => uploadFileToS3(file, `builder-invoices/${invoiceId}/payments`)),
  );
  return uploaded.map((file) => ({
    ...file,
    uploadedAt: new Date(),
    uploadedBy: req.user?.id && Types.ObjectId.isValid(req.user.id) ? req.user.id : undefined,
    uploadedByName: req.user?.name,
  }));
}

/** A cheque/DD only counts once it has cleared; bounced or cancelled entries never count. */
export function paymentCounts(entry: any) {
  if (entry.method === "cheque") return entry.cheque?.status === "cleared";
  return true;
}

/** Recompute paidAmount, paymentStatus, latest method and the promotion gate from recorded payments. */
export function applyPaymentTotals(invoice: any) {
  const payments: any[] = invoice.payments || [];
  const counted = payments.filter(paymentCounts);
  const paid = Math.round(counted.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0) * 100) / 100;
  const total = Number(invoice.totalAmount) || 0;

  invoice.paidAmount = paid;
  invoice.paymentStatus = paid <= 0 ? "pending" : paid + 0.5 >= total ? "paid" : "partial";
  const latest = [...payments].sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0];
  if (latest?.method) invoice.paymentMethod = latest.method;

  const current = invoice.promotionStatus || "not_started";
  if (invoice.paymentStatus === "paid") {
    if (current === "waiting_payment") invoice.promotionStatus = "not_started";
  } else if (current !== "running" && current !== "scheduled" && current !== "ended" && current !== "cancelled") {
    invoice.promotionStatus = "waiting_payment";
  }
}

function buildEntry(input: any) {
  const method = pick(input.method, INVOICE_PAYMENT_METHODS);
  if (!method) return { error: "Choose a payment method" };
  const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
  if (!(amount > 0)) return { error: "Enter the amount received" };

  const entry: Record<string, any> = {
    method,
    amount,
    paidAt: dateOrUndefined(input.paidAt) || new Date(),
    receivedByName: text(input.receivedByName, 120),
    receiptNumber: text(input.receiptNumber, 60),
    payerName: text(input.payerName, 120),
    transactionId: text(input.transactionId, 120),
    note: text(input.note, 1000),
  };

  if (method === "cash" && !entry.receivedByName) {
    return { error: "Enter who received the cash" };
  }

  if (method === "cheque") {
    const cheque = input.cheque || {};
    const number = text(cheque.number, 30);
    const bankName = text(cheque.bankName, 120);
    if (!number || !bankName) return { error: "Cheque/DD number and bank name are required" };
    entry.cheque = {
      instrumentType: pick(cheque.instrumentType, ["cheque", "dd"] as const) || "cheque",
      number,
      date: dateOrUndefined(cheque.date),
      bankName,
      branch: text(cheque.branch, 120),
      ifsc: text(cheque.ifsc, 15)?.toUpperCase(),
      accountHolder: text(cheque.accountHolder, 120),
      status: pick(cheque.status, CHEQUE_STATUSES) || "received",
      statusNote: text(cheque.statusNote, 300),
      clearedAt: pick(cheque.status, CHEQUE_STATUSES) === "cleared" ? new Date() : undefined,
    };
  }

  if (method === "upi") {
    const upi = input.upi || {};
    if (!entry.transactionId) return { error: "Enter the UPI transaction / UTR number" };
    entry.upi = { upiId: text(upi.upiId, 120), app: text(upi.app, 60) };
  }

  if (method === "card") {
    const card = input.card || {};
    const last4 = text(card.last4, 4);
    if (last4 && !/^\d{4}$/.test(last4)) return { error: "Card last 4 digits must be exactly 4 numbers" };
    if (!entry.transactionId && !text(card.approvalCode, 40)) {
      return { error: "Enter the card transaction ID or approval code" };
    }
    entry.card = {
      cardType: pick(card.cardType, ["credit", "debit", "prepaid"] as const),
      network: text(card.network, 40),
      last4,
      cardHolder: text(card.cardHolder, 120),
      approvalCode: text(card.approvalCode, 40),
      terminalId: text(card.terminalId, 60),
    };
  }

  if (method === "netbanking") {
    const net = input.netbanking || {};
    if (!entry.transactionId) return { error: "Enter the bank reference / UTR number" };
    entry.netbanking = {
      transferMode: pick(net.transferMode, ["neft", "rtgs", "imps", "other"] as const),
      bankName: text(net.bankName, 120),
      accountLast4: text(net.accountLast4, 8),
    };
  }

  if (method === "razorpay" && !entry.transactionId) {
    return { error: "Enter the Razorpay payment ID" };
  }

  if (method === "other") {
    const other = input.other || {};
    const methodName = text(other.methodName, 80);
    if (!methodName) return { error: "Enter the payment method name" };
    entry.other = { methodName, reference: text(other.reference, 200) };
  }

  return { entry };
}

async function findInvoice(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return BuilderInvoice.findById(id);
}

export async function recordInvoicePayment(req: AuthRequest, res: Response) {
  try {
    const id = String(req.params.id || "");
    const invoice: any = await findInvoice(id);
    if (!invoice) return res.status(404).json({ success: false, message: "Builder invoice not found" });
    if (invoice.promotionStatus === "cancelled") {
      return res.status(400).json({ success: false, message: "This invoice is cancelled" });
    }

    const input = readPayload(req.body);
    if (!input) return res.status(400).json({ success: false, message: "Invalid payment details" });
    const built = buildEntry(input);
    if ("error" in built) return res.status(400).json({ success: false, message: built.error });

    const proofs = await uploadProofs(req, id);
    invoice.payments.push({
      ...built.entry,
      proofs,
      recordedBy: req.user?.id && Types.ObjectId.isValid(req.user.id) ? req.user.id : undefined,
      recordedByName: req.user?.name,
    });
    applyPaymentTotals(invoice);
    await invoice.save();

    return res.status(201).json({
      success: true,
      message: `Payment of Rs. ${built.entry.amount} recorded`,
      invoice,
    });
  } catch (error: any) {
    console.error("[builder-invoice] record payment failed", error);
    return res.status(400).json({ success: false, message: error?.message || "Could not record payment" });
  }
}

/** Update cheque status / note on a recorded payment and attach more proof files. */
export async function updateInvoicePayment(req: AuthRequest, res: Response) {
  try {
    const id = String(req.params.id || "");
    const invoice: any = await findInvoice(id);
    if (!invoice) return res.status(404).json({ success: false, message: "Builder invoice not found" });
    const entry = invoice.payments.id(String(req.params.paymentId || ""));
    if (!entry) return res.status(404).json({ success: false, message: "Payment entry not found" });

    const input = readPayload(req.body);
    if (!input) return res.status(400).json({ success: false, message: "Invalid payment details" });

    if (input.cheque && entry.method === "cheque") {
      const status = pick(input.cheque.status, CHEQUE_STATUSES);
      if (status) {
        entry.cheque.status = status;
        entry.cheque.clearedAt = status === "cleared" ? new Date() : undefined;
      }
      if (input.cheque.statusNote !== undefined) entry.cheque.statusNote = text(input.cheque.statusNote, 300);
    }
    if (input.note !== undefined) entry.note = text(input.note, 1000);
    if (input.receivedByName !== undefined) entry.receivedByName = text(input.receivedByName, 120);

    const proofs = await uploadProofs(req, id);
    if (proofs.length) entry.proofs.push(...proofs);

    applyPaymentTotals(invoice);
    await invoice.save();
    return res.json({ success: true, message: "Payment updated", invoice });
  } catch (error: any) {
    console.error("[builder-invoice] update payment failed", error);
    return res.status(400).json({ success: false, message: error?.message || "Could not update payment" });
  }
}

export async function deleteInvoicePayment(req: AuthRequest, res: Response) {
  try {
    const invoice: any = await findInvoice(String(req.params.id || ""));
    if (!invoice) return res.status(404).json({ success: false, message: "Builder invoice not found" });
    const entry = invoice.payments.id(String(req.params.paymentId || ""));
    if (!entry) return res.status(404).json({ success: false, message: "Payment entry not found" });

    entry.deleteOne();
    applyPaymentTotals(invoice);
    await invoice.save();
    return res.json({ success: true, message: "Payment removed", invoice });
  } catch (error: any) {
    console.error("[builder-invoice] delete payment failed", error);
    return res.status(400).json({ success: false, message: error?.message || "Could not remove payment" });
  }
}
