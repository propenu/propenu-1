"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiArrowRight, FiClock } from "react-icons/fi";
import { getBlogs } from "@/data/ClientData";
import { useCity } from "@/hooks/useCity";
import { RiArrowRightSLine } from "react-icons/ri";
import { ArrowDropdownIcon } from "@/icons/icons";

type BlogPost = {
  _id?: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  featuredImage: string;
  imageAlt?: string;
  readTime?: number;
  publishedAt?: string;
  createdAt?: string;
};

type BlogsResponse = {
  items?: BlogPost[];
  data?: BlogPost[];
};

type BlogsClientProps = {
  variant?: "home" | "page";
  showHeader?: boolean;
};

const fallbackImage = "/images/placeholder.svg";

function formatDate(value?: string) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function BlogCard({ post }: { post: BlogPost }) {
  const date = formatDate(post.publishedAt ?? post.createdAt);

  return (
    <article className="group flex h-full overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <Link
        href={`/blogs/${post.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-full w-full flex-col"
      >
        <div className="relative aspect-[2/1] w-full shrink-0 overflow-hidden bg-gray-50">
          <Image
            src={post.featuredImage || fallbackImage}
            alt={post.imageAlt || post.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="max-w-full rounded-full bg-green-50 px-3 py-1 font-medium text-[#26ad5f]">
              {post.category}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <FiClock size={13} />
              {post.readTime ?? 5} min read
            </span>
          </div>

          <h2 className="line-clamp-2 text-base font-semibold leading-6 text-gray-950 transition-colors  sm:text-lg">
            {post.title}
          </h2>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-500 sm:line-clamp-2 lg:line-clamp-3">
            {post.excerpt}
          </p>

          <div className="mt-auto flex items-center justify-between gap-3 pt-4">
            <span className="text-xs font-medium text-gray-400">{date}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[#26ad5f]">
              Read more <FiArrowRight size={15} />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export default function BlogsClient({
  variant = "home",
  showHeader = true,
}: BlogsClientProps) {
  const { selectedCity } = useCity();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState(["All"]);
  const [loading, setLoading] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const isPage = variant === "page";

  const updateScrollControls = () => {
    const element = scrollRef.current;
    if (!element) return;

    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    const isLaptop = window.matchMedia("(min-width: 1024px)").matches;

    setCanScrollLeft(isLaptop && element.scrollLeft > 4);
    setCanScrollRight(isLaptop && element.scrollLeft < maxScrollLeft - 4);
  };

  const scrollBlogs = (direction: "left" | "right") => {
    const element = scrollRef.current;
    if (!element) return;

    const scrollAmount = Math.max(element.clientWidth * 0.85, 280);

    element.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    let isActive = true;

    setLoading(true);

    getBlogs({
      limit: isPage ? 24 : 8,
      published: true,
      sortBy: "publishedAt",
      sortOrder: "desc",
      category: activeCategory === "All" ? undefined : activeCategory,
    })
      .then((res: BlogsResponse) => {
        if (!isActive) return;

        const nextPosts = res.items ?? res.data ?? [];

        setPosts(nextPosts);

        if (activeCategory === "All") {
          const apiCategories = nextPosts
            .map((post) => post.category)
            .filter((category): category is string => Boolean(category));

          setCategories(["All", ...Array.from(new Set(apiCategories))]);
        }
      })
      .catch((err) => {
        if (!isActive) return;

        console.error("Blog fetch failed:", err);
        setPosts([]);
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [activeCategory, isPage]);

  useEffect(() => {
    if (isPage) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    updateScrollControls();

    const element = scrollRef.current;
    if (!element) return;

    element.addEventListener("scroll", updateScrollControls, { passive: true });
    window.addEventListener("resize", updateScrollControls);

    return () => {
      element.removeEventListener("scroll", updateScrollControls);
      window.removeEventListener("resize", updateScrollControls);
    };
  }, [posts, loading, isPage]);

  return (
    <section className="w-full">
      {showHeader && (
        <div className="mb-2 flex items-start justify-between gap-3 sm:mb-3 sm:items-end sm:gap-4">
          <div className="headingSideBar min-w-0">
            <h1 className="truncate text-base font-bold sm:text-2xl">
              Property Blogs
            </h1>
            <p className="mt-0.5 text-xs text-gray-500 sm:mt-1 sm:text-base">
              Explore the latest insights on property
            </p>
          </div>

          {!isPage && posts.length > 0 && (
            <Link
              href="/blogs"
              aria-label="View all property blogs"
              className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-green-600 hover:text-green-700 sm:text-base"
            >
              View All <RiArrowRightSLine size={18} />
            </Link>
          )}
        </div>
      )}

      {/* {categories.length > 1 && (
        <div
          className={
            isPage
              ? "sticky top-0 z-10 -mx-4 mb-6 flex gap-2 overflow-x-auto border-b border-gray-100 bg-white/95 px-4 py-3 no-scrollbar backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-3"
              : "-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:mb-5 sm:px-0"
          }
        >
          {categories.map((category) => {
            const isActive = activeCategory === category;
         

            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition sm:px-4 sm:py-2 ${
                  isActive
                    ? "border-[#26ad5f] bg-[#26ad5f] text-white shadow-sm"
                    : "border-gray-200 bg-white text-gray-600 hover:border-green-200 hover:bg-green-50"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
      )} */}

      <div className={isPage ? "relative" : "relative"}>
        {!isPage && (
          <>
            <button
              type="button"
              aria-label="Scroll blogs left"
              onClick={() => scrollBlogs("left")}
              disabled={!canScrollLeft}
              className="absolute -left-5 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-md transition disabled:cursor-not-allowed disabled:opacity-0 lg:flex"
            >
              <ArrowDropdownIcon size={16} color="#26ad5f" className="rotate-90" />
            </button>

            <button
              type="button"
              aria-label="Scroll blogs right"
              onClick={() => scrollBlogs("right")}
              disabled={!canScrollRight}
              className="absolute -right-5 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-md transition disabled:cursor-not-allowed disabled:opacity-0 lg:flex"
            >
              <ArrowDropdownIcon size={16} color="#26ad5f" className="rotate-270" />
            </button>
          </>
        )}

        <div
          ref={scrollRef}
          className={
            isPage
              ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "-mx-4 flex scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:flex lg:overflow-x-auto lg:px-1 lg:pb-2"
          }
        >
          {loading ? (
            Array.from({ length: isPage ? 8 : 4 }).map((_, index) => (
              <div
                key={index}
                className={
                  isPage
                    ? "min-h-[340px] animate-pulse overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm"
                    : "min-h-[340px] w-[calc(100vw-32px)] max-w-[360px] shrink-0 snap-center animate-pulse overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm sm:w-auto sm:max-w-none sm:shrink lg:basis-[calc((100%-48px)/4)] lg:w-auto lg:shrink-0"
                }
              >
                <div className="aspect-16/10 bg-gray-100" />
                <div className="space-y-3 p-4">
                  <div className="h-5 w-24 rounded bg-gray-100" />
                  <div className="h-5 w-full rounded bg-gray-100" />
                  <div className="h-5 w-3/4 rounded bg-gray-100" />
                  <div className="h-4 w-full rounded bg-gray-100" />
                  <div className="h-4 w-2/3 rounded bg-gray-100" />
                </div>
              </div>
            ))
          ) : posts.length > 0 ? (
            posts.map((post) => (
              <div
                key={post._id ?? post.slug}
                className={
                  isPage
                    ? "min-w-0"
                    : "w-[calc(100vw-32px)] max-w-[360px] shrink-0 snap-center sm:w-auto sm:max-w-none sm:shrink lg:basis-[calc((100%-48px)/4)] lg:w-auto lg:shrink-0"
                }
              >
                <BlogCard post={post} />
              </div>
            ))
          ) : (
            <div className="w-full shrink-0 rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500 sm:col-span-2 xl:col-span-4">
              No blogs found.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
 
