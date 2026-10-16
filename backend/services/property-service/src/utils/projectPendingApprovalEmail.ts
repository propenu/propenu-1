import User from "../models/userModel";
import Role from "../models/roleModel";
import { sendEmail } from "../../../../shared/email/email.service";
import {
  ctaButton,
  emailLayout,
} from "../../../../shared/email/templates/ownerTemplates/email.templates";
import { buildUnsubscribeUrl } from "../../../user-service/src/utils/unsubscribeToken";
import {
  canApproveProjectByHierarchy,
  normalizeProjectRole,
} from "./projectApprovalPolicy";

type ApprovingHead = {
  id: string;
  name: string;
  email: string;
  roleName: string;
};

const USER_FIELDS =
  "name email role roleName roleId managerId isActive isUnsubscribedToEmail city lastLoginAt";

const ROLE_POPULATE = { path: "roleId", select: "name label" };

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const roleOf = (user: any) =>
  normalizeProjectRole(
    user?.roleId?.name || user?.roleName || user?.role || user?.roleId?.label,
  );

const roleLabel = (roleName: string) =>
  normalizeProjectRole(roleName).replace(/_/g, " ") || "staff";

const managerPopulate = (depth: number): any => {
  if (depth <= 0) return [ROLE_POPULATE];
  return [
    ROLE_POPULATE,
    {
      path: "managerId",
      select: USER_FIELDS,
      populate: managerPopulate(depth - 1),
    },
  ];
};

const asHead = (user: any): ApprovingHead | null => {
  const email = String(user?.email || "")
    .trim()
    .toLowerCase();
  const id = String(user?._id || "").trim();
  if (!email || !id) return null;
  if (user?.isActive === false) return null;
  if (user?.isUnsubscribedToEmail === true) return null;
  return {
    id,
    name: String(user?.name || "there").trim() || "there",
    email,
    roleName: roleOf(user),
  };
};

const REGIONAL_MANAGER_ROLE_NAMES = ["regional_manager", "regional_managers"];

const isRegionalManagerRole = (roleName: string) =>
  REGIONAL_MANAGER_ROLE_NAMES.includes(normalizeProjectRole(roleName));

const headCanApprove = (
  head: ApprovingHead,
  creatorRole: string,
  creatorId: string,
) =>
  canApproveProjectByHierarchy({
    actorRole: head.roleName,
    actorId: head.id,
    creatorRole,
    creatorId,
  }).ok;

const findHeadInManagerChain = (
  poster: any,
  creatorRole: string,
  creatorId: string,
) => {
  const seen = new Set<string>();
  let current = poster?.managerId;

  while (current && typeof current === "object") {
    const id = String(current._id || "");
    if (!id || seen.has(id)) break;
    seen.add(id);

    const head = asHead(current);
    if (
      head &&
      head.id !== creatorId &&
      head.roleName !== "sales_manager" &&
      isRegionalManagerRole(head.roleName) &&
      headCanApprove(head, creatorRole, creatorId)
    ) {
      return head;
    }

    current = current.managerId;
  }

  return null;
};

const findFallbackHead = async (
  creatorRole: string,
  creatorId: string,
  city?: string,
) => {
  const roles = await Role.find({
    name: { $in: REGIONAL_MANAGER_ROLE_NAMES },
  })
    .select("_id")
    .lean();
  if (!roles.length) return null;

  const base = {
    _id: { $ne: creatorId },
    roleId: { $in: roles.map((role) => role._id) },
    isActive: { $ne: false },
    isUnsubscribedToEmail: { $ne: true },
    email: { $exists: true, $nin: [null, ""] },
  };

  const query = (extra: Record<string, unknown> = {}) =>
    User.findOne({ ...base, ...extra })
      .sort({ lastLoginAt: -1, createdAt: -1 })
      .select(USER_FIELDS)
      .populate(ROLE_POPULATE)
      .lean();

  const cityName = String(city || "").trim();
  const user = (cityName ? await query({ city: cityName }) : null) || (await query());
  const head = asHead(user);
  if (!head || !headCanApprove(head, creatorRole, creatorId)) return null;
  return head;
};

export const findProjectApprovingHead = async ({
  posterId,
  posterRole,
}: {
  posterId: string;
  posterRole?: string | null | undefined;
}) => {
  const poster = await User.findById(posterId)
    .select(USER_FIELDS)
    .populate(managerPopulate(6))
    .lean();

  const creatorRole = roleOf(poster) || normalizeProjectRole(posterRole);
  const creatorId = String(posterId);
  const fromChain = findHeadInManagerChain(poster, creatorRole, creatorId);
  if (fromChain) return fromChain;

  return findFallbackHead(creatorRole, creatorId, (poster as any)?.city);
};

const projectLocation = (project: any) => {
  const locality = String(project?.locality || "").trim();
  const city = String(project?.city || "").trim();
  return [locality, city].filter(Boolean).join(", ") || "your area";
};

const projectPageUrl = (project: any) => {
  const base = (process.env.FRONTEND_URL || "https://propenu.com").replace(
    /\/$/,
    "",
  );
  const slug = String(project?.slug || "").trim();
  return slug ? `${base}/project/${slug}` : base;
};

export const sendPendingProjectApprovalEmail = async ({
  project,
  posterId,
  posterName,
  posterRole,
}: {
  project: any;
  posterId: string;
  posterName?: string | null | undefined;
  posterRole?: string | null | undefined;
}) => {
  const approvalStatus = String(project?.approvalStatus || "").toLowerCase();
  if (approvalStatus !== "pending" || !posterId) return { sent: false };

  const head = await findProjectApprovingHead({ posterId, posterRole });
  if (!head) {
    console.warn(
      "[project-approval-email] No approving head found for poster",
      posterId,
    );
    return { sent: false };
  }

  const title = String(project?.title || "a project").trim() || "a project";
  const poster = String(posterName || "A staff member").trim() || "A staff member";
  const location = projectLocation(project);
  const link = projectPageUrl(project);
  const safeTitle = escapeHtml(title);
  const safePoster = escapeHtml(poster);
  const safeRole = escapeHtml(roleLabel(posterRole || ""));
  const safeLocation = escapeHtml(location);
  const safeHead = escapeHtml(head.name);

  const html = emailLayout(
    `
      <h2 style="margin:0 0 16px 0;font-size:22px;line-height:30px;color:#111827;">
        Approval pending
      </h2>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:24px;color:#374151;">
        Hi <b>${safeHead}</b>,
      </p>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:24px;color:#374151;">
        <b>${safePoster}</b> (${safeRole}) posted <b>${safeTitle}</b> in <b>${safeLocation}</b>.
      </p>
      <p style="margin:0 0 22px 0;font-size:15px;line-height:24px;color:#374151;">
        Status: <b>Approval pending</b>. Please review this project and approve it.
      </p>
      ${ctaButton("Open project", link)}
    `,
    buildUnsubscribeUrl(head.email),
  );

  await sendEmail({
    to: head.email,
    subject: `Approval needed: ${title}`,
    html,
  });

  console.log(
    `[project-approval-email] Sent to ${head.email} (${head.roleName}) for ${title}`,
  );
  return { sent: true, to: head.email };
};
