"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { MdClose } from "react-icons/md";
import { GoHeart, GoHeartFill } from "react-icons/go";
import { useShortlist } from "@/hooks/useShortlist";

export interface Ad {
  id: string;
  title: string;
  description?: string;
  location?: string;
  priceLabel?: string;
  builderName?: string;
  builderLabel?: string;
  imageUrl: string;
  ctaText: string;
  ctaLink: string;
  category?: string;
  displayCategory?: string;
  featured?: boolean;
  sponsored?: boolean;
  promotionType?: "normal" | "featured" | "prime" | "sponsored" | string;
  expiryDate?: Date;
  isExpired?: boolean;
}

interface AdCardProps {
  ad: Ad;
  onDismiss?: (adId: string) => void;
}

type ShortlistPropertyType =
  | "Residential"
  | "Commercial"
  | "Land"
  | "Agricultural"
  | "FeaturedProject";

function getShortlistPropertyType(
  category?: string,
): ShortlistPropertyType | undefined {
  switch (category?.toLowerCase()) {
    case "residential":
    case "residentials":
      return "Residential";
    case "commercial":
    case "commercials":
      return "Commercial";
    case "land":
    case "landplot":
    case "landplots":
      return "Land";
    case "agricultural":
    case "agriculturals":
      return "Agricultural";
    case "featured":
    case "featuredproject":
    case "featured project":
      return "FeaturedProject";
    default:
      return undefined;
  }
}

function getPromotionBadge(ad: Ad) {
  const promotionType = String(ad.promotionType || "").toLowerCase();

  if (promotionType === "prime") return "Prime Project";
  if (promotionType === "featured") return "Featured";
  if (promotionType === "sponsored" || ad.sponsored) return "Sponsored";

  return null;
}

function formatCategoryLabel(category?: string) {
  const normalized = String(category || "").trim().toLowerCase();

  switch (normalized) {
    case "featuredproject":
    case "featured project":
    case "project":
      return "Project";
    case "landplot":
    case "landplots":
      return "Land";
    case "residentials":
      return "Residential";
    case "commercials":
      return "Commercial";
    case "agriculturals":
      return "Agricultural";
    default:
      return String(category || "")
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}

const AdCard: React.FC<AdCardProps> = ({ ad, onDismiss }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const { isShortlisted, isShortlistLoading, toggleShortlist } = useShortlist(
    ad.id,
    getShortlistPropertyType(ad.category),
  );

  // Check if ad is expired
  useEffect(() => {
    if (ad.expiryDate) {
      const expired = new Date(ad.expiryDate) < new Date();
      setIsExpired(expired || ad.isExpired || false);
    }
  }, [ad.expiryDate, ad.isExpired]);

  if (isExpired) {
    return null;
  }

  const handleToggleShortlist = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    toggleShortlist();
  };

  const promotionBadge = getPromotionBadge(ad);
  const categoryLabel = formatCategoryLabel(ad.displayCategory || ad.category);
  const builderLabel =
    ad.builderLabel ||
    (getShortlistPropertyType(ad.category) === "FeaturedProject"
      ? "Marketed by"
      : "By");

  return (
    <Link href={ad.ctaLink} target="_blank" rel="noopener noreferrer">
      <div
        className="relative group overflow-hidden rounded-2xl bg-white shadow-md hover:shadow-lg transition-all duration-300 h-full"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Image Container */}
        <div className="relative h-40 w-full overflow-hidden bg-linear-to-br from-gray-100 to-gray-200">
          <Image
            src={ad.imageUrl}
            alt={ad.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, 300px"
          />

          {/* Promotion Badge */}
          {promotionBadge && (
            <div className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-white shadow-sm">
              {promotionBadge}
            </div>
          )}

          {/* Category Badge */}
          {ad.category && !promotionBadge && (
            <div className="absolute left-2 top-2 rounded bg-[#27AE60]/90 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-white">
              {ad.category}
            </div>
          )}

          {/* Featured Badge */}
          {ad.featured && !promotionBadge && (
            <div className="absolute right-2 top-2 rounded bg-yellow-500/90 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-white">
              Featured
            </div>
          )}

          {/* Save/Shortlist Button */}
          <button
            onClick={handleToggleShortlist}
            disabled={isShortlistLoading}
            className="absolute bottom-2 right-2 z-10 rounded-full bg-white/95 p-2 shadow-md transition-all duration-200 hover:bg-white hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
            aria-label={
              isShortlisted ? "Remove from shortlist" : "Shortlist property"
            }
            title={isShortlisted ? "Remove from shortlist" : "Shortlist"}
          >
            {isShortlistLoading ? (
              <span className="block h-5 w-5 animate-pulse rounded-full bg-gray-300" />
            ) : isShortlisted ? (
              <GoHeartFill className="h-5 w-5 text-red-500" />
            ) : (
              <GoHeart className="h-5 w-5 text-gray-600 transition-colors group-hover:text-red-500" />
            )}
          </button>
        </div>

        {/* Content Container */}
        <div className="p-3 flex flex-col gap-2 h-[calc(100%-160px)] justify-between">
          {/* Title */}
          <div className="flex-1">
            {categoryLabel && (
              <span className="mb-2 inline-flex w-fit rounded-md bg-[#D1EFDD] px-2 py-0.5 text-[11px] font-semibold text-[#16884B]">
                {categoryLabel}
              </span>
            )}

            <h3 className="font-semibold text-sm line-clamp-2 text-gray-800 group-hover:text-[#27AE60] transition-colors">
              {ad.title}
            </h3>

            {/* Description */}
            {ad.description && (
              <p className="text-xs text-gray-600 line-clamp-2 mt-1">
                {ad.description}
              </p>
            )}

            {ad.location && (
              <p className="mt-1 text-xs text-gray-500 line-clamp-1">
                {ad.location}
              </p>
            )}

            <p className="mt-2 text-sm font-semibold text-[#27AE60]">
              {ad.priceLabel || "Price on request"}
            </p>

            {ad.builderName && (
              <p className="mt-1 text-xs text-gray-500 line-clamp-1">
                {builderLabel} <span className="font-medium text-gray-700">{ad.builderName}</span>
              </p>
            )}
          </div>

        </div>

        {/* Overlay on Hover */}
        {isHovered && (
          <div className="absolute inset-0 bg-black/5 pointer-events-none rounded-2xl" />
        )}
      </div>
    </Link>
  );
};

export default AdCard;
