"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  resetCommercialFilters,
  setBudget,
  setCategory,
  setCommercialFilter,
  setListingType,
  setSearchText,
} from "@/Redux/slice/filterSlice";
import { CommercialFilterKey, MoreFilterSectionCom } from "@/types";
import { commercialKeyMapping } from "@/types/commercial";
import {
  commercialMoreFilterSections,
  getBudgetConfig,
  snapBudgetRangeToOptions,
} from "../../constants/constants";
import Toggle from "@/ui/ToggleSwitch";
import { toast } from "sonner";
import SelectableButton from "@/ui/SelectableButton";
import SearchBox from "@/components/SearchBox";
import { formatLabel } from "@/utilies/formatLabel";
import {
  areFilterValuesEqual,
  toggleFilterArrayValue,
  uniqueFilterValues,
} from "../filterValueUtils";

type ListingOption = {
  label: "Buy" | "Rent";
  value: "sale" | "rent";
};

type CommercialMobileFilterProps = {
  open: boolean;
  onClose: () => void;
  listingOptions: readonly ListingOption[];
  categoryOptions: readonly categoryOption[];
};

type CommercialPostedByOption = "Owners" | "Agents";

const CARPET_MIN = 100;
const CARPET_MAX = 10000;

const carpetOptions = [
  100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000,
];

const getCategoryLabel = (value: categoryOption) =>
  value === "Land" ? "Plots" : value;

const postedByOptions: CommercialPostedByOption[] = ["Owners", "Agents"];
const postedByLabelMap: Record<CommercialPostedByOption, string> = {
  Owners: "User",
  Agents: "Agent",
};
const MOBILE_MENU_STATE_EVENT = "propenu:mobile-menu-state";

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

const CommercialMobileFilter: React.FC<CommercialMobileFilterProps> = ({
  open,
  onClose,
  listingOptions,
  categoryOptions,
}) => {
  const dispatch = useDispatch();
  const cityData = useAppSelector(selectCityWithLocalities);
  const { listingTypeLabel, listingTypeValue, category, searchText, minPrice, maxPrice, commercial } =
    useAppSelector((s) => s.filters);
  const { options: budgetOptions, min: BUDGET_MIN, max: BUDGET_MAX, step: BUDGET_STEP, format: formatBudget, title: budgetTitle } = getBudgetConfig(listingTypeValue);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeFilter, setActiveFilter] =
    useState<CommercialFilterKey>("Commercial Type");
  const [budgetRange, setBudgetRange] = useState<[number | null, number | null]>([
    minPrice ?? null,
    maxPrice ?? null,
  ]);
  const [carpetRange, setCarpetRange] = useState<[number, number]>([
    commercial.carpetArea?.min ?? CARPET_MIN,
    commercial.carpetArea?.max ?? CARPET_MAX,
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

  const selectedLocalities = Array.isArray(commercial.locality)
    ? commercial.locality
    : commercial.locality
      ? [commercial.locality]
      : [];

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
    setCarpetRange([
      commercial.carpetArea?.min ?? CARPET_MIN,
      commercial.carpetArea?.max ?? CARPET_MAX,
    ]);
  }, [commercial.carpetArea?.min, commercial.carpetArea?.max]);

  useEffect(() => {
    dispatch(
      setCommercialFilter({
        key: "carpetArea",
        value: {
          min: carpetRange[0] === CARPET_MIN ? undefined : carpetRange[0],
          max: carpetRange[1] === CARPET_MAX ? undefined : carpetRange[1],
        },
      }),
    );
  }, [carpetRange, dispatch]);

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
        }),
      );
    }
  }, [commercial.commercialSubType, commercialSubTypeOptions, dispatch]);

  const localitySuggestions = useMemo(() => {
    const names =
      cityData?.localities
        ?.map((loc) => loc?.name?.trim())
        .filter((name): name is string => Boolean(name)) ?? [];

    const query = searchText.trim().toLowerCase();
    if (!query) return names.slice(0, 8);

    const startsWith = names.filter((name) =>
      name.toLowerCase().startsWith(query),
    );
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
    return normalized;
  };

  const selectedCreatedByRole = Array.isArray(commercial.createdByRole)
    ? commercial.createdByRole[0] ?? ""
    : commercial.createdByRole
      ? String(commercial.createdByRole).split(",")[0]?.trim() ?? ""
      : "";

  const isCreatedByRoleSelected = (value: string) =>
    normalizePostedByRole(selectedCreatedByRole) === normalizePostedByRole(value);

  const toggleArrayValue = (arr: string[] = [], value: string) =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const handleLocalitySelect = (name: string) => {
    dispatch(
      setCommercialFilter({
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
    dispatch(resetCommercialFilters());
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
          className="pr-2 text-sm font-semibold text-green-600 transition-colors hover:text-green-700 active:text-green-800"
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
                onClick={() => {
                  if (option.value !== listingTypeValue) applyBudget([null, null]);
                  dispatch(setListingType({ label: option.label, value: option.value }));
                }}
                className={`rounded-xl border px-6 py-2 text-sm ${
                  listingTypeLabel === option.label
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
          <div className="grid grid-cols-2 gap-2">
            {categoryOptions.map((type) => {
              const active = category === type;

              return (
                <label
                  key={type}
                  className="flex cursor-pointer items-center gap-3 text-sm text-gray-900"
                >
                  <input
                    type="radio"
                    name="property-category-commercial-mobile"
                    value={type}
                    checked={active}
                    onChange={() => {
                      dispatch(setCategory(type));
                      if (type !== "Commercial") onClose();
                    }}
                    className="sr-only"
                  />

                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${
                      active ? "border-green-600" : "border-gray-400"
                    }`}
                  >
                    {active && <span className="h-3 w-3 rounded-full bg-green-600" />}
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
                className={`rounded-xl px-3 py-2 text-sm ${
                  selectedLocalities.includes(name)
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
          <h3 className="mb-3 text-lg font-semibold text-gray-900">{budgetTitle}</h3>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={budgetRange[0] ?? ""}
              onChange={(e) => {
                const newMin = e.target.value ? Number(e.target.value) : null;
                const currentMax = budgetRange[1];

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
              {budgetOptions.filter((v) => budgetRange[1] === null || v <= budgetRange[1]).map((v) => (
                <option
                  key={v}
                  value={v}
                  disabled={budgetRange[1] !== null && v > budgetRange[1]}
                >
                  {formatBudget(v)}
                </option>
              ))}
            </select>

            <select
              value={budgetRange[1] ?? ""}
              onChange={(e) => {
                const newMax = e.target.value ? Number(e.target.value) : null;
                const currentMin = budgetRange[0];

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
              {budgetOptions.filter((v) => budgetRange[0] === null || v >= budgetRange[0]).map((v) => (
                <option
                  key={v}
                  value={v}
                  disabled={budgetRange[0] !== null && v < budgetRange[0]}
                >
                  {formatBudget(v)}
                </option>
              ))}
            </select>
          </div>

          <p className="mt-2 text-xs text-gray-500">Leave either field blank for no limit.</p>

          <div className="mt-6 px-1">
            <Range
              step={BUDGET_STEP}
              min={BUDGET_MIN}
              max={BUDGET_MAX}
              values={[
                budgetRange[0] ?? BUDGET_MIN,
                budgetRange[1] ?? BUDGET_MAX,
              ]}
              onChange={(values) => {
                const [min, max] = snapBudgetRangeToOptions(values, budgetOptions);
                applyBudget([
                  min === BUDGET_MIN ? null : min,
                  max === BUDGET_MAX ? null : max,
                ]);
              }}
              renderTrack={({ props, children }) => {
                const { key, ...restProps } = props as React.HTMLProps<HTMLDivElement> & {
                  key?: React.Key;
                };

                return (
                  <div
                    key={key}
                    {...restProps}
                    className="h-1 w-full rounded"
                    style={{
                      ...restProps.style,
                      background: getTrackBackground({
                        values: [
                          budgetRange[0] ?? BUDGET_MIN,
                          budgetRange[1] ?? BUDGET_MAX,
                        ],
                        colors: ["#E5E7EB", "#16A34A", "#E5E7EB"],
                        min: BUDGET_MIN,
                        max: BUDGET_MAX,
                      }),
                    }}
                  >
                    {children}
                  </div>
                );
              }}
              renderThumb={({ props, isDragged }) => {
                const { key, ...restProps } = props as React.HTMLProps<HTMLDivElement> & {
                  key?: React.Key;
                };

                return (
                  <div
                    key={key}
                    {...restProps}
                    className={`relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-green-600 shadow-md transition-transform focus:outline-none ${
                      isDragged ? "scale-110 cursor-grabbing" : "cursor-grab"
                    } touch-none`}
                  >
                    <span className="h-2 w-0.5 rounded-full bg-white/90" />
                    <span className="ml-0.5 h-2 w-0.5 rounded-full bg-white/90" />
                  </div>
                );
              }}
            />
            <p className="mt-2 text-center text-xs text-gray-500">
              Drag handles to adjust budget range
            </p>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-lg font-semibold">Commercial Type</h3>
          <div className="flex flex-wrap gap-2">
            {(commercialMoreFilterSections.find(
              (section) => section.key === "Commercial Type",
            )?.options ?? []
            ).map((option) => {
              const active = selectedCommercialTypes.some((value) =>
                areFilterValuesEqual("commercialType", value, option),
              );

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    dispatch(
                      setCommercialFilter({
                        key: "commercialType",
                        value: toggleFilterArrayValue(
                          "commercialType",
                          selectedCommercialTypes,
                          option,
                        ),
                      }),
                    )
                  }
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    active
                      ? "border-green-600 bg-[#d8ece0] text-green-700"
                      : "border-gray-300 bg-white text-gray-900"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-lg font-semibold">Posted By</h3>
          <div className="flex flex-wrap gap-3">
            {postedByOptions.map((option) => {
              const postedByValue = postedByLabelMap[option];
              const isSelected = isCreatedByRoleSelected(postedByValue);

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    dispatch(
                      setCommercialFilter({
                        key: "createdByRole",
                        value: isSelected ? "" : postedByValue,
                      }),
                    )
                  }
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    isSelected
                      ? "border-green-600 bg-[#d8ece0] text-green-700 font-semibold"
                      : "border-gray-300 bg-white text-gray-700"
                  }`}
                >
                  {option}
                </button>
              );
            })}
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
                  {dynamicCommercialSections.map((section) => (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => setActiveFilter(section.key)}
                      className={`w-full border-b border-gray-200 px-3 py-3 text-left ${
                        activeFilter === section.key
                          ? "bg-[#d8ece0] font-semibold text-green-700"
                          : "text-gray-800"
                      }`}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>

                <div className="w-2/3 p-3">
                  {dynamicCommercialSections
                    .filter((section) => section.key === activeFilter)
                    .map((section) => {
                      const mappedKey = commercialKeyMapping[section.key];
                      const currentValue = commercial[mappedKey];
                      const isMulti = section.selectionType === "multiple";

                      return (
                        <div key={section.key} className="space-y-3">
                          <h4 className="text-lg font-semibold text-gray-900">{section.label}</h4>

                          {section.key === "Verified Properties" ? (
                            <Toggle
                              enabled={Boolean(currentValue)}
                              onChange={(val) => {
                                dispatch(
                                  setCommercialFilter({
                                    key: mappedKey,
                                    value: val,
                                  }),
                                );
                                toast.success(
                                  val
                                    ? "Verified properties enabled"
                                    : "Verified properties disabled",
                                );
                              }}
                            />
                          ) : section.key === "Carpet Area" ? (
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
                                  className="rounded-xl border px-2 py-1 text-sm"
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
                                  setCarpetRange(values as [number, number])
                                }
                                renderTrack={({ props, children }) => {
                                  const { key, ...restProps } = props as React.HTMLProps<HTMLDivElement> & {
                                    key?: React.Key;
                                  };

                                  return (
                                    <div
                                      key={key}
                                      {...restProps}
                                      className="h-1 w-full rounded bg-gray-200"
                                    >
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
                                const active =
                                  mappedKey === "createdByRole"
                                    ? isCreatedByRoleSelected(postedByValue)
                                    : isMulti
                                      ? selectedValues.some((item) =>
                                          areFilterValuesEqual(
                                            mappedKey,
                                            item,
                                            opt,
                                          ),
                                        )
                                      : currentValue != null && currentValue !== ""
                                        ? areFilterValuesEqual(
                                            mappedKey,
                                            String(currentValue),
                                            opt,
                                          )
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
                                    active={active}
                                    selectionType={section.selectionType ?? "single"}
                                    onClick={() => {
                                      const nextValue =
                                        mappedKey === "createdByRole"
                                          ? active
                                            ? ""
                                            : postedByValue
                                          : isMulti
                                            ? toggleFilterArrayValue(
                                                mappedKey,
                                                selectedValues,
                                                opt,
                                              )
                                            : active
                                              ? ""
                                              : opt;
                                      dispatch(
                                        setCommercialFilter({
                                          key: mappedKey,
                                          value: nextValue,
                                        }),
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

export default CommercialMobileFilter;
