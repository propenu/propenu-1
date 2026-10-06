import { Response } from "express";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import User from "../models/userModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import { genOtp } from "../utils/genOtp";
import { saveOtpToRedis, verifyAndConsumeOtpWithReason } from "../utils/saveOtpRedis";
import { sendOtpWhatsApp } from "../utils/whatsapp";
import s3 from "../config/s3";

const allowedBuilderProfileFields = [
  "name",
  "companyName",
  "email",
  "address",
  "locality",
  "city",
  "state",
  "pincode",
] as const;

const clearableBuilderProfileFields = new Set<string>([
  "email",
  "locality",
  "city",
  "state",
  "pincode",
]);

const builderProfileFieldLabels: Record<string, string> = {
  name: "Name",
  companyName: "Company name",
  email: "Email",
  address: "Office address",
  locality: "Locality",
  city: "City",
  state: "State",
  pincode: "Pincode",
};

type MulterFiles =
  | {
      avatar?: Express.Multer.File[];
      logo?: Express.Multer.File[];
      coverImage?: Express.Multer.File[];
    }
  | undefined;

const formatMedia = (media: any) =>
  media?.url
    ? {
        url: media.url,
        key: media.key || null,
      }
    : null;

const formatBuilderOrgProfile = (user: any) => {
  const bp = user.builderProfile || {};
  return {
    bio: bp.bio || "",
    website: bp.website || "",
    gstin: bp.gstin || "",
    cin: bp.cin || "",
    officeLocations: Array.isArray(bp.officeLocations)
      ? bp.officeLocations.filter(Boolean)
      : [],
    logo: formatMedia(bp.logo),
    avatar: formatMedia(bp.avatar),
    coverImage: formatMedia(bp.coverImage),
    rera: {
      reraId: bp.rera?.reraId || "",
      isVerified: bp.rera?.isVerified === true,
    },
  };
};

const formatBuilderProfile = (user: any, role: any) => ({
  id: user._id,
  name: user.name,
  companyName: user.companyName,
  email: user.email,
  phone: user.phone,
  phoneHistory: user.phoneHistory ?? [],
  address: user.address,
  locality: user.locality,
  city: user.city,
  state: user.state,
  pincode: user.pincode,
  accountStatus: user.accountStatus,
  phoneVerified: user.phoneVerified,
  isActive: user.isActive !== false,
  roleId: role ? String(role._id) : null,
  roleName: role ? role.name : null,
  permissions: role ? role.permissions : [],
  builderProfile: formatBuilderOrgProfile(user),
});

const isPrimaryBuilder = (req: AuthRequest) => req.user?.roleName === "builder";
const isBuilderProfileAdmin = (req: AuthRequest) =>
  req.user?.roleName === "admin" || req.user?.roleName === "super_admin";

const normalizePhoneDigits = (phone?: string) => phone?.replace(/\D/g, "");

const getPhoneLookupValues = (phone?: string) => {
  const trimmed = phone?.trim();
  const digits = normalizePhoneDigits(trimmed);

  if (!trimmed || !digits) return [];

  const values = new Set<string>([trimmed, digits]);
  const withoutIndiaCode =
    digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;

  if (withoutIndiaCode.length === 10) {
    values.add(withoutIndiaCode);
    values.add(`91${withoutIndiaCode}`);
    values.add(`+91${withoutIndiaCode}`);
  }

  return [...values];
};

const getPhoneChangeOtpKey = (userId: string, phone: string) =>
  `builder-phone-change:${userId}:${phone}`;

const validatePhoneForOtp = (phone?: string) => {
  const trimmed = phone?.trim();

  if (!trimmed) {
    return "Phone number is required";
  }

  if (!/^\+?[1-9]\d{6,14}$/.test(trimmed)) {
    return "Invalid phone number";
  }

  return "";
};

const assertTargetIsBuilder = (user: any) => {
  const role: any = user?.roleId;
  return role?.name === "builder";
};

const pickString = (body: Record<string, any>, ...keys: string[]) => {
  for (const key of keys) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string") return value;
    if (typeof value === "object" && typeof value?.toString === "function") {
      return String(value);
    }
  }
  return undefined;
};

const parseBool = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return undefined;
};

const parseOfficeLocations = (body: Record<string, any>) => {
  const raw =
    body.officeLocations ??
    body["officeLocations[]"] ??
    body.officeLocation;
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return undefined;
};

const buildProfileUpdates = (body: Record<string, unknown>) => {
  const updates: Record<string, unknown> = {};

  for (const key of allowedBuilderProfileFields) {
    if (body[key] === undefined) continue;

    if (typeof body[key] === "string") {
      const cleaned = body[key].trim();
      if (clearableBuilderProfileFields.has(key) && cleaned === "") {
        updates[key] = undefined;
        continue;
      }

      updates[key] = key === "email" ? cleaned.toLowerCase() : cleaned;
    } else {
      updates[key] = body[key];
    }
  }

  return updates;
};

const getBuilderProfileValidationMessage = (error: any) => {
  const firstError = Object.values(error?.errors || {})[0] as any;
  const field = firstError?.path ? String(firstError.path) : "";
  const label = builderProfileFieldLabels[field] || field || "Field";
  const kind = firstError?.kind ? String(firstError.kind) : "";
  const min = firstError?.properties?.minlength ?? firstError?.properties?.min;
  const max = firstError?.properties?.maxlength ?? firstError?.properties?.max;

  if (kind === "required") return `${label} is required`;
  if (kind === "minlength" && min) {
    return `${label} must be at least ${min} characters`;
  }
  if (kind === "maxlength" && max) {
    return `${label} must be at most ${max} characters`;
  }

  return firstError?.message || "Please check the profile details and try again";
};

const buildOrgProfileUpdates = (body: Record<string, any>) => {
  const updates: Record<string, unknown> = {};

  const bio = pickString(body, "bio");
  if (bio !== undefined) updates.bio = bio.trim();

  const website = pickString(body, "website");
  if (website !== undefined) updates.website = website.trim();

  const gstin = pickString(body, "gstin", "gst.gstin");
  if (gstin !== undefined) updates.gstin = gstin.trim().toUpperCase();

  const cin = pickString(body, "cin", "mca.cin");
  if (cin !== undefined) updates.cin = cin.trim().toUpperCase();

  const officeLocations = parseOfficeLocations(body);
  if (officeLocations !== undefined) updates.officeLocations = officeLocations;

  const reraId = pickString(
    body,
    "reraId",
    "rera[reraId]",
    "rera.reraId",
  );
  const reraVerified = parseBool(
    body.reraVerified ??
      body["rera[isVerified]"] ??
      body["rera.isVerified"] ??
      body.rera?.isVerified,
  );

  if (reraId !== undefined || reraVerified !== undefined) {
    updates.rera = {
      ...(reraId !== undefined ? { reraId: reraId.trim() } : {}),
      ...(reraVerified !== undefined ? { isVerified: reraVerified } : {}),
    };
  }

  return updates;
};

async function deleteS3ObjectIfExists(key?: string) {
  if (!key) return;
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return;
  try {
    await s3
      .deleteObject({
        Bucket: bucket,
        Key: key,
      })
      .promise();
  } catch {
    /* ignore missing keys */
  }
}

async function uploadBuilderMedia(opts: {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  builderId: string;
  folder: string;
}) {
  const bucket = process.env.AWS_S3_BUCKET!;
  const region = process.env.AWS_REGION!;
  const ext = opts.originalname.includes(".")
    ? opts.originalname.split(".").pop()
    : "";
  const uniqueName = `${Date.now()}-${randomUUID()}${ext ? `.${ext}` : ""}`;
  const key = `builders/${opts.folder}/${opts.builderId}/${uniqueName}`;

  await s3
    .upload({
      Bucket: bucket,
      Key: key,
      Body: opts.buffer,
      ContentType: opts.mimetype,
    })
    .promise();

  return {
    key,
    url: `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(key)}`,
  };
}

async function applyBuilderOrgUpdates(
  user: any,
  body: Record<string, any>,
  files?: MulterFiles,
) {
  if (!user.builderProfile) {
    user.builderProfile = {};
  }

  const orgUpdates = buildOrgProfileUpdates(body);
  if (orgUpdates.bio !== undefined) user.builderProfile.bio = orgUpdates.bio;
  if (orgUpdates.website !== undefined) {
    user.builderProfile.website = orgUpdates.website;
  }
  if (orgUpdates.gstin !== undefined) user.builderProfile.gstin = orgUpdates.gstin;
  if (orgUpdates.cin !== undefined) user.builderProfile.cin = orgUpdates.cin;
  if (orgUpdates.officeLocations !== undefined) {
    user.builderProfile.officeLocations = orgUpdates.officeLocations;
  }
  if (orgUpdates.rera) {
    user.builderProfile.rera = {
      ...(user.builderProfile.rera?.toObject?.() || user.builderProfile.rera || {}),
      ...(orgUpdates.rera as object),
    };
  }

  const avatarFile = files?.avatar?.[0];
  if (avatarFile) {
    await deleteS3ObjectIfExists(user.builderProfile.avatar?.key);
    user.builderProfile.avatar = await uploadBuilderMedia({
      buffer: avatarFile.buffer,
      originalname: avatarFile.originalname,
      mimetype: avatarFile.mimetype,
      builderId: String(user._id),
      folder: "avatar",
    });
  }

  const logoFile = files?.logo?.[0];
  if (logoFile) {
    await deleteS3ObjectIfExists(user.builderProfile.logo?.key);
    user.builderProfile.logo = await uploadBuilderMedia({
      buffer: logoFile.buffer,
      originalname: logoFile.originalname,
      mimetype: logoFile.mimetype,
      builderId: String(user._id),
      folder: "logo",
    });
  }

  const coverFile = files?.coverImage?.[0];
  if (coverFile) {
    await deleteS3ObjectIfExists(user.builderProfile.coverImage?.key);
    user.builderProfile.coverImage = await uploadBuilderMedia({
      buffer: coverFile.buffer,
      originalname: coverFile.originalname,
      mimetype: coverFile.mimetype,
      builderId: String(user._id),
      folder: "cover",
    });
  }

  user.markModified("builderProfile");
}

export const getBuilderProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isPrimaryBuilder(req)) {
      return res.status(403).json({
        message: "Only builder accounts can view builder profile settings",
      });
    }

    const user = await User.findById(req.user.sub).populate("roleId");

    if (!user) {
      return res.status(404).json({ message: "Builder profile not found" });
    }

    const role: any = user.roleId;

    return res.status(200).json({
      message: "Builder profile loaded",
      profile: formatBuilderProfile(user, role),
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to load builder profile",
      error: error.message,
    });
  }
};

export const updateBuilderProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isPrimaryBuilder(req)) {
      return res.status(403).json({
        message: "Only builder accounts can update builder profile settings",
      });
    }

    const updates = buildProfileUpdates(req.body);
    const files = req.files as MulterFiles;
    const hasOrg =
      Object.keys(buildOrgProfileUpdates(req.body)).length > 0 ||
      Boolean(files?.avatar?.[0] || files?.logo?.[0] || files?.coverImage?.[0]);

    if (Object.keys(updates).length === 0 && !hasOrg) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    if (updates.name === "") {
      return res.status(400).json({ message: "Name is required" });
    }

    if (updates.companyName === "") {
      return res.status(400).json({ message: "Company name is required" });
    }

    const user = await User.findById(req.user.sub).populate("roleId");

    if (!user) {
      return res.status(404).json({ message: "Builder profile not found" });
    }

    Object.assign(user, updates);
    if (hasOrg) {
      await applyBuilderOrgUpdates(user, req.body, files);
    }
    await user.save();

    const role: any = user.roleId;

    return res.status(200).json({
      message: "Builder profile updated successfully",
      profile: formatBuilderProfile(user, role),
    });
  } catch (error: any) {
    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(409).json({
        message: "Email already exists. Please use a different email.",
      });
    }

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        message: getBuilderProfileValidationMessage(error),
      });
    }

    return res.status(500).json({
      message: "Failed to update builder profile",
      error: error.message,
    });
  }
};

export const requestBuilderPhoneChangeOtp = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isPrimaryBuilder(req)) {
      return res.status(403).json({
        message: "Only builder accounts can update builder phone number",
      });
    }

    const phone = req.body.phone?.toString().trim();
    const phoneError = validatePhoneForOtp(phone);

    if (phoneError) {
      return res.status(400).json({ message: phoneError });
    }

    const user = await User.findById(req.user.sub);

    if (!user) {
      return res.status(404).json({ message: "Builder profile not found" });
    }

    if (getPhoneLookupValues(phone).includes(String(user.phone || ""))) {
      return res.status(400).json({
        message: "This phone number is already linked to your account",
      });
    }

    const existingUser = await User.findOne({
      _id: { $ne: user._id },
      phone: { $in: getPhoneLookupValues(phone) },
    }).select("_id");

    if (existingUser) {
      return res.status(409).json({
        message: "Phone number already exists. Please use a different phone number.",
      });
    }

    const otp = genOtp();
    await saveOtpToRedis(getPhoneChangeOtpKey(String(user._id), phone), otp);
    await sendOtpWhatsApp(phone, otp);

    return res.status(200).json({
      message: "OTP sent to new phone number",
      oldPhone: user.phone,
      phone,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to send phone verification OTP",
      error: error.message,
    });
  }
};

export const verifyBuilderPhoneChangeOtp = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isPrimaryBuilder(req)) {
      return res.status(403).json({
        message: "Only builder accounts can update builder phone number",
      });
    }

    const phone = req.body.phone?.toString().trim();
    const otp = req.body.otp?.toString().trim();
    const phoneError = validatePhoneForOtp(phone);

    if (phoneError) {
      return res.status(400).json({ message: phoneError });
    }

    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    const user = await User.findById(req.user.sub).populate("roleId");

    if (!user) {
      return res.status(404).json({ message: "Builder profile not found" });
    }

    const otpResult = await verifyAndConsumeOtpWithReason(
      getPhoneChangeOtpKey(String(user._id), phone),
      otp,
    );

    if (!otpResult.valid) {
      return res.status(400).json({
        message:
          otpResult.reason === "expired"
            ? "OTP has expired or is no longer valid. Please request a new OTP."
            : "Incorrect OTP. Please check the code and try again.",
        reason: otpResult.reason,
      });
    }

    const existingUser = await User.findOne({
      _id: { $ne: user._id },
      phone: { $in: getPhoneLookupValues(phone) },
    }).select("_id");

    if (existingUser) {
      return res.status(409).json({
        message: "Phone number already exists. Please use a different phone number.",
      });
    }

    const oldPhone = user.phone;
    if (oldPhone) {
      user.phoneHistory = [
        ...((user.phoneHistory as any[]) || []),
        {
          phone: oldPhone,
          changedAt: new Date(),
          changedBy: user._id,
        },
      ] as any;
    }
    user.phone = phone;
    user.phoneVerified = true;
    await user.save();

    const role: any = user.roleId;

    return res.status(200).json({
      message: "Phone number updated successfully",
      oldPhone,
      profile: formatBuilderProfile(user, role),
    });
  } catch (error: any) {
    if (error?.code === 11000 && error?.keyPattern?.phone) {
      return res.status(409).json({
        message: "Phone number already exists. Please use a different phone number.",
      });
    }

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        message: getBuilderProfileValidationMessage(error),
      });
    }

    return res.status(500).json({
      message: "Failed to verify phone number",
      error: error.message,
    });
  }
};

export const getBuilderProfileById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isBuilderProfileAdmin(req)) {
      return res.status(403).json({
        message: "Only admin and super admin accounts can view a builder profile by id",
      });
    }

    const user = await User.findById(req.params.builderId).populate("roleId");

    if (!user || !assertTargetIsBuilder(user)) {
      return res.status(404).json({ message: "Builder profile not found" });
    }

    const role: any = user.roleId;

    return res.status(200).json({
      message: "Builder profile loaded",
      profile: formatBuilderProfile(user, role),
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to load builder profile",
      error: error.message,
    });
  }
};

export const updateBuilderProfileById = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isBuilderProfileAdmin(req)) {
      return res.status(403).json({
        message: "Only admin and super admin accounts can update a builder profile by id",
      });
    }

    if (
      !req.params.builderId ||
      !mongoose.Types.ObjectId.isValid(req.params.builderId)
    ) {
      return res.status(400).json({ message: "Invalid builder id" });
    }

    const updates = buildProfileUpdates(req.body);
    const files = req.files as MulterFiles;
    const hasOrg =
      Object.keys(buildOrgProfileUpdates(req.body)).length > 0 ||
      Boolean(files?.avatar?.[0] || files?.logo?.[0] || files?.coverImage?.[0]);

    if (Object.keys(updates).length === 0 && !hasOrg) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    if (updates.name === "") {
      return res.status(400).json({ message: "Name is required" });
    }

    if (updates.companyName === "") {
      return res.status(400).json({ message: "Company name is required" });
    }

    const user = await User.findById(req.params.builderId).populate("roleId");

    if (!user || !assertTargetIsBuilder(user)) {
      return res.status(404).json({ message: "Builder profile not found" });
    }

    Object.assign(user, updates);
    if (hasOrg) {
      await applyBuilderOrgUpdates(user, req.body, files);
    }
    await user.save();

    const role: any = user.roleId;

    return res.status(200).json({
      message: "Builder profile updated successfully",
      profile: formatBuilderProfile(user, role),
    });
  } catch (error: any) {
    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(409).json({
        message: "Email already exists. Please use a different email.",
      });
    }

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        message: getBuilderProfileValidationMessage(error),
      });
    }

    return res.status(500).json({
      message: "Failed to update builder profile",
      error: error.message,
    });
  }
};
