"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getSiteLogo } from "@/data/ClientData";
import Logo from "@/animations/Logo";
import {
  MdOutlineWhatsapp,
  MdOutlineBookmarkBorder,
  MdOutlineNotificationsActive,
  MdOutlineAddHomeWork,
  MdOutlineAutoAwesome,
  MdVerified,
} from "react-icons/md";

export default function AuthHeroSection() {
  const { data: siteLogoData, isLoading: isLogoLoading } = useQuery({
    queryKey: ["site-branding-logo"],
    queryFn: getSiteLogo,
    staleTime: 1000 * 60 * 30, // 30 mins
  });
  const logoUrl = siteLogoData?.data?.logoUrl;

  return (
    <div className="relative hidden w-full lg:flex lg:w-[70%] lg:flex-[0_0_70%] min-h-screen flex-col justify-between overflow-hidden bg-gray-950 p-10 xl:p-14 text-white select-none font-['Poppins',sans-serif]">
      {/* Background Hero Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/login_hero_img.jpeg"
          alt="Propenu Luxury Real Estate"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 70vw"
          className="object-cover object-center scale-100 transition-transform duration-1000 ease-out hover:scale-105"
        />
        {/* Layered cinematic gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />
      </div>

      {/* Top Bar: Brand Logo from API */}
      <div className="relative z-10">
        <Link
          href="/"
          className="inline-flex items-center transition-opacity hover:opacity-85"
          aria-label="Propenu Home"
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Propenu Logo"
              className="h-12 max-w-[170px] object-contain"
            />
          ) : isLogoLoading ? (
            <div className="h-8 w-32 animate-pulse rounded-lg bg-white/20" />
          ) : (
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center text-emerald-400">
                <Logo />
              </span>
              <span className="text-2xl font-bold tracking-tight text-white">
                Propenu
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* Bottom Content: Bento Grid of Account Benefits */}
      <div className="relative z-10 max-w-3xl xl:max-w-4xl space-y-5 pb-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 backdrop-blur-md px-3.5 py-1.5 text-xs font-semibold tracking-wide text-emerald-300 border border-emerald-400/30 shadow-sm">
          <MdOutlineAutoAwesome className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
          <span>Benefits of Creating an Account</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl xl:text-4xl 2xl:text-5xl font-bold tracking-tight leading-tight text-white drop-shadow-md">
            Everything You Need, in One Free Account.
          </h1>
          <p className="text-xs sm:text-sm xl:text-base text-gray-200 leading-relaxed font-normal max-w-2xl">
            Join thousands of smart buyers, tenants, and property owners managing their entire real estate journey with zero brokerage.
          </p>
        </div>

        {/* Bento Grid: 1 Large Featured Card + 3 Stacked Secondary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 pt-1">
          {/* Large Featured Card: Direct Owner & Zero Brokerage */}
          <div className="md:col-span-7 relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950/50 via-black/55 to-black/65 backdrop-blur-xl border border-emerald-500/30 p-5 xl:p-6 transition-all duration-300 hover:border-emerald-400/60 shadow-xl flex flex-col justify-between group">
            {/* Ambient radial glow */}
            <div className="absolute -top-12 -right-12 h-36 w-36 rounded-full bg-emerald-500/15 blur-2xl group-hover:bg-emerald-500/25 transition-all pointer-events-none" />

            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-[11px] font-semibold text-emerald-300 mb-3">
                <MdOutlineWhatsapp className="h-3.5 w-3.5 text-emerald-400" />
                <span>Direct Owner Access</span>
              </div>

              <h2 className="text-lg xl:text-xl font-bold text-white tracking-tight leading-snug">
                Chat on WhatsApp with Zero Brokerage
              </h2>

              <p className="text-xs xl:text-sm text-gray-300 mt-2 leading-relaxed">
                Directly contact verified property owners and builders. No middlemen, no commission, and instant responses on WhatsApp.
              </p>
            </div>

            <div className="mt-5 pt-3.5 border-t border-white/10 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-emerald-300">
                <MdVerified className="h-4 w-4 text-emerald-400" />
                100% Verified Owners
              </span>
              <span className="text-[11px] font-medium text-gray-300 bg-white/10 px-2.5 py-0.5 rounded-full">
                0% Brokerage
              </span>
            </div>
          </div>

          {/* Right Stack: 3 Secondary Benefit Cards */}
          <div className="md:col-span-5 flex flex-col gap-2.5 justify-between">
            {/* Benefit 1: Universal Shortlists */}
            <div className="group flex items-center gap-3 rounded-2xl bg-black/45 backdrop-blur-md border border-white/15 p-3 xl:p-3.5 transition-all duration-300 hover:border-emerald-400/40 hover:bg-black/60 shadow-md">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                <MdOutlineBookmarkBorder className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs xl:text-sm font-semibold text-white tracking-tight">
                  Universal Shortlists
                </h3>
                <p className="text-[11px] text-gray-300 mt-0.5 leading-snug">
                  Save favorite homes & sync across all devices.
                </p>
              </div>
            </div>

            {/* Benefit 2: Price-Drop Alerts */}
            <div className="group flex items-center gap-3 rounded-2xl bg-black/45 backdrop-blur-md border border-white/15 p-3 xl:p-3.5 transition-all duration-300 hover:border-emerald-400/40 hover:bg-black/60 shadow-md">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                <MdOutlineNotificationsActive className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs xl:text-sm font-semibold text-white tracking-tight">
                  Price-Drop Alerts
                </h3>
                <p className="text-[11px] text-gray-300 mt-0.5 leading-snug">
                  Real-time notifications when prices drop.
                </p>
              </div>
            </div>

            {/* Benefit 3: Free Property Listing */}
            <div className="group flex items-center gap-3 rounded-2xl bg-black/45 backdrop-blur-md border border-white/15 p-3 xl:p-3.5 transition-all duration-300 hover:border-emerald-400/40 hover:bg-black/60 shadow-md">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                <MdOutlineAddHomeWork className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs xl:text-sm font-semibold text-white tracking-tight">
                  Free Property Listing
                </h3>
                <p className="text-[11px] text-gray-300 mt-0.5 leading-snug">
                  Post properties at 0 cost & reach thousands.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
