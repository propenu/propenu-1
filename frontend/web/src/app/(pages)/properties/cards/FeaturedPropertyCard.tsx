"use client";

import React, { useState } from "react";
import Link from "next/link";
import { BiBuildingHouse } from "react-icons/bi";
import ImageAutoCarousel from "@/ui/ImageAutoCarousel";
import formatINR from "@/utilies/PriceFormat";
import { hexToRGBA } from "@/ui/hexToRGBA";
import {
  AmenitiesIcon,
  SuperBuiitupAraea,
  UnderConstruction,
} from "@/icons/icons";
import { Property } from "@/types/property";
import { FeaturedProject } from "@/types";
import { useShortlist } from "@/hooks/useShortlist";
import { toast } from "sonner";
import ContactSeller from "@/app/(pages)/project/[slug]/ContactSeller";
import { createPortal } from "react-dom";

type ProjectSummaryUnit = NonNullable<
  NonNullable<Property["bhkSummary"]>[number]["units"]
>[number];

export interface IPromotion {
  type: "normal" | "featured" | "sponsored" | "prime";
  priority: number;
  source: "manual" | "subscription";
  startDate?: Date;
  boostExpiry?: Date;
  sponsoredEnabled?: boolean;
  enquiryLimit?: number;
  enquiriesUsed?: number;
  features?: {
    emailPromotion?: boolean;
    whatsappPromotion?: boolean;
  };
}

function getBhkLabel(property: Property) {
  const bhks = Array.isArray(property.bhkSummary)
    ? property.bhkSummary
      .map((item) => item.bhk)
      .filter((value) => typeof value === "number" && Number.isFinite(value))
    : [];

  if (!bhks.length && Array.isArray(property.bhk)) {
    bhks.push(
      ...property.bhk.filter(
        (value) => typeof value === "number" && Number.isFinite(value),
      ),
    );
  }

  if (!bhks.length) return "Apartments";

  const uniqueBhks = Array.from(new Set(bhks)).sort((a, b) => a - b);
  return `${uniqueBhks.join(", ")} BHK`;
}

function getPriceLabel(property: Property) {
  const from = property.priceFrom ?? property.price;
  const to = property.priceTo;

  if (
    typeof from === "number" &&
    Number.isFinite(from) &&
    from > 0 &&
    typeof to === "number" &&
    Number.isFinite(to) &&
    to > from
  ) {
    return `${formatINR(from)} - ${formatINR(to)}`;
  }

  if (typeof from === "number" && Number.isFinite(from) && from > 0) {
    return `From ${formatINR(from)}`;
  }

  return "Price on request";
}

function normalizeAreaUnit(unit?: string) {
  const normalized = unit?.trim().toLowerCase();

  if (
    !normalized ||
    ["sqft", "sq.ft", "sq ft", "square feet", "square foot"].includes(
      normalized,
    )
  ) {
    return "sq.ft";
  }

  if (["sqyd", "sq.yd", "sq yd", "square yard", "square yards"].includes(normalized)) {
    return "sq.yd";
  }

  if (
    ["sqmt", "sq.mt", "sq m", "sqm", "square meter", "square metre"].includes(
      normalized,
    )
  ) {
    return "sq.mt";
  }

  if (["gunta", "guntas", "gunta(s)", "guntha", "gunthas"].includes(normalized)) {
    return "guntas";
  }

  return unit?.trim() || "sq.ft";
}

function isLandProperty(property: Property) {
  const categoryType = (property as { categoryType?: string }).categoryType;
  const category = (property as { category?: string }).category;

  return [property.type, property.propertyType, categoryType, category].some(
    (value) => {
      const normalized = value?.trim().toLowerCase();
      return normalized === "land" || normalized?.includes("plot");
    },
  );
}

function getRateUnitForProperty(property: Property) {
  if (!isLandProperty(property)) return "sq.ft";

  const units = (property.projectSummary ?? property.bhkSummary ?? []).flatMap(
    (item) => item.units ?? [],
  );
  const areaUnit = units.find((unit) => unit.area?.unit)?.area?.unit;

  return normalizeAreaUnit(areaUnit) || "sq.yd";
}

function convertAreaValue(value: number, fromUnit: string, toUnit: string) {
  if (fromUnit === toUnit) return value;

  const sqftValueByUnit: Record<string, number> = {
    "sq.ft": 1,
    "sq.yd": 9,
    "sq.mt": 10.7639,
    guntas: 1089,
  };

  const fromSqftMultiplier = sqftValueByUnit[fromUnit];
  const toSqftMultiplier = sqftValueByUnit[toUnit];

  if (!fromSqftMultiplier || !toSqftMultiplier) return value;

  return (value * fromSqftMultiplier) / toSqftMultiplier;
}

function convertRateValue(value: number, fromUnit: string, toUnit: string) {
  if (fromUnit === toUnit) return value;

  const sqftValueByUnit: Record<string, number> = {
    "sq.ft": 1,
    "sq.yd": 9,
    "sq.mt": 10.7639,
    guntas: 1089,
  };

  const fromSqftMultiplier = sqftValueByUnit[fromUnit];
  const toSqftMultiplier = sqftValueByUnit[toUnit];

  if (!fromSqftMultiplier || !toSqftMultiplier) return value;

  return (value * toSqftMultiplier) / fromSqftMultiplier;
}

function normalizeAreaForRate(
  area: { value: number; unit: string },
  rateUnit: string,
) {
  return {
    value: convertAreaValue(area.value, area.unit, rateUnit),
    unit: rateUnit,
  };
}

function getUnitAreaForRate(unit?: ProjectSummaryUnit, rateUnit = "sq.ft") {
  if (
    typeof unit?.area?.value === "number" &&
    Number.isFinite(unit.area.value) &&
    unit.area.value > 0
  ) {
    return normalizeAreaForRate(
      {
        value: unit.area.value,
        unit: normalizeAreaUnit(unit.area.unit),
      },
      rateUnit,
    );
  }

  if (
    typeof unit?.area?.sqftValue === "number" &&
    Number.isFinite(unit.area.sqftValue) &&
    unit.area.sqftValue > 0
  ) {
    return normalizeAreaForRate(
      {
        value: unit.area.sqftValue,
        unit: "sq.ft",
      },
      rateUnit,
    );
  }

  if (
    typeof unit?.minSqft === "number" &&
    Number.isFinite(unit.minSqft) &&
    unit.minSqft > 0
  ) {
    return normalizeAreaForRate(
      {
        value: unit.minSqft,
        unit: "sq.ft",
      },
      rateUnit,
    );
  }

  return null;
}

function formatPricePerUnit(pricePerUnit: number, unit: string) {
  if (
    typeof pricePerUnit !== "number" ||
    !Number.isFinite(pricePerUnit) ||
    pricePerUnit <= 0
  ) {
    return null;
  }

  return `\u20b9${Math.round(pricePerUnit).toLocaleString("en-IN")}/${unit}`;
}

function getPricePerSqftLabel(property: Property) {
  const rateUnit = getRateUnitForProperty(property);
  const units = (property.projectSummary ?? property.bhkSummary ?? []).flatMap(
    (item) => item.units ?? [],
  );
  const unitRates = units
    .map((unit) => {
      const price = unit.minPrice ?? unit.price;
      const area = getUnitAreaForRate(unit, rateUnit);

      if (
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price <= 0 ||
        !area
      ) {
        return null;
      }

      return {
        price,
        pricePerUnit: price / area.value,
        unit: area.unit,
      };
    })
    .filter(
      (rate): rate is { price: number; pricePerUnit: number; unit: string } =>
        Boolean(rate),
    )
    .sort((a, b) => a.price - b.price);
  const unitRateLabel = unitRates[0]
    ? formatPricePerUnit(unitRates[0].pricePerUnit, unitRates[0].unit)
    : null;

  if (unitRateLabel) return unitRateLabel;

  const minArea = units
    .map((unit) => getUnitAreaForRate(unit, rateUnit))
    .filter((area): area is { value: number; unit: string } => Boolean(area))
    .sort((a, b) => a.value - b.value)[0];
  const derivedPricePerUnit =
    typeof property.priceFrom === "number" && minArea
      ? {
        value: property.priceFrom / minArea.value,
        unit: minArea.unit,
      }
      : undefined;
  const derivedPricePerSqft =
    typeof property.priceFrom === "number" &&
      typeof property.sqftRange?.min === "number" &&
      property.sqftRange.min > 0
      ? {
        value:
          property.priceFrom /
          convertAreaValue(property.sqftRange.min, "sq.ft", rateUnit),
        unit: rateUnit,
      }
      : undefined;
  const directPricePerSqft =
    typeof property.pricePerSqft === "number"
      ? {
        value:
          rateUnit === "sq.yd"
            ? convertRateValue(property.pricePerSqft, "sq.ft", rateUnit)
            : property.pricePerSqft,
        unit: rateUnit,
      }
      : undefined;
  const rate = derivedPricePerUnit ?? derivedPricePerSqft ?? directPricePerSqft;

  return rate ? formatPricePerUnit(rate.value, rate.unit) ?? "Price on request" : "Price on request";
}

function getAmenitiesCount(property: Property) {
  if (Array.isArray(property.amenities)) {
    return property.amenities.length;
  }

  if (
    typeof property.amenitiesCount === "number" &&
    Number.isFinite(property.amenitiesCount)
  ) {
    return property.amenitiesCount;
  }

  return 0;
}

function getProjectAreaLabel(property: Property) {
  if (
    typeof property.projectArea === "number" &&
    Number.isFinite(property.projectArea) &&
    property.projectArea > 0
  ) {
    return `${property.projectArea} Acre`;
  }

  return "Area on request";
}

function getFeaturedProjectHref(property: Property) {
  return property.promotion?.type === "prime"
    ? `/prime/${property.slug}`
    : `/project/${property.slug}`;
}

function hasUpcomingPossessionDate(property: Property) {
  const possessionDateValue = (property as { possessionDate?: string | Date })
    .possessionDate;
  if (!possessionDateValue) return false;

  const possessionDate = new Date(possessionDateValue);
  if (Number.isNaN(possessionDate.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  possessionDate.setHours(0, 0, 0, 0);

  return possessionDate >= today;
}



const FeaturedPropertyCard: React.FC<{ p: Property; vertical?: boolean }> = ({
  p,
  vertical = false,
}) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const bgPriceColor = hexToRGBA("#27AE60", 0.1);
  const bgPriceColorIcon = hexToRGBA("#27AE60", 0.4);
  const images =
    p.gallery?.map((item) => item.url) ??
    p.gallerySummary?.map((item) => item.url) ??
    [];
  const amenitiesCount = getAmenitiesCount(p);
  const projectId = p.id || p._id;
  const { isShortlisted, isShortlistLoading, toggleShortlist } = useShortlist(
    projectId,
    "FeaturedProject",
  );

  const promotionType = p?.promotion?.type || "normal";
  const isSponsored =
    p.isSponsored === true ||
    (p.promotion?.sponsoredEnabled === true &&
      (promotionType === "prime" || promotionType === "featured"));

  const promotionConfig: Partial<
    Record<IPromotion["type"], { label: string; className: string }>
  > = {
    sponsored: {
      label: "Sponsored",
      className: "bg-black/50",
    },
    featured: {
      label: "Top Selling",
      className: "bg-black/50",
    },
    prime: {
      label: "Prime Project",
      className: "bg-black/50",
    },
  };
  const promotionBadge = promotionConfig[promotionType];
  const propertyHref = getFeaturedProjectHref(p);
  const pricePerSqftLabel = getPricePerSqftLabel(p);
  const priceLabel = getPriceLabel(p);
  const showNewLaunchBadge = hasUpcomingPossessionDate(p);

  const shareProperty = async () => {
    const href =
      typeof window !== "undefined"
        ? new URL(propertyHref, window.location.origin).toString()
        : "";

    try {
      if (navigator.share) {
        await navigator.share({ title: p.title, url: href });
        return;
      }

      await navigator.clipboard.writeText(href);
      toast.success("Project link copied");
    } catch {
      // Ignore cancelled share or clipboard errors.
    }
  };

  return (
    <div
      className={`card p-2 h-auto flex overflow-hidden ${vertical
        ? "w-[min(100vw-2rem,360px)] flex-col"
        : "flex-col md:flex-row md:h-[220px]"
        }`}
    >
      <Link
        href={propertyHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex flex-1 min-w-0 ${vertical ? "flex-col" : "flex-col md:flex-row"
          }`}
      >
        <div
          className={`rounded-xl relative shrink-0 ${vertical ? "w-full h-48" : "w-full h-48 md:w-56 md:h-full"
            }`}
        >
          <ImageAutoCarousel
            images={images}
            alt={p.title}
            onIndexChange={setActiveImageIndex}
            onShare={shareProperty}
            isShortlisted={isShortlisted}
            isShortlistLoading={isShortlistLoading}
            onToggleShortlist={toggleShortlist}
          />

          {isSponsored && (
            <span className="absolute left-3 top-3 z-10 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white">
              Sponsored
            </span>
          )}

      

          <div className="absolute left-2 bottom-2 flex items-center gap-2 text-xs text-white">
            <div className="bg-black/60 px-2 py-1 rounded-md flex items-center gap-1">
              <span>
                {activeImageIndex + 1}/{images.length || 1}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 p-4 md:p-4 flex flex-col justify-between h-auto md:h-full">
          <div
            className={`min-w-0 flex ${vertical ? "flex-col gap-1" : "flex-col"}`}
          >
            <h3
              className={`font-semibold leading-snug line-clamp-2 capitalize ${vertical
                ? "text-base max-w-[250px] truncate"
                : "text-lg md:text-md max-w-[600px]"
                }`}
            >
              {p.title} {p.propertyType} for Sale in{" "}
              {[p.locality, p.city].filter(Boolean).join(", ")}
            </h3>

            <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-gray-500">
              <BiBuildingHouse className="h-4 w-4 shrink-0" />
              <span className="block min-w-0 truncate">{p?.buildingName}</span>
            </p>
          </div>

          <div
            className={`hidden ${vertical ? "" : "md:flex"} flex-wrap gap-2 mt-3`}
          >
            {(p as any)?.reraNumber && (
              <span className="text-xs font-normal px-2 py-1 text-primary">
                RERA Approved
              </span>
            )}
            {showNewLaunchBadge && (
              <span className="text-xs font-normal px-2 py-1 text-primary">
                New Launch
              </span>
            )}
            <span className="text-xs font-normal px-2 py-1 text-primary">
              Builder Project
            </span>
          </div>

          <div
            className={`mt-4 text-xs text-gray-600 border-t pt-4 border-gray-200 ${vertical
              ? "grid grid-cols-2 gap-4"
              : "grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6"
              }`}
          >
            <div className="items-center gap-2 flex">
              <AmenitiesIcon size={24} color={bgPriceColorIcon} />
              <div className="flex flex-col">
                <div className="text-xs text-gray-500 tracking-wide">
                  Amenities
                </div>
                <div className="font-medium">
                  {amenitiesCount}{" "}
                  {amenitiesCount === 1 ? "Amenity" : "Amenities"}
                </div>
              </div>
            </div>

            <div className="items-center gap-2 flex">
              <SuperBuiitupAraea size={24} color={bgPriceColorIcon} />
              <div className="flex flex-col">
                <div className="text-xs text-gray-500 tracking-wide">Area</div>
                <div className="font-medium">{getProjectAreaLabel(p)}</div>
              </div>
            </div>

            <div className="items-center gap-2 flex">
              <UnderConstruction size={24} color={bgPriceColorIcon} />
              <div className="flex flex-col">
                <div className="text-xs text-gray-500 tracking-wide">
                  Availability
                </div>
                <div className="font-medium">Available</div>
              </div>
            </div>
          </div>
        </div>
      </Link>

      {/* Right: price card */}
      <aside
        className={`rounded-xl ${
          vertical
            ? "w-full px-3 py-2 flex items-center justify-between gap-3"
            : "w-full mt-3 px-3 py-2 flex items-center justify-between gap-3 md:w-52 md:p-3 md:flex-col md:justify-center md:gap-2.5 md:mt-0"
        }`}
        style={{ backgroundColor: bgPriceColor }}
      >
        {/* PRICE / RATE */}
        <div
          className={`${
            vertical
              ? "flex min-w-0 flex-col gap-1"
              : "flex min-w-0 flex-col gap-2 md:w-full md:items-center md:text-center"
          }`}
        >
          {pricePerSqftLabel && pricePerSqftLabel !== "Price on request" ? (
            <div
              className={`hidden items-center justify-center rounded-lg bg-[#BEf4d4] px-3 py-1 text-center font-semibold text-gray-900 shadow-sm md:inline-flex md:w-[90%] md:px-3 md:py-1.5 ${
                vertical
                  ? "self-start text-xs sm:text-sm"
                  : "self-start text-xs sm:text-sm md:self-center md:text-base"
              }`}
            >
              <span className="truncate whitespace-nowrap">
                {pricePerSqftLabel}
              </span>
            </div>
          ) : null}

          <div
            className={`whitespace-nowrap font-semibold text-green-700 ${
              vertical
                ? "text-base leading-tight"
                : "text-base leading-tight md:text-lg"
            }`}
          >
            {priceLabel}
          </div>
        </div>

        {/* BUTTON */}
        <div
          className={`${
            vertical
              ? "shrink-0"
              : "shrink-0 md:w-full md:mt-2 flex justify-center"
          }`}
        >
          <button
            type="button"
            onClick={() => setShowContactDialog(true)}
            className={`btn-primary text-white rounded-md shadow-sm transition font-medium whitespace-nowrap ${
              vertical
                ? "px-4 py-1.5 text-sm"
                : "px-4 py-1.5 text-sm md:w-[90%] md:py-2 md:text-base"
            }`}
          >
            Contact Builder
          </button>
        </div>
      </aside>

      {showContactDialog && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md">
                <ContactSeller
                  project={p as unknown as FeaturedProject}
                  isModal
                  onClose={() => setShowContactDialog(false)}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};

export default FeaturedPropertyCard;
