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
    const button = message?.interactive?.button_reply;
    const listReply = message?.interactive?.list_reply;
    const buttonId = String(button?.id || "");
    const buttonTitle = String(button?.title || "");
    const listId = String(listReply?.id || "");
    const listTitle = String(listReply?.title || "");
    return {
      type,
      body: String(buttonId || buttonTitle || listId || listTitle || "[Interactive]"),
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
    { projection: { phoneVerified: 1, name: 1, city: 1, state: 1 } },
  );
}

async function findWhatsAppAccount(waId: string) {
  if (mongoose.connection.readyState !== 1) {
    console.error("WhatsApp welcome skipped the account lookup: database is not connected");
    return { isNew: false, name: "", city: "", state: "" };
  }
  const user = await findUserByWhatsAppPhone(waId);
  const isNew = user?.phoneVerified !== true;
  let name = String(user?.name || "").trim();
  if (!isNew && !name) {
    const conversation = await WhatsAppConversation.findOne({ waId }).select("profileName").lean();
    name = String(conversation?.profileName || "").trim();
  }
  return {
    isNew,
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

async function openingOptions(includeCreateAccount: boolean) {
  return withChatOptions("What would you like to do?", CHAT_OPENING_OPTIONS, includeCreateAccount);
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
    await openingOptions(account.isNew),
    account.isNew ? "new_user_welcome" : "existing_user_welcome",
  );
}

async function replyToInboundMessage(waId: string, text: string) {
  if (replyInFlight.has(waId)) return;
  replyInFlight.add(waId);
  try {
    if (await isBotPaused(waId)) return;
    const inbound = chatbotMessageFromInbound(text);
    if (inbound.kind === "chat" && isWhatsAppGreeting(inbound.text)) {
      await sendWelcomeMenu(waId);
      return;
    }
    if (inbound.kind === "agent") {
      await handOffToAgent(waId);
      return;
    }
    if (inbound.kind === "chat" && !inbound.text) return;
    if (inbound.kind === "account") {
      await maybeReplyNewUserChoice(waId, "create_account");
      return;
    }
    if (inbound.kind === "post") {
      await maybeReplyNewUserChoice(waId, "post_property");
      return;
    }
    try {
      await sendChatbotReply(waId, inbound.text);
    } catch (err) {
      console.error("WhatsApp property chat failed, sending the opening list:", err);
      await sendWelcomeMenu(waId);
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
