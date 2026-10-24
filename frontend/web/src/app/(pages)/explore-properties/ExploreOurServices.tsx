"use client";

import Image from "next/image";
import Link from "next/link";
import { useCity } from "@/hooks/useCity";
import { FiArrowRight } from "react-icons/fi";

/**
 * ExploreOurServices
 * - Responsive grid: sm:2, md:3, lg:4
 * - Each image card is a semantic link
 */

const data = [
  {
    href: "/home-loans",
    image: "/home-loan/home_loan.png",
    title: "Easy Home Loans, Expert Support",
    desc: "Quick approvals, low interest, zero hassle.",
  },
  {
    href: "/construction-services",
    image: "/home-loan/construction.jpeg",
    title: "Construction & Renovation Services",
    desc: "From planning to complete project delivery.",
  },
  {
    href: "/interior-designer",
    image: "/home-loan/interior.png",
    title: "Modern Home Interior Designers",
    desc: "Transforming your space with expert creativity",
  },
  {
    href: "/home-care",
    image: "/home-loan/home_care.png",
    title: "Professional Home Care Services",
    desc: "Reliable cleaning, repairs, and maintenance.",
  },
];

export default function ExploreOurServices() {
  const { selectedCity } = useCity();
  return (
    <section className="relative w-full">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="headingSideBar">
          <h1 className="text-base font-bold sm:text-2xl truncate">
            Explore Our Services
          </h1>

          <p className="mt-1 text-xs text-gray-500 sm:text-base truncate">
            Services tailored for {selectedCity?.city ?? "Hyderabad"} residents
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
        {data.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700"
          >
            <article className="flex h-full flex-col justify-between rounded-xl border border-gray-200/70 bg-white p-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-300 hover:border-gray-300/80 hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] sm:rounded-[18px] sm:p-3.5">
              <div>
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-gray-100 sm:rounded-[14px]">
                  <Image
                    src={c.image}
                    alt={c.title}
                    fill
                    sizes="(min-width: 1024px) 25vw, 50vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>

                <div className="mt-2.5 sm:mt-3.5">
                  <h3 className="min-h-0 text-[14px] font-semibold leading-snug text-neutral-900 line-clamp-2 sm:min-h-0 sm:text-lg sm:font-medium lg:min-h-[58px] lg:text-[22px]">
                    {c.title}
                  </h3>

                  <div className="mt-1.5 flex items-end justify-between gap-2 sm:gap-3">
                    <p className="line-clamp-2 text-[11px] leading-[15px] text-neutral-500 sm:text-[13px] sm:leading-[18px] lg:text-[14px]">
                      {c.desc}
                    </p>
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#383838] text-white transition-all duration-200 group-hover:bg-black group-hover:scale-105 sm:h-9 sm:w-9 lg:h-10 lg:w-10"
                    >
                      <FiArrowRight
                        className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 lg:h-5 lg:w-5 transition-transform duration-200 group-hover:translate-x-0.5"
                      />
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}
