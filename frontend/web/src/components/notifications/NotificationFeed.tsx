"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiBell, FiFilter, FiSearch } from "react-icons/fi";
import { toast } from "sonner";

import NopropertiesSvg from "@/svg/NopropertiesSvg";
import { initWebPushToken } from "@/utilies/initWebPush";

export type NotificationType =
  | "project_shortlisted"
  | "property_shortlisted"
  | "search_match"
  | "contact_requested"
  | "brochure_downloaded"
  | "high_time_spent"
  | "property_approved"
  | "property_rejected"
  | "project_approved"
  | "project_rejected"
  | "listing_expiring"
  | "listing_expired"
  | "promotion_started"
  | "promotion_expired"
  | "payment_success"
  | "payment_failed"
  | "subscription_activated"
  | "subscription_expiring"
  | "subscription_expired"
  | "plan_upgrade_reminder"
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

type FilterType = "all" | NotificationType;
type DateRangeFilter = "all" | "today" | "last_7_days" | "this_month";

export interface NotificationUser {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  userCode?: string;
}

export interface NotificationProject {
  id?: string;
  title?: string;
  slug?: string;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  createdAt?: string | null;
  user?: NotificationUser;
  project?: NotificationProject;
  message?: string;
  timeSpentMinutes?: number | null;
  path?: string | null;
  url?: string | null;
  webUrl?: string | null;
  deepLink?: string | null;
}

export interface NotificationSummary {
  total?: number;
  unread?: number;
  shortlists?: number;
  contacts?: number;
  brochureDownloads?: number;
  timeSpent?: number;
  tickets?: number;
}

interface NotificationFeedProps {
  containerClassName?: string;
  description: string;
  error?: unknown;
  isError: boolean;
  isLoading: boolean;
  notifications: NotificationItem[];
  summary?: NotificationSummary;
  title?: string;
}

const TICKET_NOTIFICATION_TYPES: NotificationType[] = [
  "ticket_created",
  "ticket_assigned",
  "ticket_updated",
  "ticket_replied",
  "ticket_status_changed",
  "ticket_resolved",
  "ticket_closed",
  "ticket_reopened",
  "ticket_escalated",
  "ticket_priority_changed",
];

const LIFECYCLE_NOTIFICATION_TYPES: NotificationType[] = [
  "property_approved",
  "property_rejected",
  "project_approved",
  "project_rejected",
  "listing_expiring",
  "listing_expired",
  "promotion_started",
  "promotion_expired",
];

const PAYMENT_NOTIFICATION_TYPES: NotificationType[] = [
  "payment_success",
  "payment_failed",
  "subscription_activated",
  "subscription_expiring",
  "subscription_expired",
  "plan_upgrade_reminder",
];

const FILTERS: Array<{ id: FilterType | "tickets"; label: string }> = [
  { id: "all", label: "All" },
  { id: "search_match", label: "Matching Property" },
  { id: "project_shortlisted", label: "Project Shortlists" },
  { id: "property_shortlisted", label: "Property Shortlists" },
  { id: "contact_requested", label: "Contacts" },
  { id: "tickets", label: "Tickets" },
  { id: "property_approved", label: "Lifecycle" },
  { id: "payment_success", label: "Payments" },
  { id: "brochure_downloaded", label: "Brochure" },
  { id: "high_time_spent", label: "Time Spent" },
];

const DATE_FILTERS: Array<{ id: DateRangeFilter; label: string }> = [
  { id: "all", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "last_7_days", label: "Last 7 Days" },
  { id: "this_month", label: "This Month" },
];

const SUMMARY_CARD_LAYOUTS = [
  "col-span-2",
  "col-span-2",
  "col-span-2",
  "col-span-3",
  "col-span-3",
];

const formatDate = (value?: string | null) => {
  if (!value) return "NA";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "NA";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatTime = (value?: string | null) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const formatMinutes = (value?: number | null) => {
  if (value == null || value <= 0) return "NA";
  if (value < 1) return "< 1 min";
  if (Number.isInteger(value)) return `${value} min`;
  return `${value.toFixed(1)} min`;
};

const getNotificationTimestamp = (value?: string | null) => {
  if (!value) return 0;

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const isWithinDateRange = (value: string | null | undefined, filter: DateRangeFilter) => {
  if (filter === "all") return true;
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (filter === "today") {
    return date >= startOfToday;
  }

  if (filter === "last_7_days") {
    const startOfLast7Days = new Date(startOfToday);
    startOfLast7Days.setDate(startOfLast7Days.getDate() - 6);
    return date >= startOfLast7Days;
  }

  if (filter === "this_month") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return date >= startOfMonth;
  }

  return true;
};

const getRoleLabel = (role?: string) => {
  const normalized = role?.toLowerCase().trim();

  if (normalized === "sales_agent" || normalized === "agent") return "Agent";
  if (normalized === "builder" || normalized === "builder_staff") return "Builder";
  if (normalized === "user") return "User";

  return role || "User";
};

const isTicketNotification = (type: NotificationType) =>
  TICKET_NOTIFICATION_TYPES.includes(type);

const isLifecycleNotification = (type: NotificationType) =>
  LIFECYCLE_NOTIFICATION_TYPES.includes(type);

const isPaymentNotification = (type: NotificationType) =>
  PAYMENT_NOTIFICATION_TYPES.includes(type);

const getNotificationAccentClasses = (type: NotificationType) => {
  switch (type) {
    case "search_match":
      return "bg-sky-50 text-sky-700 ring-sky-100";
    case "payment_success":
    case "subscription_activated":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "payment_failed":
    case "subscription_expired":
      return "bg-red-50 text-red-700 ring-red-100";
    case "subscription_expiring":
    case "plan_upgrade_reminder":
      return "bg-yellow-50 text-yellow-700 ring-yellow-100";
    case "property_approved":
    case "project_approved":
    case "promotion_started":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "property_rejected":
    case "project_rejected":
    case "listing_expired":
    case "promotion_expired":
      return "bg-red-50 text-red-700 ring-red-100";
    case "listing_expiring":
      return "bg-yellow-50 text-yellow-700 ring-yellow-100";
    case "brochure_downloaded":
      return "bg-violet-50 text-violet-700 ring-violet-100";
    case "ticket_created":
    case "ticket_assigned":
    case "ticket_updated":
    case "ticket_replied":
    case "ticket_status_changed":
    case "ticket_resolved":
    case "ticket_closed":
    case "ticket_reopened":
    case "ticket_escalated":
    case "ticket_priority_changed":
      return "bg-orange-50 text-orange-700 ring-orange-100";
    case "high_time_spent":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "contact_requested":
      return "bg-rose-50 text-rose-700 ring-rose-100";
    case "property_shortlisted":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "project_shortlisted":
    default:
      return "bg-blue-50 text-blue-700 ring-blue-100";
  }
};

const getNotificationLabel = (type: NotificationType) => {
  switch (type) {
    case "search_match":
      return "Matching Property";
    case "payment_success":
      return "Payment Success";
    case "payment_failed":
      return "Payment Failed";
    case "subscription_activated":
      return "Subscription Activated";
    case "subscription_expiring":
      return "Subscription Expiring";
    case "subscription_expired":
      return "Subscription Expired";
    case "plan_upgrade_reminder":
      return "Upgrade Reminder";
    case "property_approved":
      return "Property Approved";
    case "property_rejected":
      return "Property Rejected";
    case "project_approved":
      return "Project Approved";
    case "project_rejected":
      return "Project Rejected";
    case "listing_expiring":
      return "Listing Expiring";
    case "listing_expired":
      return "Listing Expired";
    case "promotion_started":
      return "Promotion Started";
    case "promotion_expired":
      return "Promotion Expired";
    case "brochure_downloaded":
      return "Brochure";
    case "ticket_created":
      return "Ticket Created";
    case "ticket_assigned":
      return "Ticket Assigned";
    case "ticket_updated":
      return "Ticket Updated";
    case "ticket_replied":
      return "Ticket Replied";
    case "ticket_status_changed":
      return "Ticket Status Changed";
    case "ticket_resolved":
      return "Ticket Resolved";
    case "ticket_closed":
      return "Ticket Closed";
    case "ticket_reopened":
      return "Ticket Reopened";
    case "ticket_escalated":
      return "Ticket Escalated";
    case "ticket_priority_changed":
      return "Ticket Priority Changed";
    case "high_time_spent":
      return "Time Spent";
    case "contact_requested":
      return "Contact Request";
    case "property_shortlisted":
      return "Property Shortlisted";
    case "project_shortlisted":
    default:
      return "Project Shortlisted";
  }
};

const getNotificationHref = (item: NotificationItem) => {
  const rawHref = item.path || item.webUrl || item.url;
  if (!rawHref) return "";
  const origin =
    typeof window === "undefined" ? "https://propenu.com" : window.location.origin;

  try {
    const parsed = new URL(rawHref, origin);
    if (parsed.origin !== origin) return parsed.href;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return rawHref.startsWith("/") ? rawHref : `/${rawHref}`;
  }
};

const NotificationFeed = ({
  containerClassName,
  description,
  error,
  isError,
  isLoading,
  notifications,
  summary,
  title = "Notifications",
}: NotificationFeedProps) => {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterType | "tickets">("all");
  const [activeDateFilter, setActiveDateFilter] = useState<DateRangeFilter>("all");
  const [searchValue, setSearchValue] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [isPushEnabling, setIsPushEnabling] = useState(false);
  const pageSize = 25;

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPushPermission("unsupported");
      return;
    }

    setPushPermission(Notification.permission);
  }, []);

  const availableFilters = useMemo(
    () =>
      FILTERS.filter(
        (filter) =>
          filter.id === "all" ||
          (filter.id === "tickets"
            ? notifications.some((item) => isTicketNotification(item.type))
            : filter.id === "property_approved"
              ? notifications.some((item) => isLifecycleNotification(item.type))
            : filter.id === "payment_success"
              ? notifications.some((item) => isPaymentNotification(item.type))
            : notifications.some((item) => item.type === filter.id)),
      ),
    [notifications],
  );

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (a, b) =>
          getNotificationTimestamp(b.createdAt) -
          getNotificationTimestamp(a.createdAt),
      ),
    [notifications],
  );

  const filteredNotifications = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    return sortedNotifications.filter((item) => {
      const userName = item.user?.name || "";
      const userPhone = item.user?.phone || "";
      const userCode = item.user?.userCode || "";
      const projectTitle = item.project?.title || "";
      const message = item.message || "";

      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "tickets"
          ? isTicketNotification(item.type)
          : activeFilter === "property_approved"
            ? isLifecycleNotification(item.type)
          : activeFilter === "payment_success"
            ? isPaymentNotification(item.type)
          : item.type === activeFilter);
      const matchesDateRange = isWithinDateRange(item.createdAt, activeDateFilter);
      const matchesSearch =
        !query ||
        userName.toLowerCase().includes(query) ||
        userPhone.toLowerCase().includes(query) ||
        userCode.toLowerCase().includes(query) ||
        projectTitle.toLowerCase().includes(query) ||
        message.toLowerCase().includes(query);

      return matchesFilter && matchesDateRange && matchesSearch;
    });
  }, [activeDateFilter, activeFilter, searchValue, sortedNotifications]);

  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / pageSize));

  const paginatedNotifications = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredNotifications.slice(startIndex, startIndex + pageSize);
  }, [currentPage, filteredNotifications]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, activeDateFilter, searchValue]);

  const openNotification = (item: NotificationItem) => {
    const href = getNotificationHref(item);
    if (!href) return;

    if (/^https?:\/\//i.test(href)) {
      window.location.assign(href);
      return;
    }

    router.push(href);
  };

  const enablePushNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Push notifications are not supported in this browser.");
      return;
    }

    if (Notification.permission === "denied") {
      setPushPermission("denied");
      toast.error("Notifications are blocked. Enable them from your browser site settings.");
      return;
    }

    setIsPushEnabling(true);
    try {
      const result = await initWebPushToken();
      setPushPermission(Notification.permission);

      if (result) {
        toast.success("Push notifications enabled for this account.");
        return;
      }

      toast.error("Could not enable push notifications. Please check browser permission.");
    } catch (pushError) {
      console.error("Push notification setup failed:", pushError);
      setPushPermission(Notification.permission);
      toast.error("Push notification setup failed.");
    } finally {
      setIsPushEnabling(false);
    }
  };

  const pushButtonLabel =
    pushPermission === "granted"
      ? "Push On"
      : pushPermission === "denied"
        ? "Push Blocked"
        : "Enable Push";

  const resolvedSummary = {
    total: summary?.total ?? notifications.length,
    unread: summary?.unread ?? 0,
    shortlists:
      summary?.shortlists ??
      notifications.filter(
        (item) =>
          item.type === "project_shortlisted" || item.type === "property_shortlisted",
      ).length,
    contacts:
      summary?.contacts ??
      notifications.filter((item) => item.type === "contact_requested").length,
    tickets:
      summary?.tickets ??
      notifications.filter((item) => isTicketNotification(item.type)).length,
    brochureDownloads:
      summary?.brochureDownloads ??
      notifications.filter((item) => item.type === "brochure_downloaded").length,
    timeSpent:
      summary?.timeSpent ??
      notifications.filter((item) => item.type === "high_time_spent").length,
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-gray-100 bg-white text-gray-500">
        Loading notifications...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-red-100 bg-red-50 px-4 text-center text-red-600">
        Error: {error instanceof Error ? error.message : "Failed to load notifications"}
      </div>
    );
  }

  if (!notifications.length) {
    return (
      <div className={`mx-auto max-w-7xl space-y-4 sm:space-y-6 ${containerClassName ?? ""}`.trim()}>
        <div className="rounded-xl border border-green-100 bg-linear-to-r from-green-50 via-white to-emerald-50 px-4 py-4 sm:rounded-2xl sm:px-5 sm:py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl md:text-3xl">{title}</h1>
              <p className="mt-1.5 max-w-3xl text-xs leading-5 text-gray-600 sm:mt-2 sm:text-sm md:text-base">{description}</p>
            </div>

            <button
              type="button"
              onClick={enablePushNotifications}
              disabled={
                isPushEnabling ||
                pushPermission === "granted" ||
                pushPermission === "unsupported"
              }
              className="inline-flex w-fit items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-[#21884B] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 sm:px-4 sm:py-2 sm:text-sm"
            >
              <FiBell className="h-4 w-4" />
              <span>{isPushEnabling ? "Enabling..." : pushButtonLabel}</span>
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-[#E4ECE7] bg-white py-10 text-center text-gray-500 sm:rounded-2xl sm:py-14">
          <div className="flex justify-center">
            <NopropertiesSvg />
          </div>
          <p className="mt-4 text-base font-medium text-gray-700">
            No notifications found yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`mx-auto min-w-0 max-w-7xl space-y-4 sm:space-y-6 ${containerClassName ?? ""}`.trim()}>
      <div className="rounded-xl border border-green-100 bg-linear-to-r from-green-50 via-white to-emerald-50 px-4 py-4 sm:rounded-2xl sm:px-5 sm:py-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl md:text-3xl">{title}</h1>
            <p className="mt-1.5 max-w-3xl text-xs leading-5 text-gray-600 sm:mt-2 sm:text-sm md:text-base">{description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={enablePushNotifications}
              disabled={
                isPushEnabling ||
                pushPermission === "granted" ||
                pushPermission === "unsupported"
              }
              className="inline-flex w-fit items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-[#21884B] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 sm:px-4 sm:py-2 sm:text-sm"
            >
              <FiBell className="h-4 w-4" />
              <span>{isPushEnabling ? "Enabling..." : pushButtonLabel}</span>
            </button>

            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-[#21884B] sm:px-4 sm:py-2 sm:text-sm">
              <FiBell className="h-4 w-4" />
              <span>{resolvedSummary.total} notifications</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className={`${SUMMARY_CARD_LAYOUTS[0]} rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm sm:rounded-2xl sm:px-5 sm:py-4 xl:col-span-1`}>
          <p className="text-xs font-medium leading-tight text-gray-500 sm:text-sm">All Notifications</p>
          <p className="mt-1 text-xl font-semibold text-gray-900 sm:mt-2 sm:text-2xl">{resolvedSummary.total}</p>
        </div>
        <div className={`${SUMMARY_CARD_LAYOUTS[1]} rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm sm:rounded-2xl sm:px-5 sm:py-4 xl:col-span-1`}>
          <p className="text-xs font-medium leading-tight text-gray-500 sm:text-sm">Shortlists</p>
          <p className="mt-1 text-xl font-semibold text-gray-900 sm:mt-2 sm:text-2xl">{resolvedSummary.shortlists}</p>
        </div>
        <div className={`${SUMMARY_CARD_LAYOUTS[2]} rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm sm:rounded-2xl sm:px-5 sm:py-4 xl:col-span-1`}>
          <p className="text-xs font-medium leading-tight text-gray-500 sm:text-sm">Contacts</p>
          <p className="mt-1 text-xl font-semibold text-gray-900 sm:mt-2 sm:text-2xl">{resolvedSummary.contacts}</p>
        </div>
        <div className={`${SUMMARY_CARD_LAYOUTS[3]} rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm sm:rounded-2xl sm:px-5 sm:py-4 xl:col-span-1`}>
          <p className="text-xs font-medium leading-tight text-gray-500 sm:text-sm">Tickets</p>
          <p className="mt-1 text-xl font-semibold text-gray-900 sm:mt-2 sm:text-2xl">
            {resolvedSummary.tickets}
          </p>
        </div>
        <div className={`${SUMMARY_CARD_LAYOUTS[4]} rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm sm:rounded-2xl sm:px-5 sm:py-4 xl:col-span-1`}>
          <p className="text-xs font-medium leading-tight text-gray-500 sm:text-sm">Brochure / Time</p>
          <p className="mt-1 text-xl font-semibold text-gray-900 sm:mt-2 sm:text-2xl">
            {resolvedSummary.brochureDownloads + resolvedSummary.timeSpent}
          </p>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm sm:rounded-2xl">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-2 sm:space-y-3">
              <div className="-mx-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
                <div className="flex w-max min-w-full gap-1.5 sm:min-w-0 sm:flex-wrap sm:gap-2">
                  {availableFilters.map((filter) => {
                    const isActive = activeFilter === filter.id;

                    return (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setActiveFilter(filter.id)}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition sm:px-4 sm:py-2 sm:text-sm ${
                          isActive
                            ? "bg-[#26ad5f] text-white"
                            : "bg-[#F6FBF8] text-gray-600 hover:bg-[#EAF6EE]"
                        }`}
                      >
                        {filter.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="-mx-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
                <div className="flex w-max min-w-full gap-1.5 sm:min-w-0 sm:flex-wrap sm:gap-2">
                  {DATE_FILTERS.map((filter) => {
                    const isActive = activeDateFilter === filter.id;

                    return (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setActiveDateFilter(filter.id)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition sm:px-3.5 sm:text-xs ${
                          isActive
                            ? "border-[#26ad5f] bg-[#EAF6EE] text-[#21884B]"
                            : "border-gray-200 bg-white text-gray-600 hover:border-[#BFE5CB] hover:bg-[#F6FBF8]"
                        }`}
                      >
                        {filter.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:gap-3 xl:w-auto xl:min-w-[22rem]">
              <div className="relative min-w-0 flex-1 xl:w-80">
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search user, phone, code, property..."
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 outline-none transition focus:border-[#26ad5f] sm:rounded-xl sm:py-2.5 sm:pl-10 sm:pr-4"
                />
              </div>

              <div className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-center text-xs text-gray-500 sm:justify-start sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm">
                <FiFilter className="h-4 w-4" />
                <span>
                  {filteredNotifications.length} shown · Page {currentPage} of {totalPages}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-100 md:hidden">
          {paginatedNotifications.map((item, index) => (
            <article
              key={`${item.id}-${item.createdAt ?? "unknown"}-${index}`}
              onClick={() => openNotification(item)}
              role={getNotificationHref(item) ? "button" : undefined}
              tabIndex={getNotificationHref(item) ? 0 : undefined}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openNotification(item);
                }
              }}
              className={`space-y-2.5 px-3 py-3 ${
                getNotificationHref(item) ? "cursor-pointer transition hover:bg-[#FCFDFD]" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {item.user?.name || "You"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {item.user?.userCode || "No code"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-medium text-gray-700">{formatDate(item.createdAt)}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400">{formatTime(item.createdAt)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${getNotificationAccentClasses(
                    item.type,
                  )}`}
                >
                  {getNotificationLabel(item.type)}
                </span>
                <span className="rounded-full bg-[#F3FBF6] px-2 py-0.5 text-[10px] font-semibold text-[#21884B]">
                  {getRoleLabel(item.user?.role)}
                </span>
                {item.type === "high_time_spent" &&
                item.timeSpentMinutes &&
                item.timeSpentMinutes > 0 ? (
                  <span className="inline-flex rounded-full bg-[#F6FBF8] px-2 py-0.5 text-[10px] font-semibold text-[#21884B]">
                    {formatMinutes(item.timeSpentMinutes)}
                  </span>
                ) : null}
              </div>

              <div className="grid gap-2">
                <div className="grid grid-cols-[64px_1fr] gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Contact
                  </p>
                  <div className="min-w-0 text-right">
                    <p className="truncate text-xs text-gray-700">{item.user?.email || "No email"}</p>
                    <p className="text-xs text-gray-700">{item.user?.phone || "No phone"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-[64px_1fr] gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Project
                  </p>
                  <p className="truncate text-right text-xs font-medium text-gray-900">
                    {item.project?.title || "Untitled Project"}
                  </p>
                </div>
              </div>

              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Message
                </p>
                <p className="text-xs leading-5 text-gray-800">
                  {item.message || "No message"}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden w-full overflow-x-auto md:block">
          <table className="w-full min-w-[900px] border-collapse text-left xl:min-w-full">
            <thead className="bg-[#F8FBF9]">
              <tr className="text-xs text-gray-500 lg:text-sm">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Contact Detail</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Message</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {paginatedNotifications.map((item, index) => (
                <tr
                  key={`${item.id}-${item.createdAt ?? "unknown"}-${index}`}
                  onClick={() => openNotification(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openNotification(item);
                    }
                  }}
                  tabIndex={getNotificationHref(item) ? 0 : undefined}
                  className={`transition hover:bg-[#FCFDFD] ${
                    getNotificationHref(item) ? "cursor-pointer" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <p>{formatDate(item.createdAt)}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{formatTime(item.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold leading-6 text-gray-900">
                        {item.user?.name || "You"}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {item.user?.userCode || "No code"}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-0.5">
                      <p className="text-[11px] text-gray-500">
                        {item.user?.email || "No email"}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {item.user?.phone || "No phone"}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="rounded-full bg-[#F3FBF6] px-2.5 py-1 text-[11px] font-semibold text-[#21884B]">
                      {getRoleLabel(item.user?.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className="text-sm font-medium leading-5 text-gray-900">
                      {item.project?.title || "Untitled Project"}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${getNotificationAccentClasses(
                            item.type,
                          )}`}
                        >
                          {getNotificationLabel(item.type)}
                        </span>
                        {item.type === "high_time_spent" &&
                        item.timeSpentMinutes &&
                        item.timeSpentMinutes > 0 ? (
                          <span className="inline-flex rounded-full bg-[#F6FBF8] px-2 py-1 text-[10px] font-semibold text-[#21884B]">
                            {formatMinutes(item.timeSpentMinutes)}
                          </span>
                        ) : null}
                      </div>

                      <p className="text-sm leading-6 text-gray-800">
                        {item.message || "No message"}
                      </p>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredNotifications.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-gray-100 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
            <p className="text-xs text-gray-500 sm:text-sm">
              Showing {(currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, filteredNotifications.length)} of{" "}
              {filteredNotifications.length} notifications
            </p>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-[#F6FBF8] disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-lg sm:px-3 sm:py-2 sm:text-sm"
              >
                Previous
              </button>

              {Array.from({ length: totalPages }, (_, index) => index + 1)
                .slice(Math.max(0, currentPage - 3), Math.max(0, currentPage - 3) + 5)
                .map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`min-w-8 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:min-w-10 sm:rounded-lg sm:px-3 sm:py-2 sm:text-sm ${
                      currentPage === page
                        ? "bg-[#26ad5f] text-white"
                        : "border border-gray-200 text-gray-600 hover:bg-[#F6FBF8]"
                    }`}
                  >
                    {page}
                  </button>
                ))}

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-[#F6FBF8] disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-lg sm:px-3 sm:py-2 sm:text-sm"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default NotificationFeed;
