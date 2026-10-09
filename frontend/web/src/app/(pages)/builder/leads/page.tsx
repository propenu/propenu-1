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
  carpetArea?: number;
  heroImage?: string;
  price?: number;
  priceFrom?: number;
  priceTo?: number;
}

interface Lead {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  source?: "site" | "imported" | "direct";
  extraFields?: Record<string, string>;
  sourceCreatedAt?: string;
  purchaseTimeline?: string;
  budgetRange?: string;
  status: StoredLeadStatus;
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

const formatPrice = (price?: number) => {
  if (!price) return "—";
  if (price >= 10000000) return `₹ ${(price / 10000000).toFixed(2)} Cr`;
  if (price >= 100000) return `₹ ${(price / 100000).toFixed(2)} L`;
  return `₹ ${price.toLocaleString("en-IN")}`;
};


const getPropertyPriceLabel = (property: any) => {
  const price = Number(property?.price);
  const priceFrom = Number(property?.priceFrom);
  const priceTo = Number(property?.priceTo);

  if (Number.isFinite(price) && price > 0) {
    return formatPrice(price);
  }

  if (Number.isFinite(priceFrom) && priceFrom > 0 && Number.isFinite(priceTo) && priceTo > 0) {
    return `${formatPrice(priceFrom)} - ${formatPrice(priceTo)}`;
  }

  if (Number.isFinite(priceFrom) && priceFrom > 0) {
    return `From ${formatPrice(priceFrom)}`;
  }

  if (Number.isFinite(priceTo) && priceTo > 0) {
    return `Up to ${formatPrice(priceTo)}`;
  }

  return "—";
};

const formatPromotionTypeLabel = (promotionType?: string) => {
  const value = String(promotionType ?? "normal").trim();
  if (!value || value.toLowerCase() === "normal") return "Project";

  if (value.toLowerCase() === "featured") {
    return "Top Selling";
  }

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatPropertyTypeLabel = (propertyType?: string) => {
  const value = String(propertyType ?? "").trim();
  if (!value) return "Property";

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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

const formatSpentMinutes = (value?: number | null) => {
  if (!value || value <= 0) return null;
  if (value < 1) return "< 1 min";
  if (Number.isInteger(value)) return `${value} min`;
  return `${value.toFixed(1)} min`;
};

const LeadTimestamp = ({ value }: { value?: string }) => {
  if (!value) {
    return <span className="text-sm font-medium text-[#6B7280]">—</span>;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return <span className="text-sm font-medium text-[#6B7280]">—</span>;
  }

  return (
    <div className="flex flex-col leading-tight">
      <span className="text-sm font-medium text-[#374151]">
        {formatLeadDate(value)}
      </span>
      <span className="mt-1 text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">
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
    case "name":
      return 160;
    case "activity":
      return 240;
    case "email":
      return 190;
    case "phone":
      return 145;
    case "status":
      return 145;
    case "leadTime":
      return 135;
    case "purchaseTimeline":
      return 180;
    case "budgetRange":
      return 145;
    default:
      return column.label.length > 14 ? 155 : 125;
  }
};

const getDesktopColumnMaxWidth = (column: LeadColumn) => {
  switch (column.key) {
    case "name":
      return 200;
    case "activity":
      return 320;
    case "email":
      return 220;
    case "phone":
      return 170;
    case "status":
      return 165;
    case "leadTime":
      return 150;
    case "purchaseTimeline":
      return 200;
    case "budgetRange":
      return 155;
    default:
      return column.label.length > 14 ? 180 : 145;
  }
};

const getDesktopGridTemplate = (columns: LeadColumn[]) =>
  columns
    .map(
      (column) =>
        `minmax(${getDesktopColumnMinWidth(column)}px, ${getDesktopColumnMaxWidth(column)}px)`
    )
    .join(" ");

const LeadActivityBadges = ({ lead }: { lead: Lead }) => {
  const timeSpent = formatSpentMinutes(lead.activity?.timeSpentMinutes);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
        Lead
      </span>
      {lead.activity?.shortlisted ? (
        <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
          Shortlisted
        </span>
      ) : null}
      {lead.activity?.brochureDownloaded ? (
        <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-100">
          Brochure
        </span>
      ) : null}
      {timeSpent ? (
        <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
          {timeSpent}
        </span>
      ) : null}
    </div>
  );
};

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
    <div className={`relative w-full min-w-32 max-w-[150px] ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={isUpdating}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-md border border-transparent px-3 text-left text-xs font-semibold leading-none ring-1 transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A] disabled:cursor-wait disabled:opacity-70 ${getStatusClasses(currentStatus)}`}
      >
        <span className="flex min-w-0 items-center gap-2">
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
          className="fixed z-50 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white p-1.5 shadow-xl shadow-black/10"
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
                className={`flex h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-xs font-semibold transition ${
                  selected
                    ? "bg-[#F0FDF4] text-[#15803D]"
                    : "text-[#374151] hover:bg-[#F9FAFB]"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
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
  const [activeStatus, setActiveStatus] = useState<LeadStatus>("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [propertyPage, setPropertyPage] = useState(1);
  const pageSize = 10;
  const propertyPageSize = 6;

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

  useEffect(() => {
    if (properties.length && !selectedPropertyId) {
      setSelectedPropertyId(properties[0]._id);
    }
  }, [properties, selectedPropertyId]);

  const selectedProperty = useMemo(() => {
    return properties.find((property) => property._id === selectedPropertyId) ?? null;
  }, [properties, selectedPropertyId]);

  const totalPropertyPages = Math.max(
    1,
    Math.ceil(properties.length / propertyPageSize),
  );

  const paginatedProperties = useMemo<Property[]>(() => {
    const start = (propertyPage - 1) * propertyPageSize;
    return properties.slice(start, start + propertyPageSize);
  }, [properties, propertyPage]);

  /* -------- Leads -------- */
  const { data: leadsData, isLoading: leadsLoading } = useQuery<LeadsResponse>({
    queryKey: ["projectLeadsbuilder", selectedPropertyId, fromDate, toDate],
    queryFn: () =>
      getProjectbuilderLeads(
        selectedPropertyId!,
        fromDate ?? undefined,
        toDate ?? undefined,
      ),
    enabled: !!selectedPropertyId,
  });
  const selectedPromotionType =
    leadsData?.promotionType || selectedProperty?.promotion?.type || "normal";

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatusValue }) =>
      updateLeadStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projectLeadsbuilder", selectedPropertyId],
      });
    },
  });

  const importLeadsMutation = useMutation({
    mutationFn: ({ projectId, file }: { projectId: string; file: File }) =>
      importProjectLeadsCSV(projectId, file),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["projectLeadsbuilder", selectedPropertyId],
      });

      alert(
        `Imported ${result.imported ?? 0} leads. Skipped ${
          result.skipped ?? 0
        } rows.`
      );
    },
    onError: (error: any) => {
      alert(error?.response?.data?.message || error.message || "Import failed");
    },
  });

  const filteredLeads = useMemo<Lead[]>(() => {
    const leads = leadsData?.data ?? [];
    const matchingLeads =
      activeStatus === "All"
        ? leads
        : leads.filter((lead) => normalizeLeadStatus(lead.status) === activeStatus);

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const searchedLeads = normalizedSearch
      ? matchingLeads.filter((lead) => {
          const searchableValues = [
            lead.name,
            lead.phone,
            lead.email,
            formatStatus(lead.status),
            lead.purchaseTimeline,
            lead.budgetRange,
            ...(lead.extraFields ? Object.values(lead.extraFields) : []),
          ];

          return searchableValues.some((value) =>
            String(value ?? "").toLowerCase().includes(normalizedSearch)
          );
        })
      : matchingLeads;

    return [...searchedLeads].sort(
      (a, b) => getLeadTimestamp(b) - getLeadTimestamp(a),
    );
  }, [leadsData, activeStatus, searchTerm]);

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
  }, [selectedPropertyId, activeStatus, fromDate, toDate, searchTerm]);

  useEffect(() => {
    setPropertyPage(1);
  }, [activeTab]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (propertyPage > totalPropertyPages) {
      setPropertyPage(totalPropertyPages);
    }
  }, [propertyPage, totalPropertyPages]);

  /* -------- Actions -------- */

  const clearFilters = () => {
    setFromDate(null);
    setToDate(null);
    setActiveStatus("All");
    setSearchTerm("");
  };

  const handleDownloadCSV = () => {
    if (!selectedPropertyId) return alert("Select property first");

    const from = fromDate?.toISOString().split("T")[0];
    const to = toDate?.toISOString().split("T")[0];

    downloadLeadsCSV(selectedPropertyId, from, to);
  };

  const handleImportClick = () => {
    if (!selectedPropertyId) return alert("Select property first");
    fileInputRef.current?.click();
  };

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    if (!selectedPropertyId) return alert("Select property first");
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return alert("Please upload a CSV file");
    }

    importLeadsMutation.mutate({
      projectId: selectedPropertyId,
      file,
    });
  };

  /* ================= UI ================= */

  if (propertiesLoading) {
    return <div className="text-center py-20">Loading properties…</div>;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">
          {leadsData?.header?.title || "My Leads"}
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          View enquiries received on your properties
        </p>
        <span className="text-sm text-gray-500">
          Showing <b>{properties.length}</b> Properties
        </span>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="rounded-lg bg-[#EEF2EF] border border-[#E3E7E4] p-4 md:p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {["All", ...LEAD_STATUSES].map((status) => {
              const active = activeStatus === status;
              return (
                <button
                  key={status}
                  onClick={() => setActiveStatus(status as LeadStatus)}
                  className={`h-8 px-3 rounded-md text-sm capitalize transition
                    ${
                      active
                        ? "bg-[#CFEFD9] text-[#14532D]"
                        : "bg-[#E7E9E8] text-[#4B5563] hover:bg-[#DDE1DE]"
                    }`}
                >
                  {status === "All" ? status : formatStatus(status as LeadStatusValue)}{" "}
                  <span className="font-semibold">
                    ({leadCountsByStatus[status as LeadStatus] ?? 0})
                  </span>
                </button>
              );
            })}
          </div>
          <span className="text-sm font-medium text-[#16A34A]">
            Showing {properties.length.toString().padStart(2, "0")} Properties
          </span>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
            <div className="relative w-full sm:w-[230px]">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search leads"
                className="h-9 w-full rounded-md border border-[#DCE1DD] bg-white pl-9 pr-3 text-sm text-[#374151] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
              />
            </div>

            <div className="relative w-full sm:w-auto">
              <DatePicker
                selected={fromDate}
                onChange={(date: any) => setFromDate(date)}
                placeholderText="From Date"
                className="h-9 w-full sm:w-[108px] rounded-md bg-[#E7E9E8] border border-[#DCE1DD] pl-3 pr-8 text-sm text-[#4B5563]"
                dateFormat="yyyy-MM-dd"
              />
              <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4B5563]" />
            </div>

            <div className="relative w-full sm:w-auto">
              <DatePicker
                selected={toDate}
                onChange={(date: any) => setToDate(date)}
                placeholderText="To Date"
                className="h-9 w-full sm:w-[108px] rounded-md bg-[#E7E9E8] border border-[#DCE1DD] pl-3 pr-8 text-sm text-[#4B5563]"
                dateFormat="yyyy-MM-dd"
              />
              <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4B5563]" />
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

            <button
              onClick={handleImportClick}
              disabled={!selectedPropertyId || importLeadsMutation.isPending}
              className="h-9 px-4 rounded-md bg-white border border-[#16A34A] text-[#15803D] text-sm font-medium hover:bg-[#ECFDF3] disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 disabled:bg-gray-100 transition flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              {importLeadsMutation.isPending ? "Importing" : "Import"}
              <FiUploadCloud className="w-4 h-4" />
            </button>

            {(fromDate || toDate || activeStatus !== "All") && (
              <button
                onClick={clearFilters}
                className="h-9 px-3 rounded-md text-sm text-[#4B5563] bg-[#E7E9E8] hover:bg-[#DDE1DE] transition w-full sm:w-auto"
              >
                Clear
              </button>
            )}
          </div>

          <span className="text-sm text-[#6B7280]">
            Total Leads: {filteredLeads.length}
          </span>
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* PROPERTY LIST */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-3">
          <div className="space-y-2 pr-1">
          {paginatedProperties.map((property: any) => {
            const image = property.gallery?.[0]?.url || "/placeholder.jpg";
            const active = property._id === selectedPropertyId;
            const promotionTypeLabel = formatPromotionTypeLabel(property?.promotion?.type);
            const propertyTypeLabel = formatPropertyTypeLabel(property?.propertyType);

            return (
              <button
                key={property._id}
                onClick={() => setSelectedPropertyId(property._id)}
                className={`w-full flex flex-col gap-3 rounded-lg border p-2 text-left transition lg:flex-row lg:items-start
                  ${
                    active
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
              >
                <div className="h-48 w-full rounded-md overflow-hidden bg-gray-100 lg:h-28 lg:w-32 lg:shrink-0">
                  <img
                    src={property.heroImage || image}
                    alt={property.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <h3 className="text-sm font-semibold leading-5 text-gray-900 wrap-break-word">
                    {property.title}
                  </h3>
                  <p className="text-xs text-gray-500 leading-4 truncate">
                    {property.locality}, {property.city}
                  </p>
                  <p className="text-xs text-gray-500 leading-4">
                    {propertyTypeLabel}
                  </p>
                  <div>
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none ${
                        active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {promotionTypeLabel}
                    </span>
                  </div>
                  <p className="pt-0.5 text-sm font-semibold leading-5 text-green-600">
                    {getPropertyPriceLabel(property)}
                  </p>
                </div>
              </button>
            );
          })}
          </div>

          {properties.length > propertyPageSize ? (
            <Pagination
              page={propertyPage}
              pageSize={propertyPageSize}
              totalItems={properties.length}
              totalPages={totalPropertyPages}
              onPageChange={setPropertyPage}
              itemLabel="properties"
            />
          ) : null}
        </div>

        {/* LEADS TABLE */}
        <div className="lg:col-span-7 xl:col-span-8 bg-green-50/40 rounded-lg p-2 sm:p-0">
          {leadsLoading ? (
            <div className="text-center py-20">Loading leads…</div>
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
    </div>
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
  const desktopGridTemplate = getDesktopGridTemplate(visibleColumns);

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
                {visibleColumns
                  .filter((column) => !["name", "phone", "email", "leadTime", "status", "activity"].includes(column.key))
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
                <StatusSelect
                  lead={lead}
                  updateStatusMutation={updateStatusMutation}
                  className="max-w-none"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-x-auto rounded-lg border border-[#E5E7EB] bg-white shadow-sm md:block">
        <div
          className="grid min-w-max items-center gap-x-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]"
          style={{ gridTemplateColumns: desktopGridTemplate }}
        >
          {visibleColumns.map((column) => (
            <span
              key={column.key}
              className="truncate pl-1 leading-4"
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
              className={`grid min-w-max items-center gap-x-2 border-b border-[#EEF2F0] px-3 py-2.5 text-sm transition last:border-b-0 hover:bg-[#F7FBF8] ${
                index % 2 === 0 ? "bg-white" : "bg-[#FCFDFD]"
              }`}
              style={{ gridTemplateColumns: desktopGridTemplate }}
            >
              {visibleColumns.map((column) => {
                const displayValue = getLeadContactDisplayValue(
                  lead,
                  column,
                  shouldMaskContact,
                );

                return (
                  <div key={`${lead._id}-${column.key}`} className="min-w-0 pr-1">
                    {column.key === "leadTime" ? (
                      <LeadTimestamp value={getLeadDateTimeValue(lead)} />
                    ) : column.key === "activity" ? (
                      <LeadActivityBadges lead={lead} />
                    ) : column.key === "status" ? (
                      <StatusSelect
                        lead={lead}
                        updateStatusMutation={updateStatusMutation}
                      />
                    ) : (
                      <p
                        className="truncate pl-1 text-sm font-medium text-[#374151]"
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
