"use client";
import React, { useEffect, useRef, useState } from "react";
import { getTrackBackground, Range } from "react-range";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/Redux/store";
import {
  resetResidentialFilters,
  setBudget,
  setResidentialFilter,
} from "@/Redux/slice/filterSlice";
import { BedroomFilterValue } from "@/types/sharedTypes";
import FilterDropdown from "@/ui/FilterDropdown";
import {
  BedroomOption,
  PostedByOption,
  residentialKeyMapping,
} from "@/types/residential";
import {
  selectCityWithLocalities,
  selectLocalitiesByCity,
} from "@/Redux/slice/citySlice";
import { RESFilterKey } from "@/types";
import {
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_STEP,
  budgetOptions,
  rentBudgetOptions,
  RENT_BUDGET_MIN,
  RENT_BUDGET_MAX,
  RENT_BUDGET_STEP,
  CARPET_MAX,
  CARPET_MIN,
  carpetOptions,
  formatBudget,
  formatRentBudget,
  snapBudgetRangeToOptions,
  moreFilterSections,
} from "../constants/constants";
import { ArrowDropdownIcon } from "@/icons/icons";
import SelectableButton from "@/ui/SelectableButton";
import { getSelectedMoreFiltersCount } from "../count-helper/ResSelectedMoreFiltersCount";
import { FiCheck, FiPlus, FiX } from "react-icons/fi";
import { formatLabel } from "@/utilies/formatLabel";

const ResidentialFilters = () => {
  const dispatch = useDispatch();

  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = useRef(false);
  const programmaticScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cityData = useSelector(selectCityWithLocalities);
  const localities = useSelector(selectLocalitiesByCity);
  const filtersState = useSelector((state: RootState) => state.filters);
  const { minPrice, maxPrice, residential, listingTypeValue } = filtersState;
  const isRent = listingTypeValue === "rent";
  const activeBudgetOptions = isRent ? rentBudgetOptions : budgetOptions;
  const budgetMin = isRent ? RENT_BUDGET_MIN : BUDGET_MIN;
  const budgetMax = isRent ? RENT_BUDGET_MAX : BUDGET_MAX;
  const budgetStep = isRent ? RENT_BUDGET_STEP : BUDGET_STEP;
  const formatActiveBudget = isRent ? formatRentBudget : formatBudget;
  const [budgetTouched, setBudgetTouched] = useState(false);

  const { locality, bedrooms, createdByRole } = residential;
  const [open, setOpen] = useState(false);
  const [activeFilter, setActiveFilter] =
    useState<RESFilterKey>("Property Type");

  const sectionRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const leftItemRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const POSTED_BY_MAP: Record<PostedByOption, string> = {
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

  const keyMapping: Record<RESFilterKey, keyof typeof residential> = {
    "Property Type": "propertyType",
    "Sales Type": "transactionType",
    "Covered Area": "coveredArea",
    "Possession Status": "constructionStatus",
    Bathroom: "bathroom",
    Balcony: "balcony",
    Parking: "parking",
    Furnishing: "furnishing",
    Amenities: "amenities",
    Facing: "facing",
    "Posted Since": "postedSince",
    "Posted By": "createdByRole",
  };

  const [carpetRange, setCarpetRange] = useState<[number, number]>([
    CARPET_MIN,
    CARPET_MAX,
  ]);

  const updateCoveredAreaRange = (range: [number, number]) => {
    setCarpetRange(range);
    dispatch(
      setResidentialFilter({
        key: "coveredArea",
        value: {
          min: range[0] === CARPET_MIN ? undefined : range[0],
          max: range[1] === CARPET_MAX ? undefined : range[1],
        },
      }),
    );
  };

  const handleClearAllFilters = () => {
    dispatch(resetResidentialFilters());
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

  const localityLabel =
    !locality || locality.length === 0
      ? "Select Locality"
      : locality.length === 1
        ? locality[0]
        : `${locality.length} Localities`;

  /* -------------------- BEDROOMS -------------------- */

  const bedroomOptions: BedroomOption[] = [
    "1 BHK",
    "2 BHK",
    "3 BHK",
    "4 BHK",
    "5 BHK",
    "6 BHK",
    "6+ BHK",
  ];

  const getBedroomValue = (value: BedroomOption): BedroomFilterValue =>
    value === "6+ BHK" ? "6+" : Number(value.split(" ")[0]);

  const selectedBedrooms = Array.isArray(bedrooms) ? bedrooms : [];
  const formatBedroomValue = (value: BedroomFilterValue) => String(value);
  const isBedroomSelected = (value: BedroomFilterValue) =>
    selectedBedrooms.some((selected) => String(selected) === String(value));
  const toggleBedroomValue = (value: BedroomFilterValue) => {
    const currentValues = selectedBedrooms.map(String);
    const nextValues = currentValues.includes(String(value))
      ? currentValues.filter((selected) => selected !== String(value))
      : [...currentValues, String(value)];

    return nextValues.map((token) =>
      token === "6+" ? token : Number(token),
    ) as BedroomFilterValue[];
  };

  const bedroomLabel =
    selectedBedrooms.length === 0
      ? "BHK"
      : selectedBedrooms.length === 1
        ? `${formatBedroomValue(selectedBedrooms[0])} BHK`
        : selectedBedrooms.length === 2
          ? `${selectedBedrooms.map(formatBedroomValue).join(", ")} BHK`
          : `${selectedBedrooms.slice(0, 2).map(formatBedroomValue).join(", ")} +${selectedBedrooms.length - 2} BHK`;

  /* -------------------- BUDGET -------------------- */
  const [budgetRange, setBudgetRange] = useState<
    [number | null, number | null]
  >([minPrice ?? null, maxPrice ?? null]);

  useEffect(() => {
    setBudgetRange([minPrice ?? null, maxPrice ?? null]);
  }, [minPrice, maxPrice]);

  const budgetLabel =
    budgetRange[0] == null && budgetRange[1] == null
      ? isRent ? "Monthly rent" : "Budget"
      : `${budgetRange[0] ? formatActiveBudget(budgetRange[0]) : "Min"} - ${
          budgetRange[1] ? formatActiveBudget(budgetRange[1]) : "Max"
        }`;

  const postedByOptions: PostedByOption[] = ["Owners", "Agents", "Builders"];

  const handleSectionClick = (key: RESFilterKey) => {
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

  const normalizeResidentialOptionValue = (
    key: keyof typeof residential,
    value: string,
  ) => {
    if (key === "furnishing") {
      return value.trim().toLowerCase().replace(/\s+/g, "-");
    }

    if (key === "facing") {
      return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
    }

    return value;
  };

  const areResidentialOptionValuesEqual = (
    key: keyof typeof residential,
    left: string,
    right: string,
  ) =>
    normalizeResidentialOptionValue(key, left) ===
    normalizeResidentialOptionValue(key, right);

  const toggleResidentialArrayValue = (
    key: keyof typeof residential,
    arr: string[] = [],
    value: string,
  ) => {
    const normalizedValue = normalizeResidentialOptionValue(key, value);
    const hasValue = arr.some((item) =>
      areResidentialOptionValuesEqual(key, item, normalizedValue),
    );

    if (hasValue) {
      return arr.filter(
        (item) => !areResidentialOptionValuesEqual(key, item, normalizedValue),
      );
    }

    return [
      ...arr.filter(
        (item, index, source) =>
          source.findIndex((candidate) =>
            areResidentialOptionValuesEqual(key, candidate, item),
          ) === index,
      ),
      normalizedValue,
    ];
  };

  const getUniqueResidentialValues = (
    key: keyof typeof residential,
    values: string[] = [],
  ) =>
    values.filter(
      (value, index, source) =>
        source.findIndex((candidate) =>
          areResidentialOptionValuesEqual(key, candidate, value),
        ) === index,
    );

  const formatResidentialFilterValue = (
    key: keyof typeof residential,
    value: string,
  ) => {
    if (key === "facing") {
      const labelMap: Record<string, string> = {
        east: "East",
        west: "West",
        north: "North",
        south: "South",
        northeast: "North East",
        northwest: "North West",
        southeast: "South East",
        southwest: "South West",
      };

      return labelMap[normalizeResidentialOptionValue(key, value)] ?? formatLabel(value);
    }

    return formatLabel(value);
  };

  const selectedMoreFiltersCount = getSelectedMoreFiltersCount(
    residential,
    residentialKeyMapping,
  );
  const localityCount = Array.isArray(locality) && locality.length > 0 ? 1 : 0;
  const listingTypeCount = listingTypeValue ? 1 : 0;
  const moreFiltersBadgeCount =
    selectedMoreFiltersCount + localityCount + listingTypeCount;
  const appliedFilterChips = Array.from(
    new Set([
      ...(Array.isArray(residential.propertyType) && residential.propertyType.length
        ? residential.propertyType.map((value) => `Type: ${formatLabel(value)}`)
        : []),
      ...(residential.transactionType
        ? [`Sale: ${formatLabel(residential.transactionType)}`]
        : []),
      ...(residential.constructionStatus
        ? [`Status: ${formatLabel(residential.constructionStatus)}`]
        : []),
      ...(selectedBedrooms.length
        ? [`BHK: ${selectedBedrooms.map(formatBedroomValue).join(", ")}`]
        : []),
      ...(residential.coveredArea?.min || residential.coveredArea?.max
        ? [
            `Area: ${residential.coveredArea?.min ?? CARPET_MIN}-${residential.coveredArea?.max ?? CARPET_MAX} sqft`,
          ]
        : []),
      ...(Array.isArray(residential.bathroom) && residential.bathroom.length
        ? residential.bathroom.map((val) => `Bath: ${val}`)
        : []),
      ...(Array.isArray(residential.balcony) && residential.balcony.length
        ? residential.balcony.map((val) => `Balcony: ${val}`)
        : []),
      ...(Array.isArray(residential.parking) && residential.parking.length
        ? residential.parking.map((val) => `Parking: ${val}`)
        : []),
      ...(residential.furnishing
        ? [`Furnishing: ${formatResidentialFilterValue("furnishing", residential.furnishing)}`]
        : []),
      ...(Array.isArray(residential.amenities) && residential.amenities.length
        ? residential.amenities.map((value) => `Amenity: ${formatLabel(value)}`)
        : []),
      ...(Array.isArray(residential.facing) && residential.facing.length
        ? getUniqueResidentialValues("facing", residential.facing).map(
            (value) => `Facing: ${formatResidentialFilterValue("facing", value)}`,
          )
        : []),
      ...(residential.postedSince
        ? [`Posted: ${formatLabel(residential.postedSince)}`]
        : []),
      ...(selectedCreatedByRole ? [`By: ${formatLabel(selectedCreatedByRole)}`] : []),
      ...(Array.isArray(locality) && locality.length
        ? locality.map((value) => `Locality: ${value}`)
        : []),
      ...(minPrice != null || maxPrice != null
        ? [`Budget: ${budgetLabel}`]
        : []),
    ]),
  );
  const visibleAppliedFilterChips = appliedFilterChips.slice(0, 4);
  /* -------------------- MORE FILTER CONFIG -------------------- */

  useEffect(() => {
    if (!budgetTouched) return;

    dispatch(
      setBudget({
        min: budgetRange[0] ?? null,
        max: budgetRange[1] ?? null,
      }),
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
      let nextActive = moreFilterSections[0]?.key ?? "Property Type";
      let smallestOffset = Number.POSITIVE_INFINITY;

      moreFilterSections.forEach((section) => {
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
    <>
      {/* ==================== FILTER BAR ==================== */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 xl:flex-nowrap">
        {/* ---------- Localities ---------- */}
        <FilterDropdown
          triggerLabel={
            <div className="flex justify-center items-center">
              <span className="px-4 text-primary font-medium cursor-pointer">
                {localityLabel}
              </span>
            </div>
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
                  {/* Locality Pills */}
                  <div className="flex max-h-120 gap-2 overflow-y-auto pr-1 flex-wrap">
                    {localities.map((loc: { name: string }) => {
                      const isSelected =
                        Array.isArray(locality) && locality.includes(loc.name);

                      return (
                        <button
                          key={loc.name}
                          onClick={() => {
                            dispatch(
                              setResidentialFilter({
                                key: "locality",
                                value: toggleArrayValue(
                                  locality || [],
                                  loc.name,
                                ),
                              }),
                            );
                          }}
                          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition cursor-pointer ${
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

                  {/* Footer Actions */}
                  <div className="flex justify-between items-center mt-4">
                    {/* Clear All */}
                    <button
                      onClick={() => {
                        dispatch(
                          setResidentialFilter({
                            key: "locality",
                            value: [],
                          }),
                        );
                      }}
                      disabled={!locality || locality.length === 0}
                      className={`flex items-center gap-1 text-sm font-medium ${
                        locality && locality.length > 0
                          ? "text-red-500 hover:underline cursor-pointer"
                          : "text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      <FiX />
                      Clear All
                    </button>

                    {/* Done */}
                    <button
                      onClick={close}
                      className="text-green-600 font-semibold text-sm hover:underline cursor-pointer"
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
          triggerLabel={
            <span className="px-4 text-primary font-medium cursor-pointer">
              {budgetLabel}
            </span>
          }
          width="w-[320px]"
          align="left"
          renderContent={() => (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold">{isRent ? "Monthly rent" : "Budget"}</h4>

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
                  className="w-1/2 border border-gray-400 rounded-md px-3 py-2 text-sm 
           focus:outline-none focus:ring-0 focus:border-gray-400
           hover:border-gray-400 active:border-gray-400 cursor-pointer"
                >
                  <option value="">Min</option>
                  {activeBudgetOptions
                    .filter((v) => budgetRange[1] === null || v <= budgetRange[1])
                    .map((v) => (
                    <option key={v} value={v} disabled={budgetRange[1] !== null && v > budgetRange[1]} className="cursor-pointer">
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
                  className="w-1/2 border border-gray-400 rounded-md px-3 py-2 text-sm 
           focus:outline-none focus:ring-0 focus:border-gray-400
           hover:border-gray-400 active:border-gray-400 cursor-pointer"
                >
                  <option value="">Max</option>
                  {activeBudgetOptions
                    .filter((v) => budgetRange[0] === null || v >= budgetRange[0])
                    .map((v) => (
                    <option key={v} value={v} disabled={budgetRange[0] !== null && v < budgetRange[0]} className="cursor-pointer">
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
                      className="h-4 w-4 bg-green-600 rounded-full shadow"
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

        {/* ---------- Bedrooms ---------- */}
        <FilterDropdown
          key={selectedBedrooms.join(",")}
          triggerLabel={
            <span className="px-4 text-primary font-medium cursor-pointer">
              {bedroomLabel}
            </span>
          }
          width="w-86"
          renderContent={() => (
            <div>
              <h4 className="text-sm font-semibold mb-2">Bedrooms</h4>
              <div className="flex gap-2 flex-wrap">
                {bedroomOptions.map((opt) => {
                  const value = getBedroomValue(opt);
                  const isSelected = isBedroomSelected(value);
                    return (
                      <SelectableButton
                        key={opt}
                        label={opt}
                        active={isSelected}
                        selectionType="multiple"
                        onClick={() => {
                          dispatch(
                            setResidentialFilter({
                              key: "bedrooms",
                              value: toggleBedroomValue(value),
                            }),
                          );
                        }}
                      />
                    );
                })}
              </div>
            </div>
          )}
        />

        {/* ---------- Posted By ---------- */}
        <FilterDropdown
          triggerLabel={
            <span className="px-4 font-medium text-primary cursor-pointer">
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
                    const mappedValue = POSTED_BY_MAP[opt];
                    dispatch(
                      setResidentialFilter({
                        key: "createdByRole",
                        value: isCreatedByRoleSelected(mappedValue) ? "" : mappedValue,
                      }),
                    );
                  }}
                  className={`px-2 py-1 rounded block w-full text-left cursor-pointer ${
                    isCreatedByRoleSelected(POSTED_BY_MAP[opt])
                      ? "bg-[#D1EFDD] font-semibold text-[#15803D]"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  {opt}
                </button>
              ))}
              <button
                onClick={() => {
                  dispatch(
                    setResidentialFilter({
                      key: "createdByRole",
                      value: "",
                    }),
                  );
                  close?.();
                }}
                disabled={!selectedCreatedByRole}
                className={`mt-2 px-2 py-1 rounded block w-full text-left ${
                  selectedCreatedByRole
                    ? "text-red-500 hover:bg-red-50"
                    : "text-gray-400 cursor-not-allowed"
                }`}
              >
                Clear
              </button>
            </div>
          )}
        />

        {/* ---------- MORE FILTER MODAL ---------- */}
        <FilterDropdown
          open={open}
          onOpenChange={(next) => setOpen(next)}
          triggerLabel={
            <div className="flex text-primary items-center gap-2 px-2 py-2 rounded-xl border bg-white cursor-pointer">
              <span className="btn-primary text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                {moreFiltersBadgeCount}
              </span>

              <span className="text-sm font-semibold text-primary">
                More Filters
              </span>
              <ArrowDropdownIcon
                size={12}
                color="#27AE60"
                className={`transition-transform duration-200  ${
                  open ? "rotate-180" : "rotate-0"
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
              {/* Left panel */}
              <div
                ref={leftPanelRef}
                className="w-1/3 border-r border-gray-200 overflow-y-auto"
              >
                {moreFilterSections?.map((section) => (
                  <button
                    key={section.key}
                    ref={(el) => {
                      leftItemRefs.current[section.key] = el;
                    }}
                    onClick={() => {
                      handleSectionClick(section.key);
                      setActiveFilter(section.key);
                    }}
                    className={`w-full text-left px-4 py-3 border-b border-gray-200 cursor-pointer   ${
                      activeFilter === section.key
                        ? " font-semibold text-primary"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>

              {/* Right panel */}
              <div
                ref={rightPanelRef}
                className="flex-1 p-6 overflow-y-auto space-y-10"
              >
                {moreFilterSections.map((section) => (
                  <div
                    key={section.key}
                    ref={(el) => {
                      sectionRefs.current[section.key] = el;
                    }}
                    className="space-y-4"
                  >
                    {/* SECTION HEADING */}
                    <h3 className="text-sm font-semibold text-gray-900">
                      {section.label}
                    </h3>

                    {/* SECTION CONTENT */}
                    {section.key === "Covered Area" ? (
                      <div className="space-y-4 cursor-pointer">
                        {/* Min / Max dropdowns */}
                        <div className="flex gap-3">
                          <select
                            value={carpetRange[0]}
                            onChange={(e) =>
                              updateCoveredAreaRange([
                                Number(e.target.value),
                                carpetRange[1],
                              ])
                            }
                            className="w-1/2 border rounded-md px-3 py-2 text-sm"
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
                              updateCoveredAreaRange([
                                carpetRange[0],
                                Number(e.target.value),
                              ])
                            }
                            className="w-1/2 border rounded-md px-3 py-2 text-sm"
                          >
                            {carpetOptions.map((v) => (
                              <option key={v} value={v}>
                                Max {v} sqft
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Range Slider */}
                        <Range
                          step={50}
                          min={CARPET_MIN}
                          max={CARPET_MAX}
                          values={carpetRange}
                          onChange={(values) =>
                            updateCoveredAreaRange(values as [number, number])
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
                                className="h-4 w-4 bg-green-600 rounded-full shadow"
                              />
                            );
                          }}
                        />

                        <div className="text-xs text-gray-500">
                          {carpetRange[0]} – {carpetRange[1]} sqft
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {section.options?.map((opt) => {
                          const mappedKey = keyMapping[section.key];
                          const currentValue = residential[mappedKey];
                          const currentValues = Array.isArray(currentValue)
                            ? (currentValue as string[])
                            : currentValue
                              ? [String(currentValue)]
                              : [];
                          const filterValue =
                            mappedKey === "createdByRole"
                              ? POSTED_BY_MAP[opt as PostedByOption] ?? opt
                              : normalizeResidentialOptionValue(mappedKey, opt);
                          const isActive =
                            mappedKey === "createdByRole"
                              ? isCreatedByRoleSelected(filterValue)
                              : section.selectionType === "multiple"
                                ? currentValues.some((value) =>
                                    areResidentialOptionValuesEqual(
                                      mappedKey,
                                      value,
                                      filterValue,
                                    ),
                                  )
                                : currentValue
                                  ? areResidentialOptionValuesEqual(
                                      mappedKey,
                                      String(currentValue),
                                      filterValue,
                                    )
                                  : false;

                          return (
                            <SelectableButton
                              key={opt}
                              label={
                                mappedKey === "createdByRole"
                                  ? opt === "Owners" || filterValue.toLowerCase() === "user"
                                    ? "Owner"
                                    : opt
                                  : formatLabel(opt)
                              }
                              active={isActive}
                              selectionType={section.selectionType ?? "single"}
                              onClick={() => {
                                dispatch(
                                  setResidentialFilter({
                                    key: mappedKey,
                                    value:
                                      mappedKey === "createdByRole"
                                        ? isActive
                                          ? ""
                                          : filterValue
                                        : section.selectionType === "multiple"
                                          ? toggleResidentialArrayValue(
                                              mappedKey,
                                              currentValues,
                                              filterValue,
                                            )
                                          : isActive
                                            ? ""
                                            : filterValue,
                                  }),
                                );
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            </div>
          )}
        />
      </div>
    </>
  );
};

export default ResidentialFilters;


