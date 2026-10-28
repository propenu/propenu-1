"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowDropdownIcon } from "@/icons/icons";
import { MdLocationPin, MdVerifiedUser } from "react-icons/md"; // Added MdVerified import
import { AgentConnect } from "@/types";
import { RiArrowRightSLine } from "react-icons/ri";
import { useCity } from "@/hooks/useCity";
import { getAgentConnect } from "@/data/ClientData";
import HomeSectionSkeleton from "@/components/HomeSectionSkeleton";
import { minDelay } from "@/utilies/minDelay";
import {
  getHomeSectionCache,
  getHomeSectionCacheKey,
  setHomeSectionCache,
} from "@/utilies/homeSectionCache";
import AgentsComingSoon from "./AgentsComingSoon";

export default function AgentsList() {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const { selectedCity } = useCity();
  const cacheKey = getHomeSectionCacheKey("agent-connect", {
    city: selectedCity?.city,
  });
  const [agents, setAgents] = useState<AgentConnect[]>(
    () => getHomeSectionCache<AgentConnect[]>(cacheKey) ?? [],
  );
  const [loading, setLoading] = useState(() => !getHomeSectionCache(cacheKey));
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    if (!selectedCity) return;

    const cachedAgents = getHomeSectionCache<AgentConnect[]>(cacheKey);
    if (cachedAgents) {
      setAgents(cachedAgents);
      setLoading(false);
      return;
    }

    let isActive = true;

    setLoading(true);
    setAgents([]);

    Promise.all([
      getAgentConnect({
        city: selectedCity.city,
      }),
      minDelay(),
    ])
      .then(([res]) => {
        if (!isActive) return;

        const nextAgents = res.items || [];
        setHomeSectionCache(cacheKey, nextAgents);
        setAgents(nextAgents);
      })
      .catch((err) => {
        if (!isActive) return;
        console.error("❌ Agent fetch failed:", err);
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [cacheKey, selectedCity]);

  // Gate: arrows only make sense when there are more than 4 cards.
  const hasMoreThanFour = agents.length > 4;

  useEffect(() => {
    const slider = sliderRef.current;

    // Reset when there are no cards, still loading, or ≤4 cards.
    if (!slider || loading || !hasMoreThanFour) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const updateScrollButtons = () => {
      const maxScrollLeft = slider.scrollWidth - slider.clientWidth;
      // Left arrow: only after the user has scrolled away from the start.
      setCanScrollLeft(slider.scrollLeft > 10);
      // Right arrow: hidden only when fully scrolled to the end.
      setCanScrollRight(slider.scrollLeft < maxScrollLeft - 10);
    };

    // Double-rAF: wait for two paint frames so the DOM has fully reflowed
    // before measuring scrollWidth (single rAF can fire before layout is done).
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
  }, [agents, loading, hasMoreThanFour]);

  const scrollBy = (dir: "left" | "right") => {
    const el = sliderRef.current;
    if (!el) return;
    const step = Math.floor(el.clientWidth / 2);
    el.scrollBy({ left: dir === "left" ? -step : step, behavior: "smooth" });
    // Re-evaluate after the smooth scroll animation (~300 ms) finishes.
    setTimeout(() => {
      if (!el) return;
      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      setCanScrollLeft(el.scrollLeft > 10);
      setCanScrollRight(el.scrollLeft < maxScrollLeft - 10);
    }, 350);
  };

  const hasItems = agents.length > 0;
  // "View All" link is shown only when there are overflow cards.
  const showViewAll = !loading && hasMoreThanFour;

  return (
    <div className="relative w-full">
      {/* Header Section */}
      <div className="mb-2 flex items-center justify-between gap-3 sm:mb-3">
        {/* Left: Heading */}
        <div className="headingSideBar">
          <h1 className="text-base font-bold sm:text-2xl truncate">
            Agent Connect
          </h1>

          <p className="mt-1 text-xs text-gray-500 sm:text-base truncate">
            Expert help, simplified
          </p>
        </div>

        {/* Right: View All */}
        {showViewAll && (
          <Link
            href="/agent-connect"
            aria-label="View all agents"
            className="shrink-0 flex items-center gap-1 text-sm sm:text-base text-green-600 hover:text-green-700 font-medium whitespace-nowrap"
          >
            View All <RiArrowRightSLine size={18} />
          </Link>
        )}
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

        {/* Scrollable Container */}
        {loading ? (
          <div className="flex gap-5 overflow-x-auto scroll-smooth no-scrollbar pb-8 pt-2 px-0">
            <HomeSectionSkeleton variant="agent" count={4} />
          </div>
        ) : hasItems ? (
          <div
            ref={sliderRef}
            className="flex gap-5 overflow-x-auto scroll-smooth no-scrollbar pb-8 pt-2 px-1"
          >
            {agents.map((agent) => (
              <div
                key={agent._id}
                className="w-full sm:w-[calc(33.333%-14px)] md:w-[calc(33.333%-14px)] lg:w-[calc(25%-15px)] shrink-0 flex flex-col"
              >
                <AgentCard data={agent} />
              </div>
            ))}
          </div>
        ) : (
          <AgentsComingSoon city={selectedCity?.city} state={selectedCity?.state} />
        )}
      </div>
    </div>
  );
}

// Agent Card Component
function AgentCard({ data }: { data: AgentConnect }) {
  const initials = data.agencyName
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <Link
      href={`/agent-connect/${data.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${data.name}'s agent profile`}
      className="group block h-full w-full min-w-0"
    >
         <div className="flex h-full min-h-[284px] w-full min-w-0 flex-col items-center rounded-2xl border border-gray-100 bg-white px-4 pb-4 pt-6 text-center shadow-sm transition-shadow group-hover:shadow-md">
        <div className="relative mb-4 h-[76px] w-[76px] shrink-0 rounded-full border border-emerald-300 p-[3px]">
          <div className="relative h-full w-full overflow-hidden rounded-full bg-gray-100">
            <Image
              src={data.avatar?.url || "/images/UserPlaceholder.webp"}
              alt={data.name}
              fill
              sizes="76px"
              className="object-cover"
            />
          </div>
          {initials ? (
            <span className="absolute -bottom-1 -right-1 flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-teal-700 px-1 text-[10px] font-bold text-white">
              {initials}
            </span>
          ) : null}
        </div>

        <h2 className="w-full truncate text-base font-semibold leading-5 text-gray-900">
          {data.agencyName || "Real Estate Agent"}
        </h2>
        <p className="mt-1 w-full truncate text-sm text-gray-500 ">
          {data.name
            .toLowerCase()
            .replace(/\b\w/g, (character) => character.toUpperCase())}
        </p>

        <p className="mt-2 w-full truncate text-xs text-gray-800">
          {data.experienceYears} Years Experience <span className="mx-1 text-gray-400">·</span> {data.dealsClosed} Deals closed
        </p>

        <p className="mt-1 flex min-h-5 w-full items-center justify-center gap-1 text-xs text-gray-400">
          <MdLocationPin className="shrink-0" size={15} aria-hidden="true" />
          <span className="truncate">{data.areasServed?.join(", ") || data.city || ""}</span>
        </p>

        <span className="mt-auto flex min-h-[42px] w-full items-center justify-center rounded-md bg-[#26ad5f] px-3 text-sm font-medium text-white transition-colors group-hover:bg-green-600 sm:text-base">
          Contact Agent
        </span>
      </div>
    </Link>
  );
}
