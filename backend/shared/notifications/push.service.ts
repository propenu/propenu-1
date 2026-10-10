import { Types } from "mongoose";
import { notificationTemplates } from "./templates";
import { renderTemplate } from "./templateEngine";
import admin, { isFirebaseMessagingEnabled } from "./firebase";
import {
  ActiveDeviceTokenRow,
  deactivateDeviceTokens,
  getActiveDeviceTokenRowsByTokens,
  getActiveDeviceTokensForUsers,
} from "./deviceTokens";
import { buildNotificationLinkData } from "./deepLinks";

export type BulkNotificationResult = {
  successCount: number;
  failureCount: number;
  failedTokens: string[];
};

type PushData = Record<string, string>;
type PushPlatform = ActiveDeviceTokenRow["platform"];

const FCM_MULTICAST_LIMIT = 500;
let warnedFirebaseDisabled = false;

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const normalizeTokens = (tokens: string[]) =>
  Array.from(new Set(tokens.map((token) => String(token || "").trim()).filter(Boolean)));

const normalizeCollapseKey = (value: string) =>
  value
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 32) || "notification";

const getTtlSeconds = (type?: string) => {
  const normalizedType = String(type || "").trim().toLowerCase();

  if (normalizedType === "search_match") return 24 * 60 * 60;
  if (normalizedType.startsWith("ticket_")) return 7 * 24 * 60 * 60;
  if (
    normalizedType.startsWith("payment_") ||
    normalizedType.startsWith("subscription_") ||
    normalizedType === "plan_upgrade_reminder"
  ) {
    return 30 * 24 * 60 * 60;
  }
  if (
    normalizedType.includes("approved") ||
    normalizedType.includes("rejected") ||
    normalizedType.includes("listing")
  ) {
    return 14 * 24 * 60 * 60;
  }
  if (normalizedType.includes("promotion")) return 7 * 24 * 60 * 60;
  if (normalizedType === "high_time_spent") return 24 * 60 * 60;

  return 7 * 24 * 60 * 60;
};

const getNotificationChannelId = (type?: string) => {
  const normalizedType = String(type || "").trim().toLowerCase();

  if (normalizedType.startsWith("ticket_")) return "tickets";
  if (normalizedType.startsWith("payment_") || normalizedType.startsWith("subscription_")) {
    return "payments";
  }
  if (normalizedType.includes("promotion")) return "promotions";
  if (normalizedType.includes("approved") || normalizedType.includes("rejected")) {
    return "property_updates";
  }
  if (
    normalizedType.includes("lead") ||
    normalizedType.includes("contact") ||
    normalizedType.includes("shortlisted") ||
    normalizedType === "brochure_downloaded" ||
    normalizedType === "high_time_spent"
  ) {
    return "leads";
  }

  return "general";
};

const mergeResult = (
  current: BulkNotificationResult,
  next: BulkNotificationResult,
): BulkNotificationResult => ({
  successCount: current.successCount + next.successCount,
  failureCount: current.failureCount + next.failureCount,
  failedTokens: [...current.failedTokens, ...next.failedTokens],
});

const sendMulticastChunks = async (
  messageFactory: (tokens: string[]) => admin.messaging.MulticastMessage,
  tokens: string[],
) => {
  if (!isFirebaseMessagingEnabled()) {
    if (!warnedFirebaseDisabled) {
      console.warn(
        "Firebase Admin is not initialized. Skipping push notifications until Firebase credentials are configured.",
      );
      warnedFirebaseDisabled = true;
    }

    return {
      successCount: 0,
      failureCount: tokens.length,
      failedTokens: [],
    };
  }

  let result: BulkNotificationResult = {
    successCount: 0,
    failureCount: 0,
    failedTokens: [],
  };

  for (const tokenChunk of chunk(tokens, FCM_MULTICAST_LIMIT)) {
    const response = await admin.messaging().sendEachForMulticast(
      messageFactory(tokenChunk),
    );
    const failedTokens: string[] = [];

    response.responses.forEach((resp, index) => {
      const token = tokenChunk[index];
      if (!resp.success && token) {
        failedTokens.push(token);
        console.error("Push token failed:", token, resp.error?.code, resp.error?.message);
      }
    });

    result = mergeResult(result, {
      successCount: response.successCount,
      failureCount: response.failureCount,
      failedTokens,
    });
  }

  return result;
};

const groupDeviceTokensByPlatform = (devices: ActiveDeviceTokenRow[]) =>
  devices.reduce<Record<PushPlatform, string[]>>(
    (groups, device) => {
      const token = String(device.token || "").trim();
      if (!token) return groups;

      groups[device.platform || "unknown"].push(token);
      return groups;
    },
    {
      android: [],
      ios: [],
      web: [],
      unknown: [],
    },
  );

const createBaseMessage = ({
  tokens,
  title,
  body,
  image,
  data,
}: {
  tokens: string[];
  title: string;
  body: string;
  image?: string | null | undefined;
  data: PushData;
}): admin.messaging.MulticastMessage => ({
  tokens,
  notification: {
    title,
    body,
    ...(image ? { image } : {}),
  },
  data,
});

export const sendPlatformPush = async ({
  devices,
  title,
  body,
  image,
  data = {},
}: {
  devices: ActiveDeviceTokenRow[];
  title: string;
  body: string;
  image?: string | null | undefined;
  data?: PushData | undefined;
}): Promise<BulkNotificationResult> => {
  const normalizedData = buildNotificationLinkData(data);
  const groupedTokens = groupDeviceTokensByPlatform(devices);
  const type = normalizedData.type;
  const ttlSeconds = getTtlSeconds(type);
  const ttlMs = ttlSeconds * 1000;
  const collapseKey = normalizeCollapseKey(type || normalizedData.category || "notification");
  const channelId = getNotificationChannelId(type);
  const webLink = normalizedData.webUrl || normalizedData.url || "https://propenu.com";
  let result: BulkNotificationResult = {
    successCount: 0,
    failureCount: 0,
    failedTokens: [],
  };

  if (groupedTokens.web.length) {
    const webResult = await sendMulticastChunks(
      (tokens) => ({
        ...createBaseMessage({ tokens, title, body, image, data: normalizedData }),
        webpush: {
          headers: {
            TTL: String(ttlSeconds),
            Topic: collapseKey,
          },
          fcmOptions: {
            link: webLink,
          },
          notification: {
            title,
            body,
            ...(image ? { image } : {}),
            icon: "/icons/icon-192x192.png",
          },
        },
      }),
      groupedTokens.web,
    );
    result = mergeResult(result, webResult);
  }

  if (groupedTokens.android.length) {
    const androidResult = await sendMulticastChunks(
      (tokens) => ({
        ...createBaseMessage({ tokens, title, body, image, data: normalizedData }),
        android: {
          priority: "high",
          ttl: ttlMs,
          collapseKey,
          notification: {
            sound: "default",
            channelId,
            clickAction: "OPEN_DEEP_LINK",
            ...(image ? { imageUrl: image } : {}),
          },
        },
      }),
      groupedTokens.android,
    );
    result = mergeResult(result, androidResult);
  }

  if (groupedTokens.ios.length) {
    const expiration = Math.floor(Date.now() / 1000) + ttlSeconds;
    const iosResult = await sendMulticastChunks(
      (tokens) => ({
        ...createBaseMessage({ tokens, title, body, image, data: normalizedData }),
        apns: {
          headers: {
            "apns-priority": "10",
            "apns-expiration": String(expiration),
            "apns-collapse-id": collapseKey,
          },
          payload: {
            aps: {
              sound: "default",
              category: "OPEN_DEEP_LINK",
              ...(image ? { "mutable-content": 1 } : {}),
            },
          },
          ...(image ? { fcmOptions: { imageUrl: image } } : {}),
        },
      }),
      groupedTokens.ios,
    );
    result = mergeResult(result, iosResult);
  }

  if (groupedTokens.unknown.length) {
    const unknownResult = await sendMulticastChunks(
      (tokens) => ({
        ...createBaseMessage({ tokens, title, body, image, data: normalizedData }),
        android: {
          priority: "high",
          ttl: ttlMs,
          collapseKey,
          notification: {
            sound: "default",
            channelId,
            clickAction: "OPEN_DEEP_LINK",
            ...(image ? { imageUrl: image } : {}),
          },
        },
        apns: {
          headers: {
            "apns-priority": "10",
            "apns-expiration": String(Math.floor(Date.now() / 1000) + ttlSeconds),
            "apns-collapse-id": collapseKey,
          },
          payload: {
            aps: {
              sound: "default",
              category: "OPEN_DEEP_LINK",
              ...(image ? { "mutable-content": 1 } : {}),
            },
          },
          ...(image ? { fcmOptions: { imageUrl: image } } : {}),
        },
        webpush: {
          headers: {
            TTL: String(ttlSeconds),
            Topic: collapseKey,
          },
          fcmOptions: {
            link: webLink,
          },
        },
      }),
      groupedTokens.unknown,
    );
    result = mergeResult(result, unknownResult);
  }

  if (result.failedTokens.length) {
    void deactivateDeviceTokens(result.failedTokens).catch((err) =>
      console.warn("Failed to deactivate invalid device tokens:", err),
    );
  }

  console.log("Push delivery:", {
    type: type || "unknown",
    successCount: result.successCount,
    failureCount: result.failureCount,
    platforms: {
      web: groupedTokens.web.length,
      android: groupedTokens.android.length,
      ios: groupedTokens.ios.length,
      unknown: groupedTokens.unknown.length,
    },
  });

  return result;
};

export const sendTemplateNotification = async ({
  token,
  tokens,
  userId,
  userIds,
  templateKey,
  data = {},
}: {
  token?: string | null | undefined;
  tokens?: string[] | null | undefined;
  userId?: string | Types.ObjectId | null | undefined;
  userIds?: Array<string | Types.ObjectId> | null | undefined;
  templateKey: string;
  data: Record<string, string>;
}): Promise<BulkNotificationResult> => {
  const template = notificationTemplates[templateKey];

  if (!template) {
    throw new Error(`Template not found: ${templateKey}`);
  }

  const title = renderTemplate(template.title, data);
  const body = renderTemplate(template.body, data);

  const targetTokens = new Set<string>();
  if (token) targetTokens.add(String(token).trim());
  if (Array.isArray(tokens)) {
    tokens.forEach((t) => t && targetTokens.add(String(t).trim()));
  }

  const targetUserIds: Array<string | Types.ObjectId> = [];
  if (userId) targetUserIds.push(userId);
  if (Array.isArray(userIds)) targetUserIds.push(...userIds);

  if (targetUserIds.length) {
    const userTokens = await getActiveDeviceTokensForUsers(targetUserIds);
    userTokens.forEach((t) => t && targetTokens.add(String(t).trim()));
  }

  const finalTokens = Array.from(targetTokens).filter(Boolean);
  if (!finalTokens.length) {
    console.warn(`⚠️ No active device tokens found for template ${templateKey}`);
    return { successCount: 0, failureCount: 0, failedTokens: [] };
  }

  return sendBulkPush({
    tokens: finalTokens,
    title,
    body,
    data: buildNotificationLinkData({
      templateKey,
      ...data,
    }),
  });
};

export const sendBulkNotification = async ({
  tokens,
  title,
  body,
  data = {},
}: {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<BulkNotificationResult> => {
  const cleanTokens = normalizeTokens(tokens);
  if (!cleanTokens.length) {
    return { successCount: 0, failureCount: 0, failedTokens: [] };
  }

  return sendPlatformPush({
    devices: await getActiveDeviceTokenRowsByTokens(cleanTokens),
    title,
    body,
    data,
  });

};

export const sendBulkPush = async ({
  tokens,
  title,
  body,
  image,
  data = {},
}: {
  tokens: string[];
  title: string;
  body: string;
  image?: string | null | undefined;
  data?: Record<string, string> | undefined;
}): Promise<BulkNotificationResult> => {
  try {
    const cleanTokens = normalizeTokens(tokens);
    if (!cleanTokens.length) {
      console.warn("⚠️ No tokens provided");
      return { successCount: 0, failureCount: 0, failedTokens: [] };
    }

    return sendPlatformPush({
      devices: await getActiveDeviceTokenRowsByTokens(cleanTokens),
      title,
      body,
      image,
      data,
    });
  } catch (error) {
    console.error("❌ FCM Bulk Error:", error);
    throw error;
  }
};
