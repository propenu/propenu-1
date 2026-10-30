"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HiArrowsUpDown } from "react-icons/hi2";
import FilterBar from "./FilterBar";
import { useAppSelector } from "@/Redux/store";
import { selectCityWithLocalities } from "@/Redux/slice/citySlice";
import { Property } from "@/types/property";
import { IResidential } from "@/types/residential";
import { ICommercial } from "@/types/commercial";
import { ILand } from "@/types/land";
import { IAgricultural } from "@/types/agricultural";
import { useStreamProperties } from "@/hooks/useStreamProperties";
import ResidentialCard from "./cards/ResidentialCard";
import CommercialCard from "./cards/CommercialCard";
import { LandCard } from "./cards/LandCard";
import AgriculturalCard from "./cards/AgriculturalCard";
import FeaturedPropertyCard from "./cards/FeaturedPropertyCard";
import AdCard, { type Ad } from "./cards/AdCard";
import SponsoreCard from "./cards/SponsoreCard";
import ad from "@/asserts/ad.png";
import { buildSearchParams } from "./filters/buildSearchParams";
import { injectSponsored } from "@/utilies/injectSponsored";
import FilterDropdown from "@/ui/FilterDropdown";
import { ArrowDropdownIcon } from "@/icons/icons";
import formatINR from "@/utilies/PriceFormat";
import { trackInteraction } from "@/services/trackingService";

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "price-low-high", label: "Price: Low to High" },
  { value: "price-high-low", label: "Price: High to Low" },
  { value: "area-low-high", label: "Area: Low to High" },
  { value: "area-high-low", label: "Area: High to Low" },
];

const propertySkeletonItems = Array.from({ length: 4 });
const sponsoredSkeletonItems = Array.from({ length: 2 });


function getPropertyLink(property: any) {

  const type = (property.type || "").toLowerCase();
  const promotionType = String(property.promotion?.type || "").toLowerCase();

  switch (type) {
    case "residential":
      return `/properties/residential/${property.slug}`;
    case "commercial":
      return `/properties/commercial/${property.slug}`;
    case "land":
      return `/properties/land/${property.slug}`;
    case "agricultural":
      return `/properties/agricultural/${property.slug}`;
    case "featuredproject":
      return promotionType === "prime"
        ? `/prime/${property.slug}`
        : `/project/${property.slug}`;
    default:
      return "/";
  }
}

function isOwnerProperty(property: Property) {
  const type = (property.type || "").toLowerCase();
  const listingSource = String((property as any)?.listingSource || "user")
    .trim()
    .toLowerCase();

  return (
    type !== "featuredproject" &&
    listingSource !== "builder" &&
    listingSource !== "agent"
  );
}

function isAgentProperty(property: Property) {
  const type = (property.type || "").toLowerCase();
  const listingSource = String((property as any)?.listingSource || "")
    .trim()
    .toLowerCase();

  return type !== "featuredproject" && listingSource === "agent";
}

function getPropertyId(property: Property) {
  return property.id || property._id || "";
}

function isSponsoredPromotion(property: Property) {
  const promotionType = String(property.promotion?.type || "").toLowerCase();

  return promotionType === "sponsored";
}

function isFeaturedProject(property: Property) {
  return String(property.type || "").toLowerCase() === "featuredproject";
}

function dedupePropertiesById(properties: Property[]) {
  const seen = new Set<string>();

  return properties.filter((property) => {
    const id = getPropertyId(property);
    if (!id || seen.has(id)) return false;

    seen.add(id);
    return true;
  });
}

function orderProjectsBeforeProperties(properties: Property[]) {
  return [...properties].sort((a, b) => {
    const aIsProject = isFeaturedProject(a);
    const bIsProject = isFeaturedProject(b);

    if (aIsProject === bIsProject) return 0;

    return aIsProject ? -1 : 1;
  });
}

function getAdLocation(property: Property) {
  return [property.locality, property.city, (property as any).state]
    .filter(Boolean)
    .join(", ");
}

function getAdDisplayCategory(property: Property) {
  const type = String(property.type || "").toLowerCase();
  const projectCategory = (property as any).categoryType || (property as any).category;

  if (type === "featuredproject" && projectCategory) {
    return String(projectCategory);
  }

  return property.type || "";
}

function getAdPriceLabel(property: Property) {
  const priceFrom = Number(property.priceFrom);
  const priceTo = Number(property.priceTo);
  const price = Number(property.price);

  if (
    Number.isFinite(priceFrom) &&
    priceFrom > 0 &&
    Number.isFinite(priceTo) &&
    priceTo > 0 &&
    priceFrom !== priceTo
  ) {
    return `${formatINR(priceFrom)} - ${formatINR(priceTo)}`;
  }

  if (Number.isFinite(priceFrom) && priceFrom > 0) {
    return `From ${formatINR(priceFrom)}`;
  }

  if (Number.isFinite(priceTo) && priceTo > 0) {
    return `Up to ${formatINR(priceTo)}`;
  }

  if (Number.isFinite(price) && price > 0) {
    return formatINR(price);
  }

  return "Price on request";
}

function toTitleCase(value?: string) {
  if (!value) return "";

  return value.replace(/\b\w+/g, (word) =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
  );
}

function readName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readObjectName(value: unknown) {
  if (!value || typeof value !== "object") return "";

  const source = value as {
    builderName?: string;
    companyName?: string;
    name?: string;
    fullName?: string;
  };

  return (
    readName(source.builderName) ||
    readName(source.companyName) ||
    readName(source.name) ||
    readName(source.fullName)
  );
}

function getAboutSummaryBuilderName(aboutSummary: unknown): string {
  if (Array.isArray(aboutSummary)) {
    return aboutSummary.map(readObjectName).find(Boolean) || "";
  }

  if (aboutSummary && typeof aboutSummary === "object") {
    const payload = aboutSummary as { aboutSummary?: unknown };
    return readObjectName(aboutSummary) || getAboutSummaryBuilderName(payload.aboutSummary);
  }

  return "";
}

function getAdBuilderName(property: Property) {
  const aboutSummary = (property as any).aboutSummary;
  const aboutBuilderName = getAboutSummaryBuilderName(aboutSummary);

  const rawContactName =
    aboutBuilderName ||
    readName((property as any).builderName) ||
    readName((property as any).companyName);

  return toTitleCase(rawContactName);
}

function getAdBuilderLabel(property: Property) {
  const type = String(property.type || "").toLowerCase();

  return type === "featuredproject" ? "Marketed by" : "By";
}

function toLocalityList(value: string | string[] | undefined | null): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function formatLocationSummary(localities: string[], city?: string, state?: string) {
  const locationParts: string[] = [];

  if (localities.length === 1) {
    locationParts.push(localities[0]);
  } else if (localities.length > 1) {
    const remainingCount = localities.length - 1;
    locationParts.push(
      `${localities[0]} +${remainingCount} ${remainingCount === 1 ? "locality" : "localities"}`,
    );
  }

  if (city) {
    locationParts.push(city);
  }

  if (state) {
    locationParts.push(state);
  }

  return locationParts.join(", ");
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

function PropertiesListSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading properties" aria-busy="true">
      {propertySkeletonItems.map((_, index) => (
        <div key={`property-skeleton-${index}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
          <div className="flex flex-col gap-4 md:h-[220px] md:flex-row">
            <SkeletonBlock className="h-48 w-full rounded-xl md:h-full md:w-56 md:shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col justify-between p-2 md:p-4">
              <div>
                <SkeletonBlock className="h-6 w-3/4" />
                <SkeletonBlock className="mt-3 h-4 w-1/2" />
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-gray-200 pt-4 md:grid-cols-4 md:gap-6">
                {Array.from({ length: 4 }).map((__, metaIndex) => (
                  <div key={`property-skeleton-meta-${metaIndex}`} className="space-y-2">
                    <SkeletonBlock className="h-4 w-16" />
                    <SkeletonBlock className="h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-[#27AE60]/10 px-3 py-4 md:flex md:w-52 md:flex-col md:justify-center">
              <SkeletonBlock className="h-7 w-24 bg-[#27AE60]/20" />
              <SkeletonBlock className="mt-2 h-4 w-16 bg-[#27AE60]/15" />
              <SkeletonBlock className="mt-4 h-10 w-full rounded-md bg-[#27AE60]/25" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SponsoredCardsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Loading sponsored properties" aria-busy="true">
      {sponsoredSkeletonItems.map((_, index) => (
        <div key={`sponsored-skeleton-${index}`} className="overflow-hidden rounded-2xl bg-white shadow-md">
          <div className="relative h-40 w-full overflow-hidden rounded-t-2xl bg-gray-100">
            <div className="grid h-full grid-cols-2 gap-4 p-6">
              {Array.from({ length: 4 }).map((__, imageIndex) => (
                <SkeletonBlock key={`sponsored-image-skeleton-${index}-${imageIndex}`} className="rounded-lg" />
              ))}
            </div>
          </div>
          <div className="space-y-3 p-3">
            <SkeletonBlock className="h-6 w-24 bg-[#D1EFDD]" />
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-3 w-2/3" />
            <SkeletonBlock className="h-4 w-20 bg-[#27AE60]/20" />
            <SkeletonBlock className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PropertiesPageSkeleton() {
  return (
    <div className="relative min-h-screen">
      <div className="container p-4">
        <div className="flex w-full flex-col gap-4 lg:flex-row">
          <div className="w-full lg:w-[80%]">
            <div className="mb-4 flex items-center justify-between">
              <SkeletonBlock className="h-8 w-64 sm:w-80" />
              <SkeletonBlock className="h-10 w-52 rounded-lg" />
            </div>
            <PropertiesListSkeleton />
          </div>
          <div className="w-full lg:w-[20%]">
            <SponsoredCardsSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterBarFallback() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-[60px] z-50 w-full bg-[#D1EFDD] px-3 shadow-sm md:top-16"
    >
      <div className="container mx-auto flex h-14 items-center gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3 rounded-xl bg-white px-4 py-2 shadow-sm md:w-full lg:w-auto">
          <span className="rounded-md bg-[#D1EFDD] px-3 py-1.5 text-sm font-medium text-[#15803D]">Buy⌄</span>
          <span className="h-5 w-px bg-gray-200" />
          <span className="whitespace-nowrap text-sm text-gray-900">Residential⌄</span>
          <span className="h-5 w-px bg-gray-200" />
          <span className="hidden min-w-40 text-sm text-gray-500 md:block">⌕&nbsp; Enter locality or projects</span>
        </div>
        <div className="hidden flex-1 items-center justify-around gap-4 text-sm font-medium text-[#27AE60] lg:flex">
          <span>Select Locality</span>
          <span>Budget</span>
          <span>BHK</span>
          <span>Posted By</span>
          <span className="rounded-full border border-[#27AE60] bg-white px-4 py-2">More Filters⌄</span>
        </div>
      </div>
    </div>
  );
}


const PropertiesPageContent: React.FC = () => {
  const filters = useAppSelector((s) => s.filters);
  const cityData = useAppSelector(selectCityWithLocalities);
  const searchParams = useSearchParams();
  const urlCity = searchParams.get("city")?.trim() || undefined;
  const urlState = searchParams.get("state")?.trim() || undefined;
  const urlLocality = searchParams.get("locality")?.trim() || undefined;
  const effectiveCity = urlCity ?? cityData?.city;
  const effectiveState = urlState ?? cityData?.state;
  const params = React.useMemo(
    () => {
      const builtParams = buildSearchParams(filters);
      const filterLocality = (builtParams as { locality?: unknown }).locality;

      return {
        ...builtParams,
        city: effectiveCity,
        state: effectiveState,
        locality: filterLocality ?? urlLocality,
      };
    },
    [filters, effectiveCity, effectiveState, urlLocality],
  );
  const searchContextKey = React.useMemo(() => {
    const context = {
      category: params.category,
      type: searchParams.get("type") || params.category,
      listingType: params.listingType,
      search: params.search,
      city: params.city,
      state: params.state,
      locality: params.locality,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      bedrooms: (params as Record<string, unknown>).bedrooms,
    };

    return JSON.stringify(context);
  }, [params, searchParams]);

  React.useEffect(() => {
    const searchContext = JSON.parse(searchContextKey) as Record<string, unknown>;
    const hasSearchIntent = [
      searchContext.search,
      searchContext.city,
      searchContext.locality,
      searchContext.minPrice,
      searchContext.maxPrice,
      searchContext.bedrooms,
    ].some((value) => value !== undefined && value !== null && String(value).trim());

    if (!hasSearchIntent) return;

    trackInteraction({
      eventType: searchContext.search ? "search_performed" : "filter_applied",
      eventCategory: "search",
      source: "properties_results",
      searchContext: {
        ...searchContext,
        targetPath: `${window.location.pathname}${window.location.search}`,
      },
    });
  }, [searchContextKey]);

  const { items, sponsored, loading, total, meta } = useStreamProperties(params);
  const [sortBy, setSortBy] = React.useState("newest");
  const [sortDropdownOpen, setSortDropdownOpen] = React.useState(false);
  const [dismissedAds, setDismissedAds] = useState<Set<string>>(new Set());
  const listingSourceFilter = String((params as any).listingSource || "").toLowerCase();
  const isOwnerFilterActive =
    listingSourceFilter === "user";
  const isAgentFilterActive =
    listingSourceFilter === "agent";

  const selectedSortOption =
    sortOptions.find((option) => option.value === sortBy) ?? sortOptions[0];

  const renderPropertyCard = (p: Property, index: number) => {
    const baseCardKey = getPropertyId(p) || p.slug || "property";
    const cardKey = `${String(p.type || "property").toLowerCase()}-${baseCardKey}-${index}`;
    const propertyForCard = {
      ...p,
      listingType: p.listingType || params.listingType,
    };
    const type = (propertyForCard.type || "").toLowerCase();
    const isSponsored = propertyForCard.promotion?.type === "sponsored";

    switch (type) {
      case "featuredproject":
        return <FeaturedPropertyCard key={cardKey} p={propertyForCard} />;

      case "residential":
        return (
          <ResidentialCard
            key={cardKey}
            p={propertyForCard as IResidential}
            isSponsored={isSponsored}
          />
        );

      case "commercial":
        return (
          <CommercialCard
            key={cardKey}
            p={propertyForCard as unknown as ICommercial} // safe after type check
            isSponsored={isSponsored}
          />
        );
      case "land":
        return (
          <LandCard
            key={cardKey}
            p={propertyForCard as ILand}
            isSponsored={isSponsored}
          />
        );

      case "agricultural":
        return (
          <AgriculturalCard
            key={cardKey}
            p={propertyForCard as IAgricultural}
            isSponsored={isSponsored}
          />
        );

      default:
        return <div>No card found</div>;
    }
  };

  const selectedLocalities = (() => {
    switch (filters.category) {
      case "Residential":
        return toLocalityList(filters.residential.locality);
      case "Commercial":
        return toLocalityList(filters.commercial.locality);
      case "Land":
        return toLocalityList(filters.land.locality);
      case "Agricultural":
        return toLocalityList(filters.agricultural.locality);
      default:
        return [];
    }
  })();

  const locationLabel = formatLocationSummary(
    selectedLocalities,
    effectiveCity,
    effectiveState,
  );

  const getAreaValue = (property: Property): number => {
    const candidate = [
      property.superBuiltUpArea,
      property.projectArea,
      (property as any)?.builtUpArea,
      (property as any)?.plotArea,
      (property as any)?.totalArea?.value,
    ].find((v) => typeof v === "number" && Number.isFinite(v));

    if (
      typeof property.builtUpArea === "object" &&
      typeof property.builtUpArea?.min === "number"
    ) {
      return property.builtUpArea.min;
    }

    return typeof candidate === "number" ? candidate : 0;
  };

  const sortedItems = React.useMemo(() => {
    const list = isOwnerFilterActive
      ? items.filter(isOwnerProperty)
      : isAgentFilterActive
        ? items.filter(isAgentProperty)
        : [...items];

    switch (sortBy) {
      case "price-low-high":
        return list.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      case "price-high-low":
        return list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      case "area-low-high":
        return list.sort((a, b) => getAreaValue(a) - getAreaValue(b));
      case "area-high-low":
        return list.sort((a, b) => getAreaValue(b) - getAreaValue(a));
      case "oldest":
        return list.sort(
          (a, b) =>
            new Date(a.createdAt ?? 0).getTime() -
            new Date(b.createdAt ?? 0).getTime(),
        );
      case "newest":
      default:
        return list.sort(
          (a, b) =>
            new Date(b.createdAt ?? 0).getTime() -
            new Date(a.createdAt ?? 0).getTime(),
        );
    }
  }, [items, isOwnerFilterActive, isAgentFilterActive, sortBy]);

  const filteredSponsored = React.useMemo(() => {
    if (isOwnerFilterActive) return sponsored.filter(isOwnerProperty);
    if (isAgentFilterActive) return sponsored.filter(isAgentProperty);
    return sponsored;
  }, [sponsored, isOwnerFilterActive, isAgentFilterActive]);

  const sidebarPromotions = React.useMemo(() => {
    return orderProjectsBeforeProperties(
      dedupePropertiesById(filteredSponsored.filter(isSponsoredPromotion)),
    );
  }, [filteredSponsored]);

  const organicItems = React.useMemo(() => {
    return dedupePropertiesById(
      sortedItems.filter((property) => !isSponsoredPromotion(property)),
    );
  }, [sortedItems]);

  const finalList = React.useMemo(() => {
    return injectSponsored(organicItems, sidebarPromotions, 5);
  }, [organicItems, sidebarPromotions]);

  const sidebarAds = React.useMemo(() => {
    return sidebarPromotions
      .slice(0, 10)
      .filter((ad) => !dismissedAds.has(getPropertyId(ad)))
      .map((property) => ({
        id: getPropertyId(property),
        title: property.title || "Featured Property",
        description: undefined,
        location: getAdLocation(property),
        priceLabel: getAdPriceLabel(property),
        builderName: getAdBuilderName(property),
        builderLabel: getAdBuilderLabel(property),
        imageUrl:
          (property as any).heroImage ||
          property.gallery?.[0]?.url ||
          property.gallerySummary?.[0]?.url ||
          ad.src,
        ctaText: "View Details",
        ctaLink: getPropertyLink(property),
        category: property.type || "Featured",
        displayCategory: getAdDisplayCategory(property),
        featured: property.promotion?.type === "featured",
        sponsored: true,
        promotionType: property.promotion?.type,
      } as Ad));
  }, [sidebarPromotions, dismissedAds]);

  const sponsorCardTarget =
    meta?.resultMode === "projects-only" ||
    sidebarPromotions.some(isFeaturedProject)
      ? "project"
      : "property";

  const handleDismissAd = (adId: string) => {
    setDismissedAds((prev) => new Set([...prev, adId]));
  };

  return (
    <div className="relative min-h-screen ">
      <div className="container p-4">
        <div className="flex w-full flex-col gap-4 lg:flex-row">
          <div className="w-full lg:w-[80%]">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {loading ? (
                <SkeletonBlock className="h-8 w-64 sm:w-80" />
              ) : (
                <p className="text-base capitalize leading-snug text-gray-700 wrap-break-word sm:text-lg md:text-xl lg:text-2xl">
                  <strong>{total ?? items.length}</strong> Properties for{" "}
                  {params.listingType} in
                  {locationLabel ? ` ${locationLabel}` : " your area"}
                </p>
              )}

              <FilterDropdown
                open={sortDropdownOpen}
                onOpenChange={setSortDropdownOpen}
                triggerLabel={
                  <button
                    type="button"
                    className="inline-flex w-fit min-w-[188px] max-w-[220px] items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 cursor-pointer sm:min-w-[210px] sm:gap-3 sm:rounded-md"
                    aria-label="Sort properties"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <HiArrowsUpDown className="h-4 w-4 shrink-0 text-gray-500" />
                      <span className="truncate">{selectedSortOption.label}</span>
                    </span>
                    <ArrowDropdownIcon
                      size={12}
                      color="#374151"
                      className={`shrink-0 transition-transform duration-200 ${sortDropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                }
                width="w-56"
                align="right"
                backdropClassName="fixed inset-0 z-40"
                renderContent={(close) => (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-gray-900">
                      Sort Properties
                    </h4>
                    <div className="flex flex-col gap-1">
                      {sortOptions.map((option) => {
                        const selected = option.value === sortBy;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setSortBy(option.value);
                              close();
                            }}
                            className={`rounded px-2 py-1.5 text-left text-sm transition-colors cursor-pointer ${
                              selected
                                ? "bg-[#D1EFDD] font-semibold text-[#15803D]"
                                : "text-gray-700 hover:bg-gray-100"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              />
            </div>

            {loading ? (
              <PropertiesListSkeleton />
            ) : (
              finalList.map((p, index) => renderPropertyCard(p, index))
            )}

            {!loading && sortedItems.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">No properties found</h2>
                <p className="mt-2 text-sm text-gray-600">
                  Try changing your filters or broadening your search.
                </p>
              </div>
            )}
          </div>

          <div className="w-full lg:w-[20%]">
            <div className="flex flex-col gap-6">
              {loading ? (
                <SponsoredCardsSkeleton />
              ) : (
                <>
                  {sidebarAds.map((ad) => (
                    <AdCard key={ad.id} ad={ad} onDismiss={handleDismissAd} />
                  ))}
                  {sidebarAds.length === 0 && sortedItems.length > 0 && (
                    <SponsoreCard target={sponsorCardTarget} />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Page: React.FC = () => (
  <>
    <Suspense fallback={<FilterBarFallback />}>
      <FilterBar />
    </Suspense>
    <Suspense fallback={<PropertiesPageSkeleton />}>
      <PropertiesPageContent />
    </Suspense>
  </>
);

export default Page;
