import { EventEmitter } from "events";
import { Types } from "mongoose";
import {
  DELETED_ACCESS_AREAS,
  DeletedAccessArea,
  DeletedAccessGrant,
  DeletedAccessLog,
} from "../models/deletedAccessModel";
import User from "../models/userModel";
import Role from "../models/roleModel";
import { AuthRequest } from "../middlewares/authMiddleware";

const CACHE_MS = 15_000;
const HISTORY_PAGE_SIZE = 20;
const MAX_CHAIN_DEPTH = 12;
const HEAD_ROLES = new Set(["admin", "ceo"]);

export type DeletedAccessChange = {
  kind: "grant" | "request";
  area: DeletedAccessArea;
  scope: "heads" | "team";
  headId: string | null;
  enabled: boolean;
  at: string;
  actor?: { userId?: string | undefined; name: string; email: string; roleName: string };
};

export function emitAccessRequestChange(area: DeletedAccessArea, scope: "heads" | "team") {
  accessBus.emit("change", {
    kind: "request",
    area,
    scope,
    headId: null,
    enabled: false,
    at: new Date().toISOString(),
  } satisfies DeletedAccessChange);
}

const accessBus = new EventEmitter();
accessBus.setMaxListeners(0);

export function subscribeDeletedAccessChanges(listener: (change: DeletedAccessChange) => void) {
  accessBus.on("change", listener);
  return () => {
    accessBus.off("change", listener);
  };
}

type Actor = {
  userId?: string | undefined;
  name?: string;
  email?: string;
  roleName?: string;
};

type GrantSnapshot = {
  heads: Record<DeletedAccessArea, boolean>;
  team: Record<DeletedAccessArea, Set<string>>;
  at: number;
};

export type AreaAccess = {
  view: boolean;
  headsEnabled: boolean;
  teamEnabled: boolean;
  canManageHeads: boolean;
  canManageTeam: boolean;
};

export type DeletedAccess = {
  level: "super_admin" | "head" | "staff";
  canPurge: boolean;
} & Record<DeletedAccessArea, AreaAccess>;

const byArea = <T>(make: (key: DeletedAccessArea) => T) =>
  Object.fromEntries(DELETED_ACCESS_AREAS.map((key) => [key, make(key)])) as Record<
    DeletedAccessArea,
    T
  >;

export const normalizeRole = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const isHeadRole = (role: string) =>
  HEAD_ROLES.has(role) || role.endsWith("_head");

export const isDeletedAccessArea = (value: unknown): value is DeletedAccessArea =>
  DELETED_ACCESS_AREAS.includes(value as DeletedAccessArea);

let snapshot: GrantSnapshot | null = null;
const chainCache = new Map<string, { heads: string[]; at: number }>();

async function loadGrants(): Promise<GrantSnapshot> {
  if (snapshot && Date.now() - snapshot.at < CACHE_MS) return snapshot;
  const rows = await DeletedAccessGrant.find({ enabled: true })
    .select("area scope headId")
    .lean();
  const next: GrantSnapshot = {
    heads: byArea(() => false),
    team: byArea(() => new Set<string>()),
    at: Date.now(),
  };
  for (const row of rows as any[]) {
    if (!isDeletedAccessArea(row.area)) continue;
    if (row.scope === "heads") next.heads[row.area as DeletedAccessArea] = true;
    else if (row.scope === "team" && row.headId) {
      next.team[row.area as DeletedAccessArea].add(String(row.headId));
    }
  }
  snapshot = next;
  return next;
}

/** Head-role managers above this user, nearest first. */
export async function headAncestorsOf(userId: string): Promise<string[]> {
  const hit = chainCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.heads;

  const heads: string[] = [];
  const seen = new Set<string>([userId]);
  let current = await User.findById(userId).select("managerId").lean();
  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth += 1) {
    const managerId = (current as any)?.managerId
      ? String((current as any).managerId)
      : "";
    if (!managerId || seen.has(managerId) || !Types.ObjectId.isValid(managerId)) break;
    seen.add(managerId);
    const manager = await User.findById(managerId).select("managerId roleId").lean();
    if (!manager) break;
    const roleId = (manager as any).roleId;
    if (roleId) {
      const role = await Role.findById(roleId).select("name").lean();
      if (isHeadRole(normalizeRole((role as any)?.name))) heads.push(managerId);
    }
    current = manager;
  }

  chainCache.set(userId, { heads, at: Date.now() });
  return heads;
}

const emptyArea = (): AreaAccess => ({
  view: false,
  headsEnabled: false,
  teamEnabled: false,
  canManageHeads: false,
  canManageTeam: false,
});

export async function resolveDeletedAccess(req: AuthRequest): Promise<DeletedAccess> {
  const role = normalizeRole(req.user?.roleName);
  const userId = String(req.user?.id || "");
  const grants = await loadGrants();

  if (role === "super_admin") {
    return {
      level: "super_admin",
      canPurge: true,
      ...byArea((key) => ({
        view: true,
        headsEnabled: grants.heads[key],
        teamEnabled: false,
        canManageHeads: true,
        canManageTeam: false,
      })),
    };
  }

  if (isHeadRole(role)) {
    return {
      level: "head",
      canPurge: false,
      ...byArea((key) => ({
        view: grants.heads[key],
        headsEnabled: grants.heads[key],
        teamEnabled: grants.team[key].has(userId),
        canManageHeads: false,
        canManageTeam: grants.heads[key],
      })),
    };
  }

  const result: DeletedAccess = {
    level: "staff",
    canPurge: false,
    ...byArea(emptyArea),
  };
  const anyOpen = DELETED_ACCESS_AREAS.some(
    (key) => grants.heads[key] && grants.team[key].size > 0,
  );
  if (!anyOpen || !Types.ObjectId.isValid(userId)) return result;

  const heads = await headAncestorsOf(userId);
  for (const key of DELETED_ACCESS_AREAS) {
    result[key].headsEnabled = grants.heads[key];
    result[key].view =
      grants.heads[key] && heads.some((headId) => grants.team[key].has(headId));
  }
  return result;
}

export async function canViewDeletedArea(req: AuthRequest, area: DeletedAccessArea) {
  const access = await resolveDeletedAccess(req);
  return access[area].view;
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

async function writeGrant(
  area: DeletedAccessArea,
  scope: "heads" | "team",
  headId: string | null,
  enabled: boolean,
  actor: Actor,
) {
  const by = toActor(actor);
  await DeletedAccessGrant.findOneAndUpdate(
    { area, scope, headId: headId ? new Types.ObjectId(headId) : null },
    { $set: { enabled, updatedBy: by } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const at = new Date();
  await DeletedAccessLog.create({ area, scope, enabled, actor: by, at });
  snapshot = null;
  accessBus.emit("change", {
    kind: "grant",
    area,
    scope,
    headId,
    enabled,
    at: at.toISOString(),
    actor: by,
  } satisfies DeletedAccessChange);
}

export function setHeadsDeletedAccess(area: DeletedAccessArea, enabled: boolean, actor: Actor) {
  return writeGrant(area, "heads", null, enabled, actor);
}

export function setTeamDeletedAccess(
  area: DeletedAccessArea,
  headId: string,
  enabled: boolean,
  actor: Actor,
) {
  return writeGrant(area, "team", headId, enabled, actor);
}

/** Last change per area, for "changed by" labels in the panel. */
export async function lastDeletedAccessChanges(scope: "heads" | "team", headId?: string) {
  const filter: Record<string, unknown> = { scope };
  if (scope === "team") filter.headId = headId ? new Types.ObjectId(headId) : null;
  const rows = await DeletedAccessGrant.find(filter)
    .select("area updatedBy updatedAt")
    .lean();
  const out: Record<string, { updatedBy: unknown; updatedAt: unknown }> = {};
  for (const row of rows as any[]) {
    out[row.area] = { updatedBy: row.updatedBy || null, updatedAt: row.updatedAt || null };
  }
  return out;
}

export async function listDeletedAccessHistory(
  pageInput: unknown,
  actorUserId?: string,
  areas: DeletedAccessArea[] = [],
) {
  const page = Math.max(1, Math.floor(Number(pageInput) || 1));
  const limit = HISTORY_PAGE_SIZE;
  const filter: Record<string, unknown> = {};
  if (areas.length) filter.area = { $in: areas };
  if (actorUserId) {
    if (!Types.ObjectId.isValid(actorUserId)) {
      return { data: [], pagination: { page, limit, total: 0, pages: 1 } };
    }
    filter["actor.userId"] = new Types.ObjectId(actorUserId);
  }
  const [rows, total] = await Promise.all([
    DeletedAccessLog.find(filter)
      .sort({ at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    DeletedAccessLog.countDocuments(filter),
  ]);
  return {
    data: rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}
