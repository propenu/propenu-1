"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCity } from "@/hooks/useCity";
import { setCityId } from "@/Redux/slice/citySlice";
import { ArrowDropdownIcon } from "@/icons/icons";
import {
    setCategory,
    setResidentialFilter,
    setSearchText,
} from "@/Redux/slice/filterSlice";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import {
    HiArrowTrendingUp,
    HiBuildingOffice2,
    HiCurrencyRupee,
    HiMagnifyingGlass,
    HiMapPin,
    HiXMark,
} from "react-icons/hi2";

type DiscoverLocality = {
    name: string;
    location?: {
        type?: string;
        coordinates?: number[];
    };
};

type DiscoverLocation = {
    _id: string;
    city: string;
    state?: string | null;
    category?: string;
    localities?: DiscoverLocality[];
};

const benefits = [
    {
        title: "High Growth Potential",
        description: "Rapid infrastructure & IT development",
        icon: HiArrowTrendingUp,
    },
    {
        title: "Excellent Connectivity",
        description: "Well Connected roads,rail & airports",
        icon: HiBuildingOffice2,
    },
    {
        title: "Strong Rental Demand",
        description: "High rental yield in prime locations",
        icon: HiBuildingOffice2,
    },
    {
        title: "Investor Friendly",
        description: "Growing economy & business hubs",
        icon: HiCurrencyRupee,
    },
];

const DiscoverRealestate = () => {
    const tabScrollRef = useRef<HTMLDivElement | null>(null);
    const dispatch = useDispatch();
    const router = useRouter();
    const { selectedCity, locations } = useCity();
    const [activeLocations, setActiveLocations] = useState<DiscoverLocation[]>([]);
    const [showLocalityDialog, setShowLocalityDialog] = useState(false);
    const [dialogCityOpen, setDialogCityOpen] = useState(false);
    const [localitySearch, setLocalitySearch] = useState("");
    const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
    const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);
    const [discoverCityId, setDiscoverCityId] = useState<string | null>(null);
    const discoverLocations = activeLocations.length > 0 ? activeLocations : locations;
    const selectedDiscoverCity =
        discoverLocations.find(
            (location) =>
                location.city === selectedCity?.city &&
                location.state === selectedCity?.state,
        ) ??
        discoverLocations.find((location) => location.city === selectedCity?.city) ??
        selectedCity;
    const discoverCity =
        discoverLocations.find((location) => location._id === discoverCityId) ??
        selectedDiscoverCity;
    const stateName = discoverCity?.state ?? "Telangana";
    const cityName = discoverCity?.city ?? "Hyderabad";
    const cityTabs = discoverLocations.filter((location) => location.state === stateName);
    const visibleCityTabs =
        cityTabs.length > 0
            ? cityTabs
            : discoverCity
                ? [discoverCity]
                : [];
    const localities =
        discoverCity?.localities?.reduce<{ name: string }[]>((items, locality) => {
            const name = locality.name?.trim();
            const alreadyAdded = items.some(
                (item) => item.name.toLowerCase() === name?.toLowerCase(),
            );

            if (name && !alreadyAdded) {
                items.push({ name });
            }

            return items;
        }, []) ?? [];
    const visibleLocalities = localities.slice(0, 15);
    const filteredDialogLocalities = useMemo(() => {
        const query = localitySearch.trim().toLowerCase();
        if (!query) return localities;

        return localities.filter((locality) =>
            locality.name.toLowerCase().includes(query),
        );
    }, [localities, localitySearch]);
    const canViewMore = localities.length > 15;
    const scrollTabs = (direction: "left" | "right") => {
        tabScrollRef.current?.scrollBy({
            left: direction === "left" ? -180 : 180,
            behavior: "smooth",
        });
    };
    const handleLocalityClick = (localityName: string) => {
        const params = new URLSearchParams({
            category: "Residential",
            type: "residential",
            listingType: "sale",
            locality: localityName,
            focus: "search",
        });

        if (discoverCity?.city) params.set("city", discoverCity.city);
        if (discoverCity?.state) params.set("state", discoverCity.state);

        dispatch(setCategory("Residential"));
        dispatch(setResidentialFilter({ key: "locality", value: [localityName] }));
        dispatch(setSearchText(""));
        const matchingCity = locations.find(
            (location) =>
                location.city === discoverCity?.city &&
                location.state === discoverCity?.state,
        );
        if (matchingCity?._id) dispatch(setCityId(matchingCity._id));
        router.push(`/properties?${params.toString()}`);
    };

    useEffect(() => {
        let cancelled = false;

        async function loadActiveLocations() {
            try {
                const response = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/properties/search/active-locations`,
                );
                if (!response.ok) return;

                const data = await response.json();
                if (!cancelled && Array.isArray(data.locations)) {
                    setActiveLocations(data.locations);
                }
            } catch {
                if (!cancelled) setActiveLocations([]);
            }
        }

        loadActiveLocations();

        return () => {
            cancelled = true;
        };
    }, []);
    useEffect(() => {
        setDiscoverCityId(selectedCity?._id ?? null);
    }, [selectedCity?._id]);
    useEffect(() => {
        if (!showLocalityDialog) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setShowLocalityDialog(false);
                setDialogCityOpen(false);
            }
        };
        const originalOverflow = document.body.style.overflow;

        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [showLocalityDialog]);


    useEffect(() => {
        const tabScroller = tabScrollRef.current;
        if (!tabScroller || visibleCityTabs.length === 0) {
            setCanScrollTabsLeft(false);
            setCanScrollTabsRight(false);
            return;
        }

        const updateTabArrows = () => {
            const maxScrollLeft = tabScroller.scrollWidth - tabScroller.clientWidth;

            setCanScrollTabsLeft(tabScroller.scrollLeft > 1);
            setCanScrollTabsRight(tabScroller.scrollLeft < maxScrollLeft - 1);
        };

        updateTabArrows();
        tabScroller.addEventListener("scroll", updateTabArrows);
        window.addEventListener("resize", updateTabArrows);

        return () => {
            tabScroller.removeEventListener("scroll", updateTabArrows);
            window.removeEventListener("resize", updateTabArrows);
        };
    }, [visibleCityTabs]);

    return (
        <section className="mb-10">
            <div className="flex items-center gap-4 border-b border-[#edf1ee] pb-3 sm:pb-4">
                <h2 className="text-[20px] font-medium leading-tight text-[#111111] sm:text-[24px]">
                    Discover more real estate Properties in {stateName}
                </h2>
            </div>

            <div className="grid gap-4 pt-4 sm:gap-5 sm:pt-4 lg:grid-cols-[264px_minmax(0,1fr)]">
                <aside className="rounded-xl bg-[#effcf4] px-4 py-4 sm:px-5">
                    <h3 className="text-base font-semibold text-[#18af5b] sm:text-lg">
                        Why Invest in {stateName}?
                    </h3>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:mt-6 sm:space-y-7 lg:block">
                        {benefits.map(({ title, description, icon: Icon }) => (
                            <div key={title} className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-[#85e0aa] sm:h-10 sm:w-10">
                                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[#202020]">
                                        {title}
                                    </p>
                                    <p className="mt-1 text-[10px] font-medium leading-snug text-[#66736c]">
                                        {description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                <div className="min-w-0">
                    <div className="relative -mx-1 px-1 sm:mx-0 sm:px-8">
                        {canScrollTabsLeft && (
                            <button
                                type="button"
                                aria-label="Scroll cities left"
                                onClick={() => scrollTabs("left")}
                                className="absolute left-0 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white p-2 shadow-md transition hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-green-300 sm:inline-flex"
                            >
                                <ArrowDropdownIcon size={16} color="#26ad5f" className="rotate-90" />
                            </button>
                        )}

                        <div
                            ref={tabScrollRef}
                            className="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth pb-1 sm:gap-4"
                        >
                            {visibleCityTabs.map((location) => (
                                <button
                                    key={location._id}
                                    type="button"
                                    onClick={() => {
                                        setDiscoverCityId(location._id);
                                        setShowLocalityDialog(false);
                                        setLocalitySearch("");
                                    }}
                                    className={`h-9 shrink-0 rounded-lg border px-4 text-sm sm:h-[37px] sm:px-5 sm:text-base cursor-pointer transition-colors duration-200
    ${discoverCity?._id === location._id
                                            ? "border-[#27ae60] bg-[#27ae60] text-white"
                                            : "border-[#e0e0e0] bg-white text-[#7a7a7a] hover:bg-[#f5f5f5] hover:border-[#cfcfcf] hover:text-[#333]"
                                        }`}
                                >
                                    {location.city}
                                </button>
                            ))}
                        </div>

                        {canScrollTabsRight && (
                            <button
                                type="button"
                                aria-label="Scroll cities right"
                                onClick={() => scrollTabs("right")}
                                className="absolute right-0 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white p-2 shadow-md transition hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-green-300 sm:inline-flex"
                            >
                                <ArrowDropdownIcon size={16} color="#26ad5f" className="rotate-270" />
                            </button>
                        )}
                    </div>

                    <h3 className="mt-5 text-lg font-medium text-[#171717] sm:mt-6 sm:text-xl">
                        Popular Localities in {cityName}
                    </h3>

                    <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-5">
                        {visibleLocalities.length > 0 ? (
                            visibleLocalities.map((locality) => (
                                <button
                                    key={locality.name}
                                    type="button"
                                    onClick={() => handleLocalityClick(locality.name)}
                                    className="flex min-h-[54px] items-center gap-2 rounded-lg border border-[#e8e8e8] bg-white px-3 text-left shadow-sm transition hover:border-[#27ae60]/50 cursor-pointer hover:bg-[#fbfffc] sm:min-h-[61px]"
                                >
                                    <HiMapPin className="h-5 w-5 shrink-0 text-[#27ae60]" />
                                    <span className="min-w-0">
                                        <span className="block truncate text-[14px] font-medium text-[#151515] sm:text-[15px]">
                                            {locality.name}
                                        </span>
                                        <span className="mt-1 block text-[10px] font-medium text-[#7d8480]">
                                            View Properties
                                        </span>
                                    </span>
                                </button>
                            ))
                        ) : (
                            <div className="col-span-full rounded-lg border border-dashed border-[#d9e8df] bg-white px-4 py-5 text-sm font-medium text-[#66736c]">
                                Localities coming soon for {cityName}.
                            </div>
                        )}
                    </div>

                    {canViewMore && (
                        <div className="mt-4 flex justify-center sm:mt-5 sm:justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setLocalitySearch("");
                                    setShowLocalityDialog(true);
                                }}
                                className="flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#27ae60] transition hover:bg-[#effcf4] hover:text-[#15803D]"
                            >
                                View More
                                <span className="rounded-full bg-[#effcf4] px-2 py-0.5 text-xs text-[#15803D]">
                                    {localities.length}
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
            {showLocalityDialog && (
                <div
                    className="fixed inset-0 z-[100] flex items-end justify-center bg-black/35 px-3 py-3 sm:items-center sm:px-5"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="locality-dialog-title"
                    onClick={() => setShowLocalityDialog(false)}
                >
                    <div
                        className="flex max-h-[88vh] min-h-[420px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[82vh] sm:min-h-[440px]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="border-b border-[#edf1ee] px-4 py-4 sm:px-6">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="min-w-0 lg:flex-1">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-[#27ae60]">
                                        {stateName}
                                    </p>
                                    <h3
                                        id="locality-dialog-title"
                                        className="mt-1 flex min-w-0 items-center gap-1.5 text-lg font-semibold text-[#111111] sm:text-2xl"
                                    >
                                        <span>Localities in</span>
                                        <span className="relative inline-flex min-w-0">
                                            <button
                                                type="button"
                                                onClick={() => setDialogCityOpen((open) => !open)}
                                                className="inline-flex min-w-0 items-center gap-1 font-semibold text-[#111111] transition hover:text-[#15803D]"
                                                aria-haspopup="listbox"
                                                aria-expanded={dialogCityOpen}
                                            >
                                                <span className="truncate">{cityName}</span>
                                                <ArrowDropdownIcon
                                                    size={13}
                                                    color="currentColor"
                                                    className={`transition-transform duration-200 ${dialogCityOpen ? "rotate-180" : ""}`}
                                                    offsetY={1}
                                                />
                                            </button>

                                            {dialogCityOpen && (
                                                <div className="absolute left-0 top-full z-80 mt-2 max-h-56 w-52 overflow-y-auto rounded-xl border border-[#e5ece8] bg-white p-1.5 shadow-xl">
                                                    <div role="listbox" aria-label="Select city">
                                                        {visibleCityTabs.map((location) => {
                                                            const active = discoverCity?._id === location._id;

                                                            return (
                                                                <button
                                                                    key={location._id}
                                                                    type="button"
                                                                    role="option"
                                                                    aria-selected={active}
                                                                    onClick={() => {
                                                                        setDiscoverCityId(location._id);
                                                                        setLocalitySearch("");
                                                                        setDialogCityOpen(false);
                                                                    }}
                                                                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                                                                        active
                                                                            ? "bg-[#D1EFDD] font-semibold text-[#15803D]"
                                                                            : "text-[#38443d] hover:bg-[#f6faf8]"
                                                                    }`}
                                                                >
                                                                    {location.city}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </span>
                                    </h3>
                                </div>

                                <div className="flex items-center gap-3 lg:w-[430px]">
                                    <div className="group flex min-h-11 flex-1 items-center rounded-lg border border-[#dbe8e1] bg-white px-2.5 py-1.5 shadow-sm transition focus-within:border-[#27ae60] focus-within:shadow-[0_0_0_3px_rgba(39,174,96,0.14)]">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#effcf4] text-[#27ae60] transition group-focus-within:bg-[#27ae60] group-focus-within:text-white">
                                            <HiMagnifyingGlass className="h-4.5 w-4.5" />
                                        </span>
                                        <input
                                            type="text"
                                            value={localitySearch}
                                            onChange={(event) => setLocalitySearch(event.target.value)}
                                            placeholder={`Search localities in ${cityName}`}
                                            className="min-w-0 flex-1 bg-transparent px-3 text-sm font-medium text-[#151515] outline-none placeholder:text-[#8b9891]"
                                            autoFocus
                                        />
                                        {localitySearch && (
                                            <button
                                                type="button"
                                                aria-label="Clear locality search"
                                                onClick={() => setLocalitySearch("")}
                                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8b9891] transition hover:bg-[#f1f5f3] hover:text-[#151515]"
                                            >
                                                <HiXMark className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        aria-label="Close localities"
                                        onClick={() => setShowLocalityDialog(false)}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e5ece8] text-[#66736c] transition hover:bg-[#f6faf8] hover:text-[#111111]"
                                    >
                                        <HiXMark className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                            {filteredDialogLocalities.length > 0 ? (
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                                    {filteredDialogLocalities.map((locality) => (
                                        <button
                                            key={locality.name}
                                            type="button"
                                            onClick={() => {
                                                handleLocalityClick(locality.name);
                                                setShowLocalityDialog(false);
                                            }}
                                            className="flex min-h-[62px] items-center gap-3 rounded-xl border border-[#e8e8e8] bg-white px-3 text-left shadow-sm transition hover:border-[#27ae60]/60 hover:bg-[#fbfffc] hover:shadow-md"
                                        >
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#effcf4] text-[#27ae60]">
                                                <HiMapPin className="h-5 w-5" />
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-semibold text-[#151515]">
                                                    {locality.name}
                                                </span>
                                                <span className="mt-1 block text-xs font-medium text-[#7d8480]">
                                                    View Properties
                                                </span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-[#d9e8df] bg-[#fbfdfc] px-4 py-8 text-center text-sm font-medium text-[#66736c]">
                                    No locality found for &quot;{localitySearch}&quot;.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default DiscoverRealestate;

