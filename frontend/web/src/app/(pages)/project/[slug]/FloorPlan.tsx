"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { FiChevronLeft, FiChevronRight, FiMinus, FiPlus } from "react-icons/fi";
import { FeaturedProject, IBhkUnit } from "@/types";

type FloorPlanProps = {
  project: FeaturedProject;
};

type PlanGroup = {
  label: string;
  bhkLabel: string;
  units: IBhkUnit[];
};

const MIN_PLAN_ZOOM = 1;
const MAX_PLAN_ZOOM = 2.5;
const PLAN_ZOOM_STEP = 0.25;

function formatCompactPrice(price?: number) {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return "--";
  }

  if (price >= 1e7) {
    return `\u20b9 ${(price / 1e7).toFixed(2).replace(/\.00$/, "")} Cr`;
  }

  if (price >= 1e5) {
    return `\u20b9 ${(price / 1e5).toFixed(2).replace(/\.00$/, "")} L`;
  }

  return `\u20b9 ${price.toLocaleString("en-IN")}`;
}

function formatUnitArea(unit?: IBhkUnit, isLand = false) {
  if (isLand) {
    const areaValue = unit?.area?.value;
    const areaUnit = unit?.area?.unit;

    if (
      typeof areaValue === "number" &&
      Number.isFinite(areaValue) &&
      areaValue > 0
    ) {
      return `${areaValue} ${areaUnit || "sq.ft"}`;
    }
  }

  if (
    typeof unit?.minSqft === "number" &&
    Number.isFinite(unit.minSqft) &&
    unit.minSqft > 0
  ) {
    return `${unit.minSqft} sq.ft`;
  }

  return "--";
}

function normalizeAreaUnit(unit?: string) {
  const normalized = unit?.trim().toLowerCase();

  if (!normalized || ["sqft", "sq.ft", "sq ft", "square feet", "square foot"].includes(normalized)) {
    return "sq.ft";
  }

  if (["gunta", "guntas", "guntha", "gunthas"].includes(normalized)) {
    return "guntas";
  }

  return unit?.trim() || "sq.ft";
}

function getUnitAreaForRate(unit?: IBhkUnit, isLand = false) {
  if (isLand && typeof unit?.area?.value === "number" && Number.isFinite(unit.area.value) && unit.area.value > 0) {
    return {
      value: unit.area.value,
      unit: normalizeAreaUnit(unit.area.unit),
    };
  }

  if (typeof unit?.area?.sqftValue === "number" && Number.isFinite(unit.area.sqftValue) && unit.area.sqftValue > 0) {
    return {
      value: unit.area.sqftValue,
      unit: "sq.ft",
    };
  }

  if (typeof unit?.area?.value === "number" && Number.isFinite(unit.area.value) && unit.area.value > 0) {
    return {
      value: unit.area.value,
      unit: normalizeAreaUnit(unit.area.unit),
    };
  }

  if (typeof unit?.minSqft === "number" && Number.isFinite(unit.minSqft) && unit.minSqft > 0) {
    return {
      value: unit.minSqft,
      unit: "sq.ft",
    };
  }

  return null;
}

function formatPricePerUnit(unit?: IBhkUnit, isLand = false) {
  const minPrice = unit?.minPrice ?? unit?.price;
  const area = getUnitAreaForRate(unit, isLand);

  if (typeof minPrice !== "number" || !Number.isFinite(minPrice) || minPrice <= 0 || !area) {
    return null;
  }

  return `\u20b9 ${Math.round(minPrice / area.value).toLocaleString("en-IN")}/${area.unit}`;
}

function getComparableArea(unit?: IBhkUnit) {
  const areaValue =
    unit?.area?.sqftValue ??
    unit?.minSqft ??
    unit?.area?.value ??
    Number.MAX_SAFE_INTEGER;

  return typeof areaValue === "number" && Number.isFinite(areaValue)
    ? areaValue
    : Number.MAX_SAFE_INTEGER;
}

function getComparableGroupValue(group: PlanGroup) {
  const value = group.bhkLabel.match(/\d+(\.\d+)?/)?.[0];
  const numericValue = value ? Number(value) : Number.MAX_SAFE_INTEGER;

  return Number.isFinite(numericValue) ? numericValue : Number.MAX_SAFE_INTEGER;
}

function getPlanGroups(project: FeaturedProject): PlanGroup[] {
  const summary = project.projectSummary ?? project.bhkSummary ?? [];

  return summary
    .map((item) => {
      const label = item.label ?? item.bhkLabel ?? `${item.bhk} BHK`;
      const cleanLabel = label.toLowerCase().includes("apartment")
        ? label
        : `${label} `;

      return {
        label: cleanLabel,
        bhkLabel: label,
        units: [...(item.units ?? [])].sort(
          (a, b) => getComparableArea(a) - getComparableArea(b),
        ),
      };
    })
    .filter((group) => group.units.length > 0)
    .sort((a, b) => {
      const groupSort = getComparableGroupValue(a) - getComparableGroupValue(b);

      if (groupSort !== 0) return groupSort;

      return a.label.localeCompare(b.label);
    });
}

export default function FloorPlan({ project }: FloorPlanProps) {
  const groups = useMemo(() => getPlanGroups(project), [project]);
  const planScrollRef = useRef<HTMLDivElement | null>(null);
  const groupTabsScrollRef = useRef<HTMLDivElement | null>(null);
  const unitTabsScrollRef = useRef<HTMLDivElement | null>(null);
  const groupTabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const dragStartRef = useRef({
    clientX: 0,
    clientY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const groupTabsDragRef = useRef({
    dragging: false,
    moved: false,
    clientX: 0,
    scrollLeft: 0,
  });
  const unitTabsDragRef = useRef({
    dragging: false,
    moved: false,
    clientX: 0,
    scrollLeft: 0,
  });
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);
  const [planZoom, setPlanZoom] = useState(MIN_PLAN_ZOOM);
  const [isDraggingPlan, setIsDraggingPlan] = useState(false);
  const [isDraggingGroupTabs, setIsDraggingGroupTabs] = useState(false);
  const [isDraggingUnitTabs, setIsDraggingUnitTabs] = useState(false);
  const [canScrollGroupTabsLeft, setCanScrollGroupTabsLeft] = useState(false);
  const [canScrollGroupTabsRight, setCanScrollGroupTabsRight] = useState(false);
  const isLand = project.categoryType?.toLowerCase() === "land";
  const sectionTitle = isLand ? "Layout" : "Floor Plans";

  const activeGroup = groups[activeGroupIndex];
  const activeUnit = activeGroup?.units[activeUnitIndex] ?? activeGroup?.units[0];
  const planImage = activeUnit?.plan?.url;
  const sqftLabel = formatUnitArea(activeUnit, isLand);
  const priceLabel = formatCompactPrice(activeUnit?.minPrice ?? activeUnit?.price);
  const pricePerUnitLabel = formatPricePerUnit(activeUnit, isLand);
  const canZoomIn = planZoom < MAX_PLAN_ZOOM;
  const canZoomOut = planZoom > MIN_PLAN_ZOOM;
  const canDragPlan = planZoom > MIN_PLAN_ZOOM;

  useEffect(() => {
    setPlanZoom(MIN_PLAN_ZOOM);
    if (planScrollRef.current) {
      planScrollRef.current.scrollLeft = 0;
      planScrollRef.current.scrollTop = 0;
    }
  }, [activeGroupIndex, activeUnitIndex]);

  useEffect(() => {
    const activeTab = groupTabsRef.current[activeGroupIndex];
    activeTab?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeGroupIndex]);

  const updateGroupTabScrollState = () => {
    const container = groupTabsScrollRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);

    setCanScrollGroupTabsLeft(scrollLeft > 4);
    setCanScrollGroupTabsRight(scrollLeft < maxScrollLeft - 4);
  };

  useEffect(() => {
    updateGroupTabScrollState();

    const container = groupTabsScrollRef.current;
    if (!container) return;

    container.addEventListener("scroll", updateGroupTabScrollState, { passive: true });
    window.addEventListener("resize", updateGroupTabScrollState);

    return () => {
      container.removeEventListener("scroll", updateGroupTabScrollState);
      window.removeEventListener("resize", updateGroupTabScrollState);
    };
  }, [groups.length]);

  useEffect(() => {
    updateGroupTabScrollState();
  }, [activeGroupIndex]);

  const zoomPlan = (direction: "in" | "out") => {
    setPlanZoom((currentZoom) => {
      const nextZoom =
        direction === "in"
          ? currentZoom + PLAN_ZOOM_STEP
          : currentZoom - PLAN_ZOOM_STEP;

      return Math.min(MAX_PLAN_ZOOM, Math.max(MIN_PLAN_ZOOM, nextZoom));
    });
  };

  const handlePlanPointerDown = (event: PointerEvent<HTMLDivElement>) => {
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

  const handlePlanPointerMove = (event: PointerEvent<HTMLDivElement>) => {
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

  const handleGroupTabsPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const container = groupTabsScrollRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;

    groupTabsDragRef.current = {
      dragging: true,
      moved: false,
      clientX: event.clientX,
      scrollLeft: container.scrollLeft,
    };
    setIsDraggingGroupTabs(true);
    container.setPointerCapture(event.pointerId);
  };

  const handleGroupTabsPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const container = groupTabsScrollRef.current;
    const dragState = groupTabsDragRef.current;
    if (!dragState.dragging || !container) return;

    const deltaX = event.clientX - dragState.clientX;
    if (Math.abs(deltaX) > 4) {
      dragState.moved = true;
    }

    container.scrollLeft = dragState.scrollLeft - deltaX;
    event.preventDefault();
  };

  const stopGroupTabsDrag = () => {
    if (!groupTabsDragRef.current.dragging) return;

    groupTabsDragRef.current.dragging = false;
    setIsDraggingGroupTabs(false);
    window.setTimeout(() => {
      groupTabsDragRef.current.moved = false;
    }, 0);
  };

  const handleUnitTabsPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const container = unitTabsScrollRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;

    unitTabsDragRef.current = {
      dragging: true,
      moved: false,
      clientX: event.clientX,
      scrollLeft: container.scrollLeft,
    };
    setIsDraggingUnitTabs(true);
    container.setPointerCapture(event.pointerId);
  };

  const handleUnitTabsPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const container = unitTabsScrollRef.current;
    const dragState = unitTabsDragRef.current;
    if (!dragState.dragging || !container) return;

    const deltaX = event.clientX - dragState.clientX;
    if (Math.abs(deltaX) > 4) {
      dragState.moved = true;
    }

    container.scrollLeft = dragState.scrollLeft - deltaX;
    event.preventDefault();
  };

  const stopUnitTabsDrag = () => {
    if (!unitTabsDragRef.current.dragging) return;

    unitTabsDragRef.current.dragging = false;
    setIsDraggingUnitTabs(false);
    window.setTimeout(() => {
      unitTabsDragRef.current.moved = false;
    }, 0);
  };

  const scrollGroupTabs = (direction: "left" | "right") => {
    const container = groupTabsScrollRef.current;
    if (!container) return;

    const scrollAmount = Math.max(container.clientWidth * 0.7, 180);
    container.scrollBy({
      left: direction === "right" ? scrollAmount : -scrollAmount,
      behavior: "smooth",
    });
  };

  if (!groups.length) {
    return null;
  }
  return (
    <section id="floor-plans" className="min-w-0">
      <div className="container mx-auto min-w-0 px-1 sm:px-4 lg:px-3">
        <div className="w-full min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-3 py-3 text-base font-medium text-slate-950 sm:px-5 sm:py-5 sm:text-xl">
            {project.title} {sectionTitle}
          </h2>

          <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
            <div className="space-y-2.5 sm:space-y-4">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 sm:text-[15px]">
                    Choose a floor plan
                  </p>
                  <p className="text-[11px] text-slate-500 sm:text-xs">
                    {groups.length} options available
                  </p>
                </div>
                {groups.length > 1 ? (
                  <div className="flex items-center justify-between gap-1.5 sm:justify-end sm:gap-2">
                    <p className="text-[11px] font-medium text-slate-400 sm:hidden">
                      Swipe to see more
                    </p>
                    <button
                      type="button"
                      aria-label="Scroll floor plan tabs left"
                      onClick={() => scrollGroupTabs("left")}
                      disabled={!canScrollGroupTabsLeft}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-200 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-35 sm:h-9 sm:w-9"
                    >
                      <FiChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Scroll floor plan tabs right"
                      onClick={() => scrollGroupTabs("right")}
                      disabled={!canScrollGroupTabsRight}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-200 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-35 sm:h-9 sm:w-9"
                    >
                      <FiChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="relative rounded-lg border border-slate-200 bg-slate-50/70 px-1.5 py-1.5 sm:rounded-xl sm:px-2.5 sm:py-2">
                <div
                  className={`pointer-events-none absolute inset-y-2 left-2 z-10 w-8 rounded-l-xl bg-gradient-to-r from-slate-50 to-transparent transition ${
                    canScrollGroupTabsLeft ? "opacity-100" : "opacity-0"
                  }`}
                />
                <div
                  className={`pointer-events-none absolute inset-y-2 right-2 z-10 w-8 rounded-r-xl bg-gradient-to-l from-slate-50 to-transparent transition ${
                    canScrollGroupTabsRight ? "opacity-100" : "opacity-0"
                  }`}
                />
                <div
                  ref={groupTabsScrollRef}
                  onPointerDown={handleGroupTabsPointerDown}
                  onPointerMove={handleGroupTabsPointerMove}
                  onPointerUp={stopGroupTabsDrag}
                  onPointerCancel={stopGroupTabsDrag}
                  onPointerLeave={stopGroupTabsDrag}
                  className={`flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-2 overflow-x-auto whitespace-nowrap select-none [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-2.5 [&::-webkit-scrollbar]:hidden ${
                    isDraggingGroupTabs ? "cursor-grabbing" : "cursor-grab"
                  }`}
                >
                  {groups.map((group, index) => (
                    <button
                      key={`${group.label}-${index}`}
                      ref={(element) => {
                        groupTabsRef.current[index] = element;
                      }}
                      type="button"
                      onClick={(event) => {
                        if (groupTabsDragRef.current.moved) {
                          event.preventDefault();
                          return;
                        }
                        setActiveGroupIndex(index);
                        setActiveUnitIndex(0);
                      }}
                      className={`shrink-0 snap-start cursor-pointer rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition sm:rounded-lg sm:px-4.5 sm:py-2.5 sm:text-sm ${
                        activeGroupIndex === index
                          ? "border-emerald-200 bg-white text-emerald-700 shadow-sm"
                          : "border-transparent bg-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-700"
                      }`}
                      aria-pressed={activeGroupIndex === index}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div
              ref={unitTabsScrollRef}
              onPointerDown={handleUnitTabsPointerDown}
              onPointerMove={handleUnitTabsPointerMove}
              onPointerUp={stopUnitTabsDrag}
              onPointerCancel={stopUnitTabsDrag}
              onPointerLeave={stopUnitTabsDrag}
              className={`no-scrollbar mt-3 flex w-full min-w-0 max-w-full overflow-x-auto border-b border-slate-200 select-none sm:mt-4 ${
                isDraggingUnitTabs ? "cursor-grabbing" : "cursor-grab"
              }`}
            >
              {activeGroup.units.map((unit, index) => (
                <button
                  key={`${unit.minSqft}-${unit.price}-${index}`}
                  type="button"
                  onClick={(event) => {
                    if (unitTabsDragRef.current.moved) {
                      event.preventDefault();
                      return;
                    }
                    setActiveUnitIndex(index);
                  }}
                  className={`shrink-0 cursor-pointer border-b-2 px-3 pb-2 text-center transition sm:px-8 sm:pb-3 ${
                    activeUnitIndex === index
                      ? "border-emerald-500"
                      : "border-transparent hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`block whitespace-nowrap text-[11px] font-medium sm:text-xs ${
                      activeUnitIndex === index ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {formatUnitArea(unit, isLand)}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-3 min-w-0 rounded-md p-0.5 sm:mt-4 sm:p-1">
              {planImage ? (
                <div className="relative overflow-hidden rounded-md border border-slate-200 bg-white">
                  <div
                    ref={planScrollRef}
                    onPointerDown={handlePlanPointerDown}
                    onPointerMove={handlePlanPointerMove}
                    onPointerUp={stopPlanDrag}
                    onPointerCancel={stopPlanDrag}
                    onPointerLeave={stopPlanDrag}
                    className={`flex h-[210px] items-center justify-center overflow-auto select-none sm:h-[420px] ${
                      canDragPlan
                        ? isDraggingPlan
                          ? "cursor-grabbing"
                          : "cursor-grab"
                        : "cursor-default"
                    }`}
                  >
                    <img
                      src={planImage}
                      alt={`${activeGroup.bhkLabel} floor plan`}
                      draggable={false}
                      className="max-w-none object-contain transition-[height,width] duration-200 ease-out"
                      style={{
                        width: `${planZoom * 100}%`,
                        height: `${planZoom * 100}%`,
                      }}
                    />
                  </div>

                  <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md border border-slate-200 bg-white/95 p-0.5 shadow-sm sm:right-3 sm:top-3 sm:gap-1 sm:p-1">
                    <button
                      type="button"
                      aria-label="Zoom out plan"
                      onClick={() => zoomPlan("out")}
                      disabled={!canZoomOut}
                      className="flex h-6 w-6 items-center justify-center rounded text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 sm:h-8 sm:w-8"
                    >
                      <FiMinus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Reset plan zoom"
                      onClick={() => setPlanZoom(MIN_PLAN_ZOOM)}
                      className="h-6 min-w-9 rounded px-1 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100 sm:h-8 sm:min-w-12 sm:px-2 sm:text-xs"
                    >
                      {Math.round(planZoom * 100)}%
                    </button>
                    <button
                      type="button"
                      aria-label="Zoom in plan"
                      onClick={() => zoomPlan("in")}
                      disabled={!canZoomIn}
                      className="flex h-6 w-6 items-center justify-center rounded text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 sm:h-8 sm:w-8"
                    >
                      <FiPlus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[210px] items-center justify-center rounded-md border border-dashed border-slate-300 bg-white px-3 text-center sm:min-h-[420px] sm:px-4">
                  <p className="text-xs font-medium text-slate-500 sm:text-sm">
                    Floor plan image coming soon
                  </p>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:mt-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div>
                <h3 className="text-xs font-medium text-slate-950 sm:text-base">
                  {activeGroup.bhkLabel} {sqftLabel}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 sm:mt-3 sm:gap-x-5 sm:gap-y-2">
                  <p className="text-base font-semibold text-emerald-600 sm:text-xl">{priceLabel}</p>
                  {pricePerUnitLabel && (
                    <p className="text-xs font-semibold text-slate-600 sm:text-base">{pricePerUnitLabel}</p>
                  )}
                </div>
              </div>

              
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
