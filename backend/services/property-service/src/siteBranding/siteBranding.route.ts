import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  requireAnyPermission,
  requirePermission,
} from "../middlewares/requirePermission";
import {
  clearDevice,
  createBanner,
  deleteBanner,
  getBanner,
  getLogo,
  getPrimeDisplay,
  listBanners,
  resolveBanners,
  updateBanner,
  upsertDevice,
  upsertLogo,
  updatePrimeDisplay,
} from "./siteBranding.controller";
import { BANNER_MAX_BYTES, LOGO_MAX_BYTES } from "./siteBranding.constants";
import { isAllowedLogoFile } from "./siteBranding.validation";

const router = express.Router();

const deviceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BANNER_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    if (file.mimetype === "image/webp" || name.endsWith(".webp")) {
      return cb(null, true);
    }
    return cb(new Error("Only WebP images are allowed for banners"));
  },
});

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedLogoFile(file)) {
      return cb(null, true);
    }
    return cb(
      new Error("Logo: allowed formats are PNG, SVG, GIF, WebP, MP4, WebM"),
    );
  },
});

function handleLogoUpload(req: Request, res: Response, next: NextFunction) {
  logoUpload.single("logo")(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || "Upload failed" });
    }
    return next();
  });
}

function handleDeviceUpload(req: Request, res: Response, next: NextFunction) {
  deviceUpload.single("image")(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || "Upload failed" });
    }
    return next();
  });
}

const canWriteLogo = requireAnyPermission([
  "site_banner:update",
  "site_banner:create",
]);

// Prime homepage order — GET is public (no token)
router.get("/prime-display", getPrimeDisplay);
router.patch(
  "/prime-display",
  authMiddleware,
  requirePermission("site_banner:update"),
  updatePrimeDisplay,
);

// Logo — GET is public (no token)
router.get("/logo", getLogo);
router.post("/logo", authMiddleware, canWriteLogo, handleLogoUpload, upsertLogo);
router.patch("/logo", authMiddleware, canWriteLogo, handleLogoUpload, upsertLogo);

// Banners — all GET endpoints are public (no token)
router.get("/banners/resolve", resolveBanners);
router.get("/banners", listBanners);
router.get("/banners/:id", getBanner);

router.post(
  "/banners",
  authMiddleware,
  requirePermission("site_banner:create"),
  createBanner,
);

router.patch(
  "/banners/:id",
  authMiddleware,
  requirePermission("site_banner:update"),
  updateBanner,
);

router.patch(
  "/banners/:id/devices/:slot",
  authMiddleware,
  requirePermission("site_banner:update"),
  handleDeviceUpload,
  upsertDevice,
);

// Allow create permission to save first device on new banner
router.post(
  "/banners/:id/devices/:slot",
  authMiddleware,
  requireAnyPermission(["site_banner:create", "site_banner:update"]),
  handleDeviceUpload,
  upsertDevice,
);

router.delete(
  "/banners/:id/devices/:slot",
  authMiddleware,
  requirePermission("site_banner:update"),
  clearDevice,
);

router.delete(
  "/banners/:id",
  authMiddleware,
  requirePermission("site_banner:delete"),
  deleteBanner,
);

export default router;
