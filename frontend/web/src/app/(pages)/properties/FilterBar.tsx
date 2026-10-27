"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { IoIosSearch } from "react-icons/io";
import { useDispatch } from "react-redux";
import FilterDropdown from "@/ui/FilterDropdown";
import { useAppDispatch, useAppSelector } from "@/Redux/store";
import {
  fetchSearchableLocations,
  selectAllCitiesWithLocalities,
  selectCityWithLocalities,
  setCityId,
  setDetectedCity,
} from "@/Redux/slice/citySlice";
import {
  categoryOption,
  resetAgriculturalFilters,
  resetCommercialFilters,
  resetLandFilters,
  resetResidentialFilters,
  setAgriculturalFilter,
  setBudget,
  setCategory,
  setCommercialFilter,
  setLandFilter,
  setListingType,
  setResidentialFilter,
  setSearchText,
} from "@/Redux/slice/filterSlice";
import { ArrowDropdownIcon } from "@/icons/icons";
import CategoryFilters from "./CategoryFilters";
import { IoCloseCircleOutline } from "react-icons/io5";
import { HiOutlineAdjustmentsHorizontal } from "react-icons/hi2";
import ResidentialMobileFilters from "./filters/adaptiveFilterDesign/ResidentialMobileFilters";
import CommercialMobileFilter from "./filters/adaptiveFilterDesign/CommercialMobileFilter";
import LandMobileFilter from "./filters/adaptiveFilterDesign/LandMobileFilter";
import AgriculturalMobileFilter from "./filters/adaptiveFilterDesign/AgriculturalMobileFilter";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildSearchParams } from "./filters/buildSearchParams";
import { hydrateFiltersFromSearchParams } from "./filters/hydrateFiltersFromSearchParams";

const LAST_PROPERTY_CATEGORY_KEY = "properties:lastCategory";
const SEARCH_API_URL = process.env.NEXT_PUBLIC_API_URL;
const RECENT_SEARCHES_KEY = "propenu_recent_searches";

type SearchSuggestion =
  | {
      kind: "city";
      cityId?: string;
      city: string;
      state: string;
      label: string;
      subLabel: string;
    }
  | {
      kind: "locality";
      cityId?: string;
      city: string;
      state: string;
      locality: string;
      label: string;
      subLabel: string;
    }
  | {
      kind: "project";
      label: string;
      subLabel: string;
      slug: string;
      city: string;
      state: string;
      locality: string;
      promotionType?: string;
    };

type RecentSearchItem = SearchSuggestion & {
  savedAt: number;
};

function normalizeLocalityName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function getProjectHref(
  suggestion: Extract<SearchSuggestion, { kind: "project" }>,
) {
  return String(suggestion.promotionType || "").toLowerCase() === "prime"
    ? `/prime/${suggestion.slug}`
    : `/project/${suggestion.slug}`;
}

const FilterBar: React.FC = () => {
  const getCategoryLabel = (value: categoryOption) =>
    value === "Land" ? "Plots" : value;

  const categoryToType: Record<categoryOption, string> = {
    Residential: "residential",
    Commercial: "commercial",
    Land: "plot",
    Agricultural: "agricultural",
  };

  const listingOptions = [
    { label: "Buy", value: "sale" },
    { label: "Rent", value: "rent" },
  ] as const;

  const categoryOptions: categoryOption[] = [
    "Residential",
    "Commercial",
    "Land",
    "Agricultural",
  ];

  const [open, setOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showResidentialAdvanced, setShowResidentialAdvanced] = useState(false);
  const [showCommercialAdvanced, setShowCommercialAdvanced] = useState(false);
  const [showLandAdvanced, setShowLandAdvanced] = useState(false);
  const [showAgriculturalAdvanced, setShowAgriculturalAdvanced] = useState(false);
  const [hasRestoredCategory, setHasRestoredCategory] = useState(false);
  const [hasHydratedFromUrl, setHasHydratedFromUrl] = useState(false);
  const [typedSuggestions, setTypedSuggestions] = useState<SearchSuggestion[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);
  const [dismissedCityKey, setDismissedCityKey] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<
    Extract<SearchSuggestion, { kind: "project" }> | null
  >(null);
  const pendingInitialUrlCategoryRef = useRef<categoryOption | null>(null);
  const isNavigatingToProjectRef = useRef(false);

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch();
  const appDispatch = useAppDispatch();
  const {
    listingTypeLabel,
    listingTypeValue,
    category,
    searchText,
    minPrice,
    maxPrice,
    residential,
    commercial,
    land,
    agricultural,
  } =
    useAppSelector((s) => s.filters);
  const cityData = useAppSelector(selectCityWithLocalities);
  const allLocations = useAppSelector(selectAllCitiesWithLocalities);

  const handleListingOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setCategoryOpen(false);
      setSearchOpen(false);
    }
  };

  const handleCategoryOpenChange = (nextOpen: boolean) => {
    setCategoryOpen(nextOpen);
    if (nextOpen) {
      setOpen(false);
      setSearchOpen(false);
    }
  };

  const handleSearchOpenChange = (nextOpen: boolean) => {
    setSearchOpen(nextOpen);
    if (nextOpen) {
      setOpen(false);
      setCategoryOpen(false);
    }
  };

  const effectiveSearchContext = useMemo(() => {
    const urlCity = (searchParams.get("city") ?? "").trim();
    const urlState = (searchParams.get("state") ?? "").trim();
    const urlCityKey = `${urlCity}|${urlState}`;
    const selectedCityKey = `${cityData?.city ?? ""}|${cityData?.state ?? ""}`;
    const shouldUseUrlCity = Boolean(urlCity) && dismissedCityKey !== urlCityKey;
    const shouldUseSelectedCity =
      Boolean(cityData?.city?.trim()) && dismissedCityKey !== selectedCityKey;
    const city =
      (shouldUseUrlCity ? urlCity : "") ||
      (shouldUseSelectedCity ? cityData?.city?.trim() : "") ||
      "";
    const state =
      (shouldUseUrlCity ? urlState : "") ||
      (shouldUseSelectedCity ? cityData?.state?.trim() : "") ||
      "";

    const matchedLocation = city
      ? allLocations.find((location) => {
          const sameCity =
            location.city.trim().toLowerCase() === city.toLowerCase();
          const sameState =
            !state ||
            location.state.trim().toLowerCase() === state.toLowerCase();

          return sameCity && sameState;
        })
      : null;

    return {
      city,
      state,
      localities:
        matchedLocation?.localities
          ?.map((locality) => locality?.name?.trim())
          .filter((name): name is string => Boolean(name)) ?? [],
      cityId: matchedLocation?._id,
    };
  }, [
    allLocations,
    cityData?.city,
    cityData?.state,
    dismissedCityKey,
    searchParams,
  ]);
  const explicitSearchCity = effectiveSearchContext.city;
  const explicitSearchState = effectiveSearchContext.state;
  const urlSearchPayload = useMemo(
    () => ({
      ...buildSearchParams({
        listingTypeLabel,
        listingTypeValue,
        category,
        searchText,
        minPrice,
        maxPrice,
        residential,
        commercial,
        land,
        agricultural,
      }),
      city: explicitSearchCity || undefined,
      state: explicitSearchState || undefined,
    }),
    [
      listingTypeLabel,
      listingTypeValue,
      category,
      searchText,
      minPrice,
      maxPrice,
      residential,
      commercial,
      land,
      agricultural,
      explicitSearchCity,
      explicitSearchState,
    ],
  );
  const hydratedUrlCategory = useMemo(
    () =>
      hydrateFiltersFromSearchParams(
        new URLSearchParams(searchParams.toString()),
      ).category,
    [searchParams],
  );

  useEffect(() => {
    appDispatch(fetchSearchableLocations());
  }, [appDispatch]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(RECENT_SEARCHES_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as RecentSearchItem[];
      if (Array.isArray(parsed)) {
        // Older saved project suggestions did not include promotionType, so
        // they cannot be routed to the correct project page.
        setRecentSearches(
          parsed
            .filter(
              (item) =>
                item.kind !== "project" || Boolean(item.promotionType),
            )
            .slice(0, 5),
        );
      }
    } catch {
      // Ignore malformed data.
    }
  }, []);

  useEffect(() => {
    const hydrated = hydrateFiltersFromSearchParams(
      new URLSearchParams(searchParams.toString()),
    );
    let resolvedCategory: categoryOption | null = null;

    if (!hydrated.category) {
      const savedCategory = window.sessionStorage.getItem(
        LAST_PROPERTY_CATEGORY_KEY,
      ) as categoryOption | null;

      if (savedCategory && categoryOptions.includes(savedCategory)) {
        dispatch(setCategory(savedCategory));
        resolvedCategory = savedCategory;
      }
    } else {
      dispatch(setCategory(hydrated.category));
      window.sessionStorage.setItem(LAST_PROPERTY_CATEGORY_KEY, hydrated.category);
      resolvedCategory = hydrated.category;
    }

    if (hydrated.listingType) {
      dispatch(
        setListingType({
          label:
            hydrated.listingType === "sale"
              ? "Buy"
              : hydrated.listingType === "rent"
                ? "Rent"
                : "Lease",
          value: hydrated.listingType,
        }),
      );
    }

    dispatch(setSearchText(hydrated.searchText));
    dispatch(setBudget({ min: hydrated.minPrice, max: hydrated.maxPrice }));
    dispatch(resetResidentialFilters());
    dispatch(resetCommercialFilters());
    dispatch(resetLandFilters());
    dispatch(resetAgriculturalFilters());

    const activeCategory = resolvedCategory ?? category;

    if (activeCategory === "Residential") {
      Object.entries(hydrated.residential).forEach(([key, value]) => {
        if (value !== undefined) {
          dispatch(
            setResidentialFilter({
              key: key as keyof typeof hydrated.residential,
              value,
            }),
          );
        }
      });
    } else if (activeCategory === "Commercial") {
      Object.entries(hydrated.commercial).forEach(([key, value]) => {
        if (value !== undefined) {
          dispatch(
            setCommercialFilter({
              key: key as keyof typeof hydrated.commercial,
              value,
            }),
          );
        }
      });
    } else if (activeCategory === "Land") {
      Object.entries(hydrated.land).forEach(([key, value]) => {
        if (value !== undefined) {
          dispatch(
            setLandFilter({
              key: key as keyof typeof hydrated.land,
              value,
            }),
          );
        }
      });
    } else if (activeCategory === "Agricultural") {
      Object.entries(hydrated.agricultural).forEach(([key, value]) => {
        if (value !== undefined) {
          dispatch(
            setAgriculturalFilter({
              key: key as keyof typeof hydrated.agricultural,
              value,
            }),
          );
        }
      });
    }

    setHasRestoredCategory(true);
    setHasHydratedFromUrl(true);
  }, [searchParams, dispatch]);

  useEffect(() => {
    if (!hasHydratedFromUrl) return;
    pendingInitialUrlCategoryRef.current = hydratedUrlCategory ?? null;
  }, [hasHydratedFromUrl, hydratedUrlCategory]);

  useEffect(() => {
    if (!hasRestoredCategory || !hasHydratedFromUrl) return;
    if (isNavigatingToProjectRef.current) return;

    // Protect only the first hydration pass. After the initial URL category
    // has been respected once, user-driven category changes should update URL normally.
    if (pendingInitialUrlCategoryRef.current) {
      if (category !== pendingInitialUrlCategoryRef.current) return;
      pendingInitialUrlCategoryRef.current = null;
    }

    window.sessionStorage.setItem(LAST_PROPERTY_CATEGORY_KEY, category);

    const nextParams = new URLSearchParams();

    Object.entries(urlSearchPayload).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      nextParams.set(key, String(value));
    });

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();

    if (nextQuery === currentQuery) return;

    router.replace(`${pathname}?${nextQuery}`, { scroll: false });
  }, [
    category,
    hasRestoredCategory,
    hasHydratedFromUrl,
    pathname,
    router,
    searchParams,
    urlSearchPayload,
  ]);

  useEffect(() => {
    const postedBy = (
      searchParams.get("createdByRole") ||
      searchParams.get("postedBy") ||
      searchParams.get("postedby") ||
      ""
    )
      .trim()
      .toLowerCase();

    const isOwner = postedBy === "owner" || postedBy === "owners" || postedBy === "user";
    const isAgent = postedBy === "agent" || postedBy === "agents";
    const isBuilder = postedBy === "builder" || postedBy === "builders";

    if (!isOwner && !isAgent && !isBuilder) {
      return;
    }

    const roleValue = isOwner ? "user" : isAgent ? "agent" : "builder";

    if (category === "Residential") {
      dispatch(
        setResidentialFilter({
          key: "createdByRole",
          value: roleValue,
        }),
      );
      return;
    }

    if (category === "Commercial") {
      dispatch(
        setCommercialFilter({
          key: "createdByRole",
          value: roleValue,
        }),
      );
      return;
    }

    if (category === "Land") {
      dispatch(
        setLandFilter({ key: "createdByRole", value: roleValue }),
      );
      return;
    }

    if (category === "Agricultural") {
      dispatch(
        setAgriculturalFilter({
          key: "createdByRole",
          value: roleValue,
        }),
      );
    }
  }, [searchParams, category, dispatch]);

  const toggleArrayValue = (arr: string[] = [], value: string) =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const selectedLocalities = useMemo(() => {
    if (category === "Residential") {
      return Array.isArray(residential.locality) ? residential.locality : [];
    }

    if (category === "Commercial") {
      if (Array.isArray(commercial.locality)) return commercial.locality;
      return commercial.locality ? [commercial.locality] : [];
    }

    if (category === "Land") {
      if (Array.isArray(land.locality)) return land.locality;
      return land.locality ? [land.locality] : [];
    }

    if (Array.isArray(agricultural.locality)) return agricultural.locality;
    return agricultural.locality ? [agricultural.locality] : [];
  }, [category, residential.locality, commercial.locality, land.locality, agricultural.locality]);

  const visibleSearchCity = explicitSearchCity;
  const searchPlaceholder =
    selectedLocalities.length > 0
      ? "Add More"
      : "Enter locality or projects";

  const clearLocalityFilters = () => {
    if (category === "Residential") {
      dispatch(setResidentialFilter({ key: "locality", value: [] }));
    } else if (category === "Commercial") {
      dispatch(setCommercialFilter({ key: "locality", value: [] }));
    } else if (category === "Land") {
      dispatch(setLandFilter({ key: "locality", value: [] }));
    } else {
      dispatch(setAgriculturalFilter({ key: "locality", value: [] }));
    }
  };

  const handleRemoveCity = () => {
    setDismissedCityKey(`${explicitSearchCity}|${explicitSearchState}`);
    clearLocalityFilters();
    dispatch(setSearchText(""));
    setSelectedProject(null);
  };

  const syncNavbarCity = (city?: string | null, state?: string | null) => {
    const normalizedCity = city?.trim().toLowerCase();
    const normalizedState = state?.trim().toLowerCase();

    if (!normalizedCity) return;

    const matchedLocation = allLocations.find((location) => {
      const sameCity = location.city.trim().toLowerCase() === normalizedCity;
      const sameState =
        !normalizedState ||
        location.state.trim().toLowerCase() === normalizedState;

      return sameCity && sameState;
    });

    if (!matchedLocation?._id) return;

    setDismissedCityKey(null);
    dispatch(setCityId(matchedLocation._id));
    dispatch(setDetectedCity(matchedLocation));

    if (typeof window !== "undefined") {
      window.localStorage.setItem("selectedCityId", matchedLocation._id);
      window.localStorage.setItem("selectedCityData", JSON.stringify(matchedLocation));
    }
  };

  // Open search dropdown when coming from SearchBox
  useEffect(() => {
    if (searchParams.get("focus") === "search" && selectedLocalities.length === 0) {
      setSearchOpen(true);
    }
  }, [searchParams, selectedLocalities.length]);

  const handleLocalitySelect = (
    name: string,
    city?: string | null,
    state?: string | null,
  ) => {
    const nextLocalities = toggleArrayValue(selectedLocalities, name);

    if (category === "Residential") {
      dispatch(
        setResidentialFilter({
          key: "locality",
          value: nextLocalities,
        }),
      );
    } else if (category === "Commercial") {
      dispatch(
        setCommercialFilter({
          key: "locality",
          value: nextLocalities,
        }),
      );
    } else if (category === "Land") {
      dispatch(
        setLandFilter({
          key: "locality",
          value: nextLocalities,
        }),
      );
    } else {
      dispatch(
        setAgriculturalFilter({
          key: "locality",
          value: nextLocalities,
        }),
      );
    }

    if (!selectedLocalities.includes(name)) {
      dispatch(setSearchText(""));
    }
    if (city) {
      syncNavbarCity(city, state);
    }
    setSelectedProject(null);
    setSearchOpen(false);
  };

  const saveRecentSearch = (item: SearchSuggestion) => {
    if (typeof window === "undefined") return;

    const nextItem: RecentSearchItem = {
      ...item,
      savedAt: Date.now(),
    };

    setRecentSearches((current) => {
      const deduped = current.filter((existing) => {
        if (existing.kind !== nextItem.kind) return true;

        if (existing.kind === "city" && nextItem.kind === "city") {
          return existing.city.toLowerCase() !== nextItem.city.toLowerCase();
        }

        if (existing.kind === "locality" && nextItem.kind === "locality") {
          return !(
            existing.locality.toLowerCase() === nextItem.locality.toLowerCase() &&
            existing.city.toLowerCase() === nextItem.city.toLowerCase()
          );
        }

        if (existing.kind === "project" && nextItem.kind === "project") {
          return existing.slug !== nextItem.slug;
        }

        return true;
      });

      const updated = [nextItem, ...deduped].slice(0, 5);
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const handleCitySelect = (suggestion: Extract<SearchSuggestion, { kind: "city" }>) => {
    saveRecentSearch(suggestion);
    setSelectedProject(null);
    syncNavbarCity(suggestion.city, suggestion.state);

    clearLocalityFilters();

    dispatch(setSearchText(""));
    setSearchOpen(false);
  };

  const handleSuggestionSelect = (suggestion: SearchSuggestion) => {
    if (suggestion.kind === "city") {
      handleCitySelect(suggestion);
      return;
    }

    if (suggestion.kind === "project") {
      return;
    }

    saveRecentSearch(suggestion);
    handleLocalitySelect(
      suggestion.locality,
      suggestion.city,
      suggestion.state,
    );
    setSearchOpen(false);
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    if (suggestion.kind === "project") {
      saveRecentSearch(suggestion);
      setSelectedProject(suggestion);
      setSearchOpen(false);
      window.open(getProjectHref(suggestion), "_blank", "noopener,noreferrer");
      return;
    }

    handleSuggestionSelect(suggestion);
  };

  const handleSearchSubmit = () => {
    if (selectedProject) {
      window.open(getProjectHref(selectedProject), "_blank", "noopener,noreferrer");
      return;
    }

    const firstSuggestion = searchText.trim() ? searchSuggestions[0] : null;
    if (firstSuggestion) {
      if (firstSuggestion.kind === "project") {
        saveRecentSearch(firstSuggestion);
        setSelectedProject(firstSuggestion);
        setSearchOpen(false);
        window.open(getProjectHref(firstSuggestion), "_blank", "noopener,noreferrer");
        return;
      }

      handleSuggestionSelect(firstSuggestion);
      return;
    }

    const fallbackLocality = searchText.trim();
    if (!fallbackLocality) {
      setSearchOpen(false);
      return;
    }

    handleLocalitySelect(normalizeLocalityName(fallbackLocality));
    dispatch(setSearchText(""));
    setSearchOpen(false);
  };
  const handleRemoveLocality = (name: string) => {
    const next = selectedLocalities.filter((loc) => loc !== name);

    if (category === "Residential") {
      dispatch(setResidentialFilter({ key: "locality", value: next }));
    } else if (category === "Commercial") {
      dispatch(setCommercialFilter({ key: "locality", value: next }));
    } else if (category === "Land") {
      dispatch(setLandFilter({ key: "locality", value: next }));
    } else {
      dispatch(setAgriculturalFilter({ key: "locality", value: next }));
    }
  };

  useEffect(() => {
    const query = searchText.trim();
    if (!query) {
      setTypedSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query,
          limit: "8",
        });

        if (effectiveSearchContext.city) {
          params.set("city", effectiveSearchContext.city);
        }

        const response = await fetch(
          `${SEARCH_API_URL}/api/properties/search/suggestions?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch suggestions");
        }

        const data = await response.json();
        setTypedSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setTypedSuggestions([]);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [effectiveSearchContext.city, searchText]);

  const searchSuggestions = useMemo<SearchSuggestion[]>(() => {
    if (!searchText.trim()) {
      return [];
    }

    return typedSuggestions;
  }, [searchText, typedSuggestions]);

  const emptyStateSuggestions = useMemo<SearchSuggestion[]>(() => {
    const prioritizedLocalities = effectiveSearchContext.localities.map(
      (locality) => ({
        kind: "locality" as const,
        cityId: effectiveSearchContext.cityId,
        city: effectiveSearchContext.city,
        state: effectiveSearchContext.state,
        locality,
        label: locality,
        subLabel: effectiveSearchContext.city,
      }),
    );

    if (visibleSearchCity) {
      return prioritizedLocalities.slice(0, 8);
    }

    return allLocations
      .map((location) => ({
        kind: "city" as const,
        cityId: location._id,
        city: location.city,
        state: location.state,
        label: location.city,
        subLabel: location.state,
      }))
      .slice(0, 8);
  }, [
    allLocations,
    effectiveSearchContext.city,
    effectiveSearchContext.cityId,
    effectiveSearchContext.localities,
    effectiveSearchContext.state,
    visibleSearchCity,
  ]);

  const groupedTypedSuggestions = useMemo(
    () => ({
      cities: searchSuggestions.filter(
        (suggestion) => suggestion.kind === "city",
      ),
      localities: searchSuggestions.filter(
        (suggestion) => suggestion.kind === "locality",
      ),
      projects: searchSuggestions.filter(
        (suggestion) => suggestion.kind === "project",
      ),
    }),
    [searchSuggestions],
  );

  return (
    <div className="sticky top-[60px] z-50 w-full bg-[#D1EFDD] px-3 shadow-sm md:top-16">
      <div className="mx-auto flex h-14 items-center gap-4 px-4 container">
        {/* Listing Type + Category + Search */}
        <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-2 shadow-sm md:w-full md:min-w-0 lg:w-auto lg:min-w-fit">

          <div className="flex items-center gap-2">
            <FilterDropdown
              open={open}
              onOpenChange={handleListingOpenChange}
              triggerLabel={
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md bg-[#D1EFDD] px-3 py-1.5 text-sm font-medium text-[#15803D] transition-colors hover:bg-[#BDE5CE] cursor-pointer"
                >
                  <span className="leading-none">{listingTypeLabel}</span>

                  <ArrowDropdownIcon
                    size={12}
                    color="#15803D"

                    className={`transition-transform duration-200  ${open ? "rotate-180" : ""
                      }`}
                  />
                </button>


              }
              width="w-36"
              align="left"
              renderContent={(close) => (
                <div>
                  <div className="flex flex-wrap gap-2">
                    {listingOptions.map((l) => (
                      <button
                        key={l.value}
                        onClick={() => {
                          dispatch(
                            setListingType({
                              label: l.label,
                              value: l.value,
                            }),
                          );
                          close();
                        }}
                        className="rounded px-2 py-1 hover:bg-gray-100 cursor-pointer"
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            />
          </div>


          <span className="h-5 w-px bg-gray-200" />

          {/* Category */}
          <FilterDropdown
            open={categoryOpen}
            onOpenChange={handleCategoryOpenChange}
            triggerLabel={
              <button
                type="button"
                className="flex items-center gap-2 bg-transparent text-sm text-gray-900 cursor-pointer"
              >
                <span className="md:max-w-24 md:truncate lg:max-w-none">
                  {getCategoryLabel(category)}
                </span>
                <ArrowDropdownIcon
                  size={12}
                  color="#111827"
                  className={`transition-transform duration-200 ${
                    categoryOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            }
            width="w-44"
            align="left"
            renderContent={(close) => (
              <div>
                <div className="flex flex-col gap-1">
                  {categoryOptions.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        dispatch(setCategory(type));
                        window.sessionStorage.setItem(
                          LAST_PROPERTY_CATEGORY_KEY,
                          type,
                        );
                        close();
                      }}
                      className={`rounded px-3 py-2 text-left text-sm cursor-pointer transition-colors ${
                        category === type
                          ? "bg-[#D1EFDD] text-[#15803D] font-medium"
                          : "hover:bg-gray-100 text-gray-700"
                      }`}
                    >
                      {getCategoryLabel(type)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          />
          <span className="h-5 w-px bg-gray-200" />
          <div className="hidden md:block md:min-w-0 md:flex-1 lg:flex-none">
            <FilterDropdown
              open={searchOpen}
              onOpenChange={handleSearchOpenChange}
              align="left"
              width="w-[360px] lg:w-[520px] max-w-[94vw]"
              showArrow={false}
              triggerLabel={
                <div className="flex w-full min-w-0 max-w-full items-center cursor-text lg:w-[360px] lg:max-w-[360px]">
                  <IoIosSearch className="mr-2 text-lg text-gray-500" />

                  {visibleSearchCity && (
                    <span className="mr-2 flex max-w-32 shrink-0 items-center gap-2 rounded-full bg-[#D1EFDD] px-3 py-1 text-sm font-medium text-[#15803D] md:max-w-36">
                      <span className="truncate">{visibleSearchCity}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveCity();
                        }}
                        className="shrink-0 text-[#15803D] transition-colors hover:text-[#0f5f2d]"
                        aria-label={`Remove ${visibleSearchCity} city filter`}
                      >
                        <IoCloseCircleOutline className="h-4 w-4" />
                      </button>
                    </span>
                  )}

                  {selectedLocalities.length > 0 && (
                    <div className="mr-2 flex items-center gap-2 overflow-hidden">
                      <span className="flex max-w-36 items-center gap-2 rounded-full bg-[#f4eaea] px-3 py-1 text-sm font-normal text-gray-800">
                        <span className="truncate">{selectedLocalities[0]}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveLocality(selectedLocalities[0]);
                            setSelectedProject(null);
                          }}
                          className="shrink-0 text-gray-500 transition-colors hover:text-gray-900"
                        >
                          <IoCloseCircleOutline className="h-4 w-4" />
                        </button>
                      </span>

                      {selectedLocalities.length > 1 && (
                        <span className="rounded-full bg-[#f2e7e7] px-3 py-1 text-sm text-gray-700">
                          +{selectedLocalities.length - 1}
                        </span>
                      )}
                    </div>
                  )}

                    <input
                      type="text"
                      placeholder={searchPlaceholder}
                    value={searchText}
                    onChange={(e) => {
                      setSelectedProject(null);
                      dispatch(setSearchText(e.target.value));
                      setSearchOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSearchSubmit();
                      }
                    }}
                    className="bg-transparent text-sm outline-none flex-1 min-w-0"
                  />
                </div>
              }
              renderContent={(close) => (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700">
                    {searchText.trim()
                      ? "Search cities, localities and projects"
                      : "Search across cities"}
                  </p>

                  {!searchText.trim() && recentSearches.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Recent Searches
                      </p>
                      <div className="flex flex-col gap-1">
                        {recentSearches.map((suggestion, index) => (
                          <button
                            key={`${suggestion.kind}-${index}`}
                            onClick={() => {
                              handleSuggestionClick(suggestion);
                              close();
                            }}
                            className="rounded-md px-2 py-1.5 text-left text-sm text-gray-800 transition-colors hover:bg-gray-50 hover:text-primary"
                          >
                            {suggestion.label},{" "}
                            <span className="text-[#26ad5f]">
                              {suggestion.subLabel}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!searchText.trim() && visibleSearchCity && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Popular In {visibleSearchCity}
                    </p>
                  )}

                  {!searchText.trim() && !visibleSearchCity && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Popular Cities
                    </p>
                  )}

                  {searchText.trim() && searchSuggestions.length === 0 && (
                    <p className="text-sm text-gray-500">
                      No city, locality or project found for &quot;{searchText}&quot;
                    </p>
                  )}

                  {!searchText.trim() &&
                    visibleSearchCity &&
                    emptyStateSuggestions.length === 0 && (
                      <p className="text-sm text-gray-500">
                        No popular localities found in {visibleSearchCity}
                      </p>
                    )}

                  <div className="flex flex-col">
                    {searchText.trim() ? (
                      <>
                        {groupedTypedSuggestions.cities.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              Cities
                            </p>
                            <div className="flex flex-col">
                              {groupedTypedSuggestions.cities.map((suggestion) => (
                                <button
                                  key={`city-${suggestion.cityId ?? suggestion.city}`}
                                  onClick={() => {
                                    handleSuggestionClick(suggestion);
                                    close();
                                  }}
                                  className="rounded-md px-2 py-1.5 text-left text-sm text-gray-800 transition-colors hover:bg-gray-50 hover:text-primary"
                                >
                                  {suggestion.label},{" "}
                                  <span className="text-[#26ad5f]">
                                    {suggestion.subLabel}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {groupedTypedSuggestions.localities.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              Localities
                            </p>
                            <div className="flex flex-col">
                              {groupedTypedSuggestions.localities.map((suggestion) => (
                                <button
                                  key={`locality-${suggestion.cityId ?? suggestion.city}-${suggestion.locality}`}
                                  onClick={() => {
                                    handleSuggestionClick(suggestion);
                                    close();
                                  }}
                                  className="rounded-md px-2 py-1.5 text-left text-sm text-gray-800 transition-colors hover:bg-gray-50 hover:text-primary"
                                >
                                  {suggestion.label},{" "}
                                  <span className="text-[#26ad5f]">
                                    {suggestion.subLabel}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {groupedTypedSuggestions.projects.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              Projects
                            </p>
                            <div className="flex flex-col">
                              {groupedTypedSuggestions.projects.map((suggestion) => (
                                <button
                                  key={`project-${suggestion.slug}`}
                                  onClick={() => {
                                    handleSuggestionClick(suggestion);
                                    close();
                                  }}
                                  className="rounded-md px-2 py-1.5 text-left text-sm text-gray-800 transition-colors hover:bg-gray-50 hover:text-primary"
                                >
                                  {suggestion.label},{" "}
                                  <span className="text-[#26ad5f]">
                                    {suggestion.subLabel}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      emptyStateSuggestions.map((suggestion) => (
                        <button
                          key={
                            suggestion.kind === "city"
                              ? `city-${suggestion.cityId ?? suggestion.city}`
                              : suggestion.kind === "locality"
                                ? `locality-${suggestion.cityId ?? suggestion.city}-${suggestion.locality}`
                                : `project-${suggestion.slug}`
                          }
                          onClick={() => {
                            handleSuggestionClick(suggestion);
                            close();
                          }}
                          className="rounded-md px-2 py-1.5 text-left text-sm text-gray-800 transition-colors hover:bg-gray-50 hover:text-primary"
                        >
                          {suggestion.label},{" "}
                          <span className="text-[#26ad5f]">
                            {suggestion.subLabel}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            />
          </div>
          {/* <span className="h-5 w-px bg-gray-200 lg:hidden" /> */}
          <button
            type="button"
            disabled={
              category !== "Residential" &&
              category !== "Commercial" &&
              category !== "Land" &&
              category !== "Agricultural"
            }
            onClick={() => {
              if (category === "Residential") setShowResidentialAdvanced(true);
              if (category === "Commercial") setShowCommercialAdvanced(true);
              if (category === "Land") setShowLandAdvanced(true);
              if (category === "Agricultural") setShowAgriculturalAdvanced(true);
            }}
            className={`flex items-center gap-2 rounded-md bg-[#D1EFDD] px-3 py-1 text-sm font-medium text-[#15803D] transition-colors hover:bg-[#BDE5CE] lg:hidden ${
              category !== "Residential" &&
              category !== "Commercial" &&
              category !== "Land" &&
              category !== "Agricultural"
                ? "cursor-not-allowed opacity-60"
                : ""
            }`}
          >
            <HiOutlineAdjustmentsHorizontal className="text-base" />
            More 
          </button>


        </div>

        {/* Desktop View */}
        <div className="hidden lg:block">
          <CategoryFilters />
        </div>

      </div>

      <ResidentialMobileFilters
        open={showResidentialAdvanced}
        onClose={() => setShowResidentialAdvanced(false)}
        listingOptions={listingOptions}
        categoryOptions={categoryOptions}
      />

      <CommercialMobileFilter
        open={showCommercialAdvanced}
        onClose={() => setShowCommercialAdvanced(false)}
        listingOptions={listingOptions}
        categoryOptions={categoryOptions}
      />

      <LandMobileFilter
        open={showLandAdvanced}
        onClose={() => setShowLandAdvanced(false)}
        listingOptions={listingOptions}
        categoryOptions={categoryOptions}
      />

      <AgriculturalMobileFilter
        open={showAgriculturalAdvanced}
        onClose={() => setShowAgriculturalAdvanced(false)}
        listingOptions={listingOptions}
        categoryOptions={categoryOptions}
      />
    </div>
  );
};

export default FilterBar;


