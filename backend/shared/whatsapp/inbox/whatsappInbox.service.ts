import axios from "axios";
import mongoose from "mongoose";
import {
  WhatsAppConversation,
  WhatsAppMessage,
} from "./whatsappInbox.model";
import { whatsappInboxBus } from "./whatsappInbox.events";
import { searchInboxAssignableAgents } from "./whatsappInbox.assign";

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
  // Never demote a message that Meta already delivered/read to failed.
  // (Late/duplicate failure webhooks were wiping good ticks and re-opening spam retries.)
  if (nxt === "failed") {
    return cur === "pending" || cur === "sent";
  }
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

/** Pull a usable menu label from Meta FLOW (nfm_reply) payloads. */
function extractTextFromNfmReply(nfm: any): string {
  const values: string[] = [];
  try {
    const parsed = JSON.parse(String(nfm?.response_json || "{}"));
    const walk = (value: unknown) => {
      if (typeof value === "string" && value.trim()) values.push(value.trim());
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        Object.values(value as Record<string, unknown>).forEach(walk);
      }
    };
    walk(parsed);
  } catch {
    /* ignore invalid flow JSON */
  }
  const known = values.find((value) =>
    /more\s*options|post\s*a?\s*property|manage\s+(my\s+)?propert|manage\s+my\s+leads|my\s+leads|reach\s+buyers|payment\s+support|buy\s+property|rent\s+property|buy\s+commercial|lease\s+commercial|buy\s+plot/i.test(
      value,
    ),
  );
  if (known) return known;
  const body = String(nfm?.body || "").trim();
  if (body && !/^sent$/i.test(body)) return body;
  return values[0] || "";
}

function extractInboundText(message: any): { type: string; body: string } {
  const type = String(message?.type || "text");
  if (type === "text") {
    return { type, body: String(message?.text?.body || "") };
  }
  if (type === "button") {
    return {
      type,
      // Prefer visible label so "More Options" / "Search Property" match handlers.
      body: String(message?.button?.text || message?.button?.payload || "[Button]"),
    };
  }
  if (type === "interactive") {
    const button = message?.interactive?.button_reply;
    const listReply = message?.interactive?.list_reply;
    const nfm = message?.interactive?.nfm_reply;
    const buttonId = String(button?.id || "");
    const buttonTitle = String(button?.title || "");
    // Prefer list id (full option text) over truncated title.
    const listId = String(listReply?.id || "");
    const listTitle = String(listReply?.title || "");
    const nfmText = nfm ? extractTextFromNfmReply(nfm) : "";
    return {
      type,
      body: String(
        buttonTitle ||
          listId ||
          listTitle ||
          nfmText ||
          buttonId ||
          "[Interactive]",
      ),
    };
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
                    error: (() => {
                      const e0 = statusItem?.errors?.[0];
                      const code = e0?.code != null ? ` (#${e0.code})` : "";
                      return `${e0?.title || e0?.message || "Failed"}${code}`.trim();
                    })(),
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
  const configured = String(frontendBase || process.env.FRONTEND_URL || "https://propenu.com")
    .trim()
    .replace(/\/$/, "");
  const base = /^https?:\/\/(www\.)?propenu\.com$/i.test(configured)
    ? "https://propenu.com"
    : configured || "https://propenu.com";
  const link = `${base}/register`;
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
    { projection: { phoneVerified: 1, name: 1, city: 1, state: 1, roleId: 1 } },
  );
}

function normalizeWhatsAppRoleName(roleName?: string | null) {
  return String(roleName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Marketplace agent roles that should receive existing_agent on Hi. */
function isMarketplaceAgentRole(roleName?: string | null) {
  const key = normalizeWhatsAppRoleName(roleName);
  return key === "agent" || key === "sales_agent" || key === "agents";
}

async function findWhatsAppAccount(waId: string) {
  if (mongoose.connection.readyState !== 1) {
    console.error("WhatsApp welcome skipped the account lookup: database is not connected");
    // Safer default: treat as new so registration template can still go out.
    return {
      isNew: true,
      isAgent: false,
      roleName: "",
      userId: "",
      name: "",
      city: "",
      state: "",
    };
  }
  const user = await findUserByWhatsAppPhone(waId);
  const isNew = user?.phoneVerified !== true;
  let name = String(user?.name || "").trim();
  if (!isNew && !name) {
    const conversation = await WhatsAppConversation.findOne({ waId }).select("profileName").lean();
    name = String(conversation?.profileName || "").trim();
  }
  let roleName = "";
  if (user?.roleId) {
    const role = await mongoose.connection.collection("roles").findOne(
      { _id: user.roleId },
      { projection: { name: 1 } },
    );
    roleName = String(role?.name || "").trim();
  }
  return {
    isNew,
    isAgent: isMarketplaceAgentRole(roleName),
    roleName,
    userId: user?._id ? String(user._id) : "",
    name,
    city: String(user?.city || "").trim(),
    state: String(user?.state || "").trim(),
  };
}

function samePlaceName(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

async function popularHomeCities() {
  const rows = await mongoose.connection.collection("locations").find({
    isHome: true,
    category: { $regex: /^popular$/i },
  }).project({ city: 1, state: 1 }).sort({ city: 1 }).toArray();
  return rows
    .map((row) => ({
      city: String(row.city || "").trim(),
      state: String(row.state || "").trim(),
    }))
    .filter((row) => row.city);
}

async function cityOptionsForAccount(account: { isNew: boolean; city: string; state: string }) {
  const popular = await popularHomeCities();
  if (!popular.length) return ["Hyderabad", "Bangalore", "Mumbai", "Pune"];
  if (account.isNew || !account.city) return popular.slice(0, 5).map((row) => row.city);

  const state = account.state || popular.find((row) => samePlaceName(row.city, account.city))?.state || "";
  const inArea = state ? popular.filter((row) => samePlaceName(row.state, state)) : [];
  const ordered: string[] = [];
  const push = (city: string) => {
    if (city && !ordered.some((item) => samePlaceName(item, city))) ordered.push(city);
  };
  push(account.city);
  inArea.forEach((row) => push(row.city));
  popular.forEach((row) => {
    if (ordered.length < 5) push(row.city);
  });
  return ordered.slice(0, 5);
}

async function cityChoiceFromMessage(message: string) {
  const text = String(message || "").trim();
  if (!text || text.length > 40) return null;
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const row = await mongoose.connection.collection("locations").findOne({
    city: { $regex: new RegExp(`^${escaped}$`, "i") },
  });
  if (!row?.city) return null;
  return {
    city: String(row.city).trim(),
    state: String(row.state || "").trim(),
  };
}

const NEW_USER_WELCOME = `👋 Welcome aboard!

We're glad to have you here.

What would you like to explore first on Propenu?

Choose an option below 👇`;

type NewUserChoice = "create_account" | "buy_property" | "rent_property" | "post_property";

const NEW_USER_ROWS: { id: NewUserChoice; title: string }[] = [
  { id: "create_account", title: "Create Account" },
  { id: "buy_property", title: "Buy a Property" },
  { id: "rent_property", title: "Rent a Property" },
  { id: "post_property", title: "Post a Property" },
];

function matchNewUserChoice(text: string): NewUserChoice | null {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+/g, "")
    .replace(/\s+/g, " ");
  return NEW_USER_ROWS.find(
    (row) => row.id === normalized || row.title.toLowerCase() === normalized,
  )?.id || null;
}

function newUserChoiceContent(choice: NewUserChoice) {
  const base = String(process.env.FRONTEND_URL || "https://propenu.com")
    .trim()
    .replace(/\/$/, "");
  if (choice === "create_account") {
    return {
      text: "Create your Propenu account to save properties, contact owners, and finish registration.",
      url: /^https?:\/\/(www\.)?propenu\.com$/i.test(base)
        ? "https://propenu.com/register"
        : `${base}/register`,
    };
  }
  if (choice === "buy_property") {
    return {
      text: "Start exploring properties to buy and discover the perfect home that matches your needs, preferences, and budget.",
      url: `${base}/properties?type=residential&listingType=sale`,
    };
  }
  if (choice === "rent_property") {
    return {
      text: "Start exploring properties to rent and discover the perfect home that matches your needs, preferences, and budget.",
      url: `${base}/properties?type=residential&listingType=rent`,
    };
  }
  return {
    text: "Post your property on Propenu and reach people who want to buy or rent.",
    url: `${base}/postproperty`,
  };
}

async function isNewWhatsAppUser(waId: string) {
  return (await findWhatsAppAccount(waId)).isNew;
}

function existingUserWelcome(name: string) {
  const safeName = String(name || "").trim();
  const hello = safeName ? `Welcome back, ${safeName}!` : "Welcome back!";
  return `${hello}

What would you like to explore on Propenu?

Choose an option below 👇`;
}

const CHAT_OPENING_OPTIONS = [
  "Buy Property",
  "Rent Property",
  "Buy Commercial",
  "Lease Commercial",
  "Buy Plot",
];

/**
 * Agent More Options menu (WhatsApp list max 10 rows).
 * Template CTAs first so Post / Manage / Leads / Reach / Payment always appear.
 */
const AGENT_CHAT_OPENING_OPTIONS = [
  "Post Property",
  "Manage Properties",
  "Manage My Leads",
  "Reach Buyers & Tenants",
  "Get Payment Support",
  "Buy Property",
  "Rent Property",
  "Buy Commercial",
  "Lease Commercial",
  "Contact our team",
];

const CONTACT_AGENT_ID = "contact_agent";
const CONTACT_AGENT_LABEL = "Contact our team";
const replyInFlight = new Set<string>();

function isContactAgentChoice(text: string) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+/g, "")
    .replace(/\s+/g, " ");
  return (
    normalized === CONTACT_AGENT_ID ||
    normalized === "contact our team" ||
    normalized === "please contact agent" ||
    normalized === "contact agent" ||
    normalized === "contact our agent" ||
    normalized === "contact our agents"
  );
}

/** existing_agent template quick-reply (title or payload/id). */
function isMoreOptionsChoice(text: string) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ");
  return (
    normalized === "more options" ||
    normalized === "more option" ||
    normalized === "moreoptions"
  );
}

/** Post Property from More Options list / account-created quick reply. */
function isPostPropertyChoice(text: string) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ");
  return (
    normalized === "post property" ||
    normalized === "post a property" ||
    normalized === "postproperty"
  );
}

/** Manage Properties from agent More Options list. */
function isManagePropertiesChoice(text: string) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ");
  return (
    normalized === "manage properties" ||
    normalized === "manage property" ||
    normalized === "manage my properties" ||
    normalized === "manage all your listed properties here"
  );
}

/** Manage My Leads from agent More Options list. */
function isManageMyLeadsChoice(text: string) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ");
  return (
    normalized === "manage my leads" ||
    normalized === "manage leads" ||
    normalized === "view your leads and follow up with interested users" ||
    normalized === "my leads"
  );
}

/** Reach Buyers & Tenants from agent More Options list. */
function isReachBuyersTenantsChoice(text: string) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s*&\s*/g, " and ");
  return (
    normalized === "reach buyers and tenants" ||
    normalized === "reach buyers tenants" ||
    normalized === "reach buyers" ||
    normalized === "reach buyers  tenants"
  );
}

/** Get Payment Support from agent More Options list. */
function isGetPaymentSupportChoice(text: string) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ");
  return (
    normalized === "get payment support" ||
    normalized === "payment support" ||
    normalized === "get paymentsupport"
  );
}

function chatbotMessageFromInbound(text: string) {
  const choice = matchNewUserChoice(text);
  const trimmed = String(text || "").trim();
  if (choice === "create_account" || /^create account$/i.test(trimmed)) {
    return { kind: "account" as const };
  }
  if (choice === "post_property") return { kind: "post" as const };
  if (isContactAgentChoice(trimmed) || isContactAgentChoice(choice || "")) {
    return { kind: "agent" as const };
  }
  if (choice === "buy_property") return { kind: "chat" as const, text: "Buy Property" };
  if (choice === "rent_property") return { kind: "chat" as const, text: "Rent Property" };
  return { kind: "chat" as const, text: trimmed };
}

function listRowTitle(option: string) {
  const label = option.replace(/^search in\s+/i, "").trim() || option;
  return label.length <= 24 ? label : `${label.slice(0, 21)}...`;
}

function withChatOptions(question: string, options: string[], includeCreateAccount: boolean) {
  const next = options.filter((option) => !isContactAgentChoice(option));
  if (
    /what would you like to do/i.test(question) &&
    includeCreateAccount &&
    !next.some((option) => /^create account$/i.test(option))
  ) {
    next.unshift("Create Account");
  }
  return [...next.filter((option) => !isContactAgentChoice(option)).slice(0, 9), CONTACT_AGENT_LABEL];
}

async function sentSameBodyRecently(waId: string, body: string) {
  const since = new Date(Date.now() - 20000);
  return Boolean(
    await WhatsAppMessage.exists({
      waId,
      direction: "outbound",
      body,
      createdAt: { $gte: since },
      status: { $ne: "failed" },
    }),
  );
}

async function isBotPaused(waId: string) {
  const conversation = await WhatsAppConversation.findOne({ waId }).select("botPaused").lean();
  return Boolean(conversation?.botPaused);
}

async function findInboxAgent() {
  const roles = ["customer_care_executive", "customer_care", "customer_support_team_lead"];
  for (const role of roles) {
    const agents = await searchInboxAssignableAgents("", 20, role);
    if (!agents.length) continue;
    const counted = await Promise.all(
      agents.map(async (agent) => ({
        agent,
        openChats: await WhatsAppConversation.countDocuments({
          assignedAgentId: agent.id,
          inboxStatus: { $in: ["new", "waiting"] },
          botPaused: true,
        }),
      })),
    );
    counted.sort((left, right) => left.openChats - right.openChats);
    return counted[0]?.agent || null;
  }
  return null;
}

async function handOffToAgent(waId: string) {
  const agent = await findInboxAgent();
  const update: Record<string, unknown> = {
    botPaused: true,
    inboxStatus: "waiting",
  };
  if (agent) {
    update.assignedAgentId = agent.id;
    update.assignedAgentName = agent.name;
    update.assignedAgentRole = agent.roleLabel;
  }
  await WhatsAppConversation.updateOne({ waId }, { $set: update });
  const text = "Thank you for contacting us. Our team will review your request and reply in this chat.";
  await sendInboxTextMessage(waId, text, {
    source: "agent_handoff",
    sessionTextOnly: true,
  });
  whatsappInboxBus.publish({ type: "conversation", waId });
}

async function sendContactAgentButton(waId: string, body?: string) {
  const text = String(body || "If you want help from our team, contact our team.").trim();
  if (await sentSameBodyRecently(waId, text)) return;
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: text.slice(0, 1024) },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: CONTACT_AGENT_ID, title: CONTACT_AGENT_LABEL },
          },
        ],
      },
    },
  };
  try {
    await sendInboxSessionPayload(waId, text, payload, "contact_agent_prompt");
  } catch (err) {
    console.error("WhatsApp contact-agent button failed, sending session text:", err);
    await sendInboxTextMessage(waId, `${text}\n\nReply: ${CONTACT_AGENT_LABEL}`, {
      source: "contact_agent_prompt",
      sessionTextOnly: true,
    });
  }
}

async function sendWhatsAppOptionList(waId: string, body: string, options: string[], source: string) {
  if (await sentSameBodyRecently(waId, body)) return;
  const rows = options
    .map((option) => String(option || "").trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((option) => ({
      id: option.slice(0, 200),
      title: listRowTitle(option),
    }));
  if (!rows.length) {
    await sendInboxTextMessage(waId, body, { source, sessionTextOnly: true });
    return;
  }
  const listPayload = {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body.slice(0, 1024) },
      action: {
        button: "See options",
        sections: [{ title: "Explore", rows }],
      },
    },
  };
  try {
    await sendInboxSessionPayload(waId, body, listPayload, source);
  } catch (err) {
    console.error("WhatsApp option list failed, sending session text:", err);
    const numbered = rows.map((row, index) => `${index + 1}. ${row.id}`).join("\n");
    await sendInboxTextMessage(waId, `${body}\n\n${numbered}`, {
      source,
      sessionTextOnly: true,
    });
  }
}

async function askPropertyChatbot(waId: string, message: string) {
  const base = String(process.env.AI_SERVICE_URL || "http://127.0.0.1:4006").replace(/\/$/, "");
  const chosenCity = await cityChoiceFromMessage(message);
  const context: Record<string, string> = {};
  if (chosenCity?.city) context.city = chosenCity.city;
  if (chosenCity?.state) context.state = chosenCity.state;
  const response = await axios.post(
    `${base}/api/chatbot`,
    { message, ...(Object.keys(context).length ? { context } : {}) },
    {
      headers: {
        "Content-Type": "application/json",
        "x-session-id": `wa-${waId}`,
      },
      responseType: "text",
      timeout: 20000,
      validateStatus: () => true,
    },
  );
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Property chat replied HTTP ${response.status}`);
  }
  const question: string[] = [];
  const messages: string[] = [];
  const options: string[] = [];
  const properties: Array<{ title?: string; location?: string; price?: string; href?: string }> = [];
  for (const line of String(response.data || "").split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: any;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (event.type === "question" && event.question) question.push(String(event.question));
    if (event.type === "message" && event.content) messages.push(String(event.content));
    if (event.type === "error" && event.message) messages.push(String(event.message));
    const eventOptions = Array.isArray(event.options) ? event.options : [];
    for (const option of eventOptions) {
      const label = String(option || "").trim();
      if (label && !options.includes(label)) options.push(label);
    }
    if (event.type === "property" && event.property) properties.push(event.property);
  }
  return {
    question: question[0] || "",
    message: messages.filter(Boolean).join("\n\n"),
    options,
    properties,
  };
}

function propertyReplyText(
  message: string,
  properties: Array<{ title?: string; location?: string; price?: string; href?: string }>,
) {
  const configured = String(process.env.FRONTEND_URL || "https://propenu.com").trim().replace(/\/$/, "");
  const base = /^http:\/\/(www\.)?propenu\.com$/i.test(configured)
    ? "https://propenu.com"
    : configured || "https://propenu.com";
  const cards = properties.slice(0, 2).map((property, index) => {
    const href = String(property.href || "");
    const link = href.startsWith("http") ? href : href ? `${base}${href}` : "";
    return [
      `${index + 1}. ${property.title || "Property"}`,
      property.location || "",
      property.price || "",
      link,
    ].filter(Boolean).join("\n");
  });
  return [message, ...cards].filter(Boolean).join("\n\n").trim();
}

async function openingOptions(includeCreateAccount: boolean, forAgent = false) {
  // Agents: fixed 10-row menu (do not re-slice via withChatOptions or CTAs get dropped).
  if (forAgent) {
    return AGENT_CHAT_OPENING_OPTIONS.slice(0, 10);
  }
  return withChatOptions(
    "What would you like to do?",
    CHAT_OPENING_OPTIONS,
    includeCreateAccount,
  );
}

async function sendChatbotReply(waId: string, text: string) {
  const account = await findWhatsAppAccount(waId);
  const reply = await askPropertyChatbot(waId, text);
  const question = reply.question;
  const questionOptions = /which city are you searching/i.test(question)
    ? await cityOptionsForAccount(account)
    : reply.options;
  const options = withChatOptions(question, questionOptions, account.isNew);
  if (question && options.length) {
    const body = /what would you like to do/i.test(question)
      ? account.isNew
        ? NEW_USER_WELCOME
        : existingUserWelcome(account.name)
      : question;
    await sendWhatsAppOptionList(waId, body, options, "chatbot_question");
    return;
  }
  const propertyBody = propertyReplyText(reply.message, reply.properties);
  if (reply.properties.length) {
    const combined = [propertyBody, "If you want help from our team, contact our team."]
      .filter(Boolean)
      .join("\n\n");
    await sendContactAgentButton(waId, combined);
    return;
  }
  if (propertyBody && !(await sentSameBodyRecently(waId, propertyBody))) {
    await sendInboxTextMessage(waId, propertyBody, {
      source: "chatbot_reply",
      sessionTextOnly: true,
    });
  }
  if (options.length) {
    await sendWhatsAppOptionList(waId, "Choose one", options, "chatbot_suggestions");
    return;
  }
  await sendWelcomeMenu(waId);
}

async function sendWelcomeMenu(waId: string) {
  const account = await findWhatsAppAccount(waId);
  await sendWhatsAppOptionList(
    waId,
    account.isNew ? NEW_USER_WELCOME : existingUserWelcome(account.name),
    await openingOptions(account.isNew, account.isAgent),
    account.isNew ? "new_user_welcome" : "existing_user_welcome",
  );
}

const NEW_USER_REGISTRATION_TEMPLATE = String(
  process.env.WHATSAPP_NEW_USER_REGISTRATION_TEMPLATE || "propenu_registration_information",
).trim();

const ACCOUNT_CREATED_TEMPLATE = String(
  process.env.WHATSAPP_ACCOUNT_CREATED_TEMPLATE || "account_created_sucessfully",
).trim();

const SEARCH_PROPERTY_TEMPLATE = String(
  process.env.WHATSAPP_SEARCH_PROPERTY_TEMPLATE ||
    "looking_to_buy_or_rent_a_property_choose_an_option_below",
).trim();

const EXISTING_USER_TEMPLATE = String(
  process.env.WHATSAPP_EXISTING_USER_TEMPLATE || "existing_agent",
).trim();

/** Agent Post Property flow (Meta names — keep agnet_* typo as approved). */
const AGENT_POST_PROPERTY_TEMPLATE = String(
  process.env.WHATSAPP_AGENT_POST_PROPERTY_TEMPLATE || "post_a_property",
).trim();
const AGENT_NO_PLAN_LIMIT_TEMPLATE = String(
  process.env.WHATSAPP_AGENT_NO_PLAN_LIMIT_TEMPLATE || "agnet_plans_listing_limit",
).trim();
const AGENT_HAS_PLAN_TEMPLATE = String(
  process.env.WHATSAPP_AGENT_HAS_PLAN_TEMPLATE || "reach_buyers__tenants",
).trim();
const AGENT_PLAN_BENEFITS_TEMPLATE = String(
  process.env.WHATSAPP_AGENT_PLAN_BENEFITS_TEMPLATE || "additional_plan_benefits_update",
).trim();
const AGENT_MANAGE_PROPERTIES_TEMPLATE = String(
  process.env.WHATSAPP_AGENT_MANAGE_PROPERTIES_TEMPLATE ||
    "manage_all_your_listed_properties_here",
).trim();
const AGENT_MANAGE_LEADS_TEMPLATE = String(
  process.env.WHATSAPP_AGENT_MANAGE_LEADS_TEMPLATE ||
    "view_your_leads_and_follow_up_with_interested_users",
).trim();
const AGENT_PAYMENT_SUPPORT_TEMPLATE = String(
  process.env.WHATSAPP_AGENT_PAYMENT_SUPPORT_TEMPLATE || "get_payment_support",
).trim();
const AGENT_MANAGE_LEADS_URL_SUFFIX = String(
  process.env.WHATSAPP_AGENT_MANAGE_LEADS_URL_SUFFIX || "agent/leads",
)
  .trim()
  .replace(/^\/+/, "");
const AGENT_REACH_BUYERS_URL_SUFFIX = String(
  process.env.WHATSAPP_AGENT_REACH_BUYERS_URL_SUFFIX || "agent-plan",
)
  .trim()
  .replace(/^\/+/, "");
const AGENT_POST_PROPERTY_URL_SUFFIX = String(
  process.env.WHATSAPP_AGENT_POST_PROPERTY_URL_SUFFIX || "postproperty",
)
  .trim()
  .replace(/^\/+/, "");
const AGENT_MANAGE_PROPERTIES_URL_SUFFIX = String(
  process.env.WHATSAPP_AGENT_MANAGE_PROPERTIES_URL_SUFFIX || "agent/my-properties",
)
  .trim()
  .replace(/^\/+/, "");
const AGENT_PAYMENT_SUPPORT_URL_SUFFIX = String(
  process.env.WHATSAPP_AGENT_PAYMENT_SUPPORT_URL_SUFFIX || "agent/support",
)
  .trim()
  .replace(/^\/+/, "");
const AGENT_NO_PLAN_LIMIT_URL_SUFFIX = String(
  process.env.WHATSAPP_AGENT_NO_PLAN_LIMIT_URL_SUFFIX || "agent-plan",
)
  .trim()
  .replace(/^\/+/, "");
const AGENT_PLAN_BENEFITS_URL_SUFFIX = String(
  process.env.WHATSAPP_AGENT_PLAN_BENEFITS_URL_SUFFIX || "agent-plan",
)
  .trim()
  .replace(/^\/+/, "");
/** Default free agent plan when no active subscription row exists. */
const AGENT_FREE_PLAN_CODE = String(
  process.env.WHATSAPP_AGENT_FREE_PLAN_CODE || "AGENT_FREE",
).trim();
const AGENT_FREE_DEFAULT_LISTING_LIMIT = Math.max(
  1,
  Number(process.env.WHATSAPP_AGENT_FREE_DEFAULT_LISTING_LIMIT) || 20,
);

type InboxTemplateButton = {
  label: string;
  /** Matches WhatsApp: reply arrow vs visit-website / URL click. */
  kind: "quick_reply" | "url";
};

function normalizeInboxTemplateButtons(
  buttons?: Array<string | InboxTemplateButton>,
): InboxTemplateButton[] {
  return (buttons || [])
    .map((item) => {
      if (typeof item === "string") {
        const label = String(item || "").trim();
        return label ? { label, kind: "quick_reply" as const } : null;
      }
      const label = String(item?.label || "").trim();
      if (!label) return null;
      const kind = item?.kind === "url" ? ("url" as const) : ("quick_reply" as const);
      return { label, kind };
    })
    .filter(Boolean)
    .slice(0, 3) as InboxTemplateButton[];
}

/** Meta rejects newlines / tabs / long space runs in template variables (#131009). */
function sanitizeMetaTemplateParam(value: string, fallback = "there") {
  const cleaned = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {5,}/g, "    ")
    .trim()
    .slice(0, 60);
  return cleaned || fallback;
}

async function sendApprovedInboxTemplate(params: {
  waIdRaw: string;
  templateName: string;
  source: string;
  bodyPreview: string;
  buttons?: Array<string | InboxTemplateButton>;
  /** Fills Meta template body variables {{1}}, {{2}}, ... */
  bodyParams?: string[];
  /**
   * existing_agent uses a Meta FLOW button ("More Options").
   * Without this component Meta returns (#131009) Parameter value is not valid.
   */
  flowButton?: {
    index?: number;
    flowToken?: string;
    navigateScreen?: string;
  };
  /** Dynamic URL CTA suffix, e.g. agent/leads for https://propenu.com/{{1}}. */
  urlButton?: {
    index?: number;
    text: string;
  };
  dedupeHours?: number;
  /** Skip re-send if ANY attempt (incl. failed) happened in this many minutes. */
  attemptCooldownMinutes?: number;
}) {
  const waId = normalizeWaId(params.waIdRaw);
  if (!waId) return false;

  const templateName = String(params.templateName || "").trim();
  if (!templateName) return false;
  const buttons = normalizeInboxTemplateButtons(params.buttons);
  const bodyParams = (params.bodyParams || [])
    .map((value) => sanitizeMetaTemplateParam(value))
    .filter(Boolean)
    .slice(0, 10);
  const flowButton = params.flowButton
    ? {
        index: Math.max(0, Number(params.flowButton.index) || 0),
        flowToken: String(
          params.flowButton.flowToken || `unused:${waId}:${Date.now()}`,
        )
          .trim()
          .slice(0, 255),
        navigateScreen: String(params.flowButton.navigateScreen || "").trim(),
      }
    : null;
  const urlButton = params.urlButton?.text
    ? {
        index: Math.max(0, Number(params.urlButton.index) || 0),
        text: String(params.urlButton.text || "")
          .trim()
          .replace(/^\/+/, "")
          .slice(0, 2000),
      }
    : null;

  const templateLang =
    String(process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en").trim() || "en";
  // Allow sub-hour windows (e.g. 0.25 = 15 minutes) for greeting re-tries.
  const dedupeHours = Math.max(0.05, Number(params.dedupeHours) || 24);
  const since = new Date(Date.now() - dedupeHours * 60 * 60 * 1000);
  // Only treat real Meta deliveries as "already sent".
  // Stuck "pending" rows (deploy restart mid-send) must not block later retries.
  const alreadySent = await WhatsAppMessage.exists({
    waId,
    direction: "outbound",
    "raw.source": params.source,
    "raw.dedupeInvalidated": { $ne: true },
    status: { $in: ["sent", "delivered", "read"] },
    createdAt: { $gte: since },
  });
  if (alreadySent) {
    console.log(
      `WhatsApp template ${templateName} skipped (dedupe ${dedupeHours}h) ******${waId.slice(-4)} (${params.source})`,
    );
    return true;
  }

  const cooldownMinutes = Math.max(0, Number(params.attemptCooldownMinutes) || 0);
  if (cooldownMinutes > 0) {
    const coolSince = new Date(Date.now() - cooldownMinutes * 60 * 1000);
    const recentAttempt = await WhatsAppMessage.exists({
      waId,
      direction: "outbound",
      "raw.source": params.source,
      "raw.dedupeInvalidated": { $ne: true },
      // Allow immediate retry after config errors (#131009 flow / #131008 URL param).
      error: { $not: /#(131009|131008)/i },
      createdAt: { $gte: coolSince },
    });
    if (recentAttempt) {
      console.log(
        `WhatsApp template ${templateName} skipped (attempt cooldown ${cooldownMinutes}m) ******${waId.slice(-4)} (${params.source})`,
      );
      return false;
    }
  }

  const { token, phoneNumberId } = getCredentials();
  if (!token || !phoneNumberId) {
    throw new Error(
      "WhatsApp credentials are missing (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)",
    );
  }

  const conversation = await upsertConversation({
    waId,
    preview: previewFromBody(params.bodyPreview),
    direction: "outbound",
  });
  await WhatsAppConversation.updateOne(
    { _id: conversation._id },
    { $set: { origin: "cloud", botPaused: false } },
  );

  const pending = await WhatsAppMessage.create({
    conversationId: conversation._id,
    waId,
    direction: "outbound",
    type: "template",
    body: params.bodyPreview,
    status: "pending",
    raw: {
      source: params.source,
      template: templateName,
      language: templateLang,
      buttons,
      bodyParams,
      ...(flowButton ? { flowButton } : {}),
      ...(urlButton ? { urlButton } : {}),
    },
  });

  try {
    const components: Record<string, unknown>[] = [];
    if (bodyParams.length) {
      components.push({
        type: "body",
        parameters: bodyParams.map((text) => ({ type: "text", text })),
      });
    }
    if (flowButton) {
      const action: Record<string, unknown> = {
        flow_token: flowButton.flowToken || "unused",
      };
      if (flowButton.navigateScreen) {
        action.flow_action_data = { screen: flowButton.navigateScreen };
      }
      components.push({
        type: "button",
        sub_type: "flow",
        index: String(flowButton.index),
        parameters: [
          {
            type: "action",
            action,
          },
        ],
      });
    }
    if (urlButton) {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(urlButton.index),
        parameters: [{ type: "text", text: urlButton.text }],
      });
    }
    const templatePayload: Record<string, unknown> = {
      name: templateName,
      language: { code: templateLang },
      ...(components.length ? { components } : {}),
    };
    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: waId,
        type: "template",
        template: templatePayload,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );
    const wamid = extractMetaMessageId(response.data);
    pending.status = "sent";
    if (wamid) pending.wamid = wamid;
    pending.raw = {
      ...(pending.raw as object),
      response: response.data,
    };
    await pending.save();
    whatsappInboxBus.publish({ type: "message", waId });
    console.log(
      `WhatsApp template ${templateName} sent to ******${waId.slice(-4)} (${params.source})`,
    );
    return true;
  } catch (err: any) {
    const metaError = err?.response?.data?.error;
    const metaCode = metaError?.code != null ? ` (#${metaError.code})` : "";
    pending.status = "failed";
    pending.error =
      `${metaError?.message || err?.message || "Failed to send WhatsApp template"}${metaCode}`.trim();
    pending.raw = {
      ...(pending.raw as object),
      ...(err?.response?.data || {}),
    };
    await pending.save();
    whatsappInboxBus.publish({ type: "message", waId });
    throw err;
  }
}

/** Approved Meta template for visitors who have not finished a Propenu account. */
async function sendNewUserRegistrationTemplate(waIdRaw: string) {
  return sendApprovedInboxTemplate({
    waIdRaw,
    templateName: NEW_USER_REGISTRATION_TEMPLATE || "propenu_registration_information",
    source: "new_user_registration_template",
    bodyPreview:
      "Hello , Your Propenu account registration details are available. You can proceed with the registration process using the option below.",
    buttons: [{ label: "Complete Registration", kind: "url" }],
  });
}

/** Approved Meta template after a new Propenu account is created successfully. */
export async function sendAccountCreatedSuccessfullyTemplate(phoneRaw: string) {
  return sendApprovedInboxTemplate({
    waIdRaw: phoneRaw,
    templateName: ACCOUNT_CREATED_TEMPLATE || "account_created_sucessfully",
    source: "account_created_successfully_template",
    bodyPreview:
      "✅ Your Propenu account has been created successfully! You can now explore properties, post listings, manage leads, and access services based on your needs.",
    buttons: [
      { label: "Search Property", kind: "quick_reply" },
      { label: "Post Property", kind: "quick_reply" },
    ],
    dedupeHours: 24 * 7,
  });
}

function isSearchPropertyChoice(text: string) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+/g, "")
    .replace(/\s+/g, " ");
  return (
    normalized === "search property" ||
    normalized === "search_property" ||
    normalized === "search properties" ||
    normalized === "searchproperty"
  );
}

/** Buy / Rent options after the visitor taps Search Property. */
async function sendSearchPropertyOptionsTemplate(waIdRaw: string) {
  return sendApprovedInboxTemplate({
    waIdRaw,
    templateName:
      SEARCH_PROPERTY_TEMPLATE ||
      "looking_to_buy_or_rent_a_property_choose_an_option_below",
    source: "search_property_options_template",
    bodyPreview:
      "Your property search request has been received.\n\nPlease select the property requirement below to continue.",
    buttons: [
      { label: "Buy Property", kind: "url" },
      { label: "Rent Property", kind: "url" },
    ],
    dedupeHours: 1,
  });
}

function planFeatureNumber(features: any, key: string) {
  if (!features) return undefined;
  if (typeof features.get === "function") {
    const value = features.get(key);
    return typeof value === "number" ? value : Number(value);
  }
  const value = features[key] ?? features[String(key).toLowerCase()];
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

async function countAgentActiveListings(userId: string) {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return 0;
  const createdBy = new mongoose.Types.ObjectId(userId);
  const filter = { createdBy, status: "active" };
  const [resCount, comCount, landCount, agriCount] = await Promise.all([
    mongoose.connection.collection("residentials").countDocuments(filter),
    mongoose.connection.collection("commercials").countDocuments(filter),
    mongoose.connection.collection("landplots").countDocuments(filter),
    mongoose.connection.collection("agriculturals").countDocuments(filter),
  ]);
  return resCount + comCount + landCount + agriCount;
}

type AgentPostPlanState = {
  hasPaidPlan: boolean;
  hasFreePlan: boolean;
  canPostFree: boolean;
  planNames: string;
};

function isAgentFreePlanDoc(plan: any) {
  if (!plan) return false;
  const tier = String(plan.tier || "").toLowerCase();
  const code = String(plan.code || "").trim().toUpperCase();
  const price = Number(plan.price);
  return (
    tier === "free" ||
    code === String(AGENT_FREE_PLAN_CODE || "AGENT_FREE").toUpperCase() ||
    (Number.isFinite(price) && price === 0)
  );
}

async function loadDefaultAgentFreePlan() {
  const code = AGENT_FREE_PLAN_CODE || "AGENT_FREE";
  const byCode = await mongoose.connection.collection("plans").findOne({
    code,
    userType: "agent",
  });
  if (byCode) return byCode;
  return mongoose.connection.collection("plans").findOne({
    userType: "agent",
    tier: "free",
  });
}

function listingLimitFromPlan(plan: any, fallback = AGENT_FREE_DEFAULT_LISTING_LIMIT) {
  const limitRaw = planFeatureNumber(plan?.features, "PROPERTY_LISTING_LIMIT");
  if (typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0) {
    return limitRaw;
  }
  return Math.max(1, Number(fallback) || 20);
}

/** Free-plan fallback when agent has no usable active subscription row. */
async function getAgentFreePlanFallbackState(userId: string): Promise<AgentPostPlanState> {
  const freePlan = await loadDefaultAgentFreePlan();
  const limit = listingLimitFromPlan(freePlan);
  const listingCount = await countAgentActiveListings(userId);
  const underLimit = listingCount < limit;
  return {
    hasPaidPlan: false,
    hasFreePlan: true,
    canPostFree: underLimit,
    planNames: String(freePlan?.name || freePlan?.code || "Free"),
  };
}

/** Active agent subscription + free listing quota for Post Property branching. */
async function getAgentPostPlanState(userId: string): Promise<AgentPostPlanState> {
  const empty: AgentPostPlanState = {
    hasPaidPlan: false,
    hasFreePlan: false,
    canPostFree: false,
    planNames: "",
  };
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return empty;
  if (mongoose.connection.readyState !== 1) return empty;

  const now = new Date();
  const subs = await mongoose.connection
    .collection("subscriptions")
    .find({
      userId: new mongoose.Types.ObjectId(userId),
      userType: "agent",
      status: "active",
      $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gt: now } }],
    })
    .toArray();

  // No subscription row → treat as AGENT_FREE (registration does not always create one).
  if (!subs.length) {
    return getAgentFreePlanFallbackState(userId);
  }

  const planCodes = [
    ...new Set(subs.map((sub) => String(sub.planCode || "").trim()).filter(Boolean)),
  ];
  const plans = planCodes.length
    ? await mongoose.connection
        .collection("plans")
        .find({ code: { $in: planCodes } })
        .toArray()
    : [];
  const planByCode = new Map(plans.map((plan) => [String(plan.code), plan]));

  let paidPlan: any = null;
  let freePlan: any = null;
  const names: string[] = [];
  for (const sub of subs) {
    const plan = planByCode.get(String(sub.planCode || ""));
    if (!plan) continue;
    const name = String(plan.name || plan.code || "").trim();
    if (name && !names.includes(name)) names.push(name);
    if (isAgentFreePlanDoc(plan)) freePlan = plan;
    else paidPlan = plan;
  }

  // Orphaned / unknown plan codes → same free fallback (safe for free agents).
  if (!paidPlan && !freePlan) {
    return getAgentFreePlanFallbackState(userId);
  }

  const activePlan = paidPlan || freePlan;
  const limitRaw = planFeatureNumber(activePlan?.features, "PROPERTY_LISTING_LIMIT");
  const limit = typeof limitRaw === "number" && Number.isFinite(limitRaw) ? limitRaw : 0;
  const listingCount = await countAgentActiveListings(userId);
  // Missing / 0 limit → allow post (legacy behavior for known subscription plans).
  const underLimit = limit <= 0 ? true : listingCount < limit;

  return {
    hasPaidPlan: Boolean(paidPlan),
    hasFreePlan: Boolean(freePlan) && !paidPlan,
    canPostFree: Boolean(activePlan) && underLimit,
    planNames: names.join(", ") || String(activePlan?.name || activePlan?.code || "Propenu plan"),
  };
}

async function sendAgentPostPropertyTemplate(waIdRaw: string) {
  return sendApprovedInboxTemplate({
    waIdRaw,
    templateName: AGENT_POST_PROPERTY_TEMPLATE || "post_a_property",
    source: "agent_post_property_template",
    bodyPreview:
      "Your property submission request is ready for the next step.\n\nPlease use the link below to access the property submission page.",
    buttons: [{ label: "Post a property", kind: "url" }],
    // Meta dynamic URL: https://propenu.com/{{1}} → postproperty
    urlButton: {
      index: 0,
      text: AGENT_POST_PROPERTY_URL_SUFFIX || "postproperty",
    },
    dedupeHours: 0.25,
    attemptCooldownMinutes: 5,
  });
}

async function sendAgentManagePropertiesTemplate(waIdRaw: string) {
  return sendApprovedInboxTemplate({
    waIdRaw,
    templateName:
      AGENT_MANAGE_PROPERTIES_TEMPLATE || "manage_all_your_listed_properties_here",
    source: "agent_manage_properties_template",
    bodyPreview:
      "Your property listings are available in your Propenu account.\n\nYou can access and review your listed properties using the link below.",
    buttons: [{ label: "Click Here", kind: "url" }],
    // Meta dynamic URL: https://propenu.com/{{1}} → agent/my-properties
    urlButton: {
      index: 0,
      text: AGENT_MANAGE_PROPERTIES_URL_SUFFIX || "agent/my-properties",
    },
    dedupeHours: 0.25,
    attemptCooldownMinutes: 5,
  });
}

async function sendAgentManageLeadsTemplate(waIdRaw: string) {
  return sendApprovedInboxTemplate({
    waIdRaw,
    templateName:
      AGENT_MANAGE_LEADS_TEMPLATE ||
      "view_your_leads_and_follow_up_with_interested_users",
    source: "agent_manage_leads_template",
    bodyPreview:
      "Your property lead details are available in your Propenu account.\n\nYou can review the interested users and their enquiry details using the option below.",
    buttons: [{ label: "Click Here", kind: "url" }],
    // Meta dynamic URL: https://propenu.com/{{1}} → agent/leads
    urlButton: {
      index: 0,
      text: AGENT_MANAGE_LEADS_URL_SUFFIX || "agent/leads",
    },
    dedupeHours: 0.25,
    attemptCooldownMinutes: 5,
  });
}

async function sendAgentNoPlanLimitTemplate(waIdRaw: string) {
  return sendApprovedInboxTemplate({
    waIdRaw,
    templateName: AGENT_NO_PLAN_LIMIT_TEMPLATE || "agnet_plans_listing_limit",
    source: "agent_no_plan_limit_template",
    bodyPreview:
      "Your current Propenu subscription has reached its property listing limit.\n\nAdditional property listings are not available under your current plan.\n\nPlease review your subscription details using the link below.",
    buttons: [{ label: "Click Here", kind: "url" }],
    // Meta dynamic URL: https://propenu.com/plans/pricing/{{1}} → agent-plan
    urlButton: {
      index: 0,
      text: AGENT_NO_PLAN_LIMIT_URL_SUFFIX || "agent-plan",
    },
    dedupeHours: 0.25,
    attemptCooldownMinutes: 5,
  });
}

async function sendAgentReachBuyersTemplate(waIdRaw: string) {
  return sendApprovedInboxTemplate({
    waIdRaw,
    templateName: AGENT_HAS_PLAN_TEMPLATE || "reach_buyers__tenants",
    source: "agent_reach_buyers_template",
    bodyPreview:
      "Your current Propenu plan details are available. Please review your plan information using the option below.",
    buttons: [{ label: "Click Here", kind: "url" }],
    // Meta dynamic URL: https://propenu.com/plans/pricing/{{1}} → agent-plan
    urlButton: {
      index: 0,
      text: AGENT_REACH_BUYERS_URL_SUFFIX || "agent-plan",
    },
    dedupeHours: 0.25,
    attemptCooldownMinutes: 5,
  });
}

async function sendAgentPaymentSupportTemplate(waIdRaw: string) {
  return sendApprovedInboxTemplate({
    waIdRaw,
    templateName: AGENT_PAYMENT_SUPPORT_TEMPLATE || "get_payment_support",
    source: "agent_payment_support_template",
    bodyPreview:
      "Need help with a Propenu payment or invoice?\n\nUse the option below to get payment support from our team.",
    buttons: [{ label: "Click Here", kind: "url" }],
    // Meta dynamic URL: https://propenu.com/{{1}} → agent/support
    urlButton: {
      index: 0,
      text: AGENT_PAYMENT_SUPPORT_URL_SUFFIX || "agent/support",
    },
    dedupeHours: 0.25,
    attemptCooldownMinutes: 5,
  });
}

async function sendAgentHasPlanTemplates(waIdRaw: string, planNames: string) {
  const names = sanitizeMetaTemplateParam(planNames, "Propenu plan");
  await sendAgentReachBuyersTemplate(waIdRaw);
  await sendApprovedInboxTemplate({
    waIdRaw,
    templateName: AGENT_PLAN_BENEFITS_TEMPLATE || "additional_plan_benefits_update",
    source: "agent_plan_benefits_template",
    bodyPreview: `The additional Propenu plan details requested are available in your account.\n\nPlan Names: ${names}\n\nYou can access the plan details and included benefits using the link below.`,
    bodyParams: [names],
    buttons: [{ label: "Click Here", kind: "url" }],
    urlButton: {
      index: 0,
      text: AGENT_PLAN_BENEFITS_URL_SUFFIX || "agent-plan",
    },
    dedupeHours: 0.25,
    attemptCooldownMinutes: 5,
  });
}

/**
 * Agent taps Post Property (More Options):
 * - Free plan (or missing sub row treated as AGENT_FREE) + remaining quota → post_a_property
 * - Free quota used up → agnet_plans_listing_limit
 * - Paid plan → reach_buyers__tenants + additional_plan_benefits_update
 *   (+ post_a_property when paid quota still remains)
 */
async function handleAgentPostPropertyFlow(waId: string, account: {
  userId: string;
  isAgent: boolean;
}) {
  if (!account.isAgent || !account.userId) return false;
  const state = await getAgentPostPlanState(account.userId);
  console.log(
    `WhatsApp agent Post Property ******${String(waId).slice(-4)} paid=${state.hasPaidPlan} free=${state.hasFreePlan} canPost=${state.canPostFree} plans=${state.planNames || "-"}`,
  );

  // Paid plan → plan templates first; post link only while quota remains.
  if (state.hasPaidPlan) {
    await sendAgentHasPlanTemplates(waId, state.planNames);
    if (state.canPostFree) {
      try {
        await sendAgentPostPropertyTemplate(waId);
      } catch (err) {
        console.error("WhatsApp agent post_a_property after paid plan failed:", err);
      }
    }
    return true;
  }

  // Free plan + quota → post_a_property only.
  if (state.hasFreePlan && state.canPostFree) {
    await sendAgentPostPropertyTemplate(waId);
    return true;
  }

  // Free quota finished (or free fallback under limit failed) → listing-limit template.
  await sendAgentNoPlanLimitTemplate(waId);
  return true;
}

function existingUserDisplayName(nameRaw: string) {
  const full = String(nameRaw || "").trim().replace(/\s+/g, " ");
  if (!full) return "there";
  const parts = full.split(" ").filter(Boolean);
  // Skip single-letter initials ("D V RAMANA" → "RAMANA").
  const meaningful = parts.find((part) => part.length > 1) || parts[0] || "there";
  return sanitizeMetaTemplateParam(meaningful, "there");
}

/**
 * Approved Meta template for verified / existing Propenu users.
 * Live Meta template `existing_agent` = body {{1}} + FLOW button "More Options"
 * (navigate_screen MORE_OPTIONS). Sending without the flow button → #131009.
 */
async function sendExistingUserAgentTemplate(waIdRaw: string, nameRaw: string) {
  const name = existingUserDisplayName(nameRaw);
  const waId = normalizeWaId(waIdRaw);
  return sendApprovedInboxTemplate({
    waIdRaw,
    templateName: EXISTING_USER_TEMPLATE || "existing_agent",
    source: "existing_user_agent_template",
    bodyPreview: `Hello ${name},\n\nWe have received your message on Propenu.\n\nPlease select an option below to continue with your requested assistance.`,
    bodyParams: [name],
    buttons: [{ label: "More Options", kind: "quick_reply" }],
    flowButton: {
      index: 0,
      flowToken: `existing_agent:${waId}:${Date.now()}`,
      navigateScreen: "MORE_OPTIONS",
    },
    // Successful send: 1h quiet. Failed Meta spam retries: 12m cooldown.
    dedupeHours: 1,
    attemptCooldownMinutes: 12,
  });
}

/** After dashboard delete, the users row is gone but the WhatsApp chat may still be paused. */
export async function reopenWhatsAppChatForDeletedPhone(phoneRaw: string) {
  const waId = normalizeWaId(phoneRaw);
  if (!waId) return false;
  const result = await WhatsAppConversation.updateOne(
    { waId },
    {
      $set: {
        botPaused: false,
        inboxStatus: "new",
        assignedAgentId: "",
        assignedAgentName: "",
        assignedAgentRole: "",
      },
    },
  );
  // Earlier registration/account templates still count for 24h dedupe.
  // After delete the same phone must get the new-user flow again.
  await WhatsAppMessage.updateMany(
    {
      waId,
      direction: "outbound",
      "raw.source": {
        $in: [
          "new_user_registration_template",
          "account_created_successfully_template",
          "search_property_options_template",
          "existing_user_agent_template",
        ],
      },
      "raw.dedupeInvalidated": { $ne: true },
    },
    { $set: { "raw.dedupeInvalidated": true } },
  );
  if (result.modifiedCount || result.matchedCount) {
    whatsappInboxBus.publish({ type: "conversation", waId });
  }
  return Boolean(result.matchedCount);
}

async function replyToInboundMessage(waId: string, text: string) {
  if (replyInFlight.has(waId)) return;
  replyInFlight.add(waId);
  try {
    const inbound = String(text || "").trim();
    if (!inbound) return;

    const account = await findWhatsAppAccount(waId);
    const paused = await isBotPaused(waId);
    const greeting = isWhatsAppGreeting(inbound);

    // Search Property from account-created template (or typed) → Buy/Rent options.
    if (isSearchPropertyChoice(inbound)) {
      if (paused && !account.isNew) return;
      try {
        await sendSearchPropertyOptionsTemplate(waId);
      } catch (err) {
        console.error("WhatsApp search-property options template failed:", err);
      }
      return;
    }

    // existing_agent "More Options" → session list (Buy / Rent / Contact…).
    // Agents: always open menu (self-serve), even if inbox was paused.
    if (isMoreOptionsChoice(inbound)) {
      if (paused && !account.isNew && !account.isAgent) return;
      try {
        console.log(
          `WhatsApp more-options menu ******${String(waId).slice(-4)} isNew=${account.isNew} isAgent=${account.isAgent}`,
        );
        await sendWelcomeMenu(waId);
      } catch (err) {
        console.error("WhatsApp more-options menu failed:", err);
      }
      return;
    }

    // Agent self-serve More Options templates — do not block on botPaused.
    // Agent Manage Properties (More Options) → manage listings template.
    if (isManagePropertiesChoice(inbound)) {
      if (!account.isAgent) {
        console.log(
          `WhatsApp Manage Properties skipped ******${String(waId).slice(-4)} role=${account.roleName || "unknown"}`,
        );
        return;
      }
      try {
        console.log(
          `WhatsApp agent Manage Properties ******${String(waId).slice(-4)}`,
        );
        await sendAgentManagePropertiesTemplate(waId);
      } catch (err) {
        console.error("WhatsApp agent Manage Properties template failed:", err);
      }
      return;
    }

    // Agent Manage My Leads (More Options) → leads follow-up template.
    if (isManageMyLeadsChoice(inbound)) {
      if (!account.isAgent) {
        console.log(
          `WhatsApp Manage My Leads skipped ******${String(waId).slice(-4)} role=${account.roleName || "unknown"}`,
        );
        return;
      }
      try {
        console.log(
          `WhatsApp agent Manage My Leads ******${String(waId).slice(-4)}`,
        );
        await sendAgentManageLeadsTemplate(waId);
      } catch (err) {
        console.error("WhatsApp agent Manage My Leads template failed:", err);
      }
      return;
    }

    // Agent Reach Buyers & Tenants (More Options) → plan pricing template.
    if (isReachBuyersTenantsChoice(inbound)) {
      if (!account.isAgent) {
        console.log(
          `WhatsApp Reach Buyers skipped ******${String(waId).slice(-4)} role=${account.roleName || "unknown"}`,
        );
        return;
      }
      try {
        console.log(
          `WhatsApp agent Reach Buyers & Tenants ******${String(waId).slice(-4)}`,
        );
        await sendAgentReachBuyersTemplate(waId);
      } catch (err) {
        console.error("WhatsApp agent Reach Buyers template failed:", err);
      }
      return;
    }

    // Agent Get Payment Support (More Options) → payment support template.
    if (isGetPaymentSupportChoice(inbound)) {
      if (!account.isAgent) {
        console.log(
          `WhatsApp Get Payment Support skipped ******${String(waId).slice(-4)} role=${account.roleName || "unknown"}`,
        );
        return;
      }
      try {
        console.log(
          `WhatsApp agent Get Payment Support ******${String(waId).slice(-4)}`,
        );
        await sendAgentPaymentSupportTemplate(waId);
      } catch (err) {
        console.error("WhatsApp agent Get Payment Support template failed:", err);
      }
      return;
    }

    // Agent Post Property (More Options / account-created button) → plan/limit templates.
    if (isPostPropertyChoice(inbound)) {
      if (account.isAgent) {
        try {
          await handleAgentPostPropertyFlow(waId, account);
        } catch (err) {
          console.error("WhatsApp agent Post Property flow failed:", err);
        }
        return;
      }
      // Non-agents: keep a simple post link session reply.
      if (paused && !account.isNew) return;
      try {
        const content = newUserChoiceContent("post_property");
        await sendInboxTextMessage(waId, `${content.text}\n${content.url}`, {
          source: "post_property_link",
          sessionTextOnly: true,
        });
      } catch (err) {
        console.error("WhatsApp post property link failed:", err);
      }
      return;
    }

    // Realtime industry path: classify user immediately, then send Meta utility template.
    // New (not phone-verified) → registration template.
    // Existing verified + Hi/Hello → existing_agent template (not every message).
    if (account.isNew) {
      if (paused) {
        await WhatsAppConversation.updateOne(
          { waId },
          {
            $set: {
              botPaused: false,
              inboxStatus: "new",
              assignedAgentId: "",
              assignedAgentName: "",
              assignedAgentRole: "",
            },
          },
        );
      }
      try {
        console.log(
          `WhatsApp realtime new-user template ******${String(waId).slice(-4)} greeting=${greeting}`,
        );
        await sendNewUserRegistrationTemplate(waId);
      } catch (err) {
        console.error("WhatsApp new-user registration template failed:", err);
      }
      return;
    }

    if (paused) return;

    // existing_agent only for marketplace agents on Hi/Hello.
    // Owners/builders/other verified roles use other templates — do not send this one.
    if (!greeting) return;
    if (!account.isAgent) {
      console.log(
        `WhatsApp existing_agent skipped ******${String(waId).slice(-4)} role=${account.roleName || "unknown"}`,
      );
      return;
    }

    try {
      console.log(
        `WhatsApp realtime existing-agent template ******${String(waId).slice(-4)} role=${account.roleName} greeting=${greeting}`,
      );
      await sendExistingUserAgentTemplate(waId, account.name);
    } catch (err) {
      console.error("WhatsApp existing-agent template failed:", err);
    }
  } catch (err) {
    console.error("WhatsApp inbound auto-reply failed:", err);
  } finally {
    replyInFlight.delete(waId);
  }
}

/** New visitor says hi: session list, not a Meta template. */
async function maybeSendNewUserMenu(waId: string, text: string) {
  if (!waId || !isWhatsAppGreeting(text)) return false;
  if (!(await isNewWhatsAppUser(waId))) return false;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alreadySent = await WhatsAppMessage.exists({
    waId,
    direction: "outbound",
    "raw.source": "new_user_menu",
    status: { $in: ["sent", "delivered", "read"] },
    createdAt: { $gte: dayAgo },
  });
  if (alreadySent) return true;

  const listPayload = {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: NEW_USER_WELCOME },
      action: {
        button: "See options",
        sections: [{ title: "Explore", rows: NEW_USER_ROWS }],
      },
    },
  };

  try {
    await sendInboxSessionPayload(waId, NEW_USER_WELCOME, listPayload, "new_user_menu");
  } catch (err) {
    console.error("WhatsApp new-user menu list failed, sending session text:", err);
    const fallback = `${NEW_USER_WELCOME}\n\n1. Create Account\n2. Buy a Property\n3. Rent a Property\n4. Post a Property`;
    await sendInboxTextMessage(waId, fallback, {
      source: "new_user_menu",
      sessionTextOnly: true,
    });
  }
  console.log(`WhatsApp new-user menu sent to ******${String(waId).slice(-4)}`);
  return true;
}

/** New visitor picks a menu row: session link, not a Meta template. */
async function maybeReplyNewUserChoice(waId: string, choice: NewUserChoice) {
  if (!waId) return false;

  const content = newUserChoiceContent(choice);
  const linkLine = `Click here:\n${content.url}`;
  const ctaPayload = {
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: content.text },
      action: {
        name: "cta_url",
        parameters: {
          display_text: "Click here",
          url: content.url,
        },
      },
    },
  };

  try {
    await sendInboxSessionPayload(
      waId,
      `${content.text}\n\n${linkLine}`,
      ctaPayload,
      "new_user_choice",
    );
  } catch (err) {
    console.error("WhatsApp new-user link button failed, sending session text:", err);
    await sendInboxTextMessage(waId, `${content.text}\n\n${linkLine}`, {
      source: "new_user_choice",
      sessionTextOnly: true,
    });
  }
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
  /** Chats assigned to any of these staff ids (a lead and their reports). */
  assignedAgentIds?: string[];
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
  const assignedAgentIds = (params?.assignedAgentIds || [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  if (assignedAgentIds.length) {
    filter.assignedAgentId = { $in: assignedAgentIds };
  } else if (onlyAssignedTo) {
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
  const query: Record<string, unknown> = {
    conversationId: conversation._id,
    wamid: { $not: /^log:/ },
    "raw.fromLog": { $ne: true },
  };
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

/** Proxy Meta media for inbox image/document/video/audio bubbles. */
export async function getInboxMessageMedia(waIdRaw: string, messageIdRaw: string) {
  const waId = normalizeWaId(waIdRaw);
  const messageId = String(messageIdRaw || "").trim();
  if (!waId || !messageId) throw new Error("Invalid media request");
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    throw new Error("Invalid message id");
  }

  const message = await WhatsAppMessage.findOne({
    _id: new mongoose.Types.ObjectId(messageId),
    waId,
  }).lean();
  if (!message) throw new Error("Message not found");

  const raw = (message.raw || {}) as Record<string, any>;
  const type = String(message.type || raw.type || "").toLowerCase();
  const mediaBlock =
    (type && raw?.[type]) ||
    raw?.image ||
    raw?.document ||
    raw?.video ||
    raw?.audio ||
    raw?.sticker ||
    null;
  const mediaId = String(mediaBlock?.id || "").trim();
  if (!mediaId) throw new Error("No media on this message");

  const { token } = getCredentials();
  if (!token) throw new Error("WhatsApp credentials are missing");

  try {
    const meta = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20000,
      },
    );
    const downloadUrl = String(meta?.data?.url || "").trim();
    const mimeType = String(
      meta?.data?.mime_type ||
        mediaBlock?.mime_type ||
        "application/octet-stream",
    ).trim();
    if (!downloadUrl) throw new Error("Meta media URL missing");

    const file = await axios.get(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
      timeout: 60000,
    });

    return {
      buffer: Buffer.from(file.data),
      mimeType,
      filename:
        String(mediaBlock?.filename || "").trim() ||
        `${type || "media"}-${mediaId}`,
    };
  } catch (err: any) {
    const metaMessage =
      err?.response?.data?.error?.message ||
      err?.message ||
      "Failed to download WhatsApp media";
    throw new Error(metaMessage);
  }
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

/** Session interactive reply (list or link button). Never falls back to a template. */
async function sendInboxSessionPayload(
  waIdRaw: string,
  inboxBody: string,
  payload: Record<string, unknown>,
  source: string,
) {
  const waId = normalizeWaId(waIdRaw);
  const text = String(inboxBody || "").trim();
  if (!waId) throw new Error("Recipient phone is required");
  if (!text) throw new Error("Message text is required");

  const { token, phoneNumberId } = getCredentials();
  if (!token || !phoneNumberId) {
    throw new Error(
      "WhatsApp credentials are missing (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)",
    );
  }

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
  if (!withinCareWindow) {
    throw new Error("WhatsApp session reply is only available inside the 24-hour window");
  }

  const conversation = await upsertConversation({
    waId,
    preview: previewFromBody(text),
    direction: "outbound",
  });
  await WhatsAppConversation.updateOne(
    { _id: conversation._id },
    { $set: { origin: "cloud" } },
  );

  const pending = await WhatsAppMessage.create({
    conversationId: conversation._id,
    waId,
    direction: "outbound",
    type: "interactive",
    body: text,
    status: "pending",
    raw: { source, withinCareWindow, sessionTextOnly: true },
  });

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: waId,
        ...payload,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );
    pending.wamid = response.data?.messages?.[0]?.id;
    pending.status = "sent";
    pending.raw = {
      ...response.data,
      source,
      sendMode: "interactive",
      sessionTextOnly: true,
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
    pending.status = "failed";
    pending.error =
      err?.response?.data?.error?.message ||
      err?.message ||
      "Failed to send WhatsApp message";
    pending.raw = {
      ...(err?.response?.data || {}),
      source,
      sessionTextOnly: true,
    };
    await pending.save();
    throw err;
  }
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

const INBOX_MEDIA_MIME: Record<string, "image" | "document" | "video" | "audio"> = {
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/pdf": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "text/plain": "document",
  "text/csv": "document",
  "application/csv": "document",
  "video/mp4": "video",
  "video/3gpp": "video",
  "audio/aac": "audio",
  "audio/mp4": "audio",
  "audio/mpeg": "audio",
  "audio/amr": "audio",
  "audio/ogg": "audio",
};

function resolveInboxMediaKind(mimeTypeRaw: string, fileNameRaw: string) {
  const mime = String(mimeTypeRaw || "").trim().toLowerCase();
  const name = String(fileNameRaw || "").trim().toLowerCase();
  if (INBOX_MEDIA_MIME[mime]) return INBOX_MEDIA_MIME[mime];
  if (mime.startsWith("image/")) return "image" as const;
  if (mime.startsWith("video/")) return "video" as const;
  if (mime.startsWith("audio/")) return "audio" as const;
  if (
    name.endsWith(".pdf") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".txt") ||
    name.endsWith(".csv")
  ) {
    return "document" as const;
  }
  return null;
}

async function uploadInboxBinaryToWhatsApp(opts: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}) {
  const { token, phoneNumberId } = getCredentials();
  if (!token || !phoneNumberId) {
    throw new Error(
      "WhatsApp credentials are missing (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)",
    );
  }
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", opts.mimeType);
  form.append(
    "file",
    new Blob([new Uint8Array(opts.buffer)], { type: opts.mimeType }),
    opts.fileName || "upload.bin",
  );
  const res = await axios.post(
    `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/media`,
    form,
    {
      headers: { Authorization: `Bearer ${token}` },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000,
    },
  );
  const id = String(res.data?.id || "").trim();
  if (!id) throw new Error("Meta media upload did not return an id");
  return id;
}

/** Staff/agent image or document reply inside the 24h customer-care window. */
export async function sendInboxMediaMessage(params: {
  waIdRaw: string;
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  caption?: string;
}) {
  const waId = normalizeWaId(params.waIdRaw);
  if (!waId) throw new Error("Recipient phone is required");
  if (!params.buffer?.length) throw new Error("File is required");

  const mimeType = String(params.mimeType || "application/octet-stream").trim();
  const fileName = String(params.fileName || "attachment").trim() || "attachment";
  const caption = String(params.caption || "").trim().slice(0, 1024);
  const kind = resolveInboxMediaKind(mimeType, fileName);
  if (!kind) {
    throw new Error(
      "Unsupported file type. Upload an image (JPG/PNG/WEBP), PDF/DOC, or MP4 video.",
    );
  }

  const maxBytes =
    kind === "image" ? 5 * 1024 * 1024 : kind === "video" ? 16 * 1024 * 1024 : 20 * 1024 * 1024;
  if (params.buffer.length > maxBytes) {
    throw new Error(
      `File is too large. Max ${Math.round(maxBytes / (1024 * 1024))}MB for ${kind}.`,
    );
  }

  const { token, phoneNumberId } = getCredentials();
  if (!token || !phoneNumberId) {
    throw new Error(
      "WhatsApp credentials are missing (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)",
    );
  }

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
  if (!withinCareWindow) {
    throw new Error(
      "Image/document replies are only available inside the 24-hour WhatsApp window",
    );
  }

  const mediaId = await uploadInboxBinaryToWhatsApp({
    buffer: params.buffer,
    mimeType,
    fileName,
  });

  const preview =
    caption ||
    (kind === "image"
      ? "[Image]"
      : kind === "video"
        ? "[Video]"
        : kind === "audio"
          ? "[Audio]"
          : fileName || "[Document]");

  const conversation = await upsertConversation({
    waId,
    preview: previewFromBody(preview),
    direction: "outbound",
  });
  await WhatsAppConversation.updateOne(
    { _id: conversation._id },
    { $set: { origin: "cloud" } },
  );

  const pending = await WhatsAppMessage.create({
    conversationId: conversation._id,
    waId,
    direction: "outbound",
    type: kind,
    body: preview,
    status: "pending",
    raw: {
      source: "dashboard_cloud_api",
      withinCareWindow: true,
      [kind]: {
        id: mediaId,
        mime_type: mimeType,
        ...(kind === "document" ? { filename: fileName } : {}),
        ...(caption ? { caption } : {}),
      },
    },
  });

  try {
    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: waId,
      type: kind,
      [kind]: {
        id: mediaId,
        ...(caption && (kind === "image" || kind === "video" || kind === "document")
          ? { caption }
          : {}),
        ...(kind === "document" ? { filename: fileName } : {}),
      },
    };
    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );
    pending.wamid = response.data?.messages?.[0]?.id;
    pending.status = "sent";
    pending.raw = {
      ...(pending.raw as object),
      response: response.data,
      sendMode: kind,
      source: "dashboard_cloud_api",
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
    pending.status = "failed";
    pending.error =
      err?.response?.data?.error?.message ||
      err?.message ||
      "Failed to send WhatsApp media";
    pending.raw = {
      ...(pending.raw as object),
      ...(err?.response?.data || {}),
      source: "dashboard_cloud_api",
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
    botPaused?: boolean;
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
  if (typeof patch.botPaused === "boolean") {
    $set.botPaused = patch.botPaused;
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
