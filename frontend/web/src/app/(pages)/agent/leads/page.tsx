"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import ActiveTabs from "@/ui/ActiveTabs";
import { getMyProperties, getProjectLeads } from "@/data/ClientData";

const categories = ["Residential", "Commercial", "Open Plot", "Agriculture Land"];

const LEAD_STATUSES = [
    "All",
    "New Lead",
    "Interested",
    "Not Interested",
    "Follow Up",
    "Site Visit",
    "Sale",
];

const normalizeLeadStatus = (status?: string) => {
    const normalized = status?.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const aliases: Record<string, string> = {
        new: "new_lead",
        intrested: "interested",
        not_intrested: "not_interested",
        contacted: "interested",
        approved: "interested",
        rejected: "not_interested",
        closed: "sale",
    };

    return normalized ? aliases[normalized] ?? normalized : "";
};

const formatLeadStatus = (status?: string) =>
    normalizeLeadStatus(status)
        .split("_")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

const TAB_KEY_MAP: Record<string, string> = {
    Residential: "residential",
    Commercial: "commercial",
    "Open Plot": "land",
    "Agriculture Land": "agricultural",
    Plot: "land",
    Agriculture: "agricultural",
};

const formatPrice = (price?: number) =>
    price ? `₹ ${(price / 10000000).toFixed(2)} Cr` : "—";

const LeadsPage = () => {
    const [activeTab, setActiveTab] = useState("Residential");
    const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
        null,
    );
    const [activeStatus, setActiveStatus] = useState("All");

    /* ================= PROPERTIES ================= */
    const { data: propertiesData, isLoading: propertiesLoading } = useQuery({
        queryKey: ["myProperties"],
        queryFn: getMyProperties,
    });

    const properties = useMemo(() => {
        if (!propertiesData) return [];

        const allProperties = propertiesData[TAB_KEY_MAP[activeTab]] ?? [];

        // ✅ Show only ACTIVE properties
        return allProperties.filter(
            (property: any) =>
                property.status?.toLowerCase() === "active"
        );
    }, [propertiesData, activeTab]);


    useEffect(() => {
        if (!properties.length) {
            if (selectedPropertyId) setSelectedPropertyId(null);
            return;
        }

        const isSelectedValid = properties.some(
            (property: any) => property._id === selectedPropertyId,
        );

        if (!isSelectedValid) {
            setSelectedPropertyId(properties[0]._id);
        }
    }, [properties, selectedPropertyId]);

    /* ================= LEADS ================= */
    const { data: leadsData = [], isLoading: leadsLoading } = useQuery({
        queryKey: ["projectLeads", selectedPropertyId],
        queryFn: () => getProjectLeads(selectedPropertyId as string),
        enabled: !!selectedPropertyId,
    });

    useEffect(() => {
        setActiveStatus("All");
    }, [selectedPropertyId]);

    const filteredLeads = useMemo(() => {
        const leadsArray = Array.isArray(leadsData)
            ? leadsData
            : Array.isArray((leadsData as any)?.data)
                ? (leadsData as any).data
                : [];

        if (activeStatus === "All") {
            return leadsArray;
        }
        return leadsArray.filter(
            (lead: any) => normalizeLeadStatus(lead.status) === normalizeLeadStatus(activeStatus),
        );
    }, [leadsData, activeStatus]);

    const selectedProperty = useMemo(
        () => properties.find((property: any) => property._id === selectedPropertyId),
        [properties, selectedPropertyId],
    );

    if (propertiesLoading) {
        return <AgentLeadsPageSkeleton />;
    }
    return (
        <div className="space-y-4 sm:space-y-6">
            {/* HEADER */}
            <div className="rounded-xl border border-green-100 bg-linear-to-r from-green-50 via-white to-emerald-50 px-4 py-4 sm:rounded-2xl sm:px-5 sm:py-6">
                <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl md:text-3xl">
                    My Leads
                </h1>
                <p className="mt-1.5 text-xs leading-5 text-gray-600 sm:mt-2 sm:text-sm md:text-base">
                    View enquiries received on your properties and keep track of
                    buyer activity in one place.
                </p>
            </div>

            {/* TABS */}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <ActiveTabs
                    categories={categories}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                />
                <span className="px-1 text-xs font-medium text-gray-500 sm:text-sm sm:text-gray-600">
                    Showing {properties.length} Properties
                </span>
            </div>

            {/* MAIN LAYOUT */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
                {/* LEFT – PROPERTY LIST */}
                <div className="lg:col-span-4">
                    <div className="mb-2 flex items-center justify-between lg:hidden">
                        <p className="text-sm font-semibold text-gray-900">Properties</p>
                        <p className="text-xs text-gray-500">
                            {selectedProperty ? "Swipe to switch" : "No active properties"}
                        </p>
                    </div>

                    {properties.length ? (
                        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 lg:block lg:max-h-[60vh] lg:space-y-2 lg:overflow-y-auto lg:pr-1">
                            {properties.map((property: any) => {
                                const image = property.gallery?.[0]?.url || "/placeholder.jpg";
                                const active = property._id === selectedPropertyId;

                                return (
                                    <button
                                        key={property._id}
                                        onClick={() => setSelectedPropertyId(property._id)}
                                        className={`flex w-[236px] shrink-0 gap-2 rounded-lg border p-2 text-left transition lg:w-full lg:flex-row
                      ${active
                                                ? "border-green-500 bg-green-50 shadow-sm"
                                                : "border-gray-200 bg-white hover:bg-gray-50"
                                            }`}
                                    >
                                        <div className="h-16 w-20 shrink-0 overflow-hidden rounded-md bg-gray-100">
                                            <img
                                                src={image}
                                                alt={property.title}
                                                className="h-full w-full object-cover"
                                            />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <h3 className="truncate text-xs font-semibold text-gray-900 sm:text-sm">
                                                {property.title}
                                            </h3>
                                            <p className="truncate text-[11px] text-gray-500">
                                                {[property.locality, property.city].filter(Boolean).join(", ")}
                                            </p>
                                            <p className="truncate text-[11px] text-gray-500">
                                                Area: {property.carpetArea ?? property.plotArea ?? "—"} sq.ft.
                                            </p>
                                            <p className="mt-0.5 text-xs font-semibold text-green-600 sm:text-sm">
                                                {formatPrice(property.price)}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
                            No active properties in this category.
                        </div>
                    )}
                </div>

                {/* RIGHT – LEADS */}
                <div className="rounded-lg bg-green-50/60 p-3 sm:p-4 lg:col-span-8">
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-semibold text-green-700 sm:text-xl">Leads</h2>
                                <div className="h-1 w-8 rounded-full bg-green-500/70 sm:w-10" />
                            </div>
                            {selectedProperty ? (
                                <p className="mt-1 truncate text-xs text-gray-500">
                                    {selectedProperty.title}
                                </p>
                            ) : null}
                        </div>
                        <div className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-green-700 shadow-sm">
                            {filteredLeads.length}
                        </div>
                    </div>

                    {/* STATUS TABS */}
                    <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-1 sm:mb-4 sm:flex-wrap sm:gap-2">
                        {LEAD_STATUSES.map((status) => {
                            const active = activeStatus === status;

                            return (
                                <button
                                    key={status}
                                    onClick={() => setActiveStatus(status)}
                                    className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11px] transition sm:rounded-md sm:px-3 sm:text-xs
          ${active
                                            ? "bg-green-600 text-white font-medium shadow-sm"
                                            : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                                        }
        `}
                                >
                                    {status}
                                </button>
                            );
                        })}
                    </div>

                    {/* TABLE */}
                    {leadsLoading ? (
                        <LeadsTableSkeleton />
                    ) : filteredLeads.length ? (
                        <LeadsTable leads={filteredLeads} />
                    ) : (
                        <div className="rounded-lg border border-dashed border-green-100 bg-white/80 px-4 py-12 text-center text-sm text-gray-500 sm:py-20">
                            No <b>{activeStatus}</b> leads for this property
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const SkeletonBlock = ({ className = "" }: { className?: string }) => (
    <span className={`block animate-pulse rounded-md bg-gray-200/80 ${className}`} />
);

const AgentLeadsPageSkeleton = () => (
    <div className="space-y-4 sm:space-y-6">
        <div className="rounded-xl border border-green-100 bg-linear-to-r from-green-50 via-white to-emerald-50 px-4 py-4 sm:rounded-2xl sm:px-5 sm:py-6">
            <SkeletonBlock className="h-8 w-36" />
            <SkeletonBlock className="mt-3 h-4 w-full max-w-[560px]" />
            <SkeletonBlock className="mt-2 h-4 w-9/12 max-w-[420px]" />
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-hidden">
                {Array.from({ length: 4 }).map((_, index) => (
                    <SkeletonBlock key={index} className="h-9 w-28 shrink-0 rounded-full" />
                ))}
            </div>
            <SkeletonBlock className="h-4 w-36" />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
            <div className="lg:col-span-4">
                <PropertiesListSkeleton />
            </div>

            <div className="rounded-lg bg-green-50/60 p-3 sm:p-4 lg:col-span-8">
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                        <SkeletonBlock className="h-6 w-24" />
                        <SkeletonBlock className="mt-2 h-3 w-44" />
                    </div>
                    <SkeletonBlock className="h-6 w-10 rounded-full" />
                </div>
                <div className="mb-3 flex gap-1.5 overflow-hidden pb-1 sm:mb-4 sm:flex-wrap sm:gap-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <SkeletonBlock key={index} className="h-7 w-20 shrink-0 rounded-full sm:rounded-md" />
                    ))}
                </div>
                <LeadsTableSkeleton />
            </div>
        </div>
    </div>
);

const PropertiesListSkeleton = () => (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 lg:block lg:max-h-[60vh] lg:space-y-2 lg:overflow-y-auto lg:pr-1">
        {Array.from({ length: 5 }).map((_, index) => (
            <div
                key={index}
                className="flex w-[236px] shrink-0 gap-2 rounded-lg border border-gray-200 bg-white p-2 lg:w-full"
            >
                <SkeletonBlock className="h-16 w-20 shrink-0" />
                <div className="min-w-0 flex-1">
                    <SkeletonBlock className="h-4 w-11/12" />
                    <SkeletonBlock className="mt-2 h-3 w-8/12" />
                    <SkeletonBlock className="mt-2 h-3 w-7/12" />
                    <SkeletonBlock className="mt-2 h-4 w-20" />
                </div>
            </div>
        ))}
    </div>
);

const LeadsTableSkeleton = () => (
    <>
        <div className="space-y-2 md:hidden">
            {Array.from({ length: 4 }).map((_, index) => (
                <div
                    key={index}
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                >
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <SkeletonBlock className="h-4 w-32" />
                            <SkeletonBlock className="mt-2 h-3 w-24" />
                        </div>
                        <SkeletonBlock className="h-5 w-20 rounded-full" />
                    </div>
                    <SkeletonBlock className="mt-3 h-4 w-32" />
                </div>
            ))}
        </div>

        <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white md:block">
            <div className="grid grid-cols-4 border-b bg-gray-50 px-6 py-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <SkeletonBlock key={index} className="h-3 w-24" />
                ))}
            </div>

            {Array.from({ length: 6 }).map((_, rowIndex) => (
                <div
                    key={rowIndex}
                    className="grid grid-cols-4 border-b px-6 py-4 last:border-b-0"
                >
                    <SkeletonBlock className="h-4 w-28" />
                    <SkeletonBlock className="h-4 w-24" />
                    <SkeletonBlock className="h-4 w-32" />
                    <SkeletonBlock className="h-6 w-24 rounded-full" />
                </div>
            ))}
        </div>
    </>
);

/* ================= TABLE ================= */

const LeadsTable = ({ leads }: any) => {
    const getStatusStyle = (status: string) => {
        const normalized = normalizeLeadStatus(status);

        if (normalized === "new_lead")
            return "bg-blue-50 text-blue-600 border-blue-200";

        if (normalized === "interested")
            return "bg-yellow-50 text-yellow-600 border-yellow-200";

        if (normalized === "not_interested")
            return "bg-red-50 text-red-600 border-red-200";

        if (normalized === "follow_up")
            return "bg-purple-50 text-purple-600 border-purple-200";

        if (normalized === "site_visit")
            return "bg-indigo-50 text-indigo-600 border-indigo-200";

        if (normalized === "sale")
            return "bg-green-50 text-green-600 border-green-200";

        return "bg-gray-50 text-gray-600 border-gray-200";
    };

    return (
        <>
            {/* Mobile Cards */}
            <div className="space-y-2 md:hidden">
                {leads.map((lead: any, idx: number) => (
                    <div key={idx} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-gray-900">{lead.name}</p>
                                <p className="mt-0.5 text-xs text-gray-500">
                                    {new Date(lead.createdAt).toLocaleDateString("en-IN")}
                                </p>
                            </div>
                            <span
                                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusStyle(
                                    lead.status
                                )}`}
                            >
                                {formatLeadStatus(lead.status)}
                            </span>
                        </div>
                        <a
                            href={`tel:${lead.phone}`}
                            className="mt-2 inline-flex text-sm font-medium text-gray-700"
                        >
                            {lead.phone}
                        </a>
                    </div>
                ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-4 px-6 py-4 text-xs font-semibold text-gray-500 bg-gray-50 border-b">
                    <span>Name</span>
                    <span>Date</span>
                    <span>Contact Number</span>
                    <span>Status</span>
                </div>

                {leads.map((lead: any, idx: number) => (
                    <div
                        key={idx}
                        className="grid grid-cols-4 px-6 py-4 text-sm border-b last:border-b-0 hover:bg-gray-50 transition"
                    >
                        <div className="font-medium text-gray-800">
                            {lead.name}
                        </div>

                        <div className="text-gray-500">
                            {new Date(lead.createdAt).toLocaleDateString("en-IN")}
                        </div>

                        <div className="text-gray-600">
                            {lead.phone}
                        </div>

                        <div>
                            <span
                                className={`px-2.5 py-1 text-xs rounded-full border font-medium ${getStatusStyle(
                                    lead.status
                                )}`}
                            >
                                {formatLeadStatus(lead.status)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
};


export default LeadsPage;
