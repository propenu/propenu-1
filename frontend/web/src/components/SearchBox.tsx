"use client";
import { categoryOption } from "@/types";
import { useState, useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { useAppDispatch, useAppSelector } from "@/Redux/store";
import { useDispatch } from "react-redux";
import {
  setAgriculturalFilter,
  setCategory,
  setCommercialFilter,
  setLandFilter,
  setListingType,
  setResidentialFilter,
  setSearchText,
} from "@/Redux/slice/filterSlice";
import {
  fetchSearchableLocations,
  selectAllCitiesWithLocalities,
  selectCityWithLocalities,
  setCityId,
  setDetectedCity,
} from "@/Redux/slice/citySlice";
import { useRouter } from "next/navigation";
import { ArrowDropdownIcon } from "@/icons/icons";
import { IoIosSearch } from "react-icons/io";
import { IoCloseCircleOutline } from "react-icons/io5";
import { trackInteraction } from "@/services/trackingService";

const url = process.env.NEXT_PUBLIC_API_URL;
const RECENT_SEARCHES_KEY = "propenu_recent_searches";

const normalizeSearchValue = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase();

const cityContextKey = (city?: string | null, state?: string | null) =>
  `${normalizeSearchValue(city)}|${normalizeSearchValue(state)}`;

const listingOptions = [
  { label: "Buy", value: "sale" },
  { label: "Rent", value: "rent" },
] as const;

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

type SearchCityContext = {
  city: string;
  state: string;
};

type SearchBoxProps = {
  autoFocus?: boolean;
  className?: string;
  hideOnMobile?: boolean;
  mobileMode?: boolean;
  onNavigate?: () => void;
  searchOnly?: boolean;
};

function getProjectHref(
  suggestion: Extract<SearchSuggestion, { kind: "project" }>,
) {
  return String(suggestion.promotionType || "").toLowerCase() === "prime"
    ? `/prime/${suggestion.slug}`
    : `/project/${suggestion.slug}`;
}

const SearchBox = ({
  autoFocus = false,
  className,
  hideOnMobile = true,
  mobileMode = false,
  onNavigate,
  searchOnly = false,
}: SearchBoxProps) => {
  const [open, setOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [typedSuggestions, setTypedSuggestions] = useState<SearchSuggestion[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);
  const [activeSearchCity, setActiveSearchCity] = useState<SearchCityContext | null>(null);
  const [isCityChipDismissed, setIsCityChipDismissed] = useState(false);
  const [selectedProject, setSelectedProject] = useState<
    Extract<SearchSuggestion, { kind: "project" }> | null
  >(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchShellRef = useRef<HTMLDivElement | null>(null);
  const [placeholder, setPlaceholder] = useState(
    "Search for city, locality, project..."
  );

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        // 'md' breakpoint for mobile and tabs
        setPlaceholder("Search...");
      } else {
        setPlaceholder("Search for city, locality, project...");
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchShellRef.current &&
        !searchShellRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setCategoryOpen(false);
        setSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!autoFocus) return;

    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus();
      setSearchOpen(true);
    }, 60);

    return () => window.clearTimeout(timeoutId);
  }, [autoFocus]);

  const { listingTypeLabel, listingTypeValue, category, searchText, residential, commercial, land, agricultural } = useAppSelector((s) => s.filters);
  const cityData = useAppSelector(selectCityWithLocalities);
  const allLocations = useAppSelector(selectAllCitiesWithLocalities);
  const effectiveSearchContext = useMemo(() => {
    const city =
      activeSearchCity?.city?.trim() ||
      (!isCityChipDismissed ? cityData?.city?.trim() : "") ||
      "";
    const state =
      activeSearchCity?.state?.trim() ||
      (!isCityChipDismissed ? cityData?.state?.trim() : "") ||
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
      cityId: matchedLocation?._id,
      localities:
        matchedLocation?.localities
          ?.map((locality) => locality?.name?.trim())
          .filter((name): name is string => Boolean(name)) ?? [],
    };
  }, [
    activeSearchCity?.city,
    activeSearchCity?.state,
    allLocations,
    cityData?.city,
    cityData?.state,
    isCityChipDismissed,
  ]);
  const visibleSearchCity = effectiveSearchContext.city;
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

    dispatch(setCityId(matchedLocation._id));
    dispatch(setDetectedCity(matchedLocation));

    if (typeof window !== "undefined") {
      window.localStorage.setItem("selectedCityId", matchedLocation._id);
      window.localStorage.setItem("selectedCityData", JSON.stringify(matchedLocation));
    }
  };

  const categoryOptions: Array<{ label: string; value: categoryOption }> = [
    { label: "Residential", value: "Residential" },
    { label: "Commercial", value: "Commercial" },
    { label: "Plots", value: "Land" },
    { label: "Agricultural", value: "Agricultural" },
  ];
  const categoryToType: Record<categoryOption, string> = {
    Residential: "residential",
    Commercial: "commercial",
    Land: "land",
    Agricultural: "agricultural",
  };

  const dispatch = useDispatch();
  const appDispatch = useAppDispatch();
  const router = useRouter();

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
        setRecentSearches(parsed.slice(0, 5));
      }
    } catch {
      // Ignore malformed local storage.
    }
  }, []);

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
          `${url}/api/properties/search/suggestions?${params.toString()}`,
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
  const searchPlaceholder =
    selectedLocalities.length > 0 || visibleSearchCity
      ? "Add More"
      : placeholder;

  const buildPropertiesHref = (
    options?: {
      localities?: string[];
      text?: string;
      city?: string | null;
      state?: string | null;
    },
  ) => {
    const {
      localities = selectedLocalities,
      text = searchText,
      city = effectiveSearchContext.city || null,
      state = effectiveSearchContext.state || null,
    } = options ?? {};

    const params = new URLSearchParams({
      type: categoryToType[category],
      listingType: listingTypeValue,
    });

    const cleanedLocalities = localities
      .map((locality) => locality.trim())
      .filter(Boolean);

    if (cleanedLocalities.length > 0) {
      params.set("locality", cleanedLocalities.join(","));
    }

    const cleanedSearch = text.trim();
    if (cleanedSearch && cleanedLocalities.length === 0) {
      params.set("search", cleanedSearch);
    }

    if (city) params.set("city", city);
    if (state) params.set("state", state);

    return `/properties?${params.toString()}`;
  };

  const buildSearchContext = (
    options?: {
      localities?: string[];
      text?: string;
      city?: string | null;
      state?: string | null;
      targetPath?: string;
    },
  ) => {
    const {
      localities = selectedLocalities,
      text = searchText,
      city = effectiveSearchContext.city || null,
      state = effectiveSearchContext.state || null,
      targetPath,
    } = options ?? {};

    const cleanedLocalities = localities
      .map((locality) => locality.trim())
      .filter(Boolean);
    const cleanedSearch = text.trim();
    const context: Record<string, unknown> = {
      category,
      type: categoryToType[category],
      listingType: listingTypeValue,
    };

    if (cleanedSearch) context.search = cleanedSearch;
    if (cleanedLocalities.length > 0) context.locality = cleanedLocalities.join(",");
    if (city) context.city = city;
    if (state) context.state = state;
    if (residential.bedrooms?.length) {
      context.bedrooms = residential.bedrooms
        .map((bedroom) => (bedroom === "6+" ? "6plus" : String(bedroom)))
        .join(",");
    }
    if (targetPath) context.targetPath = targetPath;

    return context;
  };

  const trackSearchSubmit = (
    contextOptions?: Parameters<typeof buildSearchContext>[0],
  ) => {
    const searchContext = buildSearchContext(contextOptions);

    if (
      !searchContext.search &&
      !searchContext.locality &&
      !searchContext.city &&
      !searchContext.bedrooms
    ) {
      return;
    }

    trackInteraction({
      eventType: "search_performed",
      eventCategory: "search",
      source: "search_box",
      searchContext,
      metadata: {
        targetPath: searchContext.targetPath,
      },
    });
  };

  const updateLocalityFilter = (localities: string[]) => {
    if (category === "Residential") {
      dispatch(
        setResidentialFilter({
          key: "locality",
          value: localities,
        }),
      );
      return;
    }

    if (category === "Commercial") {
      dispatch(
        setCommercialFilter({
          key: "locality",
          value: localities,
        }),
      );
      return;
    }

    if (category === "Land") {
      dispatch(setLandFilter({ key: "locality", value: localities }));
      return;
    }

    dispatch(setAgriculturalFilter({ key: "locality", value: localities }));
  };

  useEffect(() => {
    if (!cityData?.city || !activeSearchCity?.city) return;

    const selectedCityKey = cityContextKey(cityData.city, cityData.state);
    const activeCityKey = cityContextKey(
      activeSearchCity.city,
      activeSearchCity.state,
    );

    if (selectedCityKey !== activeCityKey) {
      setActiveSearchCity(null);
      setIsCityChipDismissed(false);
    }
  }, [
    activeSearchCity?.city,
    activeSearchCity?.state,
    cityData?.city,
    cityData?.state,
  ]);

  useEffect(() => {
    if (!selectedLocalities.length || !visibleSearchCity) return;

    const allowedLocalities = new Set(
      effectiveSearchContext.localities.map(normalizeSearchValue),
    );

    if (allowedLocalities.size === 0) return;

    const nextLocalities = selectedLocalities.filter((locality) =>
      allowedLocalities.has(normalizeSearchValue(locality)),
    );

    if (nextLocalities.length !== selectedLocalities.length) {
      updateLocalityFilter(nextLocalities);
    }
  }, [
    effectiveSearchContext.localities,
    selectedLocalities,
    visibleSearchCity,
  ]);

  const handleLocalitySelect = (
    name: string,
    city?: string | null,
    state?: string | null,
  ) => {
    const isDifferentCity =
      city &&
      cityContextKey(city, state) !==
        cityContextKey(effectiveSearchContext.city, effectiveSearchContext.state);
    const nextLocalities = toggleArrayValue(
      isDifferentCity ? [] : selectedLocalities,
      name,
    );

    updateLocalityFilter(nextLocalities);
    setSelectedProject(null);
    if (city) {
      setIsCityChipDismissed(false);
      setActiveSearchCity({
        city,
        state: state ?? "",
      });
      syncNavbarCity(city, state);
    }
    dispatch(setSearchText(""));
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

    return allLocations.slice(0, 8).map((location) => ({
      kind: "city" as const,
      cityId: location._id,
      city: location.city,
      state: location.state,
      label: location.city,
      subLabel: location.state,
    }));
  }, [
    allLocations,
    effectiveSearchContext.city,
    effectiveSearchContext.cityId,
    effectiveSearchContext.localities,
    effectiveSearchContext.state,
    visibleSearchCity,
  ]);

  const groupedTypedSuggestions = useMemo(() => {
    return {
      cities: searchSuggestions.filter((suggestion) => suggestion.kind === "city"),
      localities: searchSuggestions.filter(
        (suggestion) => suggestion.kind === "locality",
      ),
      projects: searchSuggestions.filter(
        (suggestion) => suggestion.kind === "project",
      ),
    };
  }, [searchSuggestions]);
  const emptyStateSuggestionsHeading = visibleSearchCity
    ? `Popular In ${visibleSearchCity}`
    : "Popular Cities";

  const handleSuggestionSelect = (suggestion: SearchSuggestion) => {
    if (suggestion.kind === "city") {
      saveRecentSearch(suggestion);
      setSelectedProject(null);
      setIsCityChipDismissed(false);
      setActiveSearchCity({
        city: suggestion.city,
        state: suggestion.state,
      });
      syncNavbarCity(suggestion.city, suggestion.state);
      updateLocalityFilter([]);
      dispatch(setSearchText(""));
      setSearchOpen(false);
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
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    if (suggestion.kind === "project") {
      saveRecentSearch(suggestion);
      setSelectedProject(suggestion);
      setSearchOpen(false);
      window.open(getProjectHref(suggestion), "_blank", "noopener,noreferrer");
      onNavigate?.();
      return;
    }

    handleSuggestionSelect(suggestion);
  };

  const handleSearchSubmit = () => {
    if (selectedProject) {
      window.open(getProjectHref(selectedProject), "_blank", "noopener,noreferrer");
      onNavigate?.();
      return;
    }

    const firstSuggestion = searchText.trim() ? searchSuggestions[0] : null;

    if (firstSuggestion) {
      if (firstSuggestion.kind === "project") {
        saveRecentSearch(firstSuggestion);
        setSelectedProject(firstSuggestion);
        setSearchOpen(false);
        window.open(getProjectHref(firstSuggestion), "_blank", "noopener,noreferrer");
        onNavigate?.();
        return;
      }

      if (firstSuggestion.kind === "city") {
        handleSuggestionSelect(firstSuggestion);
        const targetPath = buildPropertiesHref({
          localities: [],
          text: "",
          city: firstSuggestion.city,
          state: firstSuggestion.state,
        });
        trackSearchSubmit({
          localities: [],
          text: "",
          city: firstSuggestion.city,
          state: firstSuggestion.state,
          targetPath,
        });
        router.push(targetPath);
        onNavigate?.();
        return;
      }

      handleSuggestionSelect(firstSuggestion);
      const nextLocalities = toggleArrayValue(
        selectedLocalities,
        firstSuggestion.locality,
      );
      const targetPath = buildPropertiesHref({
        localities: nextLocalities,
        text: "",
        city: firstSuggestion.city,
        state: firstSuggestion.state,
      });
      trackSearchSubmit({
        localities: nextLocalities,
        text: "",
        city: firstSuggestion.city,
        state: firstSuggestion.state,
        targetPath,
      });
      router.push(targetPath);
      onNavigate?.();
      return;
    } else {
      const cleanedSearch = searchText.trim();
      if (!cleanedSearch && selectedLocalities.length === 0 && !visibleSearchCity) {
        return;
      }
    }

    const targetPath = buildPropertiesHref({
      text: selectedLocalities.length > 0 ? "" : searchText,
    });
    trackSearchSubmit({
      text: selectedLocalities.length > 0 ? "" : searchText,
      targetPath,
    });
    router.push(targetPath);
    onNavigate?.();
  };

  // Split className: layout tokens (max-w-*, hidden, block) stay on the outer
  // wrapper; visual tokens (shadow-*) move to the inner rounded shell so
  // shadows respect the border-radius and don't bleed as a square layer.
  const shadowFromClassName = className
    ?.split(" ")
    .filter((c) => c.startsWith("shadow"))
    .join(" ");
  const outerClassName = className
    ?.split(" ")
    .filter((c) => !c.startsWith("shadow"))
    .join(" ");

  return (
    <div
      className={clsx(
        "relative w-full",
        !mobileMode && !className?.includes("max-w-") && "max-w-2xl",
        hideOnMobile ? "hidden md:block" : "block",
        outerClassName,
      )}
    >
      <div
        ref={searchShellRef}
        className={clsx(
          "block cursor-pointer border border-gray-200 bg-white",
          searchOnly
            ? mobileMode
              ? "rounded-xl px-3 py-2 shadow-none"
              : "rounded-xl px-3 py-2 shadow-sm"
            : mobileMode
              ? "rounded-lg p-1.5 shadow-lg"
              : "rounded-xl p-2 shadow-lg",
          shadowFromClassName,
        )}
      >
        <div className={clsx("flex items-center", mobileMode ? "gap-1.5" : "gap-2")}>
          {!searchOnly && (
            <>
              <button
                type="button"
                className={clsx(
                  "flex cursor-pointer items-center gap-1 bg-[#D1EFDD] font-medium text-[#15803D] transition-colors hover:bg-[#BDE5CE]",
                  mobileMode ? "rounded-md px-2.5 py-1 text-[13px]" : "rounded-md px-3 py-1.5 text-sm",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((prev) => {
                    const nextOpen = !prev;
                    if (nextOpen) {
                      setCategoryOpen(false);
                      setSearchOpen(false);
                    }
                    return nextOpen;
                  });
                }}
              >
                <span className="leading-none">{listingTypeLabel}</span>
                <ArrowDropdownIcon
                  size={12}
                  color="#15803D"
                  className={`transition-transform duration-200 ${open ? "rotate-180" : ""
                    }`}
                />
              </button>

              <span className={clsx("w-px bg-gray-200", mobileMode ? "h-5" : "h-6")} />

              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCategoryOpen((prev) => {
                      const nextOpen = !prev;
                      if (nextOpen) {
                        setOpen(false);
                        setSearchOpen(false);
                      }
                      return nextOpen;
                    });
                  }}
                  className={clsx(
                    "flex cursor-pointer items-center bg-transparent text-gray-900",
                    mobileMode ? "gap-1 text-[13px]" : "gap-2 text-sm",
                  )}
                >
                  <span className={clsx(!mobileMode && "md:max-w-24 md:truncate lg:max-w-none")}>
                    {category === "Land" ? "Plots" : category}
                  </span>
                  <ArrowDropdownIcon
                    size={12}
                    color="#111827"
                    className={`transition-transform duration-200 ${
                      categoryOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {categoryOpen && (
                  <div
                    className="absolute left-0 top-[calc(100%+8px)] z-60 w-44 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="absolute -top-2 left-6 pointer-events-none">
                      <div className="h-3 w-3 rotate-45 bg-white border-l border-t border-gray-200" />
                    </div>
                    <div className="flex flex-col">
                      {categoryOptions.map(({ label, value }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            dispatch(setCategory(value));
                            setCategoryOpen(false);
                          }}
                          className={`rounded px-3 py-2 text-left text-sm cursor-pointer transition-colors ${
                            category === value
                              ? "bg-[#D1EFDD] text-[#15803D] font-medium"
                              : "hover:bg-gray-100 text-gray-700"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <span className={clsx("w-px bg-gray-200", mobileMode ? "h-5" : "md:block h-6")} />
            </>
          )}

          {/* Search Input */}
          <div className="grow min-w-0">
            <div className="flex min-w-0 items-center cursor-text">
              <IoIosSearch
                className={clsx(
                  "shrink-0 text-gray-500",
                  mobileMode ? "mr-2 text-base" : "mr-3 text-lg",
                )}
              />
              <div className={clsx("flex min-w-0 flex-1 items-center overflow-hidden", mobileMode ? "gap-2" : "gap-3")}>
              {visibleSearchCity && (
                <div className="flex min-w-0 shrink items-center overflow-hidden">
                  <span className={clsx(
                    "flex items-center rounded-full font-normal text-gray-800",
                    mobileMode
                      ? "max-w-[96px] shrink-0 gap-1.5 border border-[#e2d6d6] bg-[#f8eeee] px-2.5 py-1 text-[12px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]"
                      : "min-w-0 max-w-40 gap-2 bg-[#f4eaea] px-3 py-1 text-sm",
                  )}>
                    <span className="truncate">{visibleSearchCity}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveSearchCity(null);
                        setIsCityChipDismissed(true);
                        setSelectedProject(null);
                      }}
                      className={clsx(
                        "shrink-0 transition-colors hover:text-gray-900",
                        mobileMode ? "text-gray-600" : "text-gray-500",
                      )}
                    >
                      <IoCloseCircleOutline className="h-4 w-4" />
                    </button>
                  </span>
                </div>
              )}
              {selectedLocalities.length > 0 && (
                <div className={clsx("flex min-w-0 shrink items-center overflow-hidden", mobileMode ? "gap-1.5" : "gap-2")}>
                  <span className={clsx(
                    "flex items-center rounded-full font-normal text-gray-800",
                    mobileMode
                      ? "max-w-[96px] shrink-0 gap-1.5 border border-[#e2d6d6] bg-[#f8eeee] px-2.5 py-1 text-[12px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]"
                      : "min-w-0 max-w-40 gap-2 bg-[#f4eaea] px-3 py-1 text-sm",
                  )}>
                    <span className="truncate">{selectedLocalities[0]}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateLocalityFilter(
                          selectedLocalities.filter((locality) => locality !== selectedLocalities[0]),
                        );
                        setSelectedProject(null);
                      }}
                      className={clsx(
                        "shrink-0 transition-colors hover:text-gray-900",
                        mobileMode ? "text-gray-600" : "text-gray-500",
                      )}
                    >
                      <IoCloseCircleOutline className="h-4 w-4" />
                    </button>
                  </span>
                  {selectedLocalities.length > 1 && (
                    <span className={clsx(
                      "rounded-full bg-[#f2e7e7] text-gray-700",
                      mobileMode ? "px-2 py-0.5 text-[12px]" : "px-3 py-1 text-sm",
                    )}>
                      +{selectedLocalities.length - 1}
                    </span>
                  )}
                </div>
              )}
              <input
                ref={inputRef}
                type="text"
                value={searchText}
                onFocus={() => {
                  setOpen(false);
                  setCategoryOpen(false);
                  setSearchOpen(true);
                }}
                onClick={() => {
                  setOpen(false);
                  setCategoryOpen(false);
                  setSearchOpen(true);
                }}
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
                placeholder={searchPlaceholder}
                className={clsx(
                  "w-full flex-1 bg-transparent text-gray-700 outline-none placeholder:text-gray-400",
                  mobileMode ? "min-w-0 text-[13px]" : "min-w-[120px] text-sm",
                )}
              />
              </div>
            </div>

            {searchOpen && (
              <div
                className={clsx(
                  "absolute left-0 right-0 z-70 rounded-lg border border-gray-200 bg-white shadow-lg",
                  mobileMode ? "top-[calc(100%+6px)] p-2.5" : "top-[calc(100%+8px)] w-full p-3",
                )}
              >
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
                    <div className="flex flex-col gap-2">
                      {recentSearches.map((suggestion, index) => (
                        <button
                          key={`${suggestion.kind}-${index}`}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="text-left text-sm cursor-pointer text-gray-800 hover:text-primary"
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

                {!searchText.trim() && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {emptyStateSuggestionsHeading}
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
                                  setSearchOpen(false);
                                }}
                                className="rounded-md text-left py-1 text-sm text-gray-800 transition-colors hover:bg-gray-50 hover:text-primary"
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
                                  setSearchOpen(false);
                                }}
                                className="rounded-md text-left py-1 text-sm text-gray-800 transition-colors hover:bg-gray-50 hover:text-primary"
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
                                  setSearchOpen(false);
                                }}
                                className="rounded-md text-left py-1 text-sm text-gray-800 transition-colors hover:bg-gray-50 hover:text-primary"
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
                    <div className="flex flex-col gap-1">
                      {emptyStateSuggestions.map((suggestion) => (
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
                            setSearchOpen(false);
                          }}
                          className="rounded-md py-1 text-left text-sm text-gray-800 transition-colors hover:bg-gray-50 hover:text-primary"
                        >
                          {suggestion.label},{" "}
                          <span className="text-[#26ad5f]">
                            {suggestion.subLabel}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              </div>
            )}
          </div>

          {!searchOnly && (
            <button
              type="button"
              onClick={handleSearchSubmit}
              className={clsx(
                "btn-primary shrink-0 text-sm font-semibold",
                mobileMode
                  ? "flex h-10 w-10 items-center justify-center rounded-full p-0"
                  : "flex items-center gap-2 rounded-lg px-4 py-2",
              )}
            >
              <IoIosSearch className="h-5 w-5" />
              <span className={mobileMode ? "hidden" : "hidden sm:inline"}>
                Search
              </span>
            </button>
          )}
        </div>

        {open && (
          <div
            className="absolute left-2 top-[calc(100%+8px)] z-60 w-38 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
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
                    setOpen(false);
                  }}
                  className="rounded px-2 py-1 hover:bg-gray-100 cursor-pointer"
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchBox;
