"use client";

import LoginDialog from "@/app/(auth)/Login";
import RegisterDialog from "@/app/(auth)/Register";
import ContactSeller from "./ContactSeller";
import { trackProjectBrochureDownload } from "@/data/ClientData";
import { FeaturedProject } from "@/types";
import { useShortlist } from "@/hooks/useShortlist";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FiCheckCircle, FiDownload, FiHeart, FiMapPin, FiPhone } from "react-icons/fi";
import { HiChevronLeft, HiChevronRight, HiPhoto, HiXMark } from "react-icons/hi2";
import { IoIosShareAlt } from "react-icons/io";
import Cookies from "js-cookie";
import { trackInteraction } from "@/services/trackingService";

type AuthMode = "login" | "register" | null;

type HeroSectionProps = {
    project: FeaturedProject;
};

const PROJECT_NAV_OFFSET_MOBILE = 118;
const PROJECT_NAV_OFFSET_DESKTOP = 64;
const PROJECT_SECTION_NAV_HEIGHT = 56;

function getProjectNavOffset() {
    if (typeof window === "undefined") return PROJECT_NAV_OFFSET_DESKTOP;
    return window.innerWidth >= 768 ? PROJECT_NAV_OFFSET_DESKTOP : PROJECT_NAV_OFFSET_MOBILE;
}

function OverlayPortal({ children }: { children: ReactNode }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return createPortal(children, document.body);
}

function formatCompactPrice(price?: number) {
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
        return null;
    }

    if (price >= 1e7) {
        return `${(price / 1e7).toFixed(2).replace(/\.00$/, "")} Cr`;
    }

    if (price >= 1e5) {
        return `${(price / 1e5).toFixed(2).replace(/\.00$/, "")} L`;
    }

    return price.toLocaleString("en-IN");
}

function formatPriceRange(project: FeaturedProject) {
    const from = formatCompactPrice(project.priceFrom);
    const to = formatCompactPrice(project.priceTo);

    if (from && to && project.priceFrom !== project.priceTo) {
        return `₹ ${from} - ${to}`;
    }

    if (from) return `₹ ${from}`;
    if (to) return `₹ ${to}`;
    return "Price on Request";
}

function normalizeAreaUnit(unit?: string) {
    const normalized = unit?.trim().toLowerCase();

    if (!normalized || ["sqft", "sq.ft", "sq ft", "square feet", "square foot"].includes(normalized)) {
        return "sq.ft";
    }

    if (["sqmt", "sq.mt", "sq m", "sqm", "square meter", "square metre"].includes(normalized)) {
        return "sq.mt";
    }

    if (["sqyd", "sq.yd", "sq yd", "square yard", "square yards"].includes(normalized)) {
        return "sq.yd";
    }

    if (["gunta", "guntas", "gunta(s)", "guntha", "gunthas"].includes(normalized)) {
        return "guntha";
    }

    if (["acre", "acres"].includes(normalized)) return "acre";
    if (["hectare", "hectares"].includes(normalized)) return "hectare";
    if (["cent", "cents"].includes(normalized)) return "cent";
    if (["kanal", "kanals"].includes(normalized)) return "kanal";
    if (["bigha", "bighas"].includes(normalized)) return "bigha";
    if (["ankanam", "ankanams"].includes(normalized)) return "ankanam";
    if (["marla", "marlas"].includes(normalized)) return "marla";

    return unit?.trim() || "sq.ft";
}

function getMinUnitArea(project: FeaturedProject) {
    const isLand = project.categoryType?.toLowerCase() === "land";
    const units = (project.projectSummary ?? project.bhkSummary ?? []).flatMap((item) => item.units ?? []);
    const unitAreas = units
        .map((unit) => {
            if (isLand && typeof unit.area?.value === "number" && Number.isFinite(unit.area.value) && unit.area.value > 0) {
                return { value: unit.area.value, unit: normalizeAreaUnit(unit.area.unit) };
            }

            if (typeof unit.area?.sqftValue === "number" && Number.isFinite(unit.area.sqftValue) && unit.area.sqftValue > 0) {
                return { value: unit.area.sqftValue, unit: "sq.ft" };
            }

            if (typeof unit.minSqft === "number" && Number.isFinite(unit.minSqft) && unit.minSqft > 0) {
                return { value: unit.minSqft, unit: "sq.ft" };
            }

            if (!isLand && typeof unit.area?.value === "number" && Number.isFinite(unit.area.value) && unit.area.value > 0) {
                return { value: unit.area.value, unit: "sq.ft" };
            }

            return null;
        })
        .filter((area): area is { value: number; unit: string } => Boolean(area));

    if (unitAreas.length > 0) {
        return unitAreas.reduce((smallest, current) => (current.value < smallest.value ? current : smallest));
    }

    const minSqft = project.sqftRange?.min;
    if (typeof minSqft === "number" && Number.isFinite(minSqft) && minSqft > 0) {
        return { value: minSqft, unit: "sq.ft" };
    }

    return null;
}

function formatPricePerUnit(project: FeaturedProject) {
    const minPrice = project.priceFrom ?? project.priceTo;
    const minArea = getMinUnitArea(project);

    if (typeof minPrice !== "number" || !Number.isFinite(minPrice) || minPrice <= 0 || !minArea) {
        return null;
    }

    return `₹ ${Math.round(minPrice / minArea.value).toLocaleString("en-IN")}/${minArea.unit}`;
}

type GalleryImage = {
    url: string;
    title?: string;
    category?: string;
    order?: number;
};

function getGalleryImages(project: FeaturedProject): GalleryImage[] {
    const images = [
        ...(project.heroImage ? [{ url: project.heroImage, title: project.title, order: -1 }] : []),
        ...(project.gallerySummary ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    ].filter((item): item is GalleryImage => Boolean(item?.url));

    const seen = new Set<string>();
    return images.filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    });
}

export default function HeroSection({ project }: HeroSectionProps) {
    const isLand = [project.categoryType, project.propertyType]
        .filter(Boolean)
        .some((value) => {
            const normalized = String(value).trim().toLowerCase();
            return normalized === "land" || normalized === "landplots";
        });
    const tabs: Array<{ label: string; href: string; isDownload?: boolean }> = [
        { label: "Overview", href: "#overview" },
        { label: isLand ? "Layout" : "Floor Plans", href: "#floor-plans" },
        { label: "Amenities", href: "#amenities" },
        { label: "Location Advantages", href: "#location" },
        ...(!isLand ? [{ label: "Specifications", href: "#specifications" }] : []),
        { label: "Gallery", href: "#gallery" },
        { label: "About", href: "#about-project" },
        ...(project.brochure?.url ? [{ label: "Brochure Preview", href: "#brochure-preview" }] : []),
    ];
    const locationText = [project.locality, project.city].filter(Boolean).join(", ");
    const galleryImages = getGalleryImages(project);
    const heroImage = galleryImages[0]?.url;
    const priceRangeLabel = formatPriceRange(project);
    const hasDisplayPrice = priceRangeLabel !== "Price on Request";
    const pricePerUnitLabel = formatPricePerUnit(project);
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState(tabs[0].href);
    const [authMode, setAuthMode] = useState<AuthMode>(null);
    const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
    const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
    const { isShortlisted, isShortlistLoading, toggleShortlist } = useShortlist(project._id, "FeaturedProject");
    const navRef = useRef<HTMLDivElement | null>(null);
    const startX = useRef<number | null>(null);
    const originalBodyOverflowRef = useRef<string | null>(null);
    const activeImage = openIndex !== null ? galleryImages[openIndex] : null;
    const hasProjectOverlayOpen = openIndex !== null || isContactDialogOpen;

    useEffect(() => {
        if (hasProjectOverlayOpen) {
            if (originalBodyOverflowRef.current === null) {
                originalBodyOverflowRef.current = document.body.style.overflow;
            }
            document.body.style.overflow = "hidden";
            document.body.classList.add("project-modal-open");
        } else if (originalBodyOverflowRef.current !== null) {
            document.body.style.overflow = originalBodyOverflowRef.current;
            originalBodyOverflowRef.current = null;
            document.body.classList.remove("project-modal-open");
        }

        return () => {
            if (originalBodyOverflowRef.current !== null) {
                document.body.style.overflow = originalBodyOverflowRef.current;
                originalBodyOverflowRef.current = null;
            }
            document.body.classList.remove("project-modal-open");
        };
    }, [hasProjectOverlayOpen]);

    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (openIndex === null) return;
            if (event.key === "Escape") setOpenIndex(null);
            if (event.key === "ArrowLeft") prevPreview();
            if (event.key === "ArrowRight") nextPreview();
        }

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    useEffect(() => {
        function updateActiveTab() {
            const scrollPosition =
                window.scrollY + getProjectNavOffset() + PROJECT_SECTION_NAV_HEIGHT + 16;
            let currentTab = tabs[0].href;

            for (const tab of tabs) {
                const section = document.getElementById(tab.href.slice(1));
                if (section && section.offsetTop <= scrollPosition) {
                    currentTab = tab.href;
                }
            }

            setActiveTab(currentTab);
        }

        updateActiveTab();
        window.addEventListener("scroll", updateActiveTab, { passive: true });
        window.addEventListener("resize", updateActiveTab);

        return () => {
            window.removeEventListener("scroll", updateActiveTab);
            window.removeEventListener("resize", updateActiveTab);
        };
    }, []);

    useEffect(() => {
        const activeLink = navRef.current?.querySelector<HTMLAnchorElement>(`a[href="${activeTab}"]`);
        activeLink?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
        });
    }, [activeTab]);

    async function shareProject() {
        const shareUrl = typeof window !== "undefined" ? window.location.href : "";
        const shareData = {
            title: project.title,
            text: `Check out ${project.title}`,
            url: shareUrl,
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
                return;
            }
            await navigator.clipboard.writeText(shareUrl);
        } catch {
            // User cancelled share or clipboard was unavailable.
        }
    }

    function prevPreview() {
        setOpenIndex((index) => (index === null ? null : (index - 1 + galleryImages.length) % galleryImages.length));
    }

    function nextPreview() {
        setOpenIndex((index) => (index === null ? null : (index + 1) % galleryImages.length));
    }

    function onTouchStart(event: React.TouchEvent) {
        startX.current = event.touches[0]?.clientX ?? null;
    }

    function onTouchEnd(event: React.TouchEvent) {
        if (startX.current === null || openIndex === null) return;

        const endX = event.changedTouches[0]?.clientX ?? 0;
        const delta = endX - startX.current;
        if (Math.abs(delta) > 50) {
            if (delta > 0) prevPreview();
            else nextPreview();
        }
        startX.current = null;
    }

    function openPreview(index = 0) {
        if (galleryImages.length > 0) {
            setOpenIndex(index);
        }
    }

    function closeAuthDialog() {
        setIsAuthDialogOpen(false);
        setAuthMode(null);
    }

    function openLoginDialog() {
        setIsAuthDialogOpen(true);
        setAuthMode("login");
    }

    function downloadBrochure(url: string) {
        trackInteraction({
            eventType: "brochure_downloaded",
            eventCategory: "conversion",
            entityType: "project",
            projectId: project._id,
            source: "project_detail",
            metadata: { title: project.title },
        });
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.download = project.brochure?.filename || "";
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    async function onTabClick(event: React.MouseEvent<HTMLAnchorElement>, href: string, isDownload?: boolean) {
        if (isDownload) {
            event.preventDefault();

            if (!Cookies.get("token")) {
                openLoginDialog();
                return;
            }

            try {
                await trackProjectBrochureDownload(project._id);
            } catch {
                // Do not block the actual brochure download if tracking fails.
            }

            downloadBrochure(href);
            return;
        }

        event.preventDefault();

        const section = document.getElementById(href.slice(1));
        if (!section) return;

        const top =
            section.getBoundingClientRect().top +
            window.scrollY -
            getProjectNavOffset() -
            PROJECT_SECTION_NAV_HEIGHT -
            12;
        window.scrollTo({ top, behavior: "smooth" });
        window.history.pushState(null, "", href);
        setActiveTab(href);
    }

    const builderName =
        (Array.isArray(project.aboutSummary)
            ? project.aboutSummary[0]?.builderName
            : (project.aboutSummary as any)?.builderName)?.trim();

    console.log("title", project.title);
    return (
        <>
            <section className="bg-white">
                <div className="container mx-auto mt-5 px-1 sm:px-4 lg:px-3">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                        <div className="min-w-0 flex-1">
                            <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">
                                {project.title}
                            </h1>

                            {builderName && (
                                <p className="mt-0.5 text-sm font-medium text-slate-600 sm:text-base">
                                    By <span className="font-semibold text-[#4bbb7b]">{builderName}</span>
                                </p>
                            )}

                            {locationText && (
                                <p className="mt-1 flex items-center gap-1.5 text-xs text-[#6C6F79] sm:text-sm">
                                    <FiMapPin className="h-3.5 w-3.5 shrink-0" />
                                    <span>{locationText}</span>
                                </p>
                            )}

                            {project.reraNumber && (
                                <div className="mt-2 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-sm bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                                    <FiCheckCircle className="h-3.5 w-3.5 shrink-0" />
                                    <span className="break-all sm:break-normal">RERA ID : {project.reraNumber}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex shrink-0 flex-row flex-wrap items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start sm:text-right">
                            {project.logo?.url && (
                                <img
                                    src={project.logo.url}
                                    alt={`${project.title} logo`}
                                    className="h-10 max-w-32 object-contain sm:ml-auto sm:h-18 sm:max-w-48 border border-gray-200 rounded-md p-1"
                                />
                            )}
                            <div className="text-left sm:text-right">
                                {pricePerUnitLabel ? (
                                    <p className="text-sm font-bold text-[#6C6F79] sm:mt-2 sm:text-xl">
                                        {pricePerUnitLabel}
                                    </p>
                                ) : null}
                                {hasDisplayPrice ? (
                                    <p className="mt-0.5 text-base font-semibold text-[#4bbb7b] sm:mt-1 sm:text-lg lg:text-xl">
                                        {priceRangeLabel}
                                    </p>
                                ) : (
                                    <p className="text-base font-semibold text-[#4bbb7b] sm:mt-1 sm:text-lg lg:text-xl">
                                        Price on Request
                                    </p>
                                )}
                                {hasDisplayPrice && (
                                    <p className="mt-0.5 text-[10px] font-medium text-[#8A8D96] sm:text-xs">
                                        Govt Charges &amp; Tax (Negotiable)
                                    </p>
                                )}
                            </div>

                            {!hasDisplayPrice && (
                                <button
                                    type="button"
                                    onClick={() => setIsContactDialogOpen(true)}
                                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[#27AE60] px-4 py-2 text-white shadow-sm transition hover:bg-[#15803D] sm:mt-4 sm:min-w-[120px] sm:px-3 sm:py-3"
                                >
                                    <FiPhone className="h-4 w-4 lg:h-5 lg:w-5" />
                                    <span className="text-xs font-medium lg:text-base">
                                        Contact Builder
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 text-xs leading-6 text-[#6C6F79] sm:text-sm">
                        <p>
                            {project.aboutSummary?.[0]?.aboutDescription || "No description available."}
                        </p>
                    </div>

                    <div className="relative mt-4 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                        {heroImage ? (
                            <button
                                type="button"
                                onClick={() => openPreview(0)}
                                className="block w-full cursor-pointer text-left"
                                aria-label="Open project image preview"
                            >
                                <img
                                    src={heroImage}
                                    alt={project.title}
                                    className="h-44 w-full object-cover sm:h-64 lg:h-100"
                                />
                            </button>
                        ) : (
                            <div className="flex h-44 w-full items-center justify-center bg-emerald-50 text-sm font-medium text-emerald-700 sm:h-64 lg:h-72">
                                Project image coming soon
                            </div>
                        )}

                        <div className="absolute right-3 top-3 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={toggleShortlist}
                                disabled={isShortlistLoading}
                                className={`flex h-9 items-center gap-2 rounded-lg border border-white/70 bg-white/95 px-3 text-xs font-semibold shadow-sm backdrop-blur transition hover:bg-white cursor-pointer ${isShortlisted ? "text-rose-500" : "text-slate-700 hover:text-rose-500"
                                    } disabled:cursor-not-allowed disabled:opacity-70`}
                                aria-label={isShortlisted ? "Remove project from shortlist" : "Shortlist project"}
                                aria-pressed={isShortlisted}
                            >
                                <FiHeart className={`h-4 w-4 ${isShortlisted ? "fill-current" : ""}`} />
                                <span className="hidden sm:inline">
                                    {isShortlistLoading ? "Saving..." : isShortlisted ? "Shortlisted" : "Shortlist"}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={shareProject}
                                className="flex h-9 items-center gap-2 rounded-lg border border-white/70 bg-white/95 px-3 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-emerald-600 cursor-pointer"
                                aria-label="Share project"
                            >
                                <IoIosShareAlt className="h-4 w-4" />
                                <span className="hidden sm:inline">Share</span>
                            </button>
                        </div>

                        {galleryImages.length > 0 && (
                            <button
                                type="button"
                                onClick={() => openPreview(0)}
                                className="absolute bottom-3 right-3 flex h-9 items-center gap-2 rounded-lg border border-white/70 bg-white/95 px-3 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-emerald-600"
                                aria-label={`Open all ${galleryImages.length} project images`}
                            >
                                <HiPhoto className="h-4 w-4" />
                                <span>{galleryImages.length} Photos</span>
                            </button>
                        )}
                    </div>
                </div>

            </section>

            <div className="h-5 bg-white" />
            <nav className="propenu-site-navbar sticky top-[115px] z-40 border-y border-slate-200 bg-white md:top-16">
                <div
                    ref={navRef}
                    className="no-scrollbar flex w-full justify-start overflow-x-auto scroll-smooth px-3 sm:px-5 lg:px-8 xl:justify-center xl:px-12 2xl:px-16"
                >
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.href;

                        return (
                            <a
                                key={tab.href}
                                href={tab.href}
                                onClick={(event) => onTabClick(event, tab.href, tab.isDownload)}
                                target={tab.isDownload ? "_blank" : undefined}
                                rel={tab.isDownload ? "noopener noreferrer" : undefined}
                                download={tab.isDownload ? project.brochure?.filename || true : undefined}
                                aria-current={isActive ? "page" : undefined}
                                className={`flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 py-3 text-sm font-semibold transition sm:px-5 sm:py-4 sm:text-base lg:px-7 lg:text-lg ${isActive
                                    ? "border-[#27ae60] text-[#27ae60]"
                                    : "border-transparent text-[#6C6F79] hover:text-gray-400"
                                    }`}
                            >
                                {tab.isDownload && <FiDownload className="h-4 w-4 shrink-0" />}
                                {tab.label}
                            </a>
                        );
                    })}
                </div>
            </nav>

            {openIndex !== null && activeImage && (
                <OverlayPortal>
                    <div
                        className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm md:p-6"
                        onClick={() => setOpenIndex(null)}
                        onTouchStart={onTouchStart}
                        onTouchEnd={onTouchEnd}
                    >
                        <div
                            className="relative w-full max-w-6xl"
                            onClick={(event) => event.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                        >
                            <button
                                type="button"
                                onClick={() => setOpenIndex(null)}
                                className="absolute right-0 top-0 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
                                aria-label="Close gallery"
                            >
                                <HiXMark size={24} />
                            </button>

                            <div className="relative overflow-hidden rounded-2xl bg-black pt-12 shadow-2xl md:pt-0">
                                {galleryImages.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={prevPreview}
                                            className="absolute left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/65 md:left-5"
                                            aria-label="Previous image"
                                        >
                                            <HiChevronLeft size={22} />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={nextPreview}
                                            className="absolute right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/65 md:right-5"
                                            aria-label="Next image"
                                        >
                                            <HiChevronRight size={22} />
                                        </button>
                                    </>
                                )}

                                <img
                                    src={activeImage.url}
                                    alt={activeImage.title || `${project.title} image`}
                                    className="max-h-[75vh] w-full object-contain"
                                />

                                {activeImage.category && (
                                    <div className="absolute bottom-0 w-full bg-linear-to-t from-black/80 to-transparent p-6 text-white">
                                        <div className="text-sm text-white/70">{activeImage.category}</div>
                                    </div>
                                )}
                            </div>

                            {galleryImages.length > 1 && (
                                <div className="mt-6 flex gap-3 overflow-x-auto pb-2">
                                    {galleryImages.map((image, index) => (
                                        <button
                                            key={`${image.url}-hero-thumb-${index}`}
                                            type="button"
                                            onClick={() => setOpenIndex(index)}
                                            className={`shrink-0 overflow-hidden rounded-lg transition ${openIndex === index ? "scale-90 ring-2 ring-white" : "opacity-70 hover:opacity-100"
                                                }`}
                                            style={{ width: 110 }}
                                            aria-label={`Open thumbnail ${index + 1}`}
                                        >
                                            <img
                                                src={image.url}
                                                alt={image.title || `${project.title} thumbnail ${index + 1}`}
                                                className="h-16 w-full object-cover"
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </OverlayPortal>
            )}

            {isAuthDialogOpen && authMode === "login" && (
                <LoginDialog
                    open={isAuthDialogOpen}
                    onClose={closeAuthDialog}
                    onSwitchToRegister={() => {
                        setAuthMode("register");
                    }}
                />
            )}

            {isAuthDialogOpen && authMode === "register" && (
                <RegisterDialog
                    open={isAuthDialogOpen}
                    onClose={closeAuthDialog}
                    onSwitchToLogin={() => {
                        setAuthMode("login");
                    }}
                />
            )}

            {isContactDialogOpen && (
                <OverlayPortal>
                    <div
                        className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 px-4"
                        onClick={() => setIsContactDialogOpen(false)}
                    >
                        <div
                            className="relative w-full max-w-[420px] overflow-visible"
                            onClick={(event) => event.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Contact seller"
                        >
                            <div className="max-h-[90vh] overflow-y-auto rounded-md bg-white shadow-2xl">
                                <ContactSeller
                                    project={project}
                                    isModal
                                    onClose={() => setIsContactDialogOpen(false)}
                                />
                            </div>
                        </div>
                    </div>
                </OverlayPortal>
            )}
        </>
    );
}





