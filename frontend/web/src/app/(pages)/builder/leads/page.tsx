"use client";

import DatePicker from "react-datepicker";
// @ts-ignore: CSS import declaration not present in this project
import "react-datepicker/dist/react-datepicker.css";

import { useState, useEffect, useMemo, useRef, JSX, CSSProperties } from "react";
import {
  downloadLeadsCSV,
  getMyProperties,
  getProjectbuilderLeads,
  importProjectLeadsCSV,
  updateLeadStatus,
} from "@/data/ClientData";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FiAlertTriangle,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiCheck,
  FiDownloadCloud,
  FiSearch,
  FiUploadCloud,
} from "react-icons/fi";

/* ================= TYPES ================= */

export const LEAD_STATUSES = [
  "new_lead",
  "interested",
  "not_interested",
  "follow_up",
  "site_visit",
  "sale",
] as const;

type LeadStatusValue = (typeof LEAD_STATUSES)[number];
type LeadStatus = LeadStatusValue | "All";
type StoredLeadStatus =
  | LeadStatusValue
  | "new"
  | "contacted"
  | "approved"
  | "rejected"
  | "closed";

interface Property {
  _id: string;
  title: string;
  propertyType?: string;
  promotion?: {
    type?: string;
  };
  city?: string;
  locality?: string;
}

interface Lead {
  _id: string;
  projectId?: string;
  projectTitle?: string;
  projectLocality?: string;
  projectCity?: string;
  name: string;
  phone: string;
  email?: string;
  source?: "site" | "imported" | "direct";
  extraFields?: Record<string, string>;
  sourceCreatedAt?: string;
  purchaseTimeline?: string;
  budgetRange?: string;
  status: StoredLeadStatus;
  activityOnly?: boolean;
  contactMasked?: boolean;
  createdAt: string;
  activity?: {
    leadSubmitted?: boolean;
    shortlisted?: boolean;
    brochureDownloaded?: boolean;
    timeSpentMinutes?: number | null;
  };
}

interface LeadColumn {
  key: string;
  label: string;
}

interface LeadsResponse {
  header?: {
    title: string;
    type: "all" | "site" | "imported" | "direct";
    counts: {
      site: number;
      imported: number;
      direct: number;
    };
  };
  columns?: LeadColumn[];
  promotionType?: string;
  visibleLeadLimit?: number;
  data: Lead[];
}

/* ================= UTILS ================= */

const maskPhone = (phone?: string) => {
  const value = String(phone ?? "").trim();
  if (!value) return "—";
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 2)}${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`;
};

const maskEmail = (email?: string) => {
  const value = String(email ?? "").trim();
  if (!value) return "—";

  const [name = "", domain = ""] = value.split("@");
  if (!domain) {
    return name.length <= 2 ? `${name.slice(0, 1)}***` : `${name.slice(0, 2)}***`;
  }

  const visibleName = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${visibleName}***@${domain}`;
};

const shouldMaskLeadContact = ({
  lead,
}: {
  lead: Lead;
}) => {
  return Boolean(lead.contactMasked);
};

const getLeadContactDisplayValue = (lead: Lead, column: LeadColumn, shouldMaskContact: boolean) => {
  if (column.key === "phone") {
    return shouldMaskContact ? maskPhone(lead.phone) : getDisplayValue(lead.phone);
  }

  if (column.key === "email") {
    return shouldMaskContact ? maskEmail(lead.email) : getDisplayValue(lead.email);
  }

  return getColumnDisplayValue(lead, column);
};
const TAB_KEY_MAP: Record<string, string> = {
  Featured: "featured",
};

const getStatusClasses = (status: LeadStatusValue) => {
  switch (status) {
    case "new_lead":
      return "bg-blue-50 text-blue-700 ring-blue-100";
    case "interested":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "not_interested":
      return "bg-rose-50 text-rose-700 ring-rose-100";
    case "follow_up":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "site_visit":
      return "bg-indigo-50 text-indigo-700 ring-indigo-100";
    case "sale":
      return "bg-green-50 text-green-700 ring-green-100";
    default:
      return "bg-gray-50 text-gray-700 ring-gray-100";
  }
};

const getStatusDotClasses = (status: LeadStatusValue) => {
  switch (status) {
    case "new_lead":
      return "bg-blue-500";
    case "interested":
      return "bg-emerald-500";
    case "not_interested":
      return "bg-rose-500";
    case "follow_up":
      return "bg-amber-500";
    case "site_visit":
      return "bg-indigo-500";
    case "sale":
      return "bg-green-500";
    default:
      return "bg-gray-400";
  }
};

const normalizeLeadStatus = (status?: StoredLeadStatus): LeadStatusValue => {
  switch (status) {
    case "new":
      return "new_lead";
    case "contacted":
    case "approved":
      return "interested";
    case "rejected":
      return "not_interested";
    case "closed":
      return "sale";
    default:
      return (status ?? "new_lead") as LeadStatusValue;
  }
};

const formatStatus = (status: StoredLeadStatus) =>
  normalizeLeadStatus(status)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
const formatLeadDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
};

const formatLeadTime = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const LeadTimestamp = ({ value }: { value?: string }) => {
  if (!value) {
    return <span className="text-xs font-medium text-[#6B7280]">—</span>;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return <span className="text-xs font-medium text-[#6B7280]">—</span>;
  }

  return (
    <div className="flex flex-col leading-tight">
      <span className="text-xs font-medium text-[#374151]">
        {formatLeadDate(value)}
      </span>
      <span className="mt-0.5 text-[10px] font-medium uppercase text-[#9CA3AF]">
        {formatLeadTime(value)}
      </span>
    </div>
  );
};

const getLeadDateTimeValue = (lead: Lead) => lead.sourceCreatedAt || lead.createdAt;

const getDisplayValue = (value?: string) => value?.trim() || "—";
const getLeadTimestamp = (lead: Lead) => {
  const value = lead.sourceCreatedAt || lead.createdAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
};

const getColumnDisplayValue = (lead: Lead, column: LeadColumn) => {
  switch (column.key) {
    case "project":
      return getDisplayValue(lead.projectTitle);
    case "name":
      return getDisplayValue(lead.name);
    case "phone":
      return getDisplayValue(lead.phone);
    case "email":
      return getDisplayValue(lead.email);
    case "purchaseTimeline":
      return getDisplayValue(lead.purchaseTimeline);
    case "budgetRange":
      return getDisplayValue(lead.budgetRange);
    case "message":
      return getDisplayValue(lead.extraFields?.Remarks || lead.extraFields?.Message);
    case "activity":
      return "Lead activity";
    case "status":
      if (lead.activityOnly) return "—";
      return formatStatus(lead.status);
    default:
      if (column.key.startsWith("extra:")) {
        const label = column.key.slice("extra:".length);
        return getDisplayValue(lead.extraFields?.[label]);
      }
      return "—";
  }
};

const getDesktopColumnMinWidth = (column: LeadColumn) => {
  switch (column.key) {
    case "project":
      return 160;
    case "contactDetails":
      return 210;
    case "name":
      return 115;
    case "activity":
      return 105;
    case "email":
      return 145;
    case "phone":
      return 115;
    case "status":
      return 118;
    case "leadTime":
      return 108;
    case "purchaseTimeline":
      return 150;
    case "budgetRange":
      return 115;
    default:
      return column.label.length > 14 ? 125 : 105;
  }
};

const getDesktopColumnMaxWidth = (column: LeadColumn) => {
  switch (column.key) {
    case "project":
      return 190;
    case "contactDetails":
      return 240;
    case "name":
      return 140;
    case "activity":
      return 125;
    case "email":
      return 170;
    case "phone":
      return 135;
    case "status":
      return 135;
    case "leadTime":
      return 122;
    case "purchaseTimeline":
      return 175;
    case "budgetRange":
      return 130;
    default:
      return column.label.length > 14 ? 145 : 125;
  }
};

const getDesktopGridTemplate = (columns: LeadColumn[]) =>
  columns
    .map(
      (column) =>
        `minmax(${getDesktopColumnMinWidth(column)}px, ${getDesktopColumnMaxWidth(column)}px)`
    )
    .join(" ");

const DEFAULT_LEAD_COLUMNS: LeadColumn[] = [
  { key: "project", label: "Project" },
  { key: "name", label: "Full Name" },
  { key: "phone", label: "Phone Number" },
  { key: "email", label: "Email" },
  { key: "leadTime", label: "Lead Time" },
  { key: "purchaseTimeline", label: "Planning To Purchase" },
  { key: "budgetRange", label: "Budget Range" },
  { key: "status", label: "Status" },
];

const arrangeLeadColumns = (columns: LeadColumn[]) => {
  const preferredOrder = [
    "project",
    "contactDetails",
    "activity",
    "purchaseTimeline",
    "leadTime",
    "budgetRange",
    "status",
  ];
  const orderMap = new Map(
    preferredOrder.map((columnKey, index) => [columnKey, index]),
  );

  return [...columns].sort((a, b) => {
    const aOrder = orderMap.get(a.key) ?? preferredOrder.length;
    const bOrder = orderMap.get(b.key) ?? preferredOrder.length;

    if (aOrder !== bOrder) return aOrder - bOrder;
    return columns.indexOf(a) - columns.indexOf(b);
  });
};

const CONTACT_DETAIL_COLUMN: LeadColumn = { key: "contactDetails", label: "Detail" };
const CONTACT_DETAIL_KEYS = new Set(["name", "phone", "email"]);

const mergeLeadContactColumns = (columns: LeadColumn[]) => {
  let contactColumnAdded = false;

  return columns.reduce<LeadColumn[]>((nextColumns, column) => {
    if (!CONTACT_DETAIL_KEYS.has(column.key)) {
      nextColumns.push(column);
      return nextColumns;
    }

    if (!contactColumnAdded) {
      nextColumns.push(CONTACT_DETAIL_COLUMN);
      contactColumnAdded = true;
    }

    return nextColumns;
  }, []);
};

const getPropertyTitle = (property: Property) =>
  property.title?.trim() || "Untitled Project";

const getPropertyLocation = (property: Property) =>
  [property.locality, property.city].filter(Boolean).join(", ");

const normalizeProjectSearchValue = (property: Property) =>
  [
    property.title,
    property.locality,
    property.city,
    property.propertyType,
    property.promotion?.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const attachProjectToLeads = (leads: Lead[], property: Property) =>
  leads.map((lead) => ({
    ...lead,
    projectId: property._id,
    projectTitle: getPropertyTitle(property),
    projectLocality: property.locality,
    projectCity: property.city,
  }));

const LeadActivityBadges = ({ lead }: { lead: Lead }) => {
  const hasActivity = Boolean(
    lead.activity?.leadSubmitted ||
      lead.activity?.shortlisted ||
      lead.activity?.brochureDownloaded,
  );

  return (
    <div className="flex flex-wrap items-center gap-1">
      {lead.activity?.leadSubmitted ? (
        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200">
          Lead
        </span>
      ) : null}
      {lead.activity?.shortlisted ? (
        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-100">
          Shortlist
        </span>
      ) : null}
      {lead.activity?.brochureDownloaded ? (
        <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100">
          Brochure
        </span>
      ) : null}
      {!hasActivity ? (
        <span className="text-xs font-medium text-[#9CA3AF]">—</span>
      ) : null}
    </div>
  );
};

const LeadContactDetails = ({
  lead,
  shouldMaskContact,
}: {
  lead: Lead;
  shouldMaskContact: boolean;
}) => (
  <div className="min-w-0 leading-tight">
    <p
      className="truncate text-xs font-semibold text-[#111827]"
      title={getDisplayValue(lead.name)}
    >
      {getDisplayValue(lead.name)}
    </p>
    <p
      className="mt-1 truncate text-[11px] font-medium text-[#4B5563]"
      title={String(
        getLeadContactDisplayValue(
          lead,
          { key: "phone", label: "Phone Number" },
          shouldMaskContact,
        ),
      )}
    >
      {getLeadContactDisplayValue(
        lead,
        { key: "phone", label: "Phone Number" },
        shouldMaskContact,
      )}
    </p>
    <p
      className="mt-0.5 truncate text-[11px] font-medium text-[#6B7280]"
      title={String(
        getLeadContactDisplayValue(
          lead,
          { key: "email", label: "Email" },
          shouldMaskContact,
        ),
      )}
    >
      {getLeadContactDisplayValue(
        lead,
        { key: "email", label: "Email" },
        shouldMaskContact,
      )}
    </p>
  </div>
);

const StatusSelect = ({
  lead,
  updateStatusMutation,
  className = "",
}: {
  lead: Lead;
  updateStatusMutation: any;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const currentStatus = normalizeLeadStatus(lead.status);
  const isUpdating = Boolean(updateStatusMutation?.isPending);

  const positionMenu = () => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 188);
    const left = Math.min(rect.left, window.innerWidth - menuWidth - 12);

    setMenuStyle({
      left: Math.max(12, left),
      top: Math.min(rect.bottom + 8, window.innerHeight - 292),
      width: menuWidth,
    });
  };

  useEffect(() => {
    if (!open) return;

    positionMenu();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleReposition = () => positionMenu();

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open]);

  const handleSelect = (status: LeadStatusValue) => {
    setOpen(false);

    if (status === currentStatus) return;

    updateStatusMutation.mutate({
      id: lead._id,
      status,
    });
  };

  return (
    <div className={`relative w-full min-w-28 max-w-[135px] ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={isUpdating}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 w-full items-center justify-between gap-1.5 rounded-md border border-transparent px-2 text-left text-[11px] font-semibold leading-none ring-1 transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A] disabled:cursor-wait disabled:opacity-70 ${getStatusClasses(currentStatus)}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${getStatusDotClasses(currentStatus)}`}
          />
          <span className="truncate">{formatStatus(currentStatus)}</span>
        </span>
        <FiChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={menuStyle}
          className="fixed z-50 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white p-1 shadow-xl shadow-black/10"
          role="listbox"
          aria-label="Lead status"
        >
          {LEAD_STATUSES.map((status) => {
            const selected = status === currentStatus;

            return (
              <button
                key={status}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => handleSelect(status)}
                className={`flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-[11px] font-semibold transition ${
                  selected
                    ? "bg-[#F0FDF4] text-[#15803D]"
                    : "text-[#374151] hover:bg-[#F9FAFB]"
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${getStatusDotClasses(status)}`}
                  />
                  <span className="truncate">{formatStatus(status)}</span>
                </span>
                {selected && <FiCheck className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ProjectFilterDropdown = ({
  properties,
  selectedProperty,
  onSelect,
}: {
  properties: Property[];
  selectedProperty: Property | null;
  onSelect: (propertyId: string | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedLabel = selectedProperty
    ? getPropertyTitle(selectedProperty)
    : "All Projects";

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleSelect = (propertyId: string | null) => {
    onSelect(propertyId);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-[#DCE1DD] bg-white px-3 text-left text-sm font-medium text-[#374151] outline-none transition hover:bg-[#F9FAFB] focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <FiChevronDown
          className={`h-4 w-4 shrink-0 text-[#6B7280] transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Filter by project"
          className="absolute left-0 z-40 mt-2 w-full min-w-[280px] overflow-hidden rounded-lg border border-[#E5E7EB] bg-white p-2 shadow-xl shadow-black/10 sm:min-w-[420px]"
        >
          <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
            <button
              type="button"
              role="option"
              aria-selected={!selectedProperty}
              onClick={() => handleSelect(null)}
              className={`flex h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-sm font-medium transition ${
                !selectedProperty
                  ? "bg-[#DCFCE7] text-[#14532D]"
                  : "text-[#374151] hover:bg-[#F9FAFB]"
              }`}
            >
              <span className="min-w-0 truncate">All Projects</span>
              {!selectedProperty ? <FiCheck className="h-4 w-4 shrink-0" /> : null}
            </button>

            {properties.length ? (
              properties.map((property) => {
                const selected = property._id === selectedProperty?._id;
                const location = getPropertyLocation(property);

                return (
                  <button
                    key={property._id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => handleSelect(property._id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition ${
                      selected
                        ? "bg-[#DCFCE7] text-[#14532D]"
                        : "text-[#374151] hover:bg-[#F9FAFB]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {getPropertyTitle(property)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#6B7280]">
                        {location || property.propertyType || "Project"}
                      </span>
                    </span>
                    {selected ? <FiCheck className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })
            ) : (
              <p className="py-6 text-center text-sm text-[#6B7280]">
                No matching projects
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const LeadStatusFilterDropdown = ({
  value,
  counts,
  onChange,
}: {
  value: LeadStatus;
  counts: Record<LeadStatus, number>;
  onChange: (status: LeadStatus) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const positionMenu = () => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 260);
    const left = Math.min(rect.left, window.innerWidth - menuWidth - 12);

    setMenuStyle({
      left: Math.max(12, left),
      top: rect.bottom + 8,
      width: menuWidth,
    });
  };

  useEffect(() => {
    if (!open) return;

    positionMenu();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleReposition = () => positionMenu();

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open]);

  const statusOptions: LeadStatus[] = ["All", ...LEAD_STATUSES];
  const label =
    value === "All" ? "All" : formatStatus(value as LeadStatusValue);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-white px-3 text-left text-sm font-medium outline-none transition focus:ring-2 focus:ring-[#DCFCE7] ${
          value === "All"
            ? "border-[#DCE1DD] text-[#374151] hover:bg-[#F9FAFB]"
            : "border-[#16A34A] text-[#15803D] ring-1 ring-[#BBF7D0]"
        }`}
      >
        <span className="min-w-0 truncate">
          {label}{" "}
          <span className="text-[#6B7280]">({counts[value] ?? 0})</span>
        </span>
        <FiChevronDown
          className={`h-4 w-4 shrink-0 text-[#6B7280] transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Filter by status"
          style={menuStyle}
          className="fixed z-50 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white p-1.5 shadow-xl shadow-black/10"
        >
          {statusOptions.map((status) => {
            const selected = status === value;
            const optionLabel =
              status === "All" ? "All" : formatStatus(status as LeadStatusValue);

            return (
              <button
                key={status}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(status);
                  setOpen(false);
                }}
                className={`flex h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-sm font-medium transition ${
                  selected
                    ? "bg-[#DCFCE7] text-[#14532D]"
                    : "text-[#374151] hover:bg-[#F9FAFB]"
                }`}
              >
                <span className="min-w-0 truncate">
                  {optionLabel}{" "}
                  <span className={selected ? "text-[#15803D]" : "text-[#6B7280]"}>
                    ({counts[status] ?? 0})
                  </span>
                </span>
                {selected ? <FiCheck className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
/* ================= PAGE ================= */

export default function BuilderLeadsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [activeTab] = useState("Featured");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    null,
  );
  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState<LeadStatus>("All");
  const [showImportProjectWarning, setShowImportProjectWarning] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{
    type: "success" | "warning" | "error";
    title: string;
    message: string;
  } | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  /* -------- Properties -------- */
  const { data: propertiesData, isLoading: propertiesLoading } = useQuery<
    Record<string, Property[]>
  >({
    queryKey: ["myProperties"],
    queryFn: getMyProperties,
  });

  const properties = useMemo<Property[]>(() => {
    if (!propertiesData) return [];
    return propertiesData[TAB_KEY_MAP[activeTab]] ?? [];
  }, [propertiesData, activeTab]);

  const selectedProperty = useMemo(() => {
    return properties.find((property) => property._id === selectedPropertyId) ?? null;
  }, [properties, selectedPropertyId]);

  const searchableProperties = useMemo<Property[]>(() => {
    const normalizedSearch = projectSearchTerm.trim().toLowerCase();
    if (!normalizedSearch) return properties;

    return properties.filter((property) =>
      normalizeProjectSearchValue(property).includes(normalizedSearch),
    );
  }, [properties, projectSearchTerm]);

  /* -------- Leads -------- */
  const { data: leadsData, isLoading: leadsLoading } = useQuery<LeadsResponse>({
    queryKey: [
      "projectLeadsbuilder",
      selectedPropertyId || "all",
      properties.map((property) => property._id).join(","),
      fromDate,
      toDate,
    ],
    queryFn: async () => {
      if (selectedProperty) {
        const response = await getProjectbuilderLeads(
          selectedProperty._id,
          fromDate ?? undefined,
          toDate ?? undefined,
        );

        return {
          ...response,
          data: attachProjectToLeads(response.data ?? [], selectedProperty),
        };
      }

      const responses = await Promise.all(
        properties.map(async (property) => {
          const response = await getProjectbuilderLeads(
            property._id,
            fromDate ?? undefined,
            toDate ?? undefined,
          );

          return attachProjectToLeads(response.data ?? [], property);
        }),
      );
      const data = responses.flat();

      return {
        success: true,
        count: data.length,
        header: {
          title: "All Project Leads",
          type: "all",
          counts: {
            site: 0,
            imported: 0,
            direct: 0,
          },
        },
        columns: DEFAULT_LEAD_COLUMNS,
        promotionType: "all",
        data,
      };
    },
    enabled: !!propertiesData,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatusValue }) =>
      updateLeadStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projectLeadsbuilder"],
      });
    },
  });

  const importLeadsMutation = useMutation({
    mutationFn: ({ projectId, file }: { projectId: string; file: File }) =>
      importProjectLeadsCSV(projectId, file),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["projectLeadsbuilder"],
      });
      const notificationReason = result.whatsappNotification?.reason;
      const shouldShowWhatsappStatus = Boolean(
        result.whatsappNotification?.sent ||
          (notificationReason &&
            !["importer_is_project_owner", "no_new_imported_leads"].includes(
              notificationReason,
            )),
      );
      const whatsappMessage =
        shouldShowWhatsappStatus && result.whatsappNotification?.sent
          ? "Owner WhatsApp notification sent."
          : shouldShowWhatsappStatus && notificationReason
            ? `Owner WhatsApp notification not sent: ${notificationReason}.`
            : "";
      const importedCount = result.imported ?? 0;
      const skippedCount = result.skipped ?? 0;
      const feedbackType =
        importedCount > 0 ? "success" : skippedCount > 0 ? "warning" : "success";

      setImportFeedback({
        type: feedbackType,
        title:
          importedCount > 0
            ? "Leads imported successfully"
            : "No new leads imported",
        message: [
          `${importedCount} ${importedCount === 1 ? "lead" : "leads"} imported.`,
          `${skippedCount} ${skippedCount === 1 ? "row" : "rows"} skipped.`,
          whatsappMessage,
        ]
          .filter(Boolean)
          .join(" "),
      });
    },
    onError: (error: any) => {
      setImportFeedback({
        type: "error",
        title: "Import failed",
        message:
          error?.response?.data?.message ||
          error.message ||
          "Please check the CSV and try again.",
      });
    },
  });

  const filteredLeads = useMemo<Lead[]>(() => {
    const leads = leadsData?.data ?? [];
    const matchingLeads =
      activeStatus === "All"
        ? leads
        : leads.filter((lead) => normalizeLeadStatus(lead.status) === activeStatus);

    return [...matchingLeads].sort(
      (a, b) => getLeadTimestamp(b) - getLeadTimestamp(a),
    );
  }, [leadsData, activeStatus]);

  const leadCountsByStatus = useMemo(() => {
    const leads = leadsData?.data ?? [];
    const counts: Record<LeadStatus, number> = {
      All: leads.length,
      new_lead: 0,
      interested: 0,
      not_interested: 0,
      follow_up: 0,
      site_visit: 0,
      sale: 0,
    };

    leads.forEach((lead) => {
      const normalizedStatus = normalizeLeadStatus(lead.status);
      counts[normalizedStatus] += 1;
    });

    return counts;
  }, [leadsData]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));

  const paginatedLeads = useMemo<Lead[]>(() => {
    const start = (page - 1) * pageSize;
    return filteredLeads.slice(start, start + pageSize);
  }, [filteredLeads, page]);

  useEffect(() => {
    setPage(1);
  }, [selectedPropertyId, activeStatus, fromDate, toDate]);

  useEffect(() => {
    if (selectedPropertyId) {
      setShowImportProjectWarning(false);
    }
  }, [selectedPropertyId]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  /* -------- Actions -------- */

  const clearFilters = () => {
    setFromDate(null);
    setToDate(null);
    setSelectedPropertyId(null);
    setProjectSearchTerm("");
    setActiveStatus("All");
    setShowImportProjectWarning(false);
    setImportFeedback(null);
  };

  const handleDownloadCSV = () => {
    if (!selectedPropertyId) {
      return alert("Select a project to download project-wise leads");
    }

    const from = fromDate?.toISOString().split("T")[0];
    const to = toDate?.toISOString().split("T")[0];

    downloadLeadsCSV(selectedPropertyId, from, to);
  };

  const handleImportClick = () => {
    if (!selectedPropertyId) {
      setShowImportProjectWarning(true);
      setImportFeedback(null);
      return;
    }

    setShowImportProjectWarning(false);
    setImportFeedback(null);
    fileInputRef.current?.click();
  };

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    if (!selectedPropertyId) {
      setShowImportProjectWarning(true);
      setImportFeedback(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportFeedback({
        type: "error",
        title: "Invalid file type",
        message: "Please upload a CSV file.",
      });
      return;
    }

    importLeadsMutation.mutate({
      projectId: selectedPropertyId,
      file,
    });
  };

  /* ================= UI ================= */

  if (propertiesLoading) {
    return <BuilderLeadsLoadingSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">
          {leadsData?.header?.title || "My Leads"}
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          View enquiries received across all projects or narrow down to one project
        </p>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="rounded-lg bg-[#EEF2EF] border border-[#E3E7E4] p-3 space-y-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 lg:w-[420px]">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
              <input
                type="text"
                value={projectSearchTerm}
                onChange={(event) => setProjectSearchTerm(event.target.value)}
                placeholder="Search project by name, city, locality, or type"
                className="h-9 w-full rounded-md border border-[#DCE1DD] bg-white pl-9 pr-3 text-sm text-[#374151] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
              />
            </div>

            <div className="min-w-0 lg:w-[260px]">
              <ProjectFilterDropdown
                properties={searchableProperties}
                selectedProperty={selectedProperty}
                onSelect={setSelectedPropertyId}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-2 lg:ml-auto lg:flex-row lg:items-center">
              <div className="flex h-9 w-fit shrink-0 items-center overflow-hidden rounded-md border border-[#DCE1DD] bg-white">
                <span className="border-r border-[#E5E7EB] px-3 text-sm font-semibold text-[#16A34A]">
                  {(selectedProperty ? 1 : properties.length).toString().padStart(2, "0")} Projects
                </span>
                <span className="px-3 text-sm font-medium text-[#6B7280]">
                  {filteredLeads.length} Leads
                </span>
              </div>

            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-nowrap lg:items-center">
            <div className="lg:w-[180px]">
            <LeadStatusFilterDropdown
              value={activeStatus}
              counts={leadCountsByStatus}
              onChange={setActiveStatus}
            />
            </div>

            <div className="relative lg:w-[220px]">
              <DatePicker
                selected={fromDate}
                onChange={(date: any) => setFromDate(date)}
                placeholderText="From Date"
                className="h-9 w-full rounded-md bg-white border border-[#DCE1DD] pl-3 pr-10 text-sm text-[#4B5563] outline-none transition focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
                dateFormat="yyyy-MM-dd"
                popperClassName="z-[9999]"
                popperPlacement="bottom-start"
                portalId="builder-leads-datepicker-portal"
              />
              <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4B5563]" />
            </div>

            <div className="relative lg:w-[220px]">
              <DatePicker
                selected={toDate}
                onChange={(date: any) => setToDate(date)}
                placeholderText="To Date"
                className="h-9 w-full rounded-md bg-white border border-[#DCE1DD] pl-3 pr-10 text-sm text-[#4B5563] outline-none transition focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
                dateFormat="yyyy-MM-dd"
                popperClassName="z-[9999]"
                popperPlacement="bottom-start"
                portalId="builder-leads-datepicker-portal"
              />
              <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4B5563]" />
            </div>

            <button
              onClick={handleDownloadCSV}
              className="h-9 px-4 rounded-md bg-[#16A34A] text-white text-sm font-medium hover:bg-[#15803D] transition flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              Download
              <FiDownloadCloud className="w-4 h-4" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleImportCSV}
            />

            {/* <button
              onClick={handleImportClick}
              disabled={importLeadsMutation.isPending}
              aria-describedby={
                showImportProjectWarning ? "import-project-warning" : undefined
              }
              className={`h-9 px-4 rounded-md bg-white border text-sm font-medium transition flex items-center justify-center gap-2 w-full sm:w-auto disabled:cursor-wait disabled:border-gray-300 disabled:text-gray-400 disabled:bg-gray-100 ${
                showImportProjectWarning && !selectedPropertyId
                  ? "border-[#F59E0B] text-[#B45309] ring-2 ring-[#FEF3C7] hover:bg-[#FFFBEB]"
                  : "border-[#16A34A] text-[#15803D] hover:bg-[#ECFDF3]"
              }`}
            >
              {importLeadsMutation.isPending ? "Importing" : "Import"}
              <FiUploadCloud className="w-4 h-4" />
            </button> */}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
            {(fromDate ||
              toDate ||
              selectedPropertyId ||
              projectSearchTerm ||
              activeStatus !== "All") ? (
              <button
                onClick={clearFilters}
                className="h-9 rounded-md bg-[#E7E9E8] px-3 text-sm text-[#4B5563] transition hover:bg-[#DDE1DE]"
              >
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        {showImportProjectWarning && !selectedPropertyId ? (
          <div
            id="import-project-warning"
            role="alert"
            className="flex items-start gap-2 rounded-md border border-[#FCD34D] bg-[#FFFBEB] px-3 py-2 text-sm text-[#92400E]"
          >
            <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D97706]" />
            <div className="min-w-0">
              <p className="font-semibold text-[#78350F]">
                Select one project before importing leads.
              </p>
              <p className="mt-0.5 text-xs font-medium text-[#A16207]">
                CSV imports are project-wise, so importing is not available for
                All Projects.
              </p>
            </div>
          </div>
        ) : null}

        {importFeedback ? (
          <div
            role="status"
            className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
              importFeedback.type === "success"
                ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]"
                : importFeedback.type === "warning"
                  ? "border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]"
                  : "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]"
            }`}
          >
            <div className="flex min-w-0 items-start gap-2">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  importFeedback.type === "success"
                    ? "bg-[#16A34A]"
                    : importFeedback.type === "warning"
                      ? "bg-[#D97706]"
                      : "bg-[#DC2626]"
                }`}
              />
              <div className="min-w-0">
                <p className="font-semibold">{importFeedback.title}</p>
                <p className="mt-0.5 text-xs font-medium opacity-90">
                  {importFeedback.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setImportFeedback(null)}
              className="shrink-0 rounded px-2 py-1 text-xs font-semibold opacity-70 transition hover:bg-white/60 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      {/* LEADS TABLE */}
      <div className="rounded-lg bg-green-50/40 p-2 sm:p-0">
        {leadsLoading ? (
          <LeadsTableSkeleton />
        ) : filteredLeads.length ? (
          <div className="space-y-3">
            <LeadsTable
              columns={leadsData?.columns ?? []}
              leads={paginatedLeads}
              updateStatusMutation={updateStatusMutation}
            />
            <Pagination
              page={page}
              pageSize={pageSize}
              totalItems={filteredLeads.length}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        ) : (
          <div className="text-center py-20 text-gray-500">
            No leads found
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded-md bg-slate-200/80 ${className}`}
    />
  );
}

function BuilderLeadsLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <SkeletonBlock className="h-7 w-40" />
        <SkeletonBlock className="mt-2 h-4 w-full max-w-[520px]" />
      </div>

      <div className="rounded-lg border border-[#E3E7E4] bg-[#EEF2EF] p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SkeletonBlock className="h-9 w-full lg:w-1/2" />
          <SkeletonBlock className="h-9 w-52" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex">
          <SkeletonBlock className="h-9 lg:w-[180px]" />
          <SkeletonBlock className="h-9 lg:w-[220px]" />
          <SkeletonBlock className="h-9 lg:w-[220px]" />
          <SkeletonBlock className="h-9 lg:w-28" />
          <SkeletonBlock className="h-9 lg:w-28" />
        </div>
      </div>

      <div className="rounded-lg bg-green-50/40 p-2 sm:p-0">
        <LeadsTableSkeleton />
      </div>
    </div>
  );
}

function LeadsTableSkeleton() {
  const skeletonColumns = arrangeLeadColumns(
    mergeLeadContactColumns([
      { key: "name", label: "Full Name" },
      { key: "phone", label: "Phone Number" },
      { key: "email", label: "Email" },
      { key: "activity", label: "Activity" },
      { key: "leadTime", label: "Lead Time" },
      { key: "purchaseTimeline", label: "Planning To Purchase" },
      { key: "status", label: "Status" },
    ]),
  );
  const desktopGridTemplate = getDesktopGridTemplate(skeletonColumns);

  return (
    <>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#F3F4F6] pb-3">
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="mt-2 h-3 w-28" />
                <SkeletonBlock className="mt-2 h-3 w-40" />
              </div>
              <div className="w-20">
                <SkeletonBlock className="h-3 w-full" />
                <SkeletonBlock className="mt-1 h-2.5 w-14" />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <SkeletonBlock className="h-3 w-11/12" />
              <SkeletonBlock className="h-3 w-8/12" />
            </div>
            <div className="mt-3 flex gap-1">
              <SkeletonBlock className="h-5 w-14 rounded-full" />
              <SkeletonBlock className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      <div className="no-scrollbar hidden cursor-grab overflow-x-auto rounded-lg border border-[#E5E7EB] bg-white shadow-sm md:block">
        <div
          className="grid min-w-max items-center gap-x-1 border-b border-[#E5E7EB] bg-[#F9FAFB] px-2 py-1.5"
          style={{ gridTemplateColumns: desktopGridTemplate }}
        >
          {skeletonColumns.map((column) => (
            <SkeletonBlock key={column.key} className="h-3 w-20" />
          ))}
        </div>

        {Array.from({ length: 7 }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className={`grid min-w-max items-center gap-x-1 border-b border-[#EEF2F0] px-2 py-2 last:border-b-0 ${
              rowIndex % 2 === 0 ? "bg-white" : "bg-[#FCFDFD]"
            }`}
            style={{ gridTemplateColumns: desktopGridTemplate }}
          >
            {skeletonColumns.map((column, columnIndex) => (
              <div key={`${rowIndex}-${column.key}`} className="min-w-0 pr-1">
                <SkeletonBlock
                  className={`h-3 ${
                    column.key === "contactDetails"
                      ? "h-10 w-36"
                      : column.key === "activity"
                      ? "w-14 rounded-full"
                      : columnIndex % 3 === 0
                        ? "w-24"
                        : columnIndex % 3 === 1
                          ? "w-20"
                          : "w-28"
                  }`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function Pagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  itemLabel = "responses",
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}) {
  const startItem = totalItems ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, totalItems);

  if (totalPages <= 1) {
    return (
      <div className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-3 shadow-sm sm:px-4">
        <p className="text-sm text-[#6B7280]">
          Showing{" "}
          <span className="font-semibold text-[#111827]">
            {startItem}-{endItem}
          </span>{" "}
          of <span className="font-semibold text-[#111827]">{totalItems}</span>{" "}
          {itemLabel}
        </p>
      </div>
    );
  }

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  const visiblePages = pages.filter(
    (item) =>
      item === 1 ||
      item === totalPages ||
      Math.abs(item - page) <= 1
  );

  const pageItems = visiblePages.reduce<Array<number | "dots">>(
    (items, item) => {
      const previous = items[items.length - 1];
      if (typeof previous === "number" && item - previous > 1) {
        items.push("dots");
      }
      items.push(item);
      return items;
    },
    []
  );

  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-3 shadow-sm sm:px-4">
      <p className="text-sm text-[#6B7280]">
        Showing{" "}
        <span className="font-semibold text-[#111827]">
          {startItem}-{endItem}
        </span>{" "}
        of <span className="font-semibold text-[#111827]">{totalItems}</span>{" "}
        {itemLabel}
      </p>

      <div className="mt-3 flex items-center justify-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-[#4B5563] transition hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:text-[#D1D5DB]"
          aria-label="Previous page"
        >
          <FiChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {pageItems.map((item, index) =>
            item === "dots" ? (
              <span
                key={`dots-${index}`}
                className="flex h-9 w-7 shrink-0 items-center justify-center text-sm text-[#9CA3AF]"
              >
                ...
              </span>
            ) : (
              <button
                key={item}
                onClick={() => onPageChange(item)}
                className={`h-9 min-w-9 shrink-0 rounded-md px-3 text-sm font-medium transition ${
                  page === item
                    ? "bg-[#16A34A] text-white shadow-sm"
                    : "border border-[#E5E7EB] bg-white text-[#4B5563] hover:bg-[#F9FAFB]"
                }`}
              >
                {item}
              </button>
            )
          )}
        </div>

        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-[#4B5563] transition hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:text-[#D1D5DB]"
          aria-label="Next page"
        >
          <FiChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ================= TABLE ================= */

function LeadsTable({
  columns,
  leads,
  updateStatusMutation,
}: {
  columns: LeadColumn[];
  leads: Lead[];
  updateStatusMutation: any;
}) {
  const visibleColumns = columns.length
    ? columns
    : [
        { key: "name", label: "Full Name" },
        { key: "phone", label: "Phone Number" },
        { key: "email", label: "Email" },
        { key: "leadTime", label: "Lead Time" },
        { key: "purchaseTimeline", label: "Planning To Purchase" },
        { key: "budgetRange", label: "Budget Range" },
        { key: "status", label: "Status" },
      ];
  const displayColumns = arrangeLeadColumns(
    mergeLeadContactColumns(visibleColumns),
  );
  const desktopGridTemplate = getDesktopGridTemplate(displayColumns);
  const desktopTableRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    dragging: false,
    startX: 0,
    scrollLeft: 0,
  });
  const [isTableDragging, setIsTableDragging] = useState(false);

  const handleTableDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
    const table = desktopTableRef.current;
    const target = event.target as HTMLElement;

    if (
      event.button !== 0 ||
      !table ||
      table.scrollWidth <= table.clientWidth ||
      target.closest("button, a, input, select, textarea, [role='button']")
    ) {
      return;
    }

    dragStateRef.current = {
      dragging: true,
      startX: event.clientX,
      scrollLeft: table.scrollLeft,
    };
    setIsTableDragging(true);
    event.preventDefault();
  };

  const handleTableDragMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const table = desktopTableRef.current;
    const dragState = dragStateRef.current;

    if (!dragState.dragging || !table) return;

    table.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.startX);
    event.preventDefault();
  };

  const stopTableDrag = () => {
    if (!dragStateRef.current.dragging) return;

    dragStateRef.current.dragging = false;
    setIsTableDragging(false);
  };

  return (
    <>
      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {leads.map((lead, index) => {
          const shouldMaskContact = shouldMaskLeadContact({
            lead,
          });

          return (
            <div
              key={lead._id}
              className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3 border-b border-[#F3F4F6] pb-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#111827]">
                    {lead.name}
                  </p>
                  <p className="mt-1 text-sm text-[#6B7280]">
                    {getLeadContactDisplayValue(
                      lead,
                      { key: "phone", label: "Phone Number" },
                      shouldMaskContact,
                    )}
                  </p>
                  <p className="mt-1 truncate text-sm text-[#6B7280]">
                    {getLeadContactDisplayValue(
                      lead,
                      { key: "email", label: "Email" },
                      shouldMaskContact,
                    )}
                  </p>
                </div>
                <LeadTimestamp value={getLeadDateTimeValue(lead)} />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-[#4B5563]">
                {displayColumns
                  .filter((column) => !["contactDetails", "name", "phone", "email", "leadTime", "status", "activity"].includes(column.key))
                  .map((column) => (
                    <p key={`${lead._id}-${column.key}`}>
                      <span className="font-medium text-[#111827]">{column.label}: </span>
                      {getColumnDisplayValue(lead, column)}
                    </p>
                  ))}
              </div>
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                  Activity
                </p>
                <LeadActivityBadges lead={lead} />
              </div>
              <div className="mt-3">
                {lead.activityOnly ? (
                  <span className="text-xs font-medium text-[#9CA3AF]">—</span>
                ) : (
                  <StatusSelect
                    lead={lead}
                    updateStatusMutation={updateStatusMutation}
                    className="max-w-none"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table */}
      <div
        ref={desktopTableRef}
        onMouseDown={handleTableDragStart}
        onMouseMove={handleTableDragMove}
        onMouseUp={stopTableDrag}
        onMouseLeave={stopTableDrag}
        className={`no-scrollbar hidden select-none overflow-x-auto rounded-lg border border-[#E5E7EB] bg-white shadow-sm md:block ${
          isTableDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <div
          className="grid min-w-max items-center gap-x-1 border-b border-[#E5E7EB] bg-[#F9FAFB] px-2 py-1.5 text-[10px] font-semibold uppercase text-[#6B7280]"
          style={{ gridTemplateColumns: desktopGridTemplate }}
        >
          {displayColumns.map((column) => (
            <span
              key={column.key}
              className="truncate leading-4"
              title={column.label}
            >
              {column.label}
            </span>
          ))}
        </div>

        {leads.map((lead, index) => {
          const shouldMaskContact = shouldMaskLeadContact({
            lead,
          });

          return (
            <div
              key={lead._id}
              className={`grid min-w-max items-center gap-x-1 border-b border-[#EEF2F0] px-2 py-1.5 text-xs transition last:border-b-0 hover:bg-[#F7FBF8] ${
                index % 2 === 0 ? "bg-white" : "bg-[#FCFDFD]"
              }`}
              style={{ gridTemplateColumns: desktopGridTemplate }}
            >
              {displayColumns.map((column) => {
                const displayValue = getLeadContactDisplayValue(
                  lead,
                  column,
                  shouldMaskContact,
                );

                return (
                  <div key={`${lead._id}-${column.key}`} className="min-w-0 pr-1">
                    {column.key === "leadTime" ? (
                      <LeadTimestamp value={getLeadDateTimeValue(lead)} />
                    ) : column.key === "contactDetails" ? (
                      <LeadContactDetails
                        lead={lead}
                        shouldMaskContact={shouldMaskContact}
                      />
                    ) : column.key === "activity" ? (
                      <LeadActivityBadges lead={lead} />
                    ) : column.key === "status" ? (
                      lead.activityOnly ? (
                        <span className="text-xs font-medium text-[#9CA3AF]">—</span>
                      ) : (
                        <StatusSelect
                          lead={lead}
                          updateStatusMutation={updateStatusMutation}
                        />
                      )
                    ) : (
                      <p
                        className="truncate text-xs font-medium text-[#374151]"
                        title={String(displayValue)}
                      >
                        {displayValue}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
