import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import User from "../../../user-service/src/models/userModel";
import Role from "../../../user-service/src/models/roleModel";
import { AuthRequest } from "./authMiddleware";

/** Grants live in property-service's "deletedAccessGrant" collection (Super Admin → heads → team). */
const GRANT_COLLECTION = "deletedaccessgrants";
const CACHE_MS = 15_000;
const MAX_CHAIN_DEPTH = 12;
const HEAD_ROLES = new Set(["admin", "ceo"]);

export const PLAN_HISTORY_AREAS = {
  editedSubscriptions: ["created", "updated"],
  deletedSubscriptions: ["deleted"],
} as const;

type PlanHistoryArea = keyof typeof PLAN_HISTORY_AREAS;
const AREAS = Object.keys(PLAN_HISTORY_AREAS) as PlanHistoryArea[];

export type PlanHistoryRequest = AuthRequest & { planHistoryActions?: string[] };

const normalizeRole = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const isHeadRole = (role: string) => HEAD_ROLES.has(role) || role.endsWith("_head");

type Grants = { heads: Set<PlanHistoryArea>; team: Map<PlanHistoryArea, Set<string>>; at: number };
let grantCache: Grants | null = null;
const chainCache = new Map<string, { heads: string[]; at: number }>();

async function loadGrants(): Promise<Grants> {
  if (grantCache && Date.now() - grantCache.at < CACHE_MS) return grantCache;
  const rows = await mongoose.connection
    .collection(GRANT_COLLECTION)
    .find({ enabled: true, area: { $in: AREAS } }, { projection: { area: 1, scope: 1, headId: 1 } })
    .toArray();
  const next: Grants = { heads: new Set(), team: new Map(AREAS.map((a) => [a, new Set<string>()])), at: Date.now() };
  for (const row of rows as any[]) {
    const area = row.area as PlanHistoryArea;
    if (row.scope === "heads") next.heads.add(area);
    else if (row.scope === "team" && row.headId) next.team.get(area)?.add(String(row.headId));
  }
  grantCache = next;
  return next;
}

async function headAncestorsOf(userId: string): Promise<string[]> {
  const hit = chainCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.heads;

  const heads: string[] = [];
  const seen = new Set<string>([userId]);
  let current: any = await User.findById(userId).select("managerId").lean();
  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth += 1) {
    const managerId = current?.managerId ? String(current.managerId) : "";
    if (!managerId || seen.has(managerId) || !mongoose.Types.ObjectId.isValid(managerId)) break;
    seen.add(managerId);
    const manager: any = await User.findById(managerId).select("managerId roleId").lean();
    if (!manager) break;
    if (manager.roleId) {
      const role: any = await Role.findById(manager.roleId).select("name").lean();
      if (isHeadRole(normalizeRole(role?.name))) heads.push(managerId);
    }
    current = manager;
  }
  chainCache.set(userId, { heads, at: Date.now() });
  return heads;
}

/** History actions the user may see, following the same enable switches as the Deleted pages. */
export async function allowedPlanHistoryActions(req: AuthRequest): Promise<string[]> {
  const role = normalizeRole(req.user?.roleName);
  const all = AREAS.flatMap((area) => [...PLAN_HISTORY_AREAS[area]]);
  if (role === "super_admin") return all;

  const grants = await loadGrants();
  let areas: PlanHistoryArea[];
  if (isHeadRole(role)) {
    areas = AREAS.filter((area) => grants.heads.has(area));
  } else {
    const userId = String(req.user?.id || "");
    const open = AREAS.filter((area) => grants.heads.has(area) && (grants.team.get(area)?.size || 0) > 0);
    if (!open.length || !mongoose.Types.ObjectId.isValid(userId)) return [];
    const heads = await headAncestorsOf(userId);
    areas = open.filter((area) => heads.some((headId) => grants.team.get(area)?.has(headId)));
  }
  return areas.flatMap((area) => [...PLAN_HISTORY_AREAS[area]]);
}

export async function requirePlanHistoryAccess(req: PlanHistoryRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  try {
    const actions = await allowedPlanHistoryActions(req);
    if (!actions.length) {
      return res.status(403).json({
        success: false,
        code: "HISTORY_ACCESS_REQUIRED",
        message: "Subscription history is not enabled for you. Please ask your head to enable it, or raise a ticket for hierarchy access.",
      });
    }
    req.planHistoryActions = actions;
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not check history access" });
  }
}
