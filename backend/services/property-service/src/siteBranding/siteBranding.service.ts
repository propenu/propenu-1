import { Types } from "mongoose";
import { uploadFile } from "../utils/uploadFile";
import {
  SiteBanner,
  emptyDevices,
  emptyLocation,
  ISiteBanner,
  SiteBannerLocation,
} from "./siteBanner.model";
import { SiteLogo } from "./siteLogo.model";
import {
  PrimeDisplayMode,
  PrimeDisplaySettings,
  PRIME_DISPLAY_MODES,
} from "./primeDisplay.model";
import {
  BANNER_SLOT_KEYS,
  BANNER_SLOTS,
  BannerSlot,
} from "./siteBranding.constants";
import {
  assertBannerDimensions,
  assertLogoAspectRatio,
  assertLogoFile,
  assertWebpFile,
  isLogoVideoFile,
  normalizeClickUrl,
  normalizeLocation,
  normalizeLocationCoverage,
  normalizePriority,
  normalizeTextBlock,
  resolveLogoMimeType,
} from "./siteBranding.validation";

function isBannerSlot(value: string): value is BannerSlot {
  return (BANNER_SLOT_KEYS as string[]).includes(value);
}

function toPlainCoverage(raw: unknown): Record<string, Record<string, string[]>> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return toPlainCoverage(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  // Mongoose Map
  if (typeof (raw as any)?.toObject === "function") {
    return toPlainCoverage((raw as any).toObject());
  }
  if (raw instanceof Map) {
    const obj: Record<string, unknown> = {};
    raw.forEach((v, k) => {
      obj[String(k)] = v;
    });
    return toPlainCoverage(obj);
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  return normalizeLocationCoverage(raw);
}

function pickBannerLocation(obj: any): SiteBannerLocation {
  const top = obj?.location;
  const topCoverage = toPlainCoverage(top?.coverage);
  if (
    top &&
    (top.state ||
      top.city ||
      top.locality ||
      top.subLocality ||
      Object.keys(topCoverage).length)
  ) {
    return normalizeLocation({
      state: top.state,
      city: top.city,
      locality: top.locality,
      subLocality: top.subLocality,
      coverage: topCoverage,
    });
  }

  for (const slot of BANNER_SLOT_KEYS) {
    const loc = obj?.devices?.[slot]?.location;
    if (!loc) continue;
    const coverage = toPlainCoverage(loc.coverage);
    const has =
      loc.state ||
      loc.city ||
      loc.locality ||
      loc.subLocality ||
      Object.keys(coverage).length;
    if (!has) continue;
    return normalizeLocation({
      state: loc.state,
      city: loc.city,
      locality: loc.locality,
      subLocality: loc.subLocality,
      coverage,
    });
  }

  return emptyLocation();
}

/** Normalize banners → shared location + devices without per-device location. */
export function normalizeBannerDoc(raw: any) {
  if (!raw) return null;
  const obj = typeof raw.toObject === "function" ? raw.toObject() : { ...raw };
  const location = pickBannerLocation(obj);
  const devices = emptyDevices();

  if (obj.devices && typeof obj.devices === "object") {
    for (const slot of BANNER_SLOT_KEYS) {
      const d = obj.devices[slot] || {};
      devices[slot] = {
        image: String(d.image || ""),
        clickUrl: String(d.clickUrl || ""),
        heading: {
          enabled: d.heading?.enabled !== false,
          html: String(d.heading?.html || ""),
        },
        subheading: {
          enabled: d.subheading?.enabled !== false,
          html: String(d.subheading?.html || ""),
        },
      };
    }
  } else {
    // Legacy: images + shared heading/clickUrl
    const sharedClick = String(obj.clickUrl || "");
    const sharedHeading = {
      enabled: obj.heading?.enabled !== false,
      html: String(obj.heading?.html || ""),
    };
    const sharedSub = {
      enabled: obj.subheading?.enabled !== false,
      html: String(obj.subheading?.html || ""),
    };
    for (const slot of BANNER_SLOT_KEYS) {
      const image = String(obj.images?.[slot] || "");
      if (!image) continue;
      devices[slot] = {
        image,
        clickUrl: sharedClick,
        heading: { ...sharedHeading },
        subheading: { ...sharedSub },
      };
    }
  }

  return {
    _id: obj._id,
    title: obj.title,
    priority: obj.priority ?? 0,
    location,
    devices,
    savedDevices: BANNER_SLOT_KEYS.filter((s) => Boolean(devices[s]?.image)),
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    createdBy: obj.createdBy,
    updatedBy: obj.updatedBy,
  };
}

export async function getPrimeDisplayMode(): Promise<PrimeDisplayMode> {
  const doc = await PrimeDisplaySettings.findOne().sort({ updatedAt: -1 }).lean();
  const mode = doc?.displayMode;
  return mode === "shuffle" ? "shuffle" : "ranked";
}

export async function setPrimeDisplayMode(mode: string, userId?: string) {
  if (!PRIME_DISPLAY_MODES.includes(mode as PrimeDisplayMode)) {
    throw new Error("displayMode must be ranked or shuffle");
  }
  const displayMode = mode as PrimeDisplayMode;
  const existing = await PrimeDisplaySettings.findOne().sort({ updatedAt: -1 });
  if (!existing) {
    const created = await PrimeDisplaySettings.create({
      displayMode,
      ...(userId && Types.ObjectId.isValid(userId)
        ? { updatedBy: new Types.ObjectId(userId) }
        : {}),
    });
    return created.toObject();
  }
  existing.displayMode = displayMode;
  if (userId && Types.ObjectId.isValid(userId)) {
    existing.updatedBy = new Types.ObjectId(userId);
  }
  await existing.save();
  return existing.toObject();
}

export async function getSiteLogo() {
  const doc = await SiteLogo.findOne().sort({ updatedAt: -1 }).lean();
  return doc || null;
}

export async function upsertSiteLogo(
  file: Express.Multer.File,
  userId?: string,
): Promise<{ data: any; created: boolean }> {
  assertLogoFile(file);

  // Images: exact GIF sizes (220×80 / 300×120 / 500×165) or ~3.34:1; videos skip.
  if (!isLogoVideoFile(file)) {
    try {
      await assertLogoAspectRatio(file.buffer);
    } catch (error: any) {
      // SVG without intrinsic size: allow if sharp cannot read dimensions.
      const msg = String(error?.message || "");
      const isSvg =
        resolveLogoMimeType(file) === "image/svg+xml" ||
        String(file.originalname || "")
          .toLowerCase()
          .endsWith(".svg");
      if (!(isSvg && /could not read image dimensions/i.test(msg))) {
        throw error;
      }
    }
  }

  const mimetype = resolveLogoMimeType(file);
  const uploaded = await uploadFile({
    buffer: file.buffer,
    originalName: file.originalname || `logo${getLogoExtensionSafe(file)}`,
    mimetype,
    folder: "site/logo",
  });

  const updatedBy = userId ? new Types.ObjectId(userId) : undefined;
  const existing = await SiteLogo.findOne().sort({ updatedAt: -1 });

  if (existing) {
    existing.logoUrl = uploaded.url;
    if (updatedBy) existing.updatedBy = updatedBy;
    await existing.save();
    return { data: existing.toObject(), created: false };
  }

  const created = await SiteLogo.create({
    logoUrl: uploaded.url,
    updatedBy,
  });
  return { data: created.toObject(), created: true };
}

function getLogoExtensionSafe(file: Express.Multer.File) {
  const name = String(file.originalname || "").toLowerCase();
  const match = name.match(/(\.[a-z0-9]+)$/);
  if (match) return match[1];
  if (mimetypeLooksVideo(file.mimetype)) return ".mp4";
  return ".png";
}

function mimetypeLooksVideo(mime?: string) {
  return String(mime || "").toLowerCase().startsWith("video/");
}

export async function listSiteBanners() {
  const rows = await SiteBanner.find().sort({ priority: -1, updatedAt: -1 }).lean();
  return rows.map(normalizeBannerDoc);
}

export async function getSiteBannerById(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = await SiteBanner.findById(id).lean();
  return normalizeBannerDoc(doc);
}

function deviceMatchesLocation(
  location: {
    state?: string;
    city?: string;
    locality?: string;
    subLocality?: string;
    coverage?: Record<string, Record<string, string[]>>;
  },
  query: {
    state?: string;
    city?: string;
    locality?: string;
    subLocality?: string;
  },
) {
  const coverage =
    location?.coverage &&
    typeof location.coverage === "object" &&
    !Array.isArray(location.coverage)
      ? location.coverage
      : {};
  const coverageStates = Object.keys(coverage);

  const state = String(query.state || "").trim().toLowerCase();
  const city = String(query.city || "").trim().toLowerCase();
  const locality = String(query.locality || "").trim().toLowerCase();
  const subLocality = String(query.subLocality || "").trim().toLowerCase();

  // Sponsored-style multi location coverage
  if (coverageStates.length) {
    if (!state || !city) return false;
    for (const [st, cities] of Object.entries(coverage)) {
      if (String(st || "").trim().toLowerCase() !== state) continue;
      if (!cities || typeof cities !== "object") continue;
      for (const [c, locs] of Object.entries(cities)) {
        if (String(c || "").trim().toLowerCase() !== city) continue;
        const locList = Array.isArray(locs) ? locs : [];
        // Empty localities = whole city selected
        if (!locList.length) return true;
        if (!locality) return true;
        return locList.some(
          (l) => String(l || "").trim().toLowerCase() === locality,
        );
      }
    }
    return false;
  }

  // Legacy single flat location
  const bState = String(location?.state || "").trim().toLowerCase();
  const bCity = String(location?.city || "").trim().toLowerCase();
  const bLocality = String(location?.locality || "").trim().toLowerCase();
  const bSub = String(location?.subLocality || "").trim().toLowerCase();

  if (!bState && !bCity && !bLocality && !bSub) return true;
  if (bState && state && bState !== state) return false;
  if (bState && !state) return false;
  if (bCity && city && bCity !== city) return false;
  if (bCity && !city) return false;
  if (bLocality && locality && bLocality !== locality) return false;
  if (bLocality && !locality) return false;
  if (bSub && subLocality && bSub !== subLocality) return false;
  if (bSub && !subLocality) return false;
  return true;
}

export async function resolveSiteBanners(query: {
  state?: string;
  city?: string;
  locality?: string;
  subLocality?: string;
  device?: string;
}) {
  const banners = await listSiteBanners();
  const deviceRaw = String(query.device || "").trim().toLowerCase();
  const deviceFilter = isBannerSlot(deviceRaw) ? deviceRaw : "";
  const slots = deviceFilter ? [deviceFilter] : BANNER_SLOT_KEYS;

  type ResolveImage = {
    priority: number;
    image: string;
    heading: { enabled: boolean; html: string };
  };

  const byDevice: Record<BannerSlot, ResolveImage[]> = {
    desktop: [],
    laptop: [],
    tablet: [],
    mobile: [],
  };

  for (const banner of banners) {
    if (!banner) continue;
    if (!deviceMatchesLocation(banner.location || emptyLocation(), query)) {
      continue;
    }
    const priority = Number(banner.priority ?? 0) || 0;
    for (const slot of slots) {
      const block = banner.devices?.[slot];
      const image = String(block?.image || "").trim();
      if (!image) continue;
      byDevice[slot].push({
        priority,
        image,
        heading: {
          enabled: block?.heading?.enabled !== false,
          html: String(block?.heading?.html || ""),
        },
      });
    }
  }

  for (const slot of BANNER_SLOT_KEYS) {
    byDevice[slot].sort((a, b) => b.priority - a.priority);
  }

  const queryEcho = {
    device: deviceFilter,
    state: String(query.state || "").trim(),
    city: String(query.city || "").trim(),
    locality: String(query.locality || "").trim(),
    subLocality: String(query.subLocality || "").trim(),
  };

  if (deviceFilter) {
    return {
      query: queryEcho,
      [deviceFilter]: {
        images: byDevice[deviceFilter],
      },
    };
  }

  return {
    query: queryEcho,
    desktop: { images: byDevice.desktop },
    laptop: { images: byDevice.laptop },
    tablet: { images: byDevice.tablet },
    mobile: { images: byDevice.mobile },
  };
}

export async function createSiteBanner(
  body: Record<string, unknown>,
  userId?: string,
) {
  const title = String(body.title || "").trim();
  if (!title) throw new Error("Title is required");
  const priority = normalizePriority(body.priority);
  const location =
    body.location && typeof body.location === "object"
      ? normalizeLocation({
          ...(body.location as Record<string, unknown>),
          coverage:
            (body.location as Record<string, unknown>).coverage ??
            body.coverage ??
            {},
        })
      : normalizeLocation({
          state: body.state,
          city: body.city,
          locality: body.locality,
          subLocality: body.subLocality ?? body.sub_locality,
          coverage: body.coverage,
        });

  const doc = await SiteBanner.create({
    title,
    priority,
    location,
    devices: emptyDevices(),
    createdBy: userId ? new Types.ObjectId(userId) : undefined,
    updatedBy: userId ? new Types.ObjectId(userId) : undefined,
  });

  return normalizeBannerDoc(doc);
}

export async function updateSiteBannerMeta(
  id: string,
  body: Record<string, unknown>,
  userId?: string,
) {
  const existing = (await SiteBanner.findById(id)) as ISiteBanner | null;
  if (!existing) return null;

  if (body.title !== undefined) {
    const title = String(body.title || "").trim();
    if (!title) throw new Error("Title is required");
    existing.title = title;
  }
  if (body.priority !== undefined) {
    existing.priority = normalizePriority(body.priority);
  }

  const hasLocationPatch =
    body.coverage !== undefined ||
    body.location !== undefined ||
    body.state !== undefined ||
    body.city !== undefined ||
    body.locality !== undefined ||
    body.subLocality !== undefined ||
    body.sub_locality !== undefined;

  if (hasLocationPatch) {
    // Full replace when `location` object is sent (edit add/remove must persist).
    let nextLocation: SiteBannerLocation;
    if (body.location !== undefined && typeof body.location === "object") {
      const locSrc = body.location as Record<string, unknown>;
      nextLocation = normalizeLocation({
        state: locSrc.state ?? "",
        city: locSrc.city ?? "",
        locality: locSrc.locality ?? "",
        subLocality: locSrc.subLocality ?? locSrc.sub_locality ?? "",
        coverage: locSrc.coverage ?? {},
      });
    } else {
      const current = existing.location || emptyLocation();
      nextLocation = normalizeLocation({
        state: body.state !== undefined ? body.state : current.state,
        city: body.city !== undefined ? body.city : current.city,
        locality:
          body.locality !== undefined ? body.locality : current.locality,
        subLocality:
          body.subLocality !== undefined || body.sub_locality !== undefined
            ? body.subLocality ?? body.sub_locality
            : current.subLocality,
        coverage:
          body.coverage !== undefined
            ? body.coverage
            : current.coverage || {},
      });
    }
    // Plain object + markModified so Mixed `coverage` always persists.
    existing.set("location", {
      state: nextLocation.state || "",
      city: nextLocation.city || "",
      locality: nextLocation.locality || "",
      subLocality: nextLocation.subLocality || "",
      coverage: nextLocation.coverage || {},
    });
    existing.markModified("location");
    existing.markModified("location.coverage");
  }

  if (userId) existing.updatedBy = new Types.ObjectId(userId);
  await existing.save();
  return normalizeBannerDoc(existing);
}

export async function upsertBannerDevice(
  id: string,
  slotRaw: string,
  body: Record<string, unknown>,
  file: Express.Multer.File | undefined,
  userId?: string,
) {
  if (!isBannerSlot(slotRaw)) {
    throw new Error(`Invalid device slot. Use: ${BANNER_SLOT_KEYS.join(", ")}`);
  }
  const slot = slotRaw;

  const existing = (await SiteBanner.findById(id)) as ISiteBanner | null;
  if (!existing) return null;

  if (!existing.devices) {
    existing.set("devices", emptyDevices());
  }

  const current = (existing.devices as any)[slot] || emptyDevices()[slot];
  let imageUrl = String(current.image || "");

  if (file) {
    assertWebpFile(file, BANNER_SLOTS[slot].label);
    await assertBannerDimensions(file.buffer, slot);
    const uploaded = await uploadFile({
      buffer: file.buffer,
      originalName: file.originalname || `${slot}.webp`,
      mimetype: "image/webp",
      folder: `site/banners/${slot}`,
    });
    imageUrl = uploaded.url;
  }

  if (!imageUrl) {
    throw new Error(`${BANNER_SLOTS[slot].label} image is required`);
  }

  const clickUrl = normalizeClickUrl(body.clickUrl ?? current.clickUrl, {
    optional: true,
  });
  const heading = normalizeTextBlock(body, "heading", current.heading);
  const subheading = normalizeTextBlock(body, "subheading", current.subheading);

  // Device creatives only — location lives on the banner once.
  (existing.devices as any)[slot] = {
    image: imageUrl,
    clickUrl,
    heading,
    subheading,
  };
  existing.markModified("devices");
  if (userId) existing.updatedBy = new Types.ObjectId(userId);
  await existing.save();
  return normalizeBannerDoc(existing);
}

export async function clearBannerDevice(
  id: string,
  slotRaw: string,
  userId?: string,
) {
  if (!isBannerSlot(slotRaw)) {
    throw new Error(`Invalid device slot. Use: ${BANNER_SLOT_KEYS.join(", ")}`);
  }
  const existing = (await SiteBanner.findById(id)) as ISiteBanner | null;
  if (!existing) return null;
  if (!existing.devices) existing.set("devices", emptyDevices());
  (existing.devices as any)[slotRaw] = emptyDevices()[slotRaw];
  existing.markModified("devices");
  if (userId) existing.updatedBy = new Types.ObjectId(userId);
  await existing.save();
  return normalizeBannerDoc(existing);
}

export async function deleteSiteBanner(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return SiteBanner.findByIdAndDelete(id).lean();
}

/** @deprecated legacy helpers kept for route compile during transition */
export async function createSiteBannerLegacy() {
  throw new Error("Use create banner shell + device upsert APIs");
}
