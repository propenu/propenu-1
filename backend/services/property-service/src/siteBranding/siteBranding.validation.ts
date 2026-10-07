import sharp from "sharp";
import {
  BANNER_LEGACY_SLOT_SIZES,
  BANNER_MAX_BYTES,
  BANNER_SIZE_TOLERANCE_PX,
  BANNER_SLOTS,
  BannerSlot,
  LOGO_ALLOWED_EXTENSIONS,
  LOGO_ALLOWED_MIME_TYPES,
  LOGO_ALLOWED_PIXEL_SIZES,
  LOGO_ASPECT_RATIO,
  LOGO_ASPECT_TOLERANCE,
  LOGO_MAX_BYTES,
  LOGO_SIZE_TOLERANCE_PX,
  LOGO_VIDEO_EXTENSIONS,
} from "./siteBranding.constants";

export function assertWebpFile(file: Express.Multer.File, slotLabel: string) {
  const name = String(file.originalname || "").toLowerCase();
  const isWebp =
    file.mimetype === "image/webp" || name.endsWith(".webp");
  if (!isWebp) {
    throw new Error(`${slotLabel}: only WebP images are allowed`);
  }
  if (file.size > BANNER_MAX_BYTES) {
    throw new Error(`${slotLabel}: image must be below 1 MB`);
  }
}

function logoFileName(file: Express.Multer.File) {
  return String(file.originalname || "").toLowerCase();
}

export function getLogoExtension(file: Express.Multer.File): string {
  const name = logoFileName(file);
  const match = name.match(/(\.[a-z0-9]+)$/);
  return match?.[1] || "";
}

export function isLogoVideoFile(file: Express.Multer.File): boolean {
  const mime = String(file.mimetype || "").toLowerCase();
  const ext = getLogoExtension(file);
  return (
    mime.startsWith("video/") ||
    (LOGO_VIDEO_EXTENSIONS as readonly string[]).includes(ext)
  );
}

export function resolveLogoMimeType(file: Express.Multer.File): string {
  const mime = String(file.mimetype || "").toLowerCase();
  if (LOGO_ALLOWED_MIME_TYPES.has(mime)) return mime;
  const ext = getLogoExtension(file);
  switch (ext) {
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    default:
      return mime || "application/octet-stream";
  }
}

export function isAllowedLogoFile(file: Express.Multer.File): boolean {
  const mime = String(file.mimetype || "").toLowerCase();
  const ext = getLogoExtension(file);
  if (LOGO_ALLOWED_MIME_TYPES.has(mime)) return true;
  return (LOGO_ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

/** Accept PNG / SVG / GIF / WebP / MP4 / WebM under 4 MB. */
export function assertLogoFile(file: Express.Multer.File) {
  if (!isAllowedLogoFile(file)) {
    throw new Error(
      "Logo: allowed formats are PNG, SVG, GIF, WebP, MP4, WebM",
    );
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error("Logo: file must be below 4 MB");
  }
}

/** @deprecated use assertLogoFile */
export function assertGifFile(file: Express.Multer.File) {
  assertLogoFile(file);
}

export async function assertBannerDimensions(
  buffer: Buffer,
  slot: BannerSlot,
) {
  const expected = BANNER_SLOTS[slot];
  const allowedSizes = [
    { width: expected.width, height: expected.height },
    ...(BANNER_LEGACY_SLOT_SIZES[slot] || []),
  ];
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const matchesAllowedSize = allowedSizes.some((size) => {
    const okW = Math.abs(width - size.width) <= BANNER_SIZE_TOLERANCE_PX;
    const okH = Math.abs(height - size.height) <= BANNER_SIZE_TOLERANCE_PX;
    return okW && okH;
  });

  if (!matchesAllowedSize) {
    throw new Error(
      `${expected.label}: expected ${expected.width}×${expected.height}px, got ${width}×${height}px`,
    );
  }
}

export async function assertLogoAspectRatio(buffer: Buffer) {
  const meta = await sharp(buffer, { failOn: "none" }).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) {
    throw new Error("Logo: could not read image dimensions");
  }

  const matchesAllowedSize = LOGO_ALLOWED_PIXEL_SIZES.some(
    (size) =>
      Math.abs(width - size.width) <= LOGO_SIZE_TOLERANCE_PX &&
      Math.abs(height - size.height) <= LOGO_SIZE_TOLERANCE_PX,
  );
  if (matchesAllowedSize) return;

  const ratio = width / height;
  if (Math.abs(ratio - LOGO_ASPECT_RATIO) > LOGO_ASPECT_TOLERANCE) {
    const sizeList = LOGO_ALLOWED_PIXEL_SIZES.map(
      (s) => `${s.width}×${s.height}`,
    ).join(", ");
    throw new Error(
      `Logo: use GIF/image sizes ${sizeList} (or ~3.34:1). Got ${width}×${height}`,
    );
  }
}

export function normalizeClickUrl(raw: unknown, { optional = false } = {}): string {
  const value = String(raw || "").trim();
  if (!value) {
    if (optional) return "";
    throw new Error("Click URL is required");
  }
  if (value.startsWith("/")) {
    return value;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid");
    }
    return parsed.toString();
  } catch {
    throw new Error("Click URL must be a full http(s) link or a path starting with /");
  }
}

export function normalizeLocation(body: Record<string, unknown>) {
  const state = String(body.state || "").trim();
  const city = String(body.city || "").trim();
  const locality = String(body.locality || "").trim();
  const subLocality = String(body.subLocality || body.sub_locality || "").trim();
  const coverage = normalizeLocationCoverage(body.coverage);

  if (city && !state) {
    throw new Error("State is required when City is set");
  }
  if (locality && !city) {
    throw new Error("City is required when Locality is set");
  }
  // Sub-locality is optional/manual — allow without locality when using coverage.
  if (subLocality && !locality && !Object.keys(coverage).length) {
    throw new Error("Locality is required when Sub-locality is set");
  }

  // Prefer coverage for targeting; keep flat fields as a light summary for older UIs.
  let flatState = state;
  let flatCity = city;
  let flatLocality = locality;
  if (Object.keys(coverage).length) {
    const firstState = Object.keys(coverage)[0] || "";
    const firstCity = firstState
      ? Object.keys(coverage[firstState] || {})[0] || ""
      : "";
    const firstLocs =
      firstState && firstCity ? coverage[firstState]?.[firstCity] || [] : [];
    flatState = firstState || "";
    flatCity = firstCity || "";
    flatLocality = firstLocs[0] || "";
  }

  return {
    state: flatState,
    city: flatCity,
    locality: flatLocality,
    subLocality,
    coverage,
  };
}

/** Same nested shape as sponsoredAd: { [state]: { [city]: string[] } } */
export function normalizeLocationCoverage(raw: unknown): Record<
  string,
  Record<string, string[]>
> {
  let src: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      src = JSON.parse(trimmed);
    } catch {
      throw new Error("Location coverage must be valid JSON");
    }
  }
  if (!src || typeof src !== "object" || Array.isArray(src)) return {};

  const out: Record<string, Record<string, string[]>> = {};
  for (const [state, cities] of Object.entries(src as Record<string, unknown>)) {
    const st = String(state || "").trim();
    if (!st || !cities || typeof cities !== "object" || Array.isArray(cities)) {
      continue;
    }
    out[st] = {};
    for (const [city, locs] of Object.entries(cities as Record<string, unknown>)) {
      const c = String(city || "").trim();
      if (!c) continue;
      out[st][c] = Array.isArray(locs)
        ? [
            ...new Set(
              locs
                .map((l) => String(l || "").trim())
                .filter(Boolean),
            ),
          ]
        : [];
    }
    if (!Object.keys(out[st]).length) delete out[st];
  }
  return out;
}

export function normalizePriority(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Priority must be a number ≥ 0");
  }
  return Math.min(9999, Math.floor(n));
}

function parseBool(raw: unknown, fallback = true): boolean {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw === "boolean") return raw;
  const s = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return fallback;
}

/** Keep TipTap formatting (color/font/highlight); strip scripts & unsafe handlers. */
export function sanitizeBannerHtml(raw: unknown, label: string): string {
  let html = String(raw || "");
  if (html.length > 20000) {
    throw new Error(`${label} text is too long`);
  }

  html = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
    .replace(/on\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/on\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/expression\s*\(/gi, "");

  // Allow style= for color / background-color / font-* / text-align only
  html = html.replace(/style\s*=\s*(['"])(.*?)\1/gi, (_match, quote, styleBody) => {
    const kept = String(styleBody)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((decl) => {
        const prop = decl.split(":")[0]?.trim().toLowerCase() || "";
        return [
          "color",
          "background-color",
          "background",
          "font-size",
          "font-family",
          "font-weight",
          "font-style",
          "text-align",
          "text-decoration",
          "line-height",
        ].includes(prop);
      })
      .join("; ");
    return kept ? `style=${quote}${kept}${quote}` : "";
  });

  if (html === "<p></p>" || html === "<p><br></p>") return "";
  return html;
}

export function normalizeTextBlock(
  body: Record<string, unknown>,
  kind: "heading" | "subheading",
  fallback?: { enabled?: boolean; html?: string },
) {
  const enabledKey = `${kind}Enabled`;
  const htmlKey = `${kind}Html`;
  const nested = body[kind];

  let enabled = fallback?.enabled ?? true;
  let html = fallback?.html ?? "";

  if (nested && typeof nested === "object") {
    const obj = nested as Record<string, unknown>;
    if (obj.enabled !== undefined) enabled = parseBool(obj.enabled, enabled);
    if (obj.html !== undefined) html = sanitizeBannerHtml(obj.html, kind);
  }

  if (body[enabledKey] !== undefined) {
    enabled = parseBool(body[enabledKey], enabled);
  }
  if (body[htmlKey] !== undefined) {
    html = sanitizeBannerHtml(body[htmlKey], kind);
  }

  return { enabled, html };
}
