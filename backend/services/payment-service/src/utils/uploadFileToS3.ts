import AWS from "aws-sdk";
import crypto from "crypto";
import path from "path";

const s3 = new AWS.S3({
  region: process.env.AWS_REGION || "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY!,
  secretAccessKey: process.env.AWS_SECRET_KEY!,
});

export type UploadedAttachment = {
  name: string;
  url: string;
  key: string;
  mimeType: string;
  size: number;
};

const safeName = (name: string) =>
  path
    .basename(name || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80) || "file";

export async function uploadFileToS3(
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  folder: string,
): Promise<UploadedAttachment> {
  const name = safeName(file.originalname);
  const key = `${folder.replace(/\/+$/, "")}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${name}`;
  const result = await s3
    .upload({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || "application/octet-stream",
      ContentDisposition: `inline; filename="${name}"`,
    })
    .promise();

  return {
    name: path.basename(file.originalname || name).slice(0, 160),
    url: result.Location,
    key,
    mimeType: file.mimetype,
    size: file.size,
  };
}
