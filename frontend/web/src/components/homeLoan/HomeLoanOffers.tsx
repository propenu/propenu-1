"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDropdownIcon } from "@/icons/icons";
import LoanOfferCard from "./HomeLoanOfferCard";
import { topLoanOffers } from "./homeLoanData";

interface HomeLoanPlan {
  image: string;
  title: string;
  description: string;
}

const homeLoanPlans: HomeLoanPlan[] = [
  {
    image: "/home-loan/img1.png",
    title: "Home Purchase Loan",
    description: "Finance the purchase of a new or resale house or apartment.",
  },
  {
    image: "/home-loan/img2.png",
    title: "Home Construction Loan",
    description: "Build your dream home on a plot of land you own.",
  },
  {
    image: "/home-loan/img3.png",
    title: "Home Renovation Loan",
    description: "Upgrade your home with repairs, improvements and stylish interiors.",
  },
  {
    image: "/home-loan/img4.png",
    title: "Home Extension Loan",
    description: "Add extra rooms or floors to create more space for your family.",
  },
  {
    image: "/home-loan/img5.png",
    title: "Home Loan Top-Up",
    description: "Explore additional borrowing if you already have an eligible home loan.",
  },
  {
    image: "/home-loan/img6.png",
    title: "Joint Home Loan",
    description: "Apply for a home loan together with an eligible co-applicant.",
  },
  {
    image: "/home-loan/img7.png",
    title: "NRI Home Loan",
    description: "Explore home loans for Indians abroad buying or building in India.",
  },
  {
    image: "/home-loan/img8.png",
    title: "Plot Loan / Land Loan",
    description: "Finance the purchase of a residential plot for your future investment.",
  },
];

export default function HomeLoanOffers() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollControls = () => {
    const element = carouselRef.current;
    if (!element) return;

    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    const isLaptop = window.matchMedia("(min-width: 1024px)").matches;

    setCanScrollLeft(isLaptop && element.scrollLeft > 4);
    setCanScrollRight(isLaptop && element.scrollLeft < maxScrollLeft - 4);
  };

  const scrollOffers = (direction: "left" | "right") => {
    const element = carouselRef.current;
    if (!element) return;

    const scrollAmount = Math.max(element.clientWidth * 0.85, 280);

    element.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    updateScrollControls();

    const element = carouselRef.current;
    if (!element) return;

    element.addEventListener("scroll", updateScrollControls, { passive: true });
    window.addEventListener("resize", updateScrollControls);

    return () => {
      element.removeEventListener("scroll", updateScrollControls);
      window.removeEventListener("resize", updateScrollControls);
    };
  }, []);

  return (
    <section className="w-full bg-white">
      <div className="container mx-auto space-y-14">
        {/* <div className="overflow-hidden rounded-2xl bg-[#F5FFFC] py-8 shadow-[0_2px_22px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-4 px-6 sm:px-10">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
              Your Top Home Loan Matches
            </h2>
            <Link
              href="/home-loans/offers"
              className="shrink-0 text-sm sm:text-base font-medium text-gray-900 transition-colors hover:text-[#27AE60]"
            >
              View More &gt;
            </Link>
          </div>

          <div className="relative mt-8 px-6 sm:px-10">
            <button
              type="button"
              aria-label="Scroll home loan offers left"
              onClick={() => scrollOffers("left")}
              disabled={!canScrollLeft}
              className="absolute left-2 sm:left-4 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-md transition disabled:cursor-not-allowed disabled:opacity-0 lg:flex"
            >
              <ArrowDropdownIcon size={16} color="#26ad5f" className="rotate-90" />
            </button>

            <button
              type="button"
              aria-label="Scroll home loan offers right"
              onClick={() => scrollOffers("right")}
              disabled={!canScrollRight}
              className="absolute right-2 sm:right-4 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-md transition disabled:cursor-not-allowed disabled:opacity-0 lg:flex"
            >
              <ArrowDropdownIcon size={16} color="#26ad5f" className="rotate-270" />
            </button>

            <div
              ref={carouselRef}
              className="no-scrollbar flex gap-6 overflow-x-auto scroll-smooth pt-2 pb-6 px-1"
              style={{ scrollbarWidth: "none" }}
            >
              {topLoanOffers.map((offer, index) => (
                <div
                  key={`${offer.bankName}-${index}`}
                  className="w-[290px] shrink-0 sm:w-[320px] lg:w-[calc((100%-4.5rem)/4)] "
                >
                  <LoanOfferCard offer={offer} />
                </div>
              ))}
            </div>
          </div>
        </div> */}

        <div className="rounded-[28px] bg-[#F9FBFD] p-6 sm:p-8 lg:p-10">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl lg:text-[32px]">
              Home Loans for Every Home Plan
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 sm:gap-7">
            {homeLoanPlans.map((plan) => (
              <article key={plan.title} className="flex flex-col">
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-gray-100">
                  <Image
                    src={plan.image}
                    alt={plan.title}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="mt-3.5">
                  <h3 className="text-base font-semibold leading-snug text-gray-900 sm:text-[17px]">
                    {plan.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500 sm:text-[13px]">
                    {plan.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
