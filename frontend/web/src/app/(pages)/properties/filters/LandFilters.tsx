"use client";
import {
  selectCityWithLocalities,
  selectLocalitiesByCity,
} from "@/Redux/slice/citySlice";
import {
  resetLandFilters,
  setBudget,
  setLandFilter,
} from "@/Redux/slice/filterSlice";
import { RootState } from "@/Redux/store";
import FilterDropdown from "@/ui/FilterDropdown";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getTrackBackground, Range } from "react-range";
import { PostedByOption } from "@/types/residential";
import { LandFilterKey } from "@/types";
import Toggle from "@/ui/ToggleSwitch";
import { toast } from "sonner";
import { getBudgetConfig, landMoreFilterSections, snapBudgetRangeToOptions } from "../constants/constants";
import { getSelectedMoreFiltersCount } from "../count-helper/ResSelectedMoreFiltersCount";
import { landKeyMapping } from "@/types/land";
import { ArrowDropdownIcon } from "@/icons/icons";
import SelectableButton from "@/ui/SelectableButton";
import { FiCheck, FiPlus, FiX } from "react-icons/fi";
import { formatLabel } from "@/utilies/formatLabel";
import {
  areFilterValuesEqual,
  toggleFilterArrayValue,
  uniqueFilterValues,
} from "./filterValueUtils";

function normalizeLocalityName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function getLocalityDedupKey(value: string) {
  return normalizeLocalityName(value).toLowerCase();
}

/* -------------------- BUDGET CONSTANTS -------------------- */

const formatBudget = (value: number) =>
  value >= 100
    ? `₹${value / 100}${value === 5000 ? "+" : ""} Cr`
    : `₹${value} Lac`;

const LandFilters = () => {
  const dispatch = useDispatch();

  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = useRef(false);
  const programmaticScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const leftItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [activeFilter, setActiveFilter] = useState<LandFilterKey>("Land Type");

  const cityData = useSelector(selectCityWithLocalities);
  const localities = useSelector(selectLocalitiesByCity);
  const filtersState = useSelector((state: RootState) => state.filters);

  const { minPrice, maxPrice, land, listingTypeValue } = filtersState;
  const { options: activeBudgetOptions, min: budgetMin, max: budgetMax, step: budgetStep, format: formatActiveBudget, title: budgetTitle } = getBudgetConfig(listingTypeValue);
  const [budgetTouched, setBudgetTouched] = useState(false);

  const { locality, createdByRole } = land;
  const dimensionLength = land.dimensions?.length;
  const dimensionWidth = land.dimensions?.width;
  const selectedLocalities = Array.isArray(locality) ? locality : [];
  const localityLabel =
    selectedLocalities.length === 0
      ? "Select Locality"
      : selectedLocalities.length === 1
        ? selectedLocalities[0]
        : `${selectedLocalities.length} Localities`;

  /* -------------------- BUDGET -------------------- */


  const [budgetRange, setBudgetRange] = useState<
    [number | null, number | null]
  >([minPrice ?? null, maxPrice ?? null]);

  useEffect(() => {
    setBudgetRange([minPrice ?? null, maxPrice ?? null]);
  }, [minPrice, maxPrice]);

  const budgetLabel =
    budgetRange[0] == null && budgetRange[1] == null
      ? budgetTitle
      : `${budgetRange[0] ? formatActiveBudget(budgetRange[0]) : "Min"} - ${budgetRange[1] ? formatActiveBudget(budgetRange[1]) : "Max"
      }`;

  const postedByOptions: PostedByOption[] = ["Owners", "Agents", "Builders"];
  const postedByLabelMap: Record<PostedByOption, string> = {
    Owners: "User",
    Agents: "Agent",
    Builders: "Builder",
  };

  const normalizePostedByRole = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === "owners" || normalized === "owner") return "user";
    if (normalized === "agents") return "agent";
    if (normalized === "builders") return "builder";
    return normalized;
  };

  const selectedCreatedByRole = Array.isArray(createdByRole)
    ? createdByRole[0] ?? ""
    : createdByRole
      ? String(createdByRole).split(",")[0]?.trim() ?? ""
      : "";

  const isCreatedByRoleSelected = (value: string) =>
    normalizePostedByRole(selectedCreatedByRole) === normalizePostedByRole(value);

  const [open, setOpen] = useState(false);

  const handleSectionClick = (key: LandFilterKey) => {
    const container = rightPanelRef.current;
    const target = sectionRefs.current[key];

    if (!container || !target) return;

    if (programmaticScrollTimeoutRef.current) {
      clearTimeout(programmaticScrollTimeoutRef.current);
    }

    programmaticScrollRef.current = true;

    const top = target.offsetTop - container.offsetTop - 12;

    setActiveFilter(key);
    container.scrollTo({
      top,
      behavior: "smooth",
    });

    programmaticScrollTimeoutRef.current = setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 350);
  };


  const toggleArrayValue = (arr: string[] = [], value: string) => {
    return arr.includes(value)
      ? arr.filter((v) => v !== value)
      : [...arr, value];
  };


  /* -------------------- MORE FILTER CONFIG -------------------- */

  const selectedMoreFiltersCount = getSelectedMoreFiltersCount(
    land,
    landKeyMapping
  );
  const uniqueLocalities = Array.from(
    new Map(
      (localities ?? [])
        .filter((loc): loc is { name: string } => Boolean(loc?.name?.trim()))
        .map((loc) => {
          const normalizedName = normalizeLocalityName(loc.name);
          return [
            getLocalityDedupKey(normalizedName),
            { ...loc, name: normalizedName },
          ] as const;
        }),
    ).values(),
  );
  const localityCount = selectedLocalities.length > 0 ? 1 : 0;
  const listingTypeCount = listingTypeValue ? 1 : 0;
  const moreFiltersBadgeCount =
    selectedMoreFiltersCount + localityCount + listingTypeCount;
  const displayedMoreFiltersBadgeCount = moreFiltersBadgeCount;

  const CARPET_MIN = 300;
  const CARPET_MAX = 10000;

  const carpetOptions = [
    300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000,
  ];

  const [carpetRange, setCarpetRange] = useState<[number, number]>([
    land.plotArea?.min ?? CARPET_MIN,
    land.plotArea?.max ?? CARPET_MAX,
  ]);

  const booleanLandKeys = new Set([
    "cornerPlot",
    "readyToConstruct",
    "waterConnection",
    "electricityConnection",
    "priceNegotiable",
  ]);
  const selectedLandTypes = Array.isArray(land.landType)
    ? uniqueFilterValues("landType", land.landType)
    : [];

  const landTypeLabel =
    selectedLandTypes.length === 0
      ? "Asset Type"
      : selectedLandTypes.length === 1
        ? selectedLandTypes[0]
        : `${selectedLandTypes.length} Types`;
  const landTypeOptions =
    landMoreFilterSections.find(
      (section) => section.key === "Land Type"
    )?.options ?? [];
  const appliedFilterChips = Array.from(
    new Set([
      ...(selectedLandTypes.length
        ? selectedLandTypes.map((value) => `Type: ${formatLabel(value)}`)
        : []),
      ...(Array.isArray(land.landSubType) && land.landSubType.length
        ? uniqueFilterValues("landSubType", land.landSubType).map(
            (value) => `Sub type: ${formatLabel(value)}`,
          )
        : []),
      ...(land.plotArea?.min || land.plotArea?.max
        ? [
            `Plot: ${land.plotArea?.min ?? CARPET_MIN}-${land.plotArea?.max ?? CARPET_MAX} sqft`,
          ]
        : []),
      ...(Array.isArray(land.facing) && land.facing.length
        ? uniqueFilterValues("facing", land.facing).map(
            (value) => `Facing: ${formatLabel(value)}`,
          )
        : []),
      ...(Array.isArray(land.roadWidth) && land.roadWidth.length
        ? uniqueFilterValues("roadWidth", land.roadWidth).map(
            (value) => `Road width: ${value}`,
          )
        : []),
      ...(land.cornerPlot ? ["Corner plot"] : []),
      ...(land.readyToConstruct ? ["Ready to construct"] : []),
      ...(Array.isArray(land.amenities) && land.amenities.length
        ? uniqueFilterValues("amenities", land.amenities).map(
            (value) => `Amenity: ${formatLabel(value)}`,
          )
        : []),
      ...(land.postedSince ? [`Posted: ${formatLabel(land.postedSince)}`] : []),
      ...(land.createdByRole ? [`By: ${formatLabel(land.createdByRole)}`] : []),
      ...(selectedLocalities.length
        ? selectedLocalities.map((value) => `Locality: ${value}`)
        : []),
      ...(minPrice != null || maxPrice != null
        ? [`Budget: ${budgetLabel}`]
        : []),
    ]),
  );
  const visibleAppliedFilterChips = appliedFilterChips.slice(0, 4);

  const updatePlotArea = (next: [number, number]) => {
    setCarpetRange(next);
    dispatch(
      setLandFilter({
        key: "plotArea",
        value: {
          min: next[0] === CARPET_MIN ? undefined : next[0],
          max: next[1] === CARPET_MAX ? undefined : next[1],
        },
      })
    );
  };
  const handleClearAllFilters = () => {
    dispatch(resetLandFilters());
    dispatch(
      setBudget({
        min: null,
        max: null,
      }),
    );
    setBudgetTouched(false);
    setBudgetRange([null, null]);
    setCarpetRange([CARPET_MIN, CARPET_MAX]);
  };

  useEffect(() => {
    setCarpetRange([
      land.plotArea?.min ?? CARPET_MIN,
      land.plotArea?.max ?? CARPET_MAX,
    ]);
  }, [land.plotArea?.min, land.plotArea?.max]);



  useEffect(() => {
    if (!budgetTouched) return;

    dispatch(
      setBudget({
        min: budgetRange[0] ?? null,
        max: budgetRange[1] ?? null,
      })
    );
  }, [budgetRange, budgetTouched, dispatch]);

  useEffect(() => {
    const container = rightPanelRef.current;
    if (!container || !open) return;

    const updateActiveSection = () => {
      if (programmaticScrollRef.current) return;

      const containerRect = container.getBoundingClientRect();
      const containerTop = containerRect.top;
      const containerHeight = containerRect.height;
      const targetLine = containerTop + Math.min(containerHeight * 0.35, 140);
      let nextActive = landMoreFilterSections[0]?.key ?? "Land Type";
      let smallestOffset = Number.POSITIVE_INFINITY;

      landMoreFilterSections.forEach((section) => {
        const element = sectionRefs.current[section.key];
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const isVisible = rect.bottom > containerTop + 16;
        if (!isVisible) return;

        const offset = Math.abs(rect.top - targetLine);
        if (offset < smallestOffset) {
          smallestOffset = offset;
          nextActive = section.key;
        }
      });

      setActiveFilter((current) =>
        current === nextActive ? current : nextActive,
      );
    };

    updateActiveSection();
    container.addEventListener("scroll", updateActiveSection, {
      passive: true,
    });

    return () => {
      container.removeEventListener("scroll", updateActiveSection);
      if (programmaticScrollTimeoutRef.current) {
        clearTimeout(programmaticScrollTimeoutRef.current);
        programmaticScrollTimeoutRef.current = null;
      }
      programmaticScrollRef.current = false;
    };
  }, [open]);

  useEffect(() => {
    const leftPanel = leftPanelRef.current;
    const activeItem = leftItemRefs.current[activeFilter];
    if (!open || !leftPanel || !activeItem) return;

    const itemTop = activeItem.offsetTop;
    const itemBottom = itemTop + activeItem.offsetHeight;
    const visibleTop = leftPanel.scrollTop;
    const visibleBottom = visibleTop + leftPanel.clientHeight;

    if (itemTop < visibleTop || itemBottom > visibleBottom) {
      leftPanel.scrollTo({
        top: itemTop - leftPanel.clientHeight / 2 + activeItem.offsetHeight / 2,
        behavior: "smooth",
      });
    }
  }, [activeFilter, open]);


  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 xl:flex-nowrap">
      {/* ---------- Localities ---------- */}
      <FilterDropdown
        className="shrink-0"
        triggerLabel={
          <span className="px-4 text-primary font-medium cursor-pointer whitespace-nowrap">
            {localityLabel}
          </span>
        }
        width="w-116"
        align="left"
        renderContent={(close) => (
          <div className="p-3">
            <h4 className="text-sm font-semibold mb-3">
              {cityData
                ? `Localities in ${cityData.city}`
                : "Select city first"}
            </h4>

            {!cityData && (
              <p className="text-sm text-gray-400">
                Please select a city to see localities
              </p>
            )}

            {cityData && (
              <>
                <div className="flex max-h-120 gap-2 overflow-y-auto pr-1 flex-wrap">
                  {uniqueLocalities.map((loc: { name: string }) => {
                    const isSelected = selectedLocalities.includes(loc.name);

                    return (
                      <button
                        key={loc.name}
                        onClick={() => {
                          dispatch(
                            setLandFilter({
                              key: "locality",
                              value: toggleArrayValue(
                                selectedLocalities,
                                loc.name
                              ),
                            })
                          );
                        }}
                        className={`flex cursor-pointer items-center gap-2 px-4 py-2 rounded-full text-sm border transition ${isSelected
                            ? "bg-green-100 text-green-700 border-green-400"
                            : "bg-white hover:bg-gray-50 border-gray-300"
                          }`}
                      >
                        {isSelected ? (
                          <FiCheck className="text-green-600 text-base" />
                        ) : (
                          <FiPlus className="text-gray-500 text-base" />
                        )}
                        <span>{loc.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-between items-center mt-4">
                  <button
                    onClick={() => {
                      dispatch(
                        setLandFilter({
                          key: "locality",
                          value: [],
                        })
                      );
                    }}
                    disabled={selectedLocalities.length === 0}
                    className={`flex items-center gap-1 text-sm font-medium ${
                      selectedLocalities.length > 0
                        ? "cursor-pointer text-red-500 hover:underline"
                        : "text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <FiX />
                    Clear All
                  </button>

                  <button
                    onClick={close}
                    className="cursor-pointer text-green-600 font-semibold text-sm hover:underline"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      />

      {/* ---------- Budget ---------- */}

      <FilterDropdown
        className="shrink-0"
        triggerLabel={
          <span className="px-4 text-primary font-medium cursor-pointer whitespace-nowrap">
            {budgetLabel}
          </span>
        }
        width="w-[320px]"
        align="left"
        renderContent={() => (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">{budgetTitle}</h4>

            {/* ---------- Min / Max Dropdowns ---------- */}
            <div className="flex gap-3">
              {/* Min */}
              <select
                value={budgetRange[0] ?? ""}
                onChange={(e) => {
                  setBudgetTouched(true);
                  const nextMin = e.target.value ? Number(e.target.value) : null;
                  setBudgetRange([
                    nextMin,
                    nextMin !== null && budgetRange[1] !== null && nextMin > budgetRange[1]
                      ? nextMin
                      : budgetRange[1],
                  ]);
                }}
                className="w-1/2 cursor-pointer border border-gray-400 rounded-md px-3 py-2 text-sm 
                 focus:outline-none focus:ring-0 focus:border-gray-400
                 hover:border-gray-400 active:border-gray-400"
              >
                <option value="">Min</option>
                {activeBudgetOptions.filter((v) => budgetRange[1] === null || v <= budgetRange[1]).map((v) => (
                  <option key={v} value={v}>
                    {formatActiveBudget(v)}
                  </option>
                ))}
              </select>

              <span className="flex items-center justify-center text-md text-gray-500 min-w-5">
                to
              </span>

              {/* Max */}
              <select
                value={budgetRange[1] ?? ""}
                onChange={(e) => {
                  setBudgetTouched(true);
                  const nextMax = e.target.value ? Number(e.target.value) : null;
                  setBudgetRange([
                    budgetRange[0] !== null && nextMax !== null && nextMax < budgetRange[0]
                      ? nextMax
                      : budgetRange[0],
                    nextMax,
                  ]);
                }}
                className="w-1/2 cursor-pointer border border-gray-400 rounded-md px-3 py-2 text-sm 
                 focus:outline-none focus:ring-0 focus:border-gray-400
                 hover:border-gray-400 active:border-gray-400"
              >
                <option value="">Max</option>
                {activeBudgetOptions.filter((v) => budgetRange[0] === null || v >= budgetRange[0]).map((v) => (
                  <option key={v} value={v}>
                    {formatActiveBudget(v)}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-gray-500">Leave either field blank for no limit.</p>

            {/* ---------- Range Slider ---------- */}
            <Range
              step={budgetStep}
              min={budgetMin}
              max={budgetMax}
              values={[
                budgetRange[0] ?? budgetMin,
                budgetRange[1] ?? budgetMax,
              ]}
              onChange={(values) => {
                const [min, max] = snapBudgetRangeToOptions(values, activeBudgetOptions);
                setBudgetTouched(true);

                setBudgetRange([
                  min === budgetMin ? null : min,
                  max === budgetMax ? null : max,
                ]);
              }}
              renderTrack={({ props, children }) => {
                const { key, ...restProps } = props as any;

                return (
                  <div
                    key={key}
                    {...restProps}
                    className="h-1 w-full rounded"
                    style={{
                      background: getTrackBackground({
                        values: [
                          budgetRange[0] ?? budgetMin,
                          budgetRange[1] ?? budgetMax,
                        ],
                        colors: ["#E5E7EB", "#16A34A", "#E5E7EB"], // gray → green → gray
                        min: budgetMin,
                        max: budgetMax,
                      }),
                    }}
                  >
                    {children}
                  </div>
                );
              }}
              renderThumb={({ props }) => {
                const { key, ...restProps } = props;
                return (
                  <div
                    key={key}
                    {...restProps}
                    className="h-4 w-4 cursor-pointer bg-green-600 rounded-full shadow"
                  />
                );
              }}
            />

            {/* ---------- Label ---------- */}
            <div className="text-xs text-gray-500 text-center">
              {budgetRange[0] ? formatActiveBudget(budgetRange[0]) : "Min"} –{" "}
              {budgetRange[1] ? formatActiveBudget(budgetRange[1]) : "Max"}
            </div>
          </div>
        )}
      />

      {/* ---------- Plot Area ---------- */}


      {/* ---------- Posted By ---------- */}
      <FilterDropdown
        className="shrink-0"
        triggerLabel={
          <span className="px-4 font-medium text-primary cursor-pointer whitespace-nowrap">
            Posted By
          </span>
        }
        width="w-56"
        renderContent={(close) => (
          <div>
            <h4 className="text-sm font-semibold mb-2">Posted By</h4>
            {postedByOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  const nextValue =
                    isCreatedByRoleSelected(postedByLabelMap[opt])
                      ? ""
                      : postedByLabelMap[opt];
                  dispatch(
                    setLandFilter({
                      key: "createdByRole",
                      value: nextValue,
                    })
                  );
                  close?.();
                }}
                className={`px-2 py-1 rounded block w-full cursor-pointer text-left ${isCreatedByRoleSelected(postedByLabelMap[opt]) ? "bg-[#D1EFDD] font-semibold text-[#15803D]" : "hover:bg-gray-100 text-gray-700"
                  }`}
              >
                {opt}
              </button>
            ))}
            <button
              onClick={() => {
                dispatch(
                  setLandFilter({
                    key: "createdByRole",
                    value: "",
                  })
                );
                close?.();
              }}
              disabled={!selectedCreatedByRole}
              className={`mt-2 px-2 py-1 rounded block w-full text-left ${
                createdByRole
                  ? "cursor-pointer text-red-500 hover:bg-red-50"
                  : "text-gray-400 cursor-not-allowed"
              }`}
            >
              Clear
            </button>
          </div>
        )}
      />


      {/* ---------- Property Type ---------- */}
      <FilterDropdown
        className="shrink-0"
        triggerLabel={
          <div className="flex w-30 items-center justify-between px-4 font-medium text-primary cursor-pointer whitespace-nowrap">
            <span className="truncate whitespace-nowrap">{landTypeLabel}</span>

            {selectedLandTypes.length > 0 && (
              <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">
                {selectedLandTypes.length}
              </span>
            )}
          </div>
        }
        width="w-72"
        align="left"
        renderContent={(close) => (
          <div className="space-y-3 p-3">
            <h4 className="text-sm font-semibold">Land Type</h4>

            <div className="flex flex-wrap gap-2">
              {landTypeOptions.map((option) => {
                const isActive = selectedLandTypes.some((item) =>
                  areFilterValuesEqual("landType", item, option)
                );

                return (
                  <button
                    key={option}
                    onClick={() => {
                      dispatch(
                        setLandFilter({
                          key: "landType",
                          value: toggleFilterArrayValue(
                            "landType",
                            selectedLandTypes,
                            option
                          ),
                        })
                      );
                    }}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition ${isActive
                        ? "border-green-400 bg-green-100 text-green-700"
                        : "border-gray-300 bg-white hover:bg-gray-50"
                      }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between">
              <button
                onClick={() =>
                  dispatch(
                    setLandFilter({
                      key: "landType",
                      value: [],
                    })
                  )
                }
                disabled={selectedLandTypes.length === 0}
                className={`text-sm font-medium ${selectedLandTypes.length > 0
                    ? "cursor-pointer text-red-500 hover:underline"
                    : "cursor-not-allowed text-gray-400"
                  }`}
              >
                Clear All
              </button>

              <button
                onClick={close}
                className="cursor-pointer text-sm font-semibold text-green-600 hover:underline"
              >
                Done
              </button>
            </div>
          </div>
        )}
      />


      {/* ---------- MORE FILTER MODAL ---------- */}
      <FilterDropdown
        className="shrink-0"
        open={open}
        onOpenChange={(next) => setOpen(next)}
        triggerLabel={
          <div className="flex text-primary items-center gap-2 px-2 py-2 rounded-xl border bg-white cursor-pointer whitespace-nowrap">
            <span className="btn-primary text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
              {displayedMoreFiltersBadgeCount}
            </span>

            <span className="text-sm font-semibold text-primary whitespace-nowrap">
              More Filters
            </span>

            <ArrowDropdownIcon
              size={12}
              color="#27AE60"
              className={`transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"
                }`}
            />
          </div>
        }
        width="w-[700px]"
        align="right"
        renderContent={() => (
          <div className="flex h-[420px] flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 bg-linear-to-r from-green-50 to-white px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  More Filters
                </h3>
              
                <div className="mt-2 flex flex-wrap gap-2">
                  {visibleAppliedFilterChips.length > 0 ? (
                    <>
                      {visibleAppliedFilterChips.map((chip, index) => (
                        <span
                          key={`${chip}-${index}`}
                          className="rounded-full border border-green-200 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-green-700"
                        >
                          {chip}
                        </span>
                      ))}
                      {appliedFilterChips.length > visibleAppliedFilterChips.length ? (
                        <span className="rounded-full border border-gray-200 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                          +{appliedFilterChips.length - visibleAppliedFilterChips.length} more
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="rounded-full border border-dashed border-gray-300 bg-white/80 px-2.5 py-1 text-[11px] text-gray-500">
                      No filters applied yet
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={handleClearAllFilters}
                className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50"
              >
                <FiX className="text-base" />
                Clear all
              </button>
            </div>
            <div className="flex min-h-0 flex-1">
            {/* ================= LEFT PANEL ================= */}
            <div
              ref={leftPanelRef}
              className="w-1/3 border-r border-gray-200 overflow-y-auto"
            >
              {landMoreFilterSections.map((section) => (
                <button
                  key={section.key}
                  ref={(el) => {
                    leftItemRefs.current[section.key] = el;
                  }}
                  onClick={() => handleSectionClick(section.key)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-200 cursor-pointer ${activeFilter === section.key
                    ? "font-semibold text-primary"
                    : "hover:bg-gray-50"
                    }`}
                >
                  {section.label}
                </button>
              ))}
            </div>

            {/* ================= RIGHT PANEL ================= */}
            <div
              ref={rightPanelRef}
              className="flex-1 p-6 overflow-y-auto space-y-10"
            >
              {landMoreFilterSections.map((section) => {
                const mappedKey = landKeyMapping[section.key];
                const currentValue = land[mappedKey];
                const isPostedByFilter = mappedKey === "createdByRole";

                return (
                  <div
                    key={section.key}
                    ref={(el) => {
                      sectionRefs.current[section.key] = el;
                    }}
                    className="space-y-4"
                  >
                    {/* SECTION TITLE */}
                    <h3 className="text-sm font-semibold text-gray-900">
                      {section.label}
                    </h3>

                    {/* ========== VERIFIED PROPERTIES ========== */}
                    {section.key === "Verified Properties" ? (
                      <Toggle
                        enabled={!!land.verifiedProperties}
                        onChange={(val) => {
                          dispatch(
                            setLandFilter({
                              key: "verifiedProperties",
                              value: val,
                            })
                          );
                          toast.success(
                            val
                              ? "Verified properties enabled"
                              : "Verified properties disabled"
                          );
                        }}
                      />
                    ) : section.key === "Plot Area" ? (
                      /* ========== PLOT AREA ========== */
                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <select
                            value={carpetRange[0]}
                            onChange={(e) =>
                              updatePlotArea([
                                Number(e.target.value),
                                carpetRange[1],
                              ])
                            }
                            className="w-1/2 cursor-pointer border rounded-md px-3 py-2 text-sm"
                          >
                            {carpetOptions.map((v) => (
                              <option key={v} value={v}>
                                Min {v} sqft
                              </option>
                            ))}
                          </select>

                          <select
                            value={carpetRange[1]}
                            onChange={(e) =>
                              updatePlotArea([
                                carpetRange[0],
                                Number(e.target.value),
                              ])
                            }
                            className="w-1/2 cursor-pointer border rounded-md px-3 py-2 text-sm"
                          >
                            {carpetOptions.map((v) => (
                              <option key={v} value={v}>
                                Max {v} sqft
                              </option>
                            ))}
                          </select>
                        </div>

                        <Range
                          step={50}
                          min={CARPET_MIN}
                          max={CARPET_MAX}
                          values={carpetRange}
                          onChange={(values) =>
                            updatePlotArea(values as [number, number])
                          }
                          renderTrack={({ props, children }) => {
                            const { key, ...restProps } = props as any;
                            return (
                              <div
                                key={key}
                                {...restProps}
                                className="h-1 w-full bg-gray-200 rounded"
                              >
                                {children}
                              </div>
                            );
                          }}
                          renderThumb={({ props }) => {
                            const { key, ...restProps } = props as any;
                            return (
                              <div
                                key={key}
                                {...restProps}
                                className="h-4 w-4 cursor-pointer bg-green-600 rounded-full shadow"
                              />
                            );
                          }}
                        />

                        <div className="text-xs text-gray-500">
                          {carpetRange[0]} – {carpetRange[1]} sqft
                        </div>
                      </div>
                    ) : section.key === "Dimensions" ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">
                            Length (ft)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={dimensionLength ?? ""}
                            onChange={(e) => {
                              const nextLength = e.target.value
                                ? Number(e.target.value)
                                : undefined;
                              dispatch(
                                setLandFilter({
                                  key: "dimensions",
                                  value: {
                                    length: nextLength,
                                    width: dimensionWidth,
                                  },
                                })
                              );
                            }}
                            className="w-full border rounded-md px-3 py-2 text-sm"
                            placeholder="e.g. 40"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">
                            Width (ft)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={dimensionWidth ?? ""}
                            onChange={(e) => {
                              const nextWidth = e.target.value
                                ? Number(e.target.value)
                                : undefined;
                              dispatch(
                                setLandFilter({
                                  key: "dimensions",
                                  value: {
                                    length: dimensionLength,
                                    width: nextWidth,
                                  },
                                })
                              );
                            }}
                            className="w-full border rounded-md px-3 py-2 text-sm"
                            placeholder="e.g. 60"
                          />
                        </div>
                      </div>
                    ) : (
                      /* ========== OPTIONS (SINGLE / MULTIPLE) ========== */
                      <div className="flex flex-wrap gap-3">
                        {section.options?.map((opt) => {
                          const isBooleanFilter = booleanLandKeys.has(mappedKey);
                          const postedByValue = isPostedByFilter
                            ? postedByLabelMap[opt as PostedByOption] ?? opt
                            : opt;
                          const selectedValues = Array.isArray(currentValue)
                            ? uniqueFilterValues(mappedKey, currentValue as string[])
                            : [];
                          const isActive =
                            isBooleanFilter
                              ? Boolean(currentValue)
                              : isPostedByFilter
                                ? isCreatedByRoleSelected(postedByValue)
                                : section.selectionType === "multiple"
                                  ? selectedValues.some((item) =>
                                      areFilterValuesEqual(mappedKey, item, opt)
                                    )
                                  : currentValue != null && currentValue !== ""
                                    ? areFilterValuesEqual(mappedKey, String(currentValue), opt)
                                    : false;

                          return (
                            <SelectableButton
                              key={opt}
                              label={
                                isPostedByFilter
                                  ? postedByValue.toLowerCase() === "user"
                                    ? "Owner"
                                    : postedByValue
                                  : formatLabel(opt)
                              }
                              active={isActive}
                              selectionType={section.selectionType ?? "single"}
                              showIndicator={isPostedByFilter}
                              onClick={() => {
                                const nextValue =
                                  isBooleanFilter
                                    ? !Boolean(currentValue)
                                    : isPostedByFilter
                                      ? isActive
                                        ? ""
                                        : postedByValue
                                      : section.selectionType === "multiple"
                                        ? toggleFilterArrayValue(
                                            mappedKey,
                                            selectedValues,
                                            opt
                                          )
                                        : isActive
                                          ? ""
                                          : opt;
                                dispatch(
                                  setLandFilter({
                                    key: mappedKey,
                                    value: nextValue,
                                  })
                                );
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        )}
      />

    </div>
  );
};

export default LandFilters;
