import axios from "axios";
import mongoose from "mongoose";
import {
  WhatsAppConversation,
  WhatsAppMessage,
} from "./whatsappInbox.model";
import { whatsappInboxBus } from "./whatsappInbox.events";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

function getCredentials() {
  const token = process.env.WHATSAPP_TOKEN || "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
  const appId = process.env.WHATSAPP_APP_ID || "";
  return { token, phoneNumberId, businessAccountId, appId };
}

export function normalizeWaId(phone: string) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  // India local 10-digit → add country code
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = `91${digits.slice(1)}`;
  }
  return digits;
}

/** Meta delivery ladder — never let a late "delivered" overwrite "read". */
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

export function shouldApplyStatus(current?: string, next?: string) {
  const cur = String(current || "pending").toLowerCase();
  const nxt = String(next || "").toLowerCase();
  if (!nxt) return false;
  if (cur === "failed") return nxt === "failed";
  if (nxt === "failed") return true;
  return (STATUS_RANK[nxt] ?? -1) >= (STATUS_RANK[cur] ?? -1);
}

/** Pull Meta Cloud API message id from Graph send response / log.response. */
export function extractMetaMessageId(response: unknown): string {
  const r = response as any;
  const id =
    r?.messages?.[0]?.id ||
    r?.data?.messages?.[0]?.id ||
    r?.response?.messages?.[0]?.id ||
    "";
  return String(id || "").trim();
}

function previewFromBody(body: string, max = 80) {
  const text = String(body || "").trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function extractInboundText(message: any): { type: string; body: string } {
  const type = String(message?.type || "text");
  if (type === "text") {
    return { type, body: String(message?.text?.body || "") };
  }
  if (type === "button") {
    return {
      type,
      body: String(message?.button?.text || message?.button?.payload || "[Button]"),
    };
  }
  if (type === "interactive") {
    const title =
      message?.interactive?.button_reply?.title ||
      message?.interactive?.list_reply?.title ||
      "";
    return { type, body: String(title || "[Interactive]") };
  }
  if (type === "image") {
    return {
      type,
      body: String(message?.image?.caption || "[Image]"),
    };
  }
  if (type === "document") {
    return {
      type,
      body: String(message?.document?.filename || "[Document]"),
    };
  }
  if (type === "audio") return { type, body: "[Audio]" };
  if (type === "video") {
    return {
      type,
      body: String(message?.video?.caption || "[Video]"),
    };
  }
  if (type === "location") {
    const lat = message?.location?.latitude;
    const lng = message?.location?.longitude;
    return { type, body: lat && lng ? `📍 ${lat}, ${lng}` : "[Location]" };
  }
  if (type === "contacts") {
    const name =
      message?.contacts?.[0]?.name?.formatted_name ||
      message?.contacts?.[0]?.name?.first_name ||
      "";
    return { type, body: name ? `Contact: ${name}` : "[Contact]" };
  }
  if (type === "sticker") return { type, body: "[Sticker]" };
  if (type === "reaction") {
    const emoji = message?.reaction?.emoji || "";
    return { type, body: emoji ? `Reacted ${emoji}` : "[Reaction]" };
  }
  if (type === "order") return { type, body: "[Order]" };
  return { type, body: `[${type}]` };
}

async function upsertConversation(params: {
  waId: string;
  profileName?: string;
  preview: string;
  direction: "inbound" | "outbound";
  bumpUnread?: boolean;
}) {
  const { waId, profileName, preview, direction, bumpUnread } = params;
  const update: Record<string, unknown> = {
    lastMessageAt: new Date(),
    lastMessagePreview: preview,
    lastDirection: direction,
  };
  if (profileName) update.profileName = profileName;

  return WhatsAppConversation.findOneAndUpdate(
    { waId },
    {
      $set: update,
      $setOnInsert: { waId },
      ...(bumpUnread ? { $inc: { unreadCount: 1 } } : {}),
    },
    { upsert: true, new: true },
  );
}

/** Persist inbound / echo / status webhooks from Meta Cloud API. */
export async function processWhatsAppWebhookPayload(body: any) {
  if (!body || body.object !== "whatsapp_business_account") {
    // Still accept payloads without object for local tests
  }

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  let saved = 0;
  let inboundSaved = 0;
  let inboundReceived = 0;
  let statusUpdates = 0;

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value) continue;

      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const nameByWaId = new Map<string, string>();
      for (const contact of contacts) {
        const waId = normalizeWaId(contact?.wa_id || contact?.waId || "");
        const name = String(contact?.profile?.name || "").trim();
        if (waId && name) nameByWaId.set(waId, name);
      }

      // Customer → business
      const messages = Array.isArray(value.messages) ? value.messages : [];
      inboundReceived += messages.length;
      for (const message of messages) {
        const fromWaId = normalizeWaId(message?.from);
        const profileName = nameByWaId.get(fromWaId);
        const created = await persistCloudMessage({
          message,
          direction: "inbound",
          waId: fromWaId,
          ...(profileName ? { profileName } : {}),
          bumpUnread: true,
        });
        if (created) {
          saved += 1;
          inboundSaved += 1;
          const inboundText = extractInboundText(message).body;
          void replyToInboundMessage(fromWaId, inboundText);
        }
      }

      // Business → customer echoes (sent from WhatsApp Business app / API elsewhere)
      const echoes = [
        ...(Array.isArray(value.message_echoes) ? value.message_echoes : []),
        ...(Array.isArray(value.smb_message_echoes)
          ? value.smb_message_echoes
          : []),
      ];
      for (const echo of echoes) {
        const created = await persistCloudMessage({
          message: echo,
          direction: "outbound",
          waId: normalizeWaId(echo?.to),
          bumpUnread: false,
        });
        if (created) saved += 1;
      }

      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const statusItem of statuses) {
        const wamid = String(statusItem?.id || "");
        const status = String(statusItem?.status || "").toLowerCase();
        const recipientId = normalizeWaId(statusItem?.recipient_id || "");
        if (!wamid || !status) continue;
        if (!["sent", "delivered", "read", "failed"].includes(status)) continue;

        // Match by Meta wamid, or campaign rows that stored Graph id only in raw.response
        let existing = await WhatsAppMessage.findOne({ wamid }).lean();
        if (!existing) {
          existing = await WhatsAppMessage.findOne({
            $or: [
              { "raw.response.messages.0.id": wamid },
              { "raw.response.data.messages.0.id": wamid },
              { "raw.messages.0.id": wamid },
            ],
          }).lean();
        }
        if (!existing) continue;
        if (!shouldApplyStatus(existing.status, status)) continue;

        const updated = await WhatsAppMessage.findOneAndUpdate(
          { _id: existing._id },
          {
            $set: {
              status,
              // Promote log:* placeholders to real Meta id so future statuses match
              ...(existing.wamid !== wamid ? { wamid } : {}),
              ...(status === "failed"
                ? {
                    error:
                      statusItem?.errors?.[0]?.title ||
                      statusItem?.errors?.[0]?.message ||
                      "Failed",
                  }
                : {}),
            },
          },
          { new: true },
        );

        if (!updated) continue;
        statusUpdates += 1;
        const statusWaId = recipientId || updated?.waId;
        whatsappInboxBus.publish({
          type: "status",
          ...(statusWaId ? { waId: statusWaId } : {}),
          wamid: updated.wamid || wamid,
          status,
        });
      }
    }
  }

  const flowForwarded =
    inboundReceived > 0 ? await forwardToConversationFlow(body) : false;

  return {
    saved,
    inboundSaved,
    inboundReceived,
    statusUpdates,
    flowForwarded,
  };
}

/**
 * Meta supports one webhook callback per app. Relay new inbound events to the
 * external flow engine so it can resolve list row IDs and execute next nodes.
 */
async function forwardToConversationFlow(body: any) {
  const forwardUrl = String(
    process.env.WHATSAPP_FLOW_FORWARD_URL || "",
  ).trim();
  // No external flow engine: the inbox is the destination, so accept the webhook.
  if (!forwardUrl) return true;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(forwardUrl);
  } catch {
    console.error("WHATSAPP_FLOW_FORWARD_URL is not a valid URL");
    return false;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    console.error("WHATSAPP_FLOW_FORWARD_URL must use http or https");
    return false;
  }

  try {
    await axios.post(parsedUrl.toString(), body, {
      headers: { "Content-Type": "application/json" },
      timeout: 10_000,
    });
    return true;
  } catch (error: any) {
    console.error(
      "WhatsApp flow webhook forwarding failed:",
      error?.response?.data?.message || error?.message || error,
    );
    return false;
  }
}

async function persistCloudMessage(params: {
  message: any;
  direction: "inbound" | "outbound";
  waId: string;
  profileName?: string;
  bumpUnread?: boolean;
}) {
  const { message, direction, waId, profileName, bumpUnread } = params;
  if (!waId) return null;

  const wamid = String(message?.id || "");
  if (wamid) {
    const existing = await WhatsAppMessage.findOne({ wamid }).lean();
    if (existing) return null;
  }

  const { type, body: text } = extractInboundText(message);
  const tsSec = Number(message?.timestamp);
  const at =
    Number.isFinite(tsSec) && tsSec > 0 ? new Date(tsSec * 1000) : new Date();

  const conversation = await upsertConversation({
    waId,
    ...(profileName ? { profileName } : {}),
    preview: previewFromBody(text),
    direction,
    bumpUnread: Boolean(bumpUnread),
  });

  // Keep lastMessageAt aligned with Meta event time when newer
  if (
    !conversation.lastMessageAt ||
    new Date(conversation.lastMessageAt).getTime() < at.getTime()
  ) {
    await WhatsAppConversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          lastMessageAt: at,
          lastMessagePreview: previewFromBody(text),
          lastDirection: direction,
        },
      },
    );
  }

  await WhatsAppConversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        origin: "cloud",
        ...(direction === "inbound" && conversation.inboxStatus !== "waiting"
          ? { inboxStatus: "new" }
          : {}),
      },
    },
  );

  const created = await WhatsAppMessage.create({
    conversationId: conversation._id,
    waId,
    direction,
    type,
    body: text,
    wamid: wamid || undefined,
    status: direction === "inbound" ? "delivered" : "sent",
    raw: { ...message, source: "whatsapp_cloud_webhook" },
    createdAt: at,
    updatedAt: at,
  });

  whatsappInboxBus.publish({
    type: "message",
    waId,
    conversationId: String(conversation._id),
    messageId: String(created._id),
    direction,
  });

  return created;
}

const REGISTRATION_GREETING =
  /^(hi+|hello+|hey+|hai|helo|namaste|namaskar|good morning|good evening|good afternoon)(\s+\S+){0,3}$/;

/** "hi" / "hello" from a new chat. Longer questions are left to the normal inbox. */
export function isWhatsAppGreeting(text: string) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.length > 40) return false;
  return REGISTRATION_GREETING.test(normalized);
}

export function buildRegistrationPrompt(frontendBase?: string) {
  const base = String(frontendBase || process.env.FRONTEND_URL || "https://propenu.com")
    .trim()
    .replace(/\/$/, "");
  const link = `${base}/?auth=register&redirect=%2F`;
  return `Your Propenu registration is incomplete. Please finish your account here:\n${link}`;
}

function phoneLookupValues(waId: string) {
  const digits = String(waId || "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  if (!/^\d{10}$/.test(last10)) return [];
  return [...new Set([last10, `91${last10}`, `+91${last10}`, digits, `+${digits}`])];
}

async function findUserByWhatsAppPhone(waId: string) {
  const phones = phoneLookupValues(waId);
  if (!phones.length) return null;
  const last10 = phones[0];
  return mongoose.connection.collection("users").findOne(
    {
      $or: [
        { phone: { $in: phones } },
        { phone: { $regex: `${last10}$` } },
      ],
    },
    { projection: { phoneVerified: 1 } },
  );
}

async function replyToInboundMessage(waId: string, text: string) {
  try {
    const sentRegistration = await maybeSendIncompleteRegistrationReply(waId, text);
    if (!sentRegistration) {
      await maybeSendWelcomeAutoReply(waId);
    }
  } catch (err) {
    console.error("WhatsApp inbound auto-reply failed:", err);
  }
}

/**
 * New or unfinished account says hi: session text with the register link.
 * A phoneVerified account is left alone. Not a Meta template.
 */
async function maybeSendIncompleteRegistrationReply(waId: string, text: string) {
  if (!waId || !isWhatsAppGreeting(text)) return false;
  if (mongoose.connection.readyState !== 1) {
    console.error("WhatsApp registration prompt skipped: database is not connected");
    return false;
  }

  const user = await findUserByWhatsAppPhone(waId);
  if (user?.phoneVerified === true) return false;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alreadySent = await WhatsAppMessage.exists({
    waId,
    direction: "outbound",
    "raw.source": "registration_prompt",
    createdAt: { $gte: dayAgo },
  });
  if (alreadySent) return true;

  const body = buildRegistrationPrompt();
  await sendInboxTextMessage(waId, body, {
    source: "registration_prompt",
    sessionTextOnly: true,
  });
  console.log(
    `WhatsApp registration prompt sent to ******${String(waId).slice(-4)}`,
  );
  return true;
}

/** Optional first-reply bot (Bizrow-style welcome) using Cloud API token. */
async function maybeSendWelcomeAutoReply(waId: string) {
  const enabled = String(process.env.WHATSAPP_AUTO_REPLY_ENABLED || "")
    .toLowerCase()
    .trim();
  if (!(enabled === "1" || enabled === "true" || enabled === "yes")) {
    return;
  }

  const welcome =
    String(process.env.WHATSAPP_WELCOME_MESSAGE || "").trim() ||
    "Hi , welcome to propenu what do you want to do ? Options: User, Builder, view propties";

  const priorOutbound = await WhatsAppMessage.exists({
    waId,
    direction: "outbound",
    type: { $in: ["text", "interactive", "button"] },
    wamid: { $not: { $regex: /^log:/ } },
  });
  if (priorOutbound) return;

  try {
    await sendInboxTextMessage(waId, welcome, { source: "auto_reply" });
  } catch (err) {
    console.error("WhatsApp auto-reply failed:", err);
  }
}

/**
 * Hide conversations that only contain campaign WhatsAppLog imports
 * (so the inbox can optionally filter to Cloud API / webhook traffic only).
 */
export async function retagCampaignOnlyConversations() {
  const logWaIds = await WhatsAppMessage.distinct("waId", {
    wamid: { $regex: /^log:/ },
  });
  if (!logWaIds.length) return 0;

  let retagged = 0;
  for (const waId of logWaIds) {
    const hasLive = await WhatsAppMessage.exists({
      waId,
      $and: [
        { wamid: { $exists: true, $nin: [null, ""] } },
        { wamid: { $not: { $regex: /^log:/ } } },
      ],
    });
    if (hasLive) continue;

    const result = await WhatsAppConversation.updateOne(
      { waId, origin: { $ne: "campaign_log" } },
      { $set: { origin: "campaign_log" } },
    );
    if (result.modifiedCount) retagged += 1;
  }
  return retagged;
}

export async function listConversations(params?: {
  q?: string;
  limit?: number;
  /** include campaign WhatsAppLog backfill (default true so inbox is not empty) */
  includeCampaignLogs?: boolean;
  /** When set, only conversations assigned to this staff user id */
  assignedAgentId?: string;
  /** Staff mode: only chats assigned to them (ignore unassigned) */
  onlyAssignedTo?: string;
}) {
  const limit = Math.min(Math.max(Number(params?.limit) || 50, 1), 200);
  const q = String(params?.q || "").trim();
  const filter: Record<string, unknown> = {};

  // Default: show all chats. Only exclude campaign logs when explicitly asked.
  if (params?.includeCampaignLogs === false) {
    filter.origin = { $ne: "campaign_log" };
  }

  const onlyAssignedTo = String(params?.onlyAssignedTo || "").trim();
  const assignedAgentId = String(params?.assignedAgentId || "").trim();
  if (onlyAssignedTo) {
    filter.assignedAgentId = onlyAssignedTo;
  } else if (assignedAgentId) {
    filter.assignedAgentId = assignedAgentId;
  }

  if (q) {
    const digits = q.replace(/\D/g, "");
    const textOr: Record<string, unknown>[] = [
      ...(digits ? [{ waId: { $regex: digits, $options: "i" } }] : []),
      { profileName: { $regex: q, $options: "i" } },
      { lastMessagePreview: { $regex: q, $options: "i" } },
      { assignedAgentName: { $regex: q, $options: "i" } },
    ];
    const andParts: Record<string, unknown>[] = [];
    if (filter.origin) andParts.push({ origin: filter.origin });
    if (filter.assignedAgentId) {
      andParts.push({ assignedAgentId: filter.assignedAgentId });
    }
    andParts.push({ $or: textOr });
    filter.$and = andParts;
    delete filter.origin;
    delete filter.assignedAgentId;
  }

  return WhatsAppConversation.aggregate([
    { $match: filter },
    {
      $addFields: {
        _rank: {
          $cond: [{ $eq: ["$origin", "cloud"] }, 0, 1],
        },
      },
    },
    { $sort: { _rank: 1, lastMessageAt: -1 } },
    { $limit: limit },
    { $project: { _rank: 0 } },
  ]);
}

/**
 * Backfill inbox chats from campaign WhatsAppLog rows
 * (template sends that existed before inbox was added).
 */
export async function syncInboxFromWhatsAppLogs() {
  const db = mongoose.connection?.db;
  if (!db) {
    throw new Error("Database is not connected");
  }

  const logs = await db
    .collection("whatsapplogs")
    .find({})
    .sort({ createdAt: 1 })
    .toArray();

  let conversationsTouched = 0;
  let messagesCreated = 0;

  for (const log of logs as any[]) {
    const waId = normalizeWaId(log.to);
    if (!waId) continue;

    const sourceId = `log:${String(log._id)}`;
    const metaWamid = extractMetaMessageId(log.response);
    const already = await WhatsAppMessage.findOne({
      $or: [
        { wamid: sourceId },
        ...(metaWamid ? [{ wamid: metaWamid }] : []),
      ],
    })
      .select("_id")
      .lean();
    if (already) continue;

    const status =
      log.status === "success"
        ? "sent"
        : log.status === "failed"
          ? "failed"
          : "pending";
    const body = `Template: ${log.templateName || "message"}`;
    const at = log.createdAt ? new Date(log.createdAt) : new Date();

    let conversation = await WhatsAppConversation.findOne({ waId });
    if (!conversation) {
      conversation = await WhatsAppConversation.create({
        waId,
        profileName: "",
        lastMessageAt: at,
        lastMessagePreview: previewFromBody(body),
        lastDirection: "outbound",
        unreadCount: 0,
        inboxStatus: "new",
        assignedAgentId: "",
        assignedAgentName: "",
        assignedAgentRole: "",
        origin: "campaign_log",
      });
      conversationsTouched += 1;
    } else {
      const hasLive = await WhatsAppMessage.exists({
        waId,
        $and: [
          { wamid: { $exists: true, $nin: [null, ""] } },
          { wamid: { $not: { $regex: /^log:/ } } },
        ],
      });
      if (!hasLive) {
        conversation.origin = "campaign_log";
      }
      if (
        !conversation.lastMessageAt ||
        new Date(conversation.lastMessageAt).getTime() <= at.getTime()
      ) {
        conversation.lastMessageAt = at;
        conversation.lastMessagePreview = previewFromBody(body);
        conversation.lastDirection = "outbound";
        conversationsTouched += 1;
      }
      await conversation.save();
    }

    await WhatsAppMessage.create({
      conversationId: conversation._id,
      waId,
      direction: "outbound",
      type: "template",
      body,
      wamid: metaWamid || sourceId,
      status,
      error: typeof log.error === "string" ? log.error : undefined,
      raw: { fromLog: true, logId: String(log._id), response: log.response },
      createdAt: at,
      updatedAt: at,
    });
    messagesCreated += 1;
  }

  return { conversationsTouched, messagesCreated, logsScanned: logs.length };
}

/** Record an outbound template send into the inbox (used by campaign worker). */
export async function recordOutboundTemplateMessage(params: {
  to: string;
  templateName: string;
  status?: "sent" | "failed" | "pending";
  logId?: string;
  response?: unknown;
  error?: string;
  at?: Date;
}) {
  const waId = normalizeWaId(params.to);
  if (!waId) return null;

  const metaWamid = extractMetaMessageId(params.response);
  const logSourceId = params.logId ? `log:${params.logId}` : undefined;
  // Prefer Meta message id so delivery/read webhooks can update ticks
  const wamid = metaWamid || logSourceId;

  if (metaWamid) {
    const byMeta = await WhatsAppMessage.findOne({ wamid: metaWamid }).lean();
    if (byMeta) return byMeta;
  }
  if (logSourceId) {
    const byLog = await WhatsAppMessage.findOne({ wamid: logSourceId }).lean();
    if (byLog) {
      // Upgrade older campaign rows to Meta wamid when we learn it
      if (metaWamid && byLog.wamid !== metaWamid) {
        await WhatsAppMessage.updateOne(
          { _id: byLog._id },
          {
            $set: {
              wamid: metaWamid,
              status: params.status || byLog.status || "sent",
              "raw.response": params.response,
            },
          },
        );
      }
      return byLog;
    }
  }

  const body = `Template: ${params.templateName || "message"}`;
  const at = params.at || new Date();
  const conversation = await upsertConversation({
    waId,
    preview: previewFromBody(body),
    direction: "outbound",
  });

  await WhatsAppConversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessageAt: at,
        lastMessagePreview: previewFromBody(body),
        lastDirection: "outbound",
      },
    },
  );

  return WhatsAppMessage.create({
    conversationId: conversation._id,
    waId,
    direction: "outbound",
    type: "template",
    body,
    wamid,
    status: params.status || "sent",
    error: params.error,
    raw: {
      fromCampaign: true,
      logId: params.logId ? String(params.logId) : undefined,
      response: params.response,
    },
    createdAt: at,
    updatedAt: at,
  });
}

export async function getConversationMessages(
  waIdRaw: string,
  params?: { limit?: number; before?: string },
) {
  const waId = normalizeWaId(waIdRaw);
  if (!waId) throw new Error("Invalid WhatsApp id");

  const conversation = await WhatsAppConversation.findOne({ waId }).lean();
  if (!conversation) {
    return { conversation: null, messages: [] };
  }

  const limit = Math.min(Math.max(Number(params?.limit) || 100, 1), 300);
  const query: Record<string, unknown> = { conversationId: conversation._id };
  if (params?.before) {
    query.createdAt = { $lt: new Date(params.before) };
  }

  const messages = await WhatsAppMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return {
    conversation,
    messages: messages.reverse(),
  };
}

export async function markConversationRead(waIdRaw: string) {
  const waId = normalizeWaId(waIdRaw);
  if (!waId) throw new Error("Invalid WhatsApp id");

  const conversation = await WhatsAppConversation.findOneAndUpdate(
    { waId },
    { $set: { unreadCount: 0 } },
    { new: true },
  ).lean();

  // Industry-standard: tell Meta the agent opened the chat → customer sees blue ticks
  // on their last inbound message (best-effort; never block inbox open).
  try {
    const { token, phoneNumberId } = getCredentials();
    if (token && phoneNumberId) {
      const lastInbound = await WhatsAppMessage.findOne({
        waId,
        direction: "inbound",
        wamid: { $exists: true, $nin: [null, ""] },
      })
        .sort({ createdAt: -1 })
        .select("wamid")
        .lean();
      const messageId = String(lastInbound?.wamid || "");
      if (messageId && !messageId.startsWith("log:")) {
        await axios.post(
          `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
          {
            messaging_product: "whatsapp",
            status: "read",
            message_id: messageId,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            timeout: 8000,
          },
        );
      }
    }
  } catch {
    // ignore Meta mark-read failures
  }

  return conversation;
}

/** Send a free-form text reply via Cloud API and store it.
 * Free-form text only works within 24h of the customer's last inbound message.
 * Outside that window Meta returns "Re-engagement message" — we then send an
 * approved 1-variable template (WHATSAPP_INBOX_REPLY_TEMPLATE) with the reply text.
 */
export async function sendInboxTextMessage(
  waIdRaw: string,
  textRaw: string,
  opts?: { source?: string; sessionTextOnly?: boolean },
) {
  const waId = normalizeWaId(waIdRaw);
  const text = String(textRaw || "").trim();
  if (!waId) throw new Error("Recipient phone is required");
  if (!text) throw new Error("Message text is required");

  const { token, phoneNumberId } = getCredentials();
  if (!token || !phoneNumberId) {
    throw new Error(
      "WhatsApp credentials are missing (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)",
    );
  }

  const source = opts?.source || "dashboard_cloud_api";
  const primaryTemplate = String(
    process.env.WHATSAPP_INBOX_REPLY_TEMPLATE || "inbox_agent_reply",
  ).trim();
  const fallbackTemplate = String(
    process.env.WHATSAPP_INBOX_REPLY_TEMPLATE_FALLBACK || "test_welcome",
  ).trim();
  const templateCandidates = [
    ...new Set([primaryTemplate, fallbackTemplate].filter(Boolean)),
  ];
  const templateLang = String(
    process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
  ).trim() || "en";

  const lastInbound = await WhatsAppMessage.findOne({
    waId,
    direction: "inbound",
  })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean();
  const lastInboundAt = lastInbound?.createdAt
    ? new Date(lastInbound.createdAt)
    : null;
  const withinCareWindow =
    !!lastInboundAt &&
    Date.now() - lastInboundAt.getTime() <= 24 * 60 * 60 * 1000;

  const conversation = await upsertConversation({
    waId,
    preview: previewFromBody(text),
    direction: "outbound",
  });

  if (!String((conversation as any)?.profileName || "").trim()) {
    await WhatsAppConversation.updateOne(
      { _id: conversation._id, profileName: { $in: ["", null] } },
      { $set: { profileName: waId } },
    );
  }

  await WhatsAppConversation.updateOne(
    { _id: conversation._id },
    { $set: { origin: "cloud" } },
  );

  const pending = await WhatsAppMessage.create({
    conversationId: conversation._id,
    waId,
    direction: "outbound",
    type: withinCareWindow ? "text" : "template",
    body: text,
    status: "pending",
    raw: {
      source,
      withinCareWindow,
      lastInboundAt: lastInboundAt?.toISOString() || null,
    },
  });

  const url = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const sendFreeText = async () =>
    axios.post(
      url,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: waId,
        type: "text",
        text: { preview_url: false, body: text },
      },
      { headers },
    );

  const sendTemplateReply = async (templateName: string) =>
    axios.post(
      url,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: waId,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLang },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: text.slice(0, 1024) }],
            },
          ],
        },
      },
      { headers },
    );

  const isSessionWindowError = (err: any) => {
    const code = Number(err?.response?.data?.error?.code || 0);
    const msg = String(
      err?.response?.data?.error?.message ||
        err?.response?.data?.error?.error_user_title ||
        err?.response?.data?.error?.error_data?.details ||
        err?.message ||
        "",
    ).toLowerCase();
    return (
      code === 131047 ||
      code === 131026 ||
      msg.includes("24 hour") ||
      msg.includes("24-hour") ||
      msg.includes("re-engagement") ||
      (msg.includes("outside") && msg.includes("window"))
    );
  };

  const tryTemplates = async () => {
    let lastErr: any;
    for (const name of templateCandidates) {
      try {
        const response = await sendTemplateReply(name);
        return { response, templateName: name };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("No WhatsApp reply template could be sent");
  };

  try {
    let response: any;
    let sendMode: "text" | "template" = "text";
    let usedTemplate = "";

    if (withinCareWindow) {
      try {
        response = await sendFreeText();
      } catch (firstErr: any) {
        // Session can expire even if we thought we were inside the window.
        if (isSessionWindowError(firstErr) && !opts?.sessionTextOnly) {
          sendMode = "template";
          const out = await tryTemplates();
          response = out.response;
          usedTemplate = out.templateName;
        } else {
          throw firstErr;
        }
      }
    } else if (opts?.sessionTextOnly) {
      throw new Error(
        "Registration reply is session text only and the 24-hour window is closed",
      );
    } else {
      // Outside 24h / no inbound → must use template (re-engagement).
      sendMode = "template";
      const out = await tryTemplates();
      response = out.response;
      usedTemplate = out.templateName;
    }

    const wamid = response.data?.messages?.[0]?.id;
    pending.wamid = wamid;
    pending.status = "sent";
    pending.type = sendMode === "template" ? "template" : "text";
    pending.raw = {
      ...response.data,
      source,
      sendMode,
      withinCareWindow,
      lastInboundAt: lastInboundAt?.toISOString() || null,
      ...(sendMode === "template" ? { template: usedTemplate } : {}),
    };
    await pending.save();

    whatsappInboxBus.publish({
      type: "message",
      waId,
      conversationId: String(conversation._id),
      messageId: String(pending._id),
      direction: "outbound",
    });

    return pending.toObject();
  } catch (err: any) {
    const apiError =
      err?.response?.data?.error?.message ||
      err?.response?.data?.error?.error_user_title ||
      err?.message ||
      "Failed to send WhatsApp message";
    const code = err?.response?.data?.error?.code;
    const sessionHint =
      isSessionWindowError(err) && !opts?.sessionTextOnly
        ? ` Free-form text is blocked outside the 24h window (Re-engagement). Tried template(s): ${templateCandidates.join(", ")}. Approve template "inbox_agent_reply" in Meta or set WHATSAPP_INBOX_REPLY_TEMPLATE.`
        : "";

    pending.status = "failed";
    pending.error = `${apiError}${sessionHint}`;
    pending.raw = {
      ...(err?.response?.data || { message: apiError }),
      source,
      withinCareWindow,
      lastInboundAt: lastInboundAt?.toISOString() || null,
      errorCode: code || null,
      templatesTried: templateCandidates,
    };
    await pending.save();
    throw new Error(pending.error);
  }
}

/** Normalize webhook URLs for equality checks (trim, strip trailing slash). */
function normalizeWebhookUrl(url: string) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

/** Env-based expected Meta callback for this deployment. */
export function resolveExpectedWhatsAppWebhookUrl() {
  const slug = process.env.WHATSAPP_WEBHOOK_SLUG || "tyent";
  const webhookPath = `/api/conversation-flow/webhook/${slug}`;
  const configuredCallback = String(
    process.env.WHATSAPP_WEBHOOK_CALLBACK_URL || "",
  )
    .trim()
    .replace(/\/+$/, "");
  const publicBase = String(process.env.WHATSAPP_PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (configuredCallback) {
    return {
      webhookPath,
      expectedPublicWebhook: configuredCallback,
      configuredCallback,
      publicBase: publicBase || null,
      webhookSlug: slug,
    };
  }
  if (publicBase) {
    return {
      webhookPath,
      expectedPublicWebhook: `${publicBase}${webhookPath}`,
      configuredCallback: null,
      publicBase,
      webhookSlug: slug,
    };
  }
  return {
    webhookPath,
    expectedPublicWebhook: null as string | null,
    configuredCallback: null,
    publicBase: null,
    webhookSlug: slug,
  };
}

function isInboundWebhookReady(
  metaWebhookUrl: string,
  expectedPublicWebhook: string | null,
) {
  const meta = normalizeWebhookUrl(metaWebhookUrl);
  if (!meta) return false;
  if (expectedPublicWebhook) {
    return meta === normalizeWebhookUrl(expectedPublicWebhook);
  }
  // No env URL: accept any Propenu conversation-flow webhook (not Bizrow).
  return (
    !/bizrow\.app/i.test(meta) &&
    meta.includes("/api/conversation-flow/webhook/")
  );
}

let webhookSyncAttempted = false;

/** Verify WHATSAPP_* env credentials against Meta Graph API. */
export async function checkWhatsAppCloudHealth() {
  const { token, phoneNumberId, businessAccountId, appId } = getCredentials();
  const missing = [
    !token && "WHATSAPP_TOKEN",
    !phoneNumberId && "WHATSAPP_PHONE_NUMBER_ID",
  ].filter(Boolean) as string[];

  const {
    webhookPath,
    expectedPublicWebhook,
    configuredCallback,
    webhookSlug,
  } = resolveExpectedWhatsAppWebhookUrl();

  if (missing.length) {
    return {
      ok: false,
      missing,
      phoneNumberId: phoneNumberId || null,
      businessAccountId: businessAccountId || null,
      appId: appId || null,
      webhookPath,
      webhookCallbackUrl: configuredCallback,
      inboundReady: false,
      message: `Missing env: ${missing.join(", ")}`,
    };
  }

  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,webhook_configuration`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const webhookCfg = response.data?.webhook_configuration || {};
    // WABA override (subscribed_apps override_callback_uri) is what inbound uses.
    // `application` can still show the app default (e.g. Bizrow) even after override.
    let metaWebhookUrl = String(
      webhookCfg.whatsapp_business_account ||
        webhookCfg.application ||
        "",
    ).trim();
    let inboundReady = isInboundWebhookReady(
      metaWebhookUrl,
      expectedPublicWebhook,
    );
    let webhookSynced = false;
    let webhookSyncError: string | null = null;

    const autoSync = ["1", "true", "yes", ""].includes(
      String(process.env.WHATSAPP_AUTO_SYNC_WEBHOOK ?? "1")
        .toLowerCase()
        .trim(),
    );

    // Env-based: if Meta still points at Bizrow/old URL, point it at this server once.
    if (
      !inboundReady &&
      expectedPublicWebhook &&
      autoSync &&
      !webhookSyncAttempted
    ) {
      webhookSyncAttempted = true;
      try {
        await registerWhatsAppWebhookOverride(expectedPublicWebhook);
        webhookSynced = true;
        const refresh = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const refreshedCfg = refresh.data?.webhook_configuration || {};
        metaWebhookUrl = String(
          refreshedCfg.whatsapp_business_account ||
            refreshedCfg.application ||
            metaWebhookUrl,
        ).trim();
        inboundReady = isInboundWebhookReady(
          metaWebhookUrl,
          expectedPublicWebhook,
        );
      } catch (syncErr: any) {
        webhookSyncError =
          syncErr?.response?.data?.error?.message ||
          syncErr?.message ||
          "Failed to sync Meta webhook from env";
      }
    }

    return {
      ok: true,
      phoneNumberId,
      businessAccountId: businessAccountId || null,
      appId: appId || null,
      displayPhoneNumber: response.data?.display_phone_number || null,
      verifiedName: response.data?.verified_name || null,
      qualityRating: response.data?.quality_rating || null,
      webhookPath,
      webhookCallbackUrl: configuredCallback,
      webhookSlug,
      metaWebhookUrl: metaWebhookUrl || null,
      metaWebhookApplication: String(webhookCfg.application || "").trim() || null,
      metaWebhookWaba:
        String(webhookCfg.whatsapp_business_account || "").trim() || null,
      expectedPublicWebhook,
      inboundReady,
      webhookSynced,
      webhookSyncError,
      verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
      autoReplyEnabled: ["1", "true", "yes"].includes(
        String(process.env.WHATSAPP_AUTO_REPLY_ENABLED || "")
          .toLowerCase()
          .trim(),
      ),
      message: inboundReady
        ? webhookSynced
          ? "WhatsApp Cloud API ready — inbound webhook synced from env"
          : "WhatsApp Cloud API credentials are valid — inbound webhook ready"
        : metaWebhookUrl
          ? `Inbound messages go to Meta webhook (${metaWebhookUrl}), not this Propenu server — received chats will not appear until Meta points to ${expectedPublicWebhook || "your public Propenu webhook"}`
          : "WhatsApp credentials valid, but Meta webhook URL could not be read",
    };
  } catch (err: any) {
    return {
      ok: false,
      phoneNumberId,
      businessAccountId: businessAccountId || null,
      appId: appId || null,
      webhookPath,
      inboundReady: false,
      message:
        err?.response?.data?.error?.message ||
        err?.message ||
        "Failed to validate WhatsApp credentials",
    };
  }
}

/**
 * Point Meta inbound webhooks at a public Propenu HTTPS URL
 * (WABA override_callback_uri).
 */
export async function registerWhatsAppWebhookOverride(callbackUrlRaw: string) {
  const { token, businessAccountId } = getCredentials();
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "";
  const callbackUrl = String(callbackUrlRaw || "").trim().replace(/\/+$/, "");

  if (!token) throw new Error("WHATSAPP_TOKEN is missing");
  if (!businessAccountId) {
    throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID is missing");
  }
  if (!verifyToken) throw new Error("WHATSAPP_VERIFY_TOKEN is missing");
  if (!/^https:\/\//i.test(callbackUrl)) {
    throw new Error("Callback URL must be public HTTPS");
  }

  const subscribeUrl = `https://graph.facebook.com/${API_VERSION}/${businessAccountId}/subscribed_apps`;

  // Step 1: ensure app is subscribed
  await axios.post(
    subscribeUrl,
    {},
    { headers: { Authorization: `Bearer ${token}` } },
  );

  // Step 2: override callback to Propenu
  const override = await axios.post(
    subscribeUrl,
    {
      override_callback_uri: callbackUrl,
      verify_token: verifyToken,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  return {
    ok: true,
    callbackUrl,
    response: override.data,
    message:
      "Meta webhook override set. Customer replies should now hit this Propenu URL.",
  };
}

export async function startConversation(waIdRaw: string, profileName?: string) {
  const waId = normalizeWaId(waIdRaw);
  if (!waId || waId.length < 10 || waId.length > 15) {
    throw new Error("Enter a valid phone with country code (e.g. 9198XXXXXXXX)");
  }
  const name = String(profileName || "").trim() || waId;
  return WhatsAppConversation.findOneAndUpdate(
    { waId },
    {
      $setOnInsert: {
        waId,
        profileName: name,
        lastMessageAt: new Date(),
        lastMessagePreview: "",
        lastDirection: "outbound",
        unreadCount: 0,
        inboxStatus: "new",
        assignedAgentId: "",
        assignedAgentName: "",
        assignedAgentRole: "",
        origin: "cloud",
      },
      $set: {
        origin: "cloud",
        ...(String(profileName || "").trim()
          ? { profileName: String(profileName).trim() }
          : {}),
      },
    },
    { upsert: true, new: true },
  ).lean();
}

export async function updateConversationMeta(
  waIdRaw: string,
  patch: {
    inboxStatus?: "new" | "waiting" | "resolved";
    assignedAgentId?: string;
    assignedAgentName?: string;
    assignedAgentRole?: string;
    profileName?: string;
  },
) {
  const waId = normalizeWaId(waIdRaw);
  if (!waId) throw new Error("Invalid WhatsApp id");

  const $set: Record<string, unknown> = {};
  if (patch.inboxStatus) $set.inboxStatus = patch.inboxStatus;
  if (typeof patch.assignedAgentId === "string") {
    $set.assignedAgentId = patch.assignedAgentId;
  }
  if (typeof patch.assignedAgentName === "string") {
    $set.assignedAgentName = patch.assignedAgentName;
  }
  if (typeof patch.assignedAgentRole === "string") {
    $set.assignedAgentRole = patch.assignedAgentRole;
  }
  if (typeof patch.profileName === "string") {
    $set.profileName = patch.profileName;
  }
  if (!Object.keys($set).length) {
    throw new Error("No updates provided");
  }

  return WhatsAppConversation.findOneAndUpdate(
    { waId },
    { $set },
    { new: true },
  ).lean();
}
