"use client";

import Image from "next/image";
import heroBannerMobile from "@/asserts/propenu-hero-banner-for-moblie.jpeg";
import heroBannerwebp from "@/asserts/propenu-hero-web-banner.jpeg";
import { useEffect, useMemo, useRef, useState } from "react";
import "./bannerStyle.css";
import SearchBox from "./SearchBox";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi2";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getResolvedSiteBanners,
  ResolvedBannerImage,
} from "@/data/ClientData";
import { useCity } from "@/hooks/useCity";

type DeviceSlide = {
  image?: string;
  heading?: {
    enabled: boolean;
    html: string;
  };
};

const pickSlide = (
  images: ResolvedBannerImage[],
  index: number,
): DeviceSlide | undefined => {
  if (!images.length) return undefined;
  return images[index] || images[0];
};

const BANNER_CACHE_PREFIX = "propenu-site-banners";

const getBannerCacheKey = (state?: string, city?: string) => {
  const cleanState = String(state || "").trim().toLowerCase();
  const cleanCity = String(city || "").trim().toLowerCase();
  if (!cleanState || !cleanCity) return "";
  return `${BANNER_CACHE_PREFIX}:${cleanState}:${cleanCity}`;
};

const Banner = () => {
  const queryClient = useQueryClient();
  const [activeBannerIdx, setActiveBannerIdx] = useState(0);
  const [previousBannerIdx, setPreviousBannerIdx] = useState<number | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTransitioningRef = useRef(false);
  const { selectedCity } = useCity();
  const hasSelectedCity = Boolean(selectedCity?.state && selectedCity?.city);
  const bannerCacheKey = getBannerCacheKey(selectedCity?.state, selectedCity?.city);
  const bannerQueryKey = useMemo(
    () => [
      "site-branding-banners-resolve",
      selectedCity?.state || "",
      selectedCity?.city || "",
    ],
    [selectedCity?.city, selectedCity?.state],
  );

  const { data: bannersData } = useQuery({
    queryKey: bannerQueryKey,
    queryFn: () =>
      getResolvedSiteBanners({
        state: selectedCity?.state,
        city: selectedCity?.city,
      }),
    enabled: hasSelectedCity,
    staleTime: 1000 * 60 * 15,
  });

  useEffect(() => {
    if (!bannerCacheKey || !hasSelectedCity) return;

    try {
      const cached = window.localStorage.getItem(bannerCacheKey);
      if (!cached) return;
      queryClient.setQueryData(bannerQueryKey, JSON.parse(cached));
    } catch {
      // Ignore malformed cache.
    }
  }, [bannerCacheKey, bannerQueryKey, hasSelectedCity, queryClient]);

  const deviceImages = useMemo(() => {
    const data = bannersData?.data;
    return {
      desktop: Array.isArray(data?.desktop?.images) ? data.desktop.images : [],
      laptop: Array.isArray(data?.laptop?.images) ? data.laptop.images : [],
      tablet: Array.isArray(data?.tablet?.images) ? data.tablet.images : [],
      mobile: Array.isArray(data?.mobile?.images) ? data.mobile.images : [],
    };
  }, [bannersData]);

  const slideCount = useMemo(
    () =>
      Math.max(
        deviceImages.desktop.length,
        deviceImages.laptop.length,
        deviceImages.tablet.length,
        deviceImages.mobile.length,
        0,
      ),
    [deviceImages],
  );

  const canShowFallbackBanner = false;

  useEffect(() => {
    if (!bannerCacheKey || !bannersData?.success) return;
    try {
      window.localStorage.setItem(bannerCacheKey, JSON.stringify(bannersData));
    } catch {
      // Cache is best-effort only.
    }
  }, [bannerCacheKey, bannersData]);

  const showBanner = (nextIndex: number) => {
    if (
      isTransitioningRef.current ||
      slideCount <= 1 ||
      nextIndex === activeBannerIdx
    ) {
      return;
    }

    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }

    isTransitioningRef.current = true;
    setPreviousBannerIdx(activeBannerIdx);
    setActiveBannerIdx(nextIndex);
    transitionTimeoutRef.current = setTimeout(() => {
      setPreviousBannerIdx(null);
      isTransitioningRef.current = false;
    }, 700);
  };

  useEffect(() => {
    if (activeBannerIdx >= slideCount) {
      setActiveBannerIdx(0);
      setPreviousBannerIdx(null);
      isTransitioningRef.current = false;
    }
  }, [activeBannerIdx, slideCount]);

  useEffect(() => {
    setActiveBannerIdx(0);
    setPreviousBannerIdx(null);
    isTransitioningRef.current = false;
  }, [selectedCity?.state, selectedCity?.city]);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
      isTransitioningRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (slideCount <= 1) return;
    const bannerInterval = setInterval(() => {
      showBanner((activeBannerIdx + 1) % slideCount);
    }, 4000);
    return () => clearInterval(bannerInterval);
  }, [activeBannerIdx, slideCount]);

  const handlePrevSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (slideCount <= 1) return;
    showBanner((activeBannerIdx - 1 + slideCount) % slideCount);
  };

  const handleNextSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (slideCount <= 1) return;
    showBanner((activeBannerIdx + 1) % slideCount);
  };

  const cleanRichTextHtml = (rawHtml?: string): string => {
    if (!rawHtml || typeof rawHtml !== "string") return "";

    let html = rawHtml;
    html = html.replace(/\\"/g, '"');
    html = html.replace(/style\s*=\s*(["'])([\s\S]*?)\1/gi, (_, _quote, styleContent) => {
      const cleaned = styleContent
        .replace(/&quot;?/gi, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");

      const declarations = cleaned.split(";");
      const validDeclarations: string[] = [];

      for (const decl of declarations) {
        const trimmed = decl.trim();
        if (!trimmed) continue;

        const colonIdx = trimmed.indexOf(":");
        if (colonIdx === -1) continue;

        const prop = trimmed.slice(0, colonIdx).trim().toLowerCase();
        let val = trimmed.slice(colonIdx + 1).trim();

        if (!prop || !val) continue;

        if (prop === "font-family") {
          const rawFontName = val.replace(/['"\\]/g, "").trim();
          if (!rawFontName || /^,+$/.test(rawFontName) || rawFontName.toLowerCase() === "quot") {
            continue;
          }
          val = rawFontName
            .split(",")
            .map((f: string) => {
              const font = f.trim();
              return font.includes(" ") ? `'${font}'` : font;
            })
            .join(", ");
        }

        validDeclarations.push(`${prop}: ${val}`);
      }

      if (validDeclarations.length === 0) {
        return "";
      }

      return `style="${validDeclarations.join("; ")}"`;
    });

    return html;
  };

  const renderBannerContent = (deviceConfig?: DeviceSlide) => {
    const headingHtml = cleanRichTextHtml(deviceConfig?.heading?.html);
    const hasDynamicHeading =
      deviceConfig?.heading?.enabled !== false && Boolean(headingHtml.trim());

    if (hasDynamicHeading) {
      return (
        <div className="space-y-2">
          <div
            className="banner-dynamic-heading banner-rich-text"
            dangerouslySetInnerHTML={{ __html: headingHtml }}
          />
        </div>
      );
    }

    return <div className="space-y-2.5 xl:space-y-3" />;
  };

  const renderBannerLayer = (
    slideIndex: number,
    layerClassName: string,
    layerKey: string,
  ) => {
    const desktopConfig = pickSlide(deviceImages.desktop, slideIndex);
    const laptopConfig = pickSlide(deviceImages.laptop, slideIndex);
    const tabletConfig = pickSlide(deviceImages.tablet, slideIndex);
    const mobileConfig = pickSlide(deviceImages.mobile, slideIndex);

    return (
      <div key={layerKey} className={layerClassName}>
        <div className="hidden xl:block w-full relative banner-device-frame banner-device-desktop">
          {desktopConfig?.image ? (
            <img
              src={desktopConfig.image}
              alt="Propenu desktop banner"
              className="banner-hero-image w-full h-full object-cover"
            />
          ) : canShowFallbackBanner ? (
            <Image
              src={heroBannerwebp}
              alt="Propenu hero banner"
              priority
              sizes="100vw"
              className="banner-hero-image h-full w-full object-cover"
            />
          ) : null}

          <div className="absolute inset-0 flex items-center pointer-events-none pb-12">
            <div className="w-full md:w-[66%] px-6 py-6 md:px-10 lg:px-14 xl:py-10 pointer-events-auto space-y-4">
              {renderBannerContent(desktopConfig)}
            </div>
          </div>
        </div>

        <div className="hidden lg:block xl:hidden w-full relative banner-device-frame banner-device-laptop">
          {laptopConfig?.image ? (
            <img
              src={laptopConfig.image}
              alt="Propenu laptop banner"
              className="banner-hero-image w-full h-full object-cover"
            />
          ) : canShowFallbackBanner ? (
            <Image
              src={heroBannerwebp}
              alt="Propenu hero banner"
              priority
              sizes="100vw"
              className="banner-hero-image h-full w-full object-cover"
            />
          ) : null}

          <div className="absolute inset-0 flex items-center pointer-events-none pb-12">
            <div className="w-full md:w-[70%] px-8 py-6 pointer-events-auto space-y-3">
              {renderBannerContent(laptopConfig)}
            </div>
          </div>
        </div>

        <div className="hidden md:block lg:hidden w-full relative banner-device-frame banner-device-tablet">
          {tabletConfig?.image ? (
            <img
              src={tabletConfig.image}
              alt="Propenu tablet banner"
              className="banner-hero-image w-full h-full object-cover"
            />
          ) : canShowFallbackBanner ? (
            <Image
              src={heroBannerwebp}
              alt="Propenu hero banner"
              priority
              sizes="100vw"
              className="banner-hero-image h-full w-full object-cover"
            />
          ) : null}

          <div className="absolute inset-0 flex items-center pointer-events-none pb-12">
            <div className="w-full md:w-[80%] px-6 py-5 pointer-events-auto space-y-3">
              {renderBannerContent(tabletConfig)}
            </div>
          </div>
        </div>

        <div className="block md:hidden w-full relative banner-device-frame banner-device-mobile">
          {mobileConfig?.image ? (
            <img
              src={mobileConfig.image}
              alt="Propenu mobile banner"
              className="banner-hero-image w-full h-full object-cover"
            />
          ) : canShowFallbackBanner ? (
            <Image
              src={heroBannerMobile}
              alt="Propenu hero banner mobile"
              priority
              sizes="100vw"
              className="banner-hero-image w-full h-full object-cover"
            />
          ) : null}

          <div className="absolute inset-0 flex items-start pointer-events-none pb-8">
            <div className="w-full px-5 py-6 space-y-3 pointer-events-auto">
              {renderBannerContent(mobileConfig)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="relative w-full overflow-visible group mb-10 sm:mb-12 md:mb-16 select-none">
      <div className="banner-carousel-stage">
        {previousBannerIdx !== null &&
          renderBannerLayer(
            previousBannerIdx,
            "banner-carousel-layer banner-carousel-layer-previous",
            `${previousBannerIdx}-previous`,
          )}
        {renderBannerLayer(
          activeBannerIdx,
          `banner-carousel-layer-current ${previousBannerIdx !== null ? "banner-carousel-slide" : ""}`,
          `${activeBannerIdx}-current`,
        )}
      </div>

      {slideCount > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrevSlide}
            disabled={previousBannerIdx !== null}
            aria-label="Previous banner slide"
            className="absolute left-3 md:left-6 top-[45%] -translate-y-1/2 z-10 p-2 sm:p-2.5 rounded-full bg-black/35 hover:bg-black/70 text-white backdrop-blur-md opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300 cursor-pointer shadow-lg hover:scale-110 active:scale-95 disabled:pointer-events-none disabled:cursor-default disabled:hover:scale-100 disabled:active:scale-100"
          >
            <HiChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          <button
            type="button"
            onClick={handleNextSlide}
            disabled={previousBannerIdx !== null}
            aria-label="Next banner slide"
            className="absolute right-3 md:right-6 top-[45%] -translate-y-1/2 z-10 p-2 sm:p-2.5 rounded-full bg-black/35 hover:bg-black/70 text-white backdrop-blur-md opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300 cursor-pointer shadow-lg hover:scale-110 active:scale-95 disabled:pointer-events-none disabled:cursor-default disabled:hover:scale-100 disabled:active:scale-100"
          >
            <HiChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-20 hidden translate-y-1/2 justify-center px-4 pointer-events-auto md:flex sm:px-6 lg:px-8">
        <div className="w-full max-w-3xl xl:max-w-4xl">
          <SearchBox hideOnMobile={true} className="max-w-none shadow-xl" />
        </div>
      </div>
    </section>
  );
};

export default Banner;
