import { Response } from "express";
import mongoose from "mongoose";
import User from "../models/userModel";
import Role from "../models/roleModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import {
  PLATFORM_END_USER_ROLE_NAMES,
  canonicalRoleName,
  getDescendantRoleIds,
  resolveVisibleRoleIdsForActor,
} from "../utils/roleHierarchy";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const emptyCounts = () => ({
  periodTotal: 0,
  todayTotal: 0,
  loginToday: 0,
  active: 0,
  locPending: 0,
  kycPending: 0,
  kycRejected: 0,
  onboarding: 0,
  roles: {
    user: 0,
    builder: 0,
    builder_staff: 0,
    agent: 0,
  },
});

const parseIstDay = (value: unknown, endOfDay = false) => {
  if (typeof value !== "string" || !value.trim()) return { date: null as Date | null, invalid: false };
  const raw = value.trim();
  if (ISO_DAY.test(raw)) {
    const date = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+05:30`);
    return { date: Number.isNaN(date.getTime()) ? null : date, invalid: Number.isNaN(date.getTime()) };
  }
  const date = new Date(raw);
  return { date: Number.isNaN(date.getTime()) ? null : date, invalid: Number.isNaN(date.getTime()) };
};

const istTodayBounds = () => {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return {
    start: new Date(`${day}T00:00:00.000+05:30`),
    end: new Date(`${day}T23:59:59.999+05:30`),
  };
};

const nOf = (rows: Array<{ n?: number }> | undefined) => Number(rows?.[0]?.n || 0);

/**
 * Super Admin dashboard user metrics in one aggregation.
 * Never returns user documents — counts only.
 */
export const getDashboardUserCounts = async (req: AuthRequest, res: Response) => {
  try {
    const query = req.query as Record<string, any>;
    const actorRole = String(req.user?.roleName || "");
    const actorRoleKey = actorRole
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");

    const match: Record<string, any> = {};

    if (actorRoleKey !== "super_admin" && actorRoleKey !== "admin") {
      const operator = await User.findById(req.user?.sub).select("roleId").lean();
      const visibleRoleIds = await resolveVisibleRoleIdsForActor({
        actorRoleId: operator?.roleId ?? null,
        actorRoleName: actorRole,
        permissions: req.user?.permissions || [],
      });
      if (visibleRoleIds) {
        if (!visibleRoleIds.length) {
          return res.json({ success: true, data: emptyCounts() });
        }
        match.roleId = { $in: visibleRoleIds };
      }
    }

    const fromRaw = String(query.from || query.startDate || query.createdFrom || "").trim();
    const toRaw = String(query.to || query.endDate || query.createdTo || "").trim();
    const parsedFrom = parseIstDay(fromRaw, false);
    const parsedTo = parseIstDay(toRaw, true);
    if (parsedFrom.invalid || parsedTo.invalid) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range",
        code: "INVALID_DATE_RANGE",
      });
    }

    let from = parsedFrom.date;
    let to = parsedTo.date;
    if (from && to && from > to) {
      const swap = from;
      from = to;
      to = swap;
    }

    const platformRoles = await Role.find({
      name: { $in: [...PLATFORM_END_USER_ROLE_NAMES] },
    })
      .select("_id name")
      .lean();
    const platformIds = platformRoles.map((role) => role._id as mongoose.Types.ObjectId);

    if (match.roleId?.$in) {
      const allowed = new Set((match.roleId.$in as mongoose.Types.ObjectId[]).map(String));
      match.roleId = { $in: platformIds.filter((id) => allowed.has(String(id))) };
    } else {
      match.roleId = { $in: platformIds };
    }

    const today = istTodayBounds();
    const createdAt: Record<string, Date> = {};
    if (from) createdAt.$gte = from;
    if (to) createdAt.$lte = to;
    const hasPeriod = Object.keys(createdAt).length > 0;

    const [facet] = await User.aggregate([
      { $match: match },
      {
        $facet: {
          period: [
            ...(hasPeriod ? [{ $match: { createdAt } }] : []),
            { $count: "n" },
          ],
          today: [
            { $match: { createdAt: { $gte: today.start, $lte: today.end } } },
            { $count: "n" },
          ],
          loginToday: [
            { $match: { lastLoginAt: { $gte: today.start, $lte: today.end } } },
            { $count: "n" },
          ],
          byStatus: [
            ...(hasPeriod ? [{ $match: { createdAt } }] : []),
            { $group: { _id: "$accountStatus", n: { $sum: 1 } } },
          ],
          byRole: [
            ...(hasPeriod ? [{ $match: { createdAt } }] : []),
            { $group: { _id: "$roleId", n: { $sum: 1 } } },
          ],
        },
      },
    ]).option({ maxTimeMS: 12000 });

    const statusCount = (name: string) =>
      Number(
        (facet?.byStatus || []).find(
          (row: { _id?: string; n?: number }) => String(row?._id || "") === name,
        )?.n || 0,
      );

    const roleIdByName = new Map(
      platformRoles.map((role: any) => [String(role.name), String(role._id)]),
    );
    const byRoleCount = new Map(
      (facet?.byRole || []).map((row: { _id?: unknown; n?: number }) => [
        String(row._id),
        Number(row.n || 0),
      ]),
    );
    const roleN = (name: string) => {
      const id = roleIdByName.get(name);
      return id ? Number(byRoleCount.get(id) || 0) : 0;
    };

    const locPending = statusCount("location_pending");
    const kycPending = statusCount("kyc_pending");
    const pending = statusCount("pending");
    const incomplete = statusCount("incomplete");

    return res.json({
      success: true,
      data: {
        periodTotal: nOf(facet?.period),
        todayTotal: nOf(facet?.today),
        loginToday: nOf(facet?.loginToday),
        active: statusCount("active"),
        locPending,
        kycPending,
        kycRejected: statusCount("kyc_rejected"),
        onboarding: locPending + kycPending + pending + incomplete,
        roles: {
          user: roleN("user"),
          builder: roleN("builder"),
          builder_staff: roleN("builder_staff"),
          agent: roleN("agent"),
        },
      },
    });
  } catch (error) {
    console.error("getDashboardUserCounts failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load dashboard user counts",
      code: "DASHBOARD_USER_COUNTS_ERROR",
    });
  }
};

const emptySidebarBucket = () => ({
  total: 0,
  active: 0,
  pending: 0,
  inactive: 0,
  login: 0,
  onboarding: 0,
});

const ONBOARDING_STATUSES = ["location_pending", "kyc_pending", "pending", "incomplete"];

const PLATFORM_CANONICAL_ROLES = new Set<string>(PLATFORM_END_USER_ROLE_NAMES);

type SidebarRaw = { total: number; pending: number; inactive: number; login: number };

const emptySidebarRaw = (): SidebarRaw => ({
  total: 0,
  pending: 0,
  inactive: 0,
  login: 0,
});

const absorbSidebarRaw = (into: SidebarRaw, row: Record<string, any> | undefined) => {
  into.total += Number(row?.total || 0);
  into.pending += Number(row?.pending || 0);
  into.inactive += Number(row?.inactive || 0);
  into.login += Number(row?.login || 0);
};

/**
 * Alias role documents share one canonical name (sales_agent → sales_executive).
 * Once any id of a canonical role is in scope, every alias id is in scope too,
 * so the badge matches the role directory (which lists those aliases together).
 */
const expandAliasRoleIds = (
  roles: Array<{ _id: unknown; name?: string }>,
  seedIds: Set<string> | null,
) => {
  if (!seedIds) return roles.map((role) => role._id);
  const allowed = new Set<string>();
  for (const role of roles) {
    if (!seedIds.has(String(role._id))) continue;
    const canon = canonicalRoleName(role.name);
    if (canon) allowed.add(canon);
  }
  if (!allowed.size) return [];
  return roles
    .filter((role) => allowed.has(canonicalRoleName(role.name)))
    .map((role) => role._id);
};

const isCceRole = (roleName = "") => {
  const key = String(roleName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (
    key === "customer_care" ||
    key === "customer_care_executive" ||
    key === "customer_care_executives" ||
    key.includes("customer_care")
  );
};

const statusBuckets = {
  total: { $sum: 1 },
  inactive: {
    $sum: {
      $cond: [
        {
          $or: [
            { $eq: ["$isActive", false] },
            { $eq: ["$accountStatus", "inactive"] },
          ],
        },
        1,
        0,
      ],
    },
  },
  pending: {
    $sum: {
      $cond: [{ $in: ["$accountStatus", ONBOARDING_STATUSES] }, 1, 0],
    },
  },
};

const withLoginToday = (start: Date, end: Date) => ({
  ...statusBuckets,
  login: {
    $sum: {
      $cond: [
        {
          $and: [
            { $gte: ["$lastLoginAt", start] },
            { $lte: ["$lastLoginAt", end] },
          ],
        },
        1,
        0,
      ],
    },
  },
});

const normalizeBucket = (row: Record<string, any> | undefined) => {
  const pending = Number(row?.pending || 0);
  const inactive = Number(row?.inactive || 0);
  const total = Number(row?.total || 0);
  return {
    total,
    inactive,
    pending,
    onboarding: pending,
    login: Number(row?.login || 0),
    active: Math.max(0, total - pending - inactive),
  };
};

/**
 * Sidebar badges: IST-today counts only. Never returns user documents.
 */
export const getSidebarUserCounts = async (req: AuthRequest, res: Response) => {
  try {
    const actorRole = String(req.user?.roleName || "");
    const actorRoleKey = actorRole
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");
    const today = istTodayBounds();
    const isOrgWide = actorRoleKey === "super_admin" || actorRoleKey === "admin";
    const actorId = req.user?.id || req.user?._id || req.user?.sub;

    const [roles, operator] = await Promise.all([
      Role.find({}).select("_id name").lean(),
      actorId ? User.findById(actorId).select("roleId").lean() : Promise.resolve(null),
    ]);

    let scopeIds: unknown[] = [];
    if (isOrgWide) {
      scopeIds = expandAliasRoleIds(roles, null);
    } else {
      const [visibleRoleIds, descendantRoleIds] = await Promise.all([
        resolveVisibleRoleIdsForActor({
          actorRoleId: operator?.roleId ?? null,
          actorRoleName: actorRole,
          permissions: req.user?.permissions || [],
        }),
        operator?.roleId ? getDescendantRoleIds(operator.roleId) : Promise.resolve([]),
      ]);
      // null visible ids = org-wide. Otherwise marketplace roles the actor may
      // list, plus every sub-role under the role assigned to this user.
      const seed = new Set<string>();
      if (!visibleRoleIds) {
        scopeIds = expandAliasRoleIds(roles, null);
      } else {
        visibleRoleIds.forEach((id) => seed.add(String(id)));
        descendantRoleIds.forEach((id) => seed.add(String(id)));
        scopeIds = expandAliasRoleIds(roles, seed);
      }
    }

    const meId =
      actorId && mongoose.Types.ObjectId.isValid(String(actorId))
        ? new mongoose.Types.ObjectId(String(actorId))
        : null;
    const wantFollowUp = Boolean(meId && isCceRole(actorRole));

    const roleMatch =
      scopeIds.length > 0
        ? {
            createdAt: { $gte: today.start, $lte: today.end },
            roleId: { $in: scopeIds },
          }
        : null;

    const [roleRows, followUpRows] = await Promise.all([
      roleMatch
        ? User.aggregate([
            { $match: roleMatch },
            { $group: { _id: "$roleId", ...withLoginToday(today.start, today.end) } },
          ]).option({ maxTimeMS: 12000 })
        : Promise.resolve([]),
      wantFollowUp
        ? User.aggregate([
            {
              $match: {
                followUpAssignedTo: meId,
                accountStatus: { $in: ONBOARDING_STATUSES },
              },
            },
            {
              $facet: {
                count: [{ $count: "n" }],
                ids: [{ $project: { _id: 1 } }, { $limit: 200 }],
              },
            },
          ]).option({ maxTimeMS: 12000 })
        : Promise.resolve([]),
    ]);

    const roleNameById = new Map(
      roles.map((role: { _id?: unknown; name?: string }) => [
        String(role._id),
        String(role.name || ""),
      ]),
    );
    const byCanonical = new Map<string, SidebarRaw>();
    for (const row of roleRows || []) {
      const canon = canonicalRoleName(roleNameById.get(String(row?._id)) || "");
      if (!canon) continue;
      const current = byCanonical.get(canon) || emptySidebarRaw();
      absorbSidebarRaw(current, row);
      byCanonical.set(canon, current);
    }

    const buckets = {
      owners: normalizeBucket(byCanonical.get("user")),
      builders: normalizeBucket(byCanonical.get("builder")),
      agents: normalizeBucket(byCanonical.get("agent")),
      builderStaff: normalizeBucket(byCanonical.get("builder_staff")),
    };

    const users = emptySidebarBucket();
    for (const key of Object.keys(buckets) as Array<keyof typeof buckets>) {
      const bucket = buckets[key];
      users.total += bucket.total;
      users.active += bucket.active;
      users.pending += bucket.pending;
      users.inactive += bucket.inactive;
      users.login += bucket.login;
      users.onboarding += bucket.onboarding;
    }

    const teamRaw = emptySidebarRaw();
    const rolesOut: Record<string, ReturnType<typeof normalizeBucket>> = {};
    for (const [canon, raw] of byCanonical) {
      const bucket = normalizeBucket(raw);
      rolesOut[canon] = bucket;
      if (PLATFORM_CANONICAL_ROLES.has(canon)) continue;
      absorbSidebarRaw(teamRaw, raw);
    }

    const followUpFacet = followUpRows?.[0] || {};
    const assignedCreatorIds = (followUpFacet.ids || [])
      .map((row: { _id?: unknown }) => String(row?._id || ""))
      .filter(Boolean);

    return res.json({
      success: true,
      data: {
        timezone: "Asia/Kolkata",
        ...buckets,
        users,
        teamDirectory: normalizeBucket(teamRaw),
        roles: rolesOut,
        followUp: {
          onboarding: Number(followUpFacet.count?.[0]?.n || assignedCreatorIds.length || 0),
          assignedCreatorIds,
        },
      },
    });
  } catch (error) {
    console.error("getSidebarUserCounts failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load sidebar user counts",
      code: "SIDEBAR_USER_COUNTS_ERROR",
    });
  }
};
