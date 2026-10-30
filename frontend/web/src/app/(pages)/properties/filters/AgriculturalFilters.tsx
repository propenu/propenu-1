"use client";

import {
  selectCityWithLocalities,
  selectLocalitiesByCity,
} from "@/Redux/slice/citySlice";
import {
  resetAgriculturalFilters,
  setAgriculturalFilter,
  setBudget,
} from "@/Redux/slice/filterSlice";
import { RootState } from "@/Redux/store";
import { ArrowDropdownIcon } from "@/icons/icons";
import { agriculturalKeyMapping } from "@/types/agricultural";
import { AgriculturalFilterKey } from "@/types";
import FilterDropdown from "@/ui/FilterDropdown";
import SelectableButton from "@/ui/SelectableButton";
import Toggle from "@/ui/ToggleSwitch";
import { PostedByOption } from "@/types/residential";
import { useEffect, useRef, useState } from "react";
import { getTrackBackground, Range } from "react-range";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "sonner";
import { FiCheck, FiPlus, FiX } from "react-icons/fi";
import { getSelectedMoreFiltersCount } from "../count-helper/ResSelectedMoreFiltersCount";
import {
  agriculturalMoreFilterSections,
  getBudgetConfig,
  CARPET_MAX,
  CARPET_MIN,
  carpetOptions,
  snapBudgetRangeToOptions,
} from "../constants/constants";
import { formatLabel } from "@/utilies/formatLabel";
import {
  areFilterValuesEqual,
  toggleFilterArrayValue,
  uniqueFilterValues,
} from "./filterValueUtils";

const MULTI_SELECT_KEYS = new Set([
  "agriculturalType",
  "agriculturalSubType",
  "soilType",
  "irrigationType",
  "waterSource",
  "borewellCount",
  "currentCrop",
  "plantationAge",
  "roadWidth",
  "accessRoadType",
  "amenities",
]);

const BOOLEAN_KEYS = new Set([
  "electricityConnection",
  "boundaryWall",
  "priceNegotiable",
]);

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

const normalizeBudgetRange = (
  min: number | null,
  max: number | null
): [number | null, number | null] => {
  if (min == null || max == null) return [min, max];
  return min <= max ? [min, max] : [max, min];
};

const AgriculturalFilters = () => {
  const dispatch = useDispatch();

  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = useRef(false);
  const programmaticScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const leftItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});


  const cityData = useSelector(selectCityWithLocalities);
  const localities = useSelector(selectLocalitiesByCity);
  const filtersState = useSelector((state: RootState) => state.filters);
  const { minPrice, maxPrice, agricultural, listingTypeValue } = filtersState;
  const { options: activeBudgetOptions, min: budgetMin, max: budgetMax, step: budgetStep, format: formatActiveBudget, title: budgetTitle } = getBudgetConfig(listingTypeValue);

  const [budgetTouched, setBudgetTouched] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeFilter, setActiveFilter] =
    useState<AgriculturalFilterKey>("Agricultural Type");
  const [budgetRange, setBudgetRange] = useState<
    [number | null, number | null]
  >(() => normalizeBudgetRange(minPrice ?? null, maxPrice ?? null));
  const [carpetRange, setCarpetRange] = useState<[number, number]>([
    agricultural.totalArea?.min ?? CARPET_MIN,
    agricultural.totalArea?.max ?? CARPET_MAX,
  ]);

  const { locality, createdByRole } = agricultural;
  const selectedCreatedByRole = Array.isArray(createdByRole)
    ? createdByRole[0] ?? ""
    : createdByRole
      ? String(createdByRole).split(",")[0]?.trim() ?? ""
      : "";

  const isCreatedByRoleSelected = (value: string) =>
    normalizePostedByRole(selectedCreatedByRole) === normalizePostedByRole(value);

  const selectedLocalities = Array.isArray(locality) ? locality : [];
  const localityLabel =
    selectedLocalities.length === 0
      ? "Select Locality"
      : selectedLocalities.length === 1
        ? selectedLocalities[0]
        : `${selectedLocalities.length} Localities`;

  const budgetLabel =
    budgetRange[0] == null && budgetRange[1] == null
      ? budgetTitle
      : `${budgetRange[0] ? formatActiveBudget(budgetRange[0]) : "Min"} - ${budgetRange[1] ? formatActiveBudget(budgetRange[1]) : "Max"
      }`;

  const selectedMoreFiltersCount = getSelectedMoreFiltersCount(
    agricultural,
    agriculturalKeyMapping
  );
  const localityCount = selectedLocalities.length > 0 ? 1 : 0;
  const listingTypeCount = listingTypeValue ? 1 : 0;
  const moreFiltersBadgeCount =
    selectedMoreFiltersCount + localityCount + listingTypeCount;
  const displayedMoreFiltersBadgeCount = moreFiltersBadgeCount;

  const handleSectionClick = (key: AgriculturalFilterKey) => {
    const container = rightPanelRef.current;
    const target = sectionRefs.current[key];

    if (!container || !target) return;

    if (programmaticScrollTimeoutRef.current) {
      clearTimeout(programmaticScrollTimeoutRef.current);
    }

    programmaticScrollRef.current = true;

    const top = target.offsetTop - container.offsetTop - 12;
    setActiveFilter(key);
    container.scrollTo({ top, behavior: "smooth" });
    programmaticScrollTimeoutRef.current = setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 350);
  };
  const agriculturalTypeOptions =
  agriculturalMoreFilterSections.find(
    (section) => section.key === "Agricultural Type"
  )?.options ?? [];
  const selectedAgriculturalTypes = Array.isArray(agricultural.agriculturalType)
    ? uniqueFilterValues("agriculturalType", agricultural.agriculturalType)
    : [];
  const appliedFilterChips = Array.from(
    new Set([
      ...(selectedAgriculturalTypes.length
        ? selectedAgriculturalTypes.map((value) => `Type: ${formatLabel(value)}`)
        : []),
      ...(Array.isArray(agricultural.agriculturalSubType) &&
      agricultural.agriculturalSubType.length
        ? uniqueFilterValues(
            "agriculturalSubType",
            agricultural.agriculturalSubType,
          ).map((value) => `Sub type: ${formatLabel(value)}`)
        : []),
      ...(agricultural.totalArea?.min || agricultural.totalArea?.max
        ? [
            `Area: ${agricultural.totalArea?.min ?? CARPET_MIN}-${agricultural.totalArea?.max ?? CARPET_MAX} sqft`,
          ]
        : []),
      ...(Array.isArray(agricultural.soilType) && agricultural.soilType.length
        ? uniqueFilterValues("soilType", agricultural.soilType).map(
            (value) => `Soil: ${formatLabel(value)}`,
          )
        : []),
      ...(Array.isArray(agricultural.waterSource) &&
      agricultural.waterSource.length
        ? uniqueFilterValues("waterSource", agricultural.waterSource).map(
            (value) => `Water: ${formatLabel(value)}`,
          )
        : []),
      ...(Array.isArray(agricultural.currentCrop) &&
      agricultural.currentCrop.length
        ? uniqueFilterValues("currentCrop", agricultural.currentCrop).map(
            (value) => `Crop: ${formatLabel(value)}`,
          )
        : []),
      ...(Array.isArray(agricultural.amenities) &&
      agricultural.amenities.length
        ? uniqueFilterValues("amenities", agricultural.amenities).map(
            (value) => `Amenity: ${formatLabel(value)}`,
          )
        : []),
      ...(agricultural.postedSince
        ? [`Posted: ${formatLabel(agricultural.postedSince)}`]
        : []),
      ...(agricultural.createdByRole
        ? [`By: ${formatLabel(agricultural.createdByRole)}`]
        : []),
      ...(selectedLocalities.length
        ? selectedLocalities.map((value) => `Locality: ${value}`)
        : []),
      ...(minPrice != null || maxPrice != null
        ? [`Budget: ${budgetLabel}`]
        : []),
    ]),
  );
  const visibleAppliedFilterChips = appliedFilterChips.slice(0, 4);
  const propertyTypeLabel =
  selectedAgriculturalTypes.length === 0
    ? "Asset Type"
    : selectedAgriculturalTypes.length === 1
      ? selectedAgriculturalTypes[0]
      : `${selectedAgriculturalTypes.length} Types`;

  const toggleArrayValue = (arr: string[] = [], value: string) =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const updateTotalArea = (next: [number, number]) => {
    setCarpetRange(next);
    dispatch(
      setAgriculturalFilter({
        key: "totalArea",
        value: {
          min: next[0] === CARPET_MIN ? undefined : next[0],
          max: next[1] === CARPET_MAX ? undefined : next[1],
        },
      })
    );
  };
  const handleClearAllFilters = () => {
    dispatch(resetAgriculturalFilters());
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
      agricultural.totalArea?.min ?? CARPET_MIN,
      agricultural.totalArea?.max ?? CARPET_MAX,
    ]);
  }, [agricultural.totalArea?.min, agricultural.totalArea?.max]);

  useEffect(() => {
    setBudgetRange(normalizeBudgetRange(minPrice ?? null, maxPrice ?? null));
  }, [minPrice, maxPrice]);

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
      let nextActive =
        agriculturalMoreFilterSections[0]?.key ?? "Agricultural Type";
      let smallestOffset = Number.POSITIVE_INFINITY;

      agriculturalMoreFilterSections.forEach((section) => {
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
              {cityData ? `Localities in ${cityData.city}` : "Select city first"}
            </h4>

            {!cityData && (
              <p className="text-sm text-gray-400">
                Please select a city to see localities
              </p>
            )}

            {cityData && (
              <>
                <div className="flex max-h-120 gap-2 overflow-y-auto pr-1 flex-wrap">
                  {localities.map((loc: { name: string }) => {
                    const isSelected = selectedLocalities.includes(loc.name);

                    return (
                      <button
                        key={loc.name}
                        onClick={() => {
                          dispatch(
                            setAgriculturalFilter({
                              key: "locality",
                              value: toggleArrayValue(
                                selectedLocalities,
                                loc.name
                              ),
                            })
                          );
                        }}
                        className={`flex cursor-pointer items-center gap-2 px-4 py-2 rounded-full text-sm border transition ${
                          isSelected
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
                        setAgriculturalFilter({
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

            <div className="flex gap-3">
              <select
                value={budgetRange[0] ?? ""}
                onChange={(e) => {
                  setBudgetTouched(true);
                  setBudgetRange(
                    normalizeBudgetRange(
                      e.target.value ? Number(e.target.value) : null,
                      budgetRange[1]
                    )
                  );
                }}
                className="w-1/2 cursor-pointer border border-gray-400 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-400 hover:border-gray-400 active:border-gray-400"
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

              <select
                value={budgetRange[1] ?? ""}
                onChange={(e) => {
                  setBudgetTouched(true);
                  setBudgetRange(
                    normalizeBudgetRange(
                      budgetRange[0],
                      e.target.value ? Number(e.target.value) : null
                    )
                  );
                }}
                className="w-1/2 cursor-pointer border border-gray-400 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-400 hover:border-gray-400 active:border-gray-400"
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

            <Range
              step={budgetStep}
              min={budgetMin}
              max={budgetMax}
              values={[budgetRange[0] ?? budgetMin, budgetRange[1] ?? budgetMax]}
              onChange={(values) => {
                const [min, max] = snapBudgetRangeToOptions(values, activeBudgetOptions);
                setBudgetTouched(true);
                setBudgetRange(
                  normalizeBudgetRange(
                    min === budgetMin ? null : min,
                    max === budgetMax ? null : max
                  )
                );
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
                        colors: ["#E5E7EB", "#16A34A", "#E5E7EB"],
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

            <div className="text-xs text-gray-500 text-center">
              {budgetRange[0] ? formatActiveBudget(budgetRange[0]) : "Min"} -{" "}
              {budgetRange[1] ? formatActiveBudget(budgetRange[1]) : "Max"}
            </div>
          </div>
        )}
      />

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
                    setAgriculturalFilter({
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
                  setAgriculturalFilter({
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
      <span className="truncate whitespace-nowrap">{propertyTypeLabel}</span>
      {selectedAgriculturalTypes.length > 0 && (
        <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">
          {selectedAgriculturalTypes.length}
        </span>
      )}
    </div>
  }
  width="w-72"
  align="left"
  renderContent={(close) => (
    <div className="space-y-3 p-3">
      <h4 className="text-sm font-semibold">Agricultural Type</h4>

      <div className="flex flex-wrap gap-2">
        {agriculturalTypeOptions.map((option) => {
          const isActive = selectedAgriculturalTypes.some((item) =>
            areFilterValuesEqual("agriculturalType", item, option)
          );

          return (
            <button
              key={option}
              onClick={() => {
                dispatch(
                  setAgriculturalFilter({
                    key: "agriculturalType",
                    value: toggleFilterArrayValue(
                      "agriculturalType",
                      selectedAgriculturalTypes,
                      option
                    ),
                  })
                );
              }}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition ${
                isActive
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
              setAgriculturalFilter({
                key: "agriculturalType",
                value: [],
              })
            )
          }
          disabled={selectedAgriculturalTypes.length === 0}
          className={`text-sm font-medium ${
            selectedAgriculturalTypes.length > 0
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


      <FilterDropdown
        className="shrink-0"
        open={open}
        onOpenChange={(next) => setOpen(next)}
        triggerLabel={
          <div className="flex text-primary items-center gap-2 px-2 py-2 rounded-xl border bg-white cursor-pointer whitespace-nowrap">
            <span className="btn-primary text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
              {displayedMoreFiltersBadgeCount}
            </span>
            <span className="text-sm font-semibold text-primary whitespace-nowrap">More Filters</span>
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
            <div
              ref={leftPanelRef}
              className="w-1/3 border-r border-gray-200 overflow-y-auto"
            >
              {agriculturalMoreFilterSections?.map((section) => (
                <button
                  key={section.key}
                  ref={(el) => {
                    leftItemRefs.current[section.key] = el;
                  }}
                  onClick={() => {
                    handleSectionClick(section.key);
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-200 cursor-pointer ${activeFilter === section.key
                      ? "font-semibold text-primary"
                      : "hover:bg-gray-50"
                    }`}
                >
                  {section.label}
                </button>
              ))}
            </div>

            <div
              ref={rightPanelRef}
              className="flex-1 p-6 overflow-y-auto space-y-10"
            >
              {agriculturalMoreFilterSections.map((section) => {
                const mappedKey = agriculturalKeyMapping[section.key];
                const currentValue = agricultural[mappedKey];
                const isBooleanFilter = BOOLEAN_KEYS.has(mappedKey);
                const isPostedByFilter = mappedKey === "createdByRole";
                const isMultiSelect =
                  !isPostedByFilter &&
                  (section.selectionType === "multiple" ||
                    MULTI_SELECT_KEYS.has(mappedKey));

                return (
                  <div
                    key={section.key}
                    ref={(el) => {
                      sectionRefs.current[section.key] = el;
                    }}
                    className="space-y-4"
                  >
                    <h3 className="text-sm font-semibold text-gray-900">
                      {section.label}
                    </h3>

                    {section.key === "Verified Properties" ? (
                      <Toggle
                        enabled={Boolean(currentValue)}
                        onChange={(val) => {
                          dispatch(
                            setAgriculturalFilter({
                              key: mappedKey,
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
                    ) : section.key === "Total Area" ? (
                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <select
                            value={carpetRange[0]}
                            onChange={(e) =>
                              updateTotalArea([Number(e.target.value), carpetRange[1]])
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
                              updateTotalArea([carpetRange[0], Number(e.target.value)])
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
                            updateTotalArea(values as [number, number])
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
                          {carpetRange[0]} - {carpetRange[1]} sqft
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {section.options?.map((opt) => {
                          const isStateRestrictions = mappedKey === "stateRestrictions";
                          const stateRestrictionValue = opt === "Applicable";
                          const postedByValue = isPostedByFilter
                            ? postedByLabelMap[opt as PostedByOption] ?? opt
                            : opt;
                          const selectedValues = Array.isArray(currentValue)
                            ? uniqueFilterValues(mappedKey, currentValue as string[])
                            : [];

                          const isActive = isStateRestrictions
                            ? currentValue === stateRestrictionValue
                            : isPostedByFilter
                              ? isCreatedByRoleSelected(postedByValue)
                              : isBooleanFilter
                                ? Boolean(currentValue)
                                : isMultiSelect
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
                              selectionType={isMultiSelect ? "multiple" : "single"}
                              showIndicator={isPostedByFilter}
                              onClick={() => {
                                const nextValue = isStateRestrictions
                                  ? stateRestrictionValue
                                  : isPostedByFilter
                                    ? isActive
                                      ? ""
                                      : postedByValue
                                    : isBooleanFilter
                                      ? !Boolean(currentValue)
                                      : isMultiSelect
                                        ? toggleFilterArrayValue(
                                            mappedKey,
                                            selectedValues,
                                            opt
                                          )
                                        : isActive
                                          ? ""
                                          : opt;
                                dispatch(
                                  setAgriculturalFilter({
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

export default AgriculturalFilters;
