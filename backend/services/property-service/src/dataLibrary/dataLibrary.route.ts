import express from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { authMiddleware } from "../middlewares/authMiddleware";
import { requirePermission } from "../middlewares/requirePermission";
import {
  createDataLibraryItem,
  deleteDataLibraryItem,
  downloadDataLibraryItem,
  exportDataLibraryTable,
  getDataLibraryItem,
  getDataLibraryTable,
  listDataLibrary,
  listDataLibraryActivity,
  listDeletedDataLibrary,
  restoreDataLibraryItem,
  syncDataLibraryTable,
  updateDataLibraryItem,
} from "./dataLibrary.controller";

const router = express.Router();

export const DATA_LIBRARY_MAX_FILE_MB = 25;

const allowedExtensions = new Set([
  ".pdf",
  ".xls", ".xlsx", ".csv", ".tsv", ".ods",
  ".doc", ".docx", ".odt", ".rtf", ".txt", ".md",
  ".ppt", ".pptx", ".odp",
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic",
  ".json", ".xml", ".zip",
]);

const dataLibraryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DATA_LIBRARY_MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      return cb(new Error(`File type ${ext || "(none)"} is not supported`));
    }
    return cb(null, true);
  },
});

function acceptOptionalFile(req: Request, res: Response, next: NextFunction) {
  dataLibraryUpload.single("file")(req, res, (err: any) => {
    if (err) {
      const message =
        err?.code === "LIMIT_FILE_SIZE"
          ? `File must be below ${DATA_LIBRARY_MAX_FILE_MB} MB`
          : err.message || "File upload failed";
      return res.status(400).json({ message });
    }
    return next();
  });
}

router.use(authMiddleware);

router.get("/", requirePermission("data_library:view"), listDataLibrary);
router.get("/activity", requirePermission("data_library:view"), listDataLibraryActivity);
router.get("/deleted", requirePermission("data_library:view"), listDeletedDataLibrary);
router.post(
  "/",
  requirePermission("data_library:create"),
  acceptOptionalFile,
  createDataLibraryItem,
);
router.get("/:id", requirePermission("data_library:view"), getDataLibraryItem);
router.get("/:id/download", requirePermission("data_library:download"), downloadDataLibraryItem);
router.get("/:id/table", requirePermission("data_library:view"), getDataLibraryTable);
router.get("/:id/table/export", requirePermission("data_library:download"), exportDataLibraryTable);
router.put("/:id/table", requirePermission("data_library:update"), syncDataLibraryTable);
router.post("/:id/restore", requirePermission("data_library:delete"), restoreDataLibraryItem);
router.patch("/:id", requirePermission("data_library:update"), updateDataLibraryItem);
router.delete("/:id", requirePermission("data_library:delete"), deleteDataLibraryItem);

export default router;
