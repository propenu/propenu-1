import { Request, Response } from "express";
import { Types } from "mongoose";
import User from "../../../user-service/src/models/userModel";
import { BuilderPlan } from "../models/builderPlanModel";
import { BuilderPlanHistory } from "../models/builderPlanHistoryModel";
import { AuthRequest } from "../middlewares/authMiddleware";

/** Fields shown in the change history, with the label the admin sees. */
const TRACKED_FIELDS: Record<string, string> = {
  title: "Title",
  price: "Base price",
  discount: "Flat discount",
  finalPrice: "Final price",
  durationDays: "Duration (days)",
  isActive: "Available for purchase",
  description: "Description",
  mainPlacement: "Main placement",
  sponsoredEnabled: "Sponsored ad",
  locationRule: "Location rule",
  visibleLeadLimit: "Buyer contacts shown",
  startMode: "Start mode",
};

const PROTECTED_FIELDS = ["_id", "createdBy", "updatedBy", "createdAt", "updatedAt", "finalPrice"];

const cleanBody = (body: Record<string, unknown> = {}) => {
  const next = { ...body };
  PROTECTED_FIELDS.forEach((field) => delete next[field]);
  return next;
};

async function resolveActor(req: AuthRequest) {
  const id = req.user?.id || req.user?.sub || "";
  const actor = {
    id: Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null,
    name: "",
    email: "",
    role: String(req.user?.roleName || ""),
  };
  if (actor.id) {
    const user = await User.findById(actor.id).select("name email").lean<{ name?: string; email?: string }>();
    actor.name = user?.name || "";
    actor.email = user?.email || "";
  }
  return actor;
}

const snapshot = (plan: any) =>
  Object.fromEntries(Object.keys(TRACKED_FIELDS).map((field) => [field, plan?.[field] ?? null]));

const diff = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(TRACKED_FIELDS)
    .filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null))
    .map((field) => ({ field, label: TRACKED_FIELDS[field], from: before[field] ?? null, to: after[field] ?? null }));

async function recordHistory(entry: {
  plan: any;
  action: "created" | "updated" | "deleted";
  changes: ReturnType<typeof diff>;
  actor: Awaited<ReturnType<typeof resolveActor>>;
}) {
  try {
    await BuilderPlanHistory.create({
      plan: entry.plan._id,
      planCode: entry.plan.code,
      planTitle: entry.plan.title,
      action: entry.action,
      changes: entry.changes,
      actor: entry.actor,
    });
  } catch (error) {
    console.error("Failed to record builder plan history", error);
  }
}

const findPlan = (id: string) =>
  Types.ObjectId.isValid(id) ? BuilderPlan.findById(id) : BuilderPlan.findOne({ code: id });

export async function getBuilderPlans(req: Request, res: Response) {
  try {
    const { promotionType, isActive, code } = req.query;

    const filter: Record<string, unknown> = {};

    if (promotionType) filter.promotionType = promotionType;
    if (code) filter.code = code;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const plans = await BuilderPlan.find(filter).sort({ createdAt: -1 });

    res.json({
      success: true,
      plans,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch builder plans",
    });
  }
}

export async function getBuilderPlanById(req: Request, res: Response) {
  try {
    const id = req.params.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Builder plan id is required",
      });
    }

    const plan = await findPlan(id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Builder plan not found",
      });
    }

    return res.json({
      success: true,
      plan,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch builder plan",
    });
  }
}

export async function createBuilderPlan(req: AuthRequest, res: Response) {
  try {
    const actor = await resolveActor(req);
    const plan = await BuilderPlan.create({ ...cleanBody(req.body), createdBy: actor, updatedBy: actor });
    const after = snapshot(plan);
    await recordHistory({
      plan,
      action: "created",
      changes: diff({}, after).filter((change) => change.to !== null && change.to !== ""),
      actor,
    });

    res.status(201).json({
      success: true,
      message: "Builder plan created successfully",
      plan,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function updateBuilderPlan(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Builder plan id is required",
      });
    }

    const plan = await findPlan(id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Builder plan not found",
      });
    }

    const before = snapshot(plan.toObject());
    Object.assign(plan, cleanBody(req.body));
    await plan.validate();
    const changes = diff(before, snapshot(plan.toObject()));

    if (changes.length) {
      const actor = await resolveActor(req);
      plan.set("updatedBy", actor);
      await plan.save();
      await recordHistory({ plan, action: "updated", changes, actor });
    }

    return res.json({
      success: true,
      message: changes.length ? "Builder plan updated successfully" : "No changes to save",
      plan,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteBuilderPlan(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Builder plan id is required",
      });
    }

    const plan = Types.ObjectId.isValid(id)
      ? await BuilderPlan.findByIdAndDelete(id)
      : await BuilderPlan.findOneAndDelete({ code: id });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Builder plan not found",
      });
    }

    await recordHistory({
      plan,
      action: "deleted",
      changes: diff(snapshot(plan.toObject()), {}).filter((change) => change.from !== null && change.from !== ""),
      actor: await resolveActor(req),
    });

    return res.json({
      success: true,
      message: "Builder plan deleted successfully",
      plan,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete builder plan",
    });
  }
}

export async function deleteBuilderPlanHistoryEntry(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid history entry id" });
    }
    const entry = await BuilderPlanHistory.findByIdAndDelete(id);
    if (!entry) {
      return res.status(404).json({ success: false, message: "History entry not found" });
    }
    return res.json({ success: true, message: "History entry deleted permanently" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to delete history entry" });
  }
}

/** Permanently removes every history entry matching the same `code` / `action` filters as the list. */
export async function deleteBuilderPlanHistory(req: Request, res: Response) {
  try {
    const code = String(req.query.code || "").trim().toUpperCase();
    const action = String(req.query.action || "").trim().toLowerCase();
    const filter: Record<string, unknown> = {};
    if (code) filter.planCode = code;
    if (["created", "updated", "deleted"].includes(action)) filter.action = action;

    const result = await BuilderPlanHistory.deleteMany(filter);
    return res.json({
      success: true,
      deleted: result.deletedCount || 0,
      message: `${result.deletedCount || 0} history entries deleted permanently`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to delete plan history" });
  }
}

/** Paginated change history. `code` narrows to one plan, including earlier plans deleted under the same code. */
export async function getBuilderPlanHistory(req: Request, res: Response) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const code = String(req.query.code || "").trim().toUpperCase();
    const action = String(req.query.action || "").trim().toLowerCase();
    const allowed: string[] = (req as any).planHistoryActions || ["created", "updated", "deleted"];

    const filter: Record<string, unknown> = {};
    if (code) filter.planCode = code;
    filter.action = allowed.includes(action) ? action : { $in: allowed };

    const [total, items] = await Promise.all([
      BuilderPlanHistory.countDocuments(filter),
      BuilderPlanHistory.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    const pages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      success: true,
      items,
      meta: { total, page, limit, pages, hasNextPage: page < pages, hasPreviousPage: page > 1 },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch plan history",
    });
  }
}
