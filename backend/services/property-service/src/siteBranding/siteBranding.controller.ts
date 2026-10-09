import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import * as service from "./siteBranding.service";

function userIdOf(req: AuthRequest) {
  return req.user?.id;
}

function clientError(message = "") {
  return /required|only|below|expected|must|when|invalid|too long|allowed formats/i.test(message);
}

export async function getPrimeDisplay(_req: Request, res: Response) {
  try {
    const displayMode = await service.getPrimeDisplayMode();
    return res.json({ success: true, data: { displayMode } });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load prime display mode",
    });
  }
}

export async function updatePrimeDisplay(req: AuthRequest, res: Response) {
  try {
    const data = await service.setPrimeDisplayMode(
      String(req.body?.displayMode || ""),
      userIdOf(req),
    );
    return res.json({
      success: true,
      data: { displayMode: data.displayMode },
      message: "Prime display mode saved",
    });
  } catch (error: any) {
    return res.status(clientError(error.message) ? 400 : 500).json({
      success: false,
      message: error.message || "Failed to save prime display mode",
    });
  }
}

export async function getLogo(_req: Request, res: Response) {
  try {
    const logo = await service.getSiteLogo();
    return res.json({ success: true, data: logo });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load logo",
    });
  }
}

export async function upsertLogo(req: AuthRequest, res: Response) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: "Logo file is required (PNG, SVG, GIF, WebP, MP4, or WebM)",
      });
    }
    const { data, created } = await service.upsertSiteLogo(file, userIdOf(req));
    return res.status(created ? 201 : 200).json({
      success: true,
      data,
      created,
      message: created ? "Logo created" : "Logo updated",
    });
  } catch (error: any) {
    return res.status(clientError(error.message) ? 400 : 500).json({
      success: false,
      message: error.message || "Failed to save logo",
    });
  }
}

export async function listBanners(_req: Request, res: Response) {
  try {
    const data = await service.listSiteBanners();
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to list banners",
    });
  }
}

export async function resolveBanners(req: Request, res: Response) {
  try {
    const data = await service.resolveSiteBanners({
      state: String(req.query.state || ""),
      city: String(req.query.city || ""),
      locality: String(req.query.locality || ""),
      subLocality: String(req.query.subLocality || req.query.sub_locality || ""),
      device: String(req.query.device || ""),
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to resolve banners",
    });
  }
}

export async function getBanner(req: Request, res: Response) {
  try {
    const data = await service.getSiteBannerById(String(req.params.id));
    if (!data) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load banner",
    });
  }
}

/** Create banner shell (title + priority). Devices saved separately. */
export async function createBanner(req: AuthRequest, res: Response) {
  try {
    const data = await service.createSiteBanner(req.body || {}, userIdOf(req));
    return res.status(201).json({ success: true, data, message: "Banner created" });
  } catch (error: any) {
    return res.status(clientError(error.message) ? 400 : 500).json({
      success: false,
      message: error.message || "Failed to create banner",
    });
  }
}

export async function updateBanner(req: AuthRequest, res: Response) {
  try {
    const data = await service.updateSiteBannerMeta(
      String(req.params.id),
      req.body || {},
      userIdOf(req),
    );
    if (!data) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }
    return res.json({ success: true, data, message: "Banner updated" });
  } catch (error: any) {
    return res.status(clientError(error.message) ? 400 : 500).json({
      success: false,
      message: error.message || "Failed to update banner",
    });
  }
}

export async function upsertDevice(req: AuthRequest, res: Response) {
  try {
    const file =
      (req.file as Express.Multer.File | undefined) ||
      (req.files as any)?.image?.[0];
    const data = await service.upsertBannerDevice(
      String(req.params.id),
      String(req.params.slot),
      req.body || {},
      file,
      userIdOf(req),
    );
    if (!data) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }
    return res.json({
      success: true,
      data,
      message: `${req.params.slot} device saved`,
    });
  } catch (error: any) {
    return res.status(clientError(error.message) ? 400 : 500).json({
      success: false,
      message: error.message || "Failed to save device",
    });
  }
}

export async function clearDevice(req: AuthRequest, res: Response) {
  try {
    const data = await service.clearBannerDevice(
      String(req.params.id),
      String(req.params.slot),
      userIdOf(req),
    );
    if (!data) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }
    return res.json({ success: true, data, message: "Device cleared" });
  } catch (error: any) {
    return res.status(clientError(error.message) ? 400 : 500).json({
      success: false,
      message: error.message || "Failed to clear device",
    });
  }
}

export async function deleteBanner(req: AuthRequest, res: Response) {
  try {
    const data = await service.deleteSiteBanner(String(req.params.id));
    if (!data) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }
    return res.json({ success: true, message: "Banner deleted" });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete banner",
    });
  }
}
