import axios from "axios";

/**
 * Rebuilds what a recipient saw for a Meta template send (header, body with
 * variables, footer, buttons, carousel cards) so the inbox can show it.
 * Meta does not return delivered content, so this is built from the template
 * definition plus the values used for the send.
 */

export type TemplatePreviewButton = {
  type: string;
  text: string;
  url?: string;
  phone?: string;
};

export type TemplatePreviewCard = {
  mediaFormat?: string;
  mediaUrl?: string;
  body: string;
  buttons: TemplatePreviewButton[];
};

export type TemplatePreview = {
  name: string;
  language?: string | undefined;
  header?: { format: string; text?: string; mediaUrl?: string };
  body: string;
  footer?: string;
  buttons: TemplatePreviewButton[];
  cards?: TemplatePreviewCard[];
};

export type TemplatePreviewCardInput = {
  imageUrl?: string;
  title?: string;
  details?: string;
  buttonSuffix?: string;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const MISS_REFETCH_MS = 60 * 1000;
let cachedTemplates: any[] = [];
let cachedAt = 0;
let inFlight: Promise<any[]> | null = null;

function metaAuth() {
  return {
    token: String(process.env.WHATSAPP_TOKEN || "").trim(),
    businessId: String(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "").trim(),
    apiVersion: String(process.env.WHATSAPP_API_VERSION || "v19.0").trim(),
  };
}

async function fetchTemplates(): Promise<any[]> {
  const { token, businessId, apiVersion } = metaAuth();
  if (!token || !businessId) return [];
  const res = await axios.get(
    `https://graph.facebook.com/${apiVersion}/${businessId}/message_templates`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { fields: "name,status,category,language,components", limit: 250 },
      // Runs while the inbox loads messages — keep it short.
      timeout: 8000,
    },
  );
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

let lastFailureAt = 0;

async function loadTemplates(force = false): Promise<any[]> {
  const now = Date.now();
  const age = now - cachedAt;
  if (!force && cachedAt && age < CACHE_TTL_MS) return cachedTemplates;
  if (force && cachedAt && age < MISS_REFETCH_MS) return cachedTemplates;
  if (now - lastFailureAt < MISS_REFETCH_MS) return cachedTemplates;
  if (!inFlight) {
    inFlight = fetchTemplates()
      .then((list) => {
        cachedTemplates = list;
        cachedAt = Date.now();
        return list;
      })
      .catch((err) => {
        console.error("WhatsApp template preview fetch failed:", err?.message || err);
        lastFailureAt = Date.now();
        return cachedTemplates;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** False until a Meta template list has loaded at least once. */
export function templatesLoaded() {
  return cachedTemplates.length > 0;
}

export async function getTemplateDefinition(nameRaw: string, languageRaw?: string) {
  const name = String(nameRaw || "").trim().toLowerCase();
  if (!name) return null;
  const language = String(languageRaw || "").trim().toLowerCase();
  const pick = (list: any[]) => {
    const matches = list.filter((t) => String(t?.name || "").trim().toLowerCase() === name);
    if (!matches.length) return null;
    return (
      (language &&
        matches.find((t) => String(t?.language || "").toLowerCase() === language)) ||
      matches.find((t) => String(t?.status || "").toUpperCase() === "APPROVED") ||
      matches[0]
    );
  };
  const found = pick(await loadTemplates());
  if (found) return found;
  return pick(await loadTemplates(true));
}

function component(list: any[], type: string) {
  return (list || []).find((c: any) => String(c?.type || "").toUpperCase() === type);
}

function headerExampleUrl(header: any): string {
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

/** Same fallback as the campaign sender: missing values become "Customer". */
function fillVariables(text: string, variables?: string[]) {
  if (!Array.isArray(variables)) return String(text || "");
  let position = 0;
  return String(text || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => {
    const index = /^\d+$/.test(key) ? Number(key) - 1 : position;
    position += 1;
    const value = String(variables[index] ?? "").trim();
    return value || "Customer";
  });
}

function previewButtons(list: any[], urlSuffix?: string): TemplatePreviewButton[] {
  const wrap = component(list, "BUTTONS");
  return (wrap?.buttons || [])
    .map((button: any) => {
      const type = String(button?.type || "").toUpperCase();
      const text = String(button?.text || "").trim();
      if (!text) return null;
      const out: TemplatePreviewButton = { type, text };
      if (type === "URL" && button?.url) {
        const url = String(button.url);
        out.url = url.includes("{{")
          ? url.replace(/\{\{\s*1\s*\}\}/g, urlSuffix ? String(urlSuffix) : "")
          : url;
      }
      if (type === "PHONE_NUMBER" && button?.phone_number) {
        out.phone = String(button.phone_number);
      }
      return out;
    })
    .filter(Boolean) as TemplatePreviewButton[];
}

function isHttpUrl(value: unknown) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

export function buildTemplatePreview(
  template: any,
  input?: {
    variables?: string[] | undefined;
    headerImageUrl?: string | undefined;
    carouselCards?: TemplatePreviewCardInput[] | undefined;
  },
): TemplatePreview {
  const components = template?.components || [];
  const preview: TemplatePreview = {
    name: String(template?.name || ""),
    language: String(template?.language || "") || undefined,
    body: fillVariables(component(components, "BODY")?.text || "", input?.variables),
    buttons: previewButtons(components),
  };

  const header = component(components, "HEADER");
  if (header) {
    const format = String(header.format || "TEXT").toUpperCase();
    if (format === "TEXT") {
      preview.header = { format, text: String(header.text || "") };
    } else {
      const mediaUrl = isHttpUrl(input?.headerImageUrl)
        ? String(input?.headerImageUrl).trim()
        : headerExampleUrl(header);
      preview.header = { format, ...(mediaUrl ? { mediaUrl } : {}) };
    }
  }

  const footer = component(components, "FOOTER");
  if (footer?.text) preview.footer = String(footer.text);

  const carousel = component(components, "CAROUSEL");
  const specs = carousel?.cards || [];
  if (specs.length) {
    const cardsIn = (input?.carouselCards || []).filter(Boolean);
    preview.cards = specs.map((spec: any, index: number) => {
      const card = cardsIn.length ? cardsIn[index % cardsIn.length] : undefined;
      const cardHeader = component(spec?.components || [], "HEADER");
      const format = String(cardHeader?.format || "").toUpperCase();
      const mediaUrl =
        card && isHttpUrl(card.imageUrl)
          ? String(card.imageUrl).trim()
          : headerExampleUrl(cardHeader);
      const cardVars = card
        ? [String(card.title || "Property"), String(card.details || "View details on Propenu")]
        : undefined;
      return {
        ...(format ? { mediaFormat: format } : {}),
        ...(mediaUrl ? { mediaUrl } : {}),
        body: fillVariables(component(spec?.components || [], "BODY")?.text || "", cardVars),
        buttons: previewButtons(spec?.components || [], card?.buttonSuffix),
      };
    });
  }

  return preview;
}

/** Short text for chat list previews / search. */
export function templatePreviewText(preview: TemplatePreview) {
  const parts = [
    preview.header?.format === "TEXT" ? preview.header.text : "",
    preview.body,
    preview.cards?.[0]?.body,
  ];
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join("\n") || "";
}
