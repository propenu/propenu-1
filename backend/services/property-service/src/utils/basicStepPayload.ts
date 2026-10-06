const DETAILS_FILE_FIELDS = new Set([
  "galleryFiles",
  "images",
  "videos",
  "files",
  "file",
  "verificationDocuments",
  "verificationDocument",
  "leaseDocuments",
  "soilTestReport",
  "conversionCertificateFile",
  "encumbranceCertificateFile",
  "brochure",
  "brochureFile",
  "floorPlanFiles",
]);

const MEDIA_ARRAY_FIELDS = new Set(["gallery", "documents"]);

/** Inline image/file data. The website never sends these on the basic JSON save. */
export function isInlineFileValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.startsWith("data:")) return true;
  if (value.length < 50_000) return false;
  const sample = value.slice(0, 120);
  return !/\s/.test(sample) && /^[A-Za-z0-9+/=]+$/.test(sample);
}

function mediaUrl(item: any): unknown {
  if (!item || typeof item !== "object") return item;
  return item.url ?? item.preview ?? item.src ?? item.data;
}

function stripValue(value: any): any {
  if (typeof value === "string") {
    return isInlineFileValue(value) ? undefined : value;
  }

  if (Array.isArray(value)) {
    const next = [];
    for (const item of value) {
      const cleaned = stripValue(item);
      if (cleaned !== undefined) next.push(cleaned);
    }
    return next;
  }

  if (!value || typeof value !== "object") return value;

  const next: Record<string, any> = {};
  for (const [key, child] of Object.entries(value)) {
    if (DETAILS_FILE_FIELDS.has(key)) continue;

    if (MEDIA_ARRAY_FIELDS.has(key)) {
      if (!Array.isArray(child)) continue;
      const kept = child
        .filter((item) => !isInlineFileValue(mediaUrl(item)) && !isInlineFileValue(item))
        .map((item) => stripValue(item))
        .filter((item) => item !== undefined);
      if (child.length > 0 && kept.length === 0) continue;
      next[key] = kept;
      continue;
    }

    const cleaned = stripValue(child);
    if (cleaned !== undefined) next[key] = cleaned;
  }

  return next;
}

/**
 * Basic-step body, shaped like the website save:
 * text and numbers stay, photo and document files stay off this request.
 */
export function stripInlineMediaFromBasicStep<T extends Record<string, any>>(payload: T): T {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {} as T;
  }
  return stripValue(payload) as T;
}
