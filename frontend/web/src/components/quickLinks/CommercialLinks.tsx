"use client";

import React, { useState } from "react";
import { useCity } from "@/hooks/useCity";
import { ArrowDropdownIcon } from "@/icons/icons";
import ActiveTabs from "@/ui/ActiveTabs";
import { useDispatch } from "react-redux";
import {
  setCategory,
  setCommercialFilter,
  setListingType as setListingTypeFilter,
  setSearchText,
} from "@/Redux/slice/filterSlice";
import {
  COMMERCIAL_PROPERTY_OPTIONS,
} from "@/app/(pages)/postproperty/constants/subTypes";

type ListingType = "Buy" | "Rent";

const commercialCategories = COMMERCIAL_PROPERTY_OPTIONS.map(
  (option) => option.label,
);

const listingTypes: ListingType[] = ["Buy", "Rent"];

const getCommercialVariants = (category: string) => {
  if (category === "Office") {
    return [
      "Office",
      "Bare Shell Office",
      "Warm Shell Office",
    ];
  }

  return [category];
};

const getCategoryLinkGroups = (
  category: string,
  localities: string[],
  actionLabel: "Sale" | "Rent",
  cityName: string,
) => {
  const variants = getCommercialVariants(category);
  const formatCityLink = (label: string) =>
    `${label} for ${actionLabel} in ${cityName}`;
  const formatLocalityLink = (locality: string) =>
    `${category} for ${actionLabel} in ${locality}`;

  return [
    {
      title: "Popular Commercial Spaces",
      links: variants.map(formatCityLink),
    },
    {
      title: `${category}s in Top Localities`,
      links: localities.slice(0, 7).map(formatLocalityLink),
    },
    {
      title: `${category}s by Locality`,
      links: localities.slice(7, 14).map(formatLocalityLink),
    },
    {
      title: "More Localities",
      links: localities.slice(14, 21).map(formatLocalityLink),
    },
  ];
};

const CommercialLinks = () => {
  const dispatch = useDispatch();
  const { selectedCity } = useCity();
  const cityName = selectedCity?.city ?? "Hyderabad";
  const [listingType, setListingType] = useState<ListingType>("Buy");
  const [listingOpen, setListingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(commercialCategories[0]);
  const actionLabel = listingType === "Buy" ? "Sale" : "Rent";
  const cityLocalities =
    selectedCity?.localities
      ?.map((locality) => locality.name?.trim())
      .filter((name): name is string => Boolean(name)) ?? [];
  const activeGroups = getCategoryLinkGroups(
    activeTab,
    cityLocalities,
    actionLabel,
    cityName,
  ).filter((group) => group.links.length > 0);
  const activeCommercialType =
    COMMERCIAL_PROPERTY_OPTIONS.find((option) => option.label === activeTab)
      ?.label ?? activeTab;

  const handleQuickLinkClick = (link: string) => {
    const locality = link.split(" in ").at(-1) ?? "";
    const selectedLocality = locality && locality !== cityName ? locality : "";
    const params = new URLSearchParams({
      category: "Commercial",
      listingType: listingType === "Buy" ? "sale" : "rent",
      propertyType: activeCommercialType,
      city: cityName,
    });

    if (selectedCity?.state) {
      params.set("state", selectedCity.state);
    }

    if (selectedLocality) {
      params.set("locality", selectedLocality);
    }

    dispatch(setCategory("Commercial"));
    dispatch(
      setListingTypeFilter({
        label: listingType,
        value: listingType === "Buy" ? "sale" : "rent",
      }),
    );
    dispatch(
      setCommercialFilter({
        key: "commercialType",
        value: [activeCommercialType],
      }),
    );
    dispatch(
      setCommercialFilter({
        key: "locality",
        value: selectedLocality ? [selectedLocality] : [],
      }),
    );
    dispatch(setSearchText(""));
    window.open(`/properties?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="py-1">
      <div className="relative inline-block max-w-full text-xl font-medium leading-tight text-[#171717] sm:text-2xl">
        <span className="min-w-0">
          Find Your Commercial Space in {cityName} to{" "}
          <span className="relative inline-flex whitespace-nowrap align-baseline">
            <span className="text-[#18af5b]">{listingType}</span>
            <button
              type="button"
              onClick={() => setListingOpen((prev) => !prev)}
              aria-label="Change listing type"
              className="ml-1 inline-flex h-6 w-6 items-center justify-center align-middle text-[#6b716e] sm:h-7 sm:w-7"
            >
              <ArrowDropdownIcon
                size={12}
                className={`transition-transform cursor-pointer ${listingOpen ? "rotate-180" : ""}`}
              />
            </button>

            {listingOpen && (
              <div className="absolute left-0 top-full z-20 mt-2 w-28 rounded-lg border border-gray-100 bg-white p-1 shadow-lg">
                {listingTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setListingType(type);
                      setListingOpen(false);
                    }}
                    className={`block w-full rounded-md px-3 py-2 text-left text-sm transition ${
                      listingType === type
                        ? "bg-[#effcf4] text-[#18af5b]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </span>
        </span>
      </div>

      <div className="mt-4">
        <ActiveTabs
          categories={commercialCategories}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      </div>

      <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pt-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-8 sm:px-1 lg:grid-cols-4">
        {activeGroups.map((group) => (
          <div key={group.title} className="w-[245px] shrink-0 sm:w-auto sm:shrink">
            <h3 className="text-base font-medium text-[#171717] sm:text-lg">
              {group.title}
            </h3>
            <div className="mt-3 space-y-3 sm:mt-4 sm:space-y-4">
              {group.links.map((link) => (
                <button
                  key={link}
                  type="button"
                  onClick={() => handleQuickLinkClick(link)}
                  className="block text-left text-[13px] leading-snug text-[#3d4541] transition hover:text-[#18af5b] cursor-pointer sm:text-sm"
                >
                  {link}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default CommercialLinks;
