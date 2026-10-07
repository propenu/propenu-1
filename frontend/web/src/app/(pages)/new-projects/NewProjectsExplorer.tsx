"use client";

import { searchNewProjects } from "@/data/ClientData";
import { useCity } from "@/hooks/useCity";
import { useShortlist } from "@/hooks/useShortlist";
import { FeaturedProject } from "@/types";
import formatINR from "@/utilies/PriceFormat";
import { getProjectConfigurationLabel } from "@/utilies/projectConfiguration";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { GoHeart, GoHeartFill } from "react-icons/go";
import { HiOutlineLocationMarker } from "react-icons/hi";
import { IoMdShareAlt } from "react-icons/io";
import { FiSearch, FiX } from "react-icons/fi";

type ProjectCardData = {
  _id: string;
  title: string;
  slug: string;
  heroImage?: string;
  heroTagline?: string;
  city?: string;
  locality?: string;
  state?: string;
  address?: string;
  priceFrom?: number;
  priceTo?: number;
  possessionDate?: string;
  reraNumber?: string;
  categoryType?: string;
  propertyType?: string;
  projectArea?: number;
  sqftRange?: { min?: number; max?: number };
  projectSummary?: { bhk?: number; label?: string; bhkLabel?: string }[];
  amenities?: string[];
  photoCount?: number;
  builderName?: string;
  promotion?: { type?: string };
  createdAt?: string;
  brochureUrl?: string;
};

type FacetItem = { name: string; count: number };

type ProjectFacets = {
  localities: FacetItem[];
  builders: FacetItem[];
  propertyTypes: FacetItem[];
  possession: {
    ready: number;
    newLaunch: number;
    years: { year: string; count: number }[];
  };
};

type SearchResponse = {
  items?: ProjectCardData[];
  meta?: { total?: number; page?: number; pages?: number };
  facets?: ProjectFacets;
};

const BUDGET_OPTIONS = [
  { label: "₹20 L", value: "2000000" },
  { label: "₹40 L", value: "4000000" },
  { label: "₹60 L", value: "6000000" },
  { label: "₹80 L", value: "8000000" },
  { label: "₹1 Cr", value: "10000000" },
  { label: "₹1.5 Cr", value: "15000000" },
  { label: "₹2 Cr", value: "20000000" },
  { label: "₹3 Cr", value: "30000000" },
  { label: "₹5 Cr", value: "50000000" },
  { label: "₹10 Cr", value: "100000000" },
];

const BHK_OPTIONS = [
  { label: "1 BHK", value: "1" },
  { label: "2 BHK", value: "2" },
  { label: "3 BHK", value: "3" },
  { label: "4 BHK", value: "4" },
  { label: "5+ BHK", value: "5+" },
];

const CATEGORIES = [
  { label: "All", value: "" },
  { label: "Residential", value: "residential" },
  { label: "Commercial", value: "commercial" },
  { label: "Plots", value: "land" },
  { label: "Agricultural", value: "agricultural" },
];

const SORT_OPTIONS = [
  { label: "Recommended", value: "recommended" },
  { label: "Newest", value: "newest" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
];

const PROPERTY_TYPE_GROUPS = [
  {
    label: "Residential Apartment",
    values: ["apartment", "flat", "residential-apartment"],
  },
  {
    label: "Independent House/Villa",
    values: ["villa", "independent-house", "duplex", "house"],
  },
  {
    label: "Residential Land",
    values: ["plot", "residential-plot", "land"],
  },
  {
    label: "Independent/Builder Floor",
    values: ["builder-floor", "independent-floor", "floor"],
  },
  {
    label: "Studio Apartment",
    values: ["studio", "studio-apartment"],
  },
  {
    label: "Serviced Apartments",
    values: ["serviced", "serviced-apartment", "serviced-apartments"],
  },
];

const AREA_UNITS = [
  { label: "Sq Ft.", value: "sqft", factor: 1 },
  { label: "Sq Yard", value: "sqyard", factor: 9 },
  { label: "Sq. Meter", value: "sqmeter", factor: 10.7639 },
  { label: "Grounds", value: "grounds", factor: 2400 },
  { label: "Aankadam", value: "aankadam", factor: 72 },
];

const EMPTY_FACETS: ProjectFacets = {
  localities: [],
  builders: [],
  propertyTypes: [],
  possession: { ready: 0, newLaunch: 0, years: [] },
};

function toggleListValue(current: string[], value: string) {
  const exists = current.some(
    (item) => item.toLowerCase() === value.toLowerCase(),
  );
  return exists
    ? current.filter((item) => item.toLowerCase() !== value.toLowerCase())
    : [...current, value];
}

function titleCaseType(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function FilterBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-gray-100 pt-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}

function SearchChecklist({
  placeholder,
  items,
  selected,
  onToggle,
  emptyLabel,
  heading,
}: {
  placeholder: string;
  items: FacetItem[];
  selected: string[];
  onToggle: (name: string) => void;
  emptyLabel: string;
  heading?: string;
}) {
  const [query, setQuery] = useState("");
  const visible = items.filter((item) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-gray-200 px-2">
        <FiSearch className="shrink-0 text-gray-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent py-2 text-sm outline-none"
        />
      </div>
      {heading && (
        <p className="mb-2 text-xs font-medium text-gray-500">{heading}</p>
      )}
      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
        {visible.map((item) => {
          const checked = selected.some(
            (value) => value.toLowerCase() === item.name.toLowerCase(),
          );
          return (
            <label
              key={item.name}
              className="flex items-center gap-2 text-sm text-gray-700"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(item.name)}
                className="h-4 w-4 accent-[#27AE60]"
              />
              <span className="truncate">{item.name}</span>
            </label>
          );
        })}
        {!visible.length && (
          <p className="text-xs text-gray-400">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

function splitList(value: string | null) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatPriceRange(project: ProjectCardData) {
  const from = Number(project.priceFrom);
  const to = Number(project.priceTo);
  const hasFrom = Number.isFinite(from) && from > 0;
  const hasTo = Number.isFinite(to) && to > 0;

  if (hasFrom && hasTo && from !== to) {
    return `${formatINR(from)} - ${formatINR(to)}`;
  }
  if (hasFrom) return `${formatINR(from)} onwards`;
  if (hasTo) return formatINR(to);
  return "Price on request";
}

function projectHref(project: ProjectCardData) {
  return project.promotion?.type === "prime"
    ? `/prime/${project.slug}`
    : `/project/${project.slug}`;
}

function promotionLabel(type?: string) {
  if (type === "prime") return "Prime";
  if (type === "featured") return "Top Selling";
  if (type === "sponsored") return "Sponsored";
  return "";
}

function isNewLaunch(createdAt?: string) {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < 1000 * 60 * 60 * 24 * 90;
}

function configurationLabel(project: ProjectCardData) {
  const category = project.categoryType?.toLowerCase();
  const unit =
    category === "land"
      ? "Plots"
      : category === "commercial"
        ? "Spaces"
        : category === "agricultural"
          ? "Land"
          : "Apartments";

  return getProjectConfigurationLabel(project as FeaturedProject, unit);
}

function ProjectResultCard({ project }: { project: ProjectCardData }) {
  const href = projectHref(project);
  const { isShortlisted, isShortlistLoading, toggleShortlist } = useShortlist(
    project._id,
    "FeaturedProject",
  );
  const badge = promotionLabel(project.promotion?.type);
  const launchedRecently = isNewLaunch(project.createdAt);
  const location = [project.locality, project.city].filter(Boolean).join(", ");

  const shareProject = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const shareUrl =
      typeof window !== "undefined"
        ? new URL(href, window.location.origin).toString()
        : href;

    try {
      if (navigator.share) {
        await navigator.share({ title: project.title, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Ignore cancelled share dialogs.
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="flex flex-col sm:flex-row">
        <Link
          href={href}
          className="relative block h-48 shrink-0 sm:h-auto sm:w-64"
        >
          <img
            src={project.heroImage || "/images/placeholder.svg"}
            alt={project.title}
            className="h-full w-full object-cover sm:absolute sm:inset-0"
          />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {launchedRecently && (
              <span className="rounded-md bg-[#f59e0b] px-2 py-1 text-[11px] font-semibold text-white">
                New Launch
              </span>
            )}
            {badge && (
              <span className="rounded-md bg-[#27AE60] px-2 py-1 text-[11px] font-semibold text-white">
                {badge}
              </span>
            )}
            {project.reraNumber && (
              <span className="rounded-md bg-[#0f2744] px-2 py-1 text-[11px] font-semibold text-white">
                RERA
              </span>
            )}
          </div>
          {!!project.photoCount && (
            <span className="absolute bottom-3 left-3 rounded-md bg-black/70 px-2 py-1 text-[11px] text-white">
              {project.photoCount} Photos
            </span>
          )}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={href} className="block">
                <h2 className="truncate text-lg font-semibold text-gray-900">
                  {project.title}
                </h2>
              </Link>
              {location && (
                <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                  <HiOutlineLocationMarker className="shrink-0" />
                  <span className="truncate">{location}</span>
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={shareProject}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600"
                aria-label="Share project"
              >
                <IoMdShareAlt />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  toggleShortlist();
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white"
                aria-label={isShortlisted ? "Remove from shortlist" : "Shortlist"}
              >
                {isShortlistLoading ? (
                  <span className="h-4 w-4 animate-pulse rounded-full bg-gray-200" />
                ) : isShortlisted ? (
                  <GoHeartFill className="text-red-500" />
                ) : (
                  <GoHeart className="text-gray-600" />
                )}
              </button>
            </div>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-400">Configuration</p>
              <p className="font-medium text-gray-800">
                {configurationLabel(project)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Price</p>
              <p className="font-semibold text-[#1e8f4e]">
                {formatPriceRange(project)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Possession</p>
              <p className="font-medium text-gray-800">
                {project.possessionDate || "On request"}
              </p>
            </div>
          </div>

          {!!project.amenities?.length && (
            <ul className="flex flex-wrap gap-2">
              {project.amenities.map((amenity) => (
                <li
                  key={amenity}
                  className="rounded-full bg-[#f3faf6] px-2.5 py-1 text-xs text-[#1e8f4e]"
                >
                  {amenity}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
            <p className="truncate text-sm text-gray-500">
              {project.builderName
                ? `By ${project.builderName}`
                : project.heroTagline || "Builder project"}
            </p>
            <Link
              href={href}
              className="rounded-lg bg-[#27AE60] px-4 py-2 text-sm font-semibold text-white"
            >
              View project
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function NewProjectsExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedCity, locations } = useCity();
  const seededRef = useRef(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const paramsRef = useRef(searchParams.toString());
  const qParam = searchParams.get("q") || "";
  const typedQueryRef = useRef(qParam);
  const [searchText, setSearchText] = useState(qParam);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const city = searchParams.get("city") || "";
  const state = searchParams.get("state") || "";
  const localities = splitList(searchParams.get("locality"));
  const category = searchParams.get("category") || "";
  const minPrice = searchParams.get("minPrice") || "";
  const maxPrice = searchParams.get("maxPrice") || "";
  const bhkValues = splitList(searchParams.get("bhk"));
  const rera = searchParams.get("rera") === "1";
  const possessionValues = splitList(searchParams.get("possession"));
  const builderValues = splitList(searchParams.get("builder"));
  const propertyTypeValues = splitList(searchParams.get("propertyType"));
  const minSqft = searchParams.get("minSqft") || "";
  const maxSqft = searchParams.get("maxSqft") || "";
  const sort = searchParams.get("sort") || "recommended";
  const [areaMin, setAreaMin] = useState(searchParams.get("areaMin") || "");
  const [areaMax, setAreaMax] = useState(searchParams.get("areaMax") || "");
  const [areaUnit, setAreaUnit] = useState(
    searchParams.get("areaUnit") || "sqft",
  );
  const page = Math.max(1, Number(searchParams.get("page") || 1));

  useEffect(() => {
    paramsRef.current = searchParams.toString();
  }, [searchParams]);

  useEffect(() => {
    if (typedQueryRef.current === qParam) return;
    typedQueryRef.current = qParam;
    setSearchText(qParam);
  }, [qParam]);

  useEffect(() => {
    setAreaMin(searchParams.get("areaMin") || "");
    setAreaMax(searchParams.get("areaMax") || "");
    setAreaUnit(searchParams.get("areaUnit") || "sqft");
  }, [searchParams]);

  useEffect(() => {
    if (seededRef.current || !selectedCity?.city) return;
    seededRef.current = true;
    if (searchParams.toString()) return;

    const params = new URLSearchParams();
    params.set("city", selectedCity.city);
    if (selectedCity.state) params.set("state", selectedCity.state);
    router.replace(`/new-projects?${params.toString()}`, { scroll: false });
  }, [router, searchParams, selectedCity]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchText.trim();
      if (next === qParam) return;
      typedQueryRef.current = next;
      const params = new URLSearchParams(paramsRef.current);
      if (next) params.set("q", next);
      else params.delete("q");
      params.delete("page");
      const query = params.toString();
      paramsRef.current = query;
      router.replace(query ? `/new-projects?${query}` : "/new-projects", {
        scroll: false,
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [qParam, router, searchParams, searchText]);

  useEffect(() => {
    const closeSuggestions = (event: MouseEvent) => {
      if (!searchBoxRef.current?.contains(event.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", closeSuggestions);
    return () => document.removeEventListener("mousedown", closeSuggestions);
  }, []);

  const updateParams = (
    patch: Record<string, string | null>,
    keepPage = false,
  ) => {
    const params = new URLSearchParams(paramsRef.current);
    Object.entries(patch).forEach(([key, value]) => {
      if (!value) params.delete(key);
      else params.set(key, value);
    });
    if (!keepPage) params.delete("page");
    const query = params.toString();
    paramsRef.current = query;
    router.replace(query ? `/new-projects?${query}` : "/new-projects", {
      scroll: false,
    });
  };

  const cityRecord = useMemo(
    () =>
      locations.find(
        (item) =>
          item.city.toLowerCase() === city.toLowerCase() &&
          (!state || item.state.toLowerCase() === state.toLowerCase()),
      ),
    [city, locations, state],
  );

  const localitySuggestions = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query || !cityRecord) return [];
    return cityRecord.localities
      .map((item) => item.name)
      .filter(
        (name) =>
          name.toLowerCase().includes(query) &&
          !localities.some((item) => item.toLowerCase() === name.toLowerCase()),
      )
      .slice(0, 6);
  }, [cityRecord, localities, searchText]);

  const sortQuery = useMemo(() => {
    if (sort === "newest") return { sortBy: "createdAt", sortOrder: "desc" as const };
    if (sort === "price-asc") return { sortBy: "priceFrom", sortOrder: "asc" as const };
    if (sort === "price-desc") return { sortBy: "priceFrom", sortOrder: "desc" as const };
    return {};
  }, [sort]);

  const queryParams = useMemo(
    () => ({
      q: qParam || undefined,
      city: city || undefined,
      state: state || undefined,
      locality: localities.join(",") || undefined,
      category: category || undefined,
      minPrice: minPrice || undefined,
      maxPrice: maxPrice || undefined,
      bhk: bhkValues.join(",") || undefined,
      rera,
      possession: possessionValues.join(",") || undefined,
      builder: builderValues.join(",") || undefined,
      propertyType: propertyTypeValues.join(",") || undefined,
      minSqft: minSqft || undefined,
      maxSqft: maxSqft || undefined,
      page,
      limit: 12,
      ...sortQuery,
    }),
    [
      bhkValues,
      builderValues,
      category,
      city,
      localities,
      maxPrice,
      maxSqft,
      minPrice,
      minSqft,
      page,
      possessionValues,
      propertyTypeValues,
      qParam,
      rera,
      sortQuery,
      state,
    ],
  );

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["new-projects", queryParams],
    queryFn: () => searchNewProjects(queryParams) as Promise<SearchResponse>,
    placeholderData: keepPreviousData,
  });

  const projects = data?.items || [];
  const total = data?.meta?.total || 0;
  const pages = data?.meta?.pages || 1;
  const facets = data?.facets || EMPTY_FACETS;
  const knownTypeValues = new Set(
    PROPERTY_TYPE_GROUPS.flatMap((group) => group.values),
  );
  const propertyTypeChoices = [
    ...PROPERTY_TYPE_GROUPS.map((group) => ({
      label: group.label,
      values: group.values.filter((value) =>
        facets.propertyTypes.some((item) => item.name === value),
      ),
    })).filter((group) => group.values.length > 0),
    ...facets.propertyTypes
      .filter((item) => !knownTypeValues.has(item.name))
      .map((item) => ({
        label: titleCaseType(item.name),
        values: [item.name],
      })),
  ];
  const placeLabel = city || "India";
  const showBedrooms = category !== "land" && category !== "agricultural";
  const activeFilterCount =
    Number(Boolean(category)) +
    Number(Boolean(minPrice || maxPrice)) +
    Number(Boolean(bhkValues.length)) +
    Number(rera) +
    localities.length +
    possessionValues.length +
    builderValues.length +
    propertyTypeValues.length +
    Number(Boolean(minSqft || maxSqft));

  const addLocality = (name: string) => {
    updateParams({ locality: [...localities, name].join(",") });
    setSearchText("");
    setSuggestionsOpen(false);
  };

  const filters = (
    <div className="space-y-6">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
        <input
          type="checkbox"
          checked={rera}
          onChange={(event) =>
            updateParams({ rera: event.target.checked ? "1" : null })
          }
          className="h-4 w-4 accent-[#27AE60]"
        />
        RERA registered projects
      </label>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-900">Category</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((option) => {
            const active = category === option.value;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() =>
                  updateParams({ category: option.value || null })
                }
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  active
                    ? "bg-[#27AE60] text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-900">Budget</p>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={minPrice}
            onChange={(event) =>
              updateParams({ minPrice: event.target.value || null })
            }
            className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
            aria-label="Minimum budget"
          >
            <option value="">Min</option>
            {BUDGET_OPTIONS.map((option) => (
              <option key={`min-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={maxPrice}
            onChange={(event) =>
              updateParams({ maxPrice: event.target.value || null })
            }
            className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
            aria-label="Maximum budget"
          >
            <option value="">Max</option>
            {BUDGET_OPTIONS.map((option) => (
              <option key={`max-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showBedrooms && (
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-900">Bedroom</p>
          <div className="grid grid-cols-2 gap-2">
            {BHK_OPTIONS.map((option) => {
              const checked = bhkValues.includes(option.value);
              return (
                <label
                  key={option.value}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? bhkValues.filter((item) => item !== option.value)
                        : [...bhkValues, option.value];
                      updateParams({ bhk: next.join(",") || null });
                    }}
                    className="h-4 w-4 accent-[#27AE60]"
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <FilterBlock title="Possession In">
        <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
          {facets.possession.ready > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={possessionValues.includes("ready")}
                onChange={() =>
                  updateParams({
                    possession:
                      toggleListValue(possessionValues, "ready").join(",") ||
                      null,
                  })
                }
                className="h-4 w-4 accent-[#27AE60]"
              />
              Ready to move
            </label>
          )}
          {facets.possession.newLaunch > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={possessionValues.includes("new-launch")}
                onChange={() =>
                  updateParams({
                    possession:
                      toggleListValue(possessionValues, "new-launch").join(",") ||
                      null,
                  })
                }
                className="h-4 w-4 accent-[#27AE60]"
              />
              New Launch
            </label>
          )}
          {facets.possession.years.map((item) => (
            <label
              key={item.year}
              className="flex items-center gap-2 text-sm text-gray-700"
            >
              <input
                type="checkbox"
                checked={possessionValues.includes(item.year)}
                onChange={() =>
                  updateParams({
                    possession:
                      toggleListValue(possessionValues, item.year).join(",") ||
                      null,
                  })
                }
                className="h-4 w-4 accent-[#27AE60]"
              />
              {item.year}
            </label>
          ))}
          {!facets.possession.ready &&
            !facets.possession.newLaunch &&
            facets.possession.years.length === 0 && (
              <p className="text-xs text-gray-400">No possession dates yet</p>
            )}
        </div>
      </FilterBlock>

      <FilterBlock title="Locality">
        <SearchChecklist
          placeholder="Search Localities"
          items={facets.localities}
          selected={localities}
          emptyLabel="No localities found"
          onToggle={(name) =>
            updateParams({
              locality: toggleListValue(localities, name).join(",") || null,
            })
          }
        />
      </FilterBlock>

      <FilterBlock title="Builder">
        <SearchChecklist
          placeholder="Search Builders"
          heading="Top Builders"
          items={facets.builders}
          selected={builderValues}
          emptyLabel="No builders found"
          onToggle={(name) =>
            updateParams({
              builder: toggleListValue(builderValues, name).join(",") || null,
            })
          }
        />
      </FilterBlock>

      {propertyTypeChoices.length > 0 && (
        <FilterBlock title="Property Type">
          <div className="space-y-2">
            {propertyTypeChoices.map((choice) => {
              const checked = choice.values.every((value) =>
                propertyTypeValues.some(
                  (selected) => selected.toLowerCase() === value,
                ),
              );
              return (
                <label
                  key={choice.label}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? propertyTypeValues.filter(
                            (value) =>
                              !choice.values.includes(value.toLowerCase()),
                          )
                        : Array.from(
                            new Set([
                              ...propertyTypeValues,
                              ...choice.values,
                            ]),
                          );
                      updateParams({
                        propertyType: next.join(",") || null,
                      });
                    }}
                    className="h-4 w-4 accent-[#27AE60]"
                  />
                  {choice.label}
                </label>
              );
            })}
          </div>
        </FilterBlock>
      )}

      <FilterBlock title="Area">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <input
            value={areaMin}
            onChange={(event) => setAreaMin(event.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            placeholder="Min"
            aria-label="Minimum area"
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm"
          />
          <span className="text-gray-400">—</span>
          <input
            value={areaMax}
            onChange={(event) => setAreaMax(event.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            placeholder="Max"
            aria-label="Maximum area"
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm"
          />
        </div>
        <div className="mt-2 flex gap-2">
          <select
            value={areaUnit}
            onChange={(event) => setAreaUnit(event.target.value)}
            aria-label="Area unit"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
          >
            {AREA_UNITS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const factor =
                AREA_UNITS.find((unit) => unit.value === areaUnit)?.factor || 1;
              const min = Number(areaMin);
              const max = Number(areaMax);
              updateParams({
                areaMin: areaMin || null,
                areaMax: areaMax || null,
                areaUnit: areaMin || areaMax ? areaUnit : null,
                minSqft:
                  Number.isFinite(min) && min > 0
                    ? String(Math.round(min * factor))
                    : null,
                maxSqft:
                  Number.isFinite(max) && max > 0
                    ? String(Math.round(max * factor))
                    : null,
              });
            }}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Go
          </button>
        </div>
      </FilterBlock>

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={() =>
            updateParams({
              category: null,
              minPrice: null,
              maxPrice: null,
              bhk: null,
              rera: null,
              locality: null,
              q: null,
              possession: null,
              builder: null,
              propertyType: null,
              minSqft: null,
              maxSqft: null,
              areaMin: null,
              areaMax: null,
              areaUnit: null,
            })
          }
          className="text-sm font-medium text-[#1e8f4e]"
        >
          Clear filters
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f6f8f7]">
      <div className="sticky top-[115px] z-30 border-b border-gray-200 bg-white md:top-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6">
          <nav className="text-sm text-gray-500">
            <Link href="/" className="hover:text-[#27AE60]">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-gray-800">New Projects</span>
            {city && (
              <>
                <span className="mx-1.5">/</span>
                <span className="text-gray-800">{city}</span>
              </>
            )}
          </nav>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <select
              value={city && state ? `${state}||${city}` : city ? `||${city}` : ""}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) {
                  updateParams({
                    city: null,
                    state: null,
                    locality: null,
                    anywhere: "1",
                  });
                  return;
                }
                const [nextState, nextCity] = value.split("||");
                updateParams({
                  city: nextCity || null,
                  state: nextState || null,
                  locality: null,
                  anywhere: null,
                });
              }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium lg:w-52"
              aria-label="City"
            >
              <option value="">All cities</option>
              {city &&
                !locations.some(
                  (item) => item.city.toLowerCase() === city.toLowerCase(),
                ) && <option value={`${state}||${city}`}>{city}</option>}
              {locations.map((item) => (
                <option key={item._id} value={`${item.state}||${item.city}`}>
                  {item.city}
                </option>
              ))}
            </select>

            <div ref={searchBoxRef} className="relative min-w-0 flex-1">
              <div className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3">
                <FiSearch className="shrink-0 text-gray-400" />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-1.5">
                  {localities.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() =>
                        updateParams({
                          locality:
                            localities.filter((item) => item !== name).join(",") ||
                            null,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-full bg-[#e8f8ef] px-2 py-1 text-xs font-medium text-[#1e8f4e]"
                    >
                      {name}
                      <FiX />
                    </button>
                  ))}
                  <input
                    value={searchText}
                    onChange={(event) => {
                      setSearchText(event.target.value);
                      setSuggestionsOpen(true);
                    }}
                    onFocus={() => setSuggestionsOpen(true)}
                    placeholder="Search project, builder or locality"
                    className="min-w-[180px] flex-1 bg-transparent py-1 text-sm outline-none"
                  />
                </div>
              </div>
              {suggestionsOpen && localitySuggestions.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                  {localitySuggestions.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => addLocality(name)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <HiOutlineLocationMarker className="text-[#27AE60]" />
                        <span>
                          {name}
                          {city ? `, ${city}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden h-fit rounded-2xl border border-gray-200 bg-white p-5 lg:block">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Filters</h2>
          {filters}
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
                New Projects in {placeLabel}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {isLoading ? "Searching projects..." : `${total} projects found`}
                {isFetching && !isLoading ? " · Updating" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium lg:hidden"
              >
                Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
              </button>
              <select
                value={sort}
                onChange={(event) =>
                  updateParams({ sort: event.target.value })
                }
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                aria-label="Sort projects"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isError && (
            <div className="rounded-2xl border border-red-100 bg-white p-6 text-center">
              <p className="text-sm text-gray-600">
                Projects could not be loaded.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 rounded-lg bg-[#27AE60] px-4 py-2 text-sm font-semibold text-white"
              >
                Try again
              </button>
            </div>
          )}

          {isLoading && (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-44 animate-pulse rounded-2xl bg-white"
                />
              ))}
            </div>
          )}

          {!isLoading && !isError && projects.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
              <p className="text-lg font-semibold text-gray-900">
                No projects match this search
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Try another city, locality, or a wider budget.
              </p>
              <button
                type="button"
                onClick={() => router.replace("/new-projects?anywhere=1")}
                className="mt-4 rounded-lg bg-[#27AE60] px-4 py-2 text-sm font-semibold text-white"
              >
                Show all projects
              </button>
            </div>
          )}

          {!isLoading && !isError && projects.length > 0 && (
            <div className="space-y-4">
              {projects.map((project) => (
                <ProjectResultCard key={project._id || project.slug} project={project} />
              ))}
            </div>
          )}

          {pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() =>
                  updateParams({ page: String(page - 1) }, true)
                }
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {pages}
              </span>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() =>
                  updateParams({ page: String(page + 1) }, true)
                }
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </section>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(100%,340px)] overflow-y-auto bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Filters</h2>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close"
              >
                <FiX />
              </button>
            </div>
            {filters}
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="mt-6 w-full rounded-lg bg-[#27AE60] py-2.5 text-sm font-semibold text-white"
            >
              Show projects
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
