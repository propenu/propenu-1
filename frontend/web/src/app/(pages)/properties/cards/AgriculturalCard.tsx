"use client";

import React, { useState } from "react";
import {
  RoadAccessIcon,
  SoilTypeIcon,
  SuperBuiitupAraea,
  WaterTypeIcon,
} from "@/icons/icons";
import { Property } from "@/types/property";
import { hexToRGBA } from "@/ui/hexToRGBA";
import formatINR from "@/utilies/PriceFormat";
import Link from "next/link";
import { AiOutlineHeart } from "react-icons/ai";
import { BiBuildingHouse } from "react-icons/bi";
import { IAgricultural } from "@/types/agricultural";
import ImageAutoCarousel from "@/ui/ImageAutoCarousel";
import { toast } from "sonner";
import { postShortlistProperty, me, removeShortlistProperty, getUserShortlist } from "@/data/ClientData";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ContactOwnerButton from "@/components/ContactOwnerButton";
import { useEffect } from "react";
import LoginDialog from "@/app/(auth)/Login";
import RegisterDialog from "@/app/(auth)/Register";
import { createPortal } from "react-dom";
import { addLocalShortlist, isLocalShortlisted, removeLocalShortlist } from "@/utilies/shortlistLocal";
import { resolveListingSource } from "@/utilies/resolveListingSource";
import { trackInteraction } from "@/services/trackingService";

type Props = {
  p: IAgricultural;
  vertical?: boolean;
  isSponsored?: boolean; // ✅ ADD THIS
};

const AgriculturalCard: React.FC<Props> = ({
  p,
  vertical = false,
  isSponsored = false,
}) => {
  const bgPriceColor = hexToRGBA("#27AE60", 0.1);
  const bgPriceColoricon = hexToRGBA("#27AE60", 0.4);

  const img = p?.gallery?.[0]?.url ?? "/placeholder.jpg";
  const formattedPrice = formatINR(p?.price);
  const pricePerSqft =
    (p as any)?.pricePerSqft ??
    Math.round((p?.price ?? 0) / (p as any)?.builtUpArea || 0);
  const displayLandName = (p as any)?.landName || (p as any)?.title || "Land";
  const isRentListing = ["rent", "lease"].includes(
    String(p?.listingType ?? "").toLowerCase(),
  );
  const displayTitle = isRentListing
    ? p.title?.replace(/\bfor\s+sale\b/i, "for rent")
    : p.title;
  const resolvedListingSource = resolveListingSource(
    p?.listingSource,
    (p as any)?.createdBy,
  );
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isShortlisted, setIsShortlisted] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: userData } = useQuery({
    queryKey: ["user"],
    queryFn: me,
    retry: 1,
  });
  const user = userData?.user;

  const { data: shortlistData } = useQuery({
    queryKey: ["user-shortlist"],
    queryFn: getUserShortlist,
    enabled: !!user,
  });

    useEffect(() => {
        if (user && shortlistData?.data) {
          const isInList = shortlistData.data.some(
            (item: any) => item.property?._id === p.id,
          );
    
          setIsShortlisted(isInList);
        } else {
          // 👇 guest user → check localStorage
          const local = isLocalShortlisted(p.id);
          setIsShortlisted(local);
        }
      }, [shortlistData, p.id, user]);

  const shareProperty = async () => {
    const href =
      typeof window !== "undefined"
        ? new URL(`/properties/agricultural/${p.slug}`, window.location.origin).toString()
        : "";

    try {
      if (navigator.share) {
        await navigator.share({ title: p.title, url: href });
        return;
      }

      await navigator.clipboard.writeText(href);
      toast.success("Property link copied");
    } catch {
      // Ignore cancelled share or clipboard errors.
    }
  };
    

  const addShortlistMutation = useMutation({
    mutationFn: postShortlistProperty,
    onSuccess: () => {
      toast.success("Added to shortlist");
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["user-shortlist"] });
      const previousShortlist = queryClient.getQueryData(["user-shortlist"]);
      queryClient.setQueryData(["user-shortlist"], (old: any) => ({
        ...old,
        data: [...(old?.data || []), { property: { _id: p.id } }],
      }));
      return { previousShortlist };
    },
    onError: (err, variables, context: any) => {
      if (context?.previousShortlist) {
        queryClient.setQueryData(["user-shortlist"], context.previousShortlist);
      }
      toast.error("Failed to add to shortlist.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["user-shortlist"] });
    },
  });

  const removeShortlistMutation = useMutation({
    mutationFn: removeShortlistProperty,
    onSuccess: () => {
      toast.success("Removed from shortlist");
    },
    onMutate: async (propertyId: string) => {
      await queryClient.cancelQueries({ queryKey: ["user-shortlist"] });
      const previousShortlist = queryClient.getQueryData(["user-shortlist"]);
      queryClient.setQueryData(["user-shortlist"], (old: any) => ({
        ...old,
        data: (old?.data || []).filter(
          (item: any) => item.property?._id !== propertyId,
        ),
      }));
      return { previousShortlist };
    },
    onError: (err, variables, context: any) => {
      if (context?.previousShortlist) {
        queryClient.setQueryData(["user-shortlist"], context.previousShortlist);
      }
      toast.error("Failed to remove from shortlist.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["user-shortlist"] });
    },
  });

  return (
    <div
      className={`card p-2 h-auto flex overflow-hidden ${vertical ? "w-full max-w-[330px] sm:max-w-[360px] flex-col" : "flex-col md:flex-row md:h-[220px]"
        }`}
    >
      <Link
        href={`/properties/agricultural/${p.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          const property = p as any;
          trackInteraction({
            eventType: "property_click",
            eventCategory: "property_engagement",
            entityType: "property",
            propertyId: property._id || property.id,
            promotionType: property.promotion?.type || (isSponsored ? "sponsored" : "normal"),
            source: "property_listing",
            placement: "agricultural_property_card",
            metadata: { propertyType: "agricultural", propertyTitle: property.title, propertySlug: property.slug },
          });
        }}
        className={`flex flex-1 min-w-0 ${vertical ? "flex-col" : "flex-col md:flex-row"}`}
      >
        {/* Left: image */}
        <div
          className={`rounded-xl relative shrink-0 ${vertical ? "w-full h-40 sm:h-48" : "w-full h-48 md:w-56 md:h-full"
            }`}
        >
          <ImageAutoCarousel
            images={p?.gallery?.map((g) => g.url) ?? []}
            alt={p?.title}
            onIndexChange={setActiveImageIndex}
            onShare={shareProperty}
            isShortlisted={isShortlisted}
            isShortlistLoading={
              addShortlistMutation.isPending || removeShortlistMutation.isPending
            }
            onToggleShortlist={() => {
  if (user) {
    if (isShortlisted) {
      setIsShortlisted(false);
      removeShortlistMutation.mutate(p.id);
    } else {
      setIsShortlisted(true);
      addShortlistMutation.mutate({
        propertyId: p.id,
        propertyType: "Agricultural",
      });
    }
  } else {
    if (isShortlisted) {
      removeLocalShortlist(p.id);
      setIsShortlisted(false);
      toast.success("Removed from shortlist");
    } else {
      addLocalShortlist(p.id, "Agricultural");
      setIsShortlisted(true);
      toast.success("Added to shortlist");
    }
  }
}}
          />
          {/* overlay: image count & date */}
          <div className="absolute left-2 bottom-2 flex items-center gap-2 text-xs text-white">
            <div className="bg-black/60 px-2 py-1 rounded-md flex items-center gap-1">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  d="M3 7h18M3 12h18M3 17h18"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>
                {activeImageIndex + 1}/{p?.gallery?.length ?? 1}
              </span>{" "}
            </div>
          </div>
        </div>

        {/* Middle: content */}
        <div
          className={`flex-1 min-w-0 flex flex-col justify-between h-auto md:h-full ${
            vertical ? "p-3 sm:p-4" : "p-4 md:p-4"
          }`}
        >
          <div className="min-w-0">
            <h3
              className={`font-semibold leading-snug line-clamp-2 capitalize ${vertical ? "text-sm sm:text-base max-w-full truncate" : "text-lg md:text-md max-w-[600px]"
                }`}
            >
              {displayTitle}
            </h3>
            <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-gray-500">
              <BiBuildingHouse className="h-4 w-4 shrink-0" />
              <span className="block min-w-0 truncate capitalize">
                {displayLandName}
              </span>
            </p>
          </div>

          {/* badges */}
          <div
            className={`hidden ${vertical ? "" : "md:flex"} flex-wrap gap-2 mt-3`}
          >
            {(p as any)?.reraNumber && (
              <span className="text-xs font-normal px-2 py-1 text-primary">
                RERA Approved
              </span>
            )}
            <span className="text-xs font-normal px-2 py-1 text-primary">
              Zero Brokerage
            </span>
          </div>

          {/* meta icons row */}
          <div
            className={`mt-4 text-xs text-gray-600 border-t pt-4 border-gray-200 ${vertical
              ? "grid grid-cols-2 gap-x-2 gap-y-3 text-[11px] sm:text-xs"
              : "grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6"
              }`}
          >
            <div className="items-center gap-2 flex">
              <SuperBuiitupAraea size={24} color={bgPriceColoricon} />
              <div className="flex flex-col">
                <div className="text-xs text-gray-500 tracking-wide">
                  Total Area
                </div>

                <div className="font-medium">
                  {(p as any)?.totalArea?.value
                    ? `${(p as any).totalArea.value} ${(p as any).totalArea.unit}`
                    : "—"}
                </div>
              </div>
            </div>

            <div className="items-center gap-2 flex">
              <WaterTypeIcon size={24} color={bgPriceColoricon} />
              <div className="flex flex-col">
                <div className="text-xs text-gray-500 tracking-wide">
                  Water Source
                </div>
                <div className="font-medium">
                  {(p as any)?.waterSource ?? "—"}
                </div>
              </div>
            </div>

            <div className="items-center gap-2 flex">
              <SoilTypeIcon size={24} color={bgPriceColoricon} />
              <div className="flex flex-col">
                <div className="text-xs text-gray-500 tracking-wide">
                  Soil Type
                </div>
                <div className="font-medium">
                  {(p as any)?.soilType?.trim() ?? "—"}
                </div>
              </div>
            </div>

            <div className="items-center gap-2 flex">
              <RoadAccessIcon size={24} color={bgPriceColoricon} />
              <div className="flex flex-col">
                <div className="text-xs text-gray-500 tracking-wide">
                  Road Access
                </div>
                <div className="font-medium">
                  {(p as any)?.accessRoadType?.trim() ?? "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Link>

      {/* Right: price card */}
      <aside
        className={`rounded-xl ${vertical
          ? "w-full px-2.5 sm:px-3 py-2 flex items-center justify-between gap-2"
          : "w-full mt-3 px-3 py-2 flex items-center justify-between gap-3 md:w-52 md:p-3 md:flex-col md:justify-center md:mt-0"
          }`}
        style={{ backgroundColor: bgPriceColor }}
      >
        {/* PRICE */}
        <div
          className={`${vertical
              ? "flex min-w-0 flex-col"
            : "flex flex-col md:items-center md:text-center"
            }`}
        >
          <div
            className={`text-green-700 font-semibold ${vertical
                ? "text-base sm:text-lg leading-tight"
              : "text-lg leading-tight md:text-2xl"
              }`}
          >
            {formattedPrice || "Price on request"}
            {formattedPrice && isRentListing && (
              <span className="text-sm font-medium"> / month</span>
            )}
          </div>

          <div className="text-xs text-gray-600">
            {isRentListing ? "Price per month" : `₹ ${(p as any)?.pricePerSqft}/sqft`}
          </div>
        </div>

        {/* BUTTON */}
        <div
          className={`${vertical
            ? "shrink-0"
            : "shrink-0 md:w-full md:mt-4 flex justify-center"
            }`}
        >
          <ContactOwnerButton
            projectId={p.id}
            propertyType="agriculturals"
            listingType={p?.listingType}
            listingSource={resolvedListingSource}
            createdBy={(p as any)?.createdBy}
            ownerName={p?.createdBy?.name}
            ownerPhone={(p as any)?.createdBy?.contact ?? (p as any)?.phone}
            ownerEmail={p?.createdBy?.email}
            postedOn={(p as any)?.createdAt}
            price={p?.price}
            propertyLabel={p?.title}
            className={`btn-primary text-white rounded-md shadow-sm transition font-medium whitespace-nowrap ${vertical
              ? "px-3 sm:px-4 py-1.5 text-xs sm:text-sm"
              : "px-4 py-1.5 text-sm md:w-[90%] md:py-2 md:text-base "
              }`}
          />
        </div>
      </aside>

      {showLoginDialog &&
        createPortal(
          <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/40">
            <LoginDialog
              open
              onClose={() => setShowLoginDialog(false)}
              onSwitchToRegister={() => {
                setShowLoginDialog(false);
                setShowRegisterDialog(true);
              }}
            />
          </div>,
          document.body,
        )}

      {showRegisterDialog &&
        createPortal(
          <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/40">
            <RegisterDialog
              open
              onClose={() => setShowRegisterDialog(false)}
              onSwitchToLogin={() => {
                setShowRegisterDialog(false);
                setShowLoginDialog(true);
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
};

export default AgriculturalCard;
