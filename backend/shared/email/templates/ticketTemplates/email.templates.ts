type TicketRaisedTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  submittedOn: Date;
  turnaroundHours?: number;
};

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);

const formatDateOnly = (value: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const detailRow = (label: string, value?: string) => {
  if (!value) return "";

  return `
    <tr>
      <td style="padding:10px 0;color:#5b6470;font-weight:600;vertical-align:top;width:170px;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;color:#1f2937;">${escapeHtml(value)}</td>
    </tr>
  `;
};

export const ticketRaisedSubject = (ticketId: string) =>
  `Ticket Raised Successfully - [${ticketId}]`;

type TicketAssignedTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  assignedTeam: string;
  currentStatus: string;
  turnaroundHours?: number;
};

type TicketUnderReviewTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  currentStatus: string;
};

type TicketInProgressTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  currentStatus: string;
  turnaroundHours?: number;
};

type TicketSupportResponseTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  supportResponse: string;
};

type TicketAwaitingUserResponseTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  requestedInformation: string;
  dueDate?: string;
};

type TicketAdditionalInformationReceivedTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  receivedOn: Date;
  currentStatus: string;
  turnaroundHours?: number;
};

type TicketAwaitingResponseReminderTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  currentStatus: string;
  dueDate?: string;
  requestedInformation?: string;
};

type TicketStatusUpdatedTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  previousStatus: string;
  newStatus: string;
  updatedOn: Date;
  updateMessage?: string;
};

type TicketEscalatedTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  escalatedTo: string;
  currentStatus: string;
  turnaroundHours?: number;
};

type TicketTransferredTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  transferredFrom: string;
  transferredTo: string;
  currentStatus: string;
  turnaroundHours?: number;
};

type TicketAwaitingExternalResponseTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  awaitingResponseFrom: string;
  currentStatus: string;
};

type TicketResolutionDelayedTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  currentStatus: string;
  delayReason: string;
  revisedResolutionTime?: string;
};

type TicketSupportCallbackScheduledTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  callbackDate: string;
  callbackTime: string;
  contactNumber: string;
};

type TicketResolvedTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  resolvedOn: Date;
  resolutionSummary?: string;
  reopenWindowDays?: number;
};

type TicketResolutionConfirmationReminderTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  confirmationDueDate?: string;
};

type TicketReopenedTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  reopenedOn: Date;
  currentStatus: string;
  turnaroundHours?: number;
};

type TicketClosedTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  closedOn: Date;
  resolutionSummary?: string;
};

type TicketAutoClosedTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  closedOn: Date;
  reason?: string;
  reopenWindowDays?: number;
};

type TicketCancelledTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  cancelledOn: Date;
  currentStatus: string;
};

type TicketInvalidTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  currentStatus: string;
  reason: string;
};

type TicketDuplicateTemplateParams = {
  duplicateTicketId: string;
  existingTicketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
};

type TicketAttachmentIssueTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  attachmentName: string;
  issueIdentified: string;
  dueDate?: string;
};

type TicketUserReplyReceivedTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
  replyReceivedOn: Date;
  currentStatus: string;
  turnaroundHours?: number;
};

type TicketFeedbackRequestTemplateParams = {
  ticketId: string;
  requesterName: string;
  category?: string;
  subject: string;
  propertyId?: string;
  propertyTitle?: string;
  projectId?: string;
  projectName?: string;
};

export const ticketRaisedTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  submittedOn,
  turnaroundHours = 24,
}: TicketRaisedTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Ticket Raised Successfully
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Your support ticket has been raised successfully. Our team will review it and respond within
        <strong>${turnaroundHours} hours</strong>.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Submitted On", formatDateTime(submittedOn))}
      </table>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        You can view and track this ticket from your Propenu account.
      </p>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketAssignedSubject = (ticketId: string) =>
  `Ticket Assigned to Support Team - [${ticketId}]`;

export const ticketAssignedTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  assignedTeam,
  currentStatus,
  turnaroundHours = 24,
}: TicketAssignedTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Ticket Assigned to Support Team
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Your support ticket has been assigned to the relevant support team. The assigned team will
        review your request and share an update within <strong>${turnaroundHours} hours</strong>.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Assigned Team", assignedTeam)}
        ${detailRow("Current Status", currentStatus)}
      </table>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

type TicketHandlerAssignedTemplateParams = {
  ticketId: string;
  handlerName: string;
  requesterName: string;
  assignedBy?: string;
  category?: string;
  subject: string;
  description?: string;
  priority?: string;
  dueOn?: Date;
  ticketUrl?: string;
};

export const ticketHandlerAssignedSubject = (ticketId: string, subject: string) =>
  `New ticket assigned to you - [${ticketId}] ${subject}`;

export const ticketHandlerAssignedTemplate = ({
  ticketId,
  handlerName,
  requesterName,
  assignedBy,
  category,
  subject,
  description,
  priority,
  dueOn,
  ticketUrl,
}: TicketHandlerAssignedTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;font-weight:700;">
        Propenu Ticket Desk
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        A ticket has been assigned to you
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(handlerName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        <strong>${escapeHtml(assignedBy || requesterName)}</strong> has assigned you a ticket that needs your action.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Subject", subject)}
        ${detailRow("Raised For", requesterName)}
        ${detailRow("Category", category)}
        ${detailRow("Priority", priority)}
        ${detailRow("Due On", dueOn ? formatDateTime(dueOn) : undefined)}
        ${detailRow("Description", description)}
      </table>

      ${
        ticketUrl
          ? `<p style="margin:24px 0 0;">
        <a href="${escapeHtml(ticketUrl)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#27AE60;color:#ffffff;font-weight:700;text-decoration:none;">Open ticket</a>
      </p>`
          : ""
      }

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketUnderReviewSubject = (ticketId: string) =>
  `Ticket Under Review - [${ticketId}]`;

export const ticketUnderReviewTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  currentStatus,
}: TicketUnderReviewTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#7c3aed;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Ticket Under Review
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Our support team has started reviewing your request. We are checking the details provided
        and will share an update once the review is completed.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#f5f3ff;border:1px solid #ddd6fe;color:#6d28d9;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Current Status", currentStatus)}
      </table>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        No action is required from you at this stage.
      </p>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketInProgressSubject = (ticketId: string) =>
  `Work Has Started on Your Support Ticket - [${ticketId}]`;

export const ticketInProgressTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  currentStatus,
  turnaroundHours = 24,
}: TicketInProgressTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#b45309;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Ticket In Progress
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Our support team is currently working on your request. We are taking the necessary steps to
        address the issue and will share the next update within <strong>${turnaroundHours} hours</strong>.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Current Status", currentStatus)}
      </table>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketSupportResponseSubject = (ticketId: string) =>
  `New Response on Your Support Ticket - [${ticketId}]`;

export const ticketSupportResponseTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  supportResponse,
}: TicketSupportResponseTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Support Team Response
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Our support team has responded to your ticket.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
      </table>

      <div style="margin:22px 0 0;padding:18px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#374151;">Support Response</p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#374151;">${escapeHtml(supportResponse)}</p>
      </div>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        Please review the response and reply through your Propenu account if you need further assistance.
      </p>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketAwaitingUserResponseSubject = (ticketId: string) =>
  `Action Required: More Information Needed - [${ticketId}]`;

export const ticketAwaitingUserResponseTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  requestedInformation,
  dueDate,
}: TicketAwaitingUserResponseTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#b91c1c;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Additional Information Required
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        We need some additional information to continue reviewing your request.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
      </table>

      <div style="margin:22px 0 0;padding:18px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#374151;">Please provide the following</p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#374151;">${escapeHtml(requestedInformation)}</p>
      </div>

      ${
        dueDate
          ? `<p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        Kindly submit the requested information by <strong>${escapeHtml(dueDate)}</strong>.
      </p>`
          : ""
      }

      <p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        Your ticket will remain under <strong>Awaiting User Response</strong> until we receive it.
      </p>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketAdditionalInformationReceivedSubject = (ticketId: string) =>
  `We Have Received Your Information - [${ticketId}]`;

export const ticketAdditionalInformationReceivedTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  receivedOn,
  currentStatus,
  turnaroundHours = 24,
}: TicketAdditionalInformationReceivedTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Additional Information Received
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        We have received the additional information submitted for your ticket.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Received On", formatDateTime(receivedOn))}
        ${detailRow("Current Status", currentStatus)}
      </table>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        Our support team will review the submitted details and share the next update within
        <strong>${turnaroundHours} hours</strong>.
      </p>

      <p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        No further action is required from you unless our team contacts you again.
      </p>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketAwaitingResponseReminderSubject = (ticketId: string) =>
  `Your Ticket Is Awaiting Your Response - [${ticketId}]`;

export const ticketAwaitingResponseReminderTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  currentStatus,
  dueDate,
  requestedInformation,
}: TicketAwaitingResponseReminderTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#b91c1c;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Awaiting User Response
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Your support ticket is currently waiting for your response.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Current Status", currentStatus)}
      </table>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        ${
          requestedInformation
            ? `Please provide the requested ${escapeHtml(requestedInformation)}`
            : "Please provide the requested screenshot or information"
        }${
          dueDate ? ` by <strong>${escapeHtml(dueDate)}</strong>` : ""
        } so that our team can continue reviewing the issue.
      </p>

      <p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        If we do not receive a response within the given period, the ticket may be closed automatically.
      </p>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketStatusUpdatedSubject = (ticketId: string) =>
  `Your Ticket Status Has Been Updated - [${ticketId}]`;

export const ticketStatusUpdatedTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  previousStatus,
  newStatus,
  updatedOn,
  updateMessage,
}: TicketStatusUpdatedTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Ticket Status Updated
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        The status of your support ticket has been updated.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Previous Status", previousStatus)}
        ${detailRow("New Status", newStatus)}
        ${detailRow("Updated On", formatDateTime(updatedOn))}
      </table>

      ${
        updateMessage
          ? `<div style="margin:22px 0 0;padding:18px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;">
        <p style="margin:0;font-size:14px;line-height:1.7;color:#374151;">${escapeHtml(updateMessage)}</p>
      </div>`
          : ""
      }

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        You can view the complete ticket history from your Propenu account.
      </p>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketEscalatedSubject = (ticketId: string) =>
  `Your Support Ticket Has Been Escalated - [${ticketId}]`;

export const ticketEscalatedTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  escalatedTo,
  currentStatus,
  turnaroundHours = 48,
}: TicketEscalatedTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#b91c1c;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Ticket Escalated
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Your support ticket has been escalated for further review.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Escalated To", escalatedTo)}
        ${detailRow("Current Status", currentStatus)}
      </table>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        The issue requires additional technical review. The concerned team will share an update within
        <strong>${turnaroundHours} hours</strong>.
      </p>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketTransferredSubject = (ticketId: string) =>
  `Your Support Ticket Has Been Transferred - [${ticketId}]`;

export const ticketTransferredTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  transferredFrom,
  transferredTo,
  currentStatus,
  turnaroundHours = 24,
}: TicketTransferredTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Ticket Transferred to Another Department
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Your support ticket has been transferred to the department best suited to handle your request.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Transferred From", transferredFrom)}
        ${detailRow("Transferred To", transferredTo)}
        ${detailRow("Current Status", currentStatus)}
      </table>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        The new department will review your request and share an update within
        <strong>${turnaroundHours} hours</strong>. Your Ticket ID will remain unchanged.
      </p>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketAwaitingExternalResponseSubject = (ticketId: string) =>
  `Your Ticket Is Awaiting an External Response - [${ticketId}]`;

export const ticketAwaitingExternalResponseTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  awaitingResponseFrom,
  currentStatus,
}: TicketAwaitingExternalResponseTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Awaiting External Response
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Your support ticket is currently awaiting information or confirmation from another party.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Awaiting Response From", awaitingResponseFrom)}
        ${detailRow("Current Status", currentStatus)}
      </table>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        We will continue reviewing the ticket once the required response is received. No action is required from you at this stage.
      </p>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketResolutionDelayedSubject = (ticketId: string) =>
  `Update on the Resolution Timeline - [${ticketId}]`;

export const ticketResolutionDelayedTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  currentStatus,
  delayReason,
  revisedResolutionTime,
}: TicketResolutionDelayedTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#b45309;font-weight:700;">
        Propenu Support
      </p>

      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Resolution Delayed
      </h2>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Resolving your support ticket is taking longer than expected.
      </p>

      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Current Status", currentStatus)}
      </table>

      <div style="margin:22px 0 0;padding:18px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#374151;">Reason for the Delay</p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#374151;">${escapeHtml(delayReason)}</p>
      </div>

      ${
        revisedResolutionTime
          ? `<p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        The revised expected resolution time is <strong>${escapeHtml(revisedResolutionTime)}</strong>.
      </p>`
          : ""
      }

      <p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        We apologise for the delay and appreciate your patience.
      </p>

      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketSupportCallbackScheduledSubject = (ticketId: string) =>
  `Your Support Callback Has Been Scheduled - [${ticketId}]`;

export const ticketSupportCallbackScheduledTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  callbackDate,
  callbackTime,
  contactNumber,
}: TicketSupportCallbackScheduledTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;font-weight:700;">
        Propenu Support
      </p>
      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Support Callback Scheduled
      </h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        A support callback has been scheduled regarding your ticket.
      </p>
      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Callback Date", callbackDate)}
        ${detailRow("Callback Time", callbackTime)}
        ${detailRow("Contact Number", contactNumber)}
      </table>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        A Propenu support representative will contact you during the scheduled time. Please ensure that the registered phone number is available.
      </p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketResolvedSubject = (ticketId: string) =>
  `Your Support Ticket Has Been Resolved - [${ticketId}]`;

export const ticketResolvedTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  resolvedOn,
  resolutionSummary,
  reopenWindowDays = 7,
}: TicketResolvedTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;font-weight:700;">
        Propenu Support
      </p>
      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Ticket Resolved
      </h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Your support ticket has been marked as resolved.
      </p>
      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Resolved On", formatDateTime(resolvedOn))}
      </table>
      ${
        resolutionSummary
          ? `<div style="margin:22px 0 0;padding:18px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#374151;">Resolution Summary</p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#374151;">${escapeHtml(resolutionSummary)}</p>
      </div>`
          : ""
      }
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        Please confirm whether the issue has been addressed. You can reopen the ticket within <strong>${reopenWindowDays} days</strong> if the issue continues.
      </p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketResolutionConfirmationReminderSubject = (ticketId: string) =>
  `Please Confirm the Resolution - [${ticketId}]`;

export const ticketResolutionConfirmationReminderTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  confirmationDueDate,
}: TicketResolutionConfirmationReminderTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#b45309;font-weight:700;">
        Propenu Support
      </p>
      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Resolution Confirmation Reminder
      </h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Your support ticket was recently marked as resolved, and we are waiting for your confirmation.
      </p>
      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
      </table>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        Please select <strong>Confirm Resolution</strong> if the issue has been resolved or <strong>Reopen Ticket</strong> if you still require assistance.
      </p>
      ${
        confirmationDueDate
          ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        If we do not receive a response by <strong>${escapeHtml(confirmationDueDate)}</strong>, the ticket may be closed automatically.
      </p>`
          : ""
      }
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketReopenedSubject = (ticketId: string) =>
  `Your Support Ticket Has Been Reopened - [${ticketId}]`;

export const ticketReopenedTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  reopenedOn,
  currentStatus,
  turnaroundHours = 24,
}: TicketReopenedTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;font-weight:700;">
        Propenu Support
      </p>
      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">
        Ticket Reopened
      </h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
        Hi <strong>${escapeHtml(requesterName)}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
        Your support ticket has been reopened successfully.
      </p>
      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;">
        <strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Reopened On", formatDateTime(reopenedOn))}
        ${detailRow("Current Status", currentStatus)}
      </table>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
        Our support team will review your latest response and share an update within <strong>${turnaroundHours} hours</strong>.
      </p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">
        Regards,<br />
        <strong>Propenu Support Team</strong>
      </p>
    </div>
  </div>
`;

export const ticketClosedSubject = (ticketId: string) =>
  `Your Support Ticket Has Been Closed - [${ticketId}]`;

export const ticketClosedTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  closedOn,
  resolutionSummary,
}: TicketClosedTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;font-weight:700;">Propenu Support</p>
      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">Ticket Closed</h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">Hi <strong>${escapeHtml(requesterName)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">Your support ticket has been closed.</p>
      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;"><strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]</div>
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Closed On", formatDateTime(closedOn))}
      </table>
      ${
        resolutionSummary
          ? `<div style="margin:22px 0 0;padding:18px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#374151;">Resolution Summary</p><p style="margin:0;font-size:14px;line-height:1.7;color:#374151;">${escapeHtml(resolutionSummary)}</p></div>`
          : ""
      }
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">You can raise a new ticket from your Propenu account if you require further assistance.</p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">Regards,<br /><strong>Propenu Support Team</strong></p>
    </div>
  </div>
`;

export const ticketAutoClosedSubject = (ticketId: string) =>
  `Your Support Ticket Was Automatically Closed - [${ticketId}]`;

export const ticketAutoClosedTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  closedOn,
  reason,
  reopenWindowDays = 7,
}: TicketAutoClosedTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#b91c1c;font-weight:700;">Propenu Support</p>
      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">Ticket Automatically Closed</h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">Hi <strong>${escapeHtml(requesterName)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">Your support ticket has been automatically closed because we did not receive the required response within the given period.</p>
      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;"><strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]</div>
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Closed On", formatDateTime(closedOn))}
      </table>
      ${
        reason
          ? `<div style="margin:22px 0 0;padding:18px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#374151;">Reason</p><p style="margin:0;font-size:14px;line-height:1.7;color:#374151;">${escapeHtml(reason)}</p></div>`
          : ""
      }
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">You may reopen the ticket within <strong>${reopenWindowDays} days</strong>, where applicable. After that period, you can raise a new support ticket.</p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">Regards,<br /><strong>Propenu Support Team</strong></p>
    </div>
  </div>
`;

export const ticketCancelledSubject = (ticketId: string) =>
  `Your Support Ticket Has Been Cancelled - [${ticketId}]`;

export const ticketCancelledTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  cancelledOn,
  currentStatus,
}: TicketCancelledTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;font-weight:700;">Propenu Support</p>
      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">Ticket Cancelled by User</h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">Hi <strong>${escapeHtml(requesterName)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">Your request to cancel the following support ticket has been completed.</p>
      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#f3f4f6;border:1px solid #d1d5db;color:#374151;"><strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]</div>
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Cancelled On", formatDateTime(cancelledOn))}
        ${detailRow("Current Status", currentStatus)}
      </table>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">No further action will be taken on this ticket. You can raise a new ticket if you need assistance with the issue again.</p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">Regards,<br /><strong>Propenu Support Team</strong></p>
    </div>
  </div>
`;

export const ticketInvalidSubject = (ticketId: string) =>
  `Your Support Ticket Could Not Be Processed - [${ticketId}]`;

export const ticketInvalidTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  currentStatus,
  reason,
}: TicketInvalidTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#b91c1c;font-weight:700;">Propenu Support</p>
      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">Ticket Rejected or Marked Invalid</h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">Hi <strong>${escapeHtml(requesterName)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">We were unable to process your support ticket.</p>
      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;"><strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]</div>
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Current Status", currentStatus)}
      </table>
      <div style="margin:22px 0 0;padding:18px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#374151;">Reason</p><p style="margin:0;font-size:14px;line-height:1.7;color:#374151;">${escapeHtml(reason)}</p></div>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">Please review the reason and raise a new ticket with the correct information if you still require assistance.</p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">Regards,<br /><strong>Propenu Support Team</strong></p>
    </div>
  </div>
`;

export const ticketDuplicateSubject = (ticketId: string) =>
  `Duplicate Support Ticket Identified - [${ticketId}]`;

export const ticketDuplicateTemplate = ({
  duplicateTicketId,
  existingTicketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
}: TicketDuplicateTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;font-weight:700;">Propenu Support</p>
      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">Duplicate Ticket Identified</h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">Hi <strong>${escapeHtml(requesterName)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">We found that a support ticket has already been raised for the same issue.</p>
      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;"><strong>Duplicate Ticket ID:</strong> [${escapeHtml(duplicateTicketId)}]</div>
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Existing Ticket ID", existingTicketId)}
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
      </table>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">The duplicate ticket has been closed. Our support team will continue providing updates through <strong>[${escapeHtml(existingTicketId)}]</strong>.</p>
      <p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">Please use the existing Ticket ID to track the issue or submit additional information.</p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">Regards,<br /><strong>Propenu Support Team</strong></p>
    </div>
  </div>
`;

export const ticketAttachmentIssueSubject = (ticketId: string) =>
  `Action Required: Update Your Attachment - [${ticketId}]`;

export const ticketAttachmentIssueTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  attachmentName,
  issueIdentified,
  dueDate,
}: TicketAttachmentIssueTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#b91c1c;font-weight:700;">Propenu Support</p>
      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">Attachment or Document Issue</h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">Hi <strong>${escapeHtml(requesterName)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">We found an issue with the attachment submitted for your support ticket.</p>
      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;"><strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]</div>
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Attachment", attachmentName)}
      </table>
      <div style="margin:22px 0 0;padding:18px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#374151;">Issue Identified</p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#374151;">${escapeHtml(issueIdentified)}</p>
      </div>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">Please upload a clear and complete file${dueDate ? ` by <strong>${escapeHtml(dueDate)}</strong>` : ""}. Your ticket will remain under <strong>Awaiting User Response</strong> until the attachment is received.</p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">Regards,<br /><strong>Propenu Support Team</strong></p>
    </div>
  </div>
`;

export const ticketUserReplyReceivedSubject = (ticketId: string) =>
  `We Have Received Your Reply - [${ticketId}]`;

export const ticketUserReplyReceivedTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
  replyReceivedOn,
  currentStatus,
  turnaroundHours = 24,
}: TicketUserReplyReceivedTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;font-weight:700;">Propenu Support</p>
      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">User Reply Received</h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">Hi <strong>${escapeHtml(requesterName)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">We have received your reply regarding the following support ticket:</p>
      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;"><strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]</div>
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
        ${detailRow("Reply Received On", formatDateTime(replyReceivedOn))}
        ${detailRow("Current Status", currentStatus)}
      </table>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">Our support team will review your response and share the next update within <strong>${turnaroundHours} hours</strong>.</p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">Regards,<br /><strong>Propenu Support Team</strong></p>
    </div>
  </div>
`;

export const ticketFeedbackRequestSubject = (ticketId: string) =>
  `Share Your Support Experience - [${ticketId}]`;

export const ticketFeedbackRequestTemplate = ({
  ticketId,
  requesterName,
  category,
  subject,
  propertyId,
  propertyTitle,
  projectId,
  projectName,
}: TicketFeedbackRequestTemplateParams) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f6f8fb;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;font-weight:700;">Propenu Support</p>
      <h2 style="margin:0 0 18px;font-size:24px;line-height:1.35;color:#111827;">Support Feedback Request</h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">Hi <strong>${escapeHtml(requesterName)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">Your support ticket has been resolved and closed.</p>
      <div style="margin:0 0 22px;padding:14px 18px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;"><strong>Ticket ID:</strong> [${escapeHtml(ticketId)}]</div>
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Ticket Category", category)}
        ${detailRow("Ticket Subject", subject)}
        ${detailRow("Property ID", propertyId)}
        ${detailRow("Property Title", propertyTitle)}
        ${detailRow("Project ID", projectId)}
        ${detailRow("Project Name", projectName)}
      </table>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">Please rate your support experience and share your feedback through your Propenu account. Your feedback will help us improve the Propenu support experience.</p>
      <p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">Thank you for choosing Propenu.</p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#374151;">Regards,<br /><strong>Propenu Support Team</strong></p>
    </div>
  </div>
`;
