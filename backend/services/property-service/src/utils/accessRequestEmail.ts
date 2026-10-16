import { sendEmail } from "../../../../shared/email/email.service";
import {
  ctaButton,
  emailLayout,
} from "../../../../shared/email/templates/ownerTemplates/email.templates";
import { buildUnsubscribeUrl } from "../../../user-service/src/utils/unsubscribeToken";

export const ACCESS_AREA_LABELS: Record<string, string> = {
  properties: "Deleted properties",
  propertyLeads: "Deleted property leads",
  projects: "Deleted projects",
  projectLeads: "Deleted project leads",
  leadContacts: "Full lead contacts",
};

const AREA_WHERE: Record<string, string> = {
  properties: "Properties page → Deleted menu",
  propertyLeads: "Properties page → Deleted menu",
  projects: "Projects page → Deleted menu",
  projectLeads: "Projects page → Deleted menu",
  leadContacts: "Leads page",
};

type Person = { name?: string; email?: string; roleName?: string };

const escapeHtml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const roleLabel = (value?: string) =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Staff";

const adminUrl = (path: string) =>
  `${String(process.env.ADMIN_DASHBOARD_URL || "https://admin.propenu.com").replace(/\/+$/, "")}${path}`;

const when = (value: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);

const rows = (items: Array<[string, string]>) => `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;font-size:14px;color:#374151;">
    ${items
      .filter(([, value]) => value)
      .map(
        ([label, value]) => `
      <tr>
        <td style="padding:6px 0;width:150px;color:#6b7280;font-weight:600;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:6px 0;">${escapeHtml(value)}</td>
      </tr>`,
      )
      .join("")}
  </table>`;

const heading = (text: string) =>
  `<h2 style="margin:0 0 16px 0;font-size:22px;line-height:30px;color:#111827;">${escapeHtml(text)}</h2>`;

const para = (html: string) =>
  `<p style="margin:0 0 14px 0;font-size:15px;line-height:24px;color:#374151;">${html}</p>`;

async function deliver(to: string | undefined, subject: string, body: string) {
  const email = String(to || "").trim();
  if (!email) return;
  try {
    await sendEmail({ to: email, subject, html: emailLayout(body, buildUnsubscribeUrl(email)) });
  } catch (error) {
    console.error("[access-request-email] failed:", error);
  }
}

export function sendAccessRequestedEmail(input: {
  approver: Person;
  requester: Person;
  area: string;
  scope: "heads" | "team";
  reason: string;
  ticketCode: string;
  at: Date;
}) {
  const label = ACCESS_AREA_LABELS[input.area] || input.area;
  const ticket = input.ticketCode ? `#${input.ticketCode}` : "";
  const fromTeam = input.scope === "team" ? ", your team" : "";
  return deliver(
    input.approver.email,
    `Access request ${ticket} – ${label} (${roleLabel(input.requester.roleName)})`,
    `
      ${heading("Access request")}
      ${para(`Hi <b>${escapeHtml(input.approver.name || "there")}</b>,`)}
      ${para(
        `<b>${escapeHtml(input.requester.name || "A staff member")}</b> (${escapeHtml(
          roleLabel(input.requester.roleName),
        )}${fromTeam}) has requested access.`,
      )}
      ${rows([
        ["Access requested", label],
        ["Level", input.scope === "heads" ? "All heads" : "My team"],
        ["Reason", input.reason || "—"],
        ["Ticket", ticket],
        ["Raised on", when(input.at)],
      ])}
      ${para("Open the ticket to enable or reject this request.")}
      ${ctaButton("Open ticket", adminUrl("/tickets"))}
    `,
  );
}

export function sendAccessApprovedEmail(input: {
  requester: Person;
  decidedBy: Person;
  area: string;
  scope: "heads" | "team";
  ticketCode: string;
  at: Date;
}) {
  const label = ACCESS_AREA_LABELS[input.area] || input.area;
  const ticket = input.ticketCode ? `#${input.ticketCode}` : "";
  const shareHint =
    input.scope === "heads" && input.area !== "leadContacts"
      ? para("You can also share this access with your team from Deleted → Deleted access.")
      : input.scope === "heads"
        ? para("You can also share full contacts with your team from the Leads page.")
        : "";
  return deliver(
    input.requester.email,
    `Access granted – ${label}${ticket ? ` (${ticket})` : ""}`,
    `
      ${heading("Access granted")}
      ${para(`Hi <b>${escapeHtml(input.requester.name || "there")}</b>,`)}
      ${para("Your access request has been approved.")}
      ${rows([
        ["Access", label],
        ["Approved by", `${input.decidedBy.name || "—"} (${roleLabel(input.decidedBy.roleName)})`],
        ["Approved on", when(input.at)],
        ["Ticket", ticket ? `${ticket} – Resolved` : ""],
      ])}
      ${para(`You can now open it from the <b>${escapeHtml(AREA_WHERE[input.area] || "dashboard")}</b>.`)}
      ${shareHint}
    `,
  );
}

export function sendAccessRejectedEmail(input: {
  requester: Person;
  decidedBy: Person;
  area: string;
  ticketCode: string;
  note: string;
}) {
  const label = ACCESS_AREA_LABELS[input.area] || input.area;
  const ticket = input.ticketCode ? `#${input.ticketCode}` : "";
  return deliver(
    input.requester.email,
    `Access request not approved – ${label}${ticket ? ` (${ticket})` : ""}`,
    `
      ${heading("Access request not approved")}
      ${para(`Hi <b>${escapeHtml(input.requester.name || "there")}</b>,`)}
      ${para("Your access request was not approved.")}
      ${rows([
        ["Access", label],
        ["Reviewed by", `${input.decidedBy.name || "—"} (${roleLabel(input.decidedBy.roleName)})`],
        ["Reason", input.note || "—"],
        ["Ticket", ticket ? `${ticket} – Closed` : ""],
      ])}
    `,
  );
}
