"use client";

import React, { useState } from "react";
import { useCity } from "@/hooks/useCity";
import { ArrowDropdownIcon } from "@/icons/icons";
import ActiveTabs from "@/ui/ActiveTabs";
import { useDispatch } from "react-redux";
import {
  setCategory,
  setLandFilter,
  setListingType as setListingTypeFilter,
  setSearchText,
} from "@/Redux/slice/filterSlice";
import {
  LAND_PROPERTY_OPTIONS,
} from "@/app/(pages)/postproperty/constants/subTypes";

type ListingType = "Buy" | "Rent";

const landCategories = LAND_PROPERTY_OPTIONS.map((option) => option.label);
const listingTypes: ListingType[] = ["Buy", "Rent"];
const landSubTypePrefixes = [
  "Gated Community",
  "Non Gated",
  "Corner",
  "Road Facing",
  "Two Side Open",
  "Three Side Open",
];

const getLandVariants = (category: string) => [
  category,
  ...landSubTypePrefixes.map((subType) => `${subType} ${category}`),
];

const getCategoryLinkGroups = (category: string, localities: string[]) => {
  const variants = getLandVariants(category);
  const formatLocalityLink = (locality: string) => `${category}|${locality}`;

  return [
    {
      title: "Popular Plots",
      links: variants,
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

const getLandSubTypesFromLink = (link: string) => {
  const [landVariant] = link.split("|");
  const subType = landSubTypePrefixes.find((prefix) =>
    landVariant.startsWith(`${prefix} `),
  );

  return subType ? [subType] : [];
};

const LandLinks = () => {
  const dispatch = useDispatch();
  const { selectedCity } = useCity();
  const cityName = selectedCity?.city ?? "Hyderabad";
  const [listingType, setListingType] = useState<ListingType>("Buy");
  const [listingOpen, setListingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(landCategories[0]);
  const actionLabel = listingType === "Buy" ? "Sale" : "Rent";
  const cityLocalities =
    selectedCity?.localities
      ?.map((locality) => locality.name?.trim())
      .filter((name): name is string => Boolean(name)) ?? [];
  const activeGroups = getCategoryLinkGroups(activeTab, cityLocalities).filter(
    (group) => group.links.length > 0,
  );
  const activeLandType =
    LAND_PROPERTY_OPTIONS.find((option) => option.label === activeTab)
      ?.label ??
    activeTab;

  const handleQuickLinkClick = (link: string) => {
    const [, locality = ""] = link.split("|");
    const landSubTypes = getLandSubTypesFromLink(link);
    const params = new URLSearchParams({
      category: "Land",
      listingType: listingType === "Buy" ? "sale" : "rent",
      propertyType: activeLandType,
      city: cityName,
    });

    if (selectedCity?.state) {
      params.set("state", selectedCity.state);
    }

    if (landSubTypes.length > 0) {
      params.set("propertySubType", landSubTypes.join(","));
    }

    if (locality) {
      params.set("locality", locality);
    }

    dispatch(setCategory("Land"));
    dispatch(
      setListingTypeFilter({
        label: listingType,
        value: listingType === "Buy" ? "sale" : "rent",
      }),
    );
    dispatch(
      setLandFilter({
        key: "landType",
        value: [activeLandType],
      }),
    );
    dispatch(
      setLandFilter({
        key: "landSubType",
        value: landSubTypes,
      }),
    );
    dispatch(
      setLandFilter({
        key: "locality",
        value: locality,
      }),
    );
    dispatch(setSearchText(""));
    window.open(`/properties?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="py-1">
      <div className="relative inline-block max-w-full text-xl font-medium leading-tight text-[#171717] sm:text-2xl">
        <span className="min-w-0">
          Find Your Perfect Plot in {cityName} to{" "}
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
          categories={landCategories}
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
                  {link.includes("|")
                    ? `${link.split("|")[0]} for ${actionLabel} in ${link.split("|")[1]}`
                    : `${link} for ${actionLabel} in ${cityName}`}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default LandLinks;
