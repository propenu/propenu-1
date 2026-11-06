import axios from "axios";
import { Request, Response } from "express";
import { Types } from "mongoose";

import {
  whatsappQueue,
  addWhatsAppJobWithTimeout,
  addWhatsAppJobsWithTimeout,
} from "../../../services/user-service/src/queues";
import User from "../../../services/user-service/src/models/userModel";
import Role from "../../../services/user-service/src/models/roleModel";
import Residential from "../../../services/user-service/src/models/residentialModel";
import Commercial from "../../../services/user-service/src/models/commercialModel";
import LandPlot from "../../../services/user-service/src/models/landModel";
import Agricultural from "../../../services/user-service/src/models/agriculturalModel";
import { WhatsAppLog } from "../../../services/user-service/src/logs/whatsappLog.model";
import { WhatsAppCampaignRun } from "../../../services/user-service/src/logs/whatsappCampaignRun.model";

const TOKEN =
  "EAAXhIccvVfgBQvEc8BR5zh8DSyeEfvY9ZCoQHrIG7a8zRBHkN2kfKuUHujlpo31J1oZBfwCNM9DlXpXhQuoubdcAhLmhahYj2LdgQ8iTYytWMK6HMghwHZCxaNSLEhZBrvD3r9ZA6ZCRnJmStnLhoflMLt2szXvyW3fmC507UKfLFX3RCvSbFpAjYut2Avw1rQUgZDZD";
const BUSINESS_ID = "1519313212465013";
const PHONE_ID = "935750846293139";



export interface WhatsAppCarouselCardInput {
  imageUrl: string;
  title: string;
  details: string;
  /** Slug only. The template URL is already https://propenu.com/properties/{{1}} */
  buttonSuffix: string;
}

interface SendWhatsAppInput {
  to: string;
  templateName: string;
  variables: string[];
  language?: string;
  /** Public HTTPS URL (S3/CDN). Do not pass Meta scontent sample URLs as link. */
  headerImageUrl?: string;
  /** Preferred for IMAGE/VIDEO/DOCUMENT headers — from POST /{phone-number-id}/media */
  headerMediaId?: string;
  /** IMAGE | VIDEO | DOCUMENT — avoids Meta template list fetch per message */
  headerFormat?: string;
  /** One entry per listing. carousel_for_flow has 10 cards; fewer listings are repeated to fill every card. */
  carouselCards?: WhatsAppCarouselCardInput[];
}

function resolveMetaAuth() {
  return {
    token: process.env.WHATSAPP_TOKEN || TOKEN,
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || PHONE_ID,
    businessId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || BUSINESS_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION || "v19.0",
  };
}

function templateLanguageCode(template: any, fallback = "en"): string {
  const raw = template?.language;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw?.code) return String(raw.code).trim();
  return fallback;
}

function alignVariables(variables: string[] = [], count: number): string[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const v = variables[i];
    const text = v != null ? String(v).trim() : "";
    return text || `Customer`;
  });
}

async function resolveTemplateForSend(templateName: string) {
  const templatesRes = await getTemplatesService();
  const templates = templatesRes?.data || [];
  const template = templates.find(
    (t: any) =>
      String(t.name || "")
        .toLowerCase()
        .trim() === String(templateName).toLowerCase().trim(),
  );
  if (!template) {
    throw new Error(
      `Template "${templateName}" was not found on Meta. Check the name in WhatsApp Manager.`,
    );
  }
  const status = String(template.status || "").toUpperCase();
  if (status && status !== "APPROVED") {
    throw new Error(
      `Template "${template.name}" is ${status}. Only APPROVED templates can be sent.`,
    );
  }
  return template;
}

// CREATE TEMPLATE
export const createTemplateService = async (data: any) => {
  const { token, businessId, apiVersion } = resolveMetaAuth();
  const res = await axios.post(
    `https://graph.facebook.com/${apiVersion}/${businessId}/message_templates`,
    data,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  return res.data;
};

// GET ALL TEMPLATES
export const getTemplatesService = async () => {
  const { token, businessId, apiVersion } = resolveMetaAuth();
  const res = await axios.get(
    `https://graph.facebook.com/${apiVersion}/${businessId}/message_templates`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        fields: "name,status,category,language,components",
        limit: 250,
      },
      timeout: 20000,
    },
  );
  return res.data;
};

// DELETE TEMPLATE
export const deleteTemplateService = async (name: string) => {
  const { token, businessId, apiVersion } = resolveMetaAuth();
  const res = await axios.delete(
    `https://graph.facebook.com/${apiVersion}/${businessId}/message_templates`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: { name },
      timeout: 20000,
    },
  );

  return res.data;
};

const getVariableCount = (text: string): number => {
  const matches = text.match(/{{\d+}}/g);
  return matches ? matches.length : 0;
};

export function parseWhatsAppCarouselCards(raw: unknown): WhatsAppCarouselCardInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any) => {
      const suffixSource = String(
        item?.buttonSuffix || item?.slug || item?.url || "",
      ).trim();
      const fromPath = suffixSource.match(/properties\/([^/?#]+)/i);
      return {
        imageUrl: String(item?.imageUrl || item?.image || "").trim(),
        title: String(item?.title || "").trim(),
        details: String(item?.details || item?.subtitle || "").trim(),
        buttonSuffix:
          decodeURIComponent(fromPath?.[1] || suffixSource)
            .replace(/^\/+/, "")
            .split(/[?#]/)[0] || "listing",
      };
    })
    .filter((card) => card.imageUrl.startsWith("http") && card.title);
}

function listingImageUrl(item: any): string {
  const candidates = [
    item?.heroImage,
    item?.coverImage,
    item?.gallerySummary?.[0]?.url,
    item?.gallery?.[0]?.url,
    item?.gallery?.[0],
    item?.images?.[0]?.url,
    item?.images?.[0],
  ];
  for (const value of candidates) {
    const url = typeof value === "string" ? value : value?.url;
    if (typeof url === "string" && /^https?:\/\//i.test(url)) return url.trim();
  }
  return "";
}

function listingPriceLabel(amount: unknown): string {
  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 10000000) {
    const crore = value / 10000000;
    return `from ${crore >= 10 ? Math.round(crore) : crore.toFixed(1).replace(/\.0$/, "")} Cr`;
  }
  if (value >= 100000) return `from ${Math.round(value / 100000)} L`;
  return `from ${Math.round(value)}`;
}

/** Used when the send screen does not pass carouselCards.
 * Button URLs on carousel_for_flow are https://propenu.com/properties/{{1}},
 * so the suffix is the site path after /properties/.
 */
export async function loadDefaultCarouselCards(): Promise<WhatsAppCarouselCardInput[]> {
  const listingQuery = (Model: any) =>
    Model.find({ status: "active" })
      .select("title slug city locality price priceFrom bhk bedrooms gallery")
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();

  const [homes, shops, plots, farms] = await Promise.all([
    listingQuery(Residential),
    listingQuery(Commercial),
    listingQuery(LandPlot),
    listingQuery(Agricultural),
  ]);
  const groups: Array<{ path: string; rows: any[] }> = [
    { path: "residential", rows: homes },
    { path: "commercial", rows: shops },
    { path: "land", rows: plots },
    { path: "agricultural", rows: farms },
  ];

  const cards: WhatsAppCarouselCardInput[] = [];
  for (const group of groups) {
    for (const item of group.rows) {
      const imageUrl = listingImageUrl(item);
      const slug = String(item?.slug || "").trim();
      const title = String(item?.title || "").trim();
      if (!imageUrl || !slug || !title) continue;
      const bhk = item?.bhk
        ? `${item.bhk}BHK`
        : item?.bedrooms
          ? `${item.bedrooms}BHK`
          : "";
      const place = [item?.locality, item?.city].filter(Boolean).join(", ");
      const details = [bhk, listingPriceLabel(item?.priceFrom || item?.price), place]
        .filter(Boolean)
        .join(" · ");
      cards.push({
        imageUrl,
        title,
        details: details || "View details on Propenu",
        buttonSuffix: `${group.path}/${slug}`,
      });
      if (cards.length >= 10) return cards;
    }
  }
  return cards;
}

export async function resolveCarouselCards(template: any, raw: unknown) {
  const parsed = parseWhatsAppCarouselCards(raw);
  if (!templateCarousel(template)) return parsed;
  if (parsed.length) return parsed;
  return loadDefaultCarouselCards();
}

function metaParamText(value: string, fallback: string): string {
  const text = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  return (text || fallback).slice(0, 200);
}

function templateCarousel(template: any) {
  return (template?.components || []).find(
    (component: any) => String(component.type || "").toUpperCase() === "CAROUSEL",
  );
}

async function buildCarouselSendComponent(
  template: any,
  cards: WhatsAppCarouselCardInput[],
) {
  const carousel = templateCarousel(template);
  const templateCards = carousel?.cards || [];
  if (!templateCards.length) return null;
  if (!cards.length) {
    throw new Error(
      `Template "${template.name}" is a carousel. Send carouselCards with imageUrl, title, details, and buttonSuffix for each project or property.`,
    );
  }

  const mediaCache = new Map<string, { id?: string; link?: string }>();
  const sentCards = [];

  for (let index = 0; index < templateCards.length; index += 1) {
    const spec = templateCards[index];
    const card = cards[index % cards.length];
    if (!spec || !card) continue;
    const components: any[] = [];
    const header = (spec.components || []).find(
      (component: any) => String(component.type || "").toUpperCase() === "HEADER",
    );
    const format = String(header?.format || "").toUpperCase();
    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) {
      const cacheKey = `${format}:${card.imageUrl}`;
      let prepared = mediaCache.get(cacheKey);
      if (!prepared) {
        prepared = await prepareHeaderMediaForSend({
          format,
          url: card.imageUrl,
        });
        mediaCache.set(cacheKey, prepared);
      }
      const mediaKey = format.toLowerCase();
      components.push({
        type: "header",
        parameters: [
          {
            type: mediaKey,
            [mediaKey]: prepared.id ? { id: prepared.id } : { link: prepared.link },
          },
        ],
      });
    }

    const body = (spec.components || []).find(
      (component: any) => String(component.type || "").toUpperCase() === "BODY",
    );
    const bodyValues = alignVariables(
      [
        metaParamText(card.title, "Property"),
        metaParamText(card.details, "View details on Propenu"),
      ],
      getVariableCount(body?.text || ""),
    );
    if (bodyValues.length) {
      components.push({
        type: "body",
        parameters: bodyValues.map((text) => ({ type: "text", text })),
      });
    }

    const buttonWrap = (spec.components || []).find(
      (component: any) => String(component.type || "").toUpperCase() === "BUTTONS",
    );
    (buttonWrap?.buttons || []).forEach((button: any, buttonIndex: number) => {
      if (String(button.type || "").toUpperCase() !== "URL") return;
      if (!String(button.url || "").includes("{{")) return;
      components.push({
        type: "button",
        sub_type: "url",
        index: String(buttonIndex),
        parameters: [
          {
            type: "text",
            text: metaParamText(card.buttonSuffix, "listing"),
          },
        ],
      });
    });

    sentCards.push({ card_index: index, components });
  }

  return { type: "carousel", cards: sentCards };
}

function resolveHeaderFormat(template: any): string {
  const header = (template?.components || []).find(
    (c: any) => String(c.type || "").toUpperCase() === "HEADER",
  );
  return String(header?.format || "").toUpperCase();
}

/**
 * Meta stores the create-time sample as example.header_handle.
 * On GET templates that is often an https://scontent.whatsapp.net preview URL —
 * good for UI preview, NOT valid as Messages API image.link (Meta returns 131053/403).
 */
export function resolveTemplateHeaderMediaUrl(template: any): string {
  const header = (template?.components || []).find(
    (c: any) => String(c.type || "").toUpperCase() === "HEADER",
  );
  if (!header) return "";
  const candidates = [
    header?.example?.header_handle?.[0],
    header?.example?.header_url?.[0],
    header?.example?.header_handle,
    header?.example?.header_url,
  ];
  for (const raw of candidates) {
    const url = String(raw || "").trim();
    if (/^https?:\/\//i.test(url)) return url;
  }
  return "";
}

function isMetaHostedMediaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.includes("scontent") ||
      host.includes("lookaside.fbsbx.com") ||
      host.includes("fbcdn.net") ||
      host.endsWith("whatsapp.net")
    );
  } catch {
    return false;
  }
}

function mimeForHeaderFormat(format: string, detected?: string): string {
  const d = String((detected || "").split(";")[0] || "")
    .trim()
    .toLowerCase();
  if (d.startsWith("image/") || d.startsWith("video/") || d.startsWith("application/")) {
    return d;
  }
  const f = String(format || "").toUpperCase();
  if (f === "VIDEO") return "video/mp4";
  if (f === "DOCUMENT") return "application/pdf";
  return "image/jpeg";
}

function fileNameForMime(mime: string, format: string): string {
  if (mime.includes("png")) return "header.png";
  if (mime.includes("webp")) return "header.webp";
  if (mime.includes("mp4")) return "header.mp4";
  if (mime.includes("pdf")) return "header.pdf";
  const f = String(format || "").toUpperCase();
  if (f === "VIDEO") return "header.mp4";
  if (f === "DOCUMENT") return "header.pdf";
  return "header.jpg";
}

async function downloadMediaBytes(
  url: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const { token } = resolveMetaAuth();
  const headers: Record<string, string> = {
    "User-Agent": "PropenuWhatsAppCampaign/1.0",
  };
  // Meta CDN sample URLs usually require the Graph access token.
  if (isMetaHostedMediaUrl(url) && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers,
    timeout: 60000,
    maxRedirects: 5,
  });

  const mimeType = mimeForHeaderFormat(
    "IMAGE",
    String(res.headers["content-type"] || ""),
  );
  return { buffer: Buffer.from(res.data), mimeType };
}

/** Upload binary to WhatsApp Cloud Media API → media id for template header send. */
async function uploadMediaToWhatsApp(opts: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<string> {
  const { token, phoneId, apiVersion } = resolveMetaAuth();
  if (!token || !phoneId) {
    throw new Error("WhatsApp credentials missing for media upload");
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", opts.mimeType);
  form.append(
    "file",
    new Blob([new Uint8Array(opts.buffer)], { type: opts.mimeType }),
    opts.fileName,
  );

  const res = await axios.post(
    `https://graph.facebook.com/${apiVersion}/${phoneId}/media`,
    form,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000,
    },
  );

  const id = String(res.data?.id || "").trim();
  if (!id) {
    throw new Error("Meta media upload did not return an id");
  }
  return id;
}

/**
 * Meta cannot fetch scontent/lookaside sample URLs as image.link.
 * Re-upload those to Cloud Media API and send with media id instead.
 */
async function prepareHeaderMediaForSend(opts: {
  format: string;
  url?: string;
  mediaId?: string;
}): Promise<{ link?: string; id?: string }> {
  const existingId = String(opts.mediaId || "").trim();
  if (existingId) return { id: existingId };

  const url = String(opts.url || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(
      `This template needs a public ${opts.format} URL or Meta media id for the header.`,
    );
  }

  if (!isMetaHostedMediaUrl(url)) {
    return { link: url };
  }

  console.log(
    "🔄 Template sample is Meta CDN — uploading to WhatsApp Media API for send…",
  );
  const { buffer, mimeType } = await downloadMediaBytes(url);
  const mime = mimeForHeaderFormat(opts.format, mimeType);
  const id = await uploadMediaToWhatsApp({
    buffer,
    mimeType: mime,
    fileName: fileNameForMime(mime, opts.format),
  });
  console.log("✅ WhatsApp media id ready:", id);
  return { id };
}

/**
 * Shared by CRM + CSV campaigns: use upload/paste URL, else Meta create-time sample,
 * then convert Meta CDN samples to media id before queueing.
 */
export async function resolveCampaignHeaderMedia(opts: {
  template: any;
  requestedUrl?: string;
}): Promise<{
  format: string;
  sourceUrl: string;
  headerImageUrl?: string;
  headerMediaId?: string;
}> {
  const format = resolveHeaderFormat(opts.template);
  if (!["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) {
    return { format, sourceUrl: "" };
  }

  const requested = String(opts.requestedUrl || "").trim();
  const sourceUrl =
    (requested.startsWith("http") ? requested : "") ||
    resolveTemplateHeaderMediaUrl(opts.template);

  if (!sourceUrl.startsWith("http")) {
    throw new Error(
      `Template "${opts.template?.name || ""}" requires a public ${format} header URL. Meta sample is missing — upload or paste an S3/CDN image.`,
    );
  }

  const prepared = await prepareHeaderMediaForSend({
    format,
    url: sourceUrl,
  });

  if (prepared.id) {
    return {
      format,
      sourceUrl,
      headerMediaId: prepared.id,
      headerImageUrl: sourceUrl,
    };
  }

  return {
    format,
    sourceUrl,
    headerImageUrl: prepared.link || sourceUrl,
  };
}

/** Build body vars from user profile in stable order matching {{1}}, {{2}}, … */
function buildCampaignVariables(
  user: {
    name?: string;
    city?: string;
    state?: string;
    locality?: string;
    email?: string;
  },
  variableCount: number,
): string[] {
  if (variableCount <= 0) return [];
  const pool = [
    user.name || "User",
    user.city || "",
    user.state || "",
    user.locality || "",
    user.email || "",
  ];
  return Array.from({ length: variableCount }, (_, i) => {
    const text = String(pool[i] ?? "").trim();
    return text || "Customer";
  });
}

export const sendWhatsAppCampaignDynamic = async (
  req: Request,
  res: Response,
) => {
  try {
    const { v4: uuidv4 } = await import("uuid");
    const campaignId = uuidv4();
    const {
      templateName,
      city,
      state,
      locality,
      roleId,
      roleName,
      module: moduleId,
      recipientField,
      headerImageUrl: headerImageUrlRaw,
    } = req.body;

    if (!templateName) {
      return res.status(400).json({
        success: false,
        message: "templateName is required",
      });
    }

    const requestedHeaderImageUrl = String(headerImageUrlRaw || "").trim();

    // 1) Validate template with Meta (fast fail before accept)
    let templatesRes: any;
    try {
      templatesRes = await getTemplatesService();
    } catch (metaErr: any) {
      console.error("❌ Meta templates fetch failed:", metaErr?.message);
      return res.status(502).json({
        success: false,
        message:
          "Could not load WhatsApp templates from Meta. Check WhatsApp credentials / network.",
        error: metaErr?.message,
      });
    }

    const templates = templatesRes?.data || [];
    const template = templates.find(
      (t: any) =>
        t.name?.toLowerCase().trim() ===
        String(templateName).toLowerCase().trim(),
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: `Template "${templateName}" not found on Meta`,
      });
    }

    const status = String(template.status || "").toUpperCase();
    if (status && status !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: `Template "${template.name}" is ${status}. Only APPROVED templates can be sent.`,
      });
    }

    const headerFormat = resolveHeaderFormat(template);
    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat)) {
      const hasSample =
        resolveTemplateHeaderMediaUrl(template).startsWith("http") ||
        requestedHeaderImageUrl.startsWith("http");
      if (!hasSample) {
        return res.status(400).json({
          success: false,
          message: `This template needs a public ${headerFormat} URL. Meta sample is missing — upload/paste a campaign image, then send.`,
        });
      }
    }

    const carouselCards = await resolveCarouselCards(template, req.body?.carouselCards);
    if (templateCarousel(template) && !carouselCards.length) {
      return res.status(400).json({
        success: false,
        message:
          "This carousel template needs active projects or properties with a public photo. None were found.",
      });
    }

    const bodyComponent = template.components?.find(
      (c: any) => String(c.type || "").toUpperCase() === "BODY",
    );
    const variableCount = getVariableCount(bodyComponent?.text || "");

    const MODULE_ROLE: Record<string, string> = {
      users: "user",
      agents: "agent",
      builders: "builder",
      builder_staff: "builder_staff",
    };
    const resolvedRoleName = String(
      roleName || MODULE_ROLE[String(moduleId || "").trim()] || "",
    )
      .trim()
      .toLowerCase();

    const filter: any = {
      phone: { $exists: true, $nin: [null, ""] },
      isActive: { $ne: false },
    };

    const escapeRegex = (value: string) =>
      String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exactCi = (value: unknown) => {
      const v = String(value || "").trim();
      return v ? new RegExp(`^${escapeRegex(v)}$`, "i") : null;
    };
    const stateRx = exactCi(state);
    const cityRx = exactCi(city);
    const localityRx = exactCi(locality);
    if (stateRx) filter.state = stateRx;
    if (cityRx) filter.city = cityRx;
    if (localityRx) filter.locality = localityRx;

    if (roleId && Types.ObjectId.isValid(roleId)) {
      filter.roleId = new Types.ObjectId(roleId);
    } else if (resolvedRoleName) {
      const roleDoc = await Role.findOne({ name: resolvedRoleName })
        .select("_id")
        .lean();
      if (roleDoc?._id) {
        filter.roleId = roleDoc._id;
      }
    }

    const estimatedRecipients = await User.countDocuments(filter);
    if (estimatedRecipients === 0) {
      return res.status(404).json({
        success: false,
        message: "No recipients found for this location filter.",
        campaignId,
      });
    }

    const phoneKey = String(recipientField || "phone").trim() || "phone";
    const language =
      typeof template.language === "string"
        ? template.language
        : template.language?.code || "en";

    // Serializable filter for Redis (RegExp → pattern string)
    const serializableFilter: Record<string, unknown> = {
      phone: { $exists: true, $nin: [null, ""] },
      isActive: { $ne: false },
    };
    if (String(state || "").trim()) {
      serializableFilter.state = {
        $regex: `^${escapeRegex(String(state).trim())}$`,
        $options: "i",
      };
    }
    if (String(city || "").trim()) {
      serializableFilter.city = {
        $regex: `^${escapeRegex(String(city).trim())}$`,
        $options: "i",
      };
    }
    if (String(locality || "").trim()) {
      serializableFilter.locality = {
        $regex: `^${escapeRegex(String(locality).trim())}$`,
        $options: "i",
      };
    }
    if (filter.roleId) {
      serializableFilter.roleId = String(filter.roleId);
    }

    await WhatsAppCampaignRun.create({
      campaignId,
      source: "crm",
      templateName: template.name || templateName,
      status: "accepted",
      estimatedRecipients,
      filter: serializableFilter,
      headerImageUrl: requestedHeaderImageUrl || undefined,
    });

    try {
      await addWhatsAppJobWithTimeout(
        "fanout-crm-campaign",
        {
          campaignId,
          templateName: template.name || templateName,
          language,
          variableCount,
          phoneKey,
          filter: serializableFilter,
          ...(requestedHeaderImageUrl
            ? { requestedHeaderImageUrl }
            : {}),
          ...(carouselCards.length ? { carouselCards } : {}),
        },
        {
          attempts: 2,
          backoff: { type: "exponential", delay: 8000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );
    } catch (queueErr: any) {
      await WhatsAppCampaignRun.findOneAndUpdate(
        { campaignId },
        {
          status: "failed",
          error:
            queueErr?.message ||
            "Could not queue campaign (is Redis running?)",
        },
      ).catch(() => undefined);
      return res.status(503).json({
        success: false,
        message:
          "Could not accept WhatsApp campaign. Check that Redis is running.",
        error: queueErr?.message,
        campaignId,
      });
    }

    // Industry standard: accept immediately; fan-out + Meta send happen async
    return res.status(202).json({
      success: true,
      accepted: true,
      status: "accepted",
      campaignId,
      estimatedRecipients,
      templateName: template.name || templateName,
      message: `Campaign accepted for ~${estimatedRecipients} recipient(s). Messages are being queued in the background.`,
    });
  } catch (error: any) {
    console.error("❌ WhatsApp Campaign Error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "WhatsApp campaign failed",
    });
  }
};

/** Queue an approved template for selected existing users at a future time. */
export const scheduleWhatsAppUsers = async (req: Request, res: Response) => {
  try {
    const {
      userIds: rawUserIds,
      audience: rawAudience,
      dryRun: rawDryRun,
      templateName: rawTemplateName,
      scheduledAt: rawScheduledAt,
      headerImageUrl: rawHeaderImageUrl,
    } = req.body || {};
    const templateName = String(rawTemplateName || "").trim();
    const scheduledAt = new Date(String(rawScheduledAt || ""));
    const userIds = Array.isArray(rawUserIds)
      ? [...new Set(rawUserIds.map((id: unknown) => String(id).trim()).filter(Boolean))]
      : [];
    const audience = String(rawAudience || "").trim();
    const dryRun = rawDryRun === true;

    if (!templateName && !dryRun) {
      return res
        .status(400)
        .json({ success: false, message: "templateName is required" });
    }
    const isAutomaticAudience =
      audience === "whatsapp_opted_in" || (audience === "verified_phones" && dryRun);
    if (!isAutomaticAudience && (!userIds.length || userIds.length > 1000)) {
      return res.status(400).json({
        success: false,
        message: 'Provide between 1 and 1000 userIds, or use an allowed automatic audience',
      });
    }
    if (
      audience &&
      audience !== "whatsapp_opted_in" &&
      !(audience === "verified_phones" && dryRun)
    ) {
      return res.status(400).json({
        success: false,
        message: 'audience must be "whatsapp_opted_in"; "verified_phones" is preview-only',
      });
    }
    if (audience === "verified_phones" && !dryRun) {
      return res.status(400).json({
        success: false,
        message: '"verified_phones" is available only when dryRun is true',
      });
    }
    if (audience && userIds.length) {
      return res.status(400).json({
        success: false,
        message: "Provide either userIds or audience, not both",
      });
    }
    if (userIds.some((id: string) => !Types.ObjectId.isValid(id))) {
      return res
        .status(400)
        .json({ success: false, message: "Every userId must be a valid user ID" });
    }
    if (dryRun) {
      const previewQuery: Record<string, any> = {
        phone: { $exists: true, $nin: [null, ""] },
        isActive: { $ne: false },
      };
      if (audience === "whatsapp_opted_in") {
        previewQuery.whatsappMarketingOptIn = true;
        previewQuery.phoneVerified = true;
      } else if (audience === "verified_phones") {
        previewQuery.phoneVerified = true;
      } else {
        previewQuery._id = { $in: userIds.map((id: string) => new Types.ObjectId(id)) };
      }
      const matchedRecipients = await User.countDocuments(previewQuery);
      return res.status(200).json({
        success: true,
        dryRun: true,
        sent: false,
        audience: audience || "userIds",
        matchedRecipients,
        message: "Preview complete. No messages were scheduled or sent.",
      });
    }
    // Require an explicit zone so a local timestamp cannot be interpreted differently by servers.
    if (
      typeof rawScheduledAt !== "string" ||
      !/(Z|[+-]\d{2}:?\d{2})$/i.test(rawScheduledAt)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "scheduledAt must be an ISO 8601 timestamp with a timezone, such as 2026-11-06T10:00:00+05:30",
      });
    }
    const delay = scheduledAt.getTime() - Date.now();
    if (!Number.isFinite(scheduledAt.getTime()) || delay <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "scheduledAt must be a valid future time" });
    }

    let templatesRes: any;
    try {
      templatesRes = await getTemplatesService();
    } catch (metaErr: any) {
      return res.status(502).json({
        success: false,
        message: "Could not load WhatsApp templates from Meta",
        error: metaErr?.message,
      });
    }
    const template = (templatesRes?.data || []).find(
      (item: any) =>
        item.name?.toLowerCase().trim() === templateName.toLowerCase(),
    );
    if (!template) {
      return res
        .status(404)
        .json({ success: false, message: `Template "${templateName}" not found on Meta` });
    }
    if (String(template.status || "").toUpperCase() !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: `Template "${template.name}" is ${template.status || "not approved"}. Only approved templates can be scheduled.`,
      });
    }

    const headerFormat = resolveHeaderFormat(template);
    const headerImageUrl = String(rawHeaderImageUrl || "").trim();
    if (
      ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat) &&
      !headerImageUrl.startsWith("https://")
    ) {
      return res.status(400).json({
        success: false,
        message: `This template requires a public HTTPS headerImageUrl for its ${headerFormat.toLowerCase()} header`,
      });
    }

    const recipientQuery: Record<string, any> = {
      phone: { $exists: true, $nin: [null, ""] },
      isActive: { $ne: false },
    };
    if (audience === "whatsapp_opted_in") {
      recipientQuery.whatsappMarketingOptIn = true;
      recipientQuery.phoneVerified = true;
    } else if (audience === "verified_phones") {
      recipientQuery.phoneVerified = true;
    } else {
      recipientQuery._id = { $in: userIds.map((id: string) => new Types.ObjectId(id)) };
    }
    const users = await User.find(recipientQuery)
      .select("_id name phone email city state locality")
      .limit(1001)
      .lean();
    if (audience === "whatsapp_opted_in" && users.length > 1000) {
      return res.status(413).json({
        success: false,
        message: "This audience exceeds the 1000-recipient limit; use smaller opted-in segments",
      });
    }
    if (!users.length) {
      return res.status(404).json({
        success: false,
        message:
          audience === "whatsapp_opted_in"
            ? "No active users with a verified phone number and WhatsApp marketing opt-in were found"
            : "No active users with phone numbers were found",
      });
    }

    const campaignId = (await import("uuid")).v4();
    const language = templateLanguageCode(template, "en");
    const bodyComponent = template.components?.find(
      (component: any) => String(component.type || "").toUpperCase() === "BODY",
    );
    const variableCount = getVariableCount(bodyComponent?.text || "");
    const logRows = users.map((user: any) => ({
      to: String(user.phone),
      templateName: template.name || templateName,
      status: "pending",
      campaignId,
      scheduledAt,
      variables: buildCampaignVariables(user, variableCount),
      language,
      ...(headerImageUrl ? { headerImageUrl } : {}),
    }));

    const logs = await WhatsAppLog.insertMany(logRows);
    await WhatsAppCampaignRun.create({
      campaignId,
      source: "scheduled",
      templateName: template.name || templateName,
      status: "scheduled",
      estimatedRecipients: users.length,
      scheduledAt,
      filter: { userIds: users.map((user: any) => String(user._id)) },
      ...(headerImageUrl ? { headerImageUrl } : {}),
    });

    try {
      await addWhatsAppJobsWithTimeout(
        users.map((user: any, index: number) => ({
          name: "send-message",
          data: {
            to: String(user.phone),
            templateName: template.name || templateName,
            variables: logRows[index]!.variables,
            language,
            campaignId,
            logId: String(logs[index]!._id),
            ...(headerImageUrl ? { headerImageUrl, headerFormat } : {}),
          },
          opts: {
            delay,
            jobId: `scheduled-${campaignId}-${String(user._id)}`,
            attempts: 2,
            backoff: { type: "exponential", delay: 8000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        })),
      );
    } catch (queueErr: any) {
      await Promise.all([
        WhatsAppLog.updateMany(
          { campaignId },
          {
            status: "failed",
            error: queueErr?.message || "Could not queue scheduled message",
          },
        ),
        WhatsAppCampaignRun.updateOne(
          { campaignId },
          {
            status: "failed",
            error: queueErr?.message || "Could not queue scheduled message",
          },
        ),
      ]);
      return res.status(503).json({
        success: false,
        message: "Could not schedule WhatsApp messages. Check that Redis is running.",
        campaignId,
      });
    }

    return res.status(202).json({
      success: true,
      accepted: true,
      status: "scheduled",
      campaignId,
      templateName: template.name || templateName,
      scheduledAt: scheduledAt.toISOString(),
      estimatedRecipients: users.length,
      skippedCount: audience ? undefined : userIds.length - users.length,
      message: `WhatsApp message scheduled for ${users.length} existing user(s).`,
    });
  } catch (error: any) {
    console.error("WhatsApp scheduled message error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "WhatsApp message could not be scheduled",
    });
  }
};

/** Background: prepare header media once, then enqueue all CRM recipients. */
export async function processCrmCampaignFanout(job: {
  campaignId: string;
  templateName: string;
  language: string;
  variableCount: number;
  phoneKey: string;
  filter: Record<string, unknown>;
  requestedHeaderImageUrl?: string;
  carouselCards?: WhatsAppCarouselCardInput[];
}) {
  const {
    campaignId,
    templateName,
    language,
    variableCount,
    phoneKey,
    requestedHeaderImageUrl,
    carouselCards,
  } = job;

  try {
    await WhatsAppCampaignRun.findOneAndUpdate(
      { campaignId },
      { status: "preparing" },
    );

    const template = await resolveTemplateForSend(templateName);
    const headerFormat = resolveHeaderFormat(template);

    let headerMediaId = "";
    let outboundHeaderUrl = "";
    let sourceHeaderUrl = String(requestedHeaderImageUrl || "").trim();

    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat)) {
      const prepared = await resolveCampaignHeaderMedia({
        template,
        requestedUrl: sourceHeaderUrl,
      });
      headerMediaId = prepared.headerMediaId || "";
      outboundHeaderUrl =
        prepared.headerImageUrl || prepared.sourceUrl || "";
      sourceHeaderUrl = prepared.sourceUrl || sourceHeaderUrl;
    }

    await WhatsAppCampaignRun.findOneAndUpdate(
      { campaignId },
      {
        status: "queuing",
        ...(headerMediaId ? { headerMediaId } : {}),
        ...(sourceHeaderUrl ? { headerImageUrl: sourceHeaderUrl } : {}),
      },
    );

    const mongoFilter: any = { ...(job.filter || {}) };
    if (
      mongoFilter.roleId &&
      typeof mongoFilter.roleId === "string" &&
      Types.ObjectId.isValid(mongoFilter.roleId)
    ) {
      mongoFilter.roleId = new Types.ObjectId(mongoFilter.roleId);
    }

    const batchSize = 100;
    let page = 0;
    let queued = 0;
    let skipped = 0;

    while (true) {
      const users = await User.find(mongoFilter)
        .select("name phone email city state locality")
        .skip(page * batchSize)
        .limit(batchSize)
        .lean();
      if (!users.length) break;

      const logsToInsert: any[] = [];
      const sendJobs: {
        name: string;
        data: any;
        opts?: any;
      }[] = [];

      for (const user of users) {
        const phoneRaw =
          phoneKey === "phone"
            ? user.phone
            : (user as any)[phoneKey] || user.phone;
        if (!phoneRaw) {
          skipped += 1;
          continue;
        }

        const variables = buildCampaignVariables(
          {
            name: user.name || "User",
            city: user.city || "",
            state: user.state || "",
            locality: (user as any).locality || "",
            email: (user as any).email || "",
          },
          variableCount,
        );

        const logId = new Types.ObjectId();
        logsToInsert.push({
          _id: logId,
          to: String(phoneRaw),
          templateName: template.name || templateName,
          status: "pending",
          campaignId,
          variables,
          language,
          ...(sourceHeaderUrl ? { headerImageUrl: sourceHeaderUrl } : {}),
          ...(headerMediaId ? { headerMediaId } : {}),
        });

        sendJobs.push({
          name: "send-message",
          data: {
            campaignId,
            to: String(phoneRaw),
            templateName: template.name || templateName,
            variables,
            language,
            logId: logId.toString(),
            ...(headerFormat ? { headerFormat } : {}),
            ...(headerMediaId
              ? { headerMediaId }
              : outboundHeaderUrl
                ? { headerImageUrl: outboundHeaderUrl }
                : {}),
            ...(carouselCards?.length ? { carouselCards } : {}),
          },
          opts: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
          },
        });
      }

      if (logsToInsert.length) {
        await WhatsAppLog.insertMany(logsToInsert, { ordered: false });
      }
      if (sendJobs.length) {
        await whatsappQueue.addBulk(sendJobs);
        queued += sendJobs.length;
      }

      page += 1;
    }

    await WhatsAppCampaignRun.findOneAndUpdate(
      { campaignId },
      {
        status: queued > 0 ? "queued" : "failed",
        queued,
        skipped,
        ...(queued === 0
          ? {
              error:
                skipped > 0
                  ? "No valid recipients with phone numbers for this audience."
                  : "No recipients found for this location filter.",
            }
          : {}),
      },
    );

    console.log(
      `✅ CRM fan-out ${campaignId}: queued=${queued} skipped=${skipped}`,
    );
    return { queued, skipped };
  } catch (err: any) {
    console.error("❌ CRM fan-out failed:", err?.message || err);
    await WhatsAppCampaignRun.findOneAndUpdate(
      { campaignId },
      {
        status: "failed",
        error: err?.message || "Campaign fan-out failed",
      },
    ).catch(() => undefined);
    throw err;
  }
}

function normalizeValidWhatsAppPhone(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = `91${digits.slice(1)}`;
  }
  if (digits.length < 10 || digits.length > 15) return "";
  if (/^0+$/.test(digits) || digits === "1234567890") return "";
  if (digits.startsWith("91") && digits.length === 12) {
    const local = digits.slice(2);
    if (!/^[6-9]\d{9}$/.test(local)) return "";
  }
  return digits;
}

function csvRowIsOptedOut(row: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(row)) {
    const v = String(value ?? "")
      .trim()
      .toLowerCase();
    if (
      /opt.?out|unsubscribe/i.test(key) &&
      [
        "1",
        "true",
        "yes",
        "y",
        "opted out",
        "opt-out",
        "optout",
        "unsubscribe",
        "unsubscribed",
        "stop",
        "stopped",
        "blocked",
      ].includes(v)
    ) {
      return true;
    }
    if (
      /^(status|consent)$/i.test(key.trim()) &&
      /opt.?out|unsub|stop|block/i.test(String(value ?? ""))
    ) {
      return true;
    }
  }
  return false;
}

function pickPhoneFromRow(
  row: Record<string, string>,
  phoneField?: string,
): string {
  if (phoneField) {
    const exact = Object.keys(row).find(
      (k) => k.trim().toLowerCase() === phoneField.trim().toLowerCase(),
    );
    if (exact) return String(row[exact] ?? "").trim();
  }
  const keys = Object.keys(row);
  const phoneKey = keys.find((k) =>
    /^(phone|mobile|whatsapp|wa[_-]?id|msisdn)$/i.test(k.trim()),
  );
  return String(phoneKey ? row[phoneKey] : "").trim();
}

function buildCsvRowVariables(
  row: Record<string, string>,
  expectedCount?: number,
  fieldMapping?: Record<string, string> | null,
): string[] {
  const resolveColumn = (header: string) => {
    const key = Object.keys(row).find(
      (k) =>
        k.trim().toLowerCase() === String(header || "").trim().toLowerCase(),
    );
    return key ? String(row[key] ?? "").trim() : "";
  };

  if (fieldMapping && typeof fieldMapping === "object") {
    const count =
      typeof expectedCount === "number" && expectedCount > 0
        ? expectedCount
        : Math.max(
            0,
            ...Object.keys(fieldMapping)
              .map((k) => parseInt(k, 10))
              .filter((n) => !Number.isNaN(n)),
          );
    if (count <= 0) return [];
    return Array.from({ length: count }, (_, i) => {
      const mappedHeader =
        fieldMapping[String(i + 1)] || (fieldMapping as any)[i + 1];
      const value = mappedHeader ? resolveColumn(mappedHeader) : "";
      return value || "Customer";
    });
  }

  if (typeof expectedCount === "number" && expectedCount >= 0) {
    if (expectedCount === 0) return [];
    const skip = /^(phone|mobile|whatsapp|wa[_-]?id|msisdn|email)$/i;
    const values: string[] = [];
    for (const [k, v] of Object.entries(row)) {
      if (skip.test(k.trim())) continue;
      const text = String(v ?? "").trim();
      if (text) values.push(text);
    }
    return Array.from({ length: expectedCount }, (_, i) => {
      const v = values[i];
      return v != null && String(v).trim() ? String(v).trim() : "Customer";
    });
  }

  return ["Customer"];
}

/** Background: prepare header media once, then enqueue CSV rows. */
export async function processCsvCampaignFanout(job: {
  campaignId: string;
  templateName: string;
  language: string;
  category: string;
  expectedVars: number;
  fieldMapping: Record<string, string>;
  phoneField: string;
  baseDelayMs: number;
  requestedHeaderImageUrl?: string;
  rows: Record<string, string>[];
  carouselCards?: WhatsAppCarouselCardInput[];
}) {
  const {
    campaignId,
    templateName,
    language,
    category,
    expectedVars,
    fieldMapping,
    phoneField,
    baseDelayMs,
    requestedHeaderImageUrl,
    rows,
    carouselCards,
  } = job;

  try {
    await WhatsAppCampaignRun.findOneAndUpdate(
      { campaignId },
      { status: "preparing" },
    );

    const template = await resolveTemplateForSend(templateName);
    const headerFormat = resolveHeaderFormat(template);

    let headerMediaId = "";
    let outboundHeaderUrl = "";
    let sourceHeaderUrl = String(requestedHeaderImageUrl || "").trim();

    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat)) {
      const prepared = await resolveCampaignHeaderMedia({
        template,
        requestedUrl: sourceHeaderUrl,
      });
      headerMediaId = prepared.headerMediaId || "";
      outboundHeaderUrl =
        prepared.headerImageUrl || prepared.sourceUrl || "";
      sourceHeaderUrl = prepared.sourceUrl || sourceHeaderUrl;
    }

    await WhatsAppCampaignRun.findOneAndUpdate(
      { campaignId },
      {
        status: "queuing",
        ...(headerMediaId ? { headerMediaId } : {}),
        ...(sourceHeaderUrl ? { headerImageUrl: sourceHeaderUrl } : {}),
      },
    );

    let queued = 0;
    let skipped = 0;
    const seenPhones = new Set<string>();
    const BATCH = 50;
    let batchLogs: any[] = [];
    let batchJobs: { name: string; data: any; opts?: any }[] = [];

    const flush = async () => {
      if (batchLogs.length) {
        await WhatsAppLog.insertMany(batchLogs, { ordered: false });
        batchLogs = [];
      }
      if (batchJobs.length) {
        await whatsappQueue.addBulk(batchJobs);
        queued += batchJobs.length;
        batchJobs = [];
      }
    };

    for (const row of rows) {
      if (csvRowIsOptedOut(row)) {
        skipped += 1;
        continue;
      }
      const phoneRaw = pickPhoneFromRow(row, phoneField || undefined);
      const formattedPhone = normalizeValidWhatsAppPhone(phoneRaw);
      if (!formattedPhone) {
        skipped += 1;
        continue;
      }
      if (seenPhones.has(formattedPhone)) {
        skipped += 1;
        continue;
      }
      seenPhones.add(formattedPhone);
      const variables = buildCsvRowVariables(
        row,
        expectedVars,
        fieldMapping || null,
      );
      const logId = new Types.ObjectId();

      batchLogs.push({
        _id: logId,
        to: formattedPhone,
        templateName: template.name || templateName,
        status: "pending",
        campaignId,
        variables,
        language,
        category,
        ...(sourceHeaderUrl ? { headerImageUrl: sourceHeaderUrl } : {}),
        ...(headerMediaId ? { headerMediaId } : {}),
      });

      batchJobs.push({
        name: "send-message",
        data: {
          to: formattedPhone,
          templateName: template.name || templateName,
          variables,
          language,
          campaignId,
          logId: logId.toString(),
          ...(headerFormat ? { headerFormat } : {}),
          ...(headerMediaId
            ? { headerMediaId }
            : outboundHeaderUrl
              ? { headerImageUrl: outboundHeaderUrl }
              : {}),
          ...(carouselCards?.length ? { carouselCards } : {}),
        },
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          delay: baseDelayMs + queued * 300 + batchJobs.length * 300,
        },
      });

      if (batchLogs.length >= BATCH) {
        await flush();
      }
    }

    await flush();

    await WhatsAppCampaignRun.findOneAndUpdate(
      { campaignId },
      {
        status: queued > 0 ? "queued" : "failed",
        queued,
        skipped,
        ...(queued === 0
          ? {
              error: phoneField
                ? `No valid numbers in column "${phoneField}".`
                : "No valid phone numbers found in file.",
            }
          : {}),
      },
    );

    console.log(
      `✅ CSV fan-out ${campaignId}: queued=${queued} skipped=${skipped}`,
    );
    return { queued, skipped };
  } catch (err: any) {
    console.error("❌ CSV fan-out failed:", err?.message || err);
    await WhatsAppCampaignRun.findOneAndUpdate(
      { campaignId },
      {
        status: "failed",
        error: err?.message || "CSV campaign fan-out failed",
      },
    ).catch(() => undefined);
    throw err;
  }
}

export const sendWhatsAppBulkMessages = async ({
  to,
  templateName,
  variables,
  language,
  headerImageUrl,
  headerMediaId,
  headerFormat: headerFormatHint,
  carouselCards,
}: SendWhatsAppInput) => {
  try {
    if (!to || !templateName) {
      throw new Error("Missing required fields");
    }

    const { token, phoneId, apiVersion } = resolveMetaAuth();
    if (!token || !phoneId) {
      throw new Error(
        "WhatsApp credentials missing (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)",
      );
    }

    const cleanPhone = String(to).replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("91")
      ? cleanPhone
      : `91${cleanPhone}`;

    if (formattedPhone.length < 12) {
      throw new Error(`Invalid phone number: ${to}`);
    }

    if (!Array.isArray(variables)) {
      throw new Error("Variables must be an array");
    }

    /**
     * Fast path (production): when fan-out already prepared media + vars,
     * do NOT re-fetch Meta template list for every recipient (rate-limit / hang).
     */
    const hasPreparedHeader =
      Boolean(String(headerMediaId || "").trim()) ||
      (String(headerImageUrl || "").trim().startsWith("http") &&
        !isMetaHostedMediaUrl(String(headerImageUrl)));

    let templateNameFinal = String(templateName).trim();
    let lang = String(language || "en").trim() || "en";
    let headerFormat = String(headerFormatHint || "").toUpperCase();
    // Fan-out always prepares IMAGE/VIDEO/DOCUMENT media ids for those templates.
    if (!headerFormat && String(headerMediaId || "").trim()) {
      headerFormat = "IMAGE";
    }
    let alignedVars = variables.map((v) =>
      v != null && String(v).trim() ? String(v).trim() : "Customer",
    );

    let templateForCarousel: any = null;
    if (!hasPreparedHeader || !headerFormat || (carouselCards && carouselCards.length)) {
      const template = await resolveTemplateForSend(templateName);
      templateForCarousel = template;
      templateNameFinal = template.name || templateNameFinal;
      lang = templateLanguageCode(template, language || "en");
      headerFormat = resolveHeaderFormat(template) || headerFormat;
      const bodyComponent = template.components?.find(
        (c: any) => String(c.type || "").toUpperCase() === "BODY",
      );
      const variableCount = getVariableCount(bodyComponent?.text || "");
      alignedVars = alignVariables(variables, variableCount);
    }

    const components: any[] = [];
    let cardsForCarousel = carouselCards || [];
    if (
      templateForCarousel &&
      templateCarousel(templateForCarousel) &&
      !cardsForCarousel.length
    ) {
      cardsForCarousel = await loadDefaultCarouselCards();
    }
    const carouselComponent = templateForCarousel
      ? await buildCarouselSendComponent(templateForCarousel, cardsForCarousel)
      : null;

    if (carouselComponent) {
      components.push(carouselComponent);
    } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat)) {
      const prepared = await prepareHeaderMediaForSend({
        format: headerFormat,
        url: String(headerImageUrl || "").trim(),
        ...(headerMediaId ? { mediaId: headerMediaId } : {}),
      });
      const mediaKey = headerFormat.toLowerCase();
      const mediaParam = prepared.id
        ? { id: prepared.id }
        : { link: prepared.link };
      components.push({
        type: "header",
        parameters: [
          {
            type: mediaKey,
            [mediaKey]: mediaParam,
          },
        ],
      });
    }

    if (alignedVars.length > 0) {
      components.push({
        type: "body",
        parameters: alignedVars.map((v) => ({
          type: "text",
          text: v,
        })),
      });
    }

    const payload = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "template",
      template: {
        name: templateNameFinal,
        language: { code: lang },
        ...(components.length ? { components } : {}),
      },
    };

    console.log("📤 Sending to:", formattedPhone);

    const response = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${phoneId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    console.log("✅ Sent:", response.data);
    return response.data;
  } catch (err: any) {
    console.error("❌ WhatsApp Error:", err.response?.data || err.message);

    const meta =
      err.response?.data?.error?.error_user_msg ||
      err.response?.data?.error?.message ||
      err.message ||
      "WhatsApp failed";
    throw new Error(meta);
  }
};
