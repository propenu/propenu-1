// components/AvailableProperties.tsx
"use client";

import { hexToRGBA } from "@/ui/hexToRGBA";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiMinus, FiPlus } from "react-icons/fi";

type Unit = {
  minSqft?: number;
  maxPrice?: number;
  availableCount?: number;
  area?: {
    value?: number;
    unit?: string;
    sqftValue?: number;
  };
  plan?: { url?: string };
};

type BhkItem = {
  bhk: number;
  label?: string;
  bhkLabel?: string;
  units?: Unit[];
};

type BhkPayload = {
  projectSummary?: BhkItem[] | null;
  bhkSummary?: BhkItem[] | null;
  categoryType?: string | null;
  propertyType?: string | null;
  color?: string | null;
  reraNumber?: string | null;
  possessionDate?: string | Date | null;
  launchDate?: string | Date | null;
};

type Props = {
  bhk?: BhkPayload | null;
};

// fallback image — replace with a public asset or import if available
const DEV_PLAN_URL = "/images/placeholder.jpg";
const MIN_PLAN_ZOOM = 1;
const MAX_PLAN_ZOOM = 2.5;
const PLAN_ZOOM_STEP = 0.25;

function formatAreaUnit(unit?: Unit, isLand = false) {
  if (isLand) {
    const areaValue = unit?.area?.value;
    const areaUnit = unit?.area?.unit;

    if (
      typeof areaValue === "number" &&
      Number.isFinite(areaValue) &&
      areaValue > 0
    ) {
      return `${areaValue} ${areaUnit || "sqft"}`;
    }
  }

  if (
    typeof unit?.minSqft === "number" &&
    Number.isFinite(unit.minSqft) &&
    unit.minSqft > 0
  ) {
    return `${unit.minSqft} sqft`;
  }

  return "—";
}

/** small helper to format INR numbers */
function formatINR(v?: number) {
  if (v === undefined || v === null) return "--";
  try {
    return v.toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    });
  } catch {
    return String(v);
  }
}

function getUnitPriceLabel(unit?: Unit) {
  const price = unit?.maxPrice;

  if (
    typeof price === "number" &&
    Number.isFinite(price) &&
    price > 0
  ) {
    return formatINR(price);
  }

  return "Price on Request";
}

function formatProjectDate(value?: string | Date | null) {
  if (!value) return null;

  const date =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}$/.test(value)
        ? new Date(`${value}-01T00:00:00`)
        : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

export default function AvailableProperties({ bhk }: Props) {
  const planScrollRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef({
    clientX: 0,
    clientY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const items: BhkItem[] = Array.isArray(bhk?.projectSummary)
    ? bhk!.projectSummary!
    : Array.isArray(bhk?.bhkSummary)
      ? bhk!.bhkSummary!
      : [];
  const color = (bhk?.color ?? "#F59E0B") as string;
  const reraNumber = bhk?.reraNumber ?? "--";
  const possessionDate = formatProjectDate(bhk?.possessionDate);
  const launchDate = formatProjectDate(bhk?.launchDate);
  const category = `${bhk?.categoryType ?? bhk?.propertyType ?? ""}`.toLowerCase();
  const isLand = category === "land";

  // default to first BHK group
  const [activeBhkIndex, setActiveBhkIndex] = useState<number>(0);
  // default to first unit within selected BHK
  const [activeUnitIndex, setActiveUnitIndex] = useState<number>(0);
  const [planZoom, setPlanZoom] = useState<number>(MIN_PLAN_ZOOM);
  const [isDraggingPlan, setIsDraggingPlan] = useState(false);

  // clamp indices when items length changes
  useEffect(() => {
    if (activeBhkIndex >= items.length && items.length > 0) {
      setActiveBhkIndex(0);
    }
    if (items.length === 0) {
      setActiveBhkIndex(0);
      setActiveUnitIndex(0);
    }
  }, [items.length, activeBhkIndex]);

  // reset unit index when BHK changes
  useEffect(() => {
    setActiveUnitIndex(0);
  }, [activeBhkIndex]);

  useEffect(() => {
    setPlanZoom(MIN_PLAN_ZOOM);
  }, [activeBhkIndex, activeUnitIndex]);

  const activeBhk = items[activeBhkIndex] ?? null;
  const units = Array.isArray(activeBhk?.units) ? activeBhk!.units! : [];

  // clamp activeUnit when units length changes
  useEffect(() => {
    if (activeUnitIndex >= units.length && units.length > 0) {
      setActiveUnitIndex(0);
    }
    if (units.length === 0) {
      setActiveUnitIndex(0);
    }
  }, [units.length, activeUnitIndex]);

  // readable sqft labels for chips
  const sqftLabels = useMemo(
    () =>
      units.map((u) => {
        const areaLabel = formatAreaUnit(u, isLand);
        return areaLabel !== "—" ? areaLabel : u.plan?.url ? "Plan" : "—";
      }),
    [units, isLand]
  );

  const activeUnit = units[activeUnitIndex];
  const activeUnitPriceLabel = getUnitPriceLabel(activeUnit);
  const canZoomIn = planZoom < MAX_PLAN_ZOOM;
  const canZoomOut = planZoom > MIN_PLAN_ZOOM;
  const canDragPlan = planZoom > MIN_PLAN_ZOOM;

  const zoomPlan = (direction: "in" | "out") => {
    setPlanZoom((currentZoom) => {
      const nextZoom =
        direction === "in"
          ? currentZoom + PLAN_ZOOM_STEP
          : currentZoom - PLAN_ZOOM_STEP;

      return Math.min(MAX_PLAN_ZOOM, Math.max(MIN_PLAN_ZOOM, nextZoom));
    });
  };

  const handlePlanPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canDragPlan || !planScrollRef.current) return;

    const scroller = planScrollRef.current;
    dragStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
    };

    setIsDraggingPlan(true);
    scroller.setPointerCapture(event.pointerId);
  };

  const handlePlanPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPlan || !planScrollRef.current) return;

    event.preventDefault();

    const scroller = planScrollRef.current;
    const dragStart = dragStartRef.current;
    scroller.scrollLeft = dragStart.scrollLeft - (event.clientX - dragStart.clientX);
    scroller.scrollTop = dragStart.scrollTop - (event.clientY - dragStart.clientY);
  };

  const stopPlanDrag = () => {
    setIsDraggingPlan(false);
  };

  function scrollToHero() {
    const el = document.querySelector('[aria-label="#hero-section"]') as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  return (
    <section className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8">

      <div style={{ color: color, borderLeft: `5px solid ${color}` }}>
        <div className="ml-2">
          <h1 className="text-[20px] font-bold lg:text-2xl md:text-4xl">
            Available Units
          </h1>
          <p className="headingDesc text-xs lg:text-base md:text-lg">
            Your next property could be here
          </p>
        </div>
      </div>
      <div className="h-3 sm:h-5" />

      <div className="rounded-lg bg-white p-2.5 shadow-sm sm:p-4" style={{ backgroundColor: hexToRGBA(color, 0.1), }}>
        {/* Top row: BHK tabs */}
        <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-1.5 sm:mb-4 sm:gap-3 sm:pb-2 lg:flex-wrap lg:overflow-visible lg:pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.length === 0 ? (
            <div className="text-sm text-gray-500">No BHK data available</div>
          ) : (
            items.map((b, i) => (
              <button
                key={`${b.bhk}-${i}`}
                onClick={() => setActiveBhkIndex(i)}
                aria-pressed={i === activeBhkIndex}
                className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium shadow transition-shadow sm:h-9 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm md:h-10 lg:h-auto lg:px-3 lg:py-2 lg:text-sm"
                style={
                  i === activeBhkIndex
                    ? { backgroundColor: color, color: "#FFF" } // active state
                    : { backgroundColor: "#f3f4f6", color: "#2c2c2cff" } // default gray
                }
              >
                <span className="whitespace-nowrap">
                  {b.label ?? b.bhkLabel ?? `${b.bhk} BHK`}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Sqft chips */}
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1.5 sm:mb-6 sm:gap-3 sm:pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sqftLabels.length === 0 ? (
            <div className="text-sm text-gray-500">No units found</div>
          ) : (
            sqftLabels.map((label, idx) => (
              <button
                key={`${label}-${idx}`}
                onClick={() => setActiveUnitIndex(idx)}
                className="h-7 shrink-0 cursor-pointer whitespace-nowrap rounded-md border px-2 py-1 text-[11px] transition sm:h-9 sm:px-3 sm:py-2 sm:text-sm md:h-10 lg:h-auto lg:px-3 lg:py-2 lg:text-sm"
                style={
                  idx === activeUnitIndex
                    ? { borderColor: color, backgroundColor: '#FFF', color: color } // sky-600
                    : {
                      backgroundColor: "#ffffff",
                      color: "#374151",
                      borderColor: "#e5e7eb",
                    } // gray variants
                }
                aria-pressed={idx === activeUnitIndex}
              >
                {label}
              </button>
            ))
          )}
        </div>

        {/* Main grid: large image left, details right */}
        <div className="grid grid-cols-1 gap-3 md:gap-5 lg:grid-cols-12 lg:items-start lg:gap-6">
          {/* Left: image / plan */}
          <div id="layout-section" className="lg:col-span-8 scroll-mt-24">
            <div className="flex items-center justify-center rounded-md bg-gray-50 p-1.5 sm:p-3 lg:p-4">
              {/* image container keeps aspect and responsiveness */}
              <div className="relative w-full max-h-[520px] rounded-md overflow-hidden bg-white">
                {activeUnit?.plan?.url ?? DEV_PLAN_URL ? (
                  <>
                    <div
                      ref={planScrollRef}
                      onPointerDown={handlePlanPointerDown}
                      onPointerMove={handlePlanPointerMove}
                      onPointerUp={stopPlanDrag}
                      onPointerCancel={stopPlanDrag}
                      onPointerLeave={stopPlanDrag}
                      className={`h-[200px] overflow-auto select-none sm:h-[300px] md:h-[360px] lg:h-[420px] ${canDragPlan
                          ? isDraggingPlan
                            ? "cursor-grabbing"
                            : "cursor-grab"
                          : "cursor-default"
                        }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activeUnit?.plan?.url ?? DEV_PLAN_URL}
                        alt={`Plan ${activeBhk?.label ?? activeBhk?.bhkLabel ?? activeBhk?.bhk ?? ""}`}
                        draggable={false}
                        className="max-w-none object-contain transition-[height,width] duration-200 ease-out"
                        style={{
                          width: `${planZoom * 100}%`,
                          height: `${planZoom * 100}%`,
                        }}
                      />
                    </div>

                    <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md border border-gray-200 bg-white/95 p-0.5 shadow-sm sm:right-3 sm:top-3 sm:gap-1 sm:p-1">
                      <button
                        type="button"
                        aria-label="Zoom out plan"
                        onClick={() => zoomPlan("out")}
                        disabled={!canZoomOut}
                        className="flex h-6 w-6 items-center justify-center rounded text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 sm:h-8 sm:w-8"
                      >
                        <FiMinus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Reset plan zoom"
                        onClick={() => setPlanZoom(MIN_PLAN_ZOOM)}
                        className="h-6 min-w-9 rounded px-1 text-[10px] font-semibold text-gray-700 transition hover:bg-gray-100 sm:h-8 sm:min-w-12 sm:px-2 sm:text-xs"
                      >
                        {Math.round(planZoom * 100)}%
                      </button>
                      <button
                        type="button"
                        aria-label="Zoom in plan"
                        onClick={() => zoomPlan("in")}
                        disabled={!canZoomIn}
                        className="flex h-6 w-6 items-center justify-center rounded text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 sm:h-8 sm:w-8"
                      >
                        <FiPlus className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex h-[200px] items-center justify-center text-sm text-gray-400 sm:h-[300px] md:h-[360px] lg:h-[420px]">
                    No plan available
                  </div>
                )}
              </div>
            </div>

            {/* On small screens show summary under image */}
            <div className="mt-2.5 lg:hidden">
              <div className="grid grid-cols-2 gap-2 rounded-md bg-white/70 p-2.5 sm:flex sm:items-center sm:gap-5 sm:p-3">
                <div>
                  <div className="text-xs text-gray-500">Price</div>
                  <div className="text-xs font-medium text-green-700 sm:text-base">
                    {activeUnitPriceLabel}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Area</div>
                  <div className="text-xs font-medium text-green-700 sm:text-base">
                    {formatAreaUnit(activeUnit, isLand)}
                  </div>
                </div>
                {/* <div className="col-span-2 sm:ml-auto">
                  <button
                    type="button"
                    onClick={scrollToHero}
                    style={{ backgroundColor: color, color: '#FFF' }}
                    className="w-full rounded-md px-3 py-2 text-sm font-semibold sm:w-auto sm:px-4"
                  >
                    Book a Consultation
                  </button>
                </div> */}
              </div>
            </div>
          </div>

          {/* Right: details */}
          <aside className="lg:col-span-4">
            <div className="rounded-md p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                {/* <button
                  type="button"
                  onClick={scrollToHero}
                  style={{ backgroundColor: color }}
                  className="inline-flex w-full cursor-pointer items-center justify-center rounded-md px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-95 sm:px-4 sm:py-2 sm:text-base"
                >
                  Price on Request
                </button> */}
              </div>

              <ul className="mt-3 space-y-2 text-sm text-gray-700 sm:mt-6 sm:space-y-3 sm:text-base">
                <li className="flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-500 sm:text-sm">Unit</span>
                  <span className="text-right font-medium">
                    {activeBhk?.label ??
                      activeBhk?.bhkLabel ??
                      (activeBhk?.bhk ? `${activeBhk.bhk} BHK` : "—")}
                  </span>
                </li>

                <li className="flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-500 sm:text-sm">Area</span>
                  <span className="text-right font-medium">
                    {formatAreaUnit(activeUnit, isLand)}
                  </span>
                </li>

                <li className="flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-500 sm:text-sm">RERA Number</span>
                  <span className="text-right font-medium">{reraNumber}</span>
                </li>



                <li className="flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-500 sm:text-sm">Parking</span>
                  <span className="text-right font-medium">Available</span>
                </li>

                {launchDate && (
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-500 sm:text-sm">Launch</span>
                    <div className="mt-0 text-right font-medium sm:mt-1">
                      {launchDate}
                    </div>
                  </li>
                )}

                {possessionDate && (
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-500 sm:text-sm">Possession</span>
                    <div className="mt-0 text-right font-medium sm:mt-1">
                      {possessionDate}
                    </div>
                  </li>
                )}
              </ul>

              <div className="mt-3 sm:mt-6">
                <button
                  type="button"
                  onClick={scrollToHero}
                  style={{ backgroundColor: color }}
                  className="inline-flex w-full cursor-pointer items-center justify-center rounded-md px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-95 sm:px-4 sm:py-2 sm:text-base"
                >
                  {activeUnitPriceLabel}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
