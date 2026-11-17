import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

const REGION = process.env.AWS_REGION!;
const BUCKET = process.env.AWS_S3_BUCKET!;

const s3 = new S3Client({
  region: REGION,
});

const tempFileBufferCache = new Map<string, Buffer>();

function getTempFileBuffer(filePath: string) {
  const resolvedPath = path.resolve(filePath);
  const cached = tempFileBufferCache.get(resolvedPath);
  if (cached) return cached;

  const body = fs.readFileSync(resolvedPath);
  tempFileBufferCache.set(resolvedPath, body);

  setTimeout(() => {
    tempFileBufferCache.delete(resolvedPath);
  }, 5 * 60 * 1000).unref();

  return body;
}

export type UploadFileOptions = {
  buffer?: Buffer;
  filePath?: string;
  originalName: string;
  mimetype?: string;
  folder?: string;
  entityId?: string;
  propertyId?: string;
};

export type UploadResult = {
  key: string;
  url: string;
  filename: string;
  mimetype?: string;
  size: number;
};

function buildKey({
  folder = "uploads",
  entityId,
  originalName,
}: UploadFileOptions) {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);

  const safeFolder = folder.replace(/^\/+|\/+$/g, "");
  const safeId = entityId ? `/${entityId}` : "";

  const unique = `${base}-${randomUUID()}${ext}`;

  return `${safeFolder}${safeId}/${unique}`.replace(/\/+/g, "/");
}

export function cleanupUploadedFile(filePath?: string) {
  if (!filePath) return;

  try {
    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    const resolvedPath = path.resolve(filePath);
    const relativePath = path.relative(uploadsRoot, resolvedPath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      console.warn("Skipping temp file cleanup outside uploads:", filePath);
      return;
    }

    if (fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
    }
  } catch (error: any) {
    console.error("Failed deleting temp upload:", filePath, error?.message || error);
  }
}

export async function uploadFile(
  opts: UploadFileOptions,
): Promise<UploadResult> {
  const {
    buffer,
    filePath,
    originalName,
    mimetype = "application/octet-stream",
  } = opts;

  if (!buffer && !filePath) {
    throw new Error("uploadFile requires either buffer or filePath");
  }

  const key = buildKey(opts);
  const filename = path.basename(key);

  const body = buffer ? buffer : getTempFileBuffer(filePath!);

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: mimetype,
    }),
  );

  let size = 0;

  if (buffer) {
    size = buffer.length;
  } else {
    size = body.length;
    cleanupUploadedFile(filePath);
  }

  const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(
    key,
  )}`;

  return {
    key,
    url,
    filename,
    mimetype,
    size,
  };
}

export async function getUploadedObject(key: string) {
  return s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function deleteUploadedObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
