"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FeaturedProject } from "@/types";
import { ArrowDropdownIcon } from "@/icons/icons";
import { useCity } from "@/hooks/useCity";
import Image from "next/image";
import formatINR from "@/utilies/PriceFormat";
import { getFeaturedProjects, PrimeDisplayMode } from "@/data/ClientData";
import { minDelay } from "@/utilies/minDelay";
import { getProjectConfigurationLabel } from "@/utilies/projectConfiguration";
import {
  getHomeSectionCache,
  getHomeSectionCacheKey,
  setHomeSectionCache,
} from "@/utilies/homeSectionCache";
import { useShortlist } from "@/hooks/useShortlist";
import { GoHeart, GoHeartFill } from "react-icons/go";
import { IoMdShareAlt } from "react-icons/io";
import { RATE_LIMIT_RECOVERED_EVENT } from "@/utilies/requestMonitor";
import { trackInteraction } from "@/services/trackingService";

const sortProjectsByRank = (projects: FeaturedProject[]) =>
  [...projects].sort((a, b) => {
    const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;

    return rankA - rankB;
  });

type PrimeSectionCache = {
  items: FeaturedProject[];
  displayMode: PrimeDisplayMode;
};

function getPriceLabel(price?: number) {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return "Price on Request";
  }

  return `${formatINR(price)} onwards`;
}

function PrimeProjectCard({
  project,
  showRankBadge,
  cardWidth,
}: {
  project: FeaturedProject;
  showRankBadge: boolean;
  cardWidth?: number;
}) {
  const { isShortlisted, isShortlistLoading, toggleShortlist } = useShortlist(
    project._id,
    "FeaturedProject",
  );
  const projectHref = `/prime/${project.slug}`;

  const shareProject = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const shareUrl =
      typeof window !== "undefined" ? new URL(projectHref, window.location.origin).toString() : "";
    const shareData = {
      title: project.title,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Ignore cancelled share or clipboard errors.
    }
  };

  const openProject = () => {
    trackInteraction({
      eventType: "project_click",
      eventCategory: "project_engagement",
      entityType: "project",
      projectId: project._id,
      promotionType: project.promotion?.type || "prime",
      source: "homepage",
      placement: "prime_projects",
      metadata: { projectName: project.title, projectSlug: project.slug },
    });

    if (typeof window !== "undefined") {
      window.open(projectHref, "_blank", "noopener,noreferrer");
    }
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      openProject();
    }
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={openProject}
      onKeyDown={handleCardKeyDown}
      style={cardWidth ? { width: `${cardWidth}px` } : undefined}
      className="shrink-0 w-[90%] sm:w-[calc(50%-0.5rem)] lg:w-[calc(50%-0.5rem)] card snap-start group cursor-pointer"
    >
      <div className="relative block overflow-hidden rounded-t-md h-40 sm:h-[50px] md:h-[200px] lg:h-[220px]">
        <Image
          src={project.heroImage ?? "/images/placeholder.svg"}
          alt={project.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />


        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={shareProject}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow transition-all duration-200 hover:scale-110 active:scale-95"
            title="Share project"
            aria-label="Share project"
          >
            <IoMdShareAlt className="h-5 w-5 text-gray-700" />
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleShortlist();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow transition-all duration-200 hover:scale-110 active:scale-95"
            title={isShortlisted ? "Remove from shortlist" : "Shortlist"}
            aria-label={isShortlisted ? "Remove from shortlist" : "Shortlist"}
          >
            {isShortlistLoading ? (
              <span className="block h-5 w-5 animate-pulse rounded-full bg-gray-300" />
            ) : isShortlisted ? (
              <GoHeartFill className="h-5 w-5 text-red-500" />
            ) : (
              <GoHeart className="h-5 w-5 text-gray-600 hover:text-red-500" />
            )}
          </button>
        </div>
      </div>

      <div className="p-3 flex justify-between items-center gap-3">
        <div className="shrink-0">
          <Image
            src={project?.logo?.url ?? "/images/placeholder.svg"}
            alt={`${project.title} logo`}
            width={64}
            height={64}
            className="object-contain rounded-md w-16 h-16 sm:w-20 sm:h-20"
          />
        </div>

        <div className="flex flex-col justify-center grow min-w-0">
          <h2 className="text-lg md:text-xl font-medium text-left truncate">
            {project.title}
          </h2>

          {project.address && (
            <p className="text-gray-500 text-sm mt-1 truncate">
              {project.address}
            </p>
          )}
        </div>

        <div className="text-right flex flex-col items-end gap-1 shrink-0">
          <p className="text-gray-600 font-light text-sm md:text-base">
            {getProjectConfigurationLabel(project, "Flats")}
          </p>

          <p className="text-[#26ad5f] text-sm md:text-base font-medium">
            {getPriceLabel(project?.priceFrom)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FeaturedProjectsClient() {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const [isSliderPaused, setIsSliderPaused] = useState(false);
  const [cardWidth, setCardWidth] = useState<number>();
  const [cardsPerView, setCardsPerView] = useState(2);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitionEnabled, setIsTransitionEnabled] = useState(true);
  const { selectedCity } = useCity();
  const cacheKey = getHomeSectionCacheKey("featured-projects", {
    state: selectedCity?.state,
    city: selectedCity?.city,
  });
  const cachedSection = getHomeSectionCache<PrimeSectionCache>(cacheKey);
  const [items, setItems] = useState<FeaturedProject[]>(
    () => cachedSection?.items ?? [],
  );
  const [loading, setLoading] = useState(() => !cachedSection);
  const [displayMode, setDisplayMode] = useState<PrimeDisplayMode>(
    () => cachedSection?.displayMode ?? "ranked",
  );
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const retryAfterRateLimit = () => setRetryKey((value) => value + 1);
    window.addEventListener(RATE_LIMIT_RECOVERED_EVENT, retryAfterRateLimit);
    return () => window.removeEventListener(RATE_LIMIT_RECOVERED_EVENT, retryAfterRateLimit);
  }, []);

  useEffect(() => {
    if (!selectedCity) return;

    const cachedItems = getHomeSectionCache<PrimeSectionCache>(cacheKey);
    if (cachedItems?.items) {
      setItems(cachedItems.items);
      setDisplayMode(cachedItems.displayMode === "shuffle" ? "shuffle" : "ranked");
      setLoading(false);
      return;
    }

    let isActive = true;

    setLoading(true);
    setItems([]);

    Promise.all([
      getFeaturedProjects({
        state: selectedCity.state,
        city: selectedCity.city,
      }),
      minDelay(),
    ])
      .then(([res]) => {
        if (!isActive) return;

        const nextMode: PrimeDisplayMode =
          res.displayMode === "shuffle" ? "shuffle" : "ranked";
        const nextItems =
          nextMode === "shuffle"
            ? res.items || []
            : sortProjectsByRank(res.items || []);
        setHomeSectionCache(cacheKey, { items: nextItems, displayMode: nextMode });
        setDisplayMode(nextMode);
        setItems(nextItems);
      })
      .catch((err) => {
        if (!isActive) return;
        console.error("❌ Featured fetch failed:", err);
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

  const displayItems = items;

  // Gate: arrows only make sense when there are more than 2 cards.
  const hasMoreThanTwo = displayItems.length > 2;
  const originalCount = displayItems.length;
  const loopItems = hasMoreThanTwo
    ? [...displayItems, ...displayItems, ...displayItems]
    : displayItems;
  const slideOffset = cardWidth ? currentIndex * (cardWidth + 16) : 0;

  const enableTransitionAfterPaint = useCallback(() => {
    if (transitionFrameRef.current) {
      window.cancelAnimationFrame(transitionFrameRef.current);
    }

    transitionFrameRef.current = window.requestAnimationFrame(() => {
      transitionFrameRef.current = window.requestAnimationFrame(() => {
        setIsTransitionEnabled(true);
        transitionFrameRef.current = null;
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (transitionFrameRef.current) {
        window.cancelAnimationFrame(transitionFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const slider = sliderRef.current;

    if (!slider) {
      return;
    }

    const updateCardWidth = () => {
      const width = slider.clientWidth;
      const gap = 16;
      const nextCardsPerView = width < 640 ? 1 : 2;
      setCardsPerView(nextCardsPerView);
      setCardWidth(
        nextCardsPerView === 1
          ? Math.floor(width * 0.9)
          : Math.floor((width - gap) / 2),
      );
    };

    updateCardWidth();
    setCanScrollLeft(hasMoreThanTwo);
    setCanScrollRight(hasMoreThanTwo);

    const resizeObserver = new ResizeObserver(updateCardWidth);
    resizeObserver.observe(slider);

    return () => {
      resizeObserver.disconnect();
    };
  }, [displayItems, hasMoreThanTwo]);

  useEffect(() => {
    if (!hasMoreThanTwo) {
      setCurrentIndex(0);
      return;
    }

    setIsTransitionEnabled(false);
    setCurrentIndex(originalCount);

    enableTransitionAfterPaint();
  }, [cardsPerView, enableTransitionAfterPaint, hasMoreThanTwo, originalCount]);

  useEffect(() => {
    if (!hasMoreThanTwo || loading || isSliderPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setIsTransitionEnabled(true);
      setCurrentIndex((value) => value + cardsPerView);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [cardsPerView, hasMoreThanTwo, isSliderPaused, loading]);

  const normalizeLoopIndex = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") {
      return;
    }

    if (!hasMoreThanTwo || originalCount === 0) return;

    if (currentIndex >= originalCount * 2 || currentIndex < originalCount) {
      const normalizedIndex =
        originalCount + (((currentIndex % originalCount) + originalCount) % originalCount);

      setIsTransitionEnabled(false);
      setCurrentIndex(normalizedIndex);
      enableTransitionAfterPaint();
    }
  };

  const scrollBy = (dir: "left" | "right") => {
    if (!hasMoreThanTwo) return;

    setIsTransitionEnabled(true);
    setCurrentIndex((value) =>
      dir === "left" ? value - cardsPerView : value + cardsPerView,
    );
  };

  const hasItems = displayItems.length > 0;

  if (!hasItems) {
    return null;
  }

  return (
    <div className="relative w-full">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="headingSideBar">
          <h1 className="text-base font-bold sm:text-2xl truncate">
            Prime Projects
          </h1>

          <p className="mt-1 text-sm text-gray-500 sm:text-base">
            Stand out for the lifestyle they offer in {selectedCity?.city ?? "Hyderabad"}
          </p>
        </div>
        {/* <Link
          href="/prime"
          aria-label="View all prime projects"
          className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-green-600 hover:text-green-700 sm:text-base"
        >
          View All <RiArrowRightSLine size={18} />
        </Link> */}
      </div>

      {/* Slider area — own relative wrapper so arrow top-1/2 is scoped here */}
      <div className="relative">
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

        {/* Scrollable Row */}
        {!loading && hasItems ? (
          <div
            ref={sliderRef}
            onMouseEnter={() => setIsSliderPaused(true)}
            onMouseLeave={() => setIsSliderPaused(false)}
            onFocus={() => setIsSliderPaused(true)}
            onBlur={() => setIsSliderPaused(false)}
            className="overflow-hidden px-1 py-2"
          >
            <div
              onTransitionEnd={normalizeLoopIndex}
              className={`flex w-max gap-4 ${
                isTransitionEnabled ? "transition-transform duration-700 ease-in-out" : ""
              }`}
              style={{ transform: `translateX(-${slideOffset}px)` }}
            >
              {loopItems.map((project, index) => (
                <PrimeProjectCard
                  key={`${project._id}-${index}`}
                  project={project}
                  showRankBadge={displayMode === "ranked"}
                  cardWidth={cardWidth}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}



