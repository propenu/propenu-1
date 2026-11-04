import { NextFunction, Request, Response } from "express";
import multer from "multer";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const MAX_UPLOAD_FILES = 10;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_UPLOAD_FILES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`${file.originalname}: only images, PDF, Word or Excel files are allowed`));
  },
});

/** Accepts up to 10 files in the given field; multer errors become 400 responses. */
export function uploadDocuments(field: string) {
  const handler = upload.array(field, MAX_UPLOAD_FILES);
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (error: unknown) => {
      if (!error) return next();
      const message =
        error instanceof multer.MulterError
          ? error.code === "LIMIT_FILE_SIZE"
            ? "Each file must be 10 MB or smaller"
            : error.code === "LIMIT_FILE_COUNT"
              ? `Upload at most ${MAX_UPLOAD_FILES} files at a time`
              : error.message
          : error instanceof Error
            ? error.message
            : "Upload failed";
      return res.status(400).json({ success: false, message });
    });
  };
}
