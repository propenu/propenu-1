import mongoose from "mongoose";
import { closedTicketStatuses } from "./ticket.constants";
import { TicketRepository } from "./ticket.repository";
import {
  pickNextCustomerCareExecutiveDetailed,
  shouldAutoAssignCustomerCare,
  resolveAssignLocation,
  lookupRequesterLocation,
} from "./roundRobinAssign.service";
import { sendEmail } from "../../../../shared/email/email.service";
import { sendBulkPush } from "../../../../shared/notifications/push.service";
import { getActiveDeviceTokensForUsers } from "../../../../shared/notifications/deviceTokens";
import {
  ticketAdditionalInformationReceivedSubject,
  ticketAdditionalInformationReceivedTemplate,
  ticketAttachmentIssueSubject,
  ticketAttachmentIssueTemplate,
  ticketAutoClosedSubject,
  ticketAutoClosedTemplate,
  ticketAwaitingExternalResponseSubject,
  ticketAwaitingExternalResponseTemplate,
  ticketAwaitingResponseReminderSubject,
  ticketAwaitingResponseReminderTemplate,
  ticketAwaitingUserResponseSubject,
  ticketAwaitingUserResponseTemplate,
  ticketEscalatedSubject,
  ticketEscalatedTemplate,
  ticketAssignedSubject,
  ticketAssignedTemplate,
  ticketHandlerAssignedSubject,
  ticketHandlerAssignedTemplate,
  ticketCancelledSubject,
  ticketCancelledTemplate,
  ticketClosedSubject,
  ticketClosedTemplate,
  ticketDuplicateSubject,
  ticketDuplicateTemplate,
  ticketFeedbackRequestSubject,
  ticketFeedbackRequestTemplate,
  ticketInProgressSubject,
  ticketInProgressTemplate,
  ticketInvalidSubject,
  ticketInvalidTemplate,
  ticketRaisedSubject,
  ticketRaisedTemplate,
  ticketReopenedSubject,
  ticketReopenedTemplate,
  ticketResolutionConfirmationReminderSubject,
  ticketResolutionConfirmationReminderTemplate,
  ticketResolvedSubject,
  ticketResolvedTemplate,
  ticketResolutionDelayedSubject,
  ticketResolutionDelayedTemplate,
  ticketStatusUpdatedSubject,
  ticketStatusUpdatedTemplate,
  ticketSupportCallbackScheduledSubject,
  ticketSupportCallbackScheduledTemplate,
  ticketSupportResponseSubject,
  ticketSupportResponseTemplate,
  ticketUserReplyReceivedSubject,
  ticketUserReplyReceivedTemplate,
  ticketTransferredSubject,
  ticketTransferredTemplate,
  ticketUnderReviewSubject,
  ticketUnderReviewTemplate,
} from "../../../../shared/email/templates/ticketTemplates/email.templates";
import type {
  CreateTicketInput,
  CreateRequestCallInput,
  TicketActor,
  TicketAttachment,
  TicketActivity,
  TicketDocument,
  TicketListQuery,
  TicketPriority,
  TicketStatus,
  UpdateTicketInput,
} from "./ticket.interface";

const cleanTags = (tags?: string[]) =>
  Array.from(
    new Set(
      (tags ?? [])
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  );

const activity = (
  action: string,
  message: string,
  actor?: TicketActor,
  from?: string,
  to?: string,
) => {
  const item: TicketActivity = { action, message, createdAt: new Date() };
  if (actor) item.actor = actor;
  if (from) item.from = from;
  if (to) item.to = to;
  return item;
};

const requesterActor = (input: { requester: CreateTicketInput["requester"] }): TicketActor => {
  const actor: TicketActor = { name: input.requester.name, role: "requester" };
  if (input.requester.userId) actor.userId = input.requester.userId;
  if (input.requester.email) actor.email = input.requester.email;
  return actor;
};

const toTitleCase = (value: string) =>
  value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const resolveAssignedTeamName = (ticket: { assignedTo?: TicketActor; department?: string }) => {
  if (ticket.assignedTo?.name) return ticket.assignedTo.name;
  if (ticket.assignedTo?.role) return `${toTitleCase(ticket.assignedTo.role)} Team`;
  if (ticket.department) return `${toTitleCase(ticket.department)} Support Team`;
  return "Support Team";
};

const resolveDepartmentTeamName = (department?: string) => {
  if (!department) return "Support Team";
  return `${toTitleCase(department)} Support Team`;
};

const formatTimeRange = (start?: string, end?: string) => {
  if (start && end) return `${start} to ${end}`;
  return start || end || "";
};

const generateTicketCode = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const value = `tk${Math.floor(10000 + Math.random() * 90000)}`;
    const exists = await TicketRepository.existsByTicketCode(value);
    if (!exists) return value;
  }

  throw new Error("Unable to generate unique ticket code");
};

const requesterLookupInput = (requester: CreateTicketInput["requester"]) => {
  const input: { userId?: string; email?: string } = {};
  const userId = (requester as any)?.userId || (requester as any)?.id;
  if (userId) input.userId = String(userId);
  if (requester?.email) input.email = requester.email;
  return input;
};

const isSupportActor = (author?: TicketActor) =>
  !!author && author.role !== "requester" && author.role !== "customer";

const buildTicketTemplateBase = (
  ticket: {
    _id: unknown;
    ticketCode?: string;
    requester: { name: string };
    title: string;
    category?: string;
    propertyId?: string;
    metadata?: Record<string, unknown>;
  },
) => {
  const metadata = (ticket.metadata ?? {}) as Record<string, unknown>;
  const base = {
    ticketId: ticket.ticketCode || String(ticket._id),
    requesterName: ticket.requester.name,
    subject: ticket.title,
  } as {
    ticketId: string;
    requesterName: string;
    subject: string;
    category?: string;
    propertyId?: string;
    propertyTitle?: string;
    projectId?: string;
    projectName?: string;
  };

  if (ticket.category) base.category = toTitleCase(ticket.category);
  if (typeof metadata.propertyCode === "string") base.propertyId = metadata.propertyCode;
  else if (ticket.propertyId) base.propertyId = ticket.propertyId;
  if (typeof metadata.propertyTitle === "string") base.propertyTitle = metadata.propertyTitle;
  if (typeof metadata.relatedProjectId === "string") base.projectId = metadata.relatedProjectId;
  if (typeof metadata.relatedProjectName === "string") base.projectName = metadata.relatedProjectName;

  return base;
};

const displayTicketId = (ticket: { _id: unknown; ticketCode?: string }) =>
  ticket.ticketCode || String(ticket._id);

type TicketPushType =
  | "ticket_created"
  | "ticket_assigned"
  | "ticket_updated"
  | "ticket_replied"
  | "ticket_status_changed"
  | "ticket_resolved"
  | "ticket_closed"
  | "ticket_reopened"
  | "ticket_escalated"
  | "ticket_priority_changed";

const getUserTokens = async (userIds: string[]) => {
  const validIds = Array.from(
    new Set(userIds.map((id) => String(id || "").trim()).filter(Boolean)),
  );

  return getActiveDeviceTokensForUsers(validIds);
};

const sendTicketPush = async ({
  ticket,
  type,
  title,
  body,
  userIds,
  audience,
}: {
  ticket: TicketDocument;
  type: TicketPushType;
  title: string;
  body: string;
  userIds: string[];
  audience: "requester" | "assignee";
}) => {
  try {
    const tokens = await getUserTokens(userIds);
    if (!tokens.length) return;

    await sendBulkPush({
      tokens,
      title,
      body,
      data: {
        type,
        audience,
        ticketId: String(ticket._id),
        ticketCode: displayTicketId(ticket),
        status: ticket.status,
      },
    });
  } catch (error) {
    console.error("ticket push notification failed:", error);
  }
};

const getStatusPushType = (status: TicketStatus): TicketPushType => {
  if (status === "resolved") return "ticket_resolved";
  if (status === "closed") return "ticket_closed";
  if (status === "reopened") return "ticket_reopened";
  if (status === "escalated") return "ticket_escalated";
  return "ticket_status_changed";
};

const ticketModule = (ticket: { metadata?: unknown }) =>
  (ticket.metadata as { module?: string } | undefined)?.module;

/** Access requests are raised by property-service, which sends its own access emails (only "resolved" also goes out from here). */
const isAccessRequestTicket = (ticket: { metadata?: unknown }) =>
  ticketModule(ticket) === "access_request";

/** Project approval tickets: property-service sends the raised/assigned emails; resolved and closed go out from here. */
const isProjectApprovalTicket = (ticket: { metadata?: unknown }) =>
  ticketModule(ticket) === "project_approval";

const isServiceManagedTicket = (ticket: { metadata?: unknown }) =>
  isAccessRequestTicket(ticket) || isProjectApprovalTicket(ticket);

const skipRequesterStatusEmail = (ticket: { metadata?: unknown }, status: TicketStatus) => {
  if (isAccessRequestTicket(ticket)) return status !== "resolved";
  if (isProjectApprovalTicket(ticket)) return status !== "resolved" && status !== "closed";
  return false;
};

const ADMIN_TICKETS_URL = `${(process.env.ADMIN_DASHBOARD_URL || "https://admin.propenu.com").replace(/\/+$/, "")}/tickets`;

const sendHandlerAssignedEmail = async (
  ticket: {
    _id: unknown;
    ticketCode?: string;
    title: string;
    description?: string;
    category?: string;
    priority?: string;
    dueAt?: Date;
    requester: { name: string; email?: string };
    assignedTo?: TicketActor;
    metadata?: unknown;
  },
  assignedBy?: string,
) => {
  const handlerEmail = String(ticket.assignedTo?.email || "").trim().toLowerCase();
  if (!handlerEmail || isServiceManagedTicket(ticket)) return;
  if (handlerEmail === String(ticket.requester.email || "").trim().toLowerCase()) return;

  const ticketId = displayTicketId(ticket);
  try {
    await sendEmail({
      to: handlerEmail,
      subject: ticketHandlerAssignedSubject(ticketId, ticket.title),
      html: ticketHandlerAssignedTemplate({
        ticketId,
        handlerName: ticket.assignedTo?.name || "there",
        requesterName: ticket.requester.name,
        ...(assignedBy ? { assignedBy } : {}),
        ...(ticket.category ? { category: toTitleCase(ticket.category) } : {}),
        subject: ticket.title,
        ...(ticket.description ? { description: ticket.description } : {}),
        ...(ticket.priority ? { priority: toTitleCase(ticket.priority) } : {}),
        ...(ticket.dueAt ? { dueOn: new Date(ticket.dueAt) } : {}),
        ticketUrl: ADMIN_TICKETS_URL,
      }),
    });
  } catch (error) {
    console.error("ticket handler email failed:", error);
  }
};

export class TicketService {
  private static displayTicketId(ticket: { _id: unknown; ticketCode?: string }) {
    return displayTicketId(ticket);
  }

  static async createTicket(input: CreateTicketInput) {
    const ticketCode = input.ticketCode ?? (await generateTicketCode());
    const requestedDepartment = input.department;
    const isRelationshipManagerTicket =
      input.metadata?.module === "relationship_manager" &&
      input.assignedTo?.role === "relationship_manager";

    const isAccessRequest = isAccessRequestTicket(input);
    const isServiceManaged = isServiceManagedTicket(input);
    const department = isAccessRequest
      ? "access-control"
      : isProjectApprovalTicket(input)
        ? "project-approval"
        : isRelationshipManagerTicket
        ? "relationship-manager"
        : "customer-care";

    let assignedTo = input.assignedTo;
    let autoAssigned = false;
    const activities = [activity("ticket.created", "Ticket created", requesterActor(input))];

    if (
      shouldAutoAssignCustomerCare({
        isRelationshipManagerTicket,
        department,
        ...(assignedTo ? { assignedTo } : {}),
      })
    ) {
      try {
        let assignLocation =
          resolveAssignLocation({
            metadata: input.metadata ?? {},
            requester: input.requester as any,
          }) || null;
        if (!assignLocation) {
          assignLocation = await lookupRequesterLocation(requesterLookupInput(input.requester));
        }

        const picked = await pickNextCustomerCareExecutiveDetailed(assignLocation);
        if (picked?.actor?.userId) {
          assignedTo = picked.actor;
          autoAssigned = true;
          const methodLabel =
            picked.method === "location_round_robin"
              ? "location round-robin"
              : "round-robin";
          activities.push(
            activity(
              "ticket.assigned",
              `Auto-assigned (${methodLabel}) to ${picked.actor.name || picked.actor.userId}`,
              {
                name: "System",
                role: "system",
              },
              undefined,
              picked.actor.name || picked.actor.userId,
            ),
          );
          // Stamp location + method onto metadata after create payload merge below
          (input as any).__autoAssignMethod = picked.method;
          (input as any).__assignLocation = assignLocation;
        }
      } catch (error) {
        console.warn("customer-care round-robin skipped:", error);
      }
    }

    const ticket = await TicketRepository.create({
      ...input,
      ticketCode,
      department,
      ...(assignedTo ? { assignedTo } : {}),
      ...(autoAssigned ? { status: "assigned" } : {}),
      priority: input.priority ?? "medium",
      source: input.source ?? "web",
      tags: cleanTags(input.tags),
      attachments: input.attachments ?? [],
      metadata: {
        ...(input.metadata ?? {}),
        requestedDepartment,
        intakeDepartment: department,
        ...((input as any).__assignLocation
          ? {
              assignState: (input as any).__assignLocation.state,
              assignCity: (input as any).__assignLocation.city,
              assignLocality: (input as any).__assignLocation.locality,
              state: (input.metadata as any)?.state || (input as any).__assignLocation.state,
              city: (input.metadata as any)?.city || (input as any).__assignLocation.city,
              locality:
                (input.metadata as any)?.locality || (input as any).__assignLocation.locality,
            }
          : {}),
        ...(autoAssigned
          ? {
              autoAssigned: true,
              autoAssignMethod: (input as any).__autoAssignMethod || "round_robin",
              autoAssignedAt: new Date().toISOString(),
            }
          : {}),
      },
      activities,
    });

    if (ticket.requester.email && !isServiceManaged) {
      const templateParams: Parameters<typeof ticketRaisedTemplate>[0] = {
        ...buildTicketTemplateBase(ticket),
        submittedOn: ticket.createdAt,
      };

      try {
        await sendEmail({
          to: ticket.requester.email,
          subject: ticketRaisedSubject(TicketService.displayTicketId(ticket)),
          html: ticketRaisedTemplate(templateParams),
        });
      } catch (error) {
        console.error("ticket email failed:", error);
      }
    }

    if (autoAssigned && ticket.requester.email && ticket.assignedTo) {
      try {
        await sendEmail({
          to: ticket.requester.email,
          subject: ticketAssignedSubject(TicketService.displayTicketId(ticket)),
          html: ticketAssignedTemplate({
            ...buildTicketTemplateBase(ticket),
            assignedTeam: resolveAssignedTeamName(ticket),
            currentStatus: toTitleCase(ticket.status),
          }),
        });
      } catch (error) {
        console.error("ticket auto-assignment email failed:", error);
      }
    }

    const createdByName = (ticket.metadata as { createdByName?: unknown } | undefined)?.createdByName;
    await sendHandlerAssignedEmail(
      ticket,
      typeof createdByName === "string" && createdByName.trim() ? createdByName.trim() : undefined,
    );

    await Promise.all([
      ticket.requester.userId
        ? sendTicketPush({
            ticket,
            type: "ticket_created",
            title: "Ticket Created",
            body: `Ticket ${TicketService.displayTicketId(ticket)} was created for ${ticket.title}.`,
            userIds: [ticket.requester.userId],
            audience: "requester",
          })
        : Promise.resolve(),
      ticket.assignedTo?.userId
        ? sendTicketPush({
            ticket,
            type: "ticket_assigned",
            title: "Ticket Assigned",
            body: `Ticket ${TicketService.displayTicketId(ticket)} was assigned to you.`,
            userIds: [ticket.assignedTo.userId],
            audience: "assignee",
          })
        : Promise.resolve(),
    ]);

    return ticket;
  }

  static async createRequestCall(input: CreateRequestCallInput) {
    const scheduledAt = new Date(input.date);
    const ticketCode = await generateTicketCode();
    let assignedTo: TicketActor | undefined;
    let autoAssigned = false;
    const activities = [
      activity(
        "ticket.request_call_created",
        `Call request created for ${input.timeSlot}`,
        requesterActor({ requester: input.requester }),
      ),
    ];

    if (input.relationshipManagerId || input.relationshipManagerName) {
      assignedTo = { role: "relationship_manager" };
      if (input.relationshipManagerId) assignedTo.userId = input.relationshipManagerId;
      if (input.relationshipManagerName) assignedTo.name = input.relationshipManagerName;
    } else {
      try {
        let assignLocation =
          resolveAssignLocation({
            metadata: {
              relatedProjectId: input.relatedProjectId,
            },
            requester: input.requester as any,
          }) || null;
        if (!assignLocation) {
          assignLocation = await lookupRequesterLocation(requesterLookupInput(input.requester));
        }
        const picked = await pickNextCustomerCareExecutiveDetailed(assignLocation);
        if (picked?.actor?.userId) {
          assignedTo = picked.actor;
          autoAssigned = true;
          const methodLabel =
            picked.method === "location_round_robin"
              ? "location round-robin"
              : "round-robin";
          activities.push(
            activity(
              "ticket.assigned",
              `Auto-assigned (${methodLabel}) to ${picked.actor.name || picked.actor.userId}`,
              { name: "System", role: "system" },
              undefined,
              picked.actor.name || picked.actor.userId,
            ),
          );
          (input as any).__autoAssignMethod = picked.method;
          (input as any).__assignLocation = assignLocation;
        }
      } catch (error) {
        console.warn("request-call round-robin skipped:", error);
      }
    }

    const department =
      assignedTo?.role === "relationship_manager"
        ? "relationship-manager"
        : "customer-care";

    const ticket = await TicketRepository.create({
      ticketCode,
      title: `Request a Call - ${input.category}`,
      description: input.subject,
      requester: input.requester,
      category: "request_call",
      department,
      ...(assignedTo ? { assignedTo } : {}),
      ...(autoAssigned ? { status: "assigned" } : {}),
      priority: "medium",
      source: input.source ?? "web",
      tags: cleanTags(["request_call", input.category, input.timeSlot]),
      metadata: {
        module: "relationship_manager",
        requestType: "call_request",
        requestCategory: input.category,
        relatedProjectId: input.relatedProjectId,
        relatedProjectName: input.relatedProjectName,
        scheduledDate: input.date,
        timeSlot: input.timeSlot,
        subject: input.subject,
        notes: input.notes,
        relationshipManagerName: input.relationshipManagerName,
        relationshipManagerId: input.relationshipManagerId,
        intakeDepartment: department,
        ...((input as any).__assignLocation
          ? {
              assignState: (input as any).__assignLocation.state,
              assignCity: (input as any).__assignLocation.city,
              assignLocality: (input as any).__assignLocation.locality,
              state: (input as any).__assignLocation.state,
              city: (input as any).__assignLocation.city,
              locality: (input as any).__assignLocation.locality,
            }
          : {}),
        ...(autoAssigned
          ? {
              autoAssigned: true,
              autoAssignMethod: (input as any).__autoAssignMethod || "round_robin",
              autoAssignedAt: new Date().toISOString(),
            }
          : {}),
      },
      dueAt: scheduledAt,
      attachments: [],
      activities,
    });

    await Promise.all([
      ticket.requester.userId
        ? sendTicketPush({
            ticket,
            type: "ticket_created",
            title: "Call Request Created",
            body: `Ticket ${TicketService.displayTicketId(ticket)} was created for your call request.`,
            userIds: [ticket.requester.userId],
            audience: "requester",
          })
        : Promise.resolve(),
      ticket.assignedTo?.userId
        ? sendTicketPush({
            ticket,
            type: "ticket_assigned",
            title: "Ticket Assigned",
            body: `Ticket ${TicketService.displayTicketId(ticket)} was assigned to you.`,
            userIds: [ticket.assignedTo.userId],
            audience: "assignee",
          })
        : Promise.resolve(),
    ]);

    return ticket;
  }

  static listTickets(query: TicketListQuery) {
    return TicketRepository.list(query);
  }

  static getTicket(id: string) {
    return TicketRepository.findById(id);
  }

  static async updateTicket(id: string, input: UpdateTicketInput, actor?: TicketActor) {
    const existing = await TicketRepository.findById(id);
    if (!existing) return null;

    const update = {
      ...input,
      ...(input.tags ? { tags: cleanTags(input.tags) } : {}),
      $push: {
        activities: activity(
          "ticket.updated",
          "Ticket details updated",
          actor,
        ),
      },
    };

    const ticket = await TicketRepository.updateById(id, update);
    if (!ticket) return null;

    const nextMetadata = (ticket.metadata ?? {}) as Record<string, unknown>;
    const previousMetadata = (existing.metadata ?? {}) as Record<string, unknown>;

    if (
      ticket.requester.email &&
      typeof input.department === "string" &&
      input.department !== existing.department
    ) {
      const templateParams: Parameters<typeof ticketTransferredTemplate>[0] = {
        ...buildTicketTemplateBase(ticket),
        transferredFrom: resolveDepartmentTeamName(existing.department),
        transferredTo: resolveDepartmentTeamName(input.department),
        currentStatus: "Transferred",
      };

      try {
        await sendEmail({
          to: ticket.requester.email,
          subject: ticketTransferredSubject(TicketService.displayTicketId(ticket)),
          html: ticketTransferredTemplate(templateParams),
        });
      } catch (error) {
        console.error("ticket transferred email failed:", error);
      }
    }

    if (
      ticket.requester.email &&
      typeof nextMetadata.awaitingResponseFrom === "string" &&
      nextMetadata.awaitingResponseFrom.length > 0 &&
      nextMetadata.awaitingResponseFrom !== previousMetadata.awaitingResponseFrom
    ) {
      const templateParams: Parameters<typeof ticketAwaitingExternalResponseTemplate>[0] = {
        ...buildTicketTemplateBase(ticket),
        awaitingResponseFrom: nextMetadata.awaitingResponseFrom,
        currentStatus: "Awaiting External Response",
      };

      try {
        await sendEmail({
          to: ticket.requester.email,
          subject: ticketAwaitingExternalResponseSubject(TicketService.displayTicketId(ticket)),
          html: ticketAwaitingExternalResponseTemplate(templateParams),
        });
      } catch (error) {
        console.error("ticket awaiting external response email failed:", error);
      }
    }

    if (
      ticket.requester.email &&
      typeof nextMetadata.invalidReason === "string" &&
      nextMetadata.invalidReason.length > 0 &&
      nextMetadata.invalidReason !== previousMetadata.invalidReason
    ) {
      const templateParams: Parameters<typeof ticketInvalidTemplate>[0] = {
        ...buildTicketTemplateBase(ticket),
        currentStatus: "Invalid",
        reason: nextMetadata.invalidReason,
      };

      try {
        await sendEmail({
          to: ticket.requester.email,
          subject: ticketInvalidSubject(TicketService.displayTicketId(ticket)),
          html: ticketInvalidTemplate(templateParams),
        });
      } catch (error) {
        console.error("ticket invalid email failed:", error);
      }
    }

    if (
      ticket.requester.email &&
      typeof nextMetadata.attachmentIssue === "string" &&
      nextMetadata.attachmentIssue.length > 0 &&
      nextMetadata.attachmentIssue !== previousMetadata.attachmentIssue &&
      typeof nextMetadata.attachmentName === "string"
    ) {
      const templateParams: Parameters<typeof ticketAttachmentIssueTemplate>[0] = {
        ...buildTicketTemplateBase(ticket),
        attachmentName: nextMetadata.attachmentName,
        issueIdentified: nextMetadata.attachmentIssue,
      };

      if (ticket.dueAt) {
        templateParams.dueDate = new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }).format(ticket.dueAt);
      }

      try {
        await sendEmail({
          to: ticket.requester.email,
          subject: ticketAttachmentIssueSubject(TicketService.displayTicketId(ticket)),
          html: ticketAttachmentIssueTemplate(templateParams),
        });
      } catch (error) {
        console.error("ticket attachment issue email failed:", error);
      }
    }

    if (
      ticket.requester.email &&
      typeof nextMetadata.duplicateOfTicketId === "string" &&
      nextMetadata.duplicateOfTicketId.length > 0 &&
      nextMetadata.duplicateOfTicketId !== previousMetadata.duplicateOfTicketId
    ) {
      const templateParams: Parameters<typeof ticketDuplicateTemplate>[0] = {
        ...buildTicketTemplateBase(ticket),
        duplicateTicketId: String(ticket._id),
        existingTicketId: nextMetadata.duplicateOfTicketId,
      };

      try {
        await sendEmail({
          to: ticket.requester.email,
          subject: ticketDuplicateSubject(TicketService.displayTicketId(ticket)),
          html: ticketDuplicateTemplate(templateParams),
        });
      } catch (error) {
        console.error("ticket duplicate email failed:", error);
      }
    }

    if (
      ticket.requester.email &&
      (
        nextMetadata.callbackDate !== previousMetadata.callbackDate ||
        nextMetadata.callbackStartTime !== previousMetadata.callbackStartTime ||
        nextMetadata.callbackEndTime !== previousMetadata.callbackEndTime ||
        nextMetadata.callbackContactNumber !== previousMetadata.callbackContactNumber
      ) &&
      typeof nextMetadata.callbackDate === "string" &&
      typeof nextMetadata.callbackContactNumber === "string"
    ) {
      const callbackDate = new Date(nextMetadata.callbackDate);
      const templateParams: Parameters<typeof ticketSupportCallbackScheduledTemplate>[0] = {
        ...buildTicketTemplateBase(ticket),
        callbackDate: Number.isNaN(callbackDate.getTime())
          ? nextMetadata.callbackDate
          : new Intl.DateTimeFormat("en-IN", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            }).format(callbackDate),
        callbackTime: formatTimeRange(
          typeof nextMetadata.callbackStartTime === "string" ? nextMetadata.callbackStartTime : undefined,
          typeof nextMetadata.callbackEndTime === "string" ? nextMetadata.callbackEndTime : undefined,
        ),
        contactNumber: nextMetadata.callbackContactNumber,
      };

      try {
        await sendEmail({
          to: ticket.requester.email,
          subject: ticketSupportCallbackScheduledSubject(TicketService.displayTicketId(ticket)),
          html: ticketSupportCallbackScheduledTemplate(templateParams),
        });
      } catch (error) {
        console.error("ticket callback scheduled email failed:", error);
      }
    }

    if (
      ticket.requester.email &&
      (
        nextMetadata.resolutionConfirmationReminder === true &&
        previousMetadata.resolutionConfirmationReminder !== true
      )
    ) {
      const templateParams: Parameters<typeof ticketResolutionConfirmationReminderTemplate>[0] = {
        ...buildTicketTemplateBase(ticket),
      };

      if (ticket.dueAt) {
        templateParams.confirmationDueDate = new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }).format(ticket.dueAt);
      }

      try {
        await sendEmail({
          to: ticket.requester.email,
          subject: ticketResolutionConfirmationReminderSubject(TicketService.displayTicketId(ticket)),
          html: ticketResolutionConfirmationReminderTemplate(templateParams),
        });
      } catch (error) {
        console.error("ticket resolution confirmation reminder email failed:", error);
      }
    }

    if (
      ticket.requester.email &&
      typeof nextMetadata.resolutionDelayReason === "string" &&
      nextMetadata.resolutionDelayReason.length > 0 &&
      (
        nextMetadata.resolutionDelayReason !== previousMetadata.resolutionDelayReason ||
        input.dueAt !== undefined
      )
    ) {
      const templateParams: Parameters<typeof ticketResolutionDelayedTemplate>[0] = {
        ...buildTicketTemplateBase(ticket),
        currentStatus: toTitleCase(ticket.status),
        delayReason: nextMetadata.resolutionDelayReason,
      };

      if (ticket.dueAt) {
        templateParams.revisedResolutionTime = new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(ticket.dueAt);
      }

      try {
        await sendEmail({
          to: ticket.requester.email,
          subject: ticketResolutionDelayedSubject(TicketService.displayTicketId(ticket)),
          html: ticketResolutionDelayedTemplate(templateParams),
        });
      } catch (error) {
        console.error("ticket resolution delayed email failed:", error);
      }
    }

    if (
      ticket.requester.email &&
      nextMetadata.feedbackRequested === true &&
      previousMetadata.feedbackRequested !== true
    ) {
      const templateParams: Parameters<typeof ticketFeedbackRequestTemplate>[0] = {
        ...buildTicketTemplateBase(ticket),
      };

      try {
        await sendEmail({
          to: ticket.requester.email,
          subject: ticketFeedbackRequestSubject(TicketService.displayTicketId(ticket)),
          html: ticketFeedbackRequestTemplate(templateParams),
        });
      } catch (error) {
        console.error("ticket feedback request email failed:", error);
      }
    }

    if (ticket.requester.userId) {
      await sendTicketPush({
        ticket,
        type: "ticket_updated",
        title: "Ticket Updated",
        body: `Ticket ${TicketService.displayTicketId(ticket)} was updated.`,
        userIds: [ticket.requester.userId],
        audience: "requester",
      });
    }

    return ticket;
  }

  static deleteTicket(id: string) {
    return TicketRepository.findById(id).then(async (existing) => {
      if (!existing) return null;

      const deleted = await TicketRepository.deleteById(id);
      if (!deleted) return null;

      if (existing.requester.email) {
        const templateParams: Parameters<typeof ticketCancelledTemplate>[0] = {
          ...buildTicketTemplateBase(existing),
          cancelledOn: new Date(),
          currentStatus: "Cancelled",
        };

        try {
          await sendEmail({
            to: existing.requester.email,
            subject: ticketCancelledSubject(TicketService.displayTicketId(existing)),
            html: ticketCancelledTemplate(templateParams),
          });
        } catch (error) {
          console.error("ticket cancelled email failed:", error);
        }
      }

      return deleted;
    });
  }

  static async changeStatus(
    id: string,
    status: TicketStatus,
    actor?: TicketActor,
    reason?: string,
  ) {
    const existing = await TicketRepository.findById(id);
    if (!existing) return null;

    const now = new Date();
    const update: Record<string, unknown> = {
      status,
      $push: {
        activities: activity(
          "ticket.status_changed",
          reason || `Status changed from ${existing.status} to ${status}`,
          actor,
          existing.status,
          status,
        ),
      },
    };

    if (status === "resolved") update.resolvedAt = now;
    if (status === "closed") update.closedAt = now;
    if (!closedTicketStatuses.has(status)) {
      update.resolvedAt = undefined;
      update.closedAt = undefined;
    }

    const ticket = await TicketRepository.updateById(id, update);
    if (!ticket) return null;

    if (ticket.requester.email && !skipRequesterStatusEmail(ticket, status)) {
      let handledBySpecificTemplate = false;

      if (status === "under_review") {
        handledBySpecificTemplate = true;
        const templateParams: Parameters<typeof ticketUnderReviewTemplate>[0] = {
          ...buildTicketTemplateBase(ticket),
          currentStatus: toTitleCase(ticket.status),
        };

        try {
          await sendEmail({
            to: ticket.requester.email,
            subject: ticketUnderReviewSubject(TicketService.displayTicketId(ticket)),
            html: ticketUnderReviewTemplate(templateParams),
          });
        } catch (error) {
          console.error("ticket under review email failed:", error);
        }
      }

      if (status === "in_progress") {
        handledBySpecificTemplate = true;
        const templateParams: Parameters<typeof ticketInProgressTemplate>[0] = {
          ...buildTicketTemplateBase(ticket),
          currentStatus: toTitleCase(ticket.status),
        };

        try {
          await sendEmail({
            to: ticket.requester.email,
            subject: ticketInProgressSubject(TicketService.displayTicketId(ticket)),
            html: ticketInProgressTemplate(templateParams),
          });
        } catch (error) {
          console.error("ticket in progress email failed:", error);
        }
      }

      if (status === "awaiting_user_response" && reason) {
        handledBySpecificTemplate = true;
        const templateParams: Parameters<typeof ticketAwaitingUserResponseTemplate>[0] = {
          ...buildTicketTemplateBase(ticket),
          requestedInformation: reason,
        };

        if (ticket.dueAt) {
          templateParams.dueDate = new Intl.DateTimeFormat("en-IN", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }).format(ticket.dueAt);
        }

        try {
          await sendEmail({
            to: ticket.requester.email,
            subject: ticketAwaitingUserResponseSubject(TicketService.displayTicketId(ticket)),
            html: ticketAwaitingUserResponseTemplate(templateParams),
          });
        } catch (error) {
          console.error("ticket awaiting user response email failed:", error);
        }
      }

      if (status === "awaiting_user_response" && !reason) {
        handledBySpecificTemplate = true;
        const templateParams: Parameters<typeof ticketAwaitingResponseReminderTemplate>[0] = {
          ...buildTicketTemplateBase(ticket),
          currentStatus: toTitleCase(ticket.status),
        };

        if (ticket.dueAt) {
          templateParams.dueDate = new Intl.DateTimeFormat("en-IN", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }).format(ticket.dueAt);
        }

        try {
          await sendEmail({
            to: ticket.requester.email,
            subject: ticketAwaitingResponseReminderSubject(TicketService.displayTicketId(ticket)),
            html: ticketAwaitingResponseReminderTemplate(templateParams),
          });
        } catch (error) {
          console.error("ticket awaiting response reminder email failed:", error);
        }
      }

      if (status === "escalated") {
        handledBySpecificTemplate = true;
        const templateParams: Parameters<typeof ticketEscalatedTemplate>[0] = {
          ...buildTicketTemplateBase(ticket),
          escalatedTo: resolveAssignedTeamName(ticket),
          currentStatus: toTitleCase(ticket.status),
        };

        try {
          await sendEmail({
            to: ticket.requester.email,
            subject: ticketEscalatedSubject(TicketService.displayTicketId(ticket)),
            html: ticketEscalatedTemplate(templateParams),
          });
        } catch (error) {
          console.error("ticket escalated email failed:", error);
        }
      }

      if (status === "resolved") {
        handledBySpecificTemplate = true;
        const metadata = (ticket.metadata ?? {}) as Record<string, unknown>;
        const templateParams: Parameters<typeof ticketResolvedTemplate>[0] = {
          ...buildTicketTemplateBase(ticket),
          resolvedOn: ticket.resolvedAt ?? now,
        };

        if (typeof metadata.resolutionSummary === "string") {
          templateParams.resolutionSummary = metadata.resolutionSummary;
        } else if (reason) {
          templateParams.resolutionSummary = reason;
        }

        try {
          await sendEmail({
            to: ticket.requester.email,
            subject: ticketResolvedSubject(TicketService.displayTicketId(ticket)),
            html: ticketResolvedTemplate(templateParams),
          });
        } catch (error) {
          console.error("ticket resolved email failed:", error);
        }
      }

      if (status === "reopened") {
        handledBySpecificTemplate = true;
        const templateParams: Parameters<typeof ticketReopenedTemplate>[0] = {
          ...buildTicketTemplateBase(ticket),
          reopenedOn: now,
          currentStatus: toTitleCase(ticket.status),
        };

        try {
          await sendEmail({
            to: ticket.requester.email,
            subject: ticketReopenedSubject(TicketService.displayTicketId(ticket)),
            html: ticketReopenedTemplate(templateParams),
          });
        } catch (error) {
          console.error("ticket reopened email failed:", error);
        }
      }

      if (status === "closed") {
        handledBySpecificTemplate = true;
        const metadata = (ticket.metadata ?? {}) as Record<string, unknown>;
        const autoClosed = metadata.autoClosed === true;

        if (autoClosed) {
          const templateParams: Parameters<typeof ticketAutoClosedTemplate>[0] = {
            ...buildTicketTemplateBase(ticket),
            closedOn: ticket.closedAt ?? now,
          };

          if (typeof metadata.autoCloseReason === "string") {
            templateParams.reason = metadata.autoCloseReason;
          } else if (reason) {
            templateParams.reason = reason;
          }

          try {
            await sendEmail({
              to: ticket.requester.email,
              subject: ticketAutoClosedSubject(TicketService.displayTicketId(ticket)),
              html: ticketAutoClosedTemplate(templateParams),
            });
          } catch (error) {
            console.error("ticket auto closed email failed:", error);
          }
        } else {
          const templateParams: Parameters<typeof ticketClosedTemplate>[0] = {
            ...buildTicketTemplateBase(ticket),
            closedOn: ticket.closedAt ?? now,
          };

          if (typeof metadata.resolutionSummary === "string") {
            templateParams.resolutionSummary = metadata.resolutionSummary;
          } else if (reason) {
            templateParams.resolutionSummary = reason;
          }

          try {
            await sendEmail({
              to: ticket.requester.email,
              subject: ticketClosedSubject(TicketService.displayTicketId(ticket)),
              html: ticketClosedTemplate(templateParams),
            });
          } catch (error) {
            console.error("ticket closed email failed:", error);
          }
        }
      }

      if (!handledBySpecificTemplate) {
        const templateParams: Parameters<typeof ticketStatusUpdatedTemplate>[0] = {
          ...buildTicketTemplateBase(ticket),
          previousStatus: toTitleCase(existing.status),
          newStatus: toTitleCase(ticket.status),
          updatedOn: now,
        };

        if (reason) templateParams.updateMessage = reason;

        try {
          await sendEmail({
            to: ticket.requester.email,
            subject: ticketStatusUpdatedSubject(TicketService.displayTicketId(ticket)),
            html: ticketStatusUpdatedTemplate(templateParams),
          });
        } catch (error) {
          console.error("ticket status updated email failed:", error);
        }
      }
    }

    if (ticket.requester.userId) {
      const statusLabel = toTitleCase(ticket.status);
      await sendTicketPush({
        ticket,
        type: getStatusPushType(status),
        title: `Ticket ${statusLabel}`,
        body: reason || `Ticket ${TicketService.displayTicketId(ticket)} is now ${statusLabel}.`,
        userIds: [ticket.requester.userId],
        audience: "requester",
      });
    }

    return ticket;
  }

  static async assignTicket(id: string, assignedTo: TicketActor, actor?: TicketActor) {
    const existing = await TicketRepository.findById(id);
    if (!existing) return null;

    const previousAssigneeId = String(existing.assignedTo?.userId || "").trim();
    const nextAssigneeId = String(assignedTo?.userId || "").trim();
    const actorId = String(actor?.userId || "").trim();
    const involvedIds = new Set<string>(
      Array.isArray((existing.metadata as any)?.involvedAssigneeIds)
        ? (existing.metadata as any).involvedAssigneeIds.map(String)
        : [],
    );
    // Keep previous CCE on the ticket after reassignment to admin/staff.
    if (previousAssigneeId && previousAssigneeId !== nextAssigneeId) {
      involvedIds.add(previousAssigneeId);
    }
    if (actorId && actorId !== nextAssigneeId) {
      involvedIds.add(actorId);
    }

    const existingTags = Array.isArray(existing.tags) ? existing.tags.map(String) : [];
    const involvedTags = [...involvedIds].map((uid) => `involved_${uid}`);
    const nextTags = [...new Set([...existingTags, ...involvedTags])];

    const ticket = await TicketRepository.updateById(id, {
      assignedTo,
      ...(existing.status === "open" ? { status: "assigned" } : {}),
      tags: nextTags,
      metadata: {
        ...((existing.metadata as Record<string, unknown>) || {}),
        involvedAssigneeIds: [...involvedIds],
        ...(previousAssigneeId
          ? {
              lastReassignedFrom: previousAssigneeId,
              lastReassignedAt: new Date().toISOString(),
            }
          : {}),
      },
      $push: {
        activities: activity(
          "ticket.assigned",
          `Ticket assigned to ${assignedTo.name || assignedTo.userId || "agent"}`,
          actor,
        ),
      },
    });

    if (!ticket) return null;

    if (ticket.requester.email) {
      const templateParams: Parameters<typeof ticketAssignedTemplate>[0] = {
        ...buildTicketTemplateBase(ticket),
        assignedTeam: resolveAssignedTeamName(ticket),
        currentStatus: toTitleCase(ticket.status),
      };

      try {
        await sendEmail({
          to: ticket.requester.email,
          subject: ticketAssignedSubject(TicketService.displayTicketId(ticket)),
          html: ticketAssignedTemplate(templateParams),
        });
      } catch (error) {
        console.error("ticket assignment email failed:", error);
      }
    }

    if (nextAssigneeId !== previousAssigneeId || !nextAssigneeId) {
      await sendHandlerAssignedEmail(ticket, actor?.name);
    }

    await Promise.all([
      ticket.requester.userId
        ? sendTicketPush({
            ticket,
            type: "ticket_assigned",
            title: "Ticket Assigned",
            body: `Ticket ${TicketService.displayTicketId(ticket)} was assigned to ${assignedTo.name || "the support team"}.`,
            userIds: [ticket.requester.userId],
            audience: "requester",
          })
        : Promise.resolve(),
      assignedTo.userId
        ? sendTicketPush({
            ticket,
            type: "ticket_assigned",
            title: "Ticket Assigned",
            body: `Ticket ${TicketService.displayTicketId(ticket)} was assigned to you.`,
            userIds: [assignedTo.userId],
            audience: "assignee",
          })
        : Promise.resolve(),
    ]);

    return ticket;
  }

  static async setPriority(
    id: string,
    priority: TicketPriority,
    actor?: TicketActor,
    reason?: string,
  ) {
    const ticket = await TicketRepository.updateById(id, {
      priority,
      $push: {
        activities: activity(
          "ticket.priority_changed",
          reason || `Priority changed to ${priority}`,
          actor,
        ),
      },
    });

    if (ticket?.requester.userId) {
      await sendTicketPush({
        ticket,
        type: "ticket_priority_changed",
        title: "Ticket Priority Updated",
        body: reason || `Ticket ${TicketService.displayTicketId(ticket)} priority changed to ${priority}.`,
        userIds: [ticket.requester.userId],
        audience: "requester",
      });
    }

    return ticket;
  }

  static addComment(
    id: string,
    message: string,
    visibility: "public" | "internal",
    author?: TicketActor,
    attachments: TicketAttachment[] = [],
  ) {
    const now = new Date();
    const isCustomerReply = author?.role === "requester" || author?.role === "customer";
    const update: Record<string, unknown> = {
      $push: {
        comments: { message, visibility, author, attachments },
        activities: activity(
          "ticket.comment_added",
          `${visibility === "internal" ? "Internal note" : "Comment"} added`,
          author,
        ),
      },
    };

    if (isCustomerReply) {
      update.lastCustomerReplyAt = now;
      update.status = "under_review";
    } else {
      update.lastAgentReplyAt = now;
      update.firstResponseAt = now;
    }

    return TicketRepository.updateById(id, update).then(async (ticket) => {
      if (
        ticket &&
        visibility === "public" &&
        message.trim().length > 0 &&
        isSupportActor(author) &&
        ticket.requester.email
      ) {
        const templateParams: Parameters<typeof ticketSupportResponseTemplate>[0] = {
          ...buildTicketTemplateBase(ticket),
          supportResponse: message,
        };

        try {
          await sendEmail({
            to: ticket.requester.email,
            subject: ticketSupportResponseSubject(TicketService.displayTicketId(ticket)),
            html: ticketSupportResponseTemplate(templateParams),
          });
        } catch (error) {
          console.error("ticket support response email failed:", error);
        }
      }

      if (
        ticket &&
        visibility === "public" &&
        isCustomerReply &&
        ticket.requester.email
      ) {
        const metadata = (ticket.metadata ?? {}) as Record<string, unknown>;
        const awaitingAttachment = typeof metadata.attachmentIssue === "string" && metadata.attachmentIssue.length > 0;

        if (awaitingAttachment) {
          const templateParams: Parameters<typeof ticketAdditionalInformationReceivedTemplate>[0] = {
            ...buildTicketTemplateBase(ticket),
            receivedOn: now,
            currentStatus: toTitleCase(ticket.status),
          };

          try {
            await sendEmail({
              to: ticket.requester.email,
              subject: ticketAdditionalInformationReceivedSubject(TicketService.displayTicketId(ticket)),
              html: ticketAdditionalInformationReceivedTemplate(templateParams),
            });
          } catch (error) {
            console.error("ticket additional information received email failed:", error);
          }
        } else {
          const templateParams: Parameters<typeof ticketUserReplyReceivedTemplate>[0] = {
            ...buildTicketTemplateBase(ticket),
            replyReceivedOn: now,
            currentStatus: toTitleCase(ticket.status),
          };

          try {
            await sendEmail({
              to: ticket.requester.email,
              subject: ticketUserReplyReceivedSubject(TicketService.displayTicketId(ticket)),
              html: ticketUserReplyReceivedTemplate(templateParams),
            });
          } catch (error) {
            console.error("ticket user reply received email failed:", error);
          }
        }
      }

      if (ticket && visibility === "public") {
        const isRequesterTarget = isSupportActor(author);
        const targetUserId = isRequesterTarget
          ? ticket.requester.userId
          : ticket.assignedTo?.userId;

        if (targetUserId) {
          await sendTicketPush({
            ticket,
            type: "ticket_replied",
            title: "New Ticket Reply",
            body: `Ticket ${TicketService.displayTicketId(ticket)} has a new reply.`,
            userIds: [targetUserId],
            audience: isRequesterTarget ? "requester" : "assignee",
          });
        }
      }

      return ticket;
    });
  }

  static removeComment(id: string, commentId: string, actor?: TicketActor) {
    return TicketRepository.updateById(id, {
      $pull: { comments: { _id: commentId } },
      $push: {
        activities: activity("ticket.comment_removed", "Comment removed", actor),
      },
    });
  }

  static summary(query: Partial<TicketListQuery> = {}) {
    return TicketRepository.summary(query);
  }
}
