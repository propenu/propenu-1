"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FeaturedProject } from "@/types";
import { ArrowDropdownIcon } from "@/icons/icons";
import { useCity } from "@/hooks/useCity";
import { RiArrowRightSLine } from "react-icons/ri";
import { getHighlightProjects } from "@/data/ClientData";
import HomeSectionSkeleton from "@/components/HomeSectionSkeleton";
import { minDelay } from "@/utilies/minDelay";
import formatINR from "@/utilies/PriceFormat";
import { getProjectConfigurationLabel } from "@/utilies/projectConfiguration";
import { GoHeart, GoHeartFill } from "react-icons/go";
import Topselllingcomingsoon from "./Topselllingcomingsoon";
import {
  getHomeSectionCache,
  getHomeSectionCacheKey,
  setHomeSectionCache,
} from "@/utilies/homeSectionCache";
import { useShortlist } from "@/hooks/useShortlist";
import { IoMdShareAlt } from "react-icons/io";
import { RATE_LIMIT_RECOVERED_EVENT } from "@/utilies/requestMonitor";
import { trackInteraction } from "@/services/trackingService";

function HighlightProjectCard({ project }: { project: FeaturedProject }) {
  const { isShortlisted, isShortlistLoading, toggleShortlist } = useShortlist(
    project._id,
    "FeaturedProject",
  );
  const projectHref =
    project.promotion?.type === "prime"
      ? `/prime/${project.slug}`
      : `/project/${project.slug}`;

  const shareProject = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const shareUrl =
      typeof window !== "undefined"
        ? new URL(projectHref, window.location.origin).toString()
        : "";
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

  return (
    <Link
      key={project._id}
      href={projectHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        trackInteraction({
          eventType: "project_click",
          eventCategory: "project_engagement",
          entityType: "project",
          projectId: project._id,
          promotionType: project.promotion?.type || "featured",
          source: "homepage",
          placement: "featured_projects",
          metadata: { projectName: project.title, projectSlug: project.slug },
        });
      }}
      className="relative group w-[260px] shrink-0 snap-start cursor-pointer transition-all duration-300 hover:-translate-y-2 sm:w-[280px] md:w-[320px]"
    >
      <div className="relative mt-5 h-[150px] w-full overflow-hidden rounded-2xl shadow-sm transition-shadow duration-300 group-hover:shadow-2xl sm:h-[170px] md:h-[180px]">
        <img
          src={project.heroImage ?? "/images/placeholder.svg"}
          alt={project.title}
          className="h-full w-full object-cover"
        />

        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={shareProject}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow transition-all duration-200 hover:scale-110 active:scale-95"
            title="Share project"
            aria-label="Share project"
          >
            <IoMdShareAlt className="h-4.5 w-4.5 text-gray-700" />
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

      <div className="absolute left-3 right-3 top-[130px] rounded-xl bg-white p-3 shadow-sm transition-shadow duration-300 group-hover:shadow-md sm:top-[140px] md:top-[150px]">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-medium text-gray-900 sm:text-base">
            {project.title}
          </h2>

          <span className="whitespace-nowrap text-sm font-medium">
            {project?.priceFrom ? (
              <>
                <span className="text-[#26ad5f]">
                  {formatINR(project.priceFrom)}
                </span>{" "}
                <span className="text-sm font-light text-[#676666]">
                  onwards
                </span>
              </>
            ) : (
              <span className="text-[#26ad5f]">Price on request</span>
            )}
          </span>
        </div>

        <p className="truncate text-xs font-medium capitalize text-gray-500">
          {getProjectConfigurationLabel(project, "Apartments")}
          {project.locality ? ` • ${project.locality}` : ""}
          {project.state ? `, ${project.state}` : ""}
        </p>
      </div>
    </Link>
  );
}

export default function HighlightProjectsClient() {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const { selectedCity } = useCity();
  const cacheKey = getHomeSectionCacheKey("highlight-projects", {
    state: selectedCity?.state,
    city: selectedCity?.city,
  });
  const [items, setItems] = useState<FeaturedProject[]>(
    () => getHomeSectionCache<FeaturedProject[]>(cacheKey) ?? [],
  );
  const [loading, setLoading] = useState(() => !getHomeSectionCache(cacheKey));
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const retryAfterRateLimit = () => setRetryKey((value) => value + 1);
    window.addEventListener(RATE_LIMIT_RECOVERED_EVENT, retryAfterRateLimit);
    return () =>
      window.removeEventListener(
        RATE_LIMIT_RECOVERED_EVENT,
        retryAfterRateLimit,
      );
  }, []);

  useEffect(() => {
    if (!selectedCity) return;

    const cachedItems = getHomeSectionCache<FeaturedProject[]>(cacheKey);
    if (cachedItems) {
      setItems(cachedItems);
      setLoading(false);
      return;
    }

    let isActive = true;

    setLoading(true);
    setItems([]);

    Promise.all([
      getHighlightProjects({
        state: selectedCity.state,
        city: selectedCity.city,
      }),
      minDelay(),
    ])
      .then(([res]) => {
        if (!isActive) return;

        const nextItems = res.items || [];
        setHomeSectionCache(cacheKey, nextItems);
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

  const hasMoreThanFour = items.length > 4;

  useEffect(() => {
    const slider = sliderRef.current;

    if (!slider || loading || !hasMoreThanFour) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const updateScrollButtons = () => {
      const maxScrollLeft = slider.scrollWidth - slider.clientWidth;
      setCanScrollLeft(slider.scrollLeft > 10);
      setCanScrollRight(slider.scrollLeft < maxScrollLeft - 10);
    };

    let frameId: number;
    const outerFrameId = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(updateScrollButtons);
    });

    slider.addEventListener("scroll", updateScrollButtons, { passive: true });
    window.addEventListener("resize", updateScrollButtons);

    return () => {
      window.cancelAnimationFrame(outerFrameId);
      window.cancelAnimationFrame(frameId);
      slider.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
    };
  }, [items, loading, hasMoreThanFour]);

  const scrollBy = (dir: "left" | "right") => {
    const el = sliderRef.current;
    if (!el) return;
    const step = Math.floor(el.clientWidth / 2);
    el.scrollBy({ left: dir === "left" ? -step : step, behavior: "smooth" });
    setTimeout(() => {
      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      setCanScrollLeft(el.scrollLeft > 10);
      setCanScrollRight(el.scrollLeft < maxScrollLeft - 10);
    }, 350);
  };
  const hasItems = items.length > 0;
  const showViewAll = !loading && hasMoreThanFour;

  return (
    <div className="relative w-full">
      <div className="mb-2 flex items-center justify-between gap-3 sm:mb-3">
        <div className="headingSideBar">
          <h1 className="truncate text-base font-bold sm:text-2xl">
            Top Selling Projects
          </h1>

          <p className="mt-1 truncate text-xs text-gray-500 sm:text-base">
            Investment-worthy in {selectedCity?.city ?? "Hyderabad"}
          </p>
        </div>
        {showViewAll && (
          <Link
            href="/highlight-projects"
            aria-label="View all featured properties"
            className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-green-600 hover:text-green-700 sm:text-base"
          >
            View All <RiArrowRightSLine size={18} />
          </Link>
        )}
      </div>

      <div className="relative">
        {!loading && hasItems && canScrollLeft && (
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollBy("left")}
            className="absolute left-[-1.2%] top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white p-2 shadow-md hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-green-300 sm:inline-flex"
          >
            <ArrowDropdownIcon
              size={16}
              color="#26ad5f"
              className="rotate-90"
            />
          </button>
        )}

        {!loading && hasItems && canScrollRight && (
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollBy("right")}
            className="absolute -right-1 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white p-2 shadow-md hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-green-300 sm:inline-flex"
          >
            <ArrowDropdownIcon
              size={16}
              color="#26ad5f"
              className="rotate-270"
            />
          </button>
        )}

        {loading ? (
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-6 no-scrollbar sm:gap-6">
            <HomeSectionSkeleton variant="highlight" count={3} />
          </div>
        ) : hasItems ? (
          <div
            ref={sliderRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-6 no-scrollbar sm:gap-6"
          >
            {items.map((project) => (
              <HighlightProjectCard key={project._id} project={project} />
            ))}
          </div>
        ) : (
          <Topselllingcomingsoon />
        )}
      </div>
    </div>
  );
}
