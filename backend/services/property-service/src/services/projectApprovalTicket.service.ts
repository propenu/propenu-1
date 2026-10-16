import FeaturedProject from "../models/featurePropertiesModel";
import {
  createProjectApprovalTicket,
  getTicketStatus,
  setTicketStatus,
} from "./ticketClient";

type Person = { id: string; name: string; email?: string; roleName?: string };

const FINISHED_TICKET_STATUSES = new Set(["resolved", "closed", "cancelled", "invalid", "duplicate"]);

const roleLabel = (roleName?: string) =>
  String(roleName || "staff")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const projectTitle = (project: any) => String(project?.title || "a project").trim() || "a project";

const projectLocation = (project: any) =>
  [project?.locality, project?.city]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");

const toTicketPerson = (person: Person) => ({
  userId: person.id,
  name: person.name,
  ...(person.email ? { email: person.email } : {}),
  ...(person.roleName ? { role: person.roleName } : {}),
});

/** Opens (or reuses the still-open) approval ticket for a pending project, assigned to the approving head. */
export async function openProjectApprovalTicket(input: {
  project: any;
  poster: Person;
  head: Person;
}): Promise<{ ticketId: string; ticketCode: string } | null> {
  const projectId = String(input.project?._id || "");
  if (!projectId) return null;

  const current = await FeaturedProject.findById(projectId).select("approvalTicket").lean();
  const existing = (current as any)?.approvalTicket;
  if (existing?.ticketId) {
    const status = await getTicketStatus(existing.ticketId).catch(() => null);
    if (status && !FINISHED_TICKET_STATUSES.has(status)) {
      return { ticketId: existing.ticketId, ticketCode: existing.ticketCode || "" };
    }
  }

  const title = projectTitle(input.project);
  const location = projectLocation(input.project);
  const ticket = await createProjectApprovalTicket({
    title: `Project approval: ${title}`,
    description: `${input.poster.name} (${roleLabel(input.poster.roleName)}) posted ${title}${
      location ? ` in ${location}` : ""
    }. The project is waiting for approval.`,
    requester: toTicketPerson(input.poster),
    assignedTo: toTicketPerson(input.head),
    metadata: {
      projectId,
      projectSlug: String(input.project?.slug || ""),
      relatedProjectName: title,
      city: String(input.project?.city || ""),
      locality: String(input.project?.locality || ""),
      createdByUserId: input.poster.id,
      createdByName: input.poster.name,
    },
  });
  if (!ticket.ticketId) return null;

  await FeaturedProject.updateOne({ _id: projectId }, { $set: { approvalTicket: ticket } });
  return ticket;
}

/** Resolves (approved) or closes (rejected) the project's approval ticket; ticket-service emails the poster. */
export async function finishProjectApprovalTicket(input: {
  project: any;
  approved: boolean;
  actor: Person;
  reason?: string | undefined;
}) {
  const ticketId = String(input.project?.approvalTicket?.ticketId || "");
  if (!ticketId) return;

  const status = await getTicketStatus(ticketId).catch(() => null);
  if (status && FINISHED_TICKET_STATUSES.has(status)) return;

  const title = projectTitle(input.project);
  const by = `${input.actor.name || "approver"} (${roleLabel(input.actor.roleName)})`;
  const message = input.approved
    ? `Project "${title}" was approved by ${by} and is now live.`
    : `Project "${title}" was not approved by ${by}. Reason: ${input.reason || "Rejected by manager"}`;

  await setTicketStatus(ticketId, input.approved ? "resolved" : "closed", message, toTicketPerson(input.actor));
}
