export const BANNER_SLOTS = {
  desktop: { width: 1920, height: 330, label: "Desktop" },
  laptop: { width: 1440, height: 275, label: "Laptop" },
  tablet: { width: 1536, height: 422, label: "Tablet" },
  mobile: { width: 1080, height: 495, label: "Mobile" },
} as const;

export type BannerSlot = keyof typeof BANNER_SLOTS;

export const BANNER_SLOT_KEYS = Object.keys(BANNER_SLOTS) as BannerSlot[];

export const BANNER_LEGACY_SLOT_SIZES: Record<
  BannerSlot,
  Array<{ width: number; height: number }>
> = {
  desktop: [
    { width: 1920, height: 360 },
    { width: 1920, height: 300 },
    { width: 1920, height: 420 },
    { width: 1920, height: 600 },
  ],
  laptop: [
    { width: 1440, height: 300 },
    { width: 1440, height: 250 },
    { width: 1440, height: 350 },
    { width: 1440, height: 500 },
  ],
  tablet: [
    { width: 1536, height: 461 },
    { width: 1536, height: 384 },
    { width: 1536, height: 538 },
    { width: 1536, height: 768 },
  ],
  mobile: [
    { width: 1080, height: 540 },
    { width: 1080, height: 450 },
    { width: 1080, height: 630 },
    { width: 1080, height: 900 },
  ],
};

export const BANNER_MAX_BYTES = 1 * 1024 * 1024; // 1 MB
export const LOGO_MAX_BYTES = 4 * 1024 * 1024; // 4 MB
export const LOGO_ASPECT_RATIO = 167 / 50; // ~3.34:1
export const LOGO_ASPECT_TOLERANCE = 0.12;

/** Recommended logo pixel sizes (GIF and other rasters). */
export const LOGO_ALLOWED_PIXEL_SIZES = [
  { width: 220, height: 80 },
  { width: 300, height: 120 },
  { width: 500, height: 165 },
  { width: 670, height: 220 },
] as const;
export const LOGO_SIZE_TOLERANCE_PX = 4;

/** Logo upload formats (images + short video). */
export const LOGO_IMAGE_EXTENSIONS = [".png", ".svg", ".gif", ".webp"] as const;
export const LOGO_VIDEO_EXTENSIONS = [".mp4", ".webm"] as const;
export const LOGO_ALLOWED_EXTENSIONS = [
  ...LOGO_IMAGE_EXTENSIONS,
  ...LOGO_VIDEO_EXTENSIONS,
] as const;

export const LOGO_ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/svg+xml",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

/** Allow ±4px drift from recommended banner sizes */
export const BANNER_SIZE_TOLERANCE_PX = 4;
