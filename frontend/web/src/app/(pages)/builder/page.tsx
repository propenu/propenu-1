"use client";

import { useEffect, useRef, useState } from "react";
import { getBuilderDashboards } from "@/data/ClientData";
import { useQuery } from "@tanstack/react-query";
import KpiCard from "../agent/ui/KpiCard";
import Dropdownui from "@/ui/DropDownUI";
import { HiHome, HiTrendingUp } from "react-icons/hi";
import { HiBuildingOffice2 } from "react-icons/hi2";
import { MdOutlineStar } from "react-icons/md";
import { FiCalendar, FiChevronDown, FiEye, FiImage, FiMapPin, FiUsers, FiTarget, FiMousePointer } from "react-icons/fi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TopViewedItem = {
  _id: string;
  title: string;
  city: string;
  state?: string;
  heroImage?: string;
  image?: string;
  gallerySummary?: Array<{
    url?: string;
  }>;
  status?: string;
  createdAt?: string;
  meta?: {
    views?: number;
    inquiries?: number;
    clicks?: number;
    shortlists?: number;
  };
};

type LocationBucket = {
  _id: string;
  count: number;
};

type TrendPoint = {
  label: string;
  count: number;
};

type ProjectEngagementItem = {
  _id: string;
  title: string;
  city?: string;
  state?: string;
  status?: string;
  views: number;
  shortlists: number;
  brochureDownloads: number;
  callRequests: number;
  clicks: number;
};

type BuilderDashboardResponse = {
  builderSummary: {
    totalProjects: number;
    totalViews: number;
    totalClicks?: number;
    featuredProjects: number;
    primeProjects?: number;
    sponsoredProjects?: number;
    totalShortlists: number;
    totalLeads: number;
    totalInquiries: number;
    averageViewsPerProject: number;
    averageShortlistsPerProject: number;
    averageLeadsPerProject: number;
    totalUnits?: number;
    availableUnits?: number;
    soldUnits?: number;
    inventorySoldShare?: number;
    conversionRates?: {
      viewsToShortlists: number;
      shortlistsToLeads: number;
      overallConversion: number;
    };
  };
  statusSummary?: {
    active: number;
    inactive: number;
    archived: number;
  };
  engagementSummary?: {
    totalViews: number;
    totalShortlists: number;
    totalLeads: number;
    totalInquiries: number;
    averageViewsPerProject: number;
    averageShortlistsPerProject: number;
    averageLeadsPerProject: number;
    totalClicks?: number;
    totalUnits?: number;
    availableUnits?: number;
    soldUnits?: number;
    inventorySoldShare?: number;
    conversionRates?: {
      viewsToShortlists: number;
      shortlistsToLeads: number;
      overallConversion: number;
    };
  };
  locationStats: {
    cities: LocationBucket[];
    states: LocationBucket[];
  };
  filterOptions?: {
    states?: string[];
    citiesByState?: Record<string, string[]>;
  };
  trendStats?: {
    range?: string;
    projectsCreated?: TrendPoint[];
    shortlists?: TrendPoint[];
    leads?: TrendPoint[];
  };
  projectEngagement?: ProjectEngagementItem[];
  topViewed: TopViewedItem[];
};

const CITY_BAR_COLORS = ["#1D4ED8", "#2563EB", "#3B82F6", "#60A5FA", "#93C5FD"];
const STATUS_COLORS = {
  active: "#16A34A",
  inactive: "#F59E0B",
  archived: "#64748B",
};
const DATE_RANGE_OPTIONS = [
  { label: "Today", value: "1d" },
  { label: "This Week", value: "7d" },
  { label: "This Month", value: "30d" },
  { label: "Custom Date", value: "custom" },
];
const PROJECT_IMAGE_FALLBACK = "/images/placeholder.svg";
const MOMENTUM_PAGE_SIZE = 5;
const dashboardKpiSkeletonItems = Array.from({ length: 8 });
const dashboardMiniMetricSkeletonItems = Array.from({ length: 4 });
const chartBarSkeletonItems = Array.from({ length: 8 });
const chartBarHeights = ["h-32", "h-48", "h-40", "h-56", "h-44", "h-64", "h-36", "h-52"];
const horizontalChartBarWidths = ["w-7/12", "w-10/12", "w-8/12", "w-11/12", "w-6/12", "w-9/12", "w-5/12", "w-8/12"];
const momentumSkeletonItems = Array.from({ length: 5 });

const formatNumber = (value?: number | null) => {
  const normalized = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return normalized.toLocaleString();
};

const getInitials = (value?: string) =>
  (value || "Project")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const getProjectImage = (item: TopViewedItem) =>
  item.heroImage ||
  item.image ||
  item.gallerySummary?.[0]?.url ||
  PROJECT_IMAGE_FALLBACK;

const sortByCountDesc = <T extends { count?: number; total?: number; listings?: number }>(items: T[]) =>
  [...items].sort((a, b) => {
    const left = a.count ?? a.total ?? a.listings ?? 0;
    const right = b.count ?? b.total ?? b.listings ?? 0;
    return right - left;
  });

const EmptyChartState = ({ message }: { message: string }) => (
  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-6 text-center text-sm text-gray-500">
    {message}
  </div>
);

const StatusCard = ({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) => (
  <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
    </div>
    <p className="text-2xl font-semibold text-gray-900">{formatNumber(value)}</p>
  </div>
);

const getDateRangeLabel = (value: string) =>
  DATE_RANGE_OPTIONS.find((option) => option.value === value)?.label || "Select range";

const SkeletonBlock = ({ className }: { className: string }) => (
  <div
    className={`animate-pulse rounded-md bg-gray-200/80 ${className}`}
    aria-hidden="true"
  />
);

const KpiCardSkeleton = () => (
  <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="mt-4 h-7 w-20" />
      </div>
      <SkeletonBlock className="h-11 w-11 shrink-0 rounded-xl" />
    </div>
  </div>
);

const ChartSkeleton = ({ variant = "vertical" }: { variant?: "vertical" | "horizontal" }) => {
  if (variant === "horizontal") {
    return (
      <div className="flex h-full flex-col justify-center gap-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-5">
        {chartBarSkeletonItems.map((_, index) => (
          <SkeletonBlock
            key={`chart-bar-skeleton-${variant}-${index}`}
            className={`h-7 rounded-r-lg ${horizontalChartBarWidths[index]}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full items-end gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-5">
      {chartBarSkeletonItems.map((_, index) => (
        <SkeletonBlock
          key={`chart-bar-skeleton-${variant}-${index}`}
          className={`w-full rounded-t-lg ${chartBarHeights[index]}`}
        />
      ))}
    </div>
  );
};

const DashboardSkeleton = () => (
  <div className="mx-auto w-full" aria-busy="true" aria-label="Loading dashboard">
    <div className="mb-6 sm:mb-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-7 w-72 max-w-full" />
          <SkeletonBlock className="mt-3 h-4 w-full max-w-3xl" />
          <SkeletonBlock className="mt-2 h-4 w-4/5 max-w-2xl" />
        </div>

        <div className="w-full rounded-md p-2 xl:max-w-60">
          <SkeletonBlock className="h-[42px] w-full rounded-[14px]" />
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
      {dashboardKpiSkeletonItems.slice(0, 4).map((_, index) => (
        <KpiCardSkeleton key={`primary-kpi-skeleton-${index}`} />
      ))}
    </div>

    <div className="mt-4 grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
      {dashboardKpiSkeletonItems.slice(4).map((_, index) => (
        <KpiCardSkeleton key={`engagement-kpi-skeleton-${index}`} />
      ))}
    </div>

    <div className="mt-8 rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-6 w-48" />
          <SkeletonBlock className="mt-2 h-4 w-full max-w-2xl" />
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 xl:min-w-[260px]">
          <SkeletonBlock className="h-3 w-36 bg-blue-200/70" />
          <SkeletonBlock className="mt-3 h-4 w-44 bg-blue-200/70" />
          <SkeletonBlock className="mt-2 h-3 w-32 bg-blue-200/70" />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {dashboardMiniMetricSkeletonItems.map((_, index) => (
          <div key={`mini-metric-skeleton-${index}`} className="rounded-xl bg-gray-50 px-4 py-3">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="mt-3 h-6 w-14" />
          </div>
        ))}
      </div>

      <div className="h-[390px]">
        <ChartSkeleton />
      </div>
    </div>

    <div className="mt-8 grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
        <SkeletonBlock className="h-6 w-40" />
        <SkeletonBlock className="mt-2 h-4 w-full max-w-md" />
        <div className="mt-4 h-80">
          <ChartSkeleton />
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
        <SkeletonBlock className="h-6 w-40" />
        <SkeletonBlock className="mt-2 h-4 w-full max-w-md" />
        <div className="mt-4 h-80">
          <ChartSkeleton variant="horizontal" />
        </div>
      </div>
    </div>

    <div className="mt-8 rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
      <SkeletonBlock className="h-6 w-44" />
      <SkeletonBlock className="mt-2 h-4 w-full max-w-xl" />

      <div className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        <div className="hidden grid-cols-[minmax(0,3fr)_0.65fr_0.8fr_0.7fr_0.7fr_0.85fr] gap-3 border-b border-slate-200 bg-linear-to-r from-slate-50 to-white px-5 py-3 md:grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={`momentum-head-skeleton-${index}`} className="h-3 w-20" />
          ))}
        </div>

        <div className="divide-y divide-slate-100">
          {momentumSkeletonItems.map((_, index) => (
            <div
              key={`momentum-row-skeleton-${index}`}
              className="grid gap-2.5 px-3 py-3 md:grid-cols-[minmax(0,3fr)_0.6fr_0.75fr_0.65fr_0.65fr_0.8fr] md:items-center md:px-4"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <SkeletonBlock className="h-9 w-9 shrink-0 rounded-full" />
                <SkeletonBlock className="h-[72px] w-[88px] shrink-0 rounded-[18px]" />
                <div className="min-w-0 flex-1">
                  <SkeletonBlock className="h-4 w-4/5" />
                  <SkeletonBlock className="mt-3 h-5 w-20 rounded-full" />
                  <SkeletonBlock className="mt-3 h-3 w-32" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:contents">
                {Array.from({ length: 5 }).map((__, metricIndex) => (
                  <SkeletonBlock
                    key={`momentum-row-${index}-metric-${metricIndex}`}
                    className="h-10 rounded-xl md:h-4 md:w-14 md:justify-self-center md:rounded-md"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-4 py-3">
          <SkeletonBlock className="h-3 w-40" />
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-8 w-8 rounded-full" />
            <SkeletonBlock className="h-8 w-8 rounded-full" />
            <SkeletonBlock className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const Dashboard = () => {
  const [dateRange, setDateRange] = useState("30d");
  const [customFromDate, setCustomFromDate] = useState("");
  const [customToDate, setCustomToDate] = useState("");
  const [momentumPage, setMomentumPage] = useState(1);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const dateRangeRef = useRef<HTMLDivElement | null>(null);
  const { data, error, isLoading, isError } = useQuery<BuilderDashboardResponse | null>({
    queryKey: [
      "builder-dashboard",
      dateRange,
      customFromDate,
      customToDate,
    ],
    queryFn: () =>
      getBuilderDashboards(dateRange, {
        fromDate: dateRange === "custom" ? customFromDate || undefined : undefined,
        toDate: dateRange === "custom" ? customToDate || undefined : undefined,
      }),
    enabled:
      dateRange !== "custom" || Boolean(customFromDate && customToDate),
    staleTime: 1000 * 60 * 5,
  });

  const summary = data?.builderSummary;
  const totalProjects = summary?.totalProjects ?? 0;
  const totalViews = summary?.totalViews ?? 0;
  const featuredProjects = summary?.featuredProjects ?? 0;
  const primeProjects = summary?.primeProjects ?? 0;
  const sponsoredProjects = summary?.sponsoredProjects ?? 0;
  const totalShortlists = summary?.totalShortlists ?? 0;
  const totalLeads = summary?.totalLeads ?? 0;
  const averageViewsPerProject = summary?.averageViewsPerProject ?? 0;

  const cityChartData =
    sortByCountDesc(
      data?.locationStats?.cities?.map((item) => ({
        city: item._id || "Unknown",
        listings: item.count,
      })) ?? [],
    );

  const stateChartData =
    sortByCountDesc(
      data?.locationStats?.states?.map((item) => ({
        state: item._id || "Unknown",
        total: item.count,
      })) ?? [],
    );

  const topViewedProjects =
    data?.topViewed?.map((item) => {
      const views = item.meta?.views ?? 0;
      const inquiries = item.meta?.inquiries ?? 0;
      const clicks = item.meta?.clicks ?? 0;
      const shortlists = item.meta?.shortlists ?? 0;
      const image = getProjectImage(item);

      return {
        ...item,
        image,
        views,
        clicks,
        inquiries,
        shortlists,
        viewShare: totalViews > 0 ? Math.round((views / totalViews) * 100) : 0,
      };
    }) ?? [];

  const momentumPageCount = Math.max(
    1,
    Math.ceil(topViewedProjects.length / MOMENTUM_PAGE_SIZE),
  );
  const paginatedTopViewedProjects = topViewedProjects.slice(
    (momentumPage - 1) * MOMENTUM_PAGE_SIZE,
    momentumPage * MOMENTUM_PAGE_SIZE,
  );

  const leadingProject = topViewedProjects[0];
  const hasViewData = totalViews > 0;
  const projectEngagementData =
    data?.projectEngagement?.map((project, index, projects) => {
      const title = project.title || "Untitled Project";
      const duplicateIndex =
        projects.slice(0, index + 1).filter((item) => (item.title || "Untitled Project") === title).length;
      const hasDuplicateTitle = projects.some(
        (item, itemIndex) => itemIndex !== index && (item.title || "Untitled Project") === title,
      );
      const shortTitle = title.length > 20 ? `${title.slice(0, 20)}...` : title;

      return {
        ...project,
        title,
        shortTitle: hasDuplicateTitle ? `${shortTitle} #${duplicateIndex}` : shortTitle,
        location: [project.city, project.state].filter(Boolean).join(", ") || "Unknown location",
      };
    }) ?? [];
  const hasProjectEngagement = projectEngagementData.some(
    (project) =>
      project.views > 0 ||
      project.shortlists > 0 ||
      project.brochureDownloads > 0 ||
      project.callRequests > 0,
  );
  const totalBrochureDownloads = projectEngagementData.reduce(
    (sum, project) => sum + project.brochureDownloads,
    0,
  );
  const totalCallRequests = projectEngagementData.reduce(
    (sum, project) => sum + project.callRequests,
    0,
  );
  const topEngagementProject = projectEngagementData[0];

  const engagementCards = [
    {
      title: "Total Shortlists",
      value: totalShortlists,
      icon: <FiUsers size={22} className="text-sky-600" />,
      bgColor: "#F3FAFF",
      iconBgColor: "#DDF0FF",
    },
    {
      title: "Total Leads",
      value: totalLeads,
      icon: <FiTarget size={22} className="text-rose-600" />,
      bgColor: "#FFF4F6",
      iconBgColor: "#FFE1E8",
    },
    {
      title: "Total Clicks",
      value: summary?.totalClicks ?? 0,
      icon: <FiMousePointer size={22} className="text-fuchsia-600" />,
      bgColor: "#FCF4FF",
      iconBgColor: "#F4E1FF",
    },
    {
      title: "Sponsored Projects",
      value: sponsoredProjects,
      icon: <HiBuildingOffice2 size={22} className="text-teal-600" />,
      bgColor: "#F1FCFA",
      iconBgColor: "#D8F5EF",
    },
  ];

  const handleDateRangeChange = (value: string) => {
    setDateRange(value);
    setDateRangeOpen(value === "custom");
    if (value !== "custom") {
      setCustomFromDate("");
      setCustomToDate("");
    }
  };

  const closeDateRangeWhenComplete = (fromDate: string, toDate: string) => {
    if (fromDate && toDate) {
      setDateRangeOpen(false);
    }
  };

  const handleCustomFromDateChange = (value: string) => {
    setCustomFromDate(value);
    closeDateRangeWhenComplete(value, customToDate);
  };

  const handleCustomToDateChange = (value: string) => {
    setCustomToDate(value);
    closeDateRangeWhenComplete(customFromDate, value);
  };

  const handleMomentumPageChange = (page: number) => {
    setMomentumPage(page);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dateRangeRef.current && !dateRangeRef.current.contains(target)) {
        setDateRangeOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="mx-auto w-full">
      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
      {isError && error && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Unable to load builder dashboard data: {(error as Error).message}
        </div>
      )}
      {!isError && !data && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          No builder dashboard data is available for the selected range yet.
        </div>
      )}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <h1 className="mb-1 text-xl font-semibold text-gray-900 sm:text-2xl">
              Builder Analytics Dashboard
            </h1>
            <p className="text-sm text-gray-600 sm:text-base">
              Monitor project reach, engagement signals, and portfolio health across your builder inventory.
            </p>
          </div>

          <div className="w-full rounded-md p-2  xl:max-w-60">
            <div ref={dateRangeRef} className="relative">
              <button
                type="button"
                onClick={() => setDateRangeOpen((current) => !current)}
                className="flex h-[42px] w-full items-center justify-between rounded-[14px] border border-[#d8ebe0] px-3 text-left shadow-sm transition hover:border-[#bde2ca] focus:outline-none focus:ring-4 focus:ring-[#22c06f]/10"
              >
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#5e8b70]">
                    Date Range
                  </p>
                  <p className="mt-0.5 text-[14px] font-semibold leading-none text-[#163322]">
                    {getDateRangeLabel(dateRange)}
                  </p>
                </div>
                <FiChevronDown
                  className={`h-4 w-4 text-[#1f7a4d] transition ${dateRangeOpen ? "rotate-180" : ""}`}
                />
              </button>

              {dateRangeOpen ? (
                <div className="absolute right-0 top-[48px] z-20 w-full overflow-hidden rounded-[16px] border border-[#d8ebe0] bg-white p-2 shadow-[0_18px_40px_rgba(22,51,34,0.14)]">
                  <div className="grid grid-cols-1 gap-2">
                    {DATE_RANGE_OPTIONS.map((option) => {
                      const active = dateRange === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleDateRangeChange(option.value)}
                          className={`rounded-[12px] border px-2.5 py-2 text-left transition ${
                            active
                              ? "border-[#22c06f] bg-[#ebfff3] text-[#166534]"
                              : "border-[#e3efe8] bg-[#fbfefc] text-[#355846] hover:border-[#cfe5d8] hover:bg-[#f3fbf6]"
                          }`}
                        >
                          <p className="text-[12px] font-semibold leading-tight">{option.label}</p>
                        </button>
                      );
                    })}
                  </div>

                  {dateRange === "custom" ? (
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                      <label className="relative block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5e8b70]">
                          From
                        </span>
                        <input
                          type="date"
                          max={customToDate || undefined}
                          value={customFromDate}
                          onChange={(event) => handleCustomFromDateChange(event.target.value)}
                          className="h-[38px] w-full rounded-[12px] border border-[#d8ebe0] bg-[#f9fffc] px-2.5 pr-8 text-[12px] font-semibold text-[#163322] outline-none transition focus:border-[#22c06f] focus:ring-4 focus:ring-[#22c06f]/10"
                        />
                        <FiCalendar className="pointer-events-none absolute right-2.5 top-[calc(50%+9px)] h-3.5 w-3.5 -translate-y-1/2 text-[#1f7a4d]" />
                      </label>

                      <label className="relative block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5e8b70]">
                          To
                        </span>
                        <input
                          type="date"
                          min={customFromDate || undefined}
                          value={customToDate}
                          onChange={(event) => handleCustomToDateChange(event.target.value)}
                          className="h-[38px] w-full rounded-[12px] border border-[#d8ebe0] bg-[#f9fffc] px-2.5 pr-8 text-[12px] font-semibold text-[#163322] outline-none transition focus:border-[#22c06f] focus:ring-4 focus:ring-[#22c06f]/10"
                        />
                        <FiCalendar className="pointer-events-none absolute right-2.5 top-[calc(50%+9px)] h-3.5 w-3.5 -translate-y-1/2 text-[#1f7a4d]" />
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
        <KpiCard
          title="Total Projects"
          value={formatNumber(totalProjects)}
          icon={<HiHome size={22} className="text-blue-600" />}
          bgColor="#F5F9FF"
          iconBgColor="#E0ECFF"
        />
        <KpiCard
          title="Total Views"
          value={formatNumber(totalViews)}
          icon={<FiEye size={22} className="text-emerald-600" />}
          bgColor="#F3FBF7"
          iconBgColor="#DFF4E8"
        />
        <KpiCard
          title="Top selling Projects"
          value={formatNumber(featuredProjects)}
          icon={<MdOutlineStar size={22} className="text-amber-600" />}
          bgColor="#FFF7ED"
          iconBgColor="#FFE7CC"
        />
        <KpiCard
          title="Avg Views / Project"
          value={formatNumber(averageViewsPerProject)}
          icon={<HiTrendingUp size={22} className="text-indigo-600" />}
          bgColor="#F5F7FF"
          iconBgColor="#E4E8FF"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
        {engagementCards.map((card) => (
          <KpiCard
            key={card.title}
            title={card.title}
            value={typeof card.value === "number" ? formatNumber(card.value) : card.value}
            icon={card.icon}
            bgColor={card.bgColor}
            iconBgColor={card.iconBgColor}
          />
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Project Performance</h2>
            <p className="text-sm text-gray-500">
              Compare page views, shortlists, brochure downloads, and call requests project by project.
            </p>
          </div>

          {topEngagementProject ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 xl:min-w-[260px]">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">
                Top visibility project
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-blue-950">
                {topEngagementProject.title}
              </p>
              <p className="mt-1 text-xs text-blue-700">
                {formatNumber(topEngagementProject.views)} views in this range
              </p>
            </div>
          ) : null}
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl bg-blue-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Views</p>
            <p className="mt-1 text-xl font-semibold text-blue-900">{formatNumber(totalViews)}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600">Shortlists</p>
            <p className="mt-1 text-xl font-semibold text-emerald-900">{formatNumber(totalShortlists)}</p>
          </div>
          <div className="rounded-xl bg-orange-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-600">Brochures</p>
            <p className="mt-1 text-xl font-semibold text-orange-900">{formatNumber(totalBrochureDownloads)}</p>
          </div>
          <div className="rounded-xl bg-violet-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600">Call Requests</p>
            <p className="mt-1 text-xl font-semibold text-violet-900">{formatNumber(totalCallRequests)}</p>
          </div>
        </div>

        <div className="h-[390px]">
          {hasProjectEngagement ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projectEngagementData} barGap={4} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis
                  dataKey="shortTitle"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  height={72}
                  tick={{ fontSize: 11 }}
                  angle={-20}
                  textAnchor="end"
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={56} />
                <Tooltip
                  cursor={{ fill: "#F8FAFC" }}
                  formatter={(value, name) => [formatNumber(Number(value)), name]}
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload;
                    return item ? `${item.title} - ${item.location}` : "Project";
                  }}
                />
                <Legend />
                <Bar dataKey="brochureDownloads" name="Brochure Downloads" fill="#F97316" radius={[6, 6, 0, 0]} />
                <Bar dataKey="callRequests" name="Call Requests" fill="#7C3AED" radius={[6, 6, 0, 0]} />
                <Bar dataKey="shortlists" name="Shortlists" fill="#16A34A" radius={[6, 6, 0, 0]} />
                <Bar dataKey="views" name="Views" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState message="No project performance activity is available for this date range yet." />
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Projects by City</h2>
            <p className="text-sm text-gray-500">
              Geographic concentration of your builder inventory.
            </p>
          </div>

          <div className="h-80">
            {cityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cityChartData} barSize={42}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="city" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#F9FAFB" }} />
                  <Bar dataKey="listings" radius={[8, 8, 0, 0]}>
                    {cityChartData.map((entry, index) => (
                      <Cell
                        key={`${entry.city}-${index}`}
                        fill={CITY_BAR_COLORS[index % CITY_BAR_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChartState message="No city distribution data is available for this builder yet." />
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Projects by State</h2>
            <p className="text-sm text-gray-500">
              State-level spread of your builder projects.
            </p>
          </div>

          <div className="h-80">
            {stateChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stateChartData} layout="vertical" barSize={24}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="state"
                    type="category"
                    width={90}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip cursor={{ fill: "#F9FAFB" }} />
                  <Bar dataKey="total" fill="#0F766E" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChartState message="No state distribution data is available for this builder yet." />
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Pipeline Momentum</h2>
          <p className="text-sm text-gray-500">
            Project-level momentum across leads, shortlists, clicks, and views.
          </p>
        </div>

        {topViewedProjects.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
            <div className="hidden grid-cols-[minmax(0,3fr)_0.65fr_0.8fr_0.7fr_0.7fr_0.85fr] gap-3 border-b border-slate-200 bg-linear-to-r from-slate-50 to-white px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 md:grid">
              <p>Project</p>
              <p className="text-center">Leads</p>
              <p className="text-center">Shortlists</p>
              <p className="text-center">Clicks</p>
              <p className="text-center">Views</p>
              <p className="text-center">Status</p>
            </div>

            <div className="divide-y divide-slate-100">
              {paginatedTopViewedProjects.map((item, index) => (
                <div
                  key={item._id}
                  className="grid gap-2.5 px-3 py-3 transition hover:bg-slate-50/60 md:grid-cols-[minmax(0,3fr)_0.6fr_0.75fr_0.65fr_0.65fr_0.8fr] md:items-center md:px-4"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                      {(momentumPage - 1) * MOMENTUM_PAGE_SIZE + index + 1}
                    </div>

                    <div className="relative h-[72px] w-[88px] shrink-0 overflow-hidden rounded-[18px] border border-slate-200 bg-linear-to-br from-slate-50 via-white to-emerald-50 shadow-sm">
                      {item.image !== PROJECT_IMAGE_FALLBACK ? (
                        <img
                          src={item.image}
                          alt={item.title}
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                            const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = "flex";
                          }}
                        />
                      ) : null}
                      <div
                        className="absolute inset-0 hidden items-center justify-center"
                        style={{ display: item.image === PROJECT_IMAGE_FALLBACK ? "flex" : "none" }}
                      >
                        <div className="flex flex-col items-center gap-2 text-center">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
                            {getInitials(item.title)}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                            <FiImage size={12} />
                            <span>No Visual</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 space-y-1">
                      <h3 className="line-clamp-1 text-sm font-semibold text-slate-950">
                        {item.title}
                      </h3>
                      {hasViewData && (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                          {item.viewShare}% share
                        </span>
                      )}
                      <p className="text-[13px] text-slate-500">
                        {[item.city, item.state].filter(Boolean).join(", ") || "Unknown location"}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {hasViewData ? `${formatNumber(item.views)} views` : "No recorded views"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:contents">
                    <div className="rounded-xl bg-rose-50 px-3 py-2 text-center md:rounded-none md:bg-transparent md:px-0 md:py-0">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-gray-500 md:hidden">Leads</p>
                      <p className="text-[15px] font-semibold text-slate-900">{formatNumber(item.inquiries)}</p>
                    </div>

                    <div className="rounded-xl bg-sky-50 px-3 py-2 text-center md:rounded-none md:bg-transparent md:px-0 md:py-0">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-gray-500 md:hidden">Shortlists</p>
                      <p className="text-[15px] font-semibold text-slate-900">{formatNumber(item.shortlists)}</p>
                    </div>

                    <div className="rounded-xl bg-fuchsia-50 px-3 py-2 text-center md:rounded-none md:bg-transparent md:px-0 md:py-0">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-gray-500 md:hidden">Clicks</p>
                      <p className="text-[15px] font-semibold text-slate-900">{formatNumber(item.clicks)}</p>
                    </div>

                    <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center md:rounded-none md:bg-transparent md:px-0 md:py-0">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-gray-500 md:hidden">Views</p>
                      <p className="text-[15px] font-semibold text-slate-900">{formatNumber(item.views)}</p>
                    </div>

                    <div className="col-span-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 md:col-span-1 md:justify-center md:rounded-none md:bg-transparent md:px-0 md:py-0">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-gray-500 md:hidden">Status</p>
                      <span
                        className="inline-flex min-w-[84px] justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize"
                        style={{
                          backgroundColor:
                            item.status === "active"
                              ? "#DCFCE7"
                              : item.status === "inactive"
                                ? "#FEF3C7"
                                : "#E2E8F0",
                          color:
                            item.status === "active"
                              ? "#166534"
                              : item.status === "inactive"
                                ? "#92400E"
                                : "#334155",
                        }}
                      >
                        {item.status ?? "unknown"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {momentumPageCount > 1 ? (
              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="text-xs font-medium text-slate-500">
                  Showing {(momentumPage - 1) * MOMENTUM_PAGE_SIZE + 1}-
                  {Math.min(momentumPage * MOMENTUM_PAGE_SIZE, topViewedProjects.length)} of {topViewedProjects.length}
                </p>
                <div className="flex items-center gap-2">
                  {Array.from({ length: momentumPageCount }, (_, index) => {
                    const page = index + 1;
                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => handleMomentumPageChange(page)}
                        className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold transition ${
                          momentumPage === page
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyChartState message="No project momentum data is available for this date range yet." />
        )}
      </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;


