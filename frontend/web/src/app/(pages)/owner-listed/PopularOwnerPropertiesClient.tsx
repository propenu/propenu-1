"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RiArrowRightSLine } from "react-icons/ri";
import { ArrowDropdownIcon } from "@/icons/icons";
import { PopularOwnerProperty } from "@/types";
import ResidentialCard from "../properties/cards/ResidentialCard";
import CommercialCard from "../properties/cards/CommercialCard";
import { LandCard } from "../properties/cards/LandCard";
import AgriculturalCard from "../properties/cards/AgriculturalCard";
import { getOwnerProperties } from "@/data/ClientData";
import { useCity } from "@/hooks/useCity";
import { IResidential } from "@/types/residential";
import { IAgricultural } from "@/types/agricultural";
import { ILand } from "@/types/land";
import { ICommercial } from "@/types/commercial";
import HomeSectionSkeleton from "@/components/HomeSectionSkeleton";
import { minDelay } from "@/utilies/minDelay";
import {
  getHomeSectionCache,
  getHomeSectionCacheKey,
  setHomeSectionCache,
} from "@/utilies/homeSectionCache";
import OwnerComingSoon from "./OwnerComingSoon";
import { RATE_LIMIT_RECOVERED_EVENT } from "@/utilies/requestMonitor";

type OwnerCardItem = PopularOwnerProperty & {
  id?: string;
  _id?: string;
  rank?: number;
  type?: string;
};

const sortOwnerPropertiesByRank = (properties: OwnerCardItem[]) =>
  [...properties].sort((a, b) => {
    const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;

    return rankA - rankB;
  });

const PopularOwnerPropertiesClient = () => {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const { selectedCity } = useCity();
  const cacheKey = getHomeSectionCacheKey("owner-properties", {
    state: selectedCity?.state,
    city: selectedCity?.city,
  });
  const [items, setItems] = useState<OwnerCardItem[]>(
    () =>
      sortOwnerPropertiesByRank(
        getHomeSectionCache<OwnerCardItem[]>(cacheKey) ?? [],
      ),
  );
  const [loading, setLoading] = useState(() => !getHomeSectionCache(cacheKey));
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasHiddenProperties, setHasHiddenProperties] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const retryAfterRateLimit = () => setRetryKey((value) => value + 1);
    window.addEventListener(RATE_LIMIT_RECOVERED_EVENT, retryAfterRateLimit);
    return () => window.removeEventListener(RATE_LIMIT_RECOVERED_EVENT, retryAfterRateLimit);
  }, []);

  useEffect(() => {
    if (!selectedCity) return;

    const cachedItems = getHomeSectionCache<OwnerCardItem[]>(cacheKey);
    if (cachedItems) {
      setItems(sortOwnerPropertiesByRank(cachedItems));
      setLoading(false);
      return;
    }

    let isActive = true;

    setLoading(true);
    setItems([]);

    Promise.all([
      getOwnerProperties({
        state: selectedCity.state,
        city: selectedCity.city,
      }),
      minDelay(),
    ])
      .then(([res]: [{ items?: OwnerCardItem[]; properties?: OwnerCardItem[] }, unknown]) => {
        if (!isActive) return;

        const source = res.items ?? res.properties ?? [];
        const normalized = sortOwnerPropertiesByRank(
          source.map((item: OwnerCardItem) => ({
            ...item,
            id: item.id ?? item._id,
          })),
        );
        setHomeSectionCache(cacheKey, normalized);
        setItems(normalized);
      })
      .catch((err) => {
        if (!isActive) return;
        console.error("❌ Owner properties fetch failed:", err);
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [cacheKey, selectedCity, retryKey]);

  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider || loading || items.length === 0) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      setHasHiddenProperties(false);
      return;
    }

    const updateScrollButtons = () => {
      const maxScrollLeft = slider.scrollWidth - slider.clientWidth;

      setCanScrollLeft(slider.scrollLeft > 10);
      setCanScrollRight(slider.scrollLeft < maxScrollLeft - 10);
      setHasHiddenProperties(maxScrollLeft > 10);
    };

    const frameId = window.requestAnimationFrame(updateScrollButtons);
    slider.addEventListener("scroll", updateScrollButtons);
    window.addEventListener("resize", updateScrollButtons);

    return () => {
      window.cancelAnimationFrame(frameId);
      slider.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
    };
  }, [items, loading]);

  const scrollBy = (dir: "left" | "right") => {
    const el = sliderRef.current;
    if (!el) return;
    const step = Math.floor(el.clientWidth / 2);
    el.scrollBy({ left: dir === "left" ? -step : step, behavior: "smooth" });
  };
  const hasItems = items.length > 0;
  const showViewAll = !loading && hasItems && hasHiddenProperties;

  return (
    <section className="relative w-full">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-3 sm:mb-3">
        {/* Left: Heading */}
        <div className="headingSideBar">
          <h1 className="text-base font-bold sm:text-2xl truncate">
            Owner Properties
          </h1>

          <p className="mt-1 text-xs text-gray-500 sm:text-base truncate">
            Simplify your home search in {selectedCity?.city ?? "Hyderabad"}
          </p>
        </div>

        {/* Right: View All */}
        {showViewAll && (
          <Link
            href="/properties?postedBy=owner"
            aria-label="View all owner properties"
            className="shrink-0 flex items-center gap-1 text-sm sm:text-base text-green-600 hover:text-green-700 font-medium whitespace-nowrap"
          >
            View All <RiArrowRightSLine size={18} />
          </Link>
        )}
      </div>

      {/* Left arrow */}
      {!loading && hasItems && canScrollLeft && (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollBy("left")}
          className="absolute left-[-1.2%] top-1/2 -translate-y-1/2 z-20 hidden sm:inline-flex items-center justify-center bg-white p-2 rounded-full shadow-md hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-green-300"
        >
          <ArrowDropdownIcon size={16} color="#26ad5f" className="rotate-90" />
        </button>
      )}

      {/* Carousel */}
      {loading ? (
        <div
          ref={sliderRef}
          className="flex gap-4 overflow-x-auto scroll-smooth no-scrollbar px-1 py-2 snap-x snap-mandatory scroll-px-1"
        >
          <HomeSectionSkeleton variant="owner" count={3} />
        </div>
      ) : hasItems ? (
        <div
          ref={sliderRef}
          className="flex gap-4 overflow-x-auto scroll-smooth no-scrollbar px-1 py-2 snap-x snap-mandatory scroll-px-1"
        >
          {items.map((item) => {
            const wrapperClass = "lg:snap-start snap-center flex-shrink-0";

            if (item.type === "residential") {
              return (
                <div key={item._id} className={wrapperClass}>
                  <ResidentialCard p={item as unknown as IResidential} vertical={true} />
                </div>
              );
            }
            if (item.type === "commercial") {
              return (
                <div key={item._id} className={wrapperClass}>
                  <CommercialCard p={item as unknown as ICommercial} vertical={true} />
                </div>
              );
            }
            if (item.type === "land") {
              return (
                <div key={item._id} className={wrapperClass}>
                  <LandCard p={item as unknown as ILand} vertical={true} />
                </div>
              );
            }
            if (item.type === "agricultural") {
              return (
                <div key={item._id} className={wrapperClass}>
                  <AgriculturalCard p={item as unknown as IAgricultural} vertical={true} />
                </div>
              );
            }
            return null;
          })}
        </div>
      ) : (
        <OwnerComingSoon city={selectedCity?.city} />
      )}

      {/* Right arrow */}
      {!loading && hasItems && canScrollRight && (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollBy("right")}
          className="absolute right-[-1.2%] top-1/2 -translate-y-1/2 z-20 hidden sm:inline-flex items-center justify-center bg-white p-2 rounded-full shadow-md hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-green-300"
        >
          <ArrowDropdownIcon size={16} color="#26ad5f" className="rotate-270" />
        </button>
      )}
    </section>
  );
};

export default PopularOwnerPropertiesClient;
