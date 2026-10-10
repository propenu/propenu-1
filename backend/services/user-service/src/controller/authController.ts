import User from "../models/userModel";
import Role from "../models/roleModel";
import { genOtp } from "../utils/genOtp";
import {
  OtpVerificationResult,
  saveOtpToRedis,
  verifyAndConsumeOtpWithReason,
} from "../utils/saveOtpRedis";
import { generateToken } from "../utils/jwt";
import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import { sendOtpWhatsApp } from "../utils/whatsapp";
import { sendOtpEmail, sendSignupEmailByRole } from "../utils/email";
import { getOtpLoginRestrictionMessage } from "../utils/accessPolicy";
import mongoose from "mongoose";
import DeletedAccount from "../models/deletedAccountModel";
import Agent from "../models/agentModel";
import { getBuilderAccessForUser } from "../services/builderAccessService";
import {
  getDescendantRoleIds,
  PLATFORM_END_USER_ROLE_NAMES,
  resolveVisibleRoleIdsForActor,
} from "../utils/roleHierarchy";
import { filterUsersInReportingTree } from "../utils/reportingTree";
import {
  canReportToRole,
  canonicalRoleName,
  describeRoleHierarchy,
  expandReportsToRoleNames,
  getReportsToRoleOptions,
} from "../utils/reportsToPolicy";
import { assertCanManageUserLifecycle } from "../utils/userLifecyclePolicy";
import { seedWorkingLocationsOnActivate } from "../utils/seedWorkingLocations";
import {
  ensureFollowUpAssignee,
  ensureFollowUpAssigneesForUsers,
  sanitizeTempLocationInput,
} from "../utils/followUpAssign";
import {
  anyTerritoryCovers,
  formatTerritoryLabel,
  sanitizeWorkingLocations,
  territoryFromHomeLocation,
} from "../utils/workingLocations";
import { activateSubscription } from "../../../payment-service/src/services/subscriptionService";

const PLATFORM_END_USER_ROLE_SET = new Set<string>(PLATFORM_END_USER_ROLE_NAMES);

/** Optional day range from query: createdFrom/createdTo (aliases: from/to). YYYY-MM-DD.
 *  Day bounds use India time (IST, +05:30) so "today" matches admin UI local dates.
 */
const buildCreatedAtQueryFilter = (query: Record<string, any> = {}) => {
  const fromRaw = String(query.createdFrom || query.from || "").trim();
  const toRaw = String(query.createdTo || query.to || "").trim();
  if (!fromRaw && !toRaw) return null;

  const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const createdAt: Record<string, Date> = {};

  if (fromRaw && isDay(fromRaw)) {
    const start = new Date(`${fromRaw}T00:00:00.000+05:30`);
    if (!Number.isNaN(start.getTime())) createdAt.$gte = start;
  }
  if (toRaw && isDay(toRaw)) {
    const end = new Date(`${toRaw}T23:59:59.999+05:30`);
    if (!Number.isNaN(end.getTime())) createdAt.$lte = end;
  }

  return Object.keys(createdAt).length ? createdAt : null;
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const pushAndClause = (filter: Record<string, any>, clause: Record<string, any>) => {
  if (!filter.$and) filter.$and = [];
  filter.$and.push(clause);
};

/** Shallow-clone a Mongo filter without JSON.stringify (keeps ObjectIds intact). */
const cloneUserFilter = (filter: Record<string, any>) => {
  const out: Record<string, any> = { ...filter };
  if (filter.roleId && typeof filter.roleId === "object") {
    out.roleId = { ...filter.roleId };
    if (Array.isArray(filter.roleId.$in)) out.roleId.$in = [...filter.roleId.$in];
    if (Array.isArray(filter.roleId.$nin)) out.roleId.$nin = [...filter.roleId.$nin];
  }
  if (Array.isArray(filter.$and)) out.$and = [...filter.$and];
  if (filter.createdAt && typeof filter.createdAt === "object") {
    out.createdAt = { ...filter.createdAt };
  }
  return out;
};

/** Intersect an existing roleId constraint with a new $in list. */
const applyRoleIdIn = (
  filter: Record<string, any>,
  roleIds: mongoose.Types.ObjectId[],
) => {
  if (filter.roleId?.$in) {
    const allowed = new Set(
      (filter.roleId.$in as mongoose.Types.ObjectId[]).map(String),
    );
    filter.roleId = {
      $in: roleIds.filter((id) => allowed.has(String(id))),
    };
    return;
  }
  if (filter.roleId?.$nin) {
    pushAndClause(filter, { roleId: { $nin: filter.roleId.$nin } });
    filter.roleId = { $in: roleIds };
    return;
  }
  if (filter.roleId != null) {
    pushAndClause(filter, { roleId: filter.roleId });
    filter.roleId = { $in: roleIds };
    return;
  }
  filter.roleId = { $in: roleIds };
};

const resolvePlatformRoleNamesForQuery = (roleRaw: string): string[] | null => {
  const role = String(roleRaw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  if (!role || role === "all") {
    return [...PLATFORM_END_USER_ROLE_NAMES];
  }
  if (role === "user" || role === "users" || role === "owner" || role === "owners") {
    return ["user"];
  }
  if (role === "agent" || role === "agents") return ["agent"];
  if (role === "builder" || role === "builders") return ["builder"];
  if (role === "builder_staff" || role === "builderstaff") return ["builder_staff"];
  return [role];
};

const istTodayBounds = () => {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  const day = `${y}-${m}-${d}`;
  return {
    day,
    start: new Date(`${day}T00:00:00.000+05:30`),
    end: new Date(`${day}T23:59:59.999+05:30`),
  };
};

const deletedAccountMessage =
  "This account has been deleted. Please create a new account.";
const ADMIN_CREATE_ROLES = new Set([
  "admin",
  "super_admin",
  "ceo",
  "founder",
  "operations_head",
  "operation_head",
  "business_development_head",
  "regional_manager",
  "business_development_manager",
  "sales_manager",
  "sales_agent",
  "sales_executive",
  "customer_support_head",
  "team_lead",
  "customer_support_team_lead",
  "customer_care",
  "customer_care_executive",
  "relationship_manager",
  "marketing_head",
  "digital_marketing",
  "social_media",
  "content_team",
  "creative_team",
  "performance_marketing",
  "accounts",
  "accounts_finance",
  "legal_compliance",
  "hr_administration",
  "technical_support_head",
  "technical_support_team",
]);
const NAME_MAX_LENGTH = 42;
const COMPANY_NAME_MAX_LENGTH = 80;
const ADMIN_PROFILE_UPDATE_FIELDS = [
  "name",
  "companyName",
  "email",
  "phone",
  "address",
  "locality",
  "city",
  "state",
  "pincode",
] as const;

const getAdminPhoneChangeOtpKey = (
  adminId: string,
  userId: string,
  phone: string
) => `admin-phone-change:${adminId}:${userId}:${phone}`;

const validatePhoneNumber = (phone?: string) => {
  const trimmed = phone?.trim();

  if (!trimmed) {
    return "Phone number is required";
  }

  if (!/^\+?[1-9]\d{6,14}$/.test(trimmed)) {
    return "Invalid phone number";
  }

  return "";
};

const createInitialAgentProfile = async (userId: mongoose.Types.ObjectId) => {
  return Agent.findOneAndUpdate(
    { user: userId },
    {
      $setOnInsert: {
        user: userId,
        name: "",
        bio: "",
        agencyName: "",
        licenseNumber: "",
        locality: "",
        city: "",
        experienceYears: 0,
        dealsClosed: 0,
        areasServed: [],
        languages: [],
        avatar: null,
        coverImage: null,
        rera: {
          reraAgentId: "",
          isVerified: false,
        },
        stats: {
          totalProperties: 0,
          publishedCount: 0,
        },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
};

const getDummyLoginConfig = () => ({
  phone: process.env.DUMMY_LOGIN_PHONE?.trim(),
  otp: process.env.DUMMY_LOGIN_OTP?.trim(),
});

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

const isDummyLoginPhone = (phone?: string) => {
  const { phone: dummyPhone } = getDummyLoginConfig();
  const inputDigits = normalizePhoneDigits(phone);
  const dummyDigits = normalizePhoneDigits(dummyPhone);

  if (!phone || !dummyPhone || !inputDigits || !dummyDigits) {
    return false;
  }

  return (
    phone.trim() === dummyPhone ||
    inputDigits === dummyDigits ||
    inputDigits === `91${dummyDigits}` ||
    inputDigits.endsWith(dummyDigits)
  );
};

const getOtpFailureResponse = (
  result: Extract<OtpVerificationResult, { valid: false }>
) => {
  if (result.reason === "expired") {
    return {
      message: "OTP has expired or is no longer valid. Please request a new OTP.",
      reason: "expired",
      code: "OTP_EXPIRED",
    };
  }

  return {
    message: "Incorrect OTP. Please check the code and try again.",
    reason: "incorrect",
    code: "OTP_INCORRECT",
  };
};

const validateSignupName = (name?: string) => {
  const value = name?.trim();

  if (!value) {
    return "Name is required";
  }

  if (value.length < 3) {
    return "Name must be at least 3 characters";
  }

  if (value.length > NAME_MAX_LENGTH) {
    return `Name must be ${NAME_MAX_LENGTH} characters or less`;
  }

  return "";
};

const validateCompanyName = (companyName?: string) => {
  const value = companyName?.trim();

  if (!value) {
    return "Company name is required for builders";
  }

  if (value.length > COMPANY_NAME_MAX_LENGTH) {
    return `Company name must be ${COMPANY_NAME_MAX_LENGTH} characters or less`;
  }

  return "";
};

const verifyDummyOrRedisOtp = async ({
  phone,
  key,
  otp,
}: {
  phone?: string;
  key: string;
  otp: string;
}): Promise<OtpVerificationResult> => {
  const { otp: dummyOtp } = getDummyLoginConfig();

  if (isDummyLoginPhone(phone) && dummyOtp) {
    return otp === dummyOtp
      ? { valid: true }
      : { valid: false, reason: "incorrect" };
  }

  return verifyAndConsumeOtpWithReason(key, otp);
};

const findDeletedAccount = async ({
  email,
  phone,
}: {
  email?: string;
  phone?: string;
}) => {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : "";
  const phoneValues = getPhoneLookupValues(phone);
  const lookup = [
    ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
    ...phoneValues.map((value) => ({ phone: value })),
  ];

  if (!lookup.length) {
    return null;
  }

  return DeletedAccount.findOne({ $or: lookup }).select("_id").lean();
};

/** Super Admin / Create Credentials may rehire the same email after permanent delete.
 *  Public propenu.com signup also clears phone/email tombstones before a fresh account. */
const clearDeletedAccountTombstones = async ({
  email,
  phone,
}: {
  email?: string;
  phone?: string;
}) => {
  const lookup = [
    ...(email ? [{ email: String(email).trim().toLowerCase() }] : []),
    ...(phone
      ? getPhoneLookupValues(phone).map((value) => ({ phone: value }))
      : []),
  ];
  if (!lookup.length) return 0;
  const result = await DeletedAccount.deleteMany({ $or: lookup });
  return result.deletedCount || 0;
};

const createAuthToken = async ({
  user,
  roleDoc,
}: {
  user: any;
  roleDoc?: any;
}) => {
  const builderAccess = await getBuilderAccessForUser({
    _id: user._id,
    roleName: roleDoc?.name,
  });

  const payload: any = {
    sub: String(user._id),
    email: user.email,
    name: user.name,
    companyName: user.companyName,
    roleId: roleDoc ? String(roleDoc._id) : undefined,
    roleName: roleDoc?.name,
    builderAccess,
    accountStatus: user.accountStatus,
  };

  if (user.phone) {
    payload.phone = Number(user.phone);
  }

  const lastLoginAt = new Date();
  await User.findByIdAndUpdate(user._id, {
    $set: { lastLoginAt, lastSeenAt: lastLoginAt },
  });
  user.lastLoginAt = lastLoginAt;
  (user as any).lastSeenAt = lastLoginAt;

  return generateToken(payload);
};

export const requestOTP = async (req: Request, res: Response) => {
  
  try {
  
    let { email, phone } = req.body;

    email = email?.trim()?.toLowerCase();
    phone = phone?.trim();

    // ⭐ Either email OR phone required
    if (!email && !phone) {
      return res.status(400).json({
        message: "Either email or phone is required",
      });
    }

    // ⭐ Find user
    const phoneValues = getPhoneLookupValues(phone);
    const normalizedPhone = phoneValues.find((value) => value.length === 10);
    const existingUser = await User.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(phoneValues.length ? [{ phone: { $in: phoneValues } }] : []),
      ],
    }).select("_id name email phone accountStatus roleId isActive");

    if (!existingUser) {
      const deletedAccount = await findDeletedAccount({ email, phone });

      if (deletedAccount) {
        return res.status(403).json({
          message: deletedAccountMessage,
        });
      }

      return res.status(404).json({
        message: "Account not registered. Please sign up first.",
      });
    }

    if (existingUser.isActive === false) {
      return res.status(403).json({
        message: deletedAccountMessage,
      });
    }

    const role = existingUser.roleId
      ? await Role.findById(existingUser.roleId).select("name").lean()
      : null;

    const restrictionMessage = getOtpLoginRestrictionMessage({
      roleName: role?.name,
      email,
      phone,
    });

    if (restrictionMessage) {
      return res.status(403).json({
        message: restrictionMessage,
      });
    }

    if (isDummyLoginPhone(phone)) {
      return res.status(200).json({ message: "OTP sent successfully" });
    }

    const otp = genOtp();

    const key = email || normalizedPhone || phone;
    await saveOtpToRedis(key, otp);


    // ⭐ Send OTP based on input
    if (email) {
      await sendOtpEmail(email, otp);
    } else if (phone) {
      await sendOtpWhatsApp(phone, otp);
    }

    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    let { email, phone, otp } = req.body;

    email = email?.trim()?.toLowerCase();
    phone = phone?.trim();
    otp = otp?.trim();

    if (!email && !phone) {
      return res.status(400).json({
        message: "Either email or phone is required",
      });
    }

    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    const phoneValues = getPhoneLookupValues(phone);
    const normalizedPhone = phoneValues.find((value) => value.length === 10);
    const user = await User.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(phoneValues.length ? [{ phone: { $in: phoneValues } }] : []),
      ],
    }).populate("roleId");

    if (!user) {
      const deletedAccount = await findDeletedAccount({ email, phone });

      if (deletedAccount) {
        return res.status(403).json({
          message: deletedAccountMessage,
        });
      }

      return res.status(404).json({
        message: "Account not found",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: deletedAccountMessage,
      });
    }

    const role: any = user.roleId;

    if (role?.isActive === false) {
      return res.status(403).json({
        message:
          "Your role is deactivated. Contact Super Admin to activate the role before logging in.",
        code: "ROLE_DEACTIVATED",
      });
    }

    const restrictionMessage = getOtpLoginRestrictionMessage({
      roleName: role?.name,
      email,
      phone,
    });

    if (restrictionMessage) {
      return res.status(403).json({
        message: restrictionMessage,
      });
    }

    const key = email || normalizedPhone || phone;
    const otpResult = await verifyDummyOrRedisOtp({ phone, key, otp });

    if (!otpResult.valid) {
      return res.status(400).json({
        ...getOtpFailureResponse(otpResult),
      });
    }

    const token = await createAuthToken({ user, roleDoc: role });

    return res.status(200).json({
      message: "OTP verified successfully",
      token,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to verify OTP" });
  }
};

export const me = async (req: AuthRequest, res: Response) => {
  try {
    // 1️⃣ check authentication
    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    // 2️⃣ load user
    const user = await User.findById(req.user.sub).populate("roleId").lean();

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: "Account is no longer active",
      });
    }

    const role: any = user.roleId;
    const builderAccess = await getBuilderAccessForUser({
      _id: user._id,
      roleName: role?.name,
    });

    // 3️⃣ detect location completion
    const locationCompleted =
      !!user.locality && !!user.city && !!user.state && !!user.pincode;

    const isSuperAdmin = role?.name === "super_admin";

    return res.status(200).json({
      message: "Authenticated user",
      user: {
        id: user._id,
        name: user.name,
        companyName: user.companyName,
        email: user.email,
        phone: user.phone,
        accountStatus: user.accountStatus,
        locality: user.locality,
        city: user.city,
        state: user.state,
        pincode: user.pincode,
        locationCompleted,
        phoneVerified: user.phoneVerified,
        roleId: role ? String(role._id) : null,
        roleName: role ? role.name : null,
        permissions: isSuperAdmin ? ["*"] : role?.permissions || [],
        builderAccess,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      message: "Failed to load user profile",
    });
  }
};

const REGIONAL_MANAGER_TRANSFER_ROLES = new Set([
  "sales_manager",
  "sales_agent",
  "relationship_manager",
]);

const resolveReportsToUserId = (body: any): string | null | undefined => {
  if (body?.clearManager === true || body?.reportsToUserId === null || body?.managerId === null) {
    return null;
  }
  const raw = body?.reportsToUserId ?? body?.managerId;
  if (raw === undefined) return undefined;
  const value = String(raw || "").trim();
  return value || null;
};

const assertValidReportsToAssignment = async (params: {
  reportUserId?: string | undefined;
  reportRoleName: string;
  managerUserId: string;
}) => {
  if (!mongoose.Types.ObjectId.isValid(params.managerUserId)) {
    return { ok: false as const, status: 400, message: "Invalid reports-to user id" };
  }
  if (params.reportUserId && String(params.reportUserId) === String(params.managerUserId)) {
    return { ok: false as const, status: 400, message: "A user cannot report to themselves" };
  }

  const manager = await User.findById(params.managerUserId)
    .populate("roleId", "name label")
    .select("name email phone city state locality pincode roleId isActive accountStatus managerId");

  if (!manager || manager.isActive === false) {
    return { ok: false as const, status: 404, message: "Reports-to user not found" };
  }

  const managerRoleName = canonicalRoleName((manager.roleId as any)?.name);
  if (!canReportToRole(params.reportRoleName, managerRoleName)) {
    const allowed = getReportsToRoleOptions(params.reportRoleName);
    return {
      ok: false as const,
      status: 400,
      message: allowed.length
        ? `Users with role '${params.reportRoleName}' can only report to: ${allowed.join(", ")}`
        : `Role '${params.reportRoleName}' does not support person-level reporting`,
    };
  }

  // Prevent simple cycles: manager must not already report to the report user.
  if (params.reportUserId && String(manager.managerId || "") === String(params.reportUserId)) {
    return {
      ok: false as const,
      status: 400,
      message: "Invalid reporting line: would create a circular manager relationship",
    };
  }

  return { ok: true as const, manager };
};

export const updateUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const roleName = String(req.body?.roleName || "").trim().toLowerCase();

    if (!roleName) {
      return res.status(400).json({ message: "roleName is required" });
    }

    if (
      req.user?.roleName === "regional_manager" &&
      !REGIONAL_MANAGER_TRANSFER_ROLES.has(roleName)
    ) {
      return res.status(403).json({
        message:
          "Regional Manager can transfer only Sales Managers, Sales Executives, and Relationship Managers",
      });
    }

    const role = await Role.findOne({ name: roleName });
    if (!role) {
      return res.status(400).json({ message: `Role '${roleName}' not found` });
    }

    if (req.user?.roleName === "regional_manager") {
      const sourceUser = await User.findById(userId).populate("roleId", "name");
      const sourceRole = (sourceUser?.roleId as any)?.name;

      if (!sourceUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!REGIONAL_MANAGER_TRANSFER_ROLES.has(sourceRole)) {
        return res.status(403).json({
          message:
            "Regional Manager can transfer only Sales Managers, Sales Executives, and Relationship Managers",
        });
      }
    }

    const reportsToUserId = resolveReportsToUserId(req.body);
    const updatePayload: Record<string, any> = { roleId: role._id };

    // Role change clears the old reporting line by default.
    // Caller may pass reportsToUserId / managerId to set a new one for the new role.
    if (reportsToUserId === undefined) {
      updatePayload.managerId = null;
    } else if (reportsToUserId === null) {
      updatePayload.managerId = null;
    } else {
      const check = await assertValidReportsToAssignment({
        reportUserId: userId,
        reportRoleName: role.name,
        managerUserId: reportsToUserId,
      });
      if (!check.ok) {
        return res.status(check.status).json({ message: check.message });
      }
      updatePayload.managerId = check.manager._id;
    }

    const user = await User.findByIdAndUpdate(userId, updatePayload, { new: true })
      .populate("roleId")
      .populate("managerId", "name email phone");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (role.name === "agent") {
      await createInitialAgentProfile(user._id);
    }

    res.json({
      message: "User role updated",
      user,
      hierarchy: describeRoleHierarchy(role.name),
    });
  } catch (err: any) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Failed to update user role", error: err.message });
  }
};

export const deleteMyAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { reason, feedback } = req.body as {
      reason?: string;
      feedback?: string;
    };

    const user = await User.findById(req.user.sub).select(
      "_id name email phone roleId isActive"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isActive === false) {
      return res.status(400).json({ message: "Account is already deleted" });
    }

    await DeletedAccount.create({
      userId: user._id,
      name: user.name,
      email: user.email ?? null,
      phone: user.phone ?? null,
      roleId: user.roleId ?? null,
      deletedAt: new Date(),
      deletionReason: reason?.trim() || null,
      deletionFeedback: feedback?.trim() || null,
    });

    await User.findByIdAndDelete(user._id);

    return res.status(200).json({
      message: "Your account has been deleted successfully",
    });
  } catch (error: any) {
    console.error("deleteMyAccount error", error);
    return res.status(500).json({
      message: "Failed to delete account",
      error: error.message,
    });
  }
};

/** Activate / deactivate a team or marketplace user (login blocked when inactive). */
export const adminSetUserActive = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body as { isActive?: boolean };

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be a boolean" });
    }

    const user = await User.findById(id).populate("roleId", "name label");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const roleName = String((user.roleId as any)?.name || "").toLowerCase();
    const gate = assertCanManageUserLifecycle({
      actorRoleName: req.user?.roleName ?? null,
      targetRoleName: roleName,
      actorUserId: req.user?.sub ?? null,
      targetUserId: id,
    });
    if (!gate.ok) {
      return res.status(gate.status).json({ message: gate.message });
    }

    user.isActive = isActive;
    await user.save();

    return res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isActive: user.isActive,
        roleName,
        roleLabel: (user.roleId as any)?.label || roleName,
      },
      message: isActive ? "User activated" : "User deactivated",
    });
  } catch (error: any) {
    console.error("adminSetUserActive error", error);
    return res.status(500).json({
      message: "Failed to update user status",
      error: error.message,
    });
  }
};

/** Permanently delete a candidate / team / marketplace user. */
export const adminDeleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await User.findById(id)
      .select("_id name email phone roleId isActive")
      .populate("roleId", "name label");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const roleName = String((user.roleId as any)?.name || "").toLowerCase();
    const gate = assertCanManageUserLifecycle({
      actorRoleName: req.user?.roleName ?? null,
      targetRoleName: roleName,
      actorUserId: req.user?.sub ?? null,
      targetUserId: id,
    });
    if (!gate.ok) {
      return res.status(gate.status).json({ message: gate.message });
    }

    const actorRole = String(req.user?.roleName || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");
    const deletedBy =
      actorRole === "business_development_head"
        ? "Deleted by Business Development Head"
        : actorRole === "customer_support_head"
          ? "Deleted by Customer Support Head from Team directory"
          : actorRole === "customer_support_team_lead" ||
              actorRole === "team_lead" ||
              actorRole === "team_leads"
            ? "Deleted by Customer Support Team Lead from Team directory"
            : actorRole === "operations_head" || actorRole === "operation_head"
              ? "Deleted by Operations Head from Team directory"
              : "Deleted by Super Admin";

    await DeletedAccount.create({
      userId: user._id,
      name: user.name,
      email: user.email ?? null,
      phone: user.phone ?? null,
      roleId: user.roleId ?? null,
      deletedAt: new Date(),
      deletionReason: reason?.trim() || deletedBy,
      deletionFeedback: null,
    });

    await User.findByIdAndDelete(user._id);

    return res.json({
      success: true,
      deletedUser: {
        id: user._id,
        name: user.name,
        roleName,
      },
      message: `${user.name || "User"} permanently deleted`,
    });
  } catch (error: any) {
    console.error("adminDeleteUser error", error);
    return res.status(500).json({
      message: "Failed to delete user",
      error: error.message,
    });
  }
};

/** Super Admin only — list tombstones from deletedaccounts collection. */
export const listDeletedAccounts = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const q = String(req.query.q || req.query.search || "").trim();

    const filter: Record<string, unknown> = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }

    const [total, rows] = await Promise.all([
      DeletedAccount.countDocuments(filter),
      DeletedAccount.find(filter)
        .sort({ deletedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("roleId", "name label")
        .lean(),
    ]);

    const data = rows.map((row: any) => ({
      _id: row._id,
      userId: row.userId,
      name: row.name || "—",
      email: row.email || null,
      phone: row.phone || null,
      roleName: row.roleId?.name || null,
      roleLabel: row.roleId?.label || row.roleId?.name || null,
      deletedAt: row.deletedAt || row.createdAt || null,
      deletionReason: row.deletionReason || null,
      deletionFeedback: row.deletionFeedback || null,
    }));

    const pages = Math.max(1, Math.ceil(total / limit) || 1);

    return res.json({
      success: true,
      data,
      meta: {
        total,
        page,
        limit,
        pages,
      },
    });
  } catch (error: any) {
    console.error("listDeletedAccounts error", error);
    return res.status(500).json({
      message: "Failed to load deleted accounts",
      error: error.message,
    });
  }
};

export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const userFilter: any = {};
    const actorRole = req.user?.roleName || "";
    const scope = req.query.scope?.toString().trim().toLowerCase();
    const query = req.query as Record<string, any>;

    const pageRaw = query.page;
    const limitRaw = query.limit ?? query.pageSize;
    const platformOnly =
      String(query.platformOnly || "").trim() === "1" ||
      String(query.platform || "").trim() === "1";
    // Users admin board always paginates (prod-safe). Other callers opt in via page/limit.
    const wantsPagination =
      platformOnly ||
      pageRaw != null ||
      limitRaw != null ||
      String(query.paginated || "").trim() === "1";
    const wantsExport = String(query.export || "").trim() === "1";
    const page = Math.max(1, Number(pageRaw) || 1);
    const maxLimit = wantsExport ? 5000 : 100;
    const limit = Math.min(
      maxLimit,
      Math.max(1, Number(limitRaw) || 20),
    );

    if (scope === "ticket_requesters") {
      const requesterRoleNames = ["user", "agent", "builder", "builder_staff"];
      const requesterRoles = await Role.find({ name: { $in: requesterRoleNames } })
        .select("_id")
        .lean();
      userFilter.roleId = { $in: requesterRoles.map((role) => role._id) };
    } else if (scope === "ticket_assignees") {
      const excludedRoleNames = ["user", "agent", "builder", "builder_staff"];
      const excludedRoles = await Role.find({ name: { $in: excludedRoleNames } })
        .select("_id")
        .lean();
      userFilter.roleId = {
        $nin: excludedRoles.map((role) => role._id),
      };
    } else if (scope === "team_directory") {
      // Staff under the actor in the org hierarchy (not platform end-users).
      const excludedRoleNames = ["user", "agent", "builder", "builder_staff"];
      const excludedRoles = await Role.find({ name: { $in: excludedRoleNames } })
        .select("_id")
        .lean();
      const excludedIds = excludedRoles.map((role) => role._id);
      const actorRoleKey = String(actorRole || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_");

      if (actorRoleKey === "super_admin" || actorRoleKey === "admin") {
        userFilter.roleId = { $nin: excludedIds };
      } else {
        const operator = await User.findById(req.user?.sub)
          .select("roleId")
          .lean();
        const descendantRoleIds = operator?.roleId
          ? await getDescendantRoleIds(operator.roleId)
          : [];
        userFilter.roleId = { $in: descendantRoleIds };
      }
    } else {
      const actorRoleKey = String(actorRole || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_");
      if (actorRoleKey !== "super_admin" && actorRoleKey !== "admin") {
        const operator = await User.findById(req.user?.sub)
          .select("roleId")
          .lean();
        const visibleRoleIds = await resolveVisibleRoleIdsForActor({
          actorRoleId: operator?.roleId ?? null,
          actorRoleName: actorRole,
          permissions: req.user?.permissions || [],
        });
        // null = unrestricted (admin); [] = no matching roles
        if (visibleRoleIds) {
          userFilter.roleId = { $in: visibleRoleIds };
        }
      }
    }

    // Snapshot visibility filter before list-only filters (stats / role tabs).
    const visibilityFilter = cloneUserFilter(userFilter);

    const roleQuery = String(query.role || "").trim();
    if (platformOnly || (roleQuery && roleQuery.toLowerCase() !== "all")) {
      const roleNames = resolvePlatformRoleNamesForQuery(
        platformOnly && (!roleQuery || roleQuery.toLowerCase() === "all")
          ? "all"
          : roleQuery || "all",
      );
      if (roleNames?.length) {
        const roles = await Role.find({ name: { $in: roleNames } })
          .select("_id")
          .lean();
        applyRoleIdIn(
          userFilter,
          roles.map((role) => role._id as mongoose.Types.ObjectId),
        );
      }
    }

    const lookupUserId = String(query.userId || query.id || "").trim();
    if (lookupUserId) {
      if (!mongoose.Types.ObjectId.isValid(lookupUserId)) {
        return res.status(400).json({ message: "Invalid userId" });
      }
      userFilter._id = new mongoose.Types.ObjectId(lookupUserId);
    }

    const createdAtFilter = buildCreatedAtQueryFilter(query);
    if (createdAtFilter) {
      userFilter.createdAt = createdAtFilter;
    }

    const lastLoginFilter = buildCreatedAtQueryFilter({
      createdFrom: query.lastLoginFrom || query.loginFrom,
      createdTo: query.lastLoginTo || query.loginTo,
    });
    if (lastLoginFilter) {
      userFilter.lastLoginAt = lastLoginFilter;
    }

    const managerIdQuery = String(query.managerId || "").trim();
    if (managerIdQuery && mongoose.Types.ObjectId.isValid(managerIdQuery)) {
      userFilter.managerId = new mongoose.Types.ObjectId(managerIdQuery);
    }
    const onboardedByQuery = String(query.onboardedBy || "").trim();
    if (onboardedByQuery && mongoose.Types.ObjectId.isValid(onboardedByQuery)) {
      userFilter.onboardedBy = new mongoose.Types.ObjectId(onboardedByQuery);
    }

    const q = String(query.q || query.search || "").trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      const or: Record<string, any>[] = [
        { name: rx },
        { email: rx },
        { phone: rx },
      ];
      if (mongoose.Types.ObjectId.isValid(q)) {
        or.push({ _id: new mongoose.Types.ObjectId(q) });
      }
      pushAndClause(userFilter, { $or: or });
    }

    const location = String(query.location || "").trim();
    if (location) {
      const rx = new RegExp(escapeRegex(location), "i");
      pushAndClause(userFilter, {
        $or: [
          { locality: rx },
          { city: rx },
          { state: rx },
          { pincode: rx },
        ],
      });
    }

    // Exact geo filters (campaign / audience targeting) — case-insensitive.
    const stateExact = String(query.state || "").trim();
    if (stateExact) {
      userFilter.state = new RegExp(`^${escapeRegex(stateExact)}$`, "i");
    }
    const cityExact = String(query.city || "").trim();
    if (cityExact) {
      userFilter.city = new RegExp(`^${escapeRegex(cityExact)}$`, "i");
    }
    const localityExact = String(query.locality || "").trim();
    if (localityExact) {
      userFilter.locality = new RegExp(`^${escapeRegex(localityExact)}$`, "i");
    }

    const statusRaw = String(
      query.status || query.accountStatus || "",
    )
      .trim()
      .toLowerCase();
    const filterFlag = String(query.filter || "")
      .trim()
      .toLowerCase();
    if (filterFlag === "onboarding" || statusRaw === "onboarding") {
      userFilter.accountStatus = {
        $in: ["location_pending", "kyc_pending", "pending", "incomplete"],
      };
    } else if (statusRaw === "inactive") {
      pushAndClause(userFilter, {
        $or: [
          { accountStatus: "inactive" },
          { accountStatus: { $in: [null, ""] } },
          { accountStatus: { $exists: false } },
        ],
      });
    } else if (statusRaw) {
      userFilter.accountStatus = statusRaw;
    }

    const phone = String(query.phone || "").trim().toLowerCase();
    if (phone === "true" || phone === "verified") {
      userFilter.phoneVerified = true;
    } else if (phone === "false" || phone === "unverified") {
      userFilter.phoneVerified = { $ne: true };
    }

    // Active on Users page = onboarded (accountStatus === "active")
    const active = String(query.active || "").trim().toLowerCase();
    if (active === "true") {
      userFilter.accountStatus = "active";
    } else if (active === "false") {
      userFilter.accountStatus = { $ne: "active" };
    }

    const leanTeamDirectory = scope === "team_directory";
    // Users board list: lean columns only (prod timeout-safe).
    const leanPlatformBoard = Boolean(platformOnly && wantsPagination);
    const actorRoleKey = String(actorRole || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");
    const needsReportingTreeFilter =
      leanTeamDirectory &&
      actorRoleKey !== "super_admin" &&
      actorRoleKey !== "admin";

    const USERS_BOARD_SELECT =
      "name email phone roleId isActive accountStatus phoneVerified locality city state pincode createdAt lastLoginAt";

    const buildUsersQuery = (filter: Record<string, any>) => {
      let usersQuery = User.find(filter)
        .select(
          leanTeamDirectory
            ? // managerId required — reporting-tree scope + "Reports to" on cards
              "name email phone roleId managerId isActive accountStatus locality city state pincode lastLogin createdAt"
            : leanPlatformBoard
              ? USERS_BOARD_SELECT
              : "-token",
        )
        .populate("roleId", "name label");

      if (leanTeamDirectory) {
        usersQuery = usersQuery.populate({
          path: "managerId",
          select: "name email phone roleId",
          populate: { path: "roleId", select: "name label" },
        });
      } else if (!leanPlatformBoard) {
        usersQuery = usersQuery
          .populate({
            path: "managerId",
            select: "name email phone roleId",
            populate: { path: "roleId", select: "name label" },
          })
          .populate({
            path: "onboardedBy",
            select: "name email phone roleId",
            populate: { path: "roleId", select: "name label" },
          })
          .populate({
            path: "followUpAssignedTo",
            select: "name email phone roleId",
            populate: { path: "roleId", select: "name label" },
          });
      }
      return usersQuery;
    };

    const formatUsers = (users: any[]) =>
      users.map((user: any) => {
        const role = user.roleId;
        const manager = user.managerId;
        const managerRole = manager?.roleId;
        const onboardedBy = user.onboardedBy;
        const assignee = user.followUpAssignedTo;
        const assigneeRole = assignee?.roleId;
        const followUpAssignedTo = assignee?._id
          ? String(assignee._id)
          : assignee
            ? String(assignee)
            : null;
        const followUpWorkStatus =
          user.followUpWorkStatus || (followUpAssignedTo ? "assigned" : null);

        return {
          ...user,
          roleId: role?._id
            ? String(role._id)
            : user.roleId
              ? String(user.roleId)
              : null,
          roleName: role?.name || null,
          managerId: manager?._id
            ? String(manager._id)
            : manager
              ? String(manager)
              : null,
          onboardedBy: onboardedBy?._id
            ? String(onboardedBy._id)
            : onboardedBy
              ? String(onboardedBy)
              : null,
          followUpAssignedTo,
          followUpWorkStatus,
          followUpAssignee: assignee?._id
            ? {
                _id: String(assignee._id),
                name: assignee.name || null,
                email: assignee.email || null,
                phone: assignee.phone || null,
                roleName: assigneeRole?.name || null,
                roleLabel: assigneeRole?.label || null,
              }
            : null,
          reportsTo: manager?._id
            ? {
                _id: String(manager._id),
                name: manager.name || null,
                email: manager.email || null,
                phone: manager.phone || null,
                roleName: managerRole?.name || null,
                roleLabel: managerRole?.label || null,
              }
            : null,
        };
      });

    const hydrateMissingAssignees = async (formattedUsers: any[]) => {
      if (leanTeamDirectory || leanPlatformBoard) return;
      const missingAssigneeIds = [
        ...new Set(
          formattedUsers
            .filter((u: any) => u.followUpAssignedTo && !u.followUpAssignee)
            .map((u: any) => String(u.followUpAssignedTo)),
        ),
      ].filter((id) => mongoose.Types.ObjectId.isValid(id));

      if (!missingAssigneeIds.length) return;

      const assigneeDocs = await User.find({ _id: { $in: missingAssigneeIds } })
        .select("name email phone roleId")
        .populate("roleId", "name label")
        .lean();
      const byId = new Map(
        assigneeDocs.map((doc: any) => [
          String(doc._id),
          {
            _id: String(doc._id),
            name: doc.name || null,
            email: doc.email || null,
            phone: doc.phone || null,
            roleName: doc.roleId?.name || null,
            roleLabel: doc.roleId?.label || null,
          },
        ]),
      );
      for (const row of formattedUsers) {
        if (row.followUpAssignee || !row.followUpAssignedTo) continue;
        const hit = byId.get(String(row.followUpAssignedTo));
        if (hit) row.followUpAssignee = hit;
      }
    };

    const applyReportingTree = (formattedUsers: any[]) => {
      if (!needsReportingTreeFilter) return formattedUsers;
      const inTree = filterUsersInReportingTree(formattedUsers, req.user?.sub);
      return inTree.length > 0 ? inTree : formattedUsers;
    };

    // Legacy callers (dashboards, badges): bare array, no pagination.
    if (!wantsPagination) {
      const users = await buildUsersQuery(userFilter)
        .maxTimeMS(20000)
        .lean();
      if (!leanTeamDirectory) {
        try {
          await ensureFollowUpAssigneesForUsers(users);
        } catch {
          /* non-blocking */
        }
      }
      const formattedUsers = formatUsers(users);
      await hydrateMissingAssignees(formattedUsers);
      return res.json(applyReportingTree(formattedUsers));
    }

    // Stats + role tabs — single $facet (runs in parallel with list below).
    const loadBoardStats = async () => {
      const empty = {
        stats: {
          total: 0,
          active: 0,
          kycVerified: 0,
          phoneVerified: 0,
          locPending: 0,
          joinedToday: 0,
        },
        roleCounts: {
          all: 0,
          user: 0,
          builder: 0,
          builder_staff: 0,
          agent: 0,
        },
      };
      try {
        const platformRoles = await Role.find({
          name: { $in: [...PLATFORM_END_USER_ROLE_NAMES] },
        })
          .select("_id name")
          .lean();
        const platformIds = platformRoles.map(
          (r) => r._id as mongoose.Types.ObjectId,
        );
        const statsFilter: Record<string, any> =
          cloneUserFilter(visibilityFilter);
        applyRoleIdIn(statsFilter, platformIds);

        const { start: todayStart, end: todayEnd } = istTodayBounds();
        const roleIdByName = new Map(
          platformRoles.map((r: any) => [String(r.name), String(r._id)]),
        );

        const [facet] = await User.aggregate([
          { $match: statsFilter },
          {
            $facet: {
              total: [{ $count: "n" }],
              active: [
                { $match: { accountStatus: "active" } },
                { $count: "n" },
              ],
              phone: [{ $match: { phoneVerified: true } }, { $count: "n" }],
              loc: [
                { $match: { accountStatus: "location_pending" } },
                { $count: "n" },
              ],
              today: [
                {
                  $match: {
                    createdAt: { $gte: todayStart, $lte: todayEnd },
                  },
                },
                { $count: "n" },
              ],
              byRole: [
                {
                  $group: {
                    _id: "$roleId",
                    n: { $sum: 1 },
                  },
                },
              ],
            },
          },
        ]).option({ maxTimeMS: 12000 });

        const nOf = (rows: any[]) => Number(rows?.[0]?.n || 0);
        const byRoleCount = new Map(
          (facet?.byRole || []).map((row: any) => [
            String(row._id),
            Number(row.n || 0),
          ]),
        );
        const roleN = (name: string) => {
          const id = roleIdByName.get(name);
          return id ? byRoleCount.get(id) || 0 : 0;
        };

        const stats = {
          total: nOf(facet?.total),
          active: nOf(facet?.active),
          kycVerified: 0,
          phoneVerified: nOf(facet?.phone),
          locPending: nOf(facet?.loc),
          joinedToday: nOf(facet?.today),
        };
        return {
          stats,
          roleCounts: {
            all: stats.total,
            user: roleN("user"),
            builder: roleN("builder"),
            builder_staff: roleN("builder_staff"),
            agent: roleN("agent"),
          },
        };
      } catch {
        return empty;
      }
    };

    // Paginated path — list + stats in parallel (prod latency pattern).
    let scopedUsers: any[] = [];
    let total = 0;
    let statsBundle: Awaited<ReturnType<typeof loadBoardStats>>;

    if (needsReportingTreeFilter) {
      const [users, boardStats] = await Promise.all([
        buildUsersQuery(userFilter)
          .sort({ createdAt: -1 })
          .maxTimeMS(20000)
          .lean(),
        loadBoardStats(),
      ]);
      statsBundle = boardStats;
      const formattedUsers = formatUsers(users);
      const allScoped = applyReportingTree(formattedUsers);
      total = allScoped.length;
      const start = (page - 1) * limit;
      scopedUsers = allScoped.slice(start, start + limit);
    } else {
      const [counted, users, boardStats] = await Promise.all([
        User.countDocuments(userFilter).maxTimeMS(12000),
        buildUsersQuery(userFilter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .maxTimeMS(12000)
          .lean(),
        loadBoardStats(),
      ]);
      statsBundle = boardStats;
      total = counted;
      // Skip follow-up backfill on Users board — keeps prod under client timeout.
      if (!leanPlatformBoard && !leanTeamDirectory) {
        try {
          await ensureFollowUpAssigneesForUsers(users);
        } catch {
          /* non-blocking */
        }
      }
      scopedUsers = formatUsers(users);
      await hydrateMissingAssignees(scopedUsers);
    }

    return res.json({
      data: scopedUsers,
      meta: {
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit) || 1),
      },
      stats: statsBundle.stats,
      roleCounts: statsBundle.roleCounts,
    });
  } catch (err) {
    console.error("getAllUsers failed:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

/**
 * Sales Executive (or manager) claims a public marketplace user as their client.
 * Sets managerId + onboardedBy so SE Detail "My clients" can follow their activity.
 */
export const claimSeClient = async (req: AuthRequest, res: Response) => {
  try {
    const actorId = String(req.user?.sub || req.user?.id || "").trim();
    const actorRole = canonicalRoleName(req.user?.roleName);
    const permissions = req.user?.permissions || [];
    const allowedRoles = new Set([
      "sales_executive",
      "sales_agent",
      "sales_manager",
      "regional_manager",
      "business_development_head",
      "operations_head",
      "super_admin",
      "admin",
    ]);
    if (!allowedRoles.has(actorRole) && !permissions.includes("user:create")) {
      return res.status(403).json({
        message: "Only Sales Executive staff can claim clients",
      });
    }

    const clientUserId = String(req.body?.userId || "").trim();
    if (!clientUserId || !mongoose.Types.ObjectId.isValid(clientUserId)) {
      return res.status(400).json({ message: "Valid userId is required" });
    }

    let salesExecutiveId = String(req.body?.salesExecutiveId || "").trim();
    if (!salesExecutiveId) {
      salesExecutiveId = actorId;
    }
    if (!mongoose.Types.ObjectId.isValid(salesExecutiveId)) {
      return res.status(400).json({ message: "Invalid salesExecutiveId" });
    }

    // Field SE can only claim to self; managers/admins may assign to a specific SE
    if (
      ["sales_executive", "sales_agent"].includes(actorRole) &&
      String(salesExecutiveId) !== String(actorId)
    ) {
      return res.status(403).json({
        message: "Sales Executives can only assign clients to themselves",
      });
    }

    const client = await User.findById(clientUserId).populate("roleId", "name label");
    if (!client) {
      return res.status(404).json({ message: "Client user not found" });
    }
    const clientRole = String((client.roleId as any)?.name || "").toLowerCase();
    const claimableRoles = new Set(["user", "agent", "builder"]);
    if (!claimableRoles.has(clientRole)) {
      return res.status(400).json({
        message:
          "Only marketplace clients (user, agent, or builder) can be claimed as SE clients",
      });
    }

    const se = await User.findById(salesExecutiveId)
      .populate("roleId", "name label")
      .select("name email phone roleId isActive state city locality workingLocations");
    if (!se || se.isActive === false) {
      return res.status(404).json({ message: "Sales Executive not found" });
    }
    const seRole = canonicalRoleName((se.roleId as any)?.name);
    if (!["sales_executive", "sales_agent", "sales_manager", "regional_manager"].includes(seRole)) {
      return res.status(400).json({
        message: "Assignee must be a Sales Executive (or field sales role)",
      });
    }

    // Territory check (same CCE pattern): if client has a location and SE has
    // working territories (or home fallback), require coverage.
    const clientLoc = {
      state: String((client as any).state || "").trim(),
      city: String((client as any).city || "").trim(),
      locality: String((client as any).locality || "").trim(),
    };
    if (clientLoc.state) {
      const stored = Array.isArray((se as any).workingLocations)
        ? (se as any).workingLocations
        : [];
      const territories =
        stored.length > 0
          ? sanitizeWorkingLocations(stored)
          : territoryFromHomeLocation({
              state: (se as any).state || "",
              city: (se as any).city || "",
              locality: (se as any).locality || "",
            });
      if (territories.length > 0 && !anyTerritoryCovers(territories, clientLoc)) {
        return res.status(400).json({
          message:
            "Client location is outside this Sales Executive's working territories. Align SE working locations, or assign a SE covering that area.",
          clientLocation: clientLoc,
          salesExecutiveTerritories: territories.map(formatTerritoryLabel),
        });
      }
    }

    const previousManagerId = client.managerId
      ? String(client.managerId)
      : null;
    if (previousManagerId && previousManagerId === String(se._id)) {
      return res.json({
        success: true,
        message: "Client is already assigned to this Sales Executive",
        alreadyAssigned: true,
        client: {
          _id: String(client._id),
          name: client.name,
          phone: client.phone,
          email: client.email,
          managerId: String(se._id),
          onboardedBy: String((client as any).onboardedBy || actorId),
          accountStatus: client.accountStatus,
        },
        salesExecutive: {
          _id: String(se._id),
          name: se.name,
          roleName: seRole,
        },
      });
    }

    // Existing Propenu users can be reassigned to this SE.
    client.managerId = se._id as any;
    if (!(client as any).onboardedBy) {
      (client as any).onboardedBy = new mongoose.Types.ObjectId(actorId);
    }
    await client.save();

    return res.json({
      success: true,
      message: previousManagerId
        ? "Existing client reassigned to Sales Executive"
        : "Client assigned to Sales Executive",
      reassigned: Boolean(previousManagerId),
      previousManagerId,
      client: {
        _id: String(client._id),
        name: client.name,
        phone: client.phone,
        email: client.email,
        managerId: String(se._id),
        onboardedBy: String((client as any).onboardedBy || actorId),
        accountStatus: client.accountStatus,
      },
      salesExecutive: {
        _id: String(se._id),
        name: se.name,
        roleName: seRole,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to assign client to Sales Executive",
      error: error.message,
    });
  }
};

const emptyUserSearchPayload = (page: number, limit: number) => ({
  results: [] as any[],
  data: [] as any[],
  count: 0,
  meta: {
    total: 0,
    page,
    limit,
    pages: 1,
    hasMore: false,
    hasNextPage: false,
    hasPreviousPage: page > 1,
    rangeStart: 0,
    rangeEnd: 0,
  },
  facets: {
    states: [] as string[],
    cities: [] as string[],
    localities: [] as string[],
    statusCounts: {} as Record<string, number>,
  },
});

/**
 * Picker / typeahead search. Matches roleId first (indexed), then pages with
 * find + count. Skips role/agent lookups and location facets.
 */
const respondLeanUserSearch = async (
  req: AuthRequest,
  res: Response,
  ctx: {
    queryRaw: string;
    query: string;
    roleFilters: string[];
    page: number;
    limit: number;
    skip: number;
  },
) => {
  const { queryRaw, query, roleFilters, page, limit, skip } = ctx;
  const roleDocs = roleFilters.length
    ? await Role.find({ name: { $in: roleFilters } }).select("_id name").lean()
    : [];
  if (roleFilters.length && !roleDocs.length) {
    return res.json(emptyUserSearchPayload(page, limit));
  }

  const actorRole = String(req.user?.roleName || "")
    .trim()
    .toLowerCase();
  const searchingAssignableRoles =
    roleFilters.length > 0 &&
    roleFilters.every((role) =>
      new Set<string>([
        ...PLATFORM_END_USER_ROLE_SET,
        "relationship_manager",
        "relationship_managers",
      ]).has(role),
    );
  const actorIsPlatformEndUser = PLATFORM_END_USER_ROLE_SET.has(actorRole);

  let visibleRoleIds: any[] | null = null;
  if (
    actorRole &&
    actorRole !== "super_admin" &&
    actorRole !== "admin" &&
    !(searchingAssignableRoles && !actorIsPlatformEndUser)
  ) {
    const operator = await User.findById(req.user?.sub).select("roleId").lean();
    visibleRoleIds = await resolveVisibleRoleIdsForActor({
      actorRoleId: operator?.roleId ?? null,
      actorRoleName: actorRole,
      permissions: req.user?.permissions || [],
    });
  }

  const allowedIds = visibleRoleIds
    ? new Set(visibleRoleIds.map((id) => String(id)))
    : null;
  const roleIds = roleDocs
    .map((role) => role._id)
    .filter((id) => !allowedIds || allowedIds.has(String(id)));
  if (roleFilters.length && !roleIds.length) {
    return res.json(emptyUserSearchPayload(page, limit));
  }

  const filter: Record<string, any> = {};
  if (roleIds.length) {
    filter.roleId = { $in: roleIds };
  } else if (allowedIds && visibleRoleIds) {
    filter.roleId = { $in: visibleRoleIds };
  }

  const createdAtFilter = buildCreatedAtQueryFilter(
    req.query as Record<string, any>,
  );
  if (createdAtFilter) filter.createdAt = createdAtFilter;

  if (queryRaw) {
    const rx = { $regex: query, $options: "i" };
    filter.$or = [
      { name: rx },
      { companyName: rx },
      { email: rx },
      { phone: rx },
      { userCode: rx },
    ];
  }

  const roleNameById = new Map(
    roleDocs.map((role) => [String(role._id), role.name]),
  );
  const [total, rows] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select(
        "name companyName email phone userCode locality city state pincode isActive createdAt roleId managerId",
      )
      .sort(queryRaw ? { name: 1, createdAt: -1 } : { createdAt: -1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const users = rows.map((user: any) => ({
    _id: user._id,
    userId: user._id,
    name: user.name,
    companyName: user.companyName,
    email: user.email,
    phone: user.phone,
    userCode: user.userCode,
    locality: user.locality,
    city: user.city,
    state: user.state,
    pincode: user.pincode,
    isActive: user.isActive,
    createdAt: user.createdAt,
    managerId: user.managerId || null,
    role: roleNameById.get(String(user.roleId)) || "",
  }));
  const pages = Math.max(1, Math.ceil(total / limit) || 1);

  return res.json({
    results: users,
    data: users,
    count: users.length,
    meta: {
      total,
      page,
      limit,
      pages,
      hasMore: page < pages,
      hasNextPage: page < pages,
      hasPreviousPage: page > 1,
      rangeStart: total === 0 ? 0 : skip + 1,
      rangeEnd: Math.min(skip + users.length, total),
    },
    facets: {
      states: [],
      cities: [],
      localities: [],
      statusCounts: {},
    },
  });
};

export const searchUsers = async (req: AuthRequest, res: Response) => {
  try {
    const queryRaw = req.query.q?.toString().trim() || "";
    const query = queryRaw ? escapeRegex(queryRaw) : "";
    const roleFilterRaw = req.query.role?.toString().trim() || "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const maxLimit = String(req.query.export || "").trim() === "1" ? 500 : 100;
    const limit = Math.min(
      maxLimit,
      Math.max(1, Number(req.query.limit ?? req.query.pageSize) || 20),
    );
    const skip = (page - 1) * limit;

    const ROLE_SEARCH_ALIASES: Record<string, string[]> = {
      sales_agent: ["sales_agent", "sales_executive", "sales_executives"],
      sales_executive: ["sales_agent", "sales_executive", "sales_executives"],
      sales_executives: ["sales_agent", "sales_executive", "sales_executives"],
      customer_care: ["customer_care", "customer_care_executive", "customer_care_executives"],
      customer_care_executive: ["customer_care", "customer_care_executive", "customer_care_executives"],
      team_lead: ["team_lead", "team_leads", "customer_support_team_lead", "customer_support_team_leads"],
      team_leads: ["team_lead", "team_leads", "customer_support_team_lead", "customer_support_team_leads"],
      customer_support_team_lead: [
        "team_lead",
        "team_leads",
        "customer_support_team_lead",
        "customer_support_team_leads",
      ],
      customer_support_team_leads: [
        "team_lead",
        "team_leads",
        "customer_support_team_lead",
        "customer_support_team_leads",
      ],
      relationship_manager: ["relationship_manager", "relationship_managers"],
      operations_head: ["operations_head", "operation_head"],
      operation_head: ["operations_head", "operation_head"],
    };
    const roleFilters = [
      ...new Set(
        (roleFilterRaw
          ? roleFilterRaw
              .split(",")
              .map((role) => role.trim().toLowerCase())
              .filter(Boolean)
          : []
        ).flatMap((role) => ROLE_SEARCH_ALIASES[role] || [role]),
      ),
    ];

    if (!queryRaw && !roleFilters.length) {
      return res.status(400).json({
        message: "Search query 'q' or role is required",
      });
    }

    const leanSearch =
      String(req.query.lean || "").trim() === "1" ||
      String(req.query.view || "").trim().toLowerCase() === "picker";
    if (leanSearch) {
      return respondLeanUserSearch(req, res, {
        queryRaw,
        query,
        roleFilters,
        page,
        limit,
        skip,
      });
    }

    const match: any = {};

    if (queryRaw) {
      match.$or = [
        { name: { $regex: query, $options: "i" } },
        { companyName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
        { phone: { $regex: query, $options: "i" } },
        { userCode: { $regex: query, $options: "i" } },
        { locality: { $regex: query, $options: "i" } },
        { city: { $regex: query, $options: "i" } },
        { state: { $regex: query, $options: "i" } },
        { pincode: { $regex: query, $options: "i" } },
      ];
    }

    const pipeline: any[] = [];

    // Match role on the user document before lookups so search does not scan every user.
    const matchedRoles = roleFilters.length
      ? await Role.find({ name: { $in: roleFilters } }).select("_id").lean()
      : [];
    if (roleFilters.length && !matchedRoles.length) {
      return res.json(emptyUserSearchPayload(page, limit));
    }
    if (matchedRoles.length) {
      pipeline.push({
        $match: { roleId: { $in: matchedRoles.map((role) => role._id) } },
      });
    }

    const createdAtFilter = buildCreatedAtQueryFilter(req.query as Record<string, any>);
    if (createdAtFilter) {
      pipeline.push({ $match: { createdAt: createdAtFilter } });
    }

    const needsAgentJoin = !roleFilters.length || roleFilters.includes("agent");

    pipeline.push(
      {
        $lookup: {
          from: "roles",
          localField: "roleId",
          foreignField: "_id",
          as: "role",
        },
      },
      { $unwind: "$role" },
    );
    if (needsAgentJoin) {
      pipeline.push(
        {
          $lookup: {
            from: "agents",
            localField: "_id",
            foreignField: "user",
            as: "agent",
          },
        },
        {
          $unwind: {
            path: "$agent",
            preserveNullAndEmptyArrays: true,
          },
        },
      );
    }

    const actorRole = String(req.user?.roleName || "")
      .trim()
      .toLowerCase();
    // Roles staff pick on project/property forms (not limited to own hierarchy branch).
    const PROJECT_ASSIGNABLE_ROLE_SET = new Set<string>([
      ...PLATFORM_END_USER_ROLE_SET,
      "relationship_manager",
      "relationship_managers",
    ]);
    const searchingAssignableRoles =
      roleFilters.length > 0 &&
      roleFilters.every((role) => PROJECT_ASSIGNABLE_ROLE_SET.has(role));
    const actorIsPlatformEndUser = PLATFORM_END_USER_ROLE_SET.has(actorRole);

    // Internal staff (Operations, Sales, CEO, etc.) must be able to pick builders
    // and relationship managers when posting projects. Hierarchy descendants alone
    // never include platform roles, and Sales branch does not include RMs.
    if (
      actorRole &&
      actorRole !== "super_admin" &&
      actorRole !== "admin" &&
      !(searchingAssignableRoles && !actorIsPlatformEndUser)
    ) {
      const operator = await User.findById(req.user?.sub)
        .select("roleId")
        .lean();
      const visibleRoleIds = await resolveVisibleRoleIdsForActor({
        actorRoleId: operator?.roleId ?? null,
        actorRoleName: actorRole,
        permissions: req.user?.permissions || [],
      });
      if (visibleRoleIds) {
        pipeline.push({
          $match: { roleId: { $in: visibleRoleIds } },
        });
      }
    }

    if (roleFilters.length === 1) {
      pipeline.push({
        $match: { "role.name": roleFilters[0] },
      });
    } else if (roleFilters.length > 1) {
      pipeline.push({
        $match: { "role.name": { $in: roleFilters } },
      });
    }

    if (queryRaw) {
      pipeline.push({ $match: match });
    }

    // Prefer stronger matches when searching by text (name / company / code first).
    if (queryRaw) {
      pipeline.push({
        $addFields: {
          _searchRank: {
            $switch: {
              branches: [
                {
                  case: {
                    $regexMatch: {
                      input: { $ifNull: ["$name", ""] },
                      regex: query,
                      options: "i",
                    },
                  },
                  then: 0,
                },
                {
                  case: {
                    $regexMatch: {
                      input: { $ifNull: ["$companyName", ""] },
                      regex: query,
                      options: "i",
                    },
                  },
                  then: 1,
                },
                {
                  case: {
                    $regexMatch: {
                      input: { $ifNull: ["$userCode", ""] },
                      regex: query,
                      options: "i",
                    },
                  },
                  then: 2,
                },
                {
                  case: {
                    $regexMatch: {
                      input: { $ifNull: ["$email", ""] },
                      regex: query,
                      options: "i",
                    },
                  },
                  then: 3,
                },
                {
                  case: {
                    $regexMatch: {
                      input: { $ifNull: ["$phone", ""] },
                      regex: query,
                      options: "i",
                    },
                  },
                  then: 4,
                },
              ],
              default: 9,
            },
          },
        },
      });
      pipeline.push({
        $sort: { _searchRank: 1, createdAt: -1, name: 1 },
      });
    } else {
      pipeline.push({ $sort: { createdAt: -1, name: 1 } });
    }

    pipeline.push({
      $project: {
        _id: {
          $cond: [
            { $eq: ["$role.name", "agent"] },
            { $ifNull: ["$agent._id", "$_id"] },
            "$_id",
          ],
        },

        userId: "$_id",

        agentId: {
          $cond: [
            { $eq: ["$role.name", "agent"] },
            { $ifNull: ["$agent._id", null] },
            "$$REMOVE",
          ],
        },

        name: 1,
        companyName: 1,
        email: 1,
        phone: 1,
        userCode: 1,
        address: 1,
        locality: 1,
        city: 1,
        state: 1,
        pincode: 1,
        isActive: 1,
        builderProfile: 1,
        createdAt: 1,

        role: "$role.name",

        verificationStatus: {
          $cond: [
            { $eq: ["$role.name", "agent"] },
            { $ifNull: ["$agent.verificationStatus", null] },
            "$$REMOVE",
          ],
        },

        agentDetails: {
          $cond: [
            { $eq: ["$role.name", "agent"] },
            {
              name: { $ifNull: ["$agent.name", ""] },
              bio: { $ifNull: ["$agent.bio", ""] },
              agencyName: { $ifNull: ["$agent.agencyName", ""] },
              licenseNumber: { $ifNull: ["$agent.licenseNumber", ""] },
              locality: { $ifNull: ["$agent.locality", ""] },
              city: { $ifNull: ["$agent.city", ""] },
              experienceYears: { $ifNull: ["$agent.experienceYears", 0] },
              dealsClosed: { $ifNull: ["$agent.dealsClosed", 0] },
              areasServed: { $ifNull: ["$agent.areasServed", []] },
              languages: { $ifNull: ["$agent.languages", []] },
              avatar: { $ifNull: ["$agent.avatar", null] },
              coverImage: { $ifNull: ["$agent.coverImage", null] },
              rera: {
                reraAgentId: { $ifNull: ["$agent.rera.reraAgentId", ""] },
                isVerified: { $ifNull: ["$agent.rera.isVerified", false] },
              },
              stats: {
                totalProperties: { $ifNull: ["$agent.stats.totalProperties", 0] },
                publishedCount: { $ifNull: ["$agent.stats.publishedCount", 0] },
              },
            },
            "$$REMOVE",
          ],
        },
      },
    });

    const stateQ = String(req.query.state || "").trim();
    const cityQ = String(req.query.city || "").trim();
    const localityQ = String(req.query.locality || "").trim();
    const pincodeQ = String(req.query.pincode || "").trim();
    const exact = (value: string) => new RegExp(`^${escapeRegex(value)}$`, "i");
    const locationMatch: Record<string, any> = {};
    if (stateQ) locationMatch.state = exact(stateQ);
    if (cityQ) locationMatch.city = exact(cityQ);
    if (localityQ) locationMatch.locality = exact(localityQ);
    if (pincodeQ) {
      locationMatch.pincode = { $regex: escapeRegex(pincodeQ), $options: "i" };
    }
    const locStage = Object.keys(locationMatch).length
      ? [{ $match: locationMatch }]
      : [];
    const statusQ = String(
      req.query.verificationStatus || req.query.status || "",
    )
      .trim()
      .toLowerCase();
    const statusMatch: Record<string, any> = {};
    if (statusQ === "pending") {
      statusMatch.$or = [
        { verificationStatus: { $in: [null, ""] } },
        { verificationStatus: { $regex: /^pending$/i } },
      ];
    } else if (statusQ === "approved" || statusQ === "rejected") {
      statusMatch.verificationStatus = exact(statusQ);
    }
    const resultMatchParts = [
      ...(Object.keys(locationMatch).length ? [locationMatch] : []),
      ...(Object.keys(statusMatch).length ? [statusMatch] : []),
    ];
    const resultStage = resultMatchParts.length
      ? [
          {
            $match:
              resultMatchParts.length === 1
                ? resultMatchParts[0]
                : { $and: resultMatchParts },
          },
        ]
      : [];
    const uniqueValues = (
      field: string,
      extraMatch: Record<string, any> = {},
    ) => [
      ...(Object.keys(extraMatch).length ? [{ $match: extraMatch }] : []),
      { $group: { _id: `$${field}` } },
      { $match: { _id: { $nin: [null, ""] } } },
      { $sort: { _id: 1 as const } },
      { $limit: 200 },
    ];

    pipeline.push({
      $facet: {
        meta: [...resultStage, { $count: "total" }],
        results: [...resultStage, { $skip: skip }, { $limit: limit }],
        states: uniqueValues("state"),
        cities: uniqueValues("city", stateQ ? { state: exact(stateQ) } : {}),
        localities: uniqueValues("locality", {
          ...(stateQ ? { state: exact(stateQ) } : {}),
          ...(cityQ ? { city: exact(cityQ) } : {}),
        }),
        statusCounts: [
          ...locStage,
          {
            $group: {
              _id: {
                $toLower: {
                  $ifNull: [
                    {
                      $cond: [
                        {
                          $or: [
                            { $eq: ["$verificationStatus", null] },
                            { $eq: ["$verificationStatus", ""] },
                          ],
                        },
                        "pending",
                        "$verificationStatus",
                      ],
                    },
                    "pending",
                  ],
                },
              },
              n: { $sum: 1 },
            },
          },
        ],
      },
    });

    const [facet] = await User.aggregate(pipeline);
    const total = Number(facet?.meta?.[0]?.total || 0);
    const users = Array.isArray(facet?.results) ? facet.results : [];
    const pages = Math.max(1, Math.ceil(total / limit) || 1);
    const pickIds = (rows: any[]) =>
      (Array.isArray(rows) ? rows : [])
        .map((row) => row?._id)
        .filter((value) => typeof value === "string" && value.trim());

    res.json({
      results: users,
      data: users,
      count: users.length,
      meta: {
        total,
        page,
        limit,
        pages,
        hasMore: page < pages,
        hasNextPage: page < pages,
        hasPreviousPage: page > 1,
        rangeStart: total === 0 ? 0 : skip + 1,
        rangeEnd: Math.min(skip + users.length, total),
      },
      facets: {
        states: pickIds(facet?.states),
        cities: pickIds(facet?.cities),
        localities: pickIds(facet?.localities),
        statusCounts: Object.fromEntries(
          (Array.isArray(facet?.statusCounts) ? facet.statusCounts : [])
            .filter((row: any) => row?._id)
            .map((row: any) => [String(row._id), Number(row.n) || 0]),
        ),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Search failed" });
  }
};

export const createRequestOtp = async (req: Request, res: Response) => {
  try {
    let { phone, email } = req.body;
    phone = phone?.trim();
    const phoneValues = getPhoneLookupValues(phone);
    const normalizedPhone = phoneValues.find(
      (value) => value.length === 10,
    );
    email = email?.trim()?.toLowerCase();

    // Validate phone
    if (!phone && !email) {
      return res.status(400).json({
        message: "Either phone or email is required",
      });
    }

    const existingUser = await User.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(phoneValues.length ? [{ phone: { $in: phoneValues } }] : []),
      ],
    }).select("_id");

    if (existingUser) {
      return res.status(409).json({
        message: "Account already exists. Please log in.",
        code: "ACCOUNT_EXISTS",
      });
    }

    // Previously deleted phone/email: allow fresh public signup.
    // Clear tombstone(s), then send OTP and create a new users row on verify.
    await clearDeletedAccountTombstones({ email, phone });

    const otp = genOtp();
    
    const key = normalizedPhone || phone || email;

    if (isDummyLoginPhone(phone)) {
      return res.status(200).json({
        message: "OTP sent successfully",
      });
    }

    await saveOtpToRedis(key, otp);

   if (phone) {
      await sendOtpWhatsApp(phone, otp);
    } else if (email) {
      await sendOtpEmail(email, otp); // 👈 you need to implement this
    }
    
    res.status(200).json({
      message: "OTP sent successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

export const createVerifyOtp = async (req: Request, res: Response) => {
  try {
    let { email, phone, otp, name, role, companyName, viewerPlanCategory } =
      req.body;
    const tempLocation = sanitizeTempLocationInput(req.body);

    email = email?.trim()?.toLowerCase();
    phone = phone?.trim();
    const normalizedPhone = getPhoneLookupValues(phone).find(
      (value) => value.length === 10,
    );
    otp = otp?.trim();
    companyName = companyName?.trim();
    viewerPlanCategory =
      viewerPlanCategory === "rent_view" ? "rent_view" : "buy";

    if (!phone) {
      return res.status(400).json({
        message: "Phone number is required",
      });
    }

    if (!otp) {
      return res.status(400).json({
        message: "OTP is required",
      });
    }

    name = name?.trim();
    role = role?.trim()?.toLowerCase();
    let user = await User.findOne({
      phone: { $in: getPhoneLookupValues(phone) },
    }).populate("roleId");

    const nameError = user ? "" : validateSignupName(name);
    if (!user && nameError) {
      return res.status(400).json({
        message: nameError,
        field: "name",
        code: "VALIDATION_ERROR",
      });
    }

    if (!role) {
      return res.status(400).json({
        message: "Role is required",
        field: "role",
        code: "VALIDATION_ERROR",
      });
    }

    const companyNameError =
      !user && role === "builder" ? validateCompanyName(companyName) : "";
    if (companyNameError) {
      return res.status(400).json({
        message: companyNameError,
        field: "companyName",
        code: "VALIDATION_ERROR",
      });
    }

    // verify OTP
    const otpResult = await verifyDummyOrRedisOtp({
      phone,
      key: normalizedPhone || phone,
      otp,
    });

    if (!otpResult.valid) {
      return res.status(400).json({
        ...getOtpFailureResponse(otpResult),
      });
    }

    // USER EXISTS
    if (user) {
      if (user.accountStatus === "active") {
        return res.status(409).json({
          message: "Account already registered. Please login.",
        });
      }

      // Incomplete signup: keep temp header location for early CCE match (additive).
      if (tempLocation && !user.state) {
        user.tempCity = tempLocation.tempCity;
        user.tempState = tempLocation.tempState;
        user.tempLocationSource = tempLocation.tempLocationSource;
        user.tempLocationAt = tempLocation.tempLocationAt;
        try {
          // Reassign only when existing CCE no longer covers the new header city/state.
          await ensureFollowUpAssignee(user, { reassignIfNotCovering: true });
        } catch {
          /* non-blocking */
        }
        await user.save();
      }

      const roleDoc: any = user.roleId;

      if (roleDoc?.name === "user") {
        try {
          await activateSubscription(
            String(user._id),
            "user",
            viewerPlanCategory === "rent_view" ? "RENTAL_FREE" : "BUYER_FREE",
          );
        } catch (subscriptionError) {
          console.error("Failed to auto-assign free viewer plan:", subscriptionError);
        }
      }

      const token = await createAuthToken({ user, roleDoc });

      let nextStep = "location";

      if (user.locality && user.city && user.state && user.pincode) {
        nextStep = "completed";
      }

      return res.status(200).json({
        message: "Continue signup process",
        token,
        userId: String(user._id),
        nextStep,
      });
    }

    // NEW USER
    const roleDoc = await Role.findOne({
      name: role,
    });

    if (!roleDoc) {
      return res.status(400).json({
        message: "Invalid role",
      });
    }

    // Safety: ensure no leftover deleted-account block for this phone/email.
    await clearDeletedAccountTombstones({ email, phone });

    user = await User.create({
      name,
      companyName: role === "builder" ? companyName : undefined,
      email: email || undefined,
      phone: normalizedPhone || phone,
      roleId: roleDoc._id,
      phoneVerified: true,
      accountStatus: "active",
      ...(tempLocation
        ? {
            tempCity: tempLocation.tempCity,
            tempState: tempLocation.tempState,
            tempLocationSource: tempLocation.tempLocationSource,
            tempLocationAt: tempLocation.tempLocationAt,
          }
        : {}),
    });

    if (roleDoc.name === "agent") {
      await createInitialAgentProfile(user._id);
    }

    if (roleDoc.name === "user") {
      try {
        await activateSubscription(
          String(user._id),
          "user",
          viewerPlanCategory === "rent_view" ? "RENTAL_FREE" : "BUYER_FREE",
        );
      } catch (subscriptionError) {
        console.error("Failed to auto-assign free viewer plan:", subscriptionError);
      }
    }

    // Exclusive CCE follow-up owner (temp city/state when present; else global RR).
    try {
      const didAssign = await ensureFollowUpAssignee(user);
      if (didAssign) await user.save();
    } catch {
      /* non-blocking */
    }

    if (user.email && user.name) {
      sendSignupEmailByRole(
        user.email,
        user.name,
        roleDoc.name || "user",
      )
        .then(() => {
          User.findByIdAndUpdate(user._id, { welcomeEmailSent: true }).catch(() => {});
        })
        .catch((emailError) => {
          console.error("Failed to send welcome email on signup:", emailError);
        });
    }

    const token = await createAuthToken({ user, roleDoc });

    return res.status(201).json({
      message: "Account created. Continue signup.",
      token,
      userId: String(user._id),
      nextStep: "location",
    });
  } catch (error: any) {
    if (error?.name === "ValidationError") {
      const firstError = Object.values(error.errors || {})[0] as any;
      return res.status(400).json({
        message: firstError?.message || "Validation failed",
        field: firstError?.path,
        code: "VALIDATION_ERROR",
      });
    }

    return res.status(500).json({
      message: "Signup failed",
      error: error.message,
    });
  }
};

export const adminCreateRequestOtp = async (req: Request, res: Response) => {
  try {
    let { email } = req.body;
    email = email?.trim()?.toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const existingUser = await User.findOne({ email })
      .select("_id email accountStatus isActive")
      .lean();

    if (existingUser?.isActive === false) {
      return res.status(403).json({
        message: deletedAccountMessage,
      });
    }

    if (existingUser?.accountStatus === "active") {
      return res.status(409).json({
        message: "Account already registered. Please login.",
      });
    }

    // Allow Super Admin / credential creators to recreate a previously deleted email.
    await clearDeletedAccountTombstones({ email });

    const otp = genOtp();
    await saveOtpToRedis(email, otp);
    await sendOtpEmail(email, otp);

    return res.status(200).json({
      message: "OTP sent successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

export const adminCreateVerifyOtp = async (req: AuthRequest, res: Response) => {
  try {
    let { email, otp, name, role } = req.body;
    const createPrivateRole = req.body?.createPrivateRole === true;
    const reportsToUserId = resolveReportsToUserId(req.body);

    email = email?.trim()?.toLowerCase();
    otp = otp?.trim();
    name = name?.trim();
    role = role?.trim()?.toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    if (!otp) {
      return res.status(400).json({
        message: "OTP is required",
      });
    }

    let user = await User.findOne({ email }).populate("roleId");

    const nameError = user ? "" : validateSignupName(name);
    if (!user && nameError) {
      return res.status(400).json({
        message: nameError,
        field: "name",
        code: "VALIDATION_ERROR",
      });
    }

    const otpResult = await verifyAndConsumeOtpWithReason(email, otp);

    if (!otpResult.valid) {
      return res.status(400).json({
        ...getOtpFailureResponse(otpResult),
      });
    }

    if (user) {
      if (user.isActive === false) {
        return res.status(403).json({
          message: deletedAccountMessage,
        });
      }

      const roleDoc: any = user.roleId;
      const token = await createAuthToken({ user, roleDoc });

      let nextStep = "location";
      if (user.locality && user.city && user.state && user.pincode) {
        nextStep = "completed";
      }

      return res.status(200).json({
        message:
          user.accountStatus === "active"
            ? "Account already registered. Please login."
            : "Continue signup process",
        token,
        nextStep,
        role: roleDoc
          ? { _id: String(roleDoc._id), name: roleDoc.name, label: roleDoc.label }
          : null,
      });
    }

    if (!role && !createPrivateRole) {
      return res.status(400).json({
        message: "Invalid admin role",
      });
    }

    let roleDoc: any;

    if (createPrivateRole) {
      const baseName = String(name || email.split("@")[0] || "team_member")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 36) || "team_member";

      roleDoc = await Role.create({
        name: `staff_${baseName}_${Date.now().toString(36)}`,
        label: `${name} Access`,
        permissions: [],
        roleType: "custom",
        isProtected: false,
        isActive: true,
      });
    } else {
      // Older seeded roles may not have an isActive field. Treat them as active
      // unless they have been explicitly disabled, matching the assignable list.
      roleDoc = await Role.findOne({ name: role, isActive: { $ne: false } });
    }

    if (!roleDoc) {
      return res.status(400).json({
        message: "Invalid role",
      });
    }

    if (req.user) {
      let canAssign = req.user.roleName === "super_admin";
      if (!canAssign) {
        const actor = await User.findById(req.user.sub).select("roleId").lean();
        const descendantRoleIds = actor?.roleId
          ? await getDescendantRoleIds(actor.roleId)
          : [];
        canAssign = descendantRoleIds.some((roleId) => String(roleId) === String(roleDoc._id));
      }
      if (!canAssign) {
        return res.status(403).json({
          message: `You cannot create credentials for the '${roleDoc.label || roleDoc.name}' role. Select a role below your role in the organisation hierarchy.`,
        });
      }
    }

    if (!createPrivateRole && !ADMIN_CREATE_ROLES.has(role) && roleDoc.roleType !== "custom") {
      return res.status(400).json({ message: "Role cannot be used for Admin Dashboard credentials" });
    }

    let managerId: mongoose.Types.ObjectId | undefined;
    let reportsToUser: any = null;
    if (reportsToUserId) {
      const check = await assertValidReportsToAssignment({
        reportRoleName: roleDoc.name,
        managerUserId: reportsToUserId,
      });
      if (!check.ok) {
        return res.status(check.status).json({ message: check.message });
      }
      managerId = check.manager._id as mongoose.Types.ObjectId;
      reportsToUser = {
        _id: String(check.manager._id),
        name: check.manager.name,
        email: check.manager.email,
        roleName: (check.manager.roleId as any)?.name || null,
      };
    }

    // Rehire path: remove deleted-account block for this email before creating again.
    await clearDeletedAccountTombstones({ email });

    user = await User.create({
      name,
      email,
      roleId: roleDoc._id,
      ...(managerId ? { managerId } : {}),
      accountStatus: "active",
    });

    if (roleDoc.name === "agent") {
      await createInitialAgentProfile(user._id);
    }

    const token = await createAuthToken({ user, roleDoc });

    return res.status(201).json({
      message: "Account created. Continue signup.",
      token,
      nextStep: "complete",
      role: { _id: String(roleDoc._id), name: roleDoc.name, label: roleDoc.label },
      reportsTo: reportsToUser,
      hierarchy: describeRoleHierarchy(roleDoc.name),
    });
  } catch (error: any) {
    if (error?.name === "ValidationError") {
      const firstError = Object.values(error.errors || {})[0] as any;
      return res.status(400).json({
        message: firstError?.message || "Validation failed",
        field: firstError?.path,
        code: "VALIDATION_ERROR",
      });
    }

    return res.status(500).json({
      message: "Admin signup failed",
      error: error.message,
    });
  }
};

export const adminCreateUpdateLocation = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    // check auth
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    let { locality, city, state, pincode } = req.body;

    // validation
    if (!locality || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        message: "All location fields are required",
      });
    }

    // trim values
    locality = locality.trim();
    city = city.trim();
    state = state.trim();
    pincode = pincode.trim();

    // fetch user
    const user = await User.findById(req.user.id).populate("roleId");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // role document
    const roleDoc: any = user.roleId;

    console.log("ROLE DOC:", roleDoc);
    console.log("ROLE NAME:", roleDoc?.name);

    // check role exists
    if (!roleDoc?.name) {
      return res.status(400).json({
        success: false,
        message: "Role not assigned to user",
      });
    }

    // check allowed roles
    if (!ADMIN_CREATE_ROLES.has(roleDoc.name) && roleDoc.roleType !== "custom") {
      return res.status(403).json({
        success: false,
        message:
          "This endpoint is only allowed for admin-created roles",
      });
    }

    // prevent duplicate onboarding
    if (user.accountStatus === "active") {
      return res.status(400).json({
        success: false,
        message: "Location already updated",
      });
    }

    // update user location
    user.locality = locality;
    user.city = city;
    user.state = state;
    user.pincode = pincode;

    // Seed CCE working territory from initial credential location (additive).
    seedWorkingLocationsOnActivate(user, { state, city, locality });

    // activate account
    user.accountStatus = "active";

    await user.save();

    if (user.email && user.name) {
      sendSignupEmailByRole(
        user.email,
        user.name,
        roleDoc.name || "user",
      ).catch((emailError) => {
        console.error(
          "Failed to send welcome email on admin create location update:",
          emailError,
        );
      });
    }

    // create fresh token
    const token = await createAuthToken({
      user,
      roleDoc,
    });

    return res.status(200).json({
      success: true,
      message:
        "Location updated successfully. Account is now active.",
      token,
      user,
    });
  } catch (error: any) {
    console.error(
      "ADMIN CREATE UPDATE LOCATION ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update location",
      error: error.message,
    });
  }
};

export const updateLocationOtp = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let { locality, city, state, pincode } = req.body;

    if (!locality || !city || !state || !pincode) {
      return res.status(400).json({
        message: "All location fields are required",
      });
    }

    const updatedUser = await User.findById(req.user.sub);

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    updatedUser.locality = locality.trim();
    updatedUser.city = city.trim();
    updatedUser.state = state.trim();
    updatedUser.pincode = pincode.trim();

    // Real Location step wins — clear temporary header location.
    updatedUser.tempCity = null;
    updatedUser.tempState = null;
    updatedUser.tempLocationSource = null;
    updatedUser.tempLocationAt = null;

    const populatedUser = await updatedUser.populate("roleId");
    const roleName =
      typeof populatedUser.roleId === "object" &&
      populatedUser.roleId &&
      "name" in populatedUser.roleId
        ? populatedUser.roleId.name
        : undefined;

    const wasAlreadyActive = updatedUser.accountStatus === "active";
    updatedUser.accountStatus = "active";

    // Keep same CCE if they still cover final location; otherwise remove + reassign.
    try {
      await ensureFollowUpAssignee(updatedUser, { reassignIfNotCovering: true });
    } catch {
      /* non-blocking */
    }

    await updatedUser.save();

    if (!wasAlreadyActive && !updatedUser.welcomeEmailSent && updatedUser.email && updatedUser.name) {
      sendSignupEmailByRole(
        updatedUser.email,
        updatedUser.name,
        String(roleName || "user"),
      )
        .then(() => {
          User.findByIdAndUpdate(updatedUser._id, { welcomeEmailSent: true }).catch(() => {});
        })
        .catch((emailError) => {
          console.error(
            "Failed to send welcome email on location update:",
            emailError,
          );
        });
    }

    const roleDoc: any = updatedUser.roleId;
    const token = generateToken({
      sub: String(updatedUser._id),
      email: updatedUser.email,
      phone: Number(updatedUser.phone),
      name: updatedUser.name,
      companyName: updatedUser.companyName,
      roleId: roleDoc ? String(roleDoc._id) : undefined,
      roleName: roleDoc?.name,
      permissions: roleDoc?.permissions ?? [],
      accountStatus: updatedUser.accountStatus,
    });

    return res.status(200).json({
      message:
        roleName === "builder"
          ? "Location updated successfully. Builder account is now active."
          : "Location updated successfully",
      token,
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to update location",
      error: error.message,
    });
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ✅ Allow only safe fields
    const allowedUpdates = [
      "name",
      "companyName",
      "email",
      "address",
      "locality",
      "city",
      "state",
      "pincode",
    ];
    const optionalStringFields = new Set([
      "companyName",
      "email",
      "address",
      "locality",
      "city",
      "state",
      "pincode",
    ]);
    const updates: Record<string, unknown> = {};

    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] === "string") {
          const cleaned = req.body[key].trim();
          if (cleaned === "" && optionalStringFields.has(key)) {
            updates[key] = undefined;
            continue;
          }
          updates[key] = key === "email" ? cleaned.toLowerCase() : cleaned;
        } else {
          updates[key] = req.body[key];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const user = await User.findById(req.user.sub).populate("roleId");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    for (const [key, value] of Object.entries(updates)) {
      user.set(key, value);
    }
    await user.save();

    const role: any = user.roleId;

    return res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        companyName: user.companyName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        locality: user.locality,
        city: user.city,
        state: user.state,
        pincode: user.pincode,
        roleId: role ? String(role._id) : null,
        roleName: role ? role.name : null,
        permissions: role ? role.permissions : [],
      },
    });
  } catch (error: any) {
    console.error("Update profile error:", error);

    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(409).json({
        message: "Email already exists. Please use a different email.",
      });
    }

    if (error?.name === "ValidationError") {
      const firstError = Object.values(error.errors || {})[0] as
        | { message?: string }
        | undefined;

      return res.status(400).json({
        message: firstError?.message || "Please check the profile details and try again.",
      });
    }

    return res.status(500).json({ message: "Failed to update profile" });
  }
};

export const requestAdminUserPhoneChangeOtp = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;
    const phone = req.body.phone?.toString().trim();

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const phoneError = validatePhoneNumber(phone);
    if (phoneError) {
      return res.status(400).json({ message: phoneError });
    }

    const user = await User.findById(id)
      .select("_id phone roleId")
      .populate("roleId", "name label");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const gate = assertCanManageUserLifecycle({
      actorRoleName: req.user?.roleName ?? null,
      targetRoleName: String((user.roleId as any)?.name || ""),
      actorUserId: req.user?.sub ?? null,
      targetUserId: id,
    });
    if (!gate.ok) {
      return res.status(gate.status).json({ message: gate.message });
    }

    if (getPhoneLookupValues(phone).includes(String(user.phone || ""))) {
      return res.status(400).json({
        message: "This phone number is already linked to this account",
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
    await saveOtpToRedis(
      getAdminPhoneChangeOtpKey(req.user.sub, String(user._id), phone),
      otp
    );
    await sendOtpWhatsApp(phone, otp);

    return res.status(200).json({
      message: "OTP sent to new phone number",
      phone,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to send phone verification OTP",
      error: error.message,
    });
  }
};

export const updateUserProfileById = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const existing = await User.findById(id).populate("roleId", "name label");
    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    const targetRoleName = String((existing.roleId as any)?.name || "").toLowerCase();
    const gate = assertCanManageUserLifecycle({
      actorRoleName: req.user?.roleName ?? null,
      targetRoleName,
      actorUserId: req.user?.sub ?? null,
      targetUserId: id,
    });
    if (!gate.ok) {
      return res.status(gate.status).json({ message: gate.message });
    }

    const updates: Record<string, unknown> = {};

    for (const key of ADMIN_PROFILE_UPDATE_FIELDS) {
      if (req.body[key] === undefined) continue;

      if (typeof req.body[key] === "string") {
        const cleaned = req.body[key].trim();
        if (key === "email") {
          updates[key] = cleaned ? cleaned.toLowerCase() : undefined;
        } else if (key === "phone") {
          updates[key] = cleaned;
        } else {
          updates[key] = cleaned;
        }
      } else {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    if (updates.name !== undefined && String(updates.name).trim().length === 0) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (updates.phone !== undefined) {
      const phoneValue = String(updates.phone ?? "").trim();
      // Empty phone is allowed (optional) — clears the number without OTP.
      if (!phoneValue) {
        updates.phone = "";
      } else {
        const phoneError = validatePhoneNumber(phoneValue);
        if (phoneError) {
          return res.status(400).json({ message: phoneError });
        }
        updates.phone = phoneValue;
      }
    }

    const user = existing;

    if (updates.email !== undefined) {
      const nextEmail = String(updates.email || "")
        .trim()
        .toLowerCase();

      if (!nextEmail) {
        return res.status(400).json({ message: "Email is required" });
      }

      if (!/^\S+@\S+\.\S+$/.test(nextEmail)) {
        return res.status(400).json({ message: "Invalid email" });
      }

      updates.email = nextEmail;

      if (nextEmail !== String(user.email || "").trim().toLowerCase()) {
        const existingEmailUser = await User.findOne({
          email: nextEmail,
          _id: { $ne: user._id },
        }).select("_id");

        if (existingEmailUser) {
          return res.status(409).json({
            message: "Email already exists. Please use a different email.",
          });
        }
      }
    }

    const nextPhone =
      updates.phone !== undefined ? String(updates.phone || "") : String(user.phone || "");
    const phoneChanged =
      updates.phone !== undefined && nextPhone !== String(user.phone || "");
    const clearingPhone = phoneChanged && !nextPhone;

    if (phoneChanged && !clearingPhone) {
      const phoneOtp = req.body.phoneOtp?.toString().trim();

      if (!phoneOtp) {
        return res.status(400).json({
          message: "OTP is required to update phone number",
        });
      }

      const existingUser = await User.findOne({
        _id: { $ne: user._id },
        phone: { $in: getPhoneLookupValues(String(updates.phone)) },
      }).select("_id");

      if (existingUser) {
        return res.status(409).json({
          message: "Phone number already exists. Please use a different phone number.",
        });
      }

      const otpResult = await verifyAndConsumeOtpWithReason(
        getAdminPhoneChangeOtpKey(req.user.sub, String(user._id), String(updates.phone)),
        phoneOtp
      );

      if (!otpResult.valid) {
        return res.status(400).json({
          ...getOtpFailureResponse(otpResult),
        });
      }
    }

    if (phoneChanged && user.phone && !clearingPhone) {
      user.phoneHistory = [
        ...((user.phoneHistory as any[]) || []),
        {
          phone: user.phone,
          changedAt: new Date(),
          changedBy: new mongoose.Types.ObjectId(req.user.sub),
        },
      ] as any;
    }

    if (clearingPhone && user.phone) {
      user.phoneHistory = [
        ...((user.phoneHistory as any[]) || []),
        {
          phone: user.phone,
          changedAt: new Date(),
          changedBy: new mongoose.Types.ObjectId(req.user.sub),
        },
      ] as any;
      user.phoneVerified = false;
    }

    if (phoneChanged && !clearingPhone) {
      user.phoneVerified = true;
    }

    if (clearingPhone) {
      delete updates.phone;
      user.set("phone", undefined);
      user.markModified("phone");
    } else if (updates.phone === "") {
      // Already empty — do not write "" (breaks unique/sparse + match).
      delete updates.phone;
    }

    Object.assign(user, updates);
    await user.save();

    const role: any = user.roleId;

    return res.status(200).json({
      message: "User profile updated successfully",
      user: {
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
        roleId: role ? String(role._id) : null,
        roleName: role ? role.name : null,
        permissions: role ? role.permissions : [],
      },
    });
  } catch (error: any) {
    console.error("Admin update profile error:", error);

    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(409).json({
        message: "Email already exists. Please use a different email.",
      });
    }

    if (error?.code === 11000 && error?.keyPattern?.phone) {
      return res.status(409).json({
        message: "Phone number already exists. Please use a different phone number.",
      });
    }

    if (error?.name === "ValidationError") {
      const firstError = Object.values(error.errors || {})[0] as any;
      return res.status(400).json({
        message: firstError?.message || "Validation failed",
      });
    }

    return res.status(500).json({ message: "Failed to update user profile" });
  }
};

export const getManagerTeamDetails = async (req: Request, res: Response) => {
  try {
    const managerId = req.params.id;

    // ⭐ Check ID exists
    if (!managerId) {
      return res.status(400).json({ message: "managerId is required" });
    }

    // ⭐ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(managerId)) {
      return res.status(400).json({ message: "Invalid managerId" });
    }

    // ⭐ Now safe to use
    const manager = await User.findById(managerId)
      .populate("roleId", "name label")
      .select("name email phone");

    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }

    const role: any = manager.roleId;
    const roleName = role?.name || null;

    // Additive: any hierarchy head can have direct reports via managerId.
    // Legacy sales Team Management still works when role is sales_manager.
    const reports = await User.find({ managerId })
      .select("name email phone city state locality pincode accountStatus")
      .populate("roleId", "name label")
      .lean();

    const agents = reports.map((report: any) => ({
      ...report,
      roleName: report.roleId?.name || null,
      roleId: report.roleId?._id ? String(report.roleId._id) : null,
    }));

    res.json({
      manager: {
        id: manager._id,
        name: manager.name,
        email: manager.email,
        roleName,
        roleLabel: role?.label || roleName,
      },
      totalAgents: agents.length,
      totalReports: agents.length,
      agents,
      reports: agents,
      hierarchy: describeRoleHierarchy(roleName),
    });
  } catch (err: any) {
    console.error("getManagerTeamDetails error:", err);
    res.status(500).json({ message: err.message });
  }
};

export const assignManager = async (req: Request, res: Response) => {
  try {
    const { salesagentId, managerId } = req.body;

    // ⭐ Validate input
    if (!salesagentId || !managerId) {
      return res.status(400).json({
        message: "salesagentId and managerId are required",
      });
    }

    // ⭐ Validate ObjectId
    if (
      !mongoose.Types.ObjectId.isValid(salesagentId) ||
      !mongoose.Types.ObjectId.isValid(managerId)
    ) {
      return res.status(400).json({ message: "Invalid user IDs" });
    }

    // ⭐ Get users
    const agent = await User.findById(salesagentId).populate("roleId");
    const manager = await User.findById(managerId).populate("roleId");

    if (!agent || !manager) {
      return res.status(404).json({ message: "User not found" });
    }

    const agentRole: any = agent.roleId;
    const managerRole: any = manager.roleId;

    // ⭐ Check agent role
    if (!agentRole || agentRole.name !== "sales_agent") {
      return res.status(400).json({
        message: "User must be sales_agent",
      });
    }

    // ⭐ Check manager role
    if (!managerRole || managerRole.name !== "sales_manager") {
      return res.status(400).json({
        message: "Manager must be sales_manager",
      });
    }

    // ⭐ Assign manager
    agent.managerId = manager._id;
    await agent.save();

    return res.json({
      message: "Manager assigned successfully",
      agent: {
        id: agent._id,
        name: agent.name,
      },
      manager: {
        id: manager._id,
        name: manager.name,
      },
    });
  } catch (err: any) {
    console.error("assignManager error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Eligible person-level managers for a target role (hierarchy-aware).
 * GET /auth/eligible-reports-to?targetRole=sales_agent
 */
export const getEligibleReportsTo = async (req: AuthRequest, res: Response) => {
  try {
    const targetRole = canonicalRoleName(
      String(req.query.targetRole || req.query.role || "").trim(),
    );
    const forUserId = String(req.query.forUserId || "").trim();
    const stateFilter = String(req.query.state || "").trim();

    if (!targetRole) {
      return res.status(400).json({ message: "targetRole is required" });
    }

    const hierarchy = describeRoleHierarchy(targetRole);
    const reportsToRoles = hierarchy.reportsToRoles;
    const reportsToRoleNames = expandReportsToRoleNames(reportsToRoles);

    if (!reportsToRoles.length) {
      return res.json({
        success: true,
        targetRole,
        required: false,
        ...hierarchy,
        users: [],
      });
    }

    const managerRoles = await Role.find({
      name: { $in: reportsToRoleNames },
    })
      .select("_id name label isActive")
      .lean();

    if (!managerRoles.length) {
      return res.json({
        success: true,
        targetRole,
        required: false,
        ...hierarchy,
        users: [],
        message:
          "No parent role found (e.g. Customer Support Team Lead). Create that role user first.",
      });
    }

    const roleIds = managerRoles.map((role) => role._id);
    const roleNameById = new Map(
      managerRoles.map((role) => [String(role._id), role.name]),
    );

    const userFilter: Record<string, any> = {
      roleId: { $in: roleIds },
      isActive: { $ne: false },
    };
    if (forUserId && mongoose.Types.ObjectId.isValid(forUserId)) {
      userFilter._id = { $ne: forUserId };
    }
    // Optional state filter (exact or case-insensitive). Empty state = all managers.
    if (stateFilter) {
      userFilter.state = new RegExp(
        `^${stateFilter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i",
      );
    }

    // Non–super_admin actors only see managers within their descendant visibility band
    // plus themselves if they hold an eligible manager role.
    const actorRole = req.user?.roleName || "";
    if (actorRole && actorRole !== "super_admin" && actorRole !== "admin") {
      const actor = await User.findById(req.user?.sub).select("roleId").lean();
      const descendantRoleIds = actor?.roleId
        ? await getDescendantRoleIds(actor.roleId)
        : [];
      const visibleManagerRoleIds = roleIds.filter(
        (id) =>
          descendantRoleIds.some((d) => String(d) === String(id)) ||
          String(actor?.roleId) === String(id),
      );
      if (!visibleManagerRoleIds.length) {
        return res.json({
          success: true,
          targetRole,
          required: reportsToRoles.length > 0,
          ...hierarchy,
          users: [],
        });
      }
      userFilter.roleId = { $in: visibleManagerRoleIds };
    }

    const users = await User.find(userFilter)
      .select("name email phone city state locality pincode roleId accountStatus")
      .lean();

    const preferred = hierarchy.preferredReportsToRole;
    const sorted = users
      .map((user: any) => ({
        _id: String(user._id),
        name: user.name,
        email: user.email,
        phone: user.phone,
        city: user.city,
        state: user.state,
        locality: user.locality,
        pincode: user.pincode,
        accountStatus: user.accountStatus,
        roleName: roleNameById.get(String(user.roleId)) || null,
      }))
      .sort((a, b) => {
        const aPref = a.roleName === preferred ? 0 : 1;
        const bPref = b.roleName === preferred ? 0 : 1;
        return aPref - bPref || String(a.name || "").localeCompare(String(b.name || ""));
      });

    return res.json({
      success: true,
      targetRole,
      required: reportsToRoles.length > 0,
      ...hierarchy,
      users: sorted,
    });
  } catch (err: any) {
    console.error("getEligibleReportsTo error:", err);
    return res.status(500).json({ message: err.message || "Failed to load reports-to options" });
  }
};

/**
 * Generalized person reporting assignment for any hierarchy pair.
 * POST /auth/assign-reports-to
 * Body: { userId, reportsToUserId | managerId | null }
 * Legacy POST /auth/assign-manager remains unchanged for sales_agent → sales_manager.
 */
export const assignReportsTo = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.body?.userId || req.body?.salesagentId || "").trim();
    const reportsToUserId = resolveReportsToUserId(req.body);

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }
    if (reportsToUserId === undefined) {
      return res.status(400).json({
        message: "reportsToUserId is required (pass null to clear)",
      });
    }

    const user = await User.findById(userId).populate("roleId", "name label");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const reportRoleName = (user.roleId as any)?.name;
    if (!reportRoleName) {
      return res.status(400).json({ message: "User has no role assigned" });
    }

    if (reportsToUserId === null) {
      user.managerId = null as any;
      await user.save();
      return res.json({
        message: "Reports-to cleared successfully",
        user: {
          id: user._id,
          name: user.name,
          roleName: reportRoleName,
        },
        reportsTo: null,
        hierarchy: describeRoleHierarchy(reportRoleName),
      });
    }

    const check = await assertValidReportsToAssignment({
      reportUserId: userId,
      reportRoleName,
      managerUserId: reportsToUserId,
    });
    if (!check.ok) {
      return res.status(check.status).json({ message: check.message });
    }

    user.managerId = check.manager._id as any;
    await user.save();

    return res.json({
      message: "Reports-to assigned successfully",
      user: {
        id: user._id,
        name: user.name,
        roleName: reportRoleName,
      },
      reportsTo: {
        id: check.manager._id,
        name: check.manager.name,
        email: check.manager.email,
        roleName: (check.manager.roleId as any)?.name || null,
      },
      hierarchy: describeRoleHierarchy(reportRoleName),
    });
  } catch (err: any) {
    console.error("assignReportsTo error:", err);
    return res.status(500).json({ message: err.message || "Failed to assign reports-to" });
  }
};

/** GET /auth/role-hierarchy?role=sales_agent — above / below / reports-to roles */
export const getRoleHierarchyGuide = async (req: AuthRequest, res: Response) => {
  try {
    const role = canonicalRoleName(String(req.query.role || "").trim());
    if (!role) {
      return res.status(400).json({ message: "role is required" });
    }
    return res.json({ success: true, ...describeRoleHierarchy(role) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to load hierarchy" });
  }
};
