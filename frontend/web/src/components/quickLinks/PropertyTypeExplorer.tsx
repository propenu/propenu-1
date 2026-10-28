"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowDropdownIcon } from "@/icons/icons";
import { useCity } from "@/hooks/useCity";

type ExploreLink = {
  label: string;
  propertyType: string;
  propertySubType?: string;
};

const sections: {
  category: string;
  title: string;
  links: ExploreLink[];
}[] = [
  {
    category: "Residential",
    title: "Homes",
    links: [
      { label: "Apartments", propertyType: "apartment" },
      { label: "Independent houses", propertyType: "independent-house" },
      { label: "Villas", propertyType: "villa" },
    ],
  },
  {
    category: "Commercial",
    title: "Commercial spaces",
    links: [
      { label: "Office", propertyType: "Office" },
      { label: "Bare shell office", propertyType: "Office", propertySubType: "bare-shell" },
      { label: "Warm shell office", propertyType: "Office", propertySubType: "warm-shell" },
    ],
  },
  {
    category: "Land",
    title: "Plots",
    links: [
      { label: "Residential plots", propertyType: "Residential Plot" },
      { label: "Gated community plots", propertyType: "Residential Plot", propertySubType: "Gated Community" },
      { label: "Corner plots", propertyType: "Residential Plot", propertySubType: "Corner" },
    ],
  },
  {
    category: "Agricultural",
    title: "Agricultural land",
    links: [
      { label: "Farm land", propertyType: "Farm Land" },
      { label: "Irrigated farm land", propertyType: "Farm Land", propertySubType: "Irrigated" },
      { label: "Fenced farm land", propertyType: "Farm Land", propertySubType: "Fenced" },
    ],
  },
];

export default function PropertyTypeExplorer() {
  const { selectedCity } = useCity();
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [listingType, setListingType] = useState<"Buy" | "Rent">("Buy");
  const cityName = selectedCity?.city ?? "Hyderabad";

  const getHref = (category: string, item: ExploreLink) => {
    const params = new URLSearchParams({
      category,
      listingType: listingType === "Buy" ? "sale" : "rent",
      propertyType: item.propertyType,
      city: cityName,
    });
    if (selectedCity?.state) params.set("state", selectedCity.state);
    if (item.propertySubType) params.set("propertySubType", item.propertySubType);
    return `/properties?${params.toString()}`;
  };

  const getCategoryHref = (category: string) => {
    const params = new URLSearchParams({
      category,
      listingType: listingType === "Buy" ? "sale" : "rent",
      city: cityName,
    });
    if (selectedCity?.state) params.set("state", selectedCity.state);
    return `/properties?${params.toString()}`;
  };

  const scroll = (direction: "left" | "right") => {
    const slider = sliderRef.current;
    if (!slider) return;
    slider.scrollBy({
      left: (direction === "left" ? -1 : 1) * slider.clientWidth * 0.8,
      behavior: "smooth",
    });
  };

  return (
    <section className="w-full">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 border-l-4 border-[#26ad5f] pl-2">
          <h1 className="truncate text-base font-bold text-[#26ad5f] sm:text-2xl">
              Explore properties options
            </h1>
          <p className="mt-1 text-xs text-gray-500 sm:text-base">
            Popular choices in {cityName}
          </p>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <div className="flex rounded-full border border-gray-200 bg-white p-1 text-xs sm:text-sm">
            {(["Buy", "Rent"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setListingType(type)}
                aria-pressed={listingType === type}
                className={`rounded-full px-3 py-1.5 transition ${listingType === type ? "bg-[#26ad5f] text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {type}
              </button>
            ))}
          </div>
          {/* <button
            type="button"
            aria-label="Scroll property categories left"
            onClick={() => scroll("left")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-[#26ad5f] shadow-sm transition hover:shadow-md"
          >
            <ArrowDropdownIcon size={16} className="rotate-90" />
          </button>
          <button
            type="button"
            aria-label="Scroll property categories right"
            onClick={() => scroll("right")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-[#26ad5f] shadow-sm transition hover:shadow-md"
          >
            <ArrowDropdownIcon size={16} className="rotate-270" />
          </button> */}
        </div>
      </div>

      <div
        ref={sliderRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2"
      >
        {sections.map((section) => (
          <div
            key={section.category}
            className="w-[260px] shrink-0 snap-start py-1 sm:w-[280px] lg:w-[300px]"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[#26ad5f]">
              {section.category}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-gray-900">
              {section.title}
            </h3>
            <div className="mt-3 flex flex-col items-start gap-2">
              {section.links.map((item) => (
                <Link
                  key={item.label}
                  href={getHref(section.category, item)}
                  className="text-sm text-gray-600 underline-offset-4 transition hover:text-green-700 hover:underline"
                >
                  {item.label} in {cityName}
                </Link>
              ))}
            </div>
            <Link
              href={getCategoryHref(section.category)}
              className="mt-3 inline-block text-sm font-semibold text-[#26ad5f] underline-offset-4 hover:text-green-700 hover:underline"
            >
              View all {section.title.toLowerCase()} in {cityName} <span aria-hidden="true">→</span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
