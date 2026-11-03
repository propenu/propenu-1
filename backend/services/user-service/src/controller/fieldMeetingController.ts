import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middlewares/authMiddleware";
import FieldMeeting, {
  FIELD_MEETING_LOGGING_MODES,
  FIELD_MEETING_PUNCH_OUT_WAIT_MINUTES,
  FIELD_MEETING_STATUSES,
  FIELD_MEETING_TYPES,
  normalizeMeetingPlace,
} from "../models/fieldMeetingModel";
import FieldMeetingContact from "../models/fieldMeetingContactModel";
import User from "../models/userModel";
import {
  actorCanAccessMeeting,
  buildVisibilityChain,
  canonicalFieldMeetingRole,
  defaultPrepTasks,
  FIELD_MEETING_STAFF_ROLES,
  getVisibleOwnerIds,
} from "../utils/fieldMeetingAccess";

const asId = (v: any) => (v ? String(v._id || v) : "");

const parseLocalDay = (value?: string, end = false): Date | null => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return end
    ? new Date(y, mo, d, 23, 59, 59, 999)
    : new Date(y, mo, d, 0, 0, 0, 0);
};

const combineDateTime = (dateStr: string, timeStr: string): Date | null => {
  const d = String(dateStr || "").trim();
  const t = String(timeStr || "").trim();
  if (!d || !t) return null;
  // Accept HH:mm or h:mm AM/PM
  let hours = 0;
  let minutes = 0;
  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    hours = Number(ampm[1]) % 12;
    if (String(ampm[3]).toUpperCase() === "PM") hours += 12;
    minutes = Number(ampm[2]);
  } else {
    const parts = t.split(":");
    hours = Number(parts[0]);
    minutes = Number(parts[1] || 0);
  }
  const day = parseLocalDay(d, false);
  if (!day || Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  day.setHours(hours, minutes, 0, 0);
  return day;
};

const assertStaff = (req: AuthRequest) => {
  const role = canonicalFieldMeetingRole(req.user?.roleName);
  const perms = req.user?.permissions || [];
  if (
    !FIELD_MEETING_STAFF_ROLES.has(role) &&
    !perms.includes("dashboard:view") &&
    !perms.includes("user:create")
  ) {
    return false;
  }
  return true;
};

const applyPunchIn = (meeting: any, actorId: string, at = new Date()) => {
  if (meeting.punchInAt) return;
  meeting.punchInAt = at;
  if (actorId && mongoose.Types.ObjectId.isValid(actorId)) {
    meeting.punchInBy = new mongoose.Types.ObjectId(actorId);
  }
};

const punchOutAllowedAt = (punchInAt: Date | string | null | undefined) => {
  if (!punchInAt) return null;
  const start = new Date(punchInAt);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(
    start.getTime() + FIELD_MEETING_PUNCH_OUT_WAIT_MINUTES * 60 * 1000,
  );
};

const canPunchOutNow = (
  meeting: any,
  at = new Date(),
): { ok: boolean; allowedAt: Date | null; waitMinutes: number } => {
  const loggingMode = String(meeting.loggingMode || "scheduled");
  // Retroactive "already visited" logs can punch out immediately
  if (loggingMode === "already_visited") {
    return { ok: true, allowedAt: at, waitMinutes: 0 };
  }
  if (!meeting.punchInAt) {
    return {
      ok: false,
      allowedAt: null,
      waitMinutes: FIELD_MEETING_PUNCH_OUT_WAIT_MINUTES,
    };
  }
  const allowedAt = punchOutAllowedAt(meeting.punchInAt);
  if (!allowedAt) {
    return {
      ok: false,
      allowedAt: null,
      waitMinutes: FIELD_MEETING_PUNCH_OUT_WAIT_MINUTES,
    };
  }
  const remainingMs = allowedAt.getTime() - at.getTime();
  if (remainingMs <= 0) return { ok: true, allowedAt, waitMinutes: 0 };
  return {
    ok: false,
    allowedAt,
    waitMinutes: Math.ceil(remainingMs / 60000),
  };
};

const applyPunchOutAndNextAction = (
  meeting: any,
  actorId: string,
  at = new Date(),
) => {
  if (!meeting.punchInAt) applyPunchIn(meeting, actorId, at);
  if (!meeting.punchOutAt) {
    meeting.punchOutAt = at;
    if (actorId && mongoose.Types.ObjectId.isValid(actorId)) {
      meeting.punchOutBy = new mongoose.Types.ObjectId(actorId);
    }
  }
  // After punch-out, CRM next follow-up is due immediately (sales-force style)
  const existing = meeting.nextAction || {};
  if (existing.status === "done" || existing.status === "skipped") return;
  meeting.nextAction = {
    title: existing.title || "Post-meeting follow-up",
    note:
      existing.note ||
      "Call / WhatsApp next step, update interest, and log CRM outcome.",
    dueAt: at,
    status: "due",
    completedAt: null,
    completedBy: null,
  };
};

const serializeNextAction = (na: any) => {
  if (!na) return null;
  const dueAt = na.dueAt ? new Date(na.dueAt) : null;
  let status = String(na.status || "pending");
  if (
    dueAt &&
    !Number.isNaN(dueAt.getTime()) &&
    (status === "pending" || status === "due") &&
    dueAt.getTime() <= Date.now()
  ) {
    status = "due";
  }
  return {
    title: na.title || "Post-meeting follow-up",
    note: na.note || "",
    dueAt: na.dueAt || null,
    status,
    completedAt: na.completedAt || null,
    completedBy: asId(na.completedBy) || null,
    delayMinutes: 0,
    isDue: status === "due",
  };
};

const serializePunchProgress = (o: any) => {
  const gate = canPunchOutNow(o);
  const allowedAt = gate.allowedAt || punchOutAllowedAt(o.punchInAt);
  return {
    punchInAt: o.punchInAt || null,
    punchInBy: asId(o.punchInBy) || null,
    punchOutAt: o.punchOutAt || null,
    punchOutBy: asId(o.punchOutBy) || null,
    punchOutWaitMinutes: FIELD_MEETING_PUNCH_OUT_WAIT_MINUTES,
    punchOutAllowedAt: allowedAt,
    canPunchOut: Boolean(o.punchOutAt) || gate.ok,
    punchOutWaitMinutesRemaining: o.punchOutAt ? 0 : gate.waitMinutes,
    /** End-user friendly stage for Salesforce-style progress */
    crmStage: o.punchOutAt
      ? o.nextAction?.status === "done" || o.nextAction?.status === "skipped"
        ? "closed"
        : "follow_up"
      : o.punchInAt
        ? gate.ok
          ? "ready_to_punch_out"
          : "waiting_punch_out"
        : "not_started",
  };
};

const serializeMeeting = (doc: any) => {
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const prepTasks = Array.isArray(o.prepTasks) ? o.prepTasks : [];
  const prepDone = prepTasks.filter((t: any) => t.completed).length;
  return {
    id: String(o._id),
    _id: String(o._id),
    title: o.title || "",
    meetingType: o.meetingType,
    meetingPlace: o.meetingPlace || null,
    mode: o.mode,
    status: o.status,
    scheduledStart: o.scheduledStart,
    scheduledEnd: o.scheduledEnd,
    ownerUserId: asId(o.ownerUserId),
    createdBy: asId(o.createdBy),
    client: {
      id: asId(o.client?.contactId) || asId(o.client?.userId) || null,
      userId: asId(o.client?.userId) || null,
      contactId: asId(o.client?.contactId) || null,
      name: o.client?.name || "",
      company: o.client?.company || "",
      phone: o.client?.phone || "",
      email: o.client?.email || "",
      title: o.client?.title || "",
      roleName: o.client?.roleName || "owner",
      createdInline: Boolean(o.client?.createdInline),
      source: o.client?.source || (o.client?.contactId ? "meeting_contact" : "platform_user"),
    },
    people: (Array.isArray(o.people) ? o.people : []).map((p: any) => ({
      id: asId(p._id) || asId(p.contactId) || asId(p.userId) || "",
      userId: asId(p.userId) || null,
      contactId: asId(p.contactId) || null,
      name: p.name || "",
      company: p.company || "",
      phone: p.phone || "",
      email: p.email || "",
      title: p.title || "",
      roleName: p.roleName || "owner",
      isPrimary: Boolean(p.isPrimary),
      createdInline: Boolean(p.createdInline),
      source: p.source || (p.contactId ? "meeting_contact" : "platform_user"),
    })),
    location: {
      state: o.location?.state || "",
      city: o.location?.city || "",
      locality: o.location?.locality || "",
      address: o.location?.address || "",
    },
    linkedProperty: o.linkedProperty || null,
    objective: o.objective || "",
    notes: o.notes || "",
    outcome: o.outcome || "",
    loggingMode: o.loggingMode || "scheduled",
    visitConfirmed: Boolean(o.visitConfirmed),
    visitConfirmedAt: o.visitConfirmedAt || null,
    visitConfirmedBy: asId(o.visitConfirmedBy) || null,
    ...serializePunchProgress(o),
    nextAction: serializeNextAction(o.nextAction),
    prepTasks: prepTasks.map((t: any) => ({
      id: String(t._id || t.id || t.key),
      key: t.key || "",
      title: t.title,
      description: t.description || "",
      completed: Boolean(t.completed),
      completedAt: t.completedAt || null,
    })),
    prepCompletedCount: prepDone,
    prepTotalCount: prepTasks.length,
    wizardStep: o.wizardStep || 1,
    visibility: Array.isArray(o.visibilityChain) ? o.visibilityChain : [],
    visibilityChain: Array.isArray(o.visibilityChain) ? o.visibilityChain : [],
    cancelledReason: o.cancelledReason || "",
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
};

const resolveOwnerId = async (req: AuthRequest, bodyOwner?: string) => {
  const actorId = String(req.user?.sub || req.user?.id || "");
  const role = canonicalFieldMeetingRole(req.user?.roleName);
  if (role === "sales_executive" || role === "sales_agent") {
    return actorId;
  }
  const requested = String(bodyOwner || "").trim();
  if (requested && mongoose.Types.ObjectId.isValid(requested)) {
    const ok = await actorCanAccessMeeting(actorId, req.user?.roleName, requested);
    if (!ok) return null;
    return requested;
  }
  return actorId;
};

const normalizePhone = (phone: string) => {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits) return `+${digits}`;
  return "";
};

const mapClientType = (intent: string) => {
  const v = String(intent || "").trim().toLowerCase();
  if (v === "agent") return "agent";
  if (v === "builder") return "builder";
  if (v === "other") return "other";
  // "user" / "owner" → owner label in meeting book
  return "owner";
};

/**
 * Upsert into FieldMeetingContact only — never creates Users / credentials / KYC.
 */
async function upsertMeetingContact(
  actorId: string,
  ownerId: string,
  payload: any,
) {
  const name = String(payload?.name || "").trim();
  const email = String(payload?.email || "").trim().toLowerCase();
  const company = String(payload?.company || "").trim();
  const phoneToSave = normalizePhone(payload?.phone || "");
  const clientType = mapClientType(
    payload?.roleIntent || payload?.roleName || payload?.clientType || "owner",
  );
  const title = String(payload?.title || payload?.jobTitle || "").trim();
  const state = String(payload?.state || "").trim();
  const city = String(payload?.city || "").trim();
  const locality = String(payload?.locality || "").trim();

  if (!name || name.length < 2) {
    throw new Error("Person name is required");
  }

  const ownerOid = new mongoose.Types.ObjectId(ownerId);
  const or: Record<string, string>[] = [];
  if (phoneToSave) or.push({ phone: phoneToSave });
  if (email) or.push({ email });

  let contact =
    or.length > 0
      ? await FieldMeetingContact.findOne({
          ownerUserId: ownerOid,
          $or: or,
        })
      : await FieldMeetingContact.findOne({
          ownerUserId: ownerOid,
          name,
          company: company || "",
          title: title || "",
        });

  if (contact) {
    contact.name = name || contact.name;
    if (company) contact.company = company;
    if (phoneToSave) contact.phone = phoneToSave;
    if (email) contact.email = email;
    if (title) contact.title = title;
    contact.clientType = clientType as any;
    if (state) contact.state = state;
    if (city) contact.city = city;
    if (locality) contact.locality = locality;
    await contact.save();
    return { contact, created: false };
  }

  contact = await FieldMeetingContact.create({
    ownerUserId: ownerOid,
    createdBy: new mongoose.Types.ObjectId(actorId),
    name,
    phone: phoneToSave,
    email,
    company,
    title,
    clientType,
    state,
    city,
    locality,
    source: "field_meeting_create",
    meetingIds: [],
    meetingCount: 0,
  });

  return { contact, created: true };
}

async function linkMeetingToContact(contactId: string, meetingId: string, when: Date) {
  if (!contactId || !meetingId) return;
  const contact = await FieldMeetingContact.findByIdAndUpdate(
    contactId,
    {
      $addToSet: { meetingIds: new mongoose.Types.ObjectId(meetingId) },
      $set: { lastMeetingAt: when },
    },
    { new: true },
  );
  if (contact) {
    contact.meetingCount = Array.isArray(contact.meetingIds)
      ? contact.meetingIds.length
      : 0;
    await contact.save();
  }
}

export const listFieldMeetings = async (req: AuthRequest, res: Response) => {
  try {
    if (!assertStaff(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const actorId = String(req.user?.sub || req.user?.id || "");
    const visible = await getVisibleOwnerIds(actorId, req.user?.roleName);

    const filter: Record<string, any> = {};
    if (visible !== "all") {
      filter.ownerUserId = {
        $in: visible.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    const status = String(req.query.status || "").trim().toLowerCase();
    if (status && status !== "all" && FIELD_MEETING_STATUSES.includes(status as any)) {
      filter.status = status;
    }

    const ownerUserId = String(req.query.ownerUserId || "").trim();
    if (ownerUserId && mongoose.Types.ObjectId.isValid(ownerUserId)) {
      if (visible !== "all" && !visible.includes(ownerUserId)) {
        return res.status(403).json({ message: "Cannot view this owner's meetings" });
      }
      filter.ownerUserId = new mongoose.Types.ObjectId(ownerUserId);
    }

    const from = parseLocalDay(req.query.from as string, false);
    const to = parseLocalDay(req.query.to as string, true);
    if (from || to) {
      filter.scheduledStart = {};
      if (from) filter.scheduledStart.$gte = from;
      if (to) filter.scheduledStart.$lte = to;
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      // Newest meetings first (recently created), then latest schedule time.
      FieldMeeting.find(filter)
        .sort({ createdAt: -1, scheduledStart: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FieldMeeting.countDocuments(filter),
    ]);

    // Today prep tasks for actor-owned meetings
    const todayFrom = parseLocalDay(
      new Date().toISOString().slice(0, 10),
      false,
    )!;
    const todayTo = parseLocalDay(new Date().toISOString().slice(0, 10), true)!;
    const todayFilter: Record<string, any> = {
      ownerUserId:
        visible === "all"
          ? filter.ownerUserId || { $exists: true }
          : { $in: (visible as string[]).map((id) => new mongoose.Types.ObjectId(id)) },
      scheduledStart: { $gte: todayFrom, $lte: todayTo },
      status: { $nin: ["cancelled", "draft"] },
    };
    if (filter.ownerUserId) todayFilter.ownerUserId = filter.ownerUserId;

    const todayMeetings = await FieldMeeting.find(todayFilter)
      .sort({ scheduledStart: 1 })
      .limit(40)
      .lean();

    const prepTasks = todayMeetings.flatMap((m: any) =>
      (m.prepTasks || []).map((t: any) => ({
        id: String(t._id),
        meetingId: String(m._id),
        meetingClient: m.client?.name || "",
        key: t.key,
        title: t.title,
        description: t.description || "",
        completed: Boolean(t.completed),
        scheduledStart: m.scheduledStart,
      })),
    );

    return res.json({
      success: true,
      data: {
        meetings: rows.map(serializeMeeting),
        todayMeetings: todayMeetings.map(serializeMeeting),
        prepTasks,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 0,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to list field meetings",
      error: error.message,
    });
  }
};

export const getFieldMeetingById = async (req: AuthRequest, res: Response) => {
  try {
    if (!assertStaff(req)) return res.status(403).json({ message: "Forbidden" });
    const id = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid meeting id" });
    }
    const meeting = await FieldMeeting.findById(id).lean();
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });

    const actorId = String(req.user?.sub || req.user?.id || "");
    const ok = await actorCanAccessMeeting(
      actorId,
      req.user?.roleName,
      asId(meeting.ownerUserId),
    );
    if (!ok) return res.status(403).json({ message: "Forbidden" });

    return res.json({ success: true, data: serializeMeeting(meeting) });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const createFieldMeeting = async (req: AuthRequest, res: Response) => {
  try {
    if (!assertStaff(req)) return res.status(403).json({ message: "Forbidden" });
    const actorId = String(req.user?.sub || req.user?.id || "");
    const body = req.body || {};
    const asDraft = Boolean(body.draft || body.status === "draft");

    const ownerId = await resolveOwnerId(req, body.ownerUserId);
    if (!ownerId) {
      return res.status(403).json({ message: "Invalid meeting owner" });
    }

    const locationHint = {
      state: body.location?.state,
      city: body.location?.city,
      locality: body.location?.locality,
    };

    /** Normalize incoming people list (N attendees: CEO, managers, heads, …) */
    const rawPeople: any[] = [];
    if (Array.isArray(body.people) && body.people.length) {
      rawPeople.push(...body.people);
    }
    if (Array.isArray(body.createPeople) && body.createPeople.length) {
      rawPeople.push(
        ...body.createPeople.map((p: any) => ({ ...p, _create: true })),
      );
    }
    // Legacy single-client payloads
    if (!rawPeople.length && body.createClient && typeof body.createClient === "object") {
      rawPeople.push({ ...body.createClient, _create: true, isPrimary: true });
    }
    if (!rawPeople.length && (body.client || body.clientUserId || body.clientContactId)) {
      rawPeople.push({
        ...(body.client || {}),
        userId: body.clientUserId || body.client?.userId,
        contactId: body.clientContactId || body.client?.contactId,
        isPrimary: true,
      });
    }

    const peopleSnaps: any[] = [];
    for (let i = 0; i < rawPeople.length; i += 1) {
      const row = rawPeople[i] || {};
      const wantCreate =
        Boolean(row._create) ||
        Boolean(row.create) ||
        (!row.userId && !row.contactId && row.name);

      if (wantCreate && row.name) {
        if (!String(row.phone || "").trim() && !String(row.email || "").trim()) {
          // Allow name-only attendees at a company meeting (CEO without phone yet)
          if (String(row.name).trim().length < 2) continue;
        }
        const { contact } = await upsertMeetingContact(actorId, ownerId, {
          ...row,
          ...locationHint,
          state: row.state || locationHint.state,
          city: row.city || locationHint.city,
          locality: row.locality || locationHint.locality,
        });
        peopleSnaps.push({
          userId: null,
          contactId: contact._id,
          name: contact.name,
          company: contact.company || row.company || "",
          phone: contact.phone || "",
          email: contact.email || "",
          title: contact.title || row.title || "",
          roleName: contact.clientType || "owner",
          isPrimary: Boolean(row.isPrimary) || i === 0,
          createdInline: true,
          source: "meeting_contact",
        });
        continue;
      }

      const contactId = String(row.contactId || "").trim();
      const userId = String(row.userId || "").trim();

      if (contactId && mongoose.Types.ObjectId.isValid(contactId)) {
        const contact = await FieldMeetingContact.findById(contactId).lean();
        if (!contact) continue;
        peopleSnaps.push({
          userId: null,
          contactId: contact._id,
          name: contact.name,
          company: contact.company || "",
          phone: contact.phone || "",
          email: contact.email || "",
          title: contact.title || row.title || "",
          roleName: contact.clientType || "owner",
          isPrimary: Boolean(row.isPrimary) || i === 0,
          createdInline: true,
          source: "meeting_contact",
        });
        continue;
      }

      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        const user = await User.findById(userId)
          .select("name phone email companyName roleId")
          .populate("roleId", "name")
          .lean();
        if (!user) continue;
        peopleSnaps.push({
          userId: user._id,
          contactId: null,
          name: user.name || row.name || "",
          company: (user as any).companyName || row.company || "",
          phone: user.phone || "",
          email: user.email || "",
          title: row.title || "",
          roleName: (user.roleId as any)?.name || "owner",
          isPrimary: Boolean(row.isPrimary) || i === 0,
          createdInline: false,
          source: "platform_user",
        });
        continue;
      }

      // Snapshot-only row (name + title) without phone/email
      if (String(row.name || "").trim()) {
        const { contact } = await upsertMeetingContact(actorId, ownerId, {
          name: row.name,
          phone: row.phone,
          email: row.email,
          company: row.company,
          title: row.title,
          roleIntent: row.roleIntent || row.roleName || "other",
          ...locationHint,
        });
        peopleSnaps.push({
          userId: null,
          contactId: contact._id,
          name: contact.name,
          company: contact.company || "",
          phone: contact.phone || "",
          email: contact.email || "",
          title: contact.title || row.title || "",
          roleName: contact.clientType || "other",
          isPrimary: Boolean(row.isPrimary) || i === 0,
          createdInline: true,
          source: "meeting_contact",
        });
      }
    }

    // Ensure exactly one primary
    if (peopleSnaps.length) {
      const hasPrimary = peopleSnaps.some((p) => p.isPrimary);
      if (!hasPrimary) peopleSnaps[0].isPrimary = true;
      else {
        let seen = false;
        for (const p of peopleSnaps) {
          if (p.isPrimary && !seen) {
            seen = true;
          } else {
            p.isPrimary = false;
          }
        }
      }
    }

    const clientSnap =
      peopleSnaps.find((p) => p.isPrimary) || peopleSnaps[0] || {
        userId: null,
        contactId: null,
        name: "",
        company: "",
        phone: "",
        email: "",
        title: "",
        roleName: "owner",
        createdInline: false,
        source: "meeting_contact",
      };

    const clientContactId = asId(clientSnap.contactId);
    const clientUserId = asId(clientSnap.userId);

    if (!asDraft && !peopleSnaps.length) {
      return res.status(400).json({
        message: "Add at least one person for this meeting (CEO, manager, owner, …)",
      });
    }

    const meetingType = (FIELD_MEETING_TYPES as readonly string[]).includes(
      String(body.meetingType || ""),
    )
      ? body.meetingType
      : "sales";

    const meetingPlace = normalizeMeetingPlace(String(meetingType), body.meetingPlace);

    if (
      !asDraft &&
      ["sales", "marketing", "service_meeting", "office_meeting"].includes(
        String(meetingType),
      ) &&
      !meetingPlace
    ) {
      return res.status(400).json({
        message: "Select meeting place: On site, Off site, or Office",
      });
    }

    let start =
      body.scheduledStart
        ? new Date(body.scheduledStart)
        : combineDateTime(body.date, body.startTime);
    let end =
      body.scheduledEnd
        ? new Date(body.scheduledEnd)
        : combineDateTime(body.date, body.endTime);

    if (!start || Number.isNaN(start.getTime())) {
      if (asDraft) start = new Date();
      else return res.status(400).json({ message: "Valid start date/time required" });
    }
    if (!end || Number.isNaN(end.getTime())) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    if (end.getTime() <= start.getTime()) {
      return res.status(400).json({ message: "End time must be after start time" });
    }

    const remote = ["video_call", "phone_call"].includes(meetingType);
    const location = {
      state: remote ? "" : String(body.location?.state || "").trim(),
      city: remote ? "" : String(body.location?.city || "").trim(),
      locality: remote ? "" : String(body.location?.locality || "").trim(),
      address: String(body.location?.address || "").trim(),
    };

    if (!asDraft && !remote && !location.state) {
      return res.status(400).json({ message: "State is required for in-person meetings" });
    }

    const prepTasks =
      Array.isArray(body.prepTasks) && body.prepTasks.length
        ? body.prepTasks.map((t: any) => ({
            key: t.key || "",
            title: t.title || "Task",
            description: t.description || "",
            completed: Boolean(t.completed),
            completedAt: t.completed ? new Date() : null,
          }))
        : defaultPrepTasks();

    const loggingModeRaw = String(body.loggingMode || "scheduled").toLowerCase();
    const loggingMode = (FIELD_MEETING_LOGGING_MODES as readonly string[]).includes(
      loggingModeRaw,
    )
      ? loggingModeRaw
      : "scheduled";

    const visitConfirmed = Boolean(body.visitConfirmed);
    if (!asDraft && loggingMode === "already_visited" && !visitConfirmed) {
      return res.status(400).json({
        message:
          "Confirm that this visit already took place before logging an already-visited meeting",
      });
    }

    // Walk-in / already-visited: prep is N/A — mark tasks complete for CRM hygiene
    const effectivePrep =
      !asDraft && (loggingMode === "walk_in" || loggingMode === "already_visited")
        ? prepTasks.map((t: any) => ({
            ...t,
            completed: true,
            completedAt: t.completedAt || new Date(),
          }))
        : prepTasks;

    const allPrepDone = effectivePrep.every((t: any) => t.completed);
    let status = String(body.status || "").toLowerCase();
    if (!FIELD_MEETING_STATUSES.includes(status as any)) {
      if (asDraft) status = "draft";
      else if (loggingMode === "already_visited") status = "completed";
      else if (loggingMode === "walk_in") status = "confirmed";
      else status = allPrepDone ? "planned" : "prep_pending";
    }

    const outcome = String(body.outcome || "").trim();
    if (!asDraft && loggingMode === "already_visited" && !outcome) {
      return res.status(400).json({
        message: "Add a short visit outcome when logging an already-visited meeting",
      });
    }

    const visibilityChain = await buildVisibilityChain(ownerId);
    const mode =
      meetingType === "video_call"
        ? "video"
        : meetingType === "phone_call"
          ? "phone"
          : "in_person";

    const meetingPayload: Record<string, unknown> = {
      title: String(body.title || clientSnap.name || "Field meeting").trim(),
      meetingType,
      mode: body.mode || mode,
      status,
      loggingMode,
      visitConfirmed: loggingMode === "already_visited" ? visitConfirmed : false,
      visitConfirmedAt:
        loggingMode === "already_visited" && visitConfirmed ? new Date() : null,
      visitConfirmedBy:
        loggingMode === "already_visited" && visitConfirmed
          ? new mongoose.Types.ObjectId(actorId)
          : null,
      scheduledStart: start,
      scheduledEnd: end,
      ownerUserId: new mongoose.Types.ObjectId(ownerId),
      createdBy: new mongoose.Types.ObjectId(actorId),
      client: {
        ...clientSnap,
        userId:
          clientUserId && mongoose.Types.ObjectId.isValid(clientUserId)
            ? new mongoose.Types.ObjectId(clientUserId)
            : clientSnap.userId || null,
        contactId:
          clientContactId && mongoose.Types.ObjectId.isValid(clientContactId)
            ? new mongoose.Types.ObjectId(clientContactId)
            : clientSnap.contactId || null,
      },
      people: peopleSnaps,
      location,
      linkedProperty: body.linkedProperty
        ? {
            id: String(body.linkedProperty.id || ""),
            name: String(body.linkedProperty.name || ""),
            category: String(body.linkedProperty.category || ""),
            location: String(body.linkedProperty.location || ""),
            priceLabel: String(body.linkedProperty.priceLabel || ""),
          }
        : null,
      objective: String(body.objective || "").trim(),
      notes: String(body.notes || "").trim(),
      outcome,
      prepTasks: effectivePrep,
      wizardStep: Number(body.wizardStep) || (asDraft ? 1 : 5),
      visibilityChain,
    };

    // Only set when valid — never persist "" (breaks mongoose enum)
    if (meetingPlace) {
      meetingPayload.meetingPlace = meetingPlace;
    }

    // CRM punch: create = punch in. Punch out only after 15m (except already_visited).
    if (!asDraft) {
      const now = new Date();
      meetingPayload.punchInAt = now;
      if (actorId && mongoose.Types.ObjectId.isValid(actorId)) {
        meetingPayload.punchInBy = new mongoose.Types.ObjectId(actorId);
      }
      if (status === "completed" && loggingMode === "already_visited") {
        meetingPayload.punchOutAt = now;
        if (actorId && mongoose.Types.ObjectId.isValid(actorId)) {
          meetingPayload.punchOutBy = new mongoose.Types.ObjectId(actorId);
        }
        meetingPayload.nextAction = {
          title: "Post-meeting follow-up",
          note: "Call / WhatsApp next step, update interest, and log CRM outcome.",
          dueAt: now,
          status: "due",
          completedAt: null,
          completedBy: null,
        };
      } else if (status === "completed" && loggingMode !== "already_visited") {
        // Force non-completed until wait passes — create as planned/confirmed instead
        meetingPayload.status =
          loggingMode === "walk_in" ? "confirmed" : status === "completed" ? "planned" : status;
      }
    }

    const meeting = await FieldMeeting.create(meetingPayload);

    const contactIds = [
      ...new Set(
        peopleSnaps
          .map((p) => asId(p.contactId))
          .filter((id) => id && mongoose.Types.ObjectId.isValid(id)),
      ),
    ];
    await Promise.all(
      contactIds.map((id) =>
        linkMeetingToContact(id, String(meeting._id), meeting.scheduledStart),
      ),
    );

    const successMessage = asDraft
      ? "Draft saved"
      : loggingMode === "already_visited"
        ? "Visit logged as completed — CRM follow-up is due now"
        : loggingMode === "walk_in"
          ? "Walk-in confirmed — punched in. Wait 15 minutes, then punch out"
          : "Meeting created — punched in. Wait 15 minutes, then punch out";

    return res.status(201).json({
      success: true,
      message: successMessage,
      data: serializeMeeting(meeting),
    });
  } catch (error: any) {
    return res.status(400).json({
      message: error.message || "Failed to create meeting",
    });
  }
};

export const updateFieldMeeting = async (req: AuthRequest, res: Response) => {
  try {
    if (!assertStaff(req)) return res.status(403).json({ message: "Forbidden" });
    const id = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid meeting id" });
    }
    const meeting = await FieldMeeting.findById(id);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });

    const actorId = String(req.user?.sub || req.user?.id || "");
    const ok = await actorCanAccessMeeting(
      actorId,
      req.user?.roleName,
      asId(meeting.ownerUserId),
    );
    if (!ok) return res.status(403).json({ message: "Forbidden" });

    const body = req.body || {};
    if (
      body.meetingType &&
      (FIELD_MEETING_TYPES as readonly string[]).includes(String(body.meetingType))
    ) {
      meeting.meetingType = body.meetingType;
    }
    if (body.meetingPlace !== undefined || body.meetingType) {
      const nextType = String(body.meetingType || meeting.meetingType || "sales");
      const place = normalizeMeetingPlace(
        nextType,
        body.meetingPlace !== undefined ? body.meetingPlace : meeting.meetingPlace,
      );
      if (place) meeting.meetingPlace = place;
      else meeting.set("meetingPlace", null);
    }
    if (body.status != null) {
      const nextStatus = String(body.status || "").toLowerCase();
      if (nextStatus === "cancelled") {
        return res.status(400).json({
          message:
            "Cancel is disabled for field meetings. Mark completed, confirmed, or rescheduled instead.",
        });
      }
      if ((FIELD_MEETING_STATUSES as readonly string[]).includes(nextStatus as any)) {
        const prevStatus = String(meeting.status || "");
        if (nextStatus === "completed" && prevStatus !== "completed") {
          if (!meeting.punchInAt) applyPunchIn(meeting, actorId);
          const gate = canPunchOutNow(meeting);
          if (!gate.ok) {
            return res.status(400).json({
              message: `Wait ${gate.waitMinutes} more minute(s) after punch in before punch out (CRM ${FIELD_MEETING_PUNCH_OUT_WAIT_MINUTES}-minute field visit).`,
              punchOutAllowedAt: gate.allowedAt,
              waitMinutes: gate.waitMinutes,
            });
          }
          meeting.status = nextStatus as any;
          applyPunchOutAndNextAction(meeting, actorId);
        } else {
          meeting.status = nextStatus as any;
        }
      }
    }
    if (body.date || body.startTime || body.scheduledStart) {
      const start = body.scheduledStart
        ? new Date(body.scheduledStart)
        : combineDateTime(body.date || meeting.scheduledStart.toISOString().slice(0, 10), body.startTime);
      if (start && !Number.isNaN(start.getTime())) meeting.scheduledStart = start;
    }
    if (body.date || body.endTime || body.scheduledEnd) {
      const end = body.scheduledEnd
        ? new Date(body.scheduledEnd)
        : combineDateTime(
            body.date || meeting.scheduledStart.toISOString().slice(0, 10),
            body.endTime,
          );
      if (end && !Number.isNaN(end.getTime())) meeting.scheduledEnd = end;
    }
    if (meeting.scheduledEnd.getTime() <= meeting.scheduledStart.getTime()) {
      return res.status(400).json({ message: "End time must be after start time" });
    }
    if (body.location) {
      meeting.location = {
        state: String(body.location.state ?? meeting.location?.state ?? ""),
        city: String(body.location.city ?? meeting.location?.city ?? ""),
        locality: String(body.location.locality ?? meeting.location?.locality ?? ""),
        address: String(body.location.address ?? meeting.location?.address ?? ""),
      } as any;
    }
    if (body.notes != null) meeting.notes = String(body.notes);
    if (body.objective != null) meeting.objective = String(body.objective);
    if (body.outcome != null) meeting.outcome = String(body.outcome);
    if (body.cancelledReason != null) meeting.cancelledReason = String(body.cancelledReason);
    if (body.linkedProperty !== undefined) {
      meeting.linkedProperty = body.linkedProperty || null;
    }
    if (Array.isArray(body.prepTasks)) {
      meeting.prepTasks = body.prepTasks as any;
    }
    if (body.wizardStep != null) meeting.wizardStep = Number(body.wizardStep) || 1;

    await meeting.save();
    return res.json({
      success: true,
      message: "Meeting updated",
      data: serializeMeeting(meeting),
    });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

/** Mark CRM next action done/skipped after punch-out (+15 min follow-up). */
export const completeFieldMeetingNextAction = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!assertStaff(req)) return res.status(403).json({ message: "Forbidden" });
    const id = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid meeting id" });
    }
    const meeting = await FieldMeeting.findById(id);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });

    const actorId = String(req.user?.sub || req.user?.id || "");
    const ok = await actorCanAccessMeeting(
      actorId,
      req.user?.roleName,
      asId(meeting.ownerUserId),
    );
    if (!ok) return res.status(403).json({ message: "Forbidden" });

    if (!meeting.punchOutAt || !meeting.nextAction) {
      return res.status(400).json({
        message: "Complete the meeting (punch out) before closing the next action",
      });
    }

    const actionStatus = String(req.body?.status || "done").toLowerCase();
    const finalStatus = actionStatus === "skipped" ? "skipped" : "done";
    const note = String(req.body?.note || meeting.nextAction.note || "").trim();

    meeting.nextAction = {
      title: meeting.nextAction.title || "Post-meeting follow-up",
      note,
      dueAt: meeting.nextAction.dueAt,
      status: finalStatus as any,
      completedAt: new Date(),
      completedBy:
        actorId && mongoose.Types.ObjectId.isValid(actorId)
          ? new mongoose.Types.ObjectId(actorId)
          : null,
    } as any;

    await meeting.save();
    return res.json({
      success: true,
      message:
        finalStatus === "skipped"
          ? "Next action skipped"
          : "Next action completed",
      data: serializeMeeting(meeting),
    });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

export const updatePrepTask = async (req: AuthRequest, res: Response) => {
  try {
    if (!assertStaff(req)) return res.status(403).json({ message: "Forbidden" });
    const id = String(req.params.id || "");
    const taskId = String(req.params.taskId || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid meeting id" });
    }
    const meeting = await FieldMeeting.findById(id);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });

    const actorId = String(req.user?.sub || req.user?.id || "");
    const ok = await actorCanAccessMeeting(
      actorId,
      req.user?.roleName,
      asId(meeting.ownerUserId),
    );
    if (!ok) return res.status(403).json({ message: "Forbidden" });

    const task = meeting.prepTasks.id(taskId as any) ||
      meeting.prepTasks.find((t: any) => String(t._id) === taskId || t.key === taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const completed = Boolean(req.body?.completed);
    (task as any).completed = completed;
    (task as any).completedAt = completed ? new Date() : null;

    const allDone = meeting.prepTasks.every((t: any) => t.completed);
    if (meeting.status === "prep_pending" && allDone) {
      meeting.status = "planned";
    } else if (
      ["planned", "confirmed"].includes(meeting.status) &&
      !allDone
    ) {
      meeting.status = "prep_pending";
    }

    await meeting.save();
    return res.json({ success: true, data: serializeMeeting(meeting) });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

export const getFieldMeetingTerritory = async (req: AuthRequest, res: Response) => {
  try {
    if (!assertStaff(req)) return res.status(403).json({ message: "Forbidden" });
    const actorId = String(req.user?.sub || req.user?.id || "");
    const ownerId = String(req.query.ownerUserId || actorId);
    const ok = await actorCanAccessMeeting(actorId, req.user?.roleName, ownerId);
    if (!ok) return res.status(403).json({ message: "Forbidden" });

    const user = await User.findById(ownerId)
      .select("name state city locality workingLocations")
      .lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const territories = Array.isArray(user.workingLocations)
      ? user.workingLocations
      : [];
    const labels = territories.length
      ? territories.map((t: any) => {
          if (!t.city) return `${t.state} (entire state)`;
          if (!t.locality) return `${t.city}, ${t.state}`;
          return `${t.locality}, ${t.city}, ${t.state}`;
        })
      : user.state
        ? [`${user.locality || user.city || user.state}`]
        : [];

    return res.json({
      success: true,
      data: {
        ownerUserId: ownerId,
        homeLocation: {
          state: user.state || "",
          city: user.city || "",
          locality: user.locality || "",
        },
        workingLocations: territories,
        labels,
        primaryLabel: labels[0] || user.state || "Territory not assigned",
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const getFieldMeetingTeamSummary = async (req: AuthRequest, res: Response) => {
  try {
    if (!assertStaff(req)) return res.status(403).json({ message: "Forbidden" });
    const actorId = String(req.user?.sub || req.user?.id || "");
    const role = canonicalFieldMeetingRole(req.user?.roleName);
    if (role === "sales_executive" || role === "sales_agent") {
      return res.status(403).json({ message: "Team summary is for managers" });
    }

    const visible = await getVisibleOwnerIds(actorId, req.user?.roleName);
    const ownerFilter =
      visible === "all"
        ? {}
        : {
            ownerUserId: {
              $in: visible.map((id) => new mongoose.Types.ObjectId(id)),
            },
          };

    const from = parseLocalDay(req.query.from as string, false);
    const to = parseLocalDay(req.query.to as string, true);
    const match: Record<string, any> = { ...ownerFilter };
    if (from || to) {
      match.scheduledStart = {};
      if (from) match.scheduledStart.$gte = from;
      if (to) match.scheduledStart.$lte = to;
    }

    const grouped = await FieldMeeting.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$ownerUserId",
          total: { $sum: 1 },
          planned: {
            $sum: { $cond: [{ $in: ["$status", ["planned", "confirmed", "prep_pending"]] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
          prepPending: {
            $sum: { $cond: [{ $eq: ["$status", "prep_pending"] }, 1, 0] },
          },
        },
      },
    ]);

    const ownerIds = grouped.map((g) => g._id);
    const owners = await User.find({ _id: { $in: ownerIds } })
      .select("name email phone roleId")
      .populate("roleId", "name label")
      .lean();
    const ownerMap = new Map(owners.map((u) => [String(u._id), u]));

    const team = grouped.map((g) => {
      const u: any = ownerMap.get(String(g._id)) || {};
      return {
        ownerUserId: String(g._id),
        name: u.name || "Unknown",
        roleName: u.roleId?.name || "",
        roleLabel: u.roleId?.label || "",
        total: g.total,
        planned: g.planned,
        completed: g.completed,
        cancelled: g.cancelled,
        prepPending: g.prepPending,
      };
    });

    return res.json({
      success: true,
      data: {
        team,
        totals: {
          meetings: team.reduce((s, r) => s + r.total, 0),
          completed: team.reduce((s, r) => s + r.completed, 0),
          prepPending: team.reduce((s, r) => s + r.prepPending, 0),
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

/** Search FieldMeetingContact book (not Users / credentials). */
export const searchFieldMeetingContacts = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!assertStaff(req)) return res.status(403).json({ message: "Forbidden" });
    const actorId = String(req.user?.sub || req.user?.id || "");
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const ownerId = await resolveOwnerId(req, req.query.ownerUserId as string);
    if (!ownerId) return res.status(403).json({ message: "Forbidden" });

    // Allow managers to search contacts under a visible SE
    const visible = await getVisibleOwnerIds(actorId, req.user?.roleName);
    if (visible !== "all" && !visible.includes(ownerId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(safe, "i");
    const phoneDigits = q.replace(/\D/g, "");

    const filter: Record<string, any> = {
      ownerUserId: new mongoose.Types.ObjectId(ownerId),
      $or: [{ name: regex }, { email: regex }, { company: regex }, { phone: regex }],
    };
    if (phoneDigits.length >= 4) {
      filter.$or.push({ phone: new RegExp(phoneDigits.slice(-10)) });
    }

    const rows = await FieldMeetingContact.find(filter)
      .sort({ lastMeetingAt: -1, updatedAt: -1 })
      .limit(20)
      .lean();

    return res.json({
      success: true,
      data: rows.map((c: any) => ({
        id: String(c._id),
        _id: String(c._id),
        contactId: String(c._id),
        name: c.name,
        phone: c.phone || "",
        email: c.email || "",
        company: c.company || "",
        clientType: c.clientType || "owner",
        roleName: c.clientType || "owner",
        meetingCount: c.meetingCount || 0,
        source: "meeting_contact",
        state: c.state || "",
        city: c.city || "",
        locality: c.locality || "",
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};
