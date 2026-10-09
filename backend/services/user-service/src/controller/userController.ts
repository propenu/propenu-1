// userController.ts

import { Request, Response } from "express";
import User, { IUser } from "../models/userModel";
import { sendPlatformPush } from "../../../../shared/notifications/push.service";
import { HydratedDocument } from "mongoose";
import Role from "../models/roleModel";
import { uploadToS3 } from "../utils/s3Upload";
import { verifyAndConsumeOtpWithReason } from "../utils/saveOtpRedis";
import { decodeUnsubscribeToken } from "../utils/unsubscribeToken";
import {
  getActiveDeviceTokenRowsForUsers,
  upsertDeviceToken,
} from "../../../../shared/notifications/deviceTokens";

const isAdminRole = (roleName?: string) =>
  roleName === "admin" || roleName === "super_admin";

const audienceRoleMap: Record<string, string[]> = {
  builder: ["builder"],
  agent: ["agent"],
  owner: ["user"],
  user: ["user"],
  users: ["user"],
  all: [],
};

const normalizeList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map((item) => item.trim()).filter(Boolean);
      }
    } catch {
      // Fall through to comma-separated values.
    }

    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const createRegexFilter = (value?: string) =>
  value ? new RegExp(`^${value.trim()}$`, "i") : undefined;

const getRoleIdsForAudience = async (audience?: string, role?: string) => {
  const normalizedAudience = String(audience || "").trim().toLowerCase();
  const explicitRoles = normalizeList(role);
  const roleNames = explicitRoles.length
    ? explicitRoles
    : audienceRoleMap[normalizedAudience] || [];

  if (!roleNames.length) return [];

  const roles = await Role.find({
    $or: roleNames.map((name) => ({ name: new RegExp(`^${name}$`, "i") })),
  })
    .select("_id")
    .lean();

  return roles.map((roleDoc) => roleDoc._id);
};

export const saveFcmToken = async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    const userId = authUser?.sub || authUser?.id || authUser?._id;
    const { token, platform, deviceId } = req.body;

    console.log({authUser, userId, token, platform, deviceId})

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    const saved = await upsertDeviceToken({
      userId,
      token,
      platform,
      deviceId,
    });

    res.json({
      message: "Token saved",
      platform: saved.platform,
      deviceId: saved.deviceId,
    });
  } catch (error) {
    console.error("Save FCM Token Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// export const sendCustomNotification = async (req: Request, res: Response) => {
//   try {
//     const { title, body, userIds, role, city, state, locality, target } =
//       req.body;

//     if (!title || !body) {
//       return res.status(400).json({ message: "Title & body required" });
//     }

//     const image = (req.file as any)?.location;

//     const query: any = {
//       fcmToken: { $ne: null },
//     };

//     if (userIds?.length) {
//       query._id = { $in: userIds };
//     }

//     if (role) {
//       const roleDoc = await Role.findOne({ name: role });

//       if (!roleDoc) {
//         return res.status(404).json({ message: "Role not found" });
//       }

//       query.roleId = roleDoc._id;
//     }

//     if (city) {
//       query.city = new RegExp(`^${city}$`, "i");
//     }

//     if (state) {
//       query.state = new RegExp(`^${state}$`, "i");
//     }

//     if (locality) {
//       query.locality = new RegExp(`^${locality}$`, "i");
//     }

//     if (target === "all" && !userIds && !role && !city && !state && !locality) {
//       // no extra filters needed
//     }

//     // 🚀 Fetch Users
//     const users: HydratedDocument<IUser>[] = await User.find(query);

//     if (!users.length) {
//       return res.status(404).json({
//         message: "No users found",
//         appliedQuery: query,
//       });
//     }

//     // 🎯 Extract Tokens
//     const tokens = users
//       .map((u) => u.fcmToken)
//       .filter((token): token is string => !!token);

//     if (!tokens.length) {
//       return res.status(404).json({
//         message: "No valid FCM tokens found",
//       });
//     }

//     // 🚀 Send Notification
//     await sendBulkPush({
//       tokens,
//       title,
//       body,
//       image,
//     });

//     res.json({
//       success: true,
//       message: `Notification sent to ${tokens.length} users 🚀`,
//       filters: query,
//     });
//   } catch (error) {
//     console.error("❌ Notification Error:", error);
//     res.status(500).json({
//       message: "Error sending notification",
//     });
//   }
// };

export const sendCustomNotification = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;

    if (!isAdminRole(actor?.roleName)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: only admin/super_admin can send notifications",
      });
    }

    const {
      title,
      body,
      userIds,
      audience,
      role: requestedRole,
      city,
      state,
      locality,
    } = req.body;
    const normalizedAudience = String(audience || "").trim().toLowerCase();
    const role =
      requestedRole ||
      (normalizedAudience && normalizedAudience !== "all"
        ? audienceRoleMap[normalizedAudience]?.[0]
        : undefined);

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "Title & body required",
      });
    }

    let image: string | undefined;

    // ✅ Upload image
    if (req.file) {
      const file = req.file;

      const key = `notifications/${Date.now()}-${file.originalname}`;

      const uploaded = await uploadToS3({
        buffer: file.buffer,
        key,
        mimetype: file.mimetype,
      });

      image = uploaded.url;
    }

    const query: any = {
      isActive: { $ne: false },
    };

    // ✅ UserIds priority
    const requestedUserIds = normalizeList(userIds);
    if (requestedUserIds.length) {
      query._id = { $in: requestedUserIds };
    }

    // ✅ 🔥 FIXED ROLE FILTER (IMPORTANT)
    else if (role) {
      const roleDoc = await Role.findOne({
        name: new RegExp(`^${role}$`, "i"), // ✅ case-insensitive
      });

      if (!roleDoc) {
        return res.status(400).json({
          success: false,
          message: `Role '${role}' not found`,
        });
      }

      query.roleId = roleDoc._id;
    }

    // ✅ Location filters
    if (city) query.city = new RegExp(`^${city}$`, "i");
    if (state) query.state = new RegExp(`^${state}$`, "i");
    if (locality) query.locality = new RegExp(`^${locality}$`, "i");

    console.log("🔍 Final Query:", query);

    // ✅ Fetch users
    const users: HydratedDocument<IUser>[] = await User.find(query);

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "No users found",
        query,
      });
    }

    const recipientUserIds = users.map((u) => u._id);
    const tokenUserMap = await getActiveDeviceTokenRowsForUsers(recipientUserIds);

    if (!tokenUserMap.length) {
      return res.status(404).json({
        success: false,
        message: "No valid tokens",
      });
    }

    // ✅ Send push
    const response = await sendPlatformPush({
      devices: tokenUserMap,
      title,
      body,
      ...(image ? { image } : {}),
      data: {
        type: "admin_campaign",
        audience: String(audience || role || "custom"),
      },
    });


    if (!response) {
  return res.status(500).json({
    success: false,
    message: "Failed to send notifications",
  });
}

    // ✅ 🔥 MAP FAILED USERS
    const failedUsers: any[] = [];
    const successUsers: any[] = [];

    response?.failedTokens?.forEach((failedToken: string) => {
      const user = tokenUserMap.find((t) => t.token === failedToken);
      if (user) failedUsers.push(user.userId);
    });

    tokenUserMap.forEach((t) => {
      if (!response.failedTokens.includes(t.token)) {
        successUsers.push(t.userId);
      }
    });

    const now = new Date();
    const campaign = await User.db.collection("notificationcampaigns").insertOne({
      title,
      body,
      image: image || null,
      audience: audience || null,
      role: role || null,
      filters: {
        userIds: requestedUserIds,
        city: city || null,
        state: state || null,
        locality: locality || null,
      },
      totalUsers: users.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      successUserIds: successUsers,
      failedUserIds: failedUsers,
      createdBy: actor?.sub || actor?.id || null,
      createdAt: now,
      updatedAt: now,
    });

    if (successUsers.length) {
      await User.db.collection("usercampaignnotifications").insertMany(
        successUsers.map((userId) => ({
          userId,
          campaignId: campaign.insertedId,
          type: "admin_campaign",
          title,
          body,
          image: image || null,
          audience: audience || null,
          createdAt: now,
          updatedAt: now,
        })),
        { ordered: false },
      );
    }

    return res.status(200).json({
      success: true,
      message: `Notification sent`,
      totalUsers: users.length,
      successCount: response.successCount,
      failureCount: response.failureCount,

      // 🔥 IMPORTANT OUTPUT
      successUserIds: successUsers,
      failedUserIds: failedUsers,

      image,
      campaignId: campaign.insertedId,
    });
  } catch (error: any) {
    console.error("❌ Notification Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error sending notification",
      error: error.message,
    });
  }
};

export const unsubscribeFromEmail = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const query = req.query || {};

    const rawEmail = (body.email || query.email) as string | undefined;
    const rawPhone = (body.phone || query.phone) as string | undefined;
    const rawToken = (body.token || query.token) as string | undefined;

    let identifier = rawEmail || rawPhone;

    if (rawToken && !identifier) {
      identifier = decodeUnsubscribeToken(rawToken) || undefined;
    }

    // If identifier doesn't have '@' or phone format, it could be a base64url encoded token
    if (
      identifier &&
      !identifier.includes("@") &&
      !/^\+?\d{7,15}$/.test(identifier.trim())
    ) {
      const decoded = decodeUnsubscribeToken(identifier);
      if (decoded) {
        identifier = decoded;
      }
    }

    // If GET request with no identifier, redirect to frontend unsubscribe page
    if (req.method === "GET" && !identifier) {
      const frontendUrl =
        process.env.FRONTEND_URL?.replace(/\/$/, "") || "https://propenu.com";
      return res.redirect(`${frontendUrl}/unsubscribe`);
    }

    if (!identifier) {
      return res.status(400).json({
        message: "Either email or phone is required",
      });
    }

    const trimmed = identifier.trim();
    const isEmail = trimmed.includes("@");

    const updated = await User.findOneAndUpdate(
      isEmail ? { email: trimmed.toLowerCase() } : { phone: trimmed },
      { $set: { isUnsubscribedToEmail: true } },
      { new: true },
    );

    if (req.method === "GET") {
      const frontendUrl =
        process.env.FRONTEND_URL?.replace(/\/$/, "") || "https://propenu.com";
      return res.redirect(
        `${frontendUrl}/unsubscribe?${isEmail ? "email" : "phone"}=${encodeURIComponent(
          trimmed,
        )}&success=true`,
      );
    }

    if (!updated) {
      // Return success anyway to avoid leaking whether email exists
      return res.status(200).json({
        message: "If that account exists, you have been unsubscribed.",
      });
    }

    return res.status(200).json({
      message: "Successfully unsubscribed from email notifications.",
    });
  } catch (error: any) {
    console.error("Unsubscribe from email error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAdminNotifications = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (!isAdminRole(user?.roleName)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: only admin/super_admin can access notifications",
      });
    }

    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const [platformNotifications, campaigns] = await Promise.all([
      User.db
        .collection("platformnotifications")
        .find({ audience: "admin" })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray(),
      User.db
        .collection("notificationcampaigns")
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray(),
    ]);

    const notifications = [...platformNotifications, ...campaigns]
      .sort((a: any, b: any) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, limit);

    const viewer = await User.findById(user.sub || user.id)
      .select("notificationSeenAt.admin")
      .lean();
    const lastSeenAt = (viewer?.notificationSeenAt as any)?.admin ?? null;
    const seenAtMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
    const unread = notifications.filter((item: any) => {
      const createdAtMs = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      return createdAtMs > seenAtMs;
    }).length;

    return res.json({
      success: true,
      data: notifications,
      summary: {
        total: notifications.length,
        unread,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to load admin notifications",
      error: error.message,
    });
  }
};

export const markAdminNotificationsSeen = async (
  req: Request,
  res: Response,
) => {
  try {
    const user = (req as any).user;

    if (!isAdminRole(user?.roleName)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: only admin/super_admin can update notifications",
      });
    }

    await User.findByIdAndUpdate(user.sub || user.id, {
      $set: {
        "notificationSeenAt.admin": new Date(),
      },
    });

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to update admin notifications",
      error: error.message,
    });
  }
};
