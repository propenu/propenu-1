"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  getFeaturedProjectsDashboard,
  getHighlightProjectBuilders,
  getMyProperties,
} from "@/data/ClientData";
import { ArrowDropdownIcon } from "@/icons/icons";
import { useAuth } from "@/hooks/useAuth";
import { isViewAsTokenActive } from "@/utilies/viewAsSession";
import {
  FiAlertCircle,
  FiClock,
  FiFilter,
  FiPaperclip,
  FiX,
  FiSearch,
  FiSend,
  FiShield,
  FiUserCheck,
} from "react-icons/fi";

type Role = "user" | "builder" | "agent";
type ViewerRole = Role | "customer_care" | "relationship_manager";
type Priority = "low" | "medium" | "high" | "urgent";
type Status =
  | "open"
  | "assigned"
  | "under_review"
  | "awaiting_user_response"
  | "in_progress"
  | "escalated"
  | "resolved"
  | "closed"
  | "reopened";

type Ticket = {
  _id: string;
  ticketCode?: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  category?: string;
  department?: string;
  propertyId?: string;
  dueAt?: string;
  createdAt?: string;
  updatedAt?: string;
  requester?: { name?: string; userId?: string; email?: string };
  assignedTo?: { name?: string; userId?: string };
  attachments?: { url: string; name?: string; mimeType?: string; size?: number }[];
  metadata?: {
    propertyCode?: string;
    propertyTitle?: string;
    relatedProjectId?: string;
    relatedProjectName?: string;
  };
  comments?: {
    _id?: string;
    message: string;
    visibility: "public" | "internal";
    author?: { name?: string; role?: string };
    createdAt?: string;
  }[];
};

type TicketSummaryBucket = {
  _id: string;
  count: number;
};

type TicketSummary = {
  byStatus: TicketSummaryBucket[];
  byPriority: TicketSummaryBucket[];
  overdue?: number;
};
type UploadedAttachment = {
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
};

type TicketForm = {
  title: string;
  description: string;
  category: string;
  relatedId: string;
  priority: Priority;
};

type RelatedItem = {
  id: string;
  label: string;
  meta: string;
  code?: string;
  kind: "property" | "project";
};

const config = {
  user: {
    title: "Support Center",
    eyebrow: "Your help desk",
    description: "Create a ticket, attach proof, and track support replies in one simple place.",
    action: "Create Ticket",
    listTitle: "My Tickets",
    department: "support",
    requesterRole: "customer",
    categories: ["Lead Issue", "Property Issue", "Customer Request", "Payment", "Technical"],
    relatedLabel: "Related property",
    relatedEmpty: "No properties found. You can still create a general support ticket.",
  },
  builder: {
    title: "Builder Support",
    eyebrow: "Project assistance",
    description: "Raise project, listing, verification, lead, and payment issues with clear ownership.",
    action: "Create Project Ticket",
    listTitle: "Project Tickets",
    department: "builder-success",
    requesterRole: "builder",
    categories: ["Lead Issue", "Property Issue", "Customer Request", "Payment", "Technical"],
    relatedLabel: "Related project",
    relatedEmpty: "No projects found. Create a general builder support ticket.",
  },
  agent: {
    title: "Agent Support Workspace",
    eyebrow: "Resolution desk",
    description: "Resolve assigned tickets, reply publicly, and keep internal notes for your team.",
    action: "Log Ticket",
    listTitle: "Ticket Queue",
    department: "agent-support",
    requesterRole: "agent",
    categories: ["Lead Issue", "Property Issue", "Customer Request", "Payment", "Technical"],
    relatedLabel: "Related property or project",
    relatedEmpty: "No linked properties or projects found. Create a general agent ticket.",
  },
} as const;

const statusLabel: Record<Status, string> = {
  open: "Open",
  assigned: "Assigned",
  under_review: "Under Review",
  awaiting_user_response: "Awaiting User Response",
  in_progress: "In Progress",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
};

const statusTone: Record<Status, string> = {
  open: "bg-emerald-50 text-emerald-700",
  assigned: "bg-indigo-50 text-indigo-700",
  under_review: "bg-violet-50 text-violet-700",
  awaiting_user_response: "bg-amber-50 text-amber-700",
  in_progress: "bg-blue-50 text-blue-700",
  escalated: "bg-red-50 text-red-700",
  resolved: "bg-green-50 text-green-700",
  closed: "bg-slate-100 text-slate-600",
  reopened: "bg-red-50 text-red-700",
};

const normalizeStatus = (status: string): Status => {
  if (status === "waiting_for_customer") return "awaiting_user_response";
  if (status === "waiting_for_internal_team") return "under_review";
  return status as Status;
};

const priorityTone: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-red-50 text-red-700",
};

const cx = (...items: Array<string | false | undefined>) =>
  items.filter(Boolean).join(" ");

const apiUrl = (path: string) => {
  const raw =
    process.env.NEXT_PUBLIC_TICKET_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:4000";
  return `${raw.replace(/\/$/, "")}${path}`;
};

const dateLabel = (value?: string) => {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatCompactCount = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 5;
const ACTIVE_STATUSES = new Set<Status>([
  "open",
  "assigned",
  "under_review",
  "awaiting_user_response",
  "in_progress",
  "escalated",
  "reopened",
]);
const WAITING_STATUSES = new Set<Status>(["awaiting_user_response"]);
const RESOLVED_STATUSES = new Set<Status>(["resolved", "closed"]);

const getAttachmentKind = (attachment?: {
  url?: string;
  name?: string;
  mimeType?: string;
}) => {
  const source = `${attachment?.mimeType || ""} ${attachment?.name || ""} ${attachment?.url || ""}`.toLowerCase();
  if (
    source.includes("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(source)
  ) {
    return "image";
  }
  if (source.includes("pdf") || /\.pdf$/i.test(source)) {
    return "pdf";
  }
  return "file";
};

const flattenProperties = (data: any): RelatedItem[] => {
  if (!data) return [];

  const groups = Array.isArray(data)
    ? { properties: data }
    : {
      residential: data.residential,
      commercial: data.commercial,
      land: data.land,
      agricultural: data.agricultural,
      properties: data.properties,
      data: data.data,
    };

  return Object.entries(groups).flatMap(([kind, value]) => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item?._id)
      .map((item) => ({
        id: String(item._id),
        label: item.title || item.projectName || item.name || "Untitled property",
        code: item.propertyCode || item.projectCode,
        meta: [kind, item.city || item.locality || item.address].filter(Boolean).join(" • "),
        kind: "property" as const,
      }));
  });
};

const normalizeProjects = (data: any): RelatedItem[] => {
  const list = Array.isArray(data) ? data : data?.data ?? data?.projects ?? [];
  if (!Array.isArray(list)) return [];

  return list
    .filter((item) => item?._id)
    .map((item) => ({
      id: String(item._id),
      label: item.title || item.projectName || item.name || "Untitled project",
      code: item.propertyCode || item.projectCode,
      meta: ["project", item.city || item.locality || item.state].filter(Boolean).join(" • "),
      kind: "project" as const,
    }));
};

const mergeRelatedItems = (...groups: RelatedItem[][]) => {
  const unique = new Map<string, RelatedItem>();

  groups.flat().forEach((item) => {
    unique.set(`${item.kind}:${item.id}`, item);
  });

  return Array.from(unique.values());
};

export default function TicketSupportHub({ role }: { role: Role }) {
  const copy = config[role];
  const { user, isLoading: authLoading } = useAuth();

  const currentUser = useMemo(() => {
    return user || { id: "guest-user", name: "Propenu User", email: "", role: "user" as ViewerRole };
  }, [user]);

  const isCustomerCareViewer = currentUser.role === "customer_care";
  const isRelationshipManagerViewer =
    currentUser.role === "relationship_manager";
  const isAgentWorkspace =
    role === "agent" || isRelationshipManagerViewer;
  const isReadOnlyViewAs = isViewAsTokenActive();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketSummary, setTicketSummary] = useState<TicketSummary | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [relatedItems, setRelatedItems] = useState<RelatedItem[]>([]);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [relatedSearch, setRelatedSearch] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState<TicketForm>({
    title: "",
    description: "",
    category: copy.categories[0],
    relatedId: "",
    priority: "medium" as Priority,
  });
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [previewTicketId, setPreviewTicketId] = useState<string | null>(null);

  const relatedDropdownRef = useRef<HTMLDivElement | null>(null);
  const categoryDropdownRef = useRef<HTMLDivElement | null>(null);
  const priorityDropdownRef = useRef<HTMLDivElement | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => tickets.find((ticket) => ticket._id === selectedId) || tickets[0],
    [selectedId, tickets],
  );

  const metrics = useMemo(() => {
    const byStatus = new Map<Status, number>();
    const byPriority = new Map<string, number>();

    (ticketSummary?.byStatus ?? []).forEach((item) => {
      byStatus.set(normalizeStatus(item._id), item.count);
    });

    (ticketSummary?.byPriority ?? []).forEach((item) => {
      byPriority.set(item._id, item.count);
    });

    const sumStatuses = (statuses: Set<Status>) =>
      Array.from(statuses).reduce(
        (total, item) => total + (byStatus.get(item) ?? 0),
        0,
      );

    return {
      active: sumStatuses(ACTIVE_STATUSES),
      urgent: byPriority.get("urgent") ?? 0,
      waiting: sumStatuses(WAITING_STATUSES),
      resolved: sumStatuses(RESOLVED_STATUSES),
    };
  }, [ticketSummary]);

  const selectedRelated = useMemo(
    () => relatedItems.find((item) => item.id === form.relatedId),
    [form.relatedId, relatedItems],
  );

  const previewTicket = useMemo(
    () => tickets.find((ticket) => ticket._id === previewTicketId),
    [previewTicketId, tickets],
  );

  const relatedItemLookup = useMemo(() => {
    const lookup = new Map<string, RelatedItem>();
    relatedItems.forEach((item) => {
      lookup.set(item.id, item);
    });
    return lookup;
  }, [relatedItems]);

  const filteredRelatedItems = useMemo(() => {
    const query = relatedSearch.trim().toLowerCase();
    if (!query) return relatedItems;

    return relatedItems.filter((item) =>
      [item.label, item.meta, item.kind]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [relatedItems, relatedSearch]);

  const getTicketScopeParams = () => {
    const params = new URLSearchParams();
    if (isCustomerCareViewer) params.set("department", "customer-care");
    else if (isAgentWorkspace) params.set("assignedOrRequested", currentUser.id);
    else params.set("requesterId", currentUser.id);
    return params;
  };

  const loadTicketSummary = async () => {
    if (authLoading) return;

    try {
      const response = await fetch(apiUrl(`/api/tickets/summary?${getTicketScopeParams().toString()}`), { cache: "no-store" });
      if (!response.ok) throw new Error("Ticket summary is not reachable");
      const result = await response.json();
      setTicketSummary(result.data ?? null);
    } catch (err: any) {
      setError(err.message || "Unable to load ticket summary");
    }
  };
  const loadTickets = async () => {
    if (authLoading) return;
    setLoading(true);
    setError("");
    try {
      const params = getTicketScopeParams();
      params.set("limit", "30");
      params.set("sortBy", "updatedAt");
      if (status !== "all") params.set("status", status);
      if (searchQuery) params.set("q", searchQuery);

      const response = await fetch(apiUrl(`/api/tickets?${params.toString()}`), { cache: "no-store" });
      if (!response.ok) throw new Error("Ticket service is not reachable");
      const result = await response.json();
      const data = ((result.data ?? []) as Ticket[]).map((ticket) => ({
        ...ticket,
        status: normalizeStatus(ticket.status),
      }));
      setTickets(data);
      setSelectedId((current) => current || data[0]?._id || "");
    } catch (err: any) {
      setError(err.message || "Unable to load tickets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(search.trim());
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    if (authLoading) return;
    loadTickets();
    loadTicketSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, status, authLoading, currentUser.id, searchQuery]);

  useEffect(() => {
    if (!showCreatePanel && !previewTicketId) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [previewTicketId, showCreatePanel]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (relatedDropdownRef.current && !relatedDropdownRef.current.contains(target)) {
        setRelatedOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(target)) {
        setCategoryOpen(false);
      }
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(target)) {
        setPriorityOpen(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(target)) {
        setStatusDropdownOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRelatedOpen(false);
        setCategoryOpen(false);
        setPriorityOpen(false);
        setStatusDropdownOpen(false);
        setShowCreatePanel(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadRelatedItems = async () => {
      setRelatedLoading(true);
      try {
        if (role === "builder") {
          const [regularProjectsResult, primeProjectsResult] =
            await Promise.allSettled([
              getHighlightProjectBuilders(),
              getFeaturedProjectsDashboard(),
            ]);

          const regularProjects =
            regularProjectsResult.status === "fulfilled"
              ? normalizeProjects(regularProjectsResult.value)
              : [];
          const primeProjects =
            primeProjectsResult.status === "fulfilled"
              ? normalizeProjects(primeProjectsResult.value)
              : [];

          if (mounted) {
            setRelatedItems(mergeRelatedItems(primeProjects, regularProjects));
          }
          return;
        }

        if (role === "agent") {
          const [propertiesResult, projectsResult, primeProjectsResult] =
            await Promise.allSettled([
              getMyProperties(),
              getHighlightProjectBuilders(),
              getFeaturedProjectsDashboard(),
            ]);

          const properties =
            propertiesResult.status === "fulfilled"
              ? flattenProperties(propertiesResult.value)
              : [];
          const projects =
            projectsResult.status === "fulfilled"
              ? normalizeProjects(projectsResult.value)
              : [];
          const primeProjects =
            primeProjectsResult.status === "fulfilled"
              ? normalizeProjects(primeProjectsResult.value)
              : [];
          if (mounted) {
            setRelatedItems(
              mergeRelatedItems(properties, primeProjects, projects),
            );
          }
          return;
        }

        const properties = flattenProperties(await getMyProperties());
        if (mounted) setRelatedItems(properties);
      } catch {
        if (mounted) setRelatedItems([]);
      } finally {
        if (mounted) setRelatedLoading(false);
      }
    };

    loadRelatedItems();

    return () => {
      mounted = false;
    };
  }, [role]);

  const refreshTicketsAndSummary = async () => {
    await Promise.all([loadTickets(), loadTicketSummary()]);
  };
  const createTicket = async (event: FormEvent) => {
    event.preventDefault();
    if (isReadOnlyViewAs) {
      setError("Read-only view-as: ticket creation is disabled.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (files.length < 1) {
        throw new Error("Please upload at least 1 attachment");
      }

      if (files.length > MAX_ATTACHMENT_COUNT) {
        throw new Error("You can upload up to 5 attachments");
      }

      if (files.some((file) => file.size > MAX_ATTACHMENT_SIZE)) {
        throw new Error("Each attachment must be 5 MB or smaller");
      }

      const related = relatedItems.find((item) => item.id === form.relatedId);
      const attachments = await Promise.all(
        files.map(async (file) => {
          const uploadFormData = new FormData();
          uploadFormData.append("file", file);

          const uploadResponse = await fetch(apiUrl("/api/ticket-attachments/upload"), {
            method: "POST",
            body: uploadFormData,
          });

          if (!uploadResponse.ok) {
            throw new Error("Attachment upload failed");
          }

          const uploadResult = await uploadResponse.json();
          if (!uploadResult?.data?.url) {
            throw new Error("Attachment upload failed");
          }

          return uploadResult.data as UploadedAttachment;
        }),
      );

      const response = await fetch(apiUrl("/api/tickets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          requester: { userId: currentUser.id, name: currentUser.name, email: currentUser.email },
          category: form.category,
          department: copy.department,
          propertyId: form.relatedId || undefined,
          priority: form.priority,
          source: "web",
          tags: [
            role,
            related?.kind || "general",
            form.category.toLowerCase().replace(/\s+/g, "-"),
          ],
          metadata: {
            propertyCode: related?.kind === "property" ? related.code : undefined,
            propertyTitle: related?.kind === "property" ? related.label : undefined,
            relatedProjectId: related?.kind === "project" ? related.id : undefined,
            relatedProjectName: related?.kind === "project" ? related.label : undefined,
          },
          attachments,
        }),
      });
      if (!response.ok) throw new Error("Ticket could not be created");
      setForm({ title: "", description: "", category: copy.categories[0], relatedId: "", priority: "medium" });
      setFiles([]);
      setShowCreatePanel(false);
      await refreshTicketsAndSummary();
    } catch (err: any) {
      setError(err.message || "Ticket could not be created");
    } finally {
      setSubmitting(false);
    }
  };

  const sendComment = async (visibility: "public" | "internal") => {
    if (isReadOnlyViewAs) {
      setError("Read-only view-as: replies are disabled.");
      return;
    }
    const message = visibility === "internal" ? note : reply;
    if (!selected?._id || !message.trim()) return;
    setSubmitting(true);
    try {
      const response = await fetch(apiUrl(`/api/ticket-comments/tickets/${selected._id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          visibility,
          author: {
            userId: currentUser.id,
            name: currentUser.name,
            role: visibility === "internal" ? currentUser.role : isCustomerCareViewer ? "customer_care" : copy.requesterRole,
          },
        }),
      });
      if (!response.ok) throw new Error("Reply could not be sent");
      setReply("");
      setNote("");
      await refreshTicketsAndSummary();
    } catch (err: any) {
      setError(err.message || "Reply could not be sent");
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (nextStatus: Status) => {
    if (isReadOnlyViewAs) {
      setError("Read-only view-as: status changes are disabled.");
      return;
    }
    if (!selected?._id) return;
    setSubmitting(true);
    try {
      const response = await fetch(apiUrl(`/api/tickets/${selected._id}/status`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          actor: {
            userId: currentUser.id,
            name: currentUser.name,
            role: isCustomerCareViewer
              ? "customer_care"
              : isRelationshipManagerViewer
                ? "relationship_manager"
                : role,
          },
        }),
      });
      if (!response.ok) throw new Error("Status could not be updated");
      await refreshTicketsAndSummary();
    } catch (err: any) {
      setError(err.message || "Status could not be updated");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && tickets.length === 0) {
    return <TicketSupportHubSkeleton />;
  }

  return (
    <div className="no-scrollbar flex h-[calc(100vh-80px)] flex-col overflow-y-auto">
      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-[#111111]">How can we help you?</p>
            <h1 className="mt-1 text-[24px] font-semibold leading-none text-[#111111]">{copy.title}</h1>
            <p className="mt-3 max-w-3xl text-[14px] leading-7 text-[#7A7A7A]">
              Raise and track tickets related to your account, projects, subscription, leads, payments and other Propenu services
            </p>
          </div>
          {!isReadOnlyViewAs && (
            <button
              type="button"
              onClick={() => setShowCreatePanel((prev) => !prev)}
              className="inline-flex h-10 items-center justify-center rounded-sm bg-[#27A361] px-5 text-[14px] font-medium text-white hover:bg-[#208650]"
            >
              Create Ticket
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active" value={metrics.active} icon={<FiClock size={12} />} />
          <Metric label="Immediate" value={metrics.urgent} icon={<FiAlertCircle size={12} />} />
          <Metric label="Waiting" value={metrics.waiting} icon={<FiUserCheck size={12} />} />
          <Metric label="Resolved" value={metrics.resolved} icon={<FiShield size={12} />} />
        </div>

        {!isReadOnlyViewAs && showCreatePanel && (
          <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/25 px-4 py-6">
            <div className="absolute inset-0" onClick={() => setShowCreatePanel(false)} aria-hidden="true" />
            <form onSubmit={createTicket} className="relative z-121 max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-[14px] border border-[#E8EFEA] bg-white p-5 shadow-[0_30px_80px_rgba(0,0,0,0.22)] sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-[18px] font-semibold text-[#111111]">Create Ticket</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreatePanel(false)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Close dialog"
                >
                  <FiX size={18} />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Category">
                  <div ref={categoryDropdownRef} className="relative mt-2">
                    <button
                      type="button"
                      onClick={() => setCategoryOpen((prev) => !prev)}
                      className="flex h-11 w-full items-center justify-between rounded-sm border border-[#ECECEC] bg-[#F5F5F5] px-4 text-sm text-[#444] outline-none"
                    >
                      <span className="truncate">{form.category || "Select Category"}</span>
                      <ArrowDropdownIcon
                        size={12}
                        color="#111827"
                        className={`transition-transform duration-200 ${categoryOpen ? "rotate-180" : ""
                          }`}
                      />
                    </button>

                    {categoryOpen && (
                      <div className="absolute left-0 top-[calc(100%+8px)] z-60 w-full rounded-md border border-[#E5EBE7] bg-white p-2 shadow-lg">
                        <div className="pointer-events-none absolute -top-2 left-6">
                          <div className="h-3 w-3 rotate-45 border-l border-t border-gray-200 bg-white" />
                        </div>
                        <h4 className="mb-2 text-sm font-semibold">Select Category</h4>
                        <div className="flex flex-col gap-1">
                          {copy.categories.map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => {
                                setForm((p) => ({ ...p, category: item }));
                                setCategoryOpen(false);
                              }}
                              className={`rounded px-3 py-2 text-left text-sm transition-colors ${form.category === item
                                  ? "bg-[#D1EFDD] font-medium text-[#15803D]"
                                  : "text-gray-700 hover:bg-gray-100"
                                }`}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Field>

                <Field label="Priority">
                  <div ref={priorityDropdownRef} className="relative mt-2">
                    <button
                      type="button"
                      onClick={() => setPriorityOpen((prev) => !prev)}
                      className="flex h-11 w-full items-center justify-between rounded-sm border border-[#ECECEC] bg-[#F5F5F5] px-4 text-sm text-[#444] outline-none"
                    >
                      <span className="truncate capitalize">{form.priority || "Select Priority"}</span>
                      <ArrowDropdownIcon
                        size={12}
                        color="#111827"
                        className={`transition-transform duration-200 ${priorityOpen ? "rotate-180" : ""
                          }`}
                      />
                    </button>

                    {priorityOpen && (
                      <div className="absolute left-0 top-[calc(100%+8px)] z-60 w-full rounded-md border border-[#E5EBE7] bg-white p-2 shadow-lg">
                        <div className="pointer-events-none absolute -top-2 left-6">
                          <div className="h-3 w-3 rotate-45 border-l border-t border-gray-200 bg-white" />
                        </div>
                        <h4 className="mb-2 text-sm font-semibold">Select Priority</h4>
                        <div className="flex flex-col gap-1">
                          {(["low", "medium", "high", "urgent"] as const).map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => {
                                setForm((p) => ({ ...p, priority: item }));
                                setPriorityOpen(false);
                              }}
                              className={`rounded px-3 py-2 text-left text-sm transition-colors capitalize ${form.priority === item
                                  ? "bg-[#D1EFDD] font-medium text-[#15803D]"
                                  : "text-gray-700 hover:bg-gray-100"
                                }`}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Field>
              </div>
              <Field label="Choose the Project related to your issue">
                <div ref={relatedDropdownRef} className="relative mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRelatedOpen((prev) => !prev);
                      setRelatedSearch("");
                    }}
                    className="flex h-11 w-full items-center justify-between rounded-sm border border-[#ECECEC] bg-[#F5F5F5] px-4 text-sm text-[#444] outline-none"
                  >
                    <span className="truncate">
                      {relatedLoading
                        ? "Loading related items..."
                        : selectedRelated?.label || "General support ticket"}
                    </span>
                    <ArrowDropdownIcon
                      size={12}
                      color="#111827"
                      className={`transition-transform duration-200 shrink-0 ${relatedOpen ? "rotate-180" : ""
                        }`}
                    />
                  </button>

                  {relatedOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-60 w-full rounded-md border border-[#E5EBE7] bg-white p-3 shadow-lg">
                      <div className="pointer-events-none absolute -top-2 left-6">
                        <div className="h-3 w-3 rotate-45 border-l border-t border-gray-200 bg-white" />
                      </div>
                      <div className="border-b border-gray-100 pb-2 mb-2">
                        <label className="relative block">
                          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            value={relatedSearch}
                            onChange={(event) => setRelatedSearch(event.target.value)}
                            autoFocus
                            placeholder={`Search ${copy.relatedLabel.toLowerCase()}`}
                            className="w-full rounded-sm border border-[#ECECEC] bg-[#F5F5F5] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#27A361] focus:bg-white"
                            onKeyDown={(event) => {
                              if (event.key === "Escape") setRelatedOpen(false);
                            }}
                          />
                        </label>
                      </div>

                      <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setForm((p) => ({ ...p, relatedId: "" }));
                            setRelatedOpen(false);
                            setRelatedSearch("");
                          }}
                          className={`rounded px-3 py-2 text-left transition-colors flex items-start gap-3 ${!form.relatedId
                              ? "bg-[#D1EFDD] font-medium text-[#15803D]"
                              : "text-gray-700 hover:bg-gray-100"
                            }`}
                        >
                          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#27A361]" />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">
                              General support ticket
                            </span>
                            <span className="block text-xs opacity-80">
                              Use this when the issue is not linked to a specific item.
                            </span>
                          </span>
                        </button>

                        {relatedLoading ? (
                          <p className="px-3 py-4 text-sm text-gray-500">
                            Loading related items...
                          </p>
                        ) : filteredRelatedItems.length > 0 ? (
                          filteredRelatedItems.map((item) => (
                            <button
                              type="button"
                              key={`${item.kind}:${item.id}`}
                              onClick={() => {
                                setForm((p) => ({ ...p, relatedId: item.id }));
                                setRelatedOpen(false);
                                setRelatedSearch("");
                              }}
                              className={`rounded px-3 py-2 text-left transition-colors flex items-start gap-3 ${form.relatedId === item.id
                                  ? "bg-[#D1EFDD] font-medium text-[#15803D]"
                                  : "text-gray-700 hover:bg-gray-100"
                                }`}
                            >
                              <span
                                className={cx(
                                  "mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                                  item.kind === "project"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-emerald-50 text-emerald-700",
                                )}
                              >
                                {item.kind}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold">
                                  {item.label}
                                </span>
                                <span className="block truncate text-xs opacity-80">
                                  {item.meta || item.id}
                                </span>
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-4">
                            <p className="text-sm font-medium text-gray-700">
                              No matching result
                            </p>
                            <p className="mt-1 text-xs leading-5 text-gray-500">
                              {relatedItems.length === 0
                                ? copy.relatedEmpty
                                : "Try searching by title, location, project, or property type."}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!relatedLoading && relatedItems.length === 0 && (
                    <p className="mt-2 text-[11px] leading-5 text-gray-500">
                      {copy.relatedEmpty}
                    </p>
                  )}
                </div>
              </Field>
              <Field label="Subject">
                <div className="mt-2">
                  <input
                    required
                    maxLength={100}
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Example: The leads are visible in my Mailbox, but they are not showing on the Dashboard."
                    className="support-input rounded-sm! border-[#ECECEC]! bg-[#F5F5F5]! text-[#444]! focus:bg-white!"
                  />
                  <div className="mt-1 text-right text-[11px] text-gray-500">
                    {form.title.length}/100 characters
                  </div>
                </div>
              </Field>
              <Field label="Description">
                <textarea required rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Provide a brief description of the subject." className="support-input resize-none rounded-sm! border-[#ECECEC]! bg-[#F5F5F5]! text-[#444]! focus:bg-white!" />
              </Field>
              <Field label="Attachment">
                <div className="mt-2 rounded-sm bg-[#E6FAEE] px-4 py-4">
                  <label className="flex cursor-pointer flex-col items-center justify-center text-center">
                    <FiPaperclip className="mb-2 text-[#27A361]" size={20} />
                    <span className="text-[14px] font-medium text-[#222]">
                      Upload Screenshot or document
                    </span>
                    <span className="mt-1 text-[11px] text-[#7A7A7A]">
                      Minimum 1 file, maximum 5 files, 5 MB each. Formats: png, jpg, pdf
                    </span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={(e) => {
                        const selectedFiles = Array.from(e.target.files ?? []);
                        if (!selectedFiles.length) {
                          e.target.value = "";
                          return;
                        }
                        if (selectedFiles.length > MAX_ATTACHMENT_COUNT) {
                          setError("You can upload up to 5 attachments");
                          e.target.value = "";
                          return;
                        }
                        if (selectedFiles.some((file) => file.size > MAX_ATTACHMENT_SIZE)) {
                          setError("Each attachment must be 5 MB or smaller");
                          e.target.value = "";
                          return;
                        }
                        setError("");
                        setFiles(selectedFiles);
                        e.target.value = "";
                      }}
                    />
                  </label>

                  {files.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {files.map((file, index) => (
                        <div
                          key={`${file.name}-${file.lastModified}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-sm bg-white px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-gray-800">
                              {file.name}
                            </p>
                            <p className="text-[11px] text-gray-500">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setFiles((prev) => prev.filter((_, i) => i !== index))
                            }
                            className="rounded-full p-1 text-gray-400 hover:bg-white hover:text-red-500"
                            aria-label={`Remove ${file.name}`}
                          >
                            <FiX size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <button disabled={submitting} className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm bg-[#27A361] px-4 text-sm font-medium text-white hover:bg-[#208650] disabled:opacity-60">
                {submitting ? "Submitting..." : "Submit Ticket"}
              </button>
            </form>
          </div>
        )}

        {previewTicket && (
          <div className="fixed inset-0 z-130 flex items-center justify-center bg-black/35 px-4 py-6">
            <div
              className="absolute inset-0"
              onClick={() => setPreviewTicketId(null)}
              aria-hidden="true"
            />
            <div className="relative z-   131 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[14px] border border-[#E8EFEA] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between border-b border-[#EEF3EF] px-5 py-4">
                <div className="min-w-0">
                  <h3 className="truncate text-[18px] font-semibold text-[#111111]">
                    Attachments Preview
                  </h3>
                  <p className="truncate text-xs text-[#7A7A7A]">
                    {previewTicket.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewTicketId(null)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Close attachment preview"
                >
                  <FiX size={18} />
                </button>
              </div>
              <div className="no-scrollbar space-y-4 overflow-y-auto p-5">
                {previewTicket.attachments?.map((attachment, index) => {
                  const kind = getAttachmentKind(attachment);

                  return (
                    <div
                      key={`${attachment.url}-${index}`}
                      className="overflow-hidden rounded-xl border border-[#E8EFEA] bg-[#F8FBF9]"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-[#E8EFEA] px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#222]">
                            {attachment.name || `Attachment ${index + 1}`}
                          </p>
                          <p className="text-xs text-[#7A7A7A]">
                            {kind === "image"
                              ? "Image preview"
                              : kind === "pdf"
                                ? "PDF preview"
                                : "File preview unavailable"}
                          </p>
                        </div>
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-md bg-[#27A361] px-3 py-2 text-xs font-medium text-white hover:bg-[#208650]"
                        >
                          Open
                        </a>
                      </div>
                      <div className="bg-white p-4">
                        {kind === "image" ? (
                          <img
                            src={attachment.url}
                            alt={attachment.name || `Attachment ${index + 1}`}
                            className="max-h-[420px] w-full rounded-lg object-contain"
                          />
                        ) : kind === "pdf" ? (
                          <iframe
                            src={attachment.url}
                            title={attachment.name || `Attachment ${index + 1}`}
                            className="h-[420px] w-full rounded-lg border border-[#E8EFEA]"
                          />
                        ) : (
                          <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-[#D8E6DE] bg-[#F8FBF9] p-6 text-center">
                            <div>
                              <p className="text-sm font-medium text-[#222]">
                                Preview is not available for this file type.
                              </p>
                              <p className="mt-1 text-xs text-[#7A7A7A]">
                                Use the Open button to view or download the file.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

      <section className="mt-1 flex min-h-0 flex-1 flex-col rounded-lg bg-transparent">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[24px] font-semibold leading-tight text-[#111111] sm:text-[28px]">Submitted Tickets</h2>
            <p className="mt-2 text-[12px] leading-5 text-[#7A7A7A]">Your Submitted Ticket requests are listed Below</p>
          </div>
          {/* <button onClick={loadTickets} className="text-[12px] font-medium text-[#27A361] hover:underline">
                View All
              </button> */}
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col rounded-md border border-[#E8EFEA] bg-white">
          <div className="relative z-30 border-b border-[#EEF3EF] px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <label className="relative block">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadTickets()} placeholder="Search tickets" className="h-10 w-full rounded-sm border border-[#E5EBE7] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#27A361]" />
              </label>
              <div ref={statusDropdownRef} className="relative z-20">
                <button
                  type="button"
                  onClick={() => setStatusDropdownOpen((prev) => !prev)}
                  className="flex h-10 w-full items-center justify-between rounded-sm border border-[#E5EBE7] bg-white px-4 text-sm text-[#444] outline-none"
                >
                  <span className="flex items-center gap-2 truncate">
                    <FiFilter className="text-gray-400 shrink-0" />
                    {status === "all" ? "All Status" : statusLabel[status as Status]}
                  </span>
                  <ArrowDropdownIcon size={12} color="#111827" className={`transition-transform duration-200 shrink-0 ${statusDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {statusDropdownOpen && (
                  <div className="absolute right-0 top-[calc(100%+12px)] z-80 w-48 rounded-md border border-[#E5EBE7] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                    <div className="flex flex-col gap-1">
                      <button type="button" onClick={() => { setStatus("all"); setStatusDropdownOpen(false); }} className={`rounded px-3 py-2 text-left text-sm ${status === "all" ? "bg-[#DFF5E8] text-[#15803D]" : "text-gray-700 hover:bg-gray-100"}`}>
                        All Status
                      </button>
                      {Object.entries(statusLabel).map(([value, label]) => (
                        <button key={value} type="button" onClick={() => { setStatus(value); setStatusDropdownOpen(false); }} className={`rounded px-3 py-2 text-left text-sm ${status === value ? "bg-[#DFF5E8] text-[#15803D]" : "text-gray-700 hover:bg-gray-100"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-auto rounded-b-md">
            <table className="min-w-full text-left">
              <thead className="sticky top-0 z-10 bg-[#F7FCF9] shadow-[0_1px_0_0_#EEF3EF]">
                <tr className="text-[13px] font-medium text-[#222]">
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Attachment</th>
                  <th className="px-4 py-3">Raised On</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TicketTableSkeleton />
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="h-56 px-4 py-6">
                      <EmptyText
                        text={
                          isReadOnlyViewAs
                            ? "No tickets yet."
                            : "No tickets yet. Create your first ticket from the form above."
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  tickets.map((ticket) => (
                    <tr key={ticket._id} className="border-t border-[#EEF3EF] text-[13px] text-[#555]">
                      <td className="px-4 py-3">{ticket.category || "General"}</td>
                      <td className="px-4 py-3 capitalize">{ticket.priority}</td>
                      <td className="px-4 py-3">
                        {ticket.metadata?.relatedProjectName ||
                          ticket.metadata?.propertyTitle ||
                          relatedItemLookup.get(ticket.propertyId || "")?.label ||
                          ticket.metadata?.propertyCode ||
                          ticket.propertyId ||
                          "General"}
                      </td>
                      <td className="px-4 py-3 text-[#333]">{ticket.title}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            (ticket.attachments?.length || 0) > 0 && setPreviewTicketId(ticket._id)
                          }
                          disabled={!ticket.attachments?.length}
                          className="inline-flex items-center gap-1 rounded-sm bg-[#DFF5E8] px-2 py-1 text-[11px] font-medium text-[#27A361] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <FiPaperclip size={10} /> {ticket.attachments?.length || 0} Files
                        </button>
                      </td>
                      <td className="px-4 py-3">{ticket.createdAt ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(ticket.createdAt)) : "24 July"}</td>
                      <td className="px-4 py-3">{statusLabel[ticket.status]}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, valueText, icon }: { label: string; value?: number; valueText?: string; icon: React.ReactNode }) {
  return (
    <div className="min-h-28 rounded-md border border-[#E8EFEA] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-[#222]">{label}</p>
          <p className="mt-3 text-[16px] font-semibold text-[#27A361]">{valueText || formatCompactCount(value || 0)}</p>
        </div>
        <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[#E8F7EF] text-[#27A361]">{icon}</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-3 block text-xs font-medium text-gray-600">{label}{children}</label>;
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div className={cx("animate-pulse rounded-sm bg-[#E8EFEA]", className)} />
  );
}

function TicketSupportHubSkeleton() {
  return (
    <div className="no-scrollbar flex h-[calc(100vh-80px)] flex-col overflow-y-auto">
      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="w-full max-w-3xl">
            <SkeletonBlock className="h-3 w-40" />
            <SkeletonBlock className="mt-3 h-7 w-56" />
            <SkeletonBlock className="mt-4 h-4 w-full max-w-2xl" />
            <SkeletonBlock className="mt-2 h-4 w-3/4 max-w-xl" />
          </div>
          <SkeletonBlock className="h-10 w-32 shrink-0" />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="min-h-28 rounded-md border border-[#E8EFEA] bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-full">
                  <SkeletonBlock className="h-4 w-24" />
                  <SkeletonBlock className="mt-4 h-5 w-14" />
                </div>
                <SkeletonBlock className="h-5 w-5 shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-1 flex min-h-0 flex-1 flex-col rounded-lg bg-transparent">
        <div className="flex items-end justify-between gap-4">
          <div>
            <SkeletonBlock className="h-8 w-56" />
            <SkeletonBlock className="mt-3 h-3 w-72" />
          </div>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col rounded-md border border-[#E8EFEA] bg-white">
          <div className="border-b border-[#EEF3EF] px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-auto rounded-b-md">
            <table className="min-w-full text-left">
              <thead className="sticky top-0 z-10 bg-[#F7FCF9] shadow-[0_1px_0_0_#EEF3EF]">
                <tr>
                  {["Category", "Priority", "Project", "Subject", "Attachment", "Raised On", "Status"].map((label) => (
                    <th key={label} className="px-4 py-3">
                      <SkeletonBlock className="h-3 w-20" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TicketTableSkeleton />
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function TicketTableSkeleton() {
  const widths = ["w-24", "w-20", "w-36", "w-56", "w-20", "w-20", "w-24"];

  return (
    <>
      {Array.from({ length: 5 }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-t border-[#EEF3EF]">
          {widths.map((width, cellIndex) => (
            <td key={cellIndex} className="px-4 py-4">
              <div
                className={cx(
                  "h-3 animate-pulse rounded-sm bg-[#E8EFEA]",
                  width,
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-44 items-center justify-center text-center text-sm text-gray-500">
      {text}
    </div>
  );
}

function Detail({ role, viewerRole, ticket, reply, note, submitting, setReply, setNote, sendComment, changeStatus }: {
  role: Role;
  viewerRole: ViewerRole;
  ticket?: Ticket;
  reply: string;
  note: string;
  submitting: boolean;
  setReply: (value: string) => void;
  setNote: (value: string) => void;
  sendComment: (visibility: "public" | "internal") => void;
  changeStatus: (status: Status) => void;
}) {
  if (!ticket) return <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">Select a ticket to see details.</div>;
  const isSupportOperator =
    role === "agent" ||
    viewerRole === "customer_care" ||
    viewerRole === "relationship_manager";
  const publicComments = ticket.comments?.filter((item) => item.visibility === "public") ?? [];
  const internalComments = ticket.comments?.filter((item) => item.visibility === "internal") ?? [];

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_35%),linear-gradient(180deg,#ffffff_0%,#f6fff9_100%)] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#27A361]">Ticket Detail</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{ticket.title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{ticket.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={cx("rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-black/5", statusTone[ticket.status])}>{statusLabel[ticket.status]}</span>
            <span className={cx("rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ring-inset ring-black/5", priorityTone[ticket.priority])}>{ticket.priority}</span>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Info label="Requester" value={ticket.requester?.name || "Customer"} />
          <Info label="Department" value={ticket.department || "Support"} />
          <Info
            label="Property"
            value={
              ticket.metadata?.propertyCode ||
              ticket.propertyId ||
              "Not linked"
            }
          />
          <Info label="Due" value={dateLabel(ticket.dueAt)} />
        </div>
        {isSupportOperator && (
          <div className="mt-5 flex flex-wrap gap-2">
            <Action onClick={() => changeStatus("in_progress")} disabled={submitting} label="Start Progress" />
            <Action onClick={() => changeStatus("awaiting_user_response")} disabled={submitting} label="Await User" />
            <Action onClick={() => changeStatus("resolved")} disabled={submitting} label="Resolve Ticket" />
          </div>
        )}
      </div>
      <div className="grid xl:grid-cols-[1fr_300px]">
        <div className="p-5 sm:p-6">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Conversation</h3>
          <div className="mt-3 space-y-3">
            {publicComments.length === 0 ? <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">No public replies yet.</div> : publicComments.map((comment, index) => (
              <div key={comment._id || index} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">{comment.author?.name || "Support"}</p>
                  <span className="text-[11px] text-slate-400">{dateLabel(comment.createdAt)}</span>
                </div>
                <p className="text-sm leading-7 text-slate-700">{comment.message}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-[22px] border border-emerald-100 bg-[#FBFFFD] p-4">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Public Reply</label>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Write a clear update..." className="support-input resize-none" />
            <button onClick={() => sendComment("public")} disabled={submitting || !reply.trim()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#27A361] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_24px_rgba(39,163,97,0.18)] hover:bg-[#208650] disabled:opacity-60"><FiSend /> Send Reply</button>
          </div>
          {isSupportOperator && (
            <div className="mt-4 rounded-[22px] border border-amber-100 bg-amber-50/50 p-4">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">Internal Note</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Visible only to support team." className="mt-2 w-full resize-none rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-400" />
              <button onClick={() => sendComment("internal")} disabled={submitting || !note.trim()} className="mt-3 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">Save Internal Note</button>
              {internalComments.length > 0 && <div className="mt-4 space-y-2">{internalComments.map((comment, index) => <p key={comment._id || index} className="rounded-xl bg-white px-3 py-2 text-xs leading-5 text-amber-900">{comment.message}</p>)}</div>}
            </div>
          )}
        </div>
        <aside className="border-t border-slate-100 bg-slate-50/70 p-5 sm:p-6 xl:border-l xl:border-t-0">
          <div className="mb-3 flex items-center gap-2"><FiPaperclip className="text-[#27A361]" /><h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Attachments</h3></div>
          <div className="space-y-2">
            {ticket.attachments?.length ? ticket.attachments.map((item, index) => <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 hover:border-[#27A361] hover:text-[#27A361]">{item.name || "Attachment"}</a>) : <p className="rounded-xl bg-white px-3 py-2.5 text-xs text-slate-500">No attachments</p>}
          </div>
          <div className="mt-6 space-y-2 text-xs text-slate-600">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Ownership</h3>
            <p className="rounded-xl bg-white px-3 py-2.5">Assigned: {ticket.assignedTo?.name || "Not assigned"}</p>
            <p className="rounded-xl bg-white px-3 py-2.5">Category: {ticket.category || "General"}</p>
            <p className="rounded-xl bg-white px-3 py-2.5">Created: {dateLabel(ticket.createdAt)}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/80 bg-white/90 px-3 py-3 shadow-sm"><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</p></div>;
}

function Action({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return <button onClick={onClick} disabled={disabled} className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">{label}</button>;
}

