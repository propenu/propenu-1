const ticketBaseUrl = () =>
  String(process.env.TICKET_SERVICE_URL || "http://localhost:4007")
    .replace(/\s+/g, "")
    .replace(/\/+$/, "");

type TicketPerson = { userId?: string | undefined; name: string; email?: string; role?: string };

async function callTicketService<T>(path: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(`${ticketBaseUrl()}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Ticket service ${response.status}`);
  }
  return (payload?.data ?? payload) as T;
}

export async function createAccessTicket(input: {
  title: string;
  description: string;
  requester: TicketPerson;
  assignedTo: TicketPerson;
  metadata: Record<string, unknown>;
}) {
  const ticket = await callTicketService<{ _id: string; ticketCode?: string }>("/api/tickets", "POST", {
    title: input.title,
    description: input.description,
    requester: {
      userId: input.requester.userId,
      name: input.requester.name || "Staff",
      email: input.requester.email || undefined,
    },
    assignedTo: input.assignedTo,
    priority: "medium",
    source: "admin",
    category: "access_request",
    tags: ["access_request"],
    metadata: { ...input.metadata, module: "access_request" },
  });
  return { ticketId: String(ticket?._id || ""), ticketCode: String(ticket?.ticketCode || "") };
}

export async function createProjectApprovalTicket(input: {
  title: string;
  description: string;
  requester: TicketPerson;
  assignedTo: TicketPerson;
  metadata: Record<string, unknown>;
}) {
  const ticket = await callTicketService<{ _id: string; ticketCode?: string }>("/api/tickets", "POST", {
    title: input.title,
    description: input.description,
    requester: {
      userId: input.requester.userId,
      name: input.requester.name || "Staff",
      email: input.requester.email || undefined,
    },
    assignedTo: input.assignedTo,
    priority: "medium",
    source: "admin",
    category: "project_approval",
    tags: ["project_approval"],
    metadata: { ...input.metadata, module: "project_approval" },
  });
  return { ticketId: String(ticket?._id || ""), ticketCode: String(ticket?.ticketCode || "") };
}

export async function getTicketStatus(ticketId: string) {
  if (!ticketId) return null;
  const response = await fetch(`${ticketBaseUrl()}/api/tickets/${ticketId}`);
  if (!response.ok) return null;
  const payload: any = await response.json().catch(() => ({}));
  return String((payload?.data ?? payload)?.status || "") || null;
}

export async function setTicketStatus(
  ticketId: string,
  status: "resolved" | "closed",
  reason: string,
  actor: TicketPerson,
) {
  if (!ticketId) return;
  await callTicketService(`/api/tickets/${ticketId}/status`, "PATCH", { status, reason, actor });
}

export const setAccessTicketStatus = setTicketStatus;
