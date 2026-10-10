import { Types } from "mongoose";
import { sendBulkPush } from "../../../../shared/notifications/push.service";
import { getActiveDeviceTokensForUsers } from "../../../../shared/notifications/deviceTokens";
import FeaturedProject from "../models/featurePropertiesModel";
import Role from "../models/roleModel";
import User from "../models/userModel";
import HighTimeSpentNotification from "../models/highTimeSpentNotificationModel";

export type NotifyInput = {
  type: string;
  title: string;
  body: string;
  actorUserId?: string | undefined;
  ownerId?: string | Types.ObjectId | null | undefined;
  projectId?: string | Types.ObjectId | null | undefined;
  propertyType?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
};

const ADMIN_ROLE_NAMES = ["admin", "super_admin"];
const DEBUG_DELIVERY_TYPES = new Set(["brochure_downloaded", "contact_requested"]);
export const HIGH_TIME_SPENT_COOLDOWN_HOURS =
  Number(process.env.HIGH_TIME_SPENT_COOLDOWN_HOURS) || 6;

const stringifyData = (data: Record<string, unknown> = {}) =>
  Object.entries(data).reduce<Record<string, string>>((result, [key, value]) => {
    if (value === undefined || value === null) return result;
    result[key] = String(value);
    return result;
  }, {});

const sendToTokens = async (
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
) => {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (!uniqueTokens.length) {
    return { successCount: 0, failureCount: 0, failedTokens: [] };
  }

  return sendBulkPush({
    tokens: uniqueTokens,
    title,
    body,
    data: stringifyData(data),
  });
};

const getAdminUsers = async () => {
  const roles = await Role.find({ name: { $in: ADMIN_ROLE_NAMES } })
    .select("_id")
    .lean();
  const roleIds = roles.map((role) => role._id);

  if (!roleIds.length) return [];

  return User.find({
    roleId: { $in: roleIds },
    isActive: { $ne: false },
  })
    .select("_id")
    .lean();
};

const getOwnerAudience = async (ownerId?: string | Types.ObjectId | null) => {
  if (!ownerId || !Types.ObjectId.isValid(String(ownerId))) {
    return "user";
  }

  const owner = await User.findById(ownerId)
    .select("roleId")
    .populate("roleId", "name")
    .lean();
  const roleName = String((owner?.roleId as any)?.name || "").toLowerCase();

  if (roleName === "builder" || roleName === "builder_staff") return "builder";
  if (roleName === "agent" || roleName === "sales_agent") return "agent";
  return "user";
};

const getProjectNotificationData = (metadata?: Record<string, unknown>) => {
  const projectSlug = String(metadata?.projectSlug || metadata?.slug || "").trim();
  const promotionType = String(metadata?.promotionType || "").trim();

  return {
    ...(projectSlug
      ? {
          slug: projectSlug,
          listingKind: "project",
          category: "featuredproject",
          promotionType,
        }
      : {}),
  };
};

export const shouldSendHighTimeSpentPush = async ({
  userId,
  projectId,
  cooldownHours = HIGH_TIME_SPENT_COOLDOWN_HOURS,
}: {
  userId: string | Types.ObjectId;
  projectId: string | Types.ObjectId;
  cooldownHours?: number;
}): Promise<boolean> => {
  try {
    const userStr = String(userId || "").trim();
    const projStr = String(projectId || "").trim();

    if (!Types.ObjectId.isValid(userStr) || !Types.ObjectId.isValid(projStr)) {
      return false;
    }

    const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const existing = await HighTimeSpentNotification.findOne({
      userId: new Types.ObjectId(userStr),
      projectId: new Types.ObjectId(projStr),
      sentAt: { $gte: cutoff },
    })
      .select("_id")
      .lean();

    return !existing;
  } catch (error) {
    console.error("Error checking high time spent cooldown:", error);
    return true;
  }
};

export const recordHighTimeSpentNotification = async ({
  ownerId,
  userId,
  projectId,
  propertyType,
}: {
  ownerId?: string | Types.ObjectId | null | undefined;
  userId: string | Types.ObjectId;
  projectId: string | Types.ObjectId;
  propertyType?: string | null | undefined;
}) => {
  try {
    const userStr = String(userId || "").trim();
    const projStr = String(projectId || "").trim();
    const ownerStr = String(ownerId || "").trim();

    await HighTimeSpentNotification.create({
      ownerId: ownerStr && Types.ObjectId.isValid(ownerStr) ? new Types.ObjectId(ownerStr) : null,
      userId: new Types.ObjectId(userStr),
      projectId: new Types.ObjectId(projStr),
      propertyType: propertyType || null,
      sentAt: new Date(),
    });
  } catch (error) {
    console.error("Failed to record high time spent notification:", error);
  }
};

export const createPlatformNotification = async ({
  type,
  title,
  body,
  actorUserId,
  ownerId,
  projectId,
  propertyType,
  metadata = {},
}: NotifyInput) => {
  const adminUsers = await getAdminUsers();
  const adminUserIds = adminUsers.map((user) => user._id);
  const now = new Date();

  await User.db.collection("platformnotifications").insertOne({
    audience: "admin",
    type,
    title,
    body,
    actorUserId: actorUserId && Types.ObjectId.isValid(actorUserId)
      ? new Types.ObjectId(actorUserId)
      : null,
    ownerId: ownerId && Types.ObjectId.isValid(String(ownerId))
      ? new Types.ObjectId(String(ownerId))
      : null,
    projectId: projectId && Types.ObjectId.isValid(String(projectId))
      ? new Types.ObjectId(String(projectId))
      : null,
    propertyType: propertyType || null,
    recipientUserIds: adminUserIds,
    metadata,
    createdAt: now,
    updatedAt: now,
  });

  if (adminUserIds.length) {
    const adminTokens = await getActiveDeviceTokensForUsers(adminUserIds);
    await sendToTokens(
      adminTokens,
      title,
      body,
      { type, audience: "admin", projectId: projectId ? String(projectId) : "" },
    );
  }
};

export const notifyOwnerAndAdmins = async ({
  type,
  title,
  body,
  actorUserId,
  ownerId,
  projectId,
  propertyType,
  metadata,
}: NotifyInput) => {
  try {
    if (type === "high_time_spent" && actorUserId && projectId) {
      const allowed = await shouldSendHighTimeSpentPush({
        userId: actorUserId,
        projectId,
      });

      if (!allowed) {
        console.log(
          `[Cooldown] High time spent push suppressed for user ${actorUserId} and project ${projectId} (cooldown: ${HIGH_TIME_SPENT_COOLDOWN_HOURS}h)`,
        );
        return;
      }

      await recordHighTimeSpentNotification({
        ownerId,
        userId: actorUserId,
        projectId,
        propertyType,
      });
    }

    const ownerTokens =
      ownerId && Types.ObjectId.isValid(String(ownerId))
        ? await getActiveDeviceTokensForUsers([ownerId])
        : [];
    const ownerAudience = await getOwnerAudience(ownerId);
    const projectNotificationData = getProjectNotificationData(metadata);
    const shouldLogDelivery = DEBUG_DELIVERY_TYPES.has(type);

    if (shouldLogDelivery) {
      console.log("Property notification delivery check:", {
        type,
        ownerId: ownerId ? String(ownerId) : "",
        ownerAudience,
        ownerTokenCount: ownerTokens.length,
        projectId: projectId ? String(projectId) : "",
      });
    }

    const [ownerPushResult] = await Promise.all([
      ownerTokens.length
        ? sendToTokens(ownerTokens, title, body, {
            type,
            audience: ownerAudience,
            projectId: projectId ? String(projectId) : "",
            ...projectNotificationData,
          })
        : Promise.resolve(),
      createPlatformNotification({
        type,
        title,
        body,
        actorUserId,
        ownerId,
        projectId,
        propertyType,
        metadata,
      }),
    ]);

    if (shouldLogDelivery) {
      console.log("Property notification owner push result:", ownerPushResult || {
        successCount: 0,
        failureCount: 0,
        failedTokens: [],
      });
    }
  } catch (error) {
    console.error("Notification delivery failed:", error);
  }
};

export const notifyProjectBrochureDownload = async ({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) => {
  const [project, user] = await Promise.all([
    FeaturedProject.findById(projectId)
      .select("title projectName createdBy slug promotion.type")
      .lean(),
    User.findById(userId).select("name phone email").lean(),
  ]);

  if (!project) return;

  const projectTitle =
    project.title || (project as any).projectName || "your project";
  const userName = user?.name || "A user";

  if (!project.createdBy) return;

  await notifyOwnerAndAdmins({
    type: "brochure_downloaded",
    title: "Brochure Downloaded",
    body: `${userName} downloaded the brochure for ${projectTitle}.`,
    actorUserId: userId,
    ownerId: project.createdBy,
    projectId,
    propertyType: "featuredprojects",
    metadata: {
      projectTitle,
      projectSlug: (project as any).slug || "",
      promotionType: (project as any).promotion?.type || "",
      userName,
      userPhone: user?.phone || "",
      userEmail: user?.email || "",
    },
  });
};
