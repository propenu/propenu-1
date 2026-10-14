// src/middlewares/fallbackCoerce.ts
import { Request, Response, NextFunction } from "express";

export interface FallbackCoerceConfig {
  numberKeys?: string[];   // keys to coerce to numbers
  booleanKeys?: string[];  // keys to coerce to booleans ("true"/"false")
  trimKeys?: string[];     // keys to trim whitespace from strings
  preserveEmptyKeys?: string[]; // keep "" so a cleared field is actually saved
}

/**
 * Factory: returns middleware that coerces/normalizes common form-data values.
 * Use AFTER multer (so req.body is populated) and BEFORE validation.
 */
export function createFallbackCoerce(config: FallbackCoerceConfig = {}) {
  const numberSet = new Set(config.numberKeys ?? []);
  const booleanSet = new Set(config.booleanKeys ?? []);
  const trimSet = new Set(config.trimKeys ?? []);
  const preserveEmptySet = new Set(config.preserveEmptyKeys ?? []);

  return function fallbackCoerce(req: Request, _res: Response, next: NextFunction) {
    if (!req.body) return next();

    // Trim keys if configured
    for (const key of Object.keys(req.body)) {
      if (trimSet.has(key) && typeof req.body[key] === "string") {
        req.body[key] = (req.body[key] as string).trim();
      }
    }

    // Coerce numbers
    for (const key of numberSet) {
      const v = req.body[key];
      if (typeof v === "string") {
        const n = Number(v);
        if (!Number.isNaN(n)) {
          req.body[key] = n;
        }
      }
    }

    // Coerce booleans
    for (const key of booleanSet) {
      const v = req.body[key];
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (s === "true" || s === "false") {
          req.body[key] = s === "true";
        }
      }
    }

    // Convert empty string to undefined for all keys (optional but helpful).
    // Listed keys stay "" so clearing launch/possession actually removes the saved value.
    for (const key of Object.keys(req.body)) {
      if (req.body[key] === "" && !preserveEmptySet.has(key)) {
        req.body[key] = undefined;
      }
    }

    return next();
  };
}

/**
 * Default instance for quick use (hotfix)
 * Coerces a common set of fields used in your schema
 */
export const fallbackCoerceDefault = createFallbackCoerce({
  numberKeys: ["projectArea", "totalTowers", "totalUnits", "availableUnits", "priceFrom", "priceTo"],
  booleanKeys: ["isFeatured"],
  trimKeys: ["title", "slug"],
  preserveEmptyKeys: ["launchDate", "possessionDate"],
});

export default fallbackCoerceDefault;
