import { Request, Response } from "express";
import mongoose from "mongoose";
import HomeLoanApplication from "../models/homeLoanApplicationModel";
import User from "../models/userModel";
import Role from "../models/roleModel";
import { verifyToken } from "../utils/jwt";
import { AuthRequest } from "../middlewares/authMiddleware";
import { assignHomeLoan, ensureUnassignedHomeLoans, findLoanUser } from "../utils/homeLoanAssign";

// Ensure Role is registered for populate("roleId").
void Role;

const RECENT_APPLICATION_WINDOW_HOURS = 24;

const cleanString = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";

const cleanObject = (
  value: unknown,
  maxBytes = 12_000,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > maxBytes) return {};
  return JSON.parse(serialized) as Record<string, unknown>;
};

const getOptionalUserId = (req: Request) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.split(" ")[1];
  if (!token) return null;

  try {
    const decoded = verifyToken(token);
    return decoded.sub && mongoose.Types.ObjectId.isValid(decoded.sub)
      ? new mongoose.Types.ObjectId(decoded.sub)
      : null;
  } catch {
    return null;
  }
};

export const createHomeLoanApplicationController = async (
  req: Request,
  res: Response,
) => {
  try {
    const fullName = cleanString(req.body?.fullName, 120);
    const mobileNumber = cleanString(req.body?.mobileNumber, 24).replace(/\D/g, "");
    const email = cleanString(req.body?.email, 160).toLowerCase();
    const pageUrl = cleanString(req.body?.pageUrl, 2048);
    const source = cleanString(req.body?.source, 80) || "home_loans";
    const metadata = cleanObject(req.body?.metadata);
    const errors: string[] = [];

    if (!fullName) {
      errors.push("Full name is required");
    } else if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(fullName)) {
      errors.push("Full name can contain letters and spaces only");
    } else if (fullName.length < 3) {
      errors.push("Full name must be at least 3 letters");
    }

    if (!mobileNumber) {
      errors.push("Mobile number is required");
    } else if (!/^[6-9]\d{9}$/.test(mobileNumber)) {
      errors.push("Enter a valid 10-digit mobile number");
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Enter a valid email address");
    }

    if (req.body?.metadata && Object.keys(metadata).length === 0) {
      errors.push("Metadata must be an object smaller than 12KB");
    }

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid home loan application",
        errors,
      });
    }

    const recentCutoff = new Date(
      Date.now() - RECENT_APPLICATION_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const recentApplication = await HomeLoanApplication.findOne({
      mobileNumber,
      createdAt: { $gte: recentCutoff },
    })
      .select("_id createdAt status")
      .lean();

    if (recentApplication) {
      return res.status(409).json({
        success: false,
        code: "RECENT_HOME_LOAN_APPLICATION_EXISTS",
        message:
          "You have already submitted a home loan application recently. Our team will contact you soon.",
        data: {
          existingApplicationId: String(recentApplication._id),
          submittedAt: recentApplication.createdAt,
          status: recentApplication.status,
          retryAfterHours: RECENT_APPLICATION_WINDOW_HOURS,
        },
      });
    }

    const application = await HomeLoanApplication.create({
      userId: getOptionalUserId(req),
      fullName,
      mobileNumber,
      ...(email ? { email } : {}),
      source,
      ...(pageUrl ? { pageUrl } : {}),
      status: "new",
      metadata,
    });

    assignHomeLoan(String(application._id)).catch((error) => {
      console.error("home loan assign skipped:", error);
    });

    return res.status(201).json({
      success: true,
      message: "Home loan application submitted successfully",
      data: {
        id: String(application._id),
        status: application.status,
        createdAt: application.createdAt,
      },
    });
  } catch (error) {
    console.error("createHomeLoanApplication failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to submit home loan application",
    });
  }
};

const PAGE_LIMIT = 12;
const MAX_LIMIT = 20;
const LOAN_STATUSES = ["new", "contacted", "follow_up", "converted", "closed"] as const;

/** Day bounds in IST, same as the Client Progress Queue date chips. */
const buildDayRange = (fromRaw: string, toRaw: string) => {
  const from = String(fromRaw || "").trim();
  const to = String(toRaw || "").trim();
  if (!from && !to) return null;
  const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
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

const normalizeRole = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const isCceRole = (roleName = "") => {
  const key = normalizeRole(roleName);
  return key === "customer_care" || key.includes("customer_care");
};

const canSeeAllLoans = (roleName = "") => {
  const key = normalizeRole(roleName);
  return (
    key === "super_admin" ||
    key === "admin" ||
    key.includes("team_lead") ||
    key.includes("support_head") ||
    key === "operations_head" ||
    key === "ceo"
  );
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Map stored role names to the labels ops use in the admin (Owner / Builder / Agent). */
const accountRoleLabel = (roleName?: string | null) => {
  const key = String(roleName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  if (!key) return null;
  if (key === "user" || key === "owner") return "Owner";
  if (key === "builder") return "Builder";
  if (key === "agent") return "Agent";
  if (key === "sales_agent" || key === "sales_executive") return "Sales Executive";
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const accountStepLabel = (status?: string | null) => {
  if (status === "active") return "Account forms done";
  if (status === "location_pending") return "Location form not filled";
  if (status === "kyc_pending") return "KYC form not filled";
  if (status === "kyc_rejected") return "KYC rejected";
  if (status === "pending" || status === "incomplete") return "Signup not finished";
  return status ? String(status).replace(/_/g, " ") : "No account yet";
};

export const listHomeLoanApplicationsController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const roleName = req.user?.roleName || "";
    const actorId = String(req.user?.id || "");
    const oversight = canSeeAllLoans(roleName);
    const cce = isCceRole(roleName);

    if (!oversight && !cce) {
      return res.status(403).json({
        success: false,
        message: "Only customer support or an admin can open home loans",
      });
    }

    if (cce && !mongoose.Types.ObjectId.isValid(actorId)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await ensureUnassignedHomeLoans(PAGE_LIMIT);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || PAGE_LIMIT));
    const audience = String(req.query.audience || "all");
    const search = String(req.query.search || req.query.q || "").trim().slice(0, 80);
    const status = String(req.query.status || "").trim();
    const dayRange = buildDayRange(
      String(req.query.from || ""),
      String(req.query.to || ""),
    );

    const filter: Record<string, unknown> = {};
    if (cce && !oversight) {
      filter.assignedTo = new mongoose.Types.ObjectId(actorId);
    }
    if ((LOAN_STATUSES as readonly string[]).includes(status)) {
      filter.status = status;
    }
    if (dayRange) filter.createdAt = dayRange;
    if (audience === "existing") {
      filter.userId = { $ne: null };
    } else if (audience === "new") {
      filter.$or = [{ userId: null }, { userId: { $exists: false } }];
    }
    if (search) {
      const safe = escapeRegex(search);
      filter.$and = [
        {
          $or: [
            { fullName: { $regex: safe, $options: "i" } },
            { mobileNumber: { $regex: safe } },
          ],
        },
      ];
    }

    const scopeFilter: Record<string, unknown> =
      cce && !oversight ? { assignedTo: new mongoose.Types.ObjectId(actorId) } : {};
    if (dayRange) scopeFilter.createdAt = dayRange;

    const [rows, total, countFacets] = await Promise.all([
      HomeLoanApplication.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      HomeLoanApplication.countDocuments(filter),
      // Form totals + unique people (existing = distinct userId, new = distinct mobile)
      HomeLoanApplication.aggregate([
        { $match: scopeFilter },
        {
          $facet: {
            forms: [
              {
                $group: {
                  _id: null,
                  all: { $sum: 1 },
                  existing: {
                    $sum: { $cond: [{ $ifNull: ["$userId", false] }, 1, 0] },
                  },
                  fresh: {
                    $sum: { $cond: [{ $ifNull: ["$userId", false] }, 0, 1] },
                  },
                  statusNew: {
                    $sum: { $cond: [{ $eq: ["$status", "new"] }, 1, 0] },
                  },
                  contacted: {
                    $sum: { $cond: [{ $eq: ["$status", "contacted"] }, 1, 0] },
                  },
                  followUp: {
                    $sum: { $cond: [{ $eq: ["$status", "follow_up"] }, 1, 0] },
                  },
                  converted: {
                    $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] },
                  },
                  closed: {
                    $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] },
                  },
                },
              },
            ],
            existingPeople: [
              { $match: { userId: { $ne: null } } },
              { $group: { _id: "$userId" } },
              { $count: "count" },
            ],
            newPeople: [
              {
                $match: {
                  $or: [{ userId: null }, { userId: { $exists: false } }],
                },
              },
              { $group: { _id: "$mobileNumber" } },
              { $count: "count" },
            ],
          },
        },
      ]),
    ]);
    const counts = countFacets;

    const linkedIds = [...rows.map((row) => row.userId), ...rows.map((row) => row.assignedTo)]
      .map((id) => (id ? String(id) : ""))
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const linked = linkedIds.length
      ? await User.find({ _id: { $in: linkedIds } })
          .select(
            "name phone email accountStatus state city locality createdAt roleId",
          )
          .populate({ path: "roleId", select: "name label" })
          .lean()
      : [];
    const byId = new Map(linked.map((user) => [String(user._id), user]));

    const resolveUserRole = async (user: Record<string, any> | null | undefined) => {
      if (!user) return { roleName: null as string | null, roleLabel: null as string | null };

      let roleDoc =
        user.roleId && typeof user.roleId === "object" && "name" in user.roleId
          ? (user.roleId as { name?: string; label?: string })
          : null;

      if (!roleDoc && user.roleId && mongoose.Types.ObjectId.isValid(String(user.roleId))) {
        roleDoc = (await Role.findById(user.roleId).select("name label").lean()) as {
          name?: string;
          label?: string;
        } | null;
      }

      const rawName = String(
        (user as { roleName?: string }).roleName || roleDoc?.name || "",
      )
        .trim()
        .toLowerCase();
      // Marketplace accounts without a role doc are treated as Owner (role "user").
      const roleName = rawName || (user._id ? "user" : null);
      const roleLabel =
        accountRoleLabel(roleName) ||
        (roleDoc?.label ? String(roleDoc.label) : null) ||
        (roleName ? "Owner" : null);
      return { roleName, roleLabel };
    };

    const data = await Promise.all(
      rows.map(async (row) => {
        let linkedUser: Record<string, any> | null | undefined = row.userId
          ? byId.get(String(row.userId))
          : null;
        if (!linkedUser) {
          const matched = await findLoanUser(row);
          if (matched?._id) {
            linkedUser = (await User.findById(matched._id)
              .select(
                "name phone email accountStatus state city locality createdAt roleId",
              )
              .populate({ path: "roleId", select: "name label" })
              .lean()) as Record<string, any> | null;
          }
        }
        const assignee = row.assignedTo ? byId.get(String(row.assignedTo)) : null;
        const metadata = (row.metadata || {}) as Record<string, any>;
        const role = await resolveUserRole(linkedUser);
        return {
          id: String(row._id),
          fullName: row.fullName,
          mobileNumber: row.mobileNumber,
          email: row.email || linkedUser?.email || null,
          status: row.status,
          source: row.source,
          pageUrl: row.pageUrl || null,
          createdAt: row.createdAt,
          assignMethod: row.assignMethod || null,
          assignedAt: row.assignedAt || null,
          completionReason: row.completionReason || null,
          kind: linkedUser ? "existing" : "new",
          form: {
            entryPoint: metadata.entryPoint || null,
            sourceSection: metadata.sourceSection || null,
            selectedOffer: metadata.selectedOffer || null,
            calculator: metadata.calculator || null,
          },
          user: linkedUser
            ? {
                id: String(linkedUser._id),
                name: linkedUser.name || null,
                accountStatus: linkedUser.accountStatus || null,
                accountStep: accountStepLabel(linkedUser.accountStatus),
                roleName: role.roleName,
                roleLabel: role.roleLabel,
                state: linkedUser.state || null,
                city: linkedUser.city || null,
                locality: linkedUser.locality || null,
                createdAt: linkedUser.createdAt || null,
              }
            : null,
          assignee: assignee
            ? { id: String(assignee._id), name: assignee.name || "Customer support" }
            : null,
        };
      }),
    );

    const facet = counts[0] || {};
    const summary = facet.forms?.[0] || {
      all: 0,
      existing: 0,
      fresh: 0,
      statusNew: 0,
      contacted: 0,
      followUp: 0,
      converted: 0,
      closed: 0,
    };
    const existingPeople = Number(facet.existingPeople?.[0]?.count || 0);
    const newPeople = Number(facet.newPeople?.[0]?.count || 0);
    return res.json({
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
        counts: {
          // Form totals (Applications tab)
          all: Number(summary.all || 0),
          existing: Number(summary.existing || 0),
          new: Number(summary.fresh || 0),
          // Unique people (Home Loan Users tab)
          existingPeople,
          newPeople,
          statusNew: Number(summary.statusNew || 0),
          contacted: Number(summary.contacted || 0),
          followUp: Number(summary.followUp || 0),
          converted: Number(summary.converted || 0),
          closed: Number(summary.closed || 0),
        },
      },
    });
  } catch (error) {
    console.error("listHomeLoanApplications failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load home loans",
    });
  }
};

/** Customer support moves a loan through the Client Progress Queue statuses. */
export const updateHomeLoanStatusController = async (req: AuthRequest, res: Response) => {
  try {
    const roleName = req.user?.roleName || "";
    const actorId = String(req.user?.id || "");
    const oversight = canSeeAllLoans(roleName);
    const cce = isCceRole(roleName);
    const id = String(req.params.id || "");
    const status = String(req.body?.status || "").trim();

    if (!oversight && !cce) {
      return res.status(403).json({
        success: false,
        message: "Only customer support or an admin can update a home loan",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid application" });
    }
    if (!(LOAN_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ success: false, message: "Choose a valid status" });
    }

    const done = status === "converted" || status === "closed";
    const completionReason = String(req.body?.completionReason || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    if (done && completionReason.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Enter how this home loan was completed (at least 8 characters)",
        code: "COMPLETION_REASON_REQUIRED",
      });
    }

    const filter: Record<string, unknown> = { _id: new mongoose.Types.ObjectId(id) };
    if (cce && !oversight) {
      if (!mongoose.Types.ObjectId.isValid(actorId)) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      filter.assignedTo = new mongoose.Types.ObjectId(actorId);
    }

    const updated = await HomeLoanApplication.findOneAndUpdate(
      filter,
      {
        $set: {
          status,
          completionReason: done ? completionReason : null,
        },
      },
      { new: true },
    ).lean();

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Home loan not found, or it is assigned to someone else",
      });
    }

    return res.json({
      success: true,
      data: {
        id: String(updated._id),
        status: updated.status,
        completionReason: updated.completionReason || null,
      },
    });
  } catch (error) {
    console.error("updateHomeLoanStatus failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update home loan",
    });
  }
};
