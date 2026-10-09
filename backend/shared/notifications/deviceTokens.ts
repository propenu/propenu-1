import mongoose, { Schema, Document, Types } from "mongoose";

export type DevicePlatform = "android" | "ios" | "web" | "unknown";

export interface IDeviceToken extends Document {
  userId: Types.ObjectId;
  token: string;
  platform: DevicePlatform;
  deviceId?: string | null;
  lastSeenAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ActiveDeviceTokenRow = {
  userId: Types.ObjectId;
  token: string;
  platform: DevicePlatform;
};

const DEFAULT_DEVICE_TOKEN_ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const getDeviceTokenActiveSince = () => {
  const configuredMs = Number(process.env.DEVICE_TOKEN_ACTIVE_WINDOW_MS);
  const activeWindowMs =
    Number.isFinite(configuredMs) && configuredMs > 0
      ? configuredMs
      : DEFAULT_DEVICE_TOKEN_ACTIVE_WINDOW_MS;

  return new Date(Date.now() - activeWindowMs);
};

const getActiveDeviceTokenQuery = () => {
  const activeSince = getDeviceTokenActiveSince();

  return {
    token: { $nin: [null, ""] },
    ...(activeSince ? { lastSeenAt: { $gte: activeSince } } : {}),
  };
};

export const DeviceTokenSchema = new Schema<IDeviceToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    platform: {
      type: String,
      enum: ["android", "ios", "web", "unknown"],
      default: "unknown",
    },
    deviceId: {
      type: String,
      default: null,
      trim: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "devicetokens",
  },
);

DeviceTokenSchema.index({ userId: 1, isActive: 1 });
DeviceTokenSchema.index({ userId: 1, isActive: 1, lastSeenAt: 1 });
DeviceTokenSchema.index({ userId: 1, lastSeenAt: 1 });
DeviceTokenSchema.index({ userId: 1, deviceId: 1 });

export const DeviceToken =
  (mongoose.models.DeviceToken as mongoose.Model<IDeviceToken>) ||
  mongoose.model<IDeviceToken>("DeviceToken", DeviceTokenSchema, "devicetokens");

export const normalizeDevicePlatform = (value?: unknown): DevicePlatform => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "android" || normalized === "ios" || normalized === "web") {
    return normalized;
  }
  return "unknown";
};

const toObjectIds = (userIds: Array<string | Types.ObjectId>) =>
  Array.from(new Set(userIds.map((id) => String(id || "").trim()).filter(Boolean)))
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

export const getActiveDeviceTokensForUsers = async (
  userIds: Array<string | Types.ObjectId>,
): Promise<string[]> => {
  const objectIds = toObjectIds(userIds);
  if (!objectIds.length) return [];

  const db = mongoose.connection.db;
  if (!db) return [];

  const activeDeviceTokenQuery = getActiveDeviceTokenQuery();
  const deviceRows = await db
    .collection("devicetokens")
    .find({
      userId: { $in: objectIds },
      ...activeDeviceTokenQuery,
    })
    .project({ token: 1 })
    .toArray();

  return Array.from(
    new Set(deviceRows.map((row) => String(row.token || "")).filter(Boolean)),
  );
};

export const getActiveDeviceTokenRowsForUsers = async (
  userIds: Array<string | Types.ObjectId>,
): Promise<ActiveDeviceTokenRow[]> => {
  const objectIds = toObjectIds(userIds);
  if (!objectIds.length) return [];

  const db = mongoose.connection.db;
  if (!db) return [];

  const activeDeviceTokenQuery = getActiveDeviceTokenQuery();
  const deviceRows = await db
    .collection("devicetokens")
    .find({
      userId: { $in: objectIds },
      ...activeDeviceTokenQuery,
    })
    .project({ userId: 1, token: 1, platform: 1 })
    .toArray();

  const seenTokens = new Set<string>();
  return deviceRows.flatMap((row) => {
    const token = String(row.token || "").trim();
    if (!token || seenTokens.has(token)) return [];

    seenTokens.add(token);
    return [
      {
        userId: row.userId as Types.ObjectId,
        token,
        platform: normalizeDevicePlatform(row.platform),
      },
    ];
  });
};

export const getActiveDeviceTokenRowsByTokens = async (
  tokens: string[],
): Promise<ActiveDeviceTokenRow[]> => {
  const validTokens = Array.from(
    new Set(tokens.map((token) => String(token || "").trim()).filter(Boolean)),
  );
  if (!validTokens.length) return [];

  const db = mongoose.connection.db;
  if (!db) {
    return validTokens.map((token) => ({
      userId: new Types.ObjectId(),
      token,
      platform: "unknown",
    }));
  }

  const activeDeviceTokenQuery = getActiveDeviceTokenQuery();
  const deviceRows = await db
    .collection("devicetokens")
    .find({
      token: { $in: validTokens },
      ...(activeDeviceTokenQuery.lastSeenAt
        ? { lastSeenAt: activeDeviceTokenQuery.lastSeenAt }
        : {}),
    })
    .project({ userId: 1, token: 1, platform: 1 })
    .toArray();

  const foundTokens = new Set<string>();
  const rows = deviceRows.flatMap((row) => {
    const token = String(row.token || "").trim();
    if (!token || foundTokens.has(token)) return [];

    foundTokens.add(token);
    return [
      {
        userId: row.userId as Types.ObjectId,
        token,
        platform: normalizeDevicePlatform(row.platform),
      },
    ];
  });

  validTokens.forEach((token) => {
    if (!foundTokens.has(token)) {
      rows.push({
        userId: new Types.ObjectId(),
        token,
        platform: "unknown",
      });
    }
  });

  return rows;
};

export const upsertDeviceToken = async ({
  userId,
  token,
  platform,
  deviceId,
}: {
  userId: string | Types.ObjectId;
  token: string;
  platform?: unknown;
  deviceId?: unknown;
}) => {
  if (!Types.ObjectId.isValid(String(userId))) {
    throw new Error("Invalid userId");
  }

  const trimmedToken = String(token || "").trim();
  if (!trimmedToken) {
    throw new Error("Token is required");
  }

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database is not connected");
  }

  const userObjectId = new Types.ObjectId(String(userId));
  const normalizedPlatform = normalizeDevicePlatform(platform);
  const normalizedDeviceId = String(deviceId || "").trim() || null;
  const now = new Date();
  const collection = db.collection("devicetokens");

  await collection.updateOne(
    { token: trimmedToken },
    {
      $set: {
        userId: userObjectId,
        token: trimmedToken,
        platform: normalizedPlatform,
        deviceId: normalizedDeviceId,
        isActive: true,
        lastSeenAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );

  return {
    userId: String(userObjectId),
    token: trimmedToken,
    platform: normalizedPlatform,
    deviceId: normalizedDeviceId,
  };
};

export const deactivateDeviceTokens = async (tokens: string[]) => {
  const validTokens = Array.from(new Set(tokens.map((t) => String(t || "").trim()).filter(Boolean)));
  if (!validTokens.length) return;

  const db = mongoose.connection.db;
  if (!db) return;

  await db.collection("devicetokens").updateMany(
    { token: { $in: validTokens } },
    {
      $set: {
        isActive: false,
        lastSeenAt: new Date(0),
        updatedAt: new Date(),
      },
    },
  );
};
