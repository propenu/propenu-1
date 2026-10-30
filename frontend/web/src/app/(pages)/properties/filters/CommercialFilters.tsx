"use client";
import FilterDropdown from "@/ui/FilterDropdown";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/Redux/store";
import {
  selectCityWithLocalities,
  selectLocalitiesByCity,
} from "@/Redux/slice/citySlice";
import {
  resetCommercialFilters,
  setBudget,
  setCommercialFilter,
} from "@/Redux/slice/filterSlice";
import React, { useEffect, useRef, useState } from "react";
import {
  commercialMoreFilterSections,
  getBudgetConfig,
  snapBudgetRangeToOptions,
} from "../constants/constants";
import { getTrackBackground, Range } from "react-range";
import { CommercialFilterKey, MoreFilterSectionCom } from "@/types";
import { ArrowDropdownIcon } from "@/icons/icons";
import { getSelectedMoreFiltersCount } from "../count-helper/ResSelectedMoreFiltersCount";
import { commercialKeyMapping } from "@/types/commercial";
import Toggle from "@/ui/ToggleSwitch";
import { toast } from "sonner";
import SelectableButton from "@/ui/SelectableButton";
import { FiCheck, FiPlus, FiX } from "react-icons/fi";
import { formatLabel } from "@/utilies/formatLabel";
import {
  areFilterValuesEqual,
  toggleFilterArrayValue,
  uniqueFilterValues,
} from "./filterValueUtils";

const CARPET_MIN = 100;
const CARPET_MAX = 10000;

const carpetOptions = [
  100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000,
];

const COMMERCIAL_SUBTYPE_MAP: Record<string, string[]> = {
  office: ["bare-shell", "warm-shell", "business-center"],
  retail: ["high-street-shop", "mall-shop", "kiosk", "food-court-unit"],
  shop: ["high-street-shop", "shutter-shop", "mall-shop"],
  showroom: ["high-street-shop", "showroom-space"],
  warehouse: ["warehouse-godown", "logistics-hub", "cold-storage"],
  industrial: ["industrial-shed"],
  coworking: ["coworking-dedicated-desk", "coworking-hot-desk"],
  restaurant: ["food-court-unit"],
  clinic: ["clinic-space"],
};

const normalizeCommercialTypeToken = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

type CommercialPostedByOption = "Owners" | "Agents";

const CommercialFilters = () => {
  const dispatch = useDispatch();

  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = useRef(false);
  const programmaticScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const leftItemRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const [open, setOpen] = useState(false);
  const [activeFilter, setActiveFilter] =
    useState<CommercialFilterKey>("Commercial Type");
  const [budgetTouched, setBudgetTouched] = useState(false);

  const cityData = useSelector(selectCityWithLocalities);
  const localities = useSelector(selectLocalitiesByCity);
  const filtersState = useSelector((state: RootState) => state.filters);

  const { minPrice, maxPrice, commercial, listingTypeValue } = filtersState;
  const budgetConfig = getBudgetConfig(listingTypeValue);
  const { options: activeBudgetOptions, min: budgetMin, max: budgetMax, step: budgetStep, format: formatActiveBudget, title: budgetTitle } = budgetConfig;

  const { locality, createdByRole } = commercial;
  const localityList = Array.isArray(locality)
    ? locality
    : locality
      ? [locality]
      : [];

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

  const [carpetRange, setCarpetRange] = useState<[number, number]>([
    commercial.carpetArea?.min ?? CARPET_MIN,
    commercial.carpetArea?.max ?? CARPET_MAX,
  ]);
  const [builtUpRange, setBuiltUpRange] = useState<[number, number]>([
    commercial.builtUpArea?.min ?? CARPET_MIN,
    commercial.builtUpArea?.max ?? CARPET_MAX,
  ]);

  const postedByOptions: CommercialPostedByOption[] = ["Owners", "Agents"];
  const postedByLabelMap: Record<CommercialPostedByOption, string> = {
    Owners: "User",
    Agents: "Agent",
  };

  const normalizePostedByRole = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === "owners" || normalized === "owner") return "user";
    if (normalized === "agents") return "agent";
    return normalized;
  };

  const selectedCreatedByRole = Array.isArray(createdByRole)
    ? createdByRole[0] ?? ""
    : createdByRole
      ? String(createdByRole).split(",")[0]?.trim() ?? ""
      : "";

  const isCreatedByRoleSelected = (value: string) =>
    normalizePostedByRole(selectedCreatedByRole) === normalizePostedByRole(value);

  const localityLabel =
    localityList.length === 0
      ? "Select Locality"
      : localityList.length === 1
        ? localityList[0]
        : `${localityList.length} Localities`;


  const handleSectionClick = (key: CommercialFilterKey) => {
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

  const selectedMoreFiltersCount = getSelectedMoreFiltersCount(
    commercial,
    commercialKeyMapping
  );
  const localityCount = localityList.length > 0 ? 1 : 0;
  const listingTypeCount = listingTypeValue ? 1 : 0;
  const moreFiltersBadgeCount =
    selectedMoreFiltersCount + localityCount + listingTypeCount;

  const selectedCommercialTypes = Array.isArray(commercial.commercialType)
    ? uniqueFilterValues("commercialType", commercial.commercialType)
    : [];

  const commercialSubTypeOptions =
    selectedCommercialTypes.length === 0
      ? Array.from(new Set(Object.values(COMMERCIAL_SUBTYPE_MAP).flat()))
      : Array.from(
          selectedCommercialTypes.reduce((acc, type) => {
            const token = normalizeCommercialTypeToken(type);
            const options = COMMERCIAL_SUBTYPE_MAP[token] ?? [];
            options.forEach((opt) => acc.add(opt));
            return acc;
          }, new Set<string>())
        );

  const dynamicCommercialSections: MoreFilterSectionCom[] =
    commercialMoreFilterSections.map((section) =>
      section.key === "Commercial Sub Type"
        ? { ...section, options: commercialSubTypeOptions }
        : section
    );
  const appliedFilterChips = Array.from(
    new Set([
      ...(selectedCommercialTypes.length
        ? selectedCommercialTypes.map((value) => `Type: ${formatLabel(value)}`)
        : []),
      ...(Array.isArray(commercial.commercialSubType) &&
      commercial.commercialSubType.length
        ? uniqueFilterValues(
            "commercialSubType",
            commercial.commercialSubType,
          ).map((value) => `Sub type: ${formatLabel(value)}`)
        : []),
      ...(commercial.transactionType
        ? [`Sale: ${formatLabel(commercial.transactionType)}`]
        : []),
      ...(commercial.constructionStatus
        ? [`Status: ${formatLabel(commercial.constructionStatus)}`]
        : []),
      ...(commercial.builtUpArea?.min || commercial.builtUpArea?.max
        ? [
            `Built-up: ${commercial.builtUpArea?.min ?? CARPET_MIN}-${commercial.builtUpArea?.max ?? CARPET_MAX} sqft`,
          ]
        : []),
      ...(commercial.carpetArea?.min || commercial.carpetArea?.max
        ? [
            `Carpet: ${commercial.carpetArea?.min ?? CARPET_MIN}-${commercial.carpetArea?.max ?? CARPET_MAX} sqft`,
          ]
        : []),
      ...(Array.isArray(commercial.floorNumber) && commercial.floorNumber.length
        ? [`Floor: ${commercial.floorNumber.join(", ")}`]
        : []),
      ...(Array.isArray(commercial.totalFloors) && commercial.totalFloors.length
        ? [`Total floors: ${commercial.totalFloors.join(", ")}`]
        : []),
      ...(commercial.furnishingStatus
        ? [`Furnishing: ${formatLabel(commercial.furnishingStatus)}`]
        : []),
      ...(Array.isArray(commercial.parking) && commercial.parking.length
        ? uniqueFilterValues("parking", commercial.parking).map(
            (value) => `Parking: ${formatLabel(value)}`,
          )
        : typeof commercial.parking === "string" && commercial.parking
          ? [`Parking: ${formatLabel(commercial.parking)}`]
          : []),
      ...(Array.isArray(commercial.fireSafety) && commercial.fireSafety.length
        ? uniqueFilterValues("fireSafety", commercial.fireSafety).map(
            (value) => `Fire Safety: ${formatLabel(value)}`,
          )
        : []),
      ...(commercial.tenantAvailable &&
      ["yes", "true", "1"].includes(String(commercial.tenantAvailable).toLowerCase())
        ? ["Tenant Available"]
        : []),
      ...(commercial.priceNegotiable &&
      ["yes", "true", "1"].includes(String(commercial.priceNegotiable).toLowerCase())
        ? ["Price Negotiable"]
        : []),
      ...(Array.isArray(commercial.wallFinish) && commercial.wallFinish.length
        ? uniqueFilterValues("wallFinish", commercial.wallFinish).map(
            (value) => `Wall: ${formatLabel(value)}`,
          )
        : []),
      ...(Array.isArray(commercial.flooringType) && commercial.flooringType.length
        ? uniqueFilterValues("flooringType", commercial.flooringType).map(
            (value) => `Flooring: ${formatLabel(value)}`,
          )
        : []),
      ...(Array.isArray(commercial.amenities) && commercial.amenities.length
        ? uniqueFilterValues("amenities", commercial.amenities).map(
            (value) => `Amenity: ${formatLabel(value)}`,
          )
        : []),
      ...(commercial.postedSince
        ? [`Posted: ${formatLabel(commercial.postedSince)}`]
        : []),
      ...(Array.isArray(commercial.createdByRole)
        ? commercial.createdByRole.map((value) => `By: ${formatLabel(value)}`)
        : commercial.createdByRole
          ? [`By: ${formatLabel(commercial.createdByRole)}`]
          : []),
      ...(localityList.length
        ? localityList.map((value) => `Locality: ${value}`)
        : []),
      ...(minPrice != null || maxPrice != null
        ? [`Budget: ${budgetLabel}`]
        : []),
    ]),
  );
  const visibleAppliedFilterChips = appliedFilterChips.slice(0, 4);

  const commercialTypeLabel =
    selectedCommercialTypes.length === 0
      ? "Asset Type"
      : selectedCommercialTypes.length === 1
        ? selectedCommercialTypes[0]
        : `${selectedCommercialTypes.length} Types`;
  const commercialTypeOptions =
    commercialMoreFilterSections.find(
      (section) => section.key === "Commercial Type"
    )?.options ?? [];
  const handleClearAllFilters = () => {
    dispatch(resetCommercialFilters());
    dispatch(
      setBudget({
        min: null,
        max: null,
      }),
    );
    setBudgetTouched(false);
    setBudgetRange([null, null]);
    setCarpetRange([CARPET_MIN, CARPET_MAX]);
    setBuiltUpRange([CARPET_MIN, CARPET_MAX]);
  };

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
    // Only dispatch if values changed from default to prevent infinite loops
    if (carpetRange[0] !== CARPET_MIN || carpetRange[1] !== CARPET_MAX) {
      dispatch(
        setCommercialFilter({
          key: "carpetArea",
          value: {
            min: carpetRange[0],
            max: carpetRange[1],
          },
        })
      );
    }
  }, [carpetRange, dispatch]);

  useEffect(() => {
    if (builtUpRange[0] !== CARPET_MIN || builtUpRange[1] !== CARPET_MAX) {
      dispatch(
        setCommercialFilter({
          key: "builtUpArea",
          value: {
            min: builtUpRange[0],
            max: builtUpRange[1],
          },
        })
      );
    }
  }, [builtUpRange, dispatch]);

  useEffect(() => {
    const currentSubTypes = Array.isArray(commercial.commercialSubType)
      ? commercial.commercialSubType
      : [];

    if (currentSubTypes.length === 0) return;

    const nextSubTypes = currentSubTypes.filter((subType) =>
      commercialSubTypeOptions.some((opt) =>
        areFilterValuesEqual("commercialSubType", opt, subType)
      )
    );

    if (nextSubTypes.length !== currentSubTypes.length) {
      dispatch(
        setCommercialFilter({
          key: "commercialSubType",
          value: nextSubTypes,
        })
      );
    }
  }, [commercial.commercialSubType, commercialSubTypeOptions, dispatch]);

  useEffect(() => {
    const container = rightPanelRef.current;
    if (!container || !open) return;

    const updateActiveSection = () => {
      if (programmaticScrollRef.current) return;

      const containerRect = container.getBoundingClientRect();
      const containerTop = containerRect.top;
      const containerHeight = containerRect.height;
      const targetLine = containerTop + Math.min(containerHeight * 0.35, 140);
      let nextActive = dynamicCommercialSections[0]?.key ?? "Commercial Type";
      let smallestOffset = Number.POSITIVE_INFINITY;

      dynamicCommercialSections.forEach((section) => {
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
  }, [open, dynamicCommercialSections]);

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
          <div className="flex items-center justify-center">
            <span className="px-4 text-primary font-medium cursor-pointer whitespace-nowrap">
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
                <div className="flex max-h-120 gap-2 overflow-y-auto pr-1 flex-wrap">
                  {localities.map((loc: { name: string }) => {
                    const isSelected = localityList.includes(loc.name);

                    return (
                      <button
                        key={loc.name}
                        onClick={() => {
                          dispatch(
                            setCommercialFilter({
                              key: "locality",
                              value: toggleArrayValue(localityList, loc.name),
                            })
                          );
                        }}
                        className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${isSelected
                          ? "border-green-400 bg-green-100 text-green-700"
                          : "border-gray-300 bg-white hover:bg-gray-50"
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
                        setCommercialFilter({
                          key: "locality",
                          value: [],
                        })
                      );
                    }}
                    disabled={localityList.length === 0}
                    className={`flex items-center gap-1 text-sm font-medium ${localityList.length > 0
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

              <span className="flex items-center justify-center text-md text-gray-500 min-w-8">
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
                    setCommercialFilter({
                      key: "createdByRole",
                      value: nextValue,
                    })
                  );
                  close?.();
                }}
                className={`px-2 py-1 rounded block w-full cursor-pointer text-left ${isCreatedByRoleSelected(postedByLabelMap[opt]) ? "bg-[#D1EFDD] font-semibold text-[#15803D]" : "hover:bg-gray-100 text-gray-700"}`}
              >
                {opt}
              </button>
            ))}
            <button
              onClick={() => {
                dispatch(
                  setCommercialFilter({
                    key: "createdByRole",
                    value: "",
                  })
                );
                close?.();
              }}
              disabled={!selectedCreatedByRole}
              className={`mt-2 px-2 py-1 rounded block w-full text-left ${createdByRole
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
            <span className="truncate whitespace-nowrap">{commercialTypeLabel}</span>

            {selectedCommercialTypes.length > 0 && (
              <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">
                {selectedCommercialTypes.length}
              </span>
            )}
          </div>
        }
        width="w-72"
        align="left"
        renderContent={(close) => (
          <div className="space-y-3 p-3">
            <h4 className="text-sm font-semibold">Commercial Type</h4>

            <div className="flex flex-wrap gap-2">
              {commercialTypeOptions.map((option) => {
                const isActive = selectedCommercialTypes.some((item) =>
                  areFilterValuesEqual("commercialType", item, option)
                );

                return (
                  <button
                    key={option}
                    onClick={() => {
                      dispatch(
                        setCommercialFilter({
                          key: "commercialType",
                          value: toggleFilterArrayValue(
                            "commercialType",
                            selectedCommercialTypes,
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
                    setCommercialFilter({
                      key: "commercialType",
                      value: [],
                    })
                  )
                }
                disabled={selectedCommercialTypes.length === 0}
                className={`text-sm font-medium ${selectedCommercialTypes.length > 0
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
            {moreFiltersBadgeCount > 0 && (
              <span className="btn-primary text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                {moreFiltersBadgeCount}
              </span>
            )}

            <span className="text-sm font-semibold text-primary whitespace-nowrap">
              More Filters
            </span>
            <ArrowDropdownIcon
              size={12}
              color="#27AE60"
              className={`transition-transform duration-200  ${open ? "rotate-180" : "rotate-0"
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
              {dynamicCommercialSections?.map((section) => (
                <button
                  key={section.key}
                  ref={(el) => {
                    leftItemRefs.current[section.key] = el;
                  }}
                  onClick={() => {
                    handleSectionClick(section.key);
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-200 cursor-pointer   ${activeFilter === section.key
                    ? " font-semibold text-primary"
                    : "hover:bg-gray-50"
                    }`}
                >
                  {section.label}
                </button>
              ))}
            </div>

            {/* Right panel */}
            {/* Right panel */}
            <div
              ref={rightPanelRef}
              className="flex-1 p-6 overflow-y-auto space-y-10"
            >
              {dynamicCommercialSections.map((section) => {
                const mappedKey = commercialKeyMapping[section.key];
                const currentValue = commercial[mappedKey];

                return (
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

                    {/* VERIFIED PROPERTIES (TOGGLE) */}
                    {section.key === "Verified Properties" ? (
                      <Toggle
                        enabled={Boolean(currentValue)}
                        onChange={(val) => {
                          dispatch(
                            setCommercialFilter({
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
                    ) : section.key === "Carpet Area" || section.key === "Built-up Area" ? (
                      /* AREA */
                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <select
                            value={
                              section.key === "Built-up Area"
                                ? builtUpRange[0]
                                : carpetRange[0]
                            }
                            onChange={(e) => {
                              const nextRange: [number, number] = [
                                Number(e.target.value),
                                section.key === "Built-up Area"
                                  ? builtUpRange[1]
                                  : carpetRange[1],
                              ];

                              if (section.key === "Built-up Area") {
                                setBuiltUpRange(nextRange);
                              } else {
                                setCarpetRange(nextRange);
                              }
                            }}
                            className="w-1/2 cursor-pointer border rounded-md px-3 py-2 text-sm"
                          >
                            {carpetOptions.map((v) => (
                              <option key={v} value={v}>
                                Min {v} sqft
                              </option>
                            ))}
                          </select>

                          <select
                            value={
                              section.key === "Built-up Area"
                                ? builtUpRange[1]
                                : carpetRange[1]
                            }
                            onChange={(e) => {
                              const nextRange: [number, number] = [
                                section.key === "Built-up Area"
                                  ? builtUpRange[0]
                                  : carpetRange[0],
                                Number(e.target.value),
                              ];

                              if (section.key === "Built-up Area") {
                                setBuiltUpRange(nextRange);
                              } else {
                                setCarpetRange(nextRange);
                              }
                            }}
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
                          values={
                            section.key === "Built-up Area"
                              ? builtUpRange
                              : carpetRange
                          }
                          onChange={(values) => {
                            const nextRange = values as [number, number];
                            if (section.key === "Built-up Area") {
                              setBuiltUpRange(nextRange);
                            } else {
                              setCarpetRange(nextRange);
                            }
                          }}
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
                          {section.key === "Built-up Area"
                            ? builtUpRange[0]
                            : carpetRange[0]}{" "}
                          –{" "}
                          {section.key === "Built-up Area"
                            ? builtUpRange[1]
                            : carpetRange[1]}{" "}
                          sqft
                        </div>
                      </div>
                    ) : (
                      /* OPTIONS */
                      <div className="flex flex-wrap gap-3">
                        {section.key === "Commercial Sub Type" &&
                          (section.options?.length ?? 0) === 0 ? (
                          <p className="text-sm text-gray-500">
                            Select Commercial Type first
                          </p>
                        ) : null}
                        {section.options?.map((opt) => {
                          const postedByValue =
                            mappedKey === "createdByRole"
                              ? postedByLabelMap[opt as CommercialPostedByOption] ?? opt
                              : opt;
                          const selectedValues = Array.isArray(currentValue)
                            ? uniqueFilterValues(mappedKey, currentValue as string[])
                            : [];
                          const isActive =
                            mappedKey === "createdByRole"
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
                                mappedKey === "createdByRole"
                                  ? postedByValue.toLowerCase() === "user"
                                    ? "Owner"
                                    : postedByValue
                                  : formatLabel(opt)
                              }
                              active={isActive}
                              selectionType={section.selectionType ?? "single"}
                              onClick={() => {
                                const nextValue =
                                  mappedKey === "createdByRole"
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
                                  setCommercialFilter({
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

export default CommercialFilters;
