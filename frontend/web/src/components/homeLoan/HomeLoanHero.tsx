"use client";

import Image from "next/image";
import React from "react";

interface HomeLoanHeroProps {
  /**
   * Optional custom banner element or image.
   * If not provided, the default home-loan banner is displayed.
   */
  bannerSlot?: React.ReactNode;
}

export default function HomeLoanHero({ bannerSlot }: HomeLoanHeroProps) {
  const scrollToCalculator = (tab: "eligibility" | "emi") => {
    window.dispatchEvent(
      new CustomEvent("home-loan-calculator-tab", { detail: tab })
    );

    const el = document.getElementById("calculator");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative w-full overflow-hidden bg-gradient-to-b from-[#F2FAF5] via-[#F8FCFA] to-white pt-8 pb-7 sm:pt-14 sm:pb-16 lg:pt-16">
      {/* Decorative Topographic / Wave Contour Background */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-45 overflow-hidden">
        <svg
          className="absolute -top-12 left-0 w-full h-full min-w-[1000px]"
          viewBox="0 0 1440 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M-50,160 C300,120 600,260 900,160 C1200,60 1350,190 1500,140"
            stroke="#86EFAC"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            fill="none"
          />
          <path
            d="M-50,220 C280,180 580,320 880,220 C1180,120 1380,260 1500,200"
            stroke="#BBF7D0"
            strokeWidth="1.75"
            fill="none"
          />
          <path
            d="M-20,90 C320,50 620,190 920,90 C1220,-10 1380,110 1500,70"
            stroke="#86EFAC"
            strokeWidth="1.25"
            fill="none"
          />
          <path
            d="M-40,300 C260,250 560,400 860,300 C1160,200 1360,350 1500,280"
            stroke="#BBF7D0"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M-60,380 C240,320 540,460 840,370 C1140,280 1340,420 1500,350"
            stroke="#86EFAC"
            strokeWidth="1.2"
            strokeDasharray="6 6"
            fill="none"
          />
        </svg>
      </div>

      <div className="relative z-10 container mx-auto">
        <div className="grid grid-cols-1 items-center gap-5 sm:gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Left Column: Content */}
          <div className="flex flex-col items-start text-left lg:col-span-5">
            {/* Tag / Category */}
            <span className="mb-2 text-sm font-bold tracking-tight text-gray-900 sm:mb-4 sm:text-base">
              Plan Your Home
            </span>

            {/* Main Headline */}
            <h1 className="text-[28px] font-extrabold leading-[1.16] tracking-tight text-[#16A34A] min-[390px]:text-3xl sm:text-4xl md:text-5xl lg:text-[46px] lg:leading-[1.18]">
              Found a Home you Like?
              <br />
              Let's work out the Numbers.
            </h1>

            {/* Description */}
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-gray-500 sm:mt-5 sm:text-base sm:text-gray-600">
              Explore the right home-loan options, check your eligibility,
              calculate your EMI, and get expert guidance through every
              step—from application to approval.
            </p>

            {/* CTA Buttons */}
            <div className="mt-5 flex flex-wrap items-center gap-3 sm:mt-8 sm:gap-4">
              <button
                type="button"
                onClick={() => scrollToCalculator("emi")}
                className="rounded-lg bg-[#16A34A] px-5 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[#15803D] hover:shadow-md active:scale-[0.98] sm:px-7 sm:text-base cursor-pointer"
              >
                Calculate your EMI
              </button>
              <button
                type="button"
                onClick={() => scrollToCalculator("eligibility")}
                className="rounded-lg border-2 border-[#16A34A] bg-transparent px-5 py-3 text-sm font-medium text-[#16A34A] transition-all duration-200 hover:bg-[#16A34A]/8 active:scale-[0.98] sm:px-7 sm:text-base cursor-pointer"
              >
                Check Loan Eligibility
              </button>
            </div>
          </div>

          {/* Right Column: Banner */}
          <div className="flex w-full items-center justify-center lg:col-span-7">
            {bannerSlot ? (
              bannerSlot
            ) : (
              <div className="relative -mt-1 h-[220px] w-full max-w-[680px] sm:mt-0 sm:h-[360px] sm:max-w-[720px] md:h-[430px] lg:h-[430px] lg:max-w-none xl:h-[466px] 2xl:h-[500px]">
                <Image
                  src="/home-loan/loan_banner.png"
                  alt="Home loan planning illustration"
                  fill
                  priority
                  sizes="(min-width: 1024px) 58vw, 100vw"
                  className="object-contain"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
