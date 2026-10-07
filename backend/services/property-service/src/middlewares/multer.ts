// import multer from "multer";
// import { Request, Response, NextFunction } from "express";

// /** ✅ Hardcoded MIME types */
// const IMAGE_MIME_TYPES = [
//   "image/jpeg",
//   "image/png",
//   "image/webp",
//   "image/avif",
//   "image/gif",
// ];
// const VIDEO_MIME_TYPES = [
//   "video/mp4",
//   "video/mpeg",
//   "video/quicktime",
//   "video/webm",
//   "video/x-msvideo",
// ];

// /** ✅ Per-file max sizes */
// const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 1MB
// const VIDEO_MAX_BYTES = 20 * 1024 * 1024; // 20MB
// const MAX_TOTAL_SIZE = 80 * 1024 * 1024;

// /** ✅ Multer setup (memory storage for S3 upload) */
// const memory = multer.memoryStorage();

// const upload = multer({
//   storage: memory,
//   limits: { fileSize: 100 * 1024 * 1024 }, // 100MB hard global limit
// });

// /**
//  * ✅ Unified upload middleware:
//  * - Accepts multiple images and videos (fields: `images`, `videos`)
//  * - Validates MIME type and per-file size
//  */
// export const uploadMedia = (req: Request, res: Response, next: NextFunction) => {
//   const handler = upload.fields([
//     { name: "images", maxCount: 12 },
//     { name: "videos", maxCount: 3 },
//   ]);

//   handler(req, res, (err: any) => {
//     if (err) {
//       console.error("❌ Multer parsing error:", err);
//       return res.status(400).json({ success: false, message: err.message });
//     }

//     const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;

//     /** ✅ Validate images */
//     const allImages = files?.images || [];
//     for (const f of allImages) {
//       if (!IMAGE_MIME_TYPES.includes(f.mimetype)) {
//         return res.status(400).json({
//           success: false,
//           message: `Invalid image type: ${f.originalname} (${f.mimetype})`,
//         });
//       }

//       if (f.size > IMAGE_MAX_BYTES) {
//         return res.status(400).json({
//           success: false,
//           message: `Image too large: ${f.originalname} (${Math.round(
//             f.size / 1024
//           )} KB). Max ${Math.round(IMAGE_MAX_BYTES / 1024)} KB allowed.`,
//         });
//       }
//     }

//     /** ✅ Validate videos */
//     const allVideos = files?.videos || [];
//     for (const f of allVideos) {
//       if (!VIDEO_MIME_TYPES.includes(f.mimetype)) {
//         return res.status(400).json({
//           success: false,
//           message: `Invalid video type: ${f.originalname} (${f.mimetype})`,
//         });
//       }

//       if (f.size > VIDEO_MAX_BYTES) {
//         return res.status(400).json({
//           success: false,
//           message: `Video too large: ${f.originalname} (${Math.round(
//             f.size / 1024 / 1024
//           )} MB). Max ${Math.round(VIDEO_MAX_BYTES / 1024 / 1024)} MB allowed.`,
//         });
//       }
//     }

//     /** ✅ Everything passed */
//     next();
//   });
// };

import multer from "multer";
import path from "path";
import fs from "fs";
import { Request, Response, NextFunction } from "express";

/* =========================
   Create folders if missing
========================= */

const imageDir = path.join(process.cwd(), "uploads/images");
const videoDir = path.join(process.cwd(), "uploads/videos");
const documentDir = path.join(process.cwd(), "uploads/documents");

function ensureUploadDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureUploadDir(imageDir);
ensureUploadDir(videoDir);
ensureUploadDir(documentDir);

/* =========================
   MIME TYPES
========================= */

const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];

const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
];

const DOCUMENT_MIME_TYPES = ["application/pdf"];

/* =========================
   LIMITS
========================= */

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const VIDEO_MAX_BYTES = 20 * 1024 * 1024;
const BROCHURE_MAX_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 80 * 1024 * 1024;
// Busboy's default text-field cap is 1MB. Details saves stringify gallery
// metadata and other objects into single parts, which crosses that cap.
const FIELD_MAX_BYTES = 8 * 1024 * 1024;

/* =========================
   STORAGE
========================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let targetDir = documentDir;

    if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
      targetDir = imageDir;
    } else if (VIDEO_MIME_TYPES.includes(file.mimetype)) {
      targetDir = videoDir;
    } else if (DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      targetDir = documentDir;
    }

    ensureUploadDir(targetDir);
    cb(null, targetDir);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);

    const fileName = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;

    cb(null, fileName);
  },
});

/* =========================
   MULTER
========================= */

const upload = multer({
  storage,
  limits: {
    files: 120,
    fileSize: VIDEO_MAX_BYTES,
    fieldSize: FIELD_MAX_BYTES,
  },
});

/* =========================
   MIDDLEWARE
========================= */

export const uploadMedia = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const fieldSizeLimits: Record<string, number> = {
    images: IMAGE_MAX_BYTES,
    heroImage: IMAGE_MAX_BYTES,
    aboutImage: IMAGE_MAX_BYTES,
    logo: IMAGE_MAX_BYTES,
    videos: VIDEO_MAX_BYTES,
    heroVideo: VIDEO_MAX_BYTES,
    brochure: BROCHURE_MAX_BYTES,
  };

  const handler = upload.fields([
    { name: "images", maxCount: 12 },
    { name: "videos", maxCount: 3 },
    { name: "heroImage", maxCount: 1 },
    { name: "heroVideo", maxCount: 1 },
    { name: "logo", maxCount: 1 },
    { name: "aboutImage", maxCount: 1 },
    { name: "brochure", maxCount: 1 },
    { name: "documents", maxCount: 20 },
    { name: "leaseDocuments", maxCount: 20 },
    { name: "fireNOCFile", maxCount: 1 },
    { name: "occupancyCertificateFile", maxCount: 1 },
    { name: "soilTestReport", maxCount: 1 },
    { name: "conversionCertificateFile", maxCount: 1 },
    { name: "encumbranceCertificateFile", maxCount: 1 },
    { name: "galleryFiles", maxCount: 50 },
    { name: "bhkPlanFiles", maxCount: 50 },
    {name:"verificationDocuments", maxCount: 5}
  ]);

  handler(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      console.error("Multer upload error:", err);
      const field = err.field ? `: ${err.field}` : "";
      return res.status(400).json({
        success: false,
        message: `${err.message}${field}`,
      });
    }

    if (err) {
      console.error("Upload failed:", err);
      return res.status(400).json({
        success: false,
        message: err.message || "Upload failed",
      });
    }

    const files =
      (req.files as {
        [field: string]: Express.Multer.File[];
      }) || {};

    const uploadedFiles = Object.values(files).flat();

    for (const file of uploadedFiles) {
      const fieldLimit = fieldSizeLimits[file.fieldname];

      if (fieldLimit && file.size > fieldLimit) {
        const maxSizeLabel =
          fieldLimit >= 1024 * 1024
            ? `${Math.round(fieldLimit / 1024 / 1024)}MB`
            : `${Math.round(fieldLimit / 1024)}KB`;

        return res.status(400).json({
          success: false,
          message: `${file.fieldname} file too large: ${file.originalname}. Max ${maxSizeLabel} allowed.`,
        });
      }
    }

    const totalSize = uploadedFiles.reduce(
      (sum, file) => sum + file.size,
      0,
    );

    if (totalSize > MAX_TOTAL_SIZE) {
      return res.status(400).json({
        success: false,
        message: "Total upload size exceeded 80MB",
      });
    }

    next();
  });
};
