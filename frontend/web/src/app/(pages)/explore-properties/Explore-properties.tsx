"use client"
import Link from "next/link";
import residential from "@/asserts/residential.webp";
import commercial from "@/asserts/commercial.webp";
import land from "@/asserts/land.webp";
import agricultural from "@/asserts/agricultural.webp";
import { useCity } from "@/hooks/useCity";

const CATEGORIES = [
  {
    id: "residential",
    title: "Residential Apartment",
    image: residential,
    imageAlt: "Modern apartment tower at dusk",
    countText: "13,000+ Properties",
    color: "#FFF0E5",
    href: "/properties?type=residential",
  },
  {
    id: "commercial",
    title: "Commercial",
    color: "#FFF0E5",
    image: commercial,
    imageAlt: "Wide green land plots and dirt road",
    countText: "9,500+ Properties",
    href: "/properties?type=commercial",
  },

  {
    id: "Land/Plots",
    title: "Land/Plots",
    color: "#FFF0E5",
    image: land,
    imageAlt: "Mediterranean villa with palm trees",
    countText: "5,800+ Properties",
    href: "/properties?type=land",
  },
  {
    id: "agricultural",
    title: "Agricultural",
    color: "#FFF0E5",
    image: agricultural,
    imageAlt: "Cozy farm house with porch and lawn",
    countText: "3,200+ Properties",
    href: "/properties?type=agricultural",
  },
];


// --- Card UI ---------------------------------------------------------------

export function PropertyCard({ item }: { item: (typeof CATEGORIES)[number] }) {
  return (
    <Link
      href={item.href}
      className="relative h-[220px] overflow-hidden rounded-2xl group shadow-md transition-all duration-300 hover:shadow-xl sm:h-[300px] sm:rounded-3xl lg:h-[360px]"
    >
      {/* Background Color */}
      <div
        className="absolute inset-0"
      />

      {/* Image */}
      <div className="absolute bottom-0 right-0 w-full h-[75%]">
        <img
          src={item.image.src}
          alt={item.imageAlt}
          loading="lazy"
          className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      {/* Gradient Overlay */}
      <div className="absolute inset-0" />

      {/* Text Content */}
      <div className="relative z-10 p-3.5 sm:p-5 lg:p-6">
        <h3 className="text-base font-semibold leading-snug sm:text-xl lg:text-2xl">
          {item.title}
        </h3>
        {/* <p className="mt-2 text-base">
          {item.countText}
        </p> */}
      </div>
    </Link>
  );
}

// ---------------------------------------------- Page ------------------------------------------------------------------
export default function ExploreMorePropertiesPage() {
  const { selectedCity } = useCity();
  return (
    <section className="relative w-full">
      <div className="headingSideBar mb-4 sm:mb-6">
        <h1 className="text-base font-bold sm:text-2xl truncate">Explore Properties in {selectedCity?.city ?? "Hyderabad"} </h1>
        <p className="mt-1 text-sm text-gray-500 sm:text-base">Find apartments, villas, farmhouses, and residential plots in top localities.</p>
      </div>
      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4 lg:gap-8">
        {CATEGORIES.map((item) => (
          <PropertyCard key={item.id} item={item} />
        ))}
      </div>

      {/* JSON-LD for SEO (category list) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Explore More Properties",
            description:
              "Explore Hyderabad property categories including apartments, residential land, farm houses and villas.",
            hasPart: CATEGORIES.map((c) => ({
              "@type": "Collection",
              name: c.title,
              url: c.href,
            })),
          }),
        }}
      />
    </section>
  );
}
