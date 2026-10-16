import { Request, RequestHandler, Response } from "express";
import {
  assignLead,
  createLead,
  deleteLeadService,
  deleteProjectLeadsService,
  getLeadById,
  getLeads,
  updateLeadStatus,
  updateLeadStatusService,
} from "../services/leadService";
import { LEAD_STATUSES, LeadCreateSchema } from "../zod/leadZod";
import { AuthRequest } from "../middlewares/authMiddleware";
import Lead from "../models/LeadModel";
import { PublicLeadSchemaZ, PublicPropertyLeadSchemaZ } from "../zod/publicLeadZod";
import { createPublicLead, createPublicPropertyLead } from "../services/publicLeadService";
import PublicLead from "../models/PublicLead";
import mongoose, { Types } from "mongoose";
import FeaturedProject from "../models/featurePropertiesModel";
import Residential from "../models/residentialModel";
import Commercial from "../models/commercialModel";
import LandPlot from "../models/landModel";
import Agricultural from "../models/agriculturalModel";
import User from "../models/userModel";
import Role from "../models/roleModel";
import * as XLSX from "xlsx";
import { getAdminLeadDashboard } from "../services/adminLeadService";
import {
  notifyOwnerAndAdmins,
  notifyProjectBrochureDownload,
  shouldSendHighTimeSpentPush,
} from "../services/pushNotificationService";
import { generateToken, verifyToken } from "../utils/jwt";
import { sendLeadImportSummaryWhatsApp, sendOtpWhatsApp, LeadImportAudience } from "../utils/whatsapp";
import {
  consumeVerifiedLeadPhone,
  generateLeadOtp,
  normalizeLeadPhone,
  saveLeadOtp,
  verifyLeadOtp,
} from "../utils/leadOtp";
import { buildLeadPropertySnapshot } from "../utils/leadPropertySnapshot";
import {
  archiveLeadById,
  archiveProjectLeads,
  listDeletedImportedLeads,
  listDeletedLeads,
  purgeAllDeletedLeads,
  purgeDeletedLead,
  resolveLeadActor,
} from "../services/deletedLeadArchive.service";
import {
  getLeadContactVisibility,
  isLeadContactVisibleToStaff,
  listLeadContactVisibilityHistory,
  setLeadContactVisibility,
} from "../services/leadContactVisibility.service";


const DEFAULT_VISIBLE_LEAD_LIMIT = 5;
const HIGH_TIME_SPENT_PUSH_THRESHOLD_MS = 60 * 1000;

const toNonNegativeInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
};

const getVisibleLeadLimitForPromotion = (promotion?: {
  type?: string | null;
  visibleLeadLimit?: number | null;
} | null) => {
  // Important: Number(null) === 0 in JS — do NOT treat missing limit as zero.
  const configuredLimit = toNonNegativeInt(promotion?.visibleLeadLimit);
  if (configuredLimit !== null) {
    return configuredLimit;
  }

  const type = String(promotion?.type || "normal").toLowerCase();
  if (!type || type === "normal") return 0;

  // Promoted but limit not set yet — allow a small default window
  return DEFAULT_VISIBLE_LEAD_LIMIT;
};

const maskPhone = (phone?: string) => {
  const value = String(phone ?? "").trim();
  if (!value) return "";
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 2)}${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`;
};

const maskEmail = (email?: string) => {
  const value = String(email ?? "").trim();
  if (!value) return "";

  const [name = "", domain = ""] = value.split("@");
  if (!domain) {
    return name.length <= 2 ? `${name.slice(0, 1)}***` : `${name.slice(0, 2)}***`;
  }

  const visibleName = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${visibleName}***@${domain}`;
};

const canBypassLeadOtpVerification = async (
  actorUserId: string,
  phone: string,
) => {
  if (!actorUserId || !Types.ObjectId.isValid(actorUserId) || !phone) {
    return false;
  }

  const user = await User.findById(actorUserId).select("phone").lean();
  if (!user) {
    return false;
  }

  return normalizeLeadPhone((user as any)?.phone) === phone;
};

const createLeadOtpAutoLoginPayload = async (userDoc: any) => {
  if (!userDoc?._id) {
    return null;
  }

  const roleDoc = userDoc.roleId
    ? await Role.findById(userDoc.roleId).select("name permissions").lean()
    : null;

  const payload: Record<string, unknown> = {
    sub: String(userDoc._id),
    _id: userDoc._id,
    email: userDoc.email,
    name: userDoc.name,
    companyName: userDoc.companyName,
    roleId: roleDoc?._id ? String(roleDoc._id) : undefined,
    roleName: roleDoc?.name,
    permissions: roleDoc?.permissions ?? [],
    accountStatus: userDoc.accountStatus,
  };

  if (userDoc.phone) {
    payload.phone = Number(userDoc.phone);
  }

  const lastLoginAt = new Date();
  await User.findByIdAndUpdate(userDoc._id, {
    $set: { lastLoginAt },
  });

  return {
    token: generateToken(payload as any),
    user: {
      _id: String(userDoc._id),
      name: userDoc.name,
      email: userDoc.email,
      phone: userDoc.phone,
      roleName: roleDoc?.name,
      accountStatus: userDoc.accountStatus,
    },
  };
};

const isKnownLeadPhone = async (phone: string) => {
  if (!phone) {
    return false;
  }

  const [existingUser, existingPublicLead] = await Promise.all([
    User.findOne({ phone }).select("_id").lean(),
    PublicLead.findOne({ phone }).select("_id").lean(),
  ]);

  return Boolean(existingUser || existingPublicLead);
};

const ensureNotOwnerPhoneForPublicPropertyLead = async (params: {
  projectId: string;
  propertyType: string;
  phone: string;
}) => {
  const { projectId, propertyType, phone } = params;

  const propertyModelMap: Record<string, any> = {
    featuredprojects: FeaturedProject,
    residentials: Residential,
    commercials: Commercial,
    agriculturals: Agricultural,
    landplots: LandPlot,
  };

  const PropertyModel = propertyModelMap[propertyType];
  if (!PropertyModel) {
    return;
  }

  const property = await PropertyModel.findById(projectId)
    .populate("createdBy", "phone")
    .select("createdBy")
    .lean();

  if (!property) {
    return;
  }

  const ownerPhone = normalizeLeadPhone((property as any)?.createdBy?.phone);
  if (ownerPhone && ownerPhone === phone) {
    const error: any = new Error(
      propertyType === "featuredprojects"
        ? "You cannot submit a lead for your own project"
        : "You cannot submit a lead for your own property",
    );
    error.statusCode = 403;
    throw error;
  }
};

const getLeadDisplayTimestamp = (lead: any) => {
  const value = lead?.sourceCreatedAt || lead?.createdAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
};

const sortLeadsForDisplay = (leads: any[]) =>
  [...leads].sort(
    (a, b) => getLeadDisplayTimestamp(b) - getLeadDisplayTimestamp(a)
  );

const maskLeadsForPromotion = (
  leads: any[],
  promotion?: { type?: string | null; visibleLeadLimit?: number | null } | null,
) => {
  const sortedLeads = sortLeadsForDisplay(leads);
  const visibleLeadLimit = getVisibleLeadLimitForPromotion(promotion);

  return sortedLeads.map((lead, index) => {
    const contactMasked = index >= visibleLeadLimit;

    if (!contactMasked) {
      return { ...lead, contactMasked: false };
    }

    return {
      ...lead,
      phone: maskPhone(lead.phone),
      email: maskEmail(lead.email),
      contactMasked: true,
    };
  });
};
const sendCSV = (leads: any[], res: Response) => {
  const header = [
    "Full Name",
    "Phone Number",
    "Email",
    "Lead Created Time",
    "Planning To Purchase",
    "Budget Range",
    "Status",
    "System Date",
  ].join(",") + "\n";

  const csvValue = (value: unknown) => {
    const stringValue = value == null ? "" : String(value);
    if (!/[",\n\r]/.test(stringValue)) return stringValue;
    return `"${stringValue.replace(/"/g, '""')}"`;
  };

  const formatDate = (value?: string | Date) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-IN");
  };

  const rows = leads
    .map(
      (l) =>
        [
          l.name,
          l.phone,
          l.email,
          formatDate(l.sourceCreatedAt),
          l.purchaseTimeline,
          l.budgetRange,
          l.status,
          formatDate(l.createdAt),
        ]
          .map(csvValue)
          .join(",")
    )
    .join("\n");

  const csv = header + rows;

  res.header("Content-Type", "text/csv");
  res.attachment("leads.csv");
  res.send(csv);
};

const csvHeaderAliases: Record<string, string> = {
  full_name: "name",
  fullname: "name",
  contact: "phone",
  contact_number: "phone",
  contactnumber: "phone",
  mobile: "phone",
  mobile_number: "phone",
  mobilenumber: "phone",
  phone_number: "phone",
  phonenumber: "phone",
  created_time: "sourceCreatedAt",
  createdtime: "sourceCreatedAt",
  lead_created_time: "sourceCreatedAt",
  when_are_you_planning_to_purchase: "purchaseTimeline",
  when_are_you_planning_to_purchase_: "purchaseTimeline",
  planning_to_purchase: "purchaseTimeline",
  purchase_timeline: "purchaseTimeline",
  what_is_your_budget_range: "budgetRange",
  what_is_your_budget_range_: "budgetRange",
  budget_range: "budgetRange",
  remarks: "message",
};

const normalizeCsvHeader = (value: string) => {
  const key = value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return csvHeaderAliases[key] ?? key;
};

const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

const parseCsvRows = (buffer: Buffer) => {
  const lines = buffer
    .toString("utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) return [];

  const headerLine = lines[0];
  if (!headerLine) return [];

  const headers = parseCsvLine(headerLine).map((header) =>
    header.replace(/^\uFEFF/, "").trim()
  );

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = cells[index]?.trim() ?? "";
      return row;
    }, {});
  });
};

const parseSpreadsheetRows = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  return rows.map((row: Record<string, unknown>) =>
    Object.entries(row).reduce<Record<string, string>>((normalizedRow, [header, value]) => {
      normalizedRow[header.trim()] = value == null ? "" : String(value).trim();
      return normalizedRow;
    }, {})
  );
};

const parseLeadImportRows = (file: Express.Multer.File) => {
  const filename = file.originalname.toLowerCase();
  const mimeType = file.mimetype.toLowerCase();
  const isExcel =
    filename.endsWith(".xlsx") ||
    filename.endsWith(".xls") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel");

  return isExcel ? parseSpreadsheetRows(file.buffer) : parseCsvRows(file.buffer);
};

const normalizeLeadStatus = (value?: string) => {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, (typeof LEAD_STATUSES)[number]> = {
    new: "new_lead",
    intrested: "interested",
    not_intrested: "not_interested",
    contacted: "interested",
    approved: "interested",
    rejected: "not_interested",
    closed: "sale",
  };
  const status = normalized ? aliases[normalized] ?? normalized : undefined;
  return status && LEAD_STATUSES.includes(status as any)
    ? status
    : undefined;
};

const cleanOptional = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizePublicLeadPayload = (payload: any) => {
  const sourceCreatedAt = cleanOptional(
    payload.sourceCreatedAt ?? payload.created_time
  );

  return {
    projectId: payload.projectId,
    name: cleanOptional(payload.name ?? payload.full_name),
    phone: cleanOptional(payload.phone ?? payload.phone_number),
    email: cleanOptional(payload.email),
    message: cleanOptional(payload.message ?? payload.remarks),
    sourceCreatedAt,
    purchaseTimeline: cleanOptional(
      payload.purchaseTimeline ??
        payload.when_are_you_planning_to_purchase ??
        payload["when_are_you_planning_to_purchase?"]
    ),
    budgetRange: cleanOptional(
      payload.budgetRange ??
        payload.what_is_your_budget_range ??
        payload["what_is_your_budget_range?"]
    ),
    status: normalizeLeadStatus(payload.status),
  };
};

const getProjectLeadQuery = (projectId: string, from?: unknown, to?: unknown) => {
  const query: any = { projectId };

  if (from || to) {
    query.createdAt = {};

    if (from) {
      query.createdAt.$gte = new Date(from as string);
    }

    if (to) {
      const toDate = new Date(to as string);
      toDate.setHours(23, 59, 59, 999);
      query.createdAt.$lte = toDate;
    }
  }

  return query;
};

const VIEW_DURATION_MODEL_MAP: Record<string, any> = {
  featuredprojects: FeaturedProject,
  residentials: Residential,
  commercials: Commercial,
  landplots: LandPlot,
  agriculturals: Agricultural,
};

const resolveLeadUserIds = async (leads: any[]) => {
  const directUserIds = new Set<string>();
  const emails = new Set<string>();
  const phones = new Set<string>();

  leads.forEach((lead: any) => {
    const createdBy = String(lead?.createdBy ?? "").trim();
    const email = String(lead?.email ?? "").trim().toLowerCase();
    const phone = String(lead?.phone ?? "").trim();

    if (createdBy && Types.ObjectId.isValid(createdBy)) {
      directUserIds.add(createdBy);
    }
    if (email) {
      emails.add(email);
    }
    if (phone) {
      phones.add(phone);
    }
  });

  const orMatch: Record<string, unknown>[] = [];

  if (directUserIds.size) {
    orMatch.push({
      _id: {
        $in: Array.from(directUserIds).map((id) => new Types.ObjectId(id)),
      },
    });
  }

  if (emails.size) {
    orMatch.push({ email: { $in: Array.from(emails) } });
  }

  if (phones.size) {
    orMatch.push({ phone: { $in: Array.from(phones) } });
  }

  if (!orMatch.length) {
    return new Map<string, string>();
  }

  const users = await mongoose.connection
    .collection("users")
    .find({ $or: orMatch })
    .project({ _id: 1, email: 1, phone: 1 })
    .toArray();

  const userIdByLookup = new Map<string, string>();
  users.forEach((user) => {
    const userId = String(user._id);
    const email = String(user.email ?? "").trim().toLowerCase();
    const phone = String(user.phone ?? "").trim();

    userIdByLookup.set(`id:${userId}`, userId);
    if (email) userIdByLookup.set(`email:${email}`, userId);
    if (phone) userIdByLookup.set(`phone:${phone}`, userId);
  });

  const resolvedUserIds = new Map<string, string>();

  leads.forEach((lead: any) => {
    const leadId = String(lead._id);
    const createdBy = String(lead?.createdBy ?? "").trim();
    const email = String(lead?.email ?? "").trim().toLowerCase();
    const phone = String(lead?.phone ?? "").trim();

    const resolvedUserId =
      (createdBy && userIdByLookup.get(`id:${createdBy}`)) ||
      (email && userIdByLookup.get(`email:${email}`)) ||
      (phone && userIdByLookup.get(`phone:${phone}`)) ||
      "";

    if (resolvedUserId) {
      resolvedUserIds.set(leadId, resolvedUserId);
    }
  });

  return resolvedUserIds;
};

const getContactPhoneLookup = (value?: string | null) => {
  const digits = normalizeLeadPhone(value).replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const getContactEmailLookup = (value?: string | null) =>
  String(value ?? "").trim().toLowerCase();

const attachProjectLeadActivity = async (
  projectId: string,
  leads: any[],
  createdAtMatch?: Record<string, unknown>,
) => {
  if (!Types.ObjectId.isValid(projectId)) {
    return leads;
  }

  const resolvedUserIds = await resolveLeadUserIds(leads);
  const uniqueUserIds = Array.from(new Set(resolvedUserIds.values()));
  const projectObjectId = new Types.ObjectId(projectId);
  const interactionDateMatch =
    createdAtMatch && Object.keys(createdAtMatch).length
      ? { createdAt: createdAtMatch }
      : {};

  const [shortlistRows, brochureRows] = await Promise.all([
    mongoose.connection
      .collection("shortlists")
      .aggregate([
        {
          $match: {
            propertyType: "FeaturedProject",
            propertyId: projectObjectId,
            ...interactionDateMatch,
          },
        },
        {
          $group: {
            _id: "$userId",
            createdAt: { $max: "$createdAt" },
          },
        },
      ])
      .toArray(),
    mongoose.connection
      .collection("brochuredownloads")
      .aggregate([
        {
          $match: {
            projectId: projectObjectId,
            source: "brochure_download",
            ...interactionDateMatch,
          },
        },
        {
          $group: {
            _id: "$userId",
            createdAt: { $max: "$createdAt" },
          },
        },
      ])
      .toArray(),
  ]);

  const shortlistedUserIds = new Set(shortlistRows.map((row) => String(row._id)));
  const brochureUserIds = new Set(brochureRows.map((row) => String(row._id)));
  const interactionCreatedAtByUserId = new Map<string, Date>(
    [...shortlistRows, ...brochureRows].map((row) => [
      String(row._id),
      row.createdAt ? new Date(row.createdAt) : new Date(),
    ]),
  );

  [...shortlistRows, ...brochureRows].forEach((row) => {
    const userId = String(row._id);
    const current = interactionCreatedAtByUserId.get(userId);
    const next = row.createdAt ? new Date(row.createdAt) : new Date();
    if (!current || next.getTime() > current.getTime()) {
      interactionCreatedAtByUserId.set(userId, next);
    }
  });

  const leadUserIds = new Set(uniqueUserIds);
  const interactionCandidateUserIds = Array.from(interactionCreatedAtByUserId.keys()).filter(
    (userId) => Types.ObjectId.isValid(userId) && !leadUserIds.has(userId),
  );
  const interactionUsers = interactionCandidateUserIds.length
    ? await mongoose.connection
        .collection("users")
        .find({
          _id: {
            $in: interactionCandidateUserIds.map((id) => new Types.ObjectId(id)),
          },
        })
        .project({ name: 1, email: 1, phone: 1 })
        .toArray()
    : [];
  const interactionUserById = new Map(
    interactionUsers.map((user) => [String(user._id), user]),
  );

  const leadsWithActivity = leads.map((lead: any) => {
    const resolvedUserId = resolvedUserIds.get(String(lead._id)) || "";

    return {
      ...lead,
      activity: {
        leadSubmitted: true,
        shortlisted: resolvedUserId ? shortlistedUserIds.has(resolvedUserId) : false,
        brochureDownloaded: resolvedUserId ? brochureUserIds.has(resolvedUserId) : false,
        timeSpentMinutes: null,
      },
    };
  });

  const leadIndexByContact = new Map<string, number>();
  leadsWithActivity.forEach((lead: any, index: number) => {
    const email = getContactEmailLookup(lead.email);
    const phone = getContactPhoneLookup(lead.phone);

    if (email) leadIndexByContact.set(`email:${email}`, index);
    if (phone) leadIndexByContact.set(`phone:${phone}`, index);
  });

  const mergedInteractionUserIds = new Set<string>();
  interactionCandidateUserIds.forEach((userId) => {
    const user = interactionUserById.get(userId);
    if (!user) return;

    const email = getContactEmailLookup(user.email);
    const phone = getContactPhoneLookup(user.phone);
    const leadIndex =
      (email ? leadIndexByContact.get(`email:${email}`) : undefined) ??
      (phone ? leadIndexByContact.get(`phone:${phone}`) : undefined);

    if (leadIndex === undefined) return;

    const activity = leadsWithActivity[leadIndex].activity ?? {};
    leadsWithActivity[leadIndex] = {
      ...leadsWithActivity[leadIndex],
      activity: {
        ...activity,
        shortlisted: Boolean(activity.shortlisted || shortlistedUserIds.has(userId)),
        brochureDownloaded: Boolean(
          activity.brochureDownloaded || brochureUserIds.has(userId),
        ),
        timeSpentMinutes: null,
      },
    };
    mergedInteractionUserIds.add(userId);
  });

  const interactionOnlyUserIds = interactionCandidateUserIds.filter(
    (userId) => !mergedInteractionUserIds.has(userId),
  );

  const interactionOnlyRows = interactionOnlyUserIds.map((userId) => {
    const user = interactionUserById.get(userId) || {};
    const createdAt = interactionCreatedAtByUserId.get(userId) || new Date();

    return {
      _id: `activity:${projectId}:${userId}`,
      projectId,
      name: user.name || "Unknown User",
      phone: user.phone || "",
      email: user.email || "",
      source: "site",
      sourceCreatedAt: createdAt.toISOString(),
      createdAt: createdAt.toISOString(),
      status: "new_lead",
      activityOnly: true,
      activity: {
        leadSubmitted: false,
        shortlisted: shortlistedUserIds.has(userId),
        brochureDownloaded: brochureUserIds.has(userId),
        timeSpentMinutes: null,
      },
    };
  });

  return [...leadsWithActivity, ...interactionOnlyRows];
};

const getCombinedProjectLeads = async (query: any) => {
  const [publicLeads, propertyLeads] = await Promise.all([
    PublicLead.find(query).lean(),
    Lead.find(query)
      .select("name phone email status remarks createdAt updatedAt projectId createdBy")
      .lean(),
  ]);

  const normalizedPublicLeads = publicLeads.map((lead: any) => ({
    ...lead,
    source: lead.source ?? "site",
  }));

  const normalizedPropertyLeads = propertyLeads.map((lead: any) => ({
    ...lead,
    source: "direct",
  }));

  const combinedLeads = [...normalizedPublicLeads, ...normalizedPropertyLeads].sort(
    (a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return attachProjectLeadActivity(
    String(query.projectId),
    combinedLeads,
    query.createdAt,
  );
};

const buildProjectLeadsHeader = (leads: any[]) => {
  const sourceCounts = leads.reduce(
    (counts, lead: any) => {
      const source = lead?.source;
      if (source === "site") counts.site += 1;
      else if (source === "imported") counts.imported += 1;
      else counts.direct += 1;
      return counts;
    },
    { site: 0, imported: 0, direct: 0 }
  );

  let title = "All Leads";
  let type: "all" | "site" | "imported" | "direct" = "all";

  if (sourceCounts.site > 0 && sourceCounts.imported === 0 && sourceCounts.direct === 0) {
    title = "Leads From Our Site";
    type = "site";
  } else if (sourceCounts.imported > 0 && sourceCounts.site === 0 && sourceCounts.direct === 0) {
    title = "Imported Leads";
    type = "imported";
  } else if (sourceCounts.direct > 0 && sourceCounts.site === 0 && sourceCounts.imported === 0) {
    title = "Direct Leads";
    type = "direct";
  }

  return {
    title,
    type,
    counts: sourceCounts,
  };
};

const standardLeadColumns = [
  { key: "name", label: "Full Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone Number" },
  { key: "activity", label: "Activity" },
  { key: "status", label: "Status" },
  { key: "leadTime", label: "Lead Time" },
  { key: "purchaseTimeline", label: "Planning To Purchase" },
  { key: "budgetRange", label: "Budget Range" },
];

const getColumnKeyFromLabel = (label: string) => {
  const normalized = normalizeCsvHeader(label);

  switch (normalized) {
    case "name":
      return "name";
    case "phone":
      return "phone";
    case "email":
      return "email";
    case "status":
      return "status";
    case "sourceCreatedAt":
      return "leadTime";
    case "purchaseTimeline":
      return "purchaseTimeline";
    case "budgetRange":
      return "budgetRange";
    case "message":
      return "message";
    default:
      return `extra:${label}`;
  }
};

const buildProjectLeadColumns = (leads: any[]) => {
  const importedColumnLabels: string[] = [];
  const seenImportedLabels = new Set<string>();

  leads.forEach((lead: any) => {
    const extraFields = lead?.extraFields ?? {};
    Object.keys(extraFields).forEach((label) => {
      if (seenImportedLabels.has(label)) return;
      seenImportedLabels.add(label);
      importedColumnLabels.push(label);
    });
  });

  const columns: Array<{ key: string; label: string }> = [...standardLeadColumns];
  const standardKeys = new Set(columns.map((column) => column.key));
  const importedOnly =
    leads.length > 0 && leads.every((lead: any) => lead.source === "imported");

  if (importedOnly) {
    const importedCanonicalKeys = new Set(
      importedColumnLabels.map((label) => getColumnKeyFromLabel(label))
    );

    const canonicalColumns = standardLeadColumns.filter((column) =>
      importedCanonicalKeys.has(column.key)
    );
    const canonicalKeys = new Set(canonicalColumns.map((column) => column.key));

    importedColumnLabels.forEach((label) => {
      const key = getColumnKeyFromLabel(label);
      if (canonicalKeys.has(key)) return;
      canonicalColumns.push({ key, label });
      canonicalKeys.add(key);
    });

    return canonicalColumns;
  }

  importedColumnLabels.forEach((label) => {
    const key = getColumnKeyFromLabel(label);
    if (standardKeys.has(key)) return;

    columns.push({ key, label });
    standardKeys.add(key);
  });

  return columns;
};

/*** CREATE LEAD */
export const createLeadController: RequestHandler = async (req, res) => {
  try {
    const authReq = req as AuthRequest; // 👈 cast once

    const data = LeadCreateSchema.parse(authReq.body);
    const lead = await createLead(
      data,
      authReq.user!.id,
      authReq.user?.roleName || authReq.user?.role || "",
    );

    res.status(201).json({ success: true, data: lead });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
};

/*** ASSIGN LEAD */
export const assignLeadController = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Lead ID is required",
      });
    }

    const lead = await assignLead(id, req.body.assignedTo);
    res.json({ success: true, data: lead });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/*** UPDATE LEAD STATUS */
export const updateLeadStatusController = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Lead ID is required",
      });
    }
    const status = normalizeLeadStatus(req.body.status);
    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    const lead = await updateLeadStatus(id, status);
    res.json({ success: true, data: lead });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/*** GET ALL LEADS */
export const getLeadsController = async (req: Request, res: Response) => {
  try {
    const leads = await getLeads(req.query);
    const projectId = String(req.query.projectId || "");
    if (!projectId || !Types.ObjectId.isValid(projectId)) {
      return res.json({ success: true, data: leads });
    }

    const imported = await PublicLead.find({ projectId })
      .sort({ createdAt: -1 })
      .lean();
    const seenPhones = new Set(
      (leads as any[]).map((lead) => String(lead?.phone || "")),
    );
    const extra = imported.filter(
      (lead) => !seenPhones.has(String(lead?.phone || "")),
    );
    const leadsWithBatch = [...extra, ...(leads as any[])].map((lead) => ({
      ...lead,
      importBatchId: leadImportBatchKey(lead?.importedBy) || null,
    }));
    const pageResult = pageLeadRows(leadsWithBatch, req.query as Record<string, unknown>);
    if (pageResult.paged) {
      return res.json({
        success: true,
        data: pageResult.rows,
        count: pageResult.count,
        page: pageResult.page,
        limit: pageResult.limit,
        pages: pageResult.pages,
      });
    }
    const deletedImports = await listDeletedImportedLeads(projectId);
    const importBatches = buildLeadImportBatches(leadsWithBatch, deletedImports);
    res.json({ success: true, data: leadsWithBatch, importBatches });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const LEAD_CONTACT_HEAD_ROLES = new Set(["super_admin", "admin", "ceo"]);

const normalizedActorRole = (req: Request) =>
  String((req as AuthRequest).user?.roleName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const isLeadContactHead = (req: Request) => {
  const role = normalizedActorRole(req);
  return LEAD_CONTACT_HEAD_ROLES.has(role) || role.endsWith("_head");
};

const canSeeLeadContacts = async (req: Request) =>
  isLeadContactHead(req) || (await isLeadContactVisibleToStaff());

export const getLeadContactVisibilityController = async (req: Request, res: Response) => {
  try {
    const setting = await getLeadContactVisibility();
    const isHead = isLeadContactHead(req);
    return res.json({
      success: true,
      data: {
        ...setting,
        canManage: normalizedActorRole(req) === "super_admin",
        canSeeContacts: isHead || setting.enabled,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateLeadContactVisibilityController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (normalizedActorRole(req) !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can change lead contact visibility",
      });
    }
    if (typeof req.body?.enabled !== "boolean") {
      return res.status(400).json({ success: false, message: "enabled must be true or false" });
    }
    const actor = await resolveLeadActor(req);
    const setting = await setLeadContactVisibility(req.body.enabled, actor);
    return res.json({ success: true, data: { ...setting, canManage: true, canSeeContacts: true } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listLeadContactVisibilityHistoryController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (normalizedActorRole(req) !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can view this history",
      });
    }
    const result = await listLeadContactVisibilityHistory(req.query.page);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const maskAdminLeadContacts = (lead: any) => ({
  ...lead,
  phone: maskPhone(lead?.phone),
  email: maskEmail(lead?.email),
  contactMasked: true,
  submissions: Array.isArray(lead?.submissions)
    ? lead.submissions.map((row: any) => ({
        ...row,
        phone: maskPhone(row?.phone),
        email: maskEmail(row?.email),
      }))
    : lead?.submissions,
});

export const getAdminLeadsController = async (req: Request, res: Response) => {
  try {
    const data = await getAdminLeadDashboard(req.query);
    if (!(await canSeeLeadContacts(req)) && Array.isArray(data?.leads)) {
      data.leads = data.leads.map(maskAdminLeadContacts);
    }
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const exportAdminLeadsController = async (req: Request, res: Response) => {
  try {
    const data = await getAdminLeadDashboard(req.query, true);
    const leads = (await canSeeLeadContacts(req))
      ? data.leads
      : data.leads.map(maskAdminLeadContacts);
    const rows = leads.map((lead: any) => ({
      "Lead Name": lead.name,
      Phone: lead.phone,
      Email: lead.email,
      "Project / Property": lead.project.title,
      "Property Code": lead.project.code,
      Category: lead.project.category,
      State: lead.project.state,
      City: lead.project.city,
      Locality: lead.project.locality,
      "Where From": lead.origin?.label || lead.source,
      "Entry Point": lead.origin?.entryPoint || "",
      "Journey Path": Array.isArray(lead.origin?.path)
        ? lead.origin.path.join(" → ")
        : "",
      Source: lead.source,
      Status: lead.status,
      Submissions: lead.submissionCount || 1,
      "Duplicates Merged": lead.duplicateCount || 0,
      "Purchase Timeline": lead.purchaseTimeline,
      "Budget Range": lead.budgetRange,
      Message: lead.message,
      "First Touch": new Date(lead.firstTouchAt || lead.createdAt).toLocaleString(
        "en-IN",
      ),
      "Last Touch": new Date(lead.lastTouchAt || lead.createdAt).toLocaleString(
        "en-IN",
      ),
    }));
    const format = String(req.query.format || "csv").toLowerCase();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    if (format === "xlsx" || format === "excel") {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="leads-${Date.now()}.xlsx"`);
      return res.send(buffer);
    }
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="leads-${Date.now()}.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

/*** GET SINGLE LEAD*/
export const getLeadByIdController = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Lead ID is required",
      });
    }

    const lead = await getLeadById(id);
    res.json({ success: true, data: lead });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
};


// controller/leadController.ts
export const checkLeadController = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { projectId } = req.query;

  if (!projectId) {
    return res.status(400).json({ message: "projectId required" });
  }

  const exists = await Lead.exists({
    projectId,
    createdBy: userId,
  });

  res.json({ contacted: !!exists });
};

export const getMyContactedProperties = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user!.id;



    const leads = await Lead.find({ createdBy: userId })
      .populate("projectId")                    // full property
      .populate("ownerId", "name phone email")  // owner details
      .sort({ createdAt: -1 })
      .lean();



    const properties = leads
      .filter((lead: any) => Boolean(lead?.projectId))
      .map((lead: any) => {
      const property = lead.projectId;

      return {
        leadId: lead._id,
        contactedAt: lead.createdAt,

        // 🔥 lead info
        propertyType: lead.propertyType,
        listingType: lead.listingType,

        // 🔥 property info
        propertyId: property?._id,
        slug: property?.slug || null,
        title:
          property?.title ||
          property?.projectName ||
          property?.buildingName ||
          "Property",

        city: property?.city || "",
        locality: property?.locality || "",
        price:
          property?.price ||
          property?.expectedPrice ||
          property?.priceFrom ||
          null,
        priceFrom: property?.priceFrom || null,
        priceTo: property?.priceTo || null,
        heroImage: property?.heroImage || null,
        gallery: property?.gallery?.[0]?.url || null,
        gallerySummary: property?.gallerySummary || [],
        promotion: property?.promotion || null,

        // 🔥 owner info
        owner: {
          id: lead.ownerId?._id,
          name: lead.ownerId?.name,
          phone: lead.ownerId?.phone,
          email: lead.ownerId?.email,
        },
      };
    });

    res.json({
      success: true,
      total: properties.length,
      properties,
    });
  } catch (err) {
    console.error("getMyContactedProperties error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load contacted properties",
    });
  }
};




export const createPublicLeadController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = PublicLeadSchemaZ.parse(normalizePublicLeadPayload(req.body));
    const normalizedPhone = normalizeLeadPhone(data.phone);
    const authHeader = String(req.headers.authorization || "").trim();
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    let actorUserId = "";

    if (token) {
      try {
        const decoded = verifyToken(token);
        actorUserId = String(decoded.sub || "").trim();
      } catch {
        actorUserId = "";
      }
    }

    const canBypassOtp = await canBypassLeadOtpVerification(
      actorUserId,
      normalizedPhone,
    );
    const verified =
      canBypassOtp ||
      (await isKnownLeadPhone(normalizedPhone)) ||
      (await consumeVerifiedLeadPhone(String(data.projectId), normalizedPhone));

    if (!verified) {
      return res.status(403).json({
        success: false,
        message: "Phone number verification is required before submitting this lead",
      });
    }

    const lead = await createPublicLead(data, { actorUserId });

    res.status(201).json({
      success: true,
      message: "Lead submitted successfully",
      data: lead,
    });
  } catch (err: any) {
    res.status(err?.statusCode || 400).json({
      success: false,
      message: err.message,
    });
  }
};

export const requestPublicProjectLeadOtpController = async (
  req: Request,
  res: Response,
) => {
  try {
    const projectId = String(req.body?.projectId || "").trim();
    const phone = normalizeLeadPhone(req.body?.phone);

    if (!projectId || !Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Valid projectId is required",
      });
    }

    if (!phone || !/^\+?[1-9]\d{9,14}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Valid phone number is required",
      });
    }

    const project = await FeaturedProject.findById(projectId)
      .populate("createdBy", "phone")
      .select("createdBy title")
      .lean();

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const ownerPhone = normalizeLeadPhone((project as any)?.createdBy?.phone);
    if (ownerPhone && ownerPhone === phone) {
      return res.status(403).json({
        success: false,
        message: "You cannot submit a lead for your own project",
      });
    }

    const otp = generateLeadOtp();
    await saveLeadOtp(projectId, phone, otp);
    const deliveryResult = await sendOtpWhatsApp(phone, otp);

    if (!deliveryResult) {
      return res.status(502).json({
        success: false,
        message: "Failed to deliver OTP",
      });
    }

    return res.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to send OTP",
    });
  }
};

export const verifyPublicProjectLeadOtpController = async (
  req: Request,
  res: Response,
) => {
  try {
    const projectId = String(req.body?.projectId || "").trim();
    const phone = normalizeLeadPhone(req.body?.phone);
    const otp = String(req.body?.otp || "").trim();

    if (!projectId || !Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Valid projectId is required",
      });
    }

    if (!phone || !/^\+?[1-9]\d{9,14}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Valid phone number is required",
      });
    }

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is required",
      });
    }

    const result = await verifyLeadOtp(projectId, phone, otp);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message:
          result.reason === "expired"
            ? "OTP expired. Please request a new OTP."
            : "Incorrect OTP",
      });
    }

    return res.json({
      success: true,
      message: "Phone number verified successfully",
      verified: true,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to verify OTP",
    });
  }
};

export const requestPublicPropertyLeadOtpController = async (
  req: Request,
  res: Response,
) => {
  try {
    const projectId = String(req.body?.projectId || "").trim();
    const propertyType = String(req.body?.propertyType || "").trim();
    const phone = normalizeLeadPhone(req.body?.phone);

    if (!projectId || !Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Valid projectId is required",
      });
    }

    if (!propertyType || !["residentials", "commercials", "agriculturals", "landplots", "featuredprojects"].includes(propertyType)) {
      return res.status(400).json({
        success: false,
        message: "Valid propertyType is required",
      });
    }

    if (!phone || !/^\+?[1-9]\d{9,14}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Valid phone number is required",
      });
    }

    const propertyModelMap: Record<string, any> = {
      featuredprojects: FeaturedProject,
      residentials: Residential,
      commercials: Commercial,
      agriculturals: Agricultural,
      landplots: LandPlot,
    };

    const PropertyModel = propertyModelMap[propertyType];
    const property = await PropertyModel.findById(projectId)
      .populate("createdBy", "phone")
      .select("createdBy title")
      .lean();

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    const ownerPhone = normalizeLeadPhone((property as any)?.createdBy?.phone);
    if (ownerPhone && ownerPhone === phone) {
      return res.status(403).json({
        success: false,
        message: propertyType === "featuredprojects"
          ? "You cannot submit a lead for your own project"
          : "You cannot submit a lead for your own property",
      });
    }

    const otp = generateLeadOtp();
    await saveLeadOtp(projectId, phone, otp);
    const deliveryResult = await sendOtpWhatsApp(phone, otp);

    if (!deliveryResult) {
      return res.status(502).json({
        success: false,
        message: "Failed to deliver OTP",
      });
    }

    return res.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to send OTP",
    });
  }
};

export const verifyPublicPropertyLeadOtpController = async (
  req: Request,
  res: Response,
) => {
  try {
    const projectId = String(req.body?.projectId || "").trim();
    const phone = normalizeLeadPhone(req.body?.phone);
    const otp = String(req.body?.otp || "").trim();

    if (!projectId || !Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Valid projectId is required",
      });
    }

    if (!phone || !/^\+?[1-9]\d{9,14}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Valid phone number is required",
      });
    }

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is required",
      });
    }

    const result = await verifyLeadOtp(projectId, phone, otp);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message:
          result.reason === "expired"
            ? "OTP expired. Please request a new OTP."
            : "Incorrect OTP",
      });
    }

    const existingUser = await User.findOne({ phone })
      .select("_id name email phone companyName roleId accountStatus isActive")
      .lean();

    if (existingUser?.isActive === false) {
      return res.json({
        success: true,
        message: "Phone number verified successfully",
        verified: true,
        autoLoggedIn: false,
      });
    }

    const autoLoginData = existingUser
      ? await createLeadOtpAutoLoginPayload(existingUser)
      : null;

    return res.json({
      success: true,
      message: "Phone number verified successfully",
      verified: true,
      autoLoggedIn: Boolean(autoLoginData?.token),
      token: autoLoginData?.token,
      user: autoLoginData?.user,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to verify OTP",
    });
  }
};

export const createPublicPropertyLeadController = async (
  req: Request,
  res: Response,
) => {
  try {
    const data = PublicPropertyLeadSchemaZ.parse(req.body);
    const normalizedPhone = normalizeLeadPhone(data.phone);
    const authHeader = String(req.headers.authorization || "").trim();
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    let actorUserId = "";

    if (token) {
      try {
        const decoded = verifyToken(token);
        actorUserId = String(decoded.sub || "").trim();
      } catch {
        actorUserId = "";
      }
    }

    const canBypassOtp = await canBypassLeadOtpVerification(
      actorUserId,
      normalizedPhone,
    );
    const verified =
      canBypassOtp ||
      (await isKnownLeadPhone(normalizedPhone)) ||
      (await consumeVerifiedLeadPhone(String(data.projectId), normalizedPhone));

    if (!verified) {
      return res.status(403).json({
        success: false,
        message: "Phone number verification is required before submitting this lead",
      });
    }

    await ensureNotOwnerPhoneForPublicPropertyLead({
      projectId: String(data.projectId),
      propertyType: String(data.propertyType),
      phone: normalizedPhone,
    });

    const lead = await createPublicPropertyLead(
      { ...data, phone: normalizedPhone },
      { actorUserId },
    );

    res.status(201).json({
      success: true,
      message: "Lead submitted successfully",
      data: lead,
    });
  } catch (err: any) {
    res.status(err?.statusCode || 400).json({
      success: false,
      message: err.message,
    });
  }
};
export const checkPublicProjectLeadController = async (
  req: Request,
  res: Response,
) => {
  try {
    const projectId = String(req.query.projectId || "").trim();
    const phone = String(req.query.phone || "").trim();
    const email = String(req.query.email || "").trim().toLowerCase();

    if (!projectId || !Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Valid projectId is required",
      });
    }

    if (!phone && !email) {
      return res.json({
        success: true,
        submitted: false,
        data: null,
      });
    }

    const identityMatch: Record<string, unknown>[] = [];
    if (phone) identityMatch.push({ phone });
    if (email) identityMatch.push({ email });

    const lead = await PublicLead.findOne({
      projectId,
      $or: identityMatch,
    })
      .collation({ locale: "en", strength: 2 })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      submitted: Boolean(lead),
      data: lead
        ? {
            _id: lead._id,
            intention: lead.intention || [],
          }
        : null,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to check project lead",
    });
  }
};


export const updatePublicLeadIntentionController = async (
  req: Request,
  res: Response,
) => {
  try {
    const leadId = String(req.params.id || "");
    const rawIntention = Array.isArray(req.body?.intention)
      ? req.body.intention
      : [];

    if (!Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lead id",
      });
    }

    const intention = rawIntention
      .map((item: any) => ({
        question: String(item?.question || "").trim(),
        answer: String(item?.answer || "").trim(),
      }))
      .filter((item: { question: string; answer: string }) => item.question && item.answer);

    const lead = await PublicLead.findByIdAndUpdate(
      leadId,
      { $set: { intention } },
      { new: true },
    );

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    return res.json({
      success: true,
      message: "Lead intention updated successfully",
      data: lead,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to update lead intention",
    });
  }
};

export const trackProjectBrochureDownloadController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const projectId = String(req.params.projectId || "");
    const userId = String(req.user?.id || "");

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "projectId is required",
      });
    }

    if (!Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid projectId",
      });
    }

    if (!userId || !Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const project = await FeaturedProject.findById(projectId)
      .select("createdBy")
      .lean();

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (String(project.createdBy) === userId) {
      return res.status(200).json({
        success: true,
        message: "Skipped self brochure download tracking",
      });
    }

    await mongoose.connection.collection("brochuredownloads").insertOne({
      projectId: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(userId),
      source: "brochure_download",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await notifyProjectBrochureDownload({ projectId, userId });

    return res.status(201).json({
      success: true,
      message: "Brochure download tracked",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to track brochure download",
    });
  }
};

export const trackProjectViewDurationController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const projectId = String(req.params.projectId || "");
    const userId = String(req.user?.id || "");
    const durationMs = Number(req.body?.durationMs ?? 0);
    const pathname = typeof req.body?.pathname === "string" ? req.body.pathname.trim() : "";

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "projectId is required",
      });
    }

    if (!Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid projectId",
      });
    }

    if (!userId || !Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!Number.isFinite(durationMs) || durationMs < 1000) {
      return res.status(400).json({
        success: false,
        message: "durationMs must be at least 1000",
      });
    }

    const project = await FeaturedProject.findById(projectId)
      .select("_id createdBy")
      .lean();

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (String(project.createdBy) === userId) {
      return res.status(200).json({
        success: true,
        message: "Skipped self project view duration tracking",
      });
    }

    await mongoose.connection.collection("projectviewdurations").insertOne({
      projectId: new Types.ObjectId(projectId),
      builderId: project.createdBy,
      userId: new Types.ObjectId(userId),
      durationMs: Math.round(durationMs),
      durationMinutes: Number((durationMs / 60000).toFixed(2)),
      pathname: pathname || null,
      source: "project_view_duration",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (durationMs >= HIGH_TIME_SPENT_PUSH_THRESHOLD_MS) {
      const allowed = await shouldSendHighTimeSpentPush({
        userId,
        projectId,
      });

      if (allowed) {
        const [viewer, fullProject] = await Promise.all([
          User.findById(userId).select("name phone email").lean(),
          FeaturedProject.findById(projectId).select("title projectName").lean(),
        ]);
        const projectTitle =
          fullProject?.title || (fullProject as any)?.projectName || "your project";
        const viewerName = viewer?.name || "A user";
        const minutes = Number((durationMs / 60000).toFixed(1));

        await notifyOwnerAndAdmins({
          type: "high_time_spent",
          title: "High Time Spent",
          body: `${viewerName} spent ${minutes} min on ${projectTitle}.`,
          actorUserId: userId,
          ownerId: project.createdBy,
          projectId,
          propertyType: "featuredprojects",
          metadata: {
            projectTitle,
            userName: viewerName,
            userPhone: viewer?.phone || "",
            userEmail: viewer?.email || "",
            durationMinutes: minutes,
          },
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: "Project view duration tracked",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to track project view duration",
    });
  }
};

export const trackPropertyViewDurationController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const projectId = String(req.params.projectId || "");
    const propertyType = String(req.params.propertyType || "").trim().toLowerCase();
    const userId = String(req.user?.id || "");
    const durationMs = Number(req.body?.durationMs ?? 0);
    const pathname = typeof req.body?.pathname === "string" ? req.body.pathname.trim() : "";

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "projectId is required",
      });
    }

    if (!Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid projectId",
      });
    }

    if (!userId || !Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!Number.isFinite(durationMs) || durationMs < 1000) {
      return res.status(400).json({
        success: false,
        message: "durationMs must be at least 1000",
      });
    }

    const PropertyModel = VIEW_DURATION_MODEL_MAP[propertyType];
    if (!PropertyModel || propertyType === "featuredprojects") {
      return res.status(400).json({
        success: false,
        message: "Invalid propertyType",
      });
    }

    const property = await PropertyModel.findById(projectId)
      .select("_id createdBy")
      .lean();

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    if (String(property.createdBy) === userId) {
      return res.status(200).json({
        success: true,
        message: "Skipped self property view duration tracking",
      });
    }

    await mongoose.connection.collection("projectviewdurations").insertOne({
      projectId: new Types.ObjectId(projectId),
      ownerId: property.createdBy,
      userId: new Types.ObjectId(userId),
      propertyType,
      durationMs: Math.round(durationMs),
      durationMinutes: Number((durationMs / 60000).toFixed(2)),
      pathname: pathname || null,
      source: "property_view_duration",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (durationMs >= HIGH_TIME_SPENT_PUSH_THRESHOLD_MS) {
      const allowed = await shouldSendHighTimeSpentPush({
        userId,
        projectId,
      });

      if (allowed) {
        const [viewer, fullProperty] = await Promise.all([
          User.findById(userId).select("name phone email").lean(),
          PropertyModel.findById(projectId)
            .select("title projectName buildingName")
            .lean(),
        ]);
        const propertyTitle =
          (fullProperty as any)?.title ||
          (fullProperty as any)?.projectName ||
          (fullProperty as any)?.buildingName ||
          "your property";
        const viewerName = viewer?.name || "A user";
        const minutes = Number((durationMs / 60000).toFixed(1));

        await notifyOwnerAndAdmins({
          type: "high_time_spent",
          title: "High Time Spent",
          body: `${viewerName} spent ${minutes} min on ${propertyTitle}.`,
          actorUserId: userId,
          ownerId: property.createdBy,
          projectId,
          propertyType,
          metadata: {
            propertyTitle,
            userName: viewerName,
            userPhone: viewer?.phone || "",
            userEmail: viewer?.email || "",
            durationMinutes: minutes,
          },
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: "Property view duration tracked",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to track property view duration",
    });
  }
};


const leadImportBatchKey = (importedBy: any) => {
  const at = importedBy?.at ? new Date(importedBy.at) : null;
  if (!at || Number.isNaN(at.getTime())) return "";
  const person = String(importedBy.userId || importedBy.name || "unknown");
  return `${person}|${at.toISOString()}`;
};

const buildLeadImportBatches = (liveLeads: any[], deletedLeads: any[]) => {
  const groups = new Map<string, {
    id: string;
    name: string;
    roleName: string;
    at: string;
    addedCount: number;
    deletedCount: number;
  }>();

  const add = (lead: any, deleted: boolean) => {
    if (String(lead?.source || "") !== "imported") return;
    const id = leadImportBatchKey(lead?.importedBy);
    if (!id) return;
    const current = groups.get(id) || {
      id,
      name: String(lead.importedBy?.name || "Unknown"),
      roleName: String(lead.importedBy?.roleName || ""),
      at: new Date(lead.importedBy.at).toISOString(),
      addedCount: 0,
      deletedCount: 0,
    };
    current.addedCount += 1;
    if (deleted) current.deletedCount += 1;
    groups.set(id, current);
  };

  liveLeads.forEach((lead) => add(lead, false));
  deletedLeads.forEach((lead) => add(lead, true));

  return [...groups.values()].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
};

const LEAD_PAGE_SIZE = 20;

const pageLeadRows = (rows: any[], query: Record<string, unknown>) => {
  const q = String(query.q || "").trim().toLowerCase();
  const filtered = q
    ? rows.filter((lead) =>
        [
          lead?.name,
          lead?.phone,
          lead?.email,
          lead?.status,
          lead?.remarks,
          lead?.purchaseTimeline,
          lead?.budgetRange,
          lead?.sourceCreatedAt,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ")
          .includes(q),
      )
    : rows;
  const requestedPage = Number(query.page);
  const requestedLimit = Number(query.limit);
  const shouldPage = requestedPage > 0 && requestedLimit > 0;
  if (!shouldPage) {
    return {
      paged: false as const,
      rows: filtered,
      count: filtered.length,
      page: 1,
      limit: filtered.length,
      pages: 1,
    };
  }

  const sorted = [...filtered].sort(
    (a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime(),
  );
  const limit = Math.min(LEAD_PAGE_SIZE, Math.max(1, Math.floor(requestedLimit)));
  const pages = Math.max(1, Math.ceil(sorted.length / limit) || 1);
  const page = Math.min(pages, Math.max(1, Math.floor(requestedPage)));
  const start = (page - 1) * limit;
  return {
    paged: true as const,
    rows: sorted.slice(start, start + limit),
    count: sorted.length,
    page,
    limit,
    pages,
  };
};

export const getProjectLeadsController = async (
  req: Request,
  res: Response
) => {
  try {
    const projectId = req.params.projectId;
    const { from, to } = req.query;

    if (!projectId) {
      return res.status(400).json({ message: "projectId is required" });
    }

    if (!Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: "Invalid projectId" });
    }

    const project = await FeaturedProject.findById(projectId)
      .select("promotion.type promotion.visibleLeadLimit")
      .lean();
    const query = getProjectLeadQuery(projectId, from, to);
    const leads = await getCombinedProjectLeads(query);
    const visibleLeadLimit = getVisibleLeadLimitForPromotion(project?.promotion);
    const maskedLeads = maskLeadsForPromotion(leads, project?.promotion);
    const leadsWithBatch = maskedLeads.map((lead: any) => ({
      ...lead,
      importBatchId: leadImportBatchKey(lead?.importedBy) || null,
    }));
    const pageResult = pageLeadRows(leadsWithBatch, req.query as Record<string, unknown>);
    if (pageResult.paged) {
      return res.json({
        success: true,
        count: pageResult.count,
        page: pageResult.page,
        limit: pageResult.limit,
        pages: pageResult.pages,
        promotionType: project?.promotion?.type || "normal",
        visibleLeadLimit,
        data: pageResult.rows,
      });
    }
    const deletedImports = await listDeletedImportedLeads(projectId);
    const importBatches = buildLeadImportBatches(leadsWithBatch, deletedImports);
    const header = buildProjectLeadsHeader(leadsWithBatch);
    const columns = buildProjectLeadColumns(leadsWithBatch);

    res.json({
      success: true,
      count: leadsWithBatch.length,
      promotionType: project?.promotion?.type || "normal",
      visibleLeadLimit,
      header,
      columns,
      importBatches,
      data: leadsWithBatch,
    });

  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const updateProjectLeadStatusController = async (
  req: Request,
  res: Response
) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Lead ID is required",
      });
    }

    const normalizedStatus = normalizeLeadStatus(status);

    if (!normalizedStatus) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    const updatedLead = await updateLeadStatusService(id, normalizedStatus);

    res.json({
      success: true,
      data: updatedLead,
      message: "Lead status updated",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const isSuperAdminActor = (req: AuthRequest) =>
  String(req.user?.roleName || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_") === "super_admin";

export const listDeletedLeadsController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!isSuperAdminActor(req)) {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can view deleted leads",
      });
    }

    const page = typeof req.query.page === "string" ? Number(req.query.page) : 1;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 12;
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    const deletionType =
      typeof req.query.deletionType === "string" ? req.query.deletionType : "";
    const scope = typeof req.query.scope === "string" ? req.query.scope : "";
    const result = await listDeletedLeads({ page, limit, q, from, to, deletionType, scope });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load deleted leads",
    });
  }
};

export const purgeDeletedLeadController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!isSuperAdminActor(req)) {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can permanently delete archived leads",
      });
    }
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "Missing id" });
    }
    const removed = await purgeDeletedLead(id);
    if (!removed) {
      return res.status(404).json({ success: false, message: "Deleted lead not found" });
    }
    return res.json({ success: true, id: removed._id });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to permanently delete the lead",
    });
  }
};

export const purgeAllDeletedLeadsController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!isSuperAdminActor(req)) {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can permanently delete archived leads",
      });
    }
    const result = await purgeAllDeletedLeads();
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to permanently delete archived leads",
    });
  }
};

export const deleteLeadController = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Lead ID is required",
      });
    }

    const actor = await resolveLeadActor(req);
    await archiveLeadById(id, actor, "single");
    await deleteLeadService(id);

    res.json({
      success: true,
      message: "Lead deleted successfully",
    });
  } catch (error: any) {
    const statusCode =
      error?.message === "Lead not found"
        ? 404
        : error?.message === "Invalid Lead ID"
          ? 400
          : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteProjectLeadsController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "projectId is required",
      });
    }

    const actor = await resolveLeadActor(req);
    await archiveProjectLeads(projectId, actor);
    const result = await deleteProjectLeadsService(projectId);

    res.json({
      success: true,
      message: "Project leads deleted successfully",
      data: result,
    });
  } catch (error: any) {
    const statusCode = error?.message === "Invalid projectId" ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};


export const downloadLeadsCSVController = async (
  req: Request,
  res: Response
) => {
  try {
    const projectId = req.params.projectId;
    const { from, to } = req.query;

    if (!projectId) {
      return res.status(400).json({ message: "projectId required" });
    }

    if (!Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: "Invalid projectId" });
    }

    const project = await FeaturedProject.findById(projectId)
      .select("promotion.type promotion.visibleLeadLimit")
      .lean();
    const query = getProjectLeadQuery(projectId, from, to);
    const leads = await getCombinedProjectLeads(query);
    const maskedLeads = maskLeadsForPromotion(leads, project?.promotion);

    return sendCSV(maskedLeads, res);

  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

const resolveLeadImportAudience = async (
  ownerId: string | undefined,
  fallback: LeadImportAudience,
): Promise<LeadImportAudience> => {
  if (!ownerId || !Types.ObjectId.isValid(ownerId)) return fallback;
  const owner = await User.findById(ownerId)
    .select("roleId")
    .populate("roleId", "name label")
    .lean();
  const role = String(
    (owner as any)?.roleId?.name || (owner as any)?.roleId?.label || "",
  ).toLowerCase();
  if (role.includes("builder")) return "builder";
  if (role.includes("agent")) return "agent";
  if (!role) return fallback;
  return "user";
};

const PROPERTY_IMPORT_TARGETS: Record<string, { model: any; propertyType: string }> = {
  residential: { model: Residential, propertyType: "residentials" },
  residentials: { model: Residential, propertyType: "residentials" },
  commercial: { model: Commercial, propertyType: "commercials" },
  commercials: { model: Commercial, propertyType: "commercials" },
  land: { model: LandPlot, propertyType: "landplots" },
  landplot: { model: LandPlot, propertyType: "landplots" },
  landplots: { model: LandPlot, propertyType: "landplots" },
  agricultural: { model: Agricultural, propertyType: "agriculturals" },
  agriculturals: { model: Agricultural, propertyType: "agriculturals" },
};

export const importProjectLeadsCSVController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { projectId } = req.params;
    const file = req.file;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!projectId) {
      return res.status(400).json({ success: false, message: "projectId required" });
    }

    if (!Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ success: false, message: "Invalid projectId" });
    }

    if (!file) {
      return res.status(400).json({ success: false, message: "CSV file is required" });
    }

    const project = await FeaturedProject.findById(projectId)
      .select("createdBy title projectName buildingName propertyCode state city locality slug heroImage gallery price priceFrom priceTo listingType promotion status builderOnboarding")
      .populate("createdBy", "name phone email")
      .lean();

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    interface CsvRow {
      [key: string]: string;
    }

    interface NormalizedLeadRow {
      projectId: string;
      name: string;
      phone: string;
      email?: string;
      message?: string;
      source: "imported";
      extraFields: Record<string, string>;
      sourceCreatedAt?: string;
      purchaseTimeline?: string;
      budgetRange?: string;
      status: string;
    }

    interface LeadImportError {
      row: number;
      message: string;
    }

    interface LeadPhoneRecord {
      phone: string;
    }

    const rows = parseLeadImportRows(file);
    const errors: LeadImportError[] = [];
    const allowedStatuses = new Set<string>(LEAD_STATUSES);
    const seenPhones = new Set<string>();

    const normalizedRows = rows.flatMap(
      (row: CsvRow, index: number): NormalizedLeadRow[] => {
        const rowNumber = index + 2;
        const normalizedRow = Object.entries(row).reduce<Record<string, string>>(
          (result, [header, value]) => {
            result[normalizeCsvHeader(header)] = value?.trim() ?? "";
            return result;
          },
          {}
        );
        const name = normalizedRow.name?.trim();
        const phone = normalizedRow.phone?.trim();
        const email = normalizedRow.email?.trim();
        const message = normalizedRow.message?.trim();
        const status = normalizeLeadStatus(normalizedRow.status) || "new_lead";
        const sourceCreatedAt = normalizedRow.sourceCreatedAt?.trim();
        const purchaseTimeline = normalizedRow.purchaseTimeline?.trim();
        const budgetRange = normalizedRow.budgetRange?.trim();

        if (!name || name.length < 2) {
          errors.push({ row: rowNumber, message: "Name is required" });
          return [];
        }

        if (!phone || phone.length < 6) {
          errors.push({ row: rowNumber, message: "Phone is required" });
          return [];
        }

        if (!allowedStatuses.has(status)) {
          errors.push({ row: rowNumber, message: "Invalid status" });
          return [];
        }

        if (seenPhones.has(phone)) {
          errors.push({ row: rowNumber, message: "Duplicate phone in CSV" });
          return [];
        }

        seenPhones.add(phone);

        return [
          {
            projectId,
            name,
            phone,
            email: email || "",
            message: message || "",
            source: "imported",
            extraFields: row,
            sourceCreatedAt: sourceCreatedAt || "",
            purchaseTimeline: purchaseTimeline || "",
            budgetRange: budgetRange || "",
            status,
          },
        ];
      }
    );

    if (!normalizedRows.length) {
      return res.status(400).json({
        success: false,
        message: "No valid leads found in CSV",
        totalRows: rows.length,
        imported: 0,
        skipped: rows.length,
        errors,
      });
    }

    const importedPhones = normalizedRows.map((row: NormalizedLeadRow) => row.phone);
    const [existingPublicLeads, existingPropertyLeads]: [LeadPhoneRecord[], LeadPhoneRecord[]] =
      await Promise.all([
        PublicLead.find({
          projectId,
          phone: { $in: importedPhones },
        })
          .select("phone")
          .lean(),
        Lead.find({
          projectId,
          phone: { $in: importedPhones },
        })
          .select("phone")
          .lean(),
      ]);

    const existingPhones = new Set([
      ...existingPublicLeads.map((lead) => lead.phone),
      ...existingPropertyLeads.map((lead) => lead.phone),
    ]);
    const leadsToInsert = normalizedRows.filter((row: NormalizedLeadRow) => {
      if (!existingPhones.has(row.phone)) return true;
      errors.push({ row: 0, message: `Skipped existing phone ${row.phone}` });
      return false;
    }).map((row: NormalizedLeadRow) => ({
      ...row,
      propertyType: "featuredprojects",
      propertyModel: FeaturedProject.modelName,
      propertySnapshot: buildLeadPropertySnapshot(project, "featuredprojects"),
    }));

    const importer = await User.findById(userId).select("name email phone").lean();
    const importedBy = {
      userId,
      name: String((importer as any)?.name || req.user?.name || ""),
      email: String((importer as any)?.email || req.user?.email || ""),
      phone: String((importer as any)?.phone || ""),
      roleName: String(req.user?.roleName || ""),
      at: new Date(),
    };
    const leadsWithImporter = leadsToInsert.map((row) => ({
      ...row,
      importedBy,
    }));
    const importedLeads = leadsWithImporter.length
      ? await PublicLead.insertMany(leadsWithImporter, { ordered: false })
      : [];
    const projectRecord = project as any;
    const builderUser =
      projectRecord.createdBy && typeof projectRecord.createdBy === "object"
        ? projectRecord.createdBy
        : null;
    const builderSnapshot = projectRecord.builderOnboarding?.builderSnapshot || {};
    const ownerPhone = String(
      builderUser?.phone ||
        builderSnapshot.phone ||
        projectRecord.builderOnboarding?.invitePhone ||
        "",
    ).trim();
    const ownerId = builderUser?._id
      ? String(builderUser._id)
      : String(projectRecord.createdBy || "");
    const projectTitle =
      projectRecord.title ||
      projectRecord.projectName ||
      projectRecord.buildingName ||
      "your project";
    let whatsappNotification = {
      attempted: false,
      sent: false,
      reason: "",
    };

    if (importedLeads.length && ownerId) {
      const leadLabel =
        importedLeads.length === 1
          ? `${importedLeads[0]?.name || "A lead"} was added as a lead`
          : `${importedLeads.length} leads were imported`;

      notifyOwnerAndAdmins({
        type: "contact_requested",
        title: importedLeads.length === 1 ? "New Project Lead" : "New Project Leads",
        body: `${leadLabel} for ${projectTitle}.`,
        actorUserId: String(userId || ""),
        ownerId,
        projectId,
        propertyType: "featuredprojects",
        metadata: {
          projectTitle,
          slug: projectRecord.slug || "",
          listingKind: "project",
          category: "featuredproject",
          promotionType: projectRecord.promotion?.type || "",
          source: "imported",
          importedCount: importedLeads.length,
          userName: importedLeads[0]?.name || "",
          userPhone: importedLeads[0]?.phone || "",
          userEmail: importedLeads[0]?.email || "",
        },
      }).catch((err) =>
        console.error("Error sending imported lead notification:", err),
      );
    }

    if (importedLeads.length && ownerPhone) {
      whatsappNotification.attempted = true;
      const audience = await resolveLeadImportAudience(ownerId, "builder");
      const whatsappResult = await sendLeadImportSummaryWhatsApp(ownerPhone, {
        listingTitle: projectTitle,
        audience,
        importedCount: importedLeads.length,
        skippedCount: Math.max(0, rows.length - importedLeads.length),
        leads: importedLeads.map((lead: any) => ({
          name: lead.name,
          phone: lead.phone,
        })),
      });

      whatsappNotification = {
        attempted: true,
        sent: Boolean(whatsappResult),
        reason: whatsappResult ? "sent" : "send_failed",
      };
    } else if (!ownerPhone && importedLeads.length) {
      whatsappNotification.reason = "owner_phone_missing";
    } else if (!importedLeads.length) {
      whatsappNotification.reason = "no_new_imported_leads";
    }

    res.status(201).json({
      success: true,
      message: "Leads imported successfully",
      totalRows: rows.length,
      imported: leadsToInsert.length,
      skipped: rows.length - leadsToInsert.length,
      whatsappNotification,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to import leads",
    });
  }
};

export const importPropertyLeadsCSVController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { propertyType: propertyTypeParam, propertyId } = req.params;
    const file = req.file;
    const userId = req.user?.id;
    const target = PROPERTY_IMPORT_TARGETS[String(propertyTypeParam || "").toLowerCase()];

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!target) {
      return res.status(400).json({ success: false, message: "Invalid property type" });
    }

    if (!propertyId || !Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ success: false, message: "Invalid propertyId" });
    }

    if (!file) {
      return res.status(400).json({ success: false, message: "CSV file is required" });
    }

    const property = await target.model
      .findById(propertyId)
      .populate("createdBy", "name phone email")
      .lean();

    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    interface CsvRow {
      [key: string]: string;
    }

    interface NormalizedLeadRow {
      projectId: string;
      name: string;
      phone: string;
      email?: string;
      message?: string;
      source: "imported";
      extraFields: Record<string, string>;
      sourceCreatedAt?: string;
      purchaseTimeline?: string;
      budgetRange?: string;
      status: string;
    }

    interface LeadImportError {
      row: number;
      message: string;
    }

    interface LeadPhoneRecord {
      phone: string;
    }

    const rows = parseLeadImportRows(file);
    const errors: LeadImportError[] = [];
    const allowedStatuses = new Set<string>(LEAD_STATUSES);
    const seenPhones = new Set<string>();

    const normalizedRows = rows.flatMap(
      (row: CsvRow, index: number): NormalizedLeadRow[] => {
        const rowNumber = index + 2;
        const normalizedRow = Object.entries(row).reduce<Record<string, string>>(
          (result, [header, value]) => {
            result[normalizeCsvHeader(header)] = value?.trim() ?? "";
            return result;
          },
          {}
        );
        const name = normalizedRow.name?.trim();
        const phone = normalizedRow.phone?.trim();
        const email = normalizedRow.email?.trim();
        const message = normalizedRow.message?.trim();
        const status = normalizeLeadStatus(normalizedRow.status) || "new_lead";
        const sourceCreatedAt = normalizedRow.sourceCreatedAt?.trim();
        const purchaseTimeline = normalizedRow.purchaseTimeline?.trim();
        const budgetRange = normalizedRow.budgetRange?.trim();

        if (!name || name.length < 2) {
          errors.push({ row: rowNumber, message: "Name is required" });
          return [];
        }

        if (!phone || phone.length < 6) {
          errors.push({ row: rowNumber, message: "Phone is required" });
          return [];
        }

        if (!allowedStatuses.has(status)) {
          errors.push({ row: rowNumber, message: "Invalid status" });
          return [];
        }

        if (seenPhones.has(phone)) {
          errors.push({ row: rowNumber, message: "Duplicate phone in CSV" });
          return [];
        }

        seenPhones.add(phone);

        return [
          {
            projectId: propertyId,
            name,
            phone,
            email: email || "",
            message: message || "",
            source: "imported",
            extraFields: row,
            sourceCreatedAt: sourceCreatedAt || "",
            purchaseTimeline: purchaseTimeline || "",
            budgetRange: budgetRange || "",
            status,
          },
        ];
      }
    );

    if (!normalizedRows.length) {
      return res.status(400).json({
        success: false,
        message: "No valid leads found in CSV",
        totalRows: rows.length,
        imported: 0,
        skipped: rows.length,
        errors,
      });
    }

    const importedPhones = normalizedRows.map((row: NormalizedLeadRow) => row.phone);
    const [existingPublicLeads, existingPropertyLeads]: [LeadPhoneRecord[], LeadPhoneRecord[]] =
      await Promise.all([
        PublicLead.find({
          projectId: propertyId,
          phone: { $in: importedPhones },
        })
          .select("phone")
          .lean(),
        Lead.find({
          projectId: propertyId,
          phone: { $in: importedPhones },
        })
          .select("phone")
          .lean(),
      ]);

    const existingPhones = new Set([
      ...existingPublicLeads.map((lead) => lead.phone),
      ...existingPropertyLeads.map((lead) => lead.phone),
    ]);
    const propertyRecord = property as any;
    const ownerUser =
      propertyRecord.createdBy && typeof propertyRecord.createdBy === "object"
        ? propertyRecord.createdBy
        : null;
    const ownerId = ownerUser?._id
      ? String(ownerUser._id)
      : String(propertyRecord.createdBy || "");
    const leadsToInsert = normalizedRows.filter((row: NormalizedLeadRow) => {
      if (!existingPhones.has(row.phone)) return true;
      errors.push({ row: 0, message: `Skipped existing phone ${row.phone}` });
      return false;
    }).map((row: NormalizedLeadRow) => ({
      ...row,
      ownerId: ownerId || undefined,
      propertyType: target.propertyType,
      propertyModel: target.model.modelName,
      propertySnapshot: buildLeadPropertySnapshot(property, target.propertyType),
      listingType: ["sale", "rent", "lease"].includes(String(propertyRecord.listingType || ""))
        ? propertyRecord.listingType
        : undefined,
    }));

    const importer = await User.findById(userId).select("name email phone").lean();
    const importedBy = {
      userId,
      name: String((importer as any)?.name || req.user?.name || ""),
      email: String((importer as any)?.email || req.user?.email || ""),
      phone: String((importer as any)?.phone || ""),
      roleName: String(req.user?.roleName || ""),
      at: new Date(),
    };
    const leadsWithImporter = leadsToInsert.map((row) => ({
      ...row,
      importedBy,
    }));
    const importedLeads = leadsWithImporter.length
      ? await PublicLead.insertMany(leadsWithImporter, { ordered: false })
      : [];
    const ownerPhone = String(ownerUser?.phone || "").trim();
    const listingTitle =
      propertyRecord.title ||
      propertyRecord.projectName ||
      propertyRecord.buildingName ||
      propertyRecord.propertySnapshot?.title ||
      "your property";
    let whatsappNotification = {
      attempted: false,
      sent: false,
      reason: "",
    };

    if (importedLeads.length && ownerId) {
      const leadLabel =
        importedLeads.length === 1
          ? `${importedLeads[0]?.name || "A lead"} was added as a lead`
          : `${importedLeads.length} leads were imported`;

      notifyOwnerAndAdmins({
        type: "contact_requested",
        title: importedLeads.length === 1 ? "New Property Lead" : "New Property Leads",
        body: `${leadLabel} for ${listingTitle}.`,
        actorUserId: String(userId || ""),
        ownerId,
        projectId: propertyId,
        propertyType: target.propertyType,
        metadata: {
          projectTitle: listingTitle,
          slug: propertyRecord.slug || "",
          listingKind: "property",
          category: target.propertyType,
          source: "imported",
          importedCount: importedLeads.length,
          userName: importedLeads[0]?.name || "",
          userPhone: importedLeads[0]?.phone || "",
          userEmail: importedLeads[0]?.email || "",
        },
      }).catch((err) =>
        console.error("Error sending imported property lead notification:", err),
      );
    }

    if (importedLeads.length && ownerPhone) {
      whatsappNotification.attempted = true;
      const audience = await resolveLeadImportAudience(ownerId, "user");
      const whatsappResult = await sendLeadImportSummaryWhatsApp(ownerPhone, {
        listingTitle,
        audience,
        importedCount: importedLeads.length,
        skippedCount: Math.max(0, rows.length - importedLeads.length),
        leads: importedLeads.map((lead: any) => ({
          name: lead.name,
          phone: lead.phone,
        })),
      });

      whatsappNotification = {
        attempted: true,
        sent: Boolean(whatsappResult),
        reason: whatsappResult ? "sent" : "send_failed",
      };
    } else if (!ownerPhone && importedLeads.length) {
      whatsappNotification.reason = "owner_phone_missing";
    } else if (!importedLeads.length) {
      whatsappNotification.reason = "no_new_imported_leads";
    }

    res.status(201).json({
      success: true,
      message: "Leads imported successfully",
      totalRows: rows.length,
      imported: leadsToInsert.length,
      skipped: rows.length - leadsToInsert.length,
      whatsappNotification,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to import leads",
    });
  }
};


