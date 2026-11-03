import mongoose, { Model } from "mongoose";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import s3 from "../config/s3";
import Agent from "../models/agentModel";
import { CreateAgentDTO, UpdateAgentDTO } from "../zod/validation";
import Residential from "../models/residentialModel";
import Commercial from "../models/commercialModel";
import LandPlot from "../models/landModel";
import Agricultural from "../models/agriculturalModel";
import { getFromDate } from "../utils/dateRange";
import { IResidential } from "../types/residentialTypes";
import { ICommercial } from "../types/commercialTypes";
import { ILand } from "../types/landTypes";
import { IAgricultural } from "../types/agriculturalTypes";
import User from "../models/userModel";

dotenv.config({ quiet: true });

type MulterFiles =
  | { avatar?: Express.Multer.File[]; coverImage?: Express.Multer.File[] }
  | undefined;

async function uploadBufferToS3Local(opts: {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  agentId: string;
  folder?: string;
}) {
  const { buffer, originalname, mimetype, agentId, folder = "agents" } = opts;

  const bucket = process.env.AWS_S3_BUCKET!;
  const region = process.env.AWS_REGION!;

  const ext = originalname.includes(".") ? originalname.split(".").pop() : "";
  const uniqueName = `${Date.now()}-${randomUUID()}${ext ? "." + ext : ""}`;

  const safeFolder = folder.replace(/^\/+|\/+$/g, "");
  const key = `${safeFolder}/${agentId}/${uniqueName}`;

  await s3
    .upload({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    })
    .promise();

  return {
    key,
    url: `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(
      key,
    )}`,
  };
}

async function deleteS3ObjectIfExists(key?: string) {
  if (!key) return;

  const bucket = process.env.AWS_S3_BUCKET!;
  try {
    await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
  } catch (e) {
    console.error("S3 delete failed:", key, e);
  }
}

const AgentService = {
  async createAgent(payload: CreateAgentDTO, files?: MulterFiles) {
    // one agent per user
    const exists = await Agent.findOne({ user: payload.user });
    if (exists) {
      return {
  success: false,
  status: 400,
  message: "Agent already exists for this user",
};
    };

    // slug creation
    const slugBase = payload.slug || payload.name;
    let slug = slugBase
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const slugExists = await Agent.findOne({ slug });
    if (slugExists) slug = `${slug}-${Date.now()}`;

    // preliminary ID for S3 folder
    const preliminary = new Agent({ ...payload, slug });
    const agentId = preliminary._id.toString();

    const toCreate: any = { ...payload, slug };

    // AVATAR upload
    const avatarFile = files?.avatar?.[0];
    if (avatarFile) {
      const up = await uploadBufferToS3Local({
        buffer: avatarFile.buffer,
        originalname: avatarFile.originalname,
        mimetype: avatarFile.mimetype,
        agentId,
        folder: "agents/avatar",
      });
      toCreate.avatar = { url: up.url, key: up.key };
    }

    // COVER IMAGE upload
    const coverFile = files?.coverImage?.[0];
    if (coverFile) {
      const up = await uploadBufferToS3Local({
        buffer: coverFile.buffer,
        originalname: coverFile.originalname,
        mimetype: coverFile.mimetype,
        agentId,
        folder: "agents/cover",
      });
      toCreate.coverImage = { url: up.url, key: up.key };
    }

    const created = await Agent.create(toCreate);
    return created.toObject();
  },

  async getAgentBySlugWithProperties(slug: string) {
  try {
    // ✅ Validate slug
    if (!slug || typeof slug !== "string") {
      return null;
    }

    const cleanSlug = slug.trim();

    // ✅ Find agent (safe match)
    const agent = await Agent.findOne({
      slug: new RegExp(`^${cleanSlug}$`, "i"),
    })
      .populate("user", "name email phone")
      .lean();

    // ✅ If not found → return null (NO THROW)
    if (!agent) {
      return null;
    }

    // ✅ Safe userId extraction
    const userId =
      typeof agent.user === "string"
        ? agent.user
        : agent.user?._id?.toString();

    if (!userId) {
      console.error("❌ userId missing in agent");
      return null;
    }

    // ✅ Safe property fetch (NO CRASH)
    let residential: any[] = [];
    let commercial: any[] = [];
    let land: any[] = [];
    let agricultural: any[] = [];

    try {
      [residential, commercial, land, agricultural] = await Promise.all([
        Residential.find({ createdBy: userId, status: "active" }).lean(),
        Commercial.find({ createdBy: userId, status: "active" }).lean(),
        LandPlot.find({ createdBy: userId, status: "active" }).lean(),
        Agricultural.find({ createdBy: userId, status: "active" }).lean(),
      ]);
    } catch (err) {
      console.error("❌ Property fetch error:", err);
      // continue without crashing
    }

    // ✅ Return clean response
    return {
      agent,
      properties: {
        residential,
        commercial,
        land,
        agricultural,
        total:
          residential.length +
          commercial.length +
          land.length +
          agricultural.length,
      },
    };
  } catch (error) {
    console.error("❌ Service error:", error);
    return null; // ✅ NEVER crash
  }
},

  async getAgentsByLocationService(
    location: { city?: string; state?: string; locality?: string },
    page = 1,
    limit = 20,
  ) {
    const filter: any = { verificationStatus: "approved" };

    if (location.city) filter.city = location.city.trim().toLowerCase();

    if (location.locality) {
      filter.locality = new RegExp(`^${location.locality}$`, "i");
    }

    if (location.state) filter.state = new RegExp(`^${location.state}$`, "i");

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Agent.find(filter)
        .select(
          "name slug avatar coverImage agencyName bio areasServed locality stats dealsClosed city state rera experienceYears",
        )
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),

      Agent.countDocuments(filter),
    ]);

    return {
      total,
      page,
      limit,
      items,
    };
  },

  async editAgent(id: string, payload: UpdateAgentDTO, files?: MulterFiles) {

    if (!mongoose.Types.ObjectId.isValid(id)) {
  return {
    success: false,
    status: 400,
    message: "Invalid id",
  };
}

    const existing = await Agent.findById(id);
    if (!existing) {
      return {
        success: false,
        status: 404,
        message: "Agent not found",
      };
    }

    // update slug
    if (payload.slug && payload.slug !== existing.slug) {
      const newSlug = payload.slug
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-");

      const conflict = await Agent.findOne({ slug: newSlug });
      if (conflict && conflict._id.toString() !== id)
        throw new Error("Slug already used");

      existing.slug = newSlug;
    }

    Object.assign(existing, payload);
    const agentId = existing._id.toString();

    // avatar update
    const avatarFile = files?.avatar?.[0];
    if (avatarFile) {
      await deleteS3ObjectIfExists(existing.avatar?.key);

      const up = await uploadBufferToS3Local({
        buffer: avatarFile.buffer,
        originalname: avatarFile.originalname,
        mimetype: avatarFile.mimetype,
        agentId,
        folder: "agents/avatar",
      });

      existing.avatar = { url: up.url, key: up.key };
    }

    // cover update
    const coverFile = files?.coverImage?.[0];
    if (coverFile) {
      await deleteS3ObjectIfExists(existing.coverImage?.key);

      const up = await uploadBufferToS3Local({
        buffer: coverFile.buffer,
        originalname: coverFile.originalname,
        mimetype: coverFile.mimetype,
        agentId,
        folder: "agents/cover",
      });

      existing.coverImage = { url: up.url, key: up.key };
    }

    await existing.save();
    return existing.toObject();
  },

  async getAgentById(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");

    const agent = await Agent.findById(id).populate("user", "name email");
    if (!agent) {
      return {
        success: false,
        status: 404,
        message: "Agent not found",
      };
    }
    return agent;
  },

  async listAgents({ page, limit, search }: any) {
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (search) {
      const q = new RegExp(search, "i");
      filter.$or = [{ name: q }, { agencyName: q }, { bio: q }];
    }

    const [items, total] = await Promise.all([
      Agent.find(filter).populate("user", "name email").skip(skip).limit(limit),
      Agent.countDocuments(filter),
    ]);

    return { items, meta: { page, limit, total } };
  },

  async deleteAgent(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");

    const existing = await Agent.findById(id).lean();
    if (!existing) {
      return {
        success: false,
        status: 404,
        message: "Agent not found",
      };
    }

    await deleteS3ObjectIfExists(existing.avatar?.key);
    await deleteS3ObjectIfExists(existing.coverImage?.key);

    await Agent.findByIdAndDelete(id);
    return true;
  },

  async getAgentDashboardAnalytics(userId: string, range: string) {
    const agent = await Agent.findOne({ user: userId }).lean();

    if (!agent) {
      return {
        exists: false,
        message: "Agent profile not created",
      };
    }

    const fromDate = getFromDate(range);

    const propertySources: Array<{
      key: "residential" | "commercial" | "plot" | "agricultural";
      model: Model<any>;
    }> = [
      {
        key: "residential",
        model: Residential as Model<IResidential>,
      },
      {
        key: "commercial",
        model: Commercial as Model<ICommercial>,
      },
      {
        key: "plot",
        model: LandPlot as Model<ILand>,
      },
      {
        key: "agricultural",
        model: Agricultural as Model<IAgricultural>,
      },
    ];

    /* ✅ Fetch all properties */
    const propertiesByType = await Promise.all(
      propertySources.map(async ({ key, model }) => ({
        key,
        items: await model
          .find(
            { createdBy: userId, createdAt: { $gte: fromDate } },
            {
              title: 1,
              city: 1,
              gallery: 1,
              meta: 1,
              status: 1,
              createdAt: 1,
            },
          )
          .lean(),
      })),
    );

    const allProperties = propertiesByType.flatMap(({ items }) => items);

    /* ------------------ KPI totals ------------------ */

    let totalViews = 0;
    let totalClicks = 0;
    let totalInquiries = 0;
    let active = 0;
    let pending = 0;

    for (const p of allProperties) {
      totalViews += p.meta?.views || 0;
      totalClicks += p.meta?.clicks || 0;
      totalInquiries += p.meta?.inquiries || 0;

      if (p.status === "active") active++;
      else pending++;
    }

    /* ------------------ City distribution ------------------ */

    const cityMap: Record<string, number> = {};
    allProperties.forEach((p) => {
      if (!p.city) return;
      cityMap[p.city] = (cityMap[p.city] || 0) + 1;
    });

    /* ------------------ Top properties ------------------ */

    const topProperties = [...allProperties]
      .sort((a, b) => (b.meta?.views || 0) - (a.meta?.views || 0))
      .slice(0, 5);

    /* ------------------ Final payload ------------------ */

    const stats = propertiesByType.reduce(
      (acc, { key, items }) => {
        acc[key] = items.length;
        return acc;
      },
      {
        residential: 0,
        commercial: 0,
        plot: 0,
        agricultural: 0,
      },
    );

    return {
      exists: true,
      agent,
      range,
      stats,
      kpis: {
        totalProperties: allProperties.length,
        activeListings: active,
        pendingListings: pending,
        totalViews,
        totalClicks,
        totalInquiries,
        conversionRate:
          totalViews > 0
            ? Number(((totalInquiries / totalViews) * 100).toFixed(2))
            : 0,
      },
      charts: {
        byCity: Object.entries(cityMap).map(([city, count]) => ({
          city,
          count,
        })),
      },
      topProperties,
    };
  },

  async getAgentByUserId(userId: string) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user id");
    }

    const agent = await Agent.findOne({ user: userId })
      .populate("user", "name email phone")
      .lean();

    return agent; // can be null → controller already handles it
  },

  async editAgentByPhone(
    phone: string,
    payload: UpdateAgentDTO,
    files?: MulterFiles,
  ) {
    const normalizedPhone = phone.trim();

    // 1️⃣ Find user
    const user = await User.findOne({ phone: normalizedPhone });
    
    if (!user) {
  return {
    success: false,
    status: 404,
    message: "User not found",
  };
}

    // 2️⃣ Find agent
    const existing = await Agent.findOne({ user: user._id });
    if (!existing) {
      return {
        success: false,
        status: 404,
        message: "Agent not found for this user",
      };
    }

    /* ===============================
     ✅ UPDATE USER FIELDS
  =============================== */
    if (payload.name) {
      user.name = payload.name;
      await user.save();
    }

    /* ===============================
     ✅ UPDATE AGENT FIELDS
  =============================== */
    const {
      name, // ❌ remove from agent payload
      avatar,
      coverImage,
      ...agentPayload
    } = payload;

    // slug logic
    if (agentPayload.slug && agentPayload.slug !== existing.slug) {
      const newSlug = agentPayload.slug
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-");

      const conflict = await Agent.findOne({ slug: newSlug });
      existing.slug = newSlug;
    }

    const reraUpdates: Record<string, any> = {};

    if (agentPayload.rera) {
      Object.assign(reraUpdates, agentPayload.rera);
      delete agentPayload.rera;
    }

    if (agentPayload.reraAgentId !== undefined) {
      reraUpdates.reraAgentId = agentPayload.reraAgentId;
      delete agentPayload.reraAgentId;
    }

    if (Object.keys(reraUpdates).length > 0) {
      const existingRera = existing.rera
        ? (typeof (existing.rera as any).toObject === "function"
            ? (existing.rera as any).toObject()
            : existing.rera)
        : {};

      existing.rera = {
        ...existingRera,
        ...reraUpdates,
      };
    }

    Object.assign(existing, agentPayload);

    const agentId = existing._id.toString();

    /* ===============================
     ✅ AVATAR UPLOAD
  =============================== */
    const avatarFile = files?.avatar?.[0];
    if (avatarFile) {
      await deleteS3ObjectIfExists(existing.avatar?.key);

      const up = await uploadBufferToS3Local({
        buffer: avatarFile.buffer,
        originalname: avatarFile.originalname,
        mimetype: avatarFile.mimetype,
        agentId,
        folder: "agents/avatar",
      });

      existing.avatar = { url: up.url, key: up.key };
    }

    /* ===============================
     ✅ COVER IMAGE UPLOAD
  =============================== */
    const coverFile = files?.coverImage?.[0];
    if (coverFile) {
      await deleteS3ObjectIfExists(existing.coverImage?.key);

      const up = await uploadBufferToS3Local({
        buffer: coverFile.buffer,
        originalname: coverFile.originalname,
        mimetype: coverFile.mimetype,
        agentId,
        folder: "agents/cover",
      });

      existing.coverImage = { url: up.url, key: up.key };
    }

    await existing.save();

    return existing.toObject();
  },
};

export default AgentService;
