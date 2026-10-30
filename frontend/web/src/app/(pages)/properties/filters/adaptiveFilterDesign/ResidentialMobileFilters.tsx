"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { IoIosSearch } from "react-icons/io";
import {
  IoChevronBackOutline,
  IoChevronDownOutline,
  IoChevronUpOutline,
} from "react-icons/io5";
import { getTrackBackground, Range } from "react-range";
import { useDispatch } from "react-redux";
import { useAppSelector } from "@/Redux/store";
import { selectCityWithLocalities } from "@/Redux/slice/citySlice";
import {
  categoryOption,
  resetResidentialFilters,
  setBudget,
  setCategory,
  setListingType,
  setResidentialFilter,
  setSearchText,
} from "@/Redux/slice/filterSlice";
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
  moreFilterSections,
} from "../../constants/constants";
import { BedroomOption } from "@/types/residential";
import { formatLabel } from "@/utilies/formatLabel";
import { BedroomFilterValue, ResidentialFilters } from "@/types/sharedTypes";
import SelectableButton from "@/ui/SelectableButton";
import SearchBox from "@/components/SearchBox";

type ListingOption = {
  label: "Buy" | "Rent";
  value: "sale" | "rent";
};

type ResidentialMobileFiltersProps = {
  open: boolean;
  onClose: () => void;
  listingOptions: readonly ListingOption[];
  categoryOptions: readonly categoryOption[];
};

const POSTED_BY_OPTIONS = ["Owners", "Agents", "Builders"] as const;
const POSTED_BY_MAP: Record<(typeof POSTED_BY_OPTIONS)[number], string> = {
  Owners: "User",
  Agents: "Agent",
  Builders: "Builder",
};
const MOBILE_MENU_STATE_EVENT = "propenu:mobile-menu-state";

const getCategoryLabel = (value: categoryOption) =>
  value === "Land" ? "Plots" : value;

const keyMapping: Record<RESFilterKey, keyof ResidentialFilters> = {
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

const ResidentialMobileFilters: React.FC<ResidentialMobileFiltersProps> = ({
  open,
  onClose,
  listingOptions,
  categoryOptions,
}) => {
  const dispatch = useDispatch();
  const cityData = useAppSelector(selectCityWithLocalities);
  const { listingTypeLabel, category, searchText, minPrice, maxPrice, residential } =
    useAppSelector((s) => s.filters);
  const isRent = listingTypeLabel === "Rent";
  const previousListingType = useRef(listingTypeLabel);
  const activeBudgetOptions = isRent ? rentBudgetOptions : budgetOptions;
  const budgetMin = isRent ? RENT_BUDGET_MIN : BUDGET_MIN;
  const budgetMax = isRent ? RENT_BUDGET_MAX : BUDGET_MAX;
  const budgetStep = isRent ? RENT_BUDGET_STEP : BUDGET_STEP;
  const formatActiveBudget = isRent ? formatRentBudget : formatBudget;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeFilter, setActiveFilter] = useState<RESFilterKey>("Property Type");
  const [budgetRange, setBudgetRange] = useState<[number | null, number | null]>([
    minPrice ?? null,
    maxPrice ?? null,
  ]);

  useEffect(() => {
    if (previousListingType.current === listingTypeLabel) return;
    previousListingType.current = listingTypeLabel;
    setBudgetRange([null, null]);
    dispatch(setBudget({ min: null, max: null }));
  }, [dispatch, listingTypeLabel]);
  const [carpetRange, setCarpetRange] = useState<[number, number]>([
    residential.coveredArea?.min ?? CARPET_MIN,
    residential.coveredArea?.max ?? CARPET_MAX,
  ]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(MOBILE_MENU_STATE_EVENT, {
        detail: { open },
      }),
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent(MOBILE_MENU_STATE_EVENT, {
          detail: { open: false },
        }),
      );
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const navbar = document.querySelector(
      'nav[aria-label="Main navigation"]',
    ) as HTMLElement | null;
    const previousNavbarDisplay = navbar?.style.display;

    document.body.style.overflow = "hidden";
    if (navbar) {
      navbar.style.display = "none";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      if (navbar) {
        navbar.style.display = previousNavbarDisplay ?? "";
      }
    };
  }, [open]);

  useEffect(() => {
    setBudgetRange([minPrice ?? null, maxPrice ?? null]);
  }, [minPrice, maxPrice]);

  useEffect(() => {
    dispatch(
      setResidentialFilter({
        key: "coveredArea",
        value: {
          min: carpetRange[0] === CARPET_MIN ? undefined : carpetRange[0],
          max: carpetRange[1] === CARPET_MAX ? undefined : carpetRange[1],
        },
      }),
    );
  }, [carpetRange, dispatch]);

  const selectedLocalities = Array.isArray(residential.locality) ? residential.locality : [];

  const localitySuggestions = useMemo(() => {
    const names =
      cityData?.localities
        ?.map((loc) => loc?.name?.trim())
        .filter((name): name is string => Boolean(name)) ?? [];

    const query = searchText.trim().toLowerCase();
    if (!query) return names.slice(0, 8);

    const startsWith = names.filter((name) => name.toLowerCase().startsWith(query));
    const includes = names.filter(
      (name) =>
        !name.toLowerCase().startsWith(query) && name.toLowerCase().includes(query),
    );

    return [...startsWith, ...includes].slice(0, 8);
  }, [cityData, searchText]);

  const normalizePostedByRole = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === "owners" || normalized === "owner") return "user";
    if (normalized === "agents") return "agent";
    if (normalized === "builders") return "builder";
    return normalized;
  };

  const selectedPostedByValue = useMemo(() => {
    const source = residential.createdByRole;
    return Array.isArray(source)
      ? source[0] ?? ""
      : source
        ? String(source).split(",")[0]?.trim() ?? ""
        : "";
  }, [residential.createdByRole]);

  const isPostedBySelected = (value: string) =>
    normalizePostedByRole(selectedPostedByValue) === normalizePostedByRole(value);

  const selectedPostedBy = useMemo(
    () =>
      POSTED_BY_OPTIONS.filter((option) =>
        isPostedBySelected(POSTED_BY_MAP[option]),
      ),
    [selectedPostedByValue],
  );

  const selectedBedrooms = Array.isArray(residential.bedrooms)
    ? residential.bedrooms
    : [];
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

  const toggleArrayValue = (arr: string[] = [], value: string) =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const normalizeResidentialOptionValue = (
    key: keyof ResidentialFilters,
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
    key: keyof ResidentialFilters,
    left: string,
    right: string,
  ) =>
    normalizeResidentialOptionValue(key, left) ===
    normalizeResidentialOptionValue(key, right);

  const toggleResidentialArrayValue = (
    key: keyof ResidentialFilters,
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

  const handleLocalitySelect = (name: string) => {
    dispatch(
      setResidentialFilter({
        key: "locality",
        value: toggleArrayValue(selectedLocalities, name),
      }),
    );
    dispatch(setSearchText(""));
  };

  const applyBudget = (next: [number | null, number | null]) => {
    setBudgetRange(next);
    dispatch(
      setBudget({
        min: next[0] ?? null,
        max: next[1] ?? null,
      }),
    );
  };

  const handleClear = () => {
    dispatch(resetResidentialFilters());
    dispatch(setSearchText(""));
    dispatch(setBudget({ min: null, max: null }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f5f6f5] lg:hidden">
      <div className="shrink-0 flex items-center justify-between border-b border-gray-200 bg-white px-2 py-5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="rounded-full transition-colors hover:bg-gray-100 active:bg-gray-200"
          >
            <IoChevronBackOutline className="h-6 w-6 text-gray-700" />
          </button>
          <h2 className="font-bold text-gray-900">Filters</h2>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="text-sm font-semibold text-green-600 transition-colors hover:text-green-700 active:text-green-800 pr-2"
        >
          Reset
        </button>
      </div>


      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 pb-6">
        <div>
          <h3 className="mb-3 text-lg font-semibold">Listing Type</h3>
          <div className="flex gap-3">
            {listingOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  dispatch(setListingType({ label: option.label, value: option.value }))
                }
                className={`rounded-xl border px-6 py-2 text-sm ${listingTypeLabel === option.label
                  ? "border-green-600 bg-[#d8ece0] font-semibold text-green-700"
                  : "border-gray-300 bg-white"
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-lg font-semibold">Property Type</h3>
          <div className="grid grid-cols-3 gap-2">
            {categoryOptions.map((type) => {
              const active = category === type;

              return (
                <label
                  key={type}
                  className="flex cursor-pointer items-center gap-3 text-sm text-gray-900"
                >
                  <input
                    type="radio"
                    name="property-category"
                    value={type}
                    checked={active}
                    onChange={() => {
                      dispatch(setCategory(type));
                      if (type !== "Residential") onClose();
                    }}
                    className="sr-only"
                  />

                  {/* Custom Styled Circle */}
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${active ? "border-green-600" : "border-gray-400"
                      }`}
                  >
                    {active && (
                      <span className="h-3 w-3 rounded-full bg-green-600" />
                    )}
                  </span>

                  {getCategoryLabel(type)}
                </label>
              );
            })}
          </div>

        </div>

        <div>
          <h3 className="mb-3 text-lg font-semibold">City / Locality</h3>
          <SearchBox hideOnMobile={false} mobileMode searchOnly />

          <h4 className="mb-3 mt-5 text-lg font-semibold">
            Localities in {cityData?.city ?? "City"}
          </h4>
          <div className="flex flex-wrap gap-2">
            {localitySuggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => handleLocalitySelect(name)}
                className={`rounded-xl px-3 py-2 text-sm ${selectedLocalities.includes(name)
                  ? "bg-[#d8ece0] text-green-700"
                  : "bg-[#e1eae4] text-gray-900"
                  }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-lg font-semibold text-gray-900">{isRent ? "Monthly rent" : "Budget"}</h3>

          {/* Min / Max Dropdowns */}
          <div className="grid grid-cols-2 gap-3">
            {/* Minimum */}
            <select
              value={budgetRange[0] ?? ""}
              onChange={(e) => {
                const newMin = e.target.value ? Number(e.target.value) : null;
                const currentMax = budgetRange[1];

                // Keep range valid when min crosses max.
                if (
                  newMin !== null &&
                  currentMax !== null &&
                  newMin > currentMax
                ) {
                  applyBudget([newMin, newMin]);
                  return;
                }

                applyBudget([newMin, currentMax]);
              }}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-green-600 focus:outline-none"
            >
              <option value="">Minimum</option>
              {activeBudgetOptions.map((v) => (
                <option
                  key={v}
                  value={v}
                  disabled={budgetRange[1] !== null && v > budgetRange[1]}
                >
                  {formatActiveBudget(v)}
                </option>
              ))}
            </select>

            {/* Maximum */}
            <select
              value={budgetRange[1] ?? ""}
              onChange={(e) => {
                const newMax = e.target.value ? Number(e.target.value) : null;
                const currentMin = budgetRange[0];

                // Keep range valid when max crosses min.
                if (
                  currentMin !== null &&
                  newMax !== null &&
                  newMax < currentMin
                ) {
                  applyBudget([newMax, newMax]);
                  return;
                }

                applyBudget([currentMin, newMax]);
              }}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-green-600 focus:outline-none"
            >
              <option value="">Maximum</option>
              {activeBudgetOptions.map((v) => (
                <option
                  key={v}
                  value={v}
                  disabled={budgetRange[0] !== null && v < budgetRange[0]}
                >
                  {formatActiveBudget(v)}
                </option>
              ))}
            </select>
          </div>

          {/* Range Slider */}
          {/* <div className="mt-6 px-1">
            <Range
              step={budgetStep}
              min={budgetMin}
              max={budgetMax}
              values={[
                budgetRange[0] ?? budgetMin,
                budgetRange[1] ?? budgetMax,
              ]}
              onChange={(values) => {
                const [min, max] = values as [number, number];

                applyBudget([
                  min === budgetMin ? null : min,
                  max === budgetMax ? null : max,
                ]);
              }}
              renderTrack={({ props, children }) => (
                <div
                  {...props}
                  className="h-1 w-full rounded"
                  style={{
                    ...props.style,
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
              )}
              renderThumb={({ props, isDragged }) => (
                <div
                  {...props}
                  className={`relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-green-600 shadow-md transition-transform focus:outline-none ${isDragged ? "scale-110 cursor-grabbing" : "cursor-grab"} touch-none`}
                >
                  <span className="h-2 w-0.5 rounded-full bg-white/90" />
                  <span className="ml-0.5 h-2 w-0.5 rounded-full bg-white/90" />
                </div>
              )}
            />
            <p className="mt-2 text-center text-xs text-gray-500">
              Drag handles to adjust budget range
            </p>
          </div> */}
        </div>


        <div>
          <h3 className="mb-3 text-lg font-semibold">Bedrooms</h3>
          <div className="flex flex-wrap gap-2">
            {bedroomOptions.map((bedroomOption) => {
              const value = getBedroomValue(bedroomOption);
              const isSelected = isBedroomSelected(value);
              return (
                <SelectableButton
                  key={bedroomOption}
                  label={bedroomOption}
                  active={isSelected}
                  selectionType="multiple"
                  onClick={() =>
                    dispatch(
                      setResidentialFilter({
                        key: "bedrooms",
                        value: toggleBedroomValue(value),
                      }),
                    )
                  }
                  className="rounded-xl text-sm"
                />
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-lg font-semibold">Posted By</h3>
          <div className="flex flex-wrap gap-3">
            {POSTED_BY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() =>
                  dispatch(
                    setResidentialFilter({
                      key: "createdByRole",
                      value: isPostedBySelected(POSTED_BY_MAP[option]) ? "" : POSTED_BY_MAP[option],
                    }),
                  )
                }
                className={`rounded-xl border px-3 py-2 text-sm ${selectedPostedBy.includes(option)
                  ? "border-green-600 bg-[#d8ece0] text-green-700"
                  : "border-gray-300 bg-white"
                  }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-300 bg-white">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-lg font-semibold"
          >
            Advanced Filters (Optional)
            {showAdvanced ? (
              <IoChevronUpOutline className="h-6 w-6" />
            ) : (
              <IoChevronDownOutline className="h-6 w-6" />
            )}
          </button>

          {showAdvanced && (
            <div className="border-t border-gray-200">
              <div className="flex">
                <div className="w-1/3 border-r border-gray-200 bg-[#f7f8f7]">
                  {moreFilterSections.map((section) => (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => setActiveFilter(section.key)}
                      className={`w-full border-b border-gray-200 px-3 py-3 text-left ${activeFilter === section.key
                        ? "bg-[#d8ece0] font-semibold text-green-700"
                        : "text-gray-800"
                        }`}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>

                <div className="w-2/3 p-3">
                  {moreFilterSections
                    .filter((section) => section.key === activeFilter)
                    .map((section) => (
                      <div key={section.key} className="space-y-3">
                        <h4 className="text-lg font-semibold text-gray-900">{section.label}</h4>

                        {section.key === "Covered Area" ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={carpetRange[0]}
                                onChange={(e) =>
                                  setCarpetRange([Number(e.target.value), carpetRange[1]])
                                }
                                className="rounded-xl border px-2 py-1 text-sm"
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
                                  setCarpetRange([carpetRange[0], Number(e.target.value)])
                                }
                                className="rounded-xl border px-3 py-2 text-base"
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
                              onChange={(values) => setCarpetRange(values as [number, number])}
                              renderTrack={({ props, children }) => {
                                const { key, ...restProps } = props as React.HTMLProps<HTMLDivElement> & {
                                  key?: React.Key;
                                };

                                return (
                                  <div key={key} {...restProps} className="h-1 w-full rounded bg-gray-200">
                                    {children}
                                  </div>
                                );
                              }}
                              renderThumb={({ props }) => {
                                const { key, ...restProps } = props as React.HTMLProps<HTMLDivElement> & {
                                  key?: React.Key;
                                };

                                return (
                                  <div
                                    key={key}
                                    {...restProps}
                                    className="h-4 w-4 rounded-full bg-green-600 shadow"
                                  />
                                );
                              }}
                            />
                          </div>
                        ) : (
                <div className="flex flex-wrap gap-2">
                  {section.options?.map((opt) => {
                    const mappedKey = keyMapping[section.key];
                    const currentValue = residential[mappedKey];
                    const isPostedByFilter = mappedKey === "createdByRole";
                    const isMulti = !isPostedByFilter && section.selectionType === "multiple";
                    const currentValues = Array.isArray(currentValue)
                      ? (currentValue as string[])
                      : currentValue
                        ? [String(currentValue)]
                        : [];
                    const filterValue =
                      isPostedByFilter
                        ? POSTED_BY_MAP[opt as (typeof POSTED_BY_OPTIONS)[number]] ?? opt
                        : normalizeResidentialOptionValue(mappedKey, opt);
                    const isActive = isPostedByFilter
                      ? isPostedBySelected(filterValue)
                      : isMulti
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
                                    isPostedByFilter
                                      ? filterValue.toLowerCase() === "user"
                                        ? "Owner"
                                        : filterValue
                                      : formatLabel(opt)
                                  }
                                  active={isActive}
                                  selectionType={isMulti ? "multiple" : "single"}
                                  onClick={() =>
                                    dispatch(
                                      setResidentialFilter({
                        key: mappedKey,
                        value: isPostedByFilter
                          ? isActive
                            ? ""
                            : filterValue
                          : isMulti
                            ? toggleResidentialArrayValue(
                                mappedKey,
                                currentValues,
                                filterValue,
                              )
                            : isActive
                              ? ""
                              : filterValue,
                      }),
                    )
                  }
                                  className="rounded-xl px-3 py-1.5 text-base"
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
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-3 border-t border-gray-200 bg-white px-3 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] sm:px-4">
        <button
          type="button"
          className="flex-1 rounded-lg border border-green-600 px-3 py-2 text-base font-semibold text-green-600 sm:text-lg"
          onClick={handleClear}
        >
          Clear
        </button>
        <button
          type="button"
          className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-base font-semibold text-white sm:text-lg"
          onClick={onClose}
        >
          Search
        </button>
      </div>
    </div>
  );
};

export default ResidentialMobileFilters;
