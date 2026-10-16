import { Types } from "mongoose";
import { AuthRequest } from "../middlewares/authMiddleware";
import { AccessRequest } from "../models/accessRequestModel";
import { DeletedAccessArea } from "../models/deletedAccessModel";
import User from "../models/userModel";
import Role from "../models/roleModel";
import {
  emitAccessRequestChange,
  headAncestorsOf,
  isDeletedAccessArea,
  resolveDeletedAccess,
  setHeadsDeletedAccess,
  setTeamDeletedAccess,
  subscribeDeletedAccessChanges,
} from "./deletedAccess.service";
import { resolveLeadActor } from "./deletedLeadArchive.service";
import { createAccessTicket, setAccessTicketStatus } from "./ticketClient";
import {
  ACCESS_AREA_LABELS,
  sendAccessApprovedEmail,
  sendAccessRejectedEmail,
  sendAccessRequestedEmail,
} from "../utils/accessRequestEmail";

const PAGE_SIZE = 20;

export class AccessRequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type Person = { userId?: string | undefined; name: string; email: string; roleName: string };

const personOf = async (userId: string): Promise<Person | null> => {
  if (!Types.ObjectId.isValid(userId)) return null;
  const user: any = await User.findById(userId).select("name email roleId isActive").lean();
  if (!user || user.isActive === false) return null;
  const role: any = user.roleId ? await Role.findById(user.roleId).select("name").lean() : null;
  return {
    userId: String(user._id),
    name: String(user.name || ""),
    email: String(user.email || ""),
    roleName: String(role?.name || ""),
  };
};

async function findSuperAdmin(): Promise<Person | null> {
  const role: any = await Role.findOne({ name: "super_admin" }).select("_id").lean();
  if (!role) return null;
  const user: any = await User.findOne({ roleId: role._id, isActive: { $ne: false } })
    .sort({ lastLoginAt: -1, createdAt: 1 })
    .select("_id")
    .lean();
  return user ? personOf(String(user._id)) : null;
}

const toTicketPerson = (person: Person) => ({
  userId: person.userId,
  name: person.name || "Unknown",
  email: person.email || "",
  role: person.roleName,
});

export async function createAccessRequest(req: AuthRequest, areaInput: unknown, reasonInput: unknown) {
  if (!isDeletedAccessArea(areaInput)) throw new AccessRequestError("Unknown access area");
  const area: DeletedAccessArea = areaInput;
  const reason = String(reasonInput || "").trim().slice(0, 500);
  if (reason.length < 5) throw new AccessRequestError("Please add a short reason (at least 5 characters)");

  const access = await resolveDeletedAccess(req);
  if (access.level === "super_admin") throw new AccessRequestError("Super Admin already has full access");
  if (access[area].view) throw new AccessRequestError("You already have this access");

  const userId = String(req.user?.id || "");
  const existing = await AccessRequest.findOne({
    area,
    "requester.userId": userId,
    status: "pending",
  }).lean();
  if (existing) throw new AccessRequestError("You already have a pending request for this access", 409);

  const scope: "heads" | "team" = access.level === "head" ? "heads" : "team";
  let approver: Person | null = null;
  if (scope === "heads") {
    approver = await findSuperAdmin();
    if (!approver) throw new AccessRequestError("No Super Admin account found", 500);
  } else {
    const [nearestHead] = await headAncestorsOf(userId);
    approver = nearestHead ? await personOf(nearestHead) : null;
    if (!approver) {
      throw new AccessRequestError(
        "No head was found above you in the reporting line. Ask your manager to set your reports-to.",
      );
    }
  }

  const actor = await resolveLeadActor(req);
  const requester: Person = {
    userId: actor.userId,
    name: actor.name,
    email: actor.email,
    roleName: actor.roleName,
  };
  const label = ACCESS_AREA_LABELS[area] || area;
  const at = new Date();

  const ticket = await createAccessTicket({
    title: `Access request: ${label}`,
    description: `${requester.name || "A staff member"} (${requester.roleName || "staff"}) requested access to ${label}.\n\nReason: ${reason}`,
    requester: toTicketPerson(requester),
    assignedTo: toTicketPerson(approver),
    metadata: {
      accessRequest: { area, scope, label },
      createdByUserId: requester.userId,
      createdByName: requester.name,
      createdByRole: requester.roleName,
      requesterRole: requester.roleName,
    },
  });

  const doc = await AccessRequest.create({
    area,
    scope,
    requester,
    approver,
    reason,
    ticketId: ticket.ticketId,
    ticketCode: ticket.ticketCode,
  });

  void sendAccessRequestedEmail({
    approver,
    requester,
    area,
    scope,
    reason,
    ticketCode: ticket.ticketCode,
    at,
  });
  emitAccessRequestChange(area, scope);
  return doc.toObject();
}

/** Requests this user may approve: Super Admin gets head requests, a head gets their team's. */
const decidableFilter = (level: string, userId: string) =>
  level === "super_admin"
    ? { scope: "heads" }
    : level === "head"
      ? { scope: "team", "approver.userId": new Types.ObjectId(userId) }
      : null;

export async function listAccessRequests(
  req: AuthRequest,
  box: "mine" | "pending",
  pageInput: unknown,
  areas: DeletedAccessArea[] = [],
) {
  const page = Math.max(1, Math.floor(Number(pageInput) || 1));
  const userId = String(req.user?.id || "");
  const access = await resolveDeletedAccess(req);
  let filter: Record<string, unknown>;
  if (box === "mine") {
    if (!Types.ObjectId.isValid(userId)) return emptyPage(page);
    filter = { "requester.userId": new Types.ObjectId(userId) };
  } else {
    const scoped = decidableFilter(access.level, userId);
    if (!scoped || (access.level === "head" && !Types.ObjectId.isValid(userId))) return emptyPage(page);
    filter = { ...scoped, status: "pending" };
  }
  if (areas.length) filter.area = { $in: areas };

  const [rows, total] = await Promise.all([
    AccessRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    AccessRequest.countDocuments(filter),
  ]);
  return {
    data: rows,
    pagination: { page, limit: PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
  };
}

const emptyPage = (page: number) => ({
  data: [],
  pagination: { page, limit: PAGE_SIZE, total: 0, pages: 1 },
});

async function canDecide(req: AuthRequest, request: any) {
  const access = await resolveDeletedAccess(req);
  const userId = String(req.user?.id || "");
  if (request.scope === "heads") return access.level === "super_admin";
  return access.level === "head" && String(request.approver?.userId || "") === userId;
}

export async function getAccessRequestByTicket(req: AuthRequest, ticketId: string) {
  const request: any = await AccessRequest.findOne({ ticketId: String(ticketId || "") }).lean();
  if (!request) return null;
  const access = await resolveDeletedAccess(req);
  const decide = request.status === "pending" && (await canDecide(req, request));
  const blockedReason =
    decide && request.scope === "team" && !access[request.area as DeletedAccessArea]?.canManageTeam
      ? "Super Admin has not enabled this access for heads yet."
      : "";
  return { ...request, canDecide: decide, blockedReason };
}

export async function decideAccessRequest(
  req: AuthRequest,
  id: string,
  approve: boolean,
  noteInput: unknown,
) {
  if (!Types.ObjectId.isValid(id)) throw new AccessRequestError("Request not found", 404);
  const request: any = await AccessRequest.findById(id).lean();
  if (!request) throw new AccessRequestError("Request not found", 404);
  if (request.status !== "pending") throw new AccessRequestError("This request was already decided", 409);
  if (!(await canDecide(req, request))) {
    throw new AccessRequestError("You cannot decide this request", 403);
  }

  const note = String(noteInput || "").trim().slice(0, 500);
  if (!approve && note.length < 3) throw new AccessRequestError("Please add a reason for rejecting");

  const area = request.area as DeletedAccessArea;
  if (approve && request.scope === "team") {
    const access = await resolveDeletedAccess(req);
    if (!access[area].canManageTeam) {
      throw new AccessRequestError("Super Admin has not enabled this access for heads yet", 409);
    }
  }

  const actor = await resolveLeadActor(req);
  const decidedBy: Person = {
    userId: actor.userId,
    name: actor.name,
    email: actor.email,
    roleName: actor.roleName,
  };
  const at = new Date();
  const updated: any = await AccessRequest.findOneAndUpdate(
    { _id: request._id, status: "pending" },
    {
      $set: {
        status: approve ? "approved" : "rejected",
        decidedBy,
        decidedAt: at,
        decisionNote: note,
      },
    },
    { new: true },
  ).lean();
  if (!updated) throw new AccessRequestError("This request was already decided", 409);

  if (approve) {
    if (request.scope === "heads") await setHeadsDeletedAccess(area, true, actor);
    else await setTeamDeletedAccess(area, String(req.user?.id || ""), true, actor);
  }

  await finishDecision(updated, approve, decidedBy, note, at);
  return updated;
}

async function finishDecision(
  request: any,
  approve: boolean,
  decidedBy: Person,
  note: string,
  at: Date,
) {
  const label = ACCESS_AREA_LABELS[request.area] || request.area;
  try {
    await setAccessTicketStatus(
      request.ticketId,
      approve ? "resolved" : "closed",
      approve
        ? `Access to ${label} enabled by ${decidedBy.name || "approver"}`
        : `Access to ${label} rejected by ${decidedBy.name || "approver"}: ${note}`,
      toTicketPerson(decidedBy),
    );
  } catch (error) {
    console.error("[access-request] ticket status update failed:", error);
  }
  if (approve) {
    void sendAccessApprovedEmail({
      requester: request.requester,
      decidedBy,
      area: request.area,
      scope: request.scope,
      ticketCode: request.ticketCode,
      at,
    });
  } else {
    void sendAccessRejectedEmail({
      requester: request.requester,
      decidedBy,
      area: request.area,
      ticketCode: request.ticketCode,
      note,
    });
  }
  emitAccessRequestChange(request.area, request.scope);
}

/** Turning a switch on from the panel also approves the matching pending requests. */
subscribeDeletedAccessChanges(async (change) => {
  if (change.kind !== "grant" || !change.enabled) return;
  const filter: Record<string, unknown> = {
    area: change.area,
    scope: change.scope,
    status: "pending",
  };
  if (change.scope === "team") {
    if (!change.headId || !Types.ObjectId.isValid(change.headId)) return;
    filter["approver.userId"] = new Types.ObjectId(change.headId);
  }
  try {
    const pending: any[] = await AccessRequest.find(filter).lean();
    if (!pending.length) return;
    const decidedBy: Person = {
      userId: change.actor?.userId,
      name: change.actor?.name || "",
      email: change.actor?.email || "",
      roleName: change.actor?.roleName || "",
    };
    const at = new Date(change.at);
    for (const request of pending) {
      const updated: any = await AccessRequest.findOneAndUpdate(
        { _id: request._id, status: "pending" },
        {
          $set: {
            status: "approved",
            decidedBy,
            decidedAt: at,
            decisionNote: "Enabled from the access panel",
          },
        },
        { new: true },
      ).lean();
      if (updated) await finishDecision(updated, true, decidedBy, "", at);
    }
  } catch (error) {
    console.error("[access-request] auto-approve failed:", error);
  }
});
