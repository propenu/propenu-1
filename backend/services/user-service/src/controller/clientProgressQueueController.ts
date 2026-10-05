import { Response } from "express";
import mongoose from "mongoose";
import User from "../models/userModel";
import Role from "../models/roleModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import { PLATFORM_END_USER_ROLE_NAMES } from "../utils/roleHierarchy";

const ONBOARDING_STATUSES = [
  "location_pending",
  "kyc_pending",
  "pending",
  "incomplete",
] as const;

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const EXPORT_MAX_LIMIT = 2000;

const normalizeRole = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

const isCceRole = (roleName = "") => {
  const key = normalizeRole(roleName);
  return (
    key.includes("customer_care") ||
    key === "customer_care" ||
    key === "customer_care_executive" ||
    key === "customer_care_executives"
  );
};

const isOversightRole = (roleName = "") => {
  const key = normalizeRole(roleName);
  return (
    key === "super_admin" ||
    key === "admin" ||
    key === "team_lead" ||
    key === "customer_support_team_lead" ||
    key === "team_leads" ||
    key.includes("team_lead") ||
    key.includes("support_head") ||
    key === "customer_support_head"
  );
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const pushAnd = (filter: Record<string, any>, clause: Record<string, any>) => {
  if (!filter.$and) filter.$and = [];
  filter.$and.push(clause);
};

/** Day bounds in IST so admin date chips match stored timestamps. */
const buildDayRange = (fromRaw: string, toRaw: string) => {
  const from = String(fromRaw || "").trim();
  const to = String(toRaw || "").trim();
  if (!from && !to) return null;
  const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const range: Record<string, Date> = {};
  if (from && isDay(from)) {
    const start = new Date(`${from}T00:00:00.000+05:30`);
    if (!Number.isNaN(start.getTime())) range.$gte = start;
  }
  if (to && isDay(to)) {
    const end = new Date(`${to}T23:59:59.999+05:30`);
    if (!Number.isNaN(end.getTime())) range.$lte = end;
  }
  return Object.keys(range).length ? range : null;
};

const activityInRangeClause = (dayRange: Record<string, Date> | null) => {
  if (!dayRange) return null;
  return {
    $or: [
      { createdAt: dayRange },
      { followUpAssignedAt: dayRange },
      { followUpWorkUpdatedAt: dayRange },
      { updatedAt: dayRange },
    ],
  };
};

const parseObjectIds = (raw: string) =>
  String(raw || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

const QUEUE_SELECT =
  "name email phone roleId isActive accountStatus phoneVerified locality city state pincode createdAt updatedAt lastLoginAt followUpAssignedTo followUpAssignedAt followUpWorkStatus followUpWorkUpdatedAt followUpCompletionReason kyc";

type TrackKey =
  | "created_today"
  | "created_period"
  | "login_today"
  | "active_success"
  | "stuck_location"
  | "stuck_kyc"
  | "kyc_rejected"
  | "onboarding_all"
  | "process_assigned"
  | "process_in_progress"
  | "process_completed"
  | "owners"
  | "agents"
  | "builders"
  | "builder_staff";

const USER_TRACKS: TrackKey[] = [
  "created_today",
  "created_period",
  "login_today",
  "active_success",
  "stuck_location",
  "stuck_kyc",
  "kyc_rejected",
  "onboarding_all",
  "process_assigned",
  "process_in_progress",
  "process_completed",
  "owners",
  "agents",
  "builders",
  "builder_staff",
];

const applyTrackFilter = (
  filter: Record<string, any>,
  track: string,
  dayRange: Record<string, Date> | null,
  platformRoleIds: mongoose.Types.ObjectId[],
  roleIdByName: Map<string, mongoose.Types.ObjectId>,
) => {
  filter.roleId = { $in: platformRoleIds };

  const activity = activityInRangeClause(dayRange);
  const createdOnly = dayRange ? { createdAt: dayRange } : null;
  const loginOnly = dayRange ? { lastLoginAt: dayRange } : null;

  switch (track) {
    case "created_today":
    case "created_period":
      if (createdOnly) Object.assign(filter, createdOnly);
      break;
    case "login_today":
      if (loginOnly) Object.assign(filter, loginOnly);
      else filter.lastLoginAt = { $exists: true, $ne: null };
      break;
    case "active_success":
      filter.accountStatus = "active";
      if (activity) pushAnd(filter, activity);
      break;
    case "stuck_location":
      // Open-case queue: status only (date chips still apply to signup/login tracks).
      filter.accountStatus = "location_pending";
      break;
    case "stuck_kyc":
      filter.accountStatus = "kyc_pending";
      break;
    case "kyc_rejected":
      filter.accountStatus = "kyc_rejected";
      break;
    case "onboarding_all":
      // Work queue of incomplete onboarding — always show open cases.
      filter.accountStatus = { $in: [...ONBOARDING_STATUSES] };
      break;
    case "process_assigned":
      // Only set "has assignee" when caller did not already scope to a CCE.
      if (filter.followUpAssignedTo == null) {
        filter.followUpAssignedTo = { $ne: null };
      }
      filter.followUpWorkStatus = "assigned";
      break;
    case "process_in_progress":
      if (filter.followUpAssignedTo == null) {
        filter.followUpAssignedTo = { $ne: null };
      }
      filter.followUpWorkStatus = "in_progress";
      break;
    case "process_completed":
      if (filter.followUpAssignedTo == null) {
        filter.followUpAssignedTo = { $ne: null };
      }
      filter.followUpWorkStatus = "completed";
      if (activity) pushAnd(filter, activity);
      break;
    case "owners": {
      const id = roleIdByName.get("user");
      if (id) filter.roleId = id;
      if (activity) pushAnd(filter, activity);
      break;
    }
    case "agents": {
      const id = roleIdByName.get("agent");
      if (id) filter.roleId = id;
      if (activity) pushAnd(filter, activity);
      break;
    }
    case "builders": {
      const id = roleIdByName.get("builder");
      if (id) filter.roleId = id;
      if (activity) pushAnd(filter, activity);
      break;
    }
    case "builder_staff": {
      const id = roleIdByName.get("builder_staff");
      if (id) filter.roleId = id;
      if (activity) pushAnd(filter, activity);
      break;
    }
    default:
      filter.accountStatus = { $in: [...ONBOARDING_STATUSES] };
      if (activity) pushAnd(filter, activity);
      break;
  }
};

const formatQueueUser = (user: any) => {
  const role = user.roleId;
  const assignee = user.followUpAssignedTo;
  const assigneeRole = assignee?.roleId;
  const followUpAssignedTo = assignee?._id
    ? String(assignee._id)
    : assignee
      ? String(assignee)
      : null;

  return {
    _id: String(user._id),
    id: String(user._id),
    name: user.name || null,
    email: user.email || null,
    phone: user.phone || null,
    isActive: user.isActive !== false,
    accountStatus: user.accountStatus || null,
    phoneVerified: Boolean(user.phoneVerified),
    locality: user.locality || null,
    city: user.city || null,
    state: user.state || null,
    pincode: user.pincode || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastLoginAt: user.lastLoginAt || null,
    followUpAssignedAt: user.followUpAssignedAt || null,
    followUpWorkUpdatedAt: user.followUpWorkUpdatedAt || null,
    followUpWorkStatus:
      user.followUpWorkStatus || (followUpAssignedTo ? "assigned" : null),
    followUpCompletionReason: user.followUpCompletionReason || null,
    followUpAssignedTo,
    roleId: role?._id ? String(role._id) : user.roleId ? String(user.roleId) : null,
    roleName: role?.name || null,
    kyc: user.kyc || null,
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
  };
};

/**
 * GET /auth/client-progress-queue
 * Server-paginated Client Progress Queue (industry pattern: filter + limit 12).
 */
export const getClientProgressQueue = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const query = req.query as Record<string, any>;
    const track = String(query.track || "onboarding_all").trim() || "onboarding_all";
    const wantsExport = String(query.export || "").trim() === "1";
    const includeCounts = String(query.includeCounts || "").trim() === "1";
    const includeCreatorIds =
      String(query.includeCreatorIds || "").trim() === "1";
    const page = Math.max(1, Number(query.page) || 1);
    const maxLimit = wantsExport ? EXPORT_MAX_LIMIT : MAX_LIMIT;
    const limit = Math.min(
      maxLimit,
      Math.max(1, Number(query.limit ?? query.pageSize) || DEFAULT_LIMIT),
    );

    const from = String(query.from || query.createdFrom || "").trim();
    const to = String(query.to || query.createdTo || "").trim();
    const dayRange = buildDayRange(from, to);
    const q = String(query.q || query.search || "").trim();

    const actorId = String(req.user.sub);
    const actorRole = String(req.user.roleName || "");
    const cceViewer = isCceRole(actorRole);
    const oversight = isOversightRole(actorRole);

    const platformRoles = await Role.find({
      name: { $in: [...PLATFORM_END_USER_ROLE_NAMES] },
    })
      .select("_id name")
      .lean();
    const platformRoleIds = platformRoles.map(
      (r) => r._id as mongoose.Types.ObjectId,
    );
    const roleIdByName = new Map(
      platformRoles.map((r: any) => [String(r.name), r._id as mongoose.Types.ObjectId]),
    );

    if (!platformRoleIds.length) {
      return res.json({
        data: [],
        meta: { total: 0, page: 1, limit, pages: 1 },
        trackCounts: null,
        creatorIds: includeCreatorIds ? [] : undefined,
      });
    }

    // Assignee scope: CCE always own cases; oversight may drill into one/pod.
    const assigneeIdRaw = String(query.assigneeId || "").trim();
    const assigneeIdsRaw = String(query.assigneeIds || "").trim();
    let assigneeScope: mongoose.Types.ObjectId | { $in: mongoose.Types.ObjectId[] } | null =
      null;
    if (cceViewer && !oversight) {
      assigneeScope = new mongoose.Types.ObjectId(actorId);
    } else if (assigneeIdRaw && mongoose.Types.ObjectId.isValid(assigneeIdRaw)) {
      assigneeScope = new mongoose.Types.ObjectId(assigneeIdRaw);
    } else if (assigneeIdsRaw) {
      const ids = parseObjectIds(assigneeIdsRaw);
      if (ids.length) assigneeScope = { $in: ids };
    }

    const listFilter: Record<string, any> = {};
    if (assigneeScope) {
      listFilter.followUpAssignedTo = assigneeScope;
    }
    applyTrackFilter(listFilter, track, dayRange, platformRoleIds, roleIdByName);
    // Re-apply assignee after track (process_* may set $ne:null when unset).
    if (assigneeScope) {
      listFilter.followUpAssignedTo = assigneeScope;
    }

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
      pushAnd(listFilter, { $or: or });
    }

    const [total, users] = await Promise.all([
      User.countDocuments(listFilter).maxTimeMS(12000),
      User.find(listFilter)
        .select(QUEUE_SELECT)
        .populate("roleId", "name label")
        .populate({
          path: "followUpAssignedTo",
          select: "name email phone roleId",
          populate: { path: "roleId", select: "name label" },
        })
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .maxTimeMS(12000)
        .lean(),
    ]);

    const data = users.map(formatQueueUser);

    let trackCounts: Record<string, number> | null = null;
    if (includeCounts && cceViewer && !oversight) {
      try {
        const entries = await Promise.all(
          USER_TRACKS.map(async (key) => {
            const f: Record<string, any> = {
              followUpAssignedTo: new mongoose.Types.ObjectId(actorId),
            };
            applyTrackFilter(f, key, dayRange, platformRoleIds, roleIdByName);
            f.followUpAssignedTo = new mongoose.Types.ObjectId(actorId);
            const n = await User.countDocuments(f).maxTimeMS(8000);
            return [key, n] as const;
          }),
        );
        trackCounts = Object.fromEntries(entries);
      } catch {
        trackCounts = null;
      }
    }

    let creatorIds: string[] | undefined;
    if (includeCreatorIds && cceViewer && !oversight) {
      const docs = await User.find({
        followUpAssignedTo: new mongoose.Types.ObjectId(actorId),
        roleId: { $in: platformRoleIds },
      })
        .select("_id")
        .maxTimeMS(10000)
        .lean();
      creatorIds = docs.map((d) => String(d._id));
    }

    return res.json({
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit) || 1),
        from: from || null,
        to: to || null,
        track,
      },
      trackCounts,
      creatorIds,
    });
  } catch (err) {
    console.error("getClientProgressQueue failed:", err);
    return res.status(500).json({ message: "Failed to load client progress queue" });
  }
};
