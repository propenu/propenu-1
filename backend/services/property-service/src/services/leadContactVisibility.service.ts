import { Types } from "mongoose";
import {
  LeadContactVisibility,
  LeadContactVisibilityLog,
} from "../models/leadContactVisibilityModel";

const SETTING_KEY = "admin_leads_contacts";
const CACHE_MS = 15_000;
const HISTORY_PAGE_SIZE = 20;

type Actor = {
  userId?: string | undefined;
  name?: string;
  email?: string;
  roleName?: string;
};

let cached: { enabled: boolean; at: number } | null = null;

export async function getLeadContactVisibility() {
  const doc = await LeadContactVisibility.findOne({ key: SETTING_KEY }).lean();
  return {
    enabled: Boolean((doc as any)?.enabled),
    updatedBy: (doc as any)?.updatedBy || null,
    updatedAt: (doc as any)?.updatedAt || null,
  };
}

export async function isLeadContactVisibleToStaff() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.enabled;
  const { enabled } = await getLeadContactVisibility();
  cached = { enabled, at: Date.now() };
  return enabled;
}

const toActor = (actor: Actor) => ({
  userId:
    actor.userId && Types.ObjectId.isValid(String(actor.userId))
      ? actor.userId
      : undefined,
  name: String(actor.name || ""),
  email: String(actor.email || ""),
  roleName: String(actor.roleName || ""),
});

export async function setLeadContactVisibility(enabled: boolean, actor: Actor) {
  const at = new Date();
  const by = toActor(actor);
  const doc = await LeadContactVisibility.findOneAndUpdate(
    { key: SETTING_KEY },
    { $set: { enabled, updatedBy: by } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  await LeadContactVisibilityLog.create({ enabled, actor: by, at });
  cached = { enabled, at: Date.now() };
  return {
    enabled: Boolean((doc as any)?.enabled),
    updatedBy: (doc as any)?.updatedBy || by,
    updatedAt: (doc as any)?.updatedAt || at,
  };
}

export async function listLeadContactVisibilityHistory(pageInput: unknown) {
  const page = Math.max(1, Math.floor(Number(pageInput) || 1));
  const limit = HISTORY_PAGE_SIZE;
  const [rows, total] = await Promise.all([
    LeadContactVisibilityLog.find({})
      .sort({ at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LeadContactVisibilityLog.countDocuments({}),
  ]);
  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
