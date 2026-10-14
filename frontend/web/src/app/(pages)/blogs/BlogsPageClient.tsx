"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  FiArrowRight,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiSearch,
} from "react-icons/fi";
import { getBlogs } from "@/data/ClientData";

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
  author?: {
    name?: string;
    designation?: string;
  };
  tags?: string[];
};

type BlogsResponse = {
  items?: BlogPost[];
  data?: BlogPost[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

const fallbackImage = "/images/placeholder.svg";
const pageSize = 12;

function formatDate(value?: string) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function BlogCard({ post, priority = false }: { post: BlogPost; priority?: boolean }) {
  const date = formatDate(post.publishedAt ?? post.createdAt);

  return (
    <article className="group overflow-hidden rounded-md border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-green-100 hover:shadow-lg">
      <Link href={`/blogs/${post.slug}`} className="flex w-full flex-col">
        <div className="relative aspect-[2/1] w-full overflow-hidden bg-gray-50">
          <Image
            src={post.featuredImage || fallbackImage}
            alt={post.imageAlt || post.title}
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>

        <div className="flex flex-col p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            {post.category ? (
              <span className="rounded-full bg-green-50 px-3 py-1 font-semibold text-[#26ad5f]">
                {post.category}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <FiClock size={13} />
              {post.readTime ?? 5} min read
            </span>
          </div>

          <h2 className="line-clamp-2 text-lg font-semibold leading-7 text-gray-950 transition-colors group-hover:text-[#26ad5f]">
            {post.title}
          </h2>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-500">
            {post.excerpt}
          </p>

          <div className="mt-5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-gray-600">
                {post.author?.name || "Propenu Editorial"}
              </p>
              {date ? (
                <p className="mt-1 truncate text-xs font-medium text-gray-400">
                  {date}
                </p>
              ) : null}
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#26ad5f]">
              Read more
              <FiArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function BlogSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="aspect-[2/1] animate-pulse bg-gray-100" />
      <div className="space-y-3 p-4 sm:p-5">
        <div className="h-5 w-24 animate-pulse rounded-full bg-gray-100" />
        <div className="h-5 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
      </div>
    </div>
  );
}

function BlogsPagination({
  page,
  totalItems,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const startItem = totalItems ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, totalItems);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1,
  );

  return (
    <div className="mt-8 flex flex-col gap-3 rounded-lg border border-gray-100 bg-white px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="text-sm text-gray-500">
        Showing{" "}
        <span className="font-semibold text-gray-950">
          {startItem}-{endItem}
        </span>{" "}
        of <span className="font-semibold text-gray-950">{totalItems}</span>{" "}
        stories
      </p>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
          aria-label="Previous page"
        >
          <FiChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1">
          {pages.map((item, index) => {
            const previousItem = pages[index - 1];
            const showGap = previousItem !== undefined && item - previousItem > 1;

            return (
              <div key={item} className="flex items-center gap-1">
                {showGap ? (
                  <span className="px-1 text-sm font-medium text-gray-400">...</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onPageChange(item)}
                  className={`h-9 min-w-9 rounded-md px-3 text-sm font-medium transition ${
                    page === item
                      ? "bg-[#26ad5f] text-white shadow-sm"
                      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {item}
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
          aria-label="Next page"
        >
          <FiChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function BlogsPageClient() {
  const categoryScrollRef = useRef<HTMLDivElement | null>(null);
  const categoryDragRef = useRef({
    isDragging: false,
    moved: false,
    scrollLeft: 0,
    startX: 0,
  });
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState(["All"]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    getBlogs({
      limit: 100,
      published: true,
      sortBy: "publishedAt",
      sortOrder: "desc",
    })
      .then((res: BlogsResponse) => {
        if (!isActive) return;

        const nextPosts = res.items ?? res.data ?? [];
        const nextCategories = nextPosts
          .map((post) => post.category)
          .filter((category): category is string => Boolean(category));

        setCategories(["All", ...Array.from(new Set(nextCategories))]);
      })
      .catch(() => {
        if (isActive) setCategories(["All"]);
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    setLoading(true);
    getBlogs({
      page,
      limit: pageSize,
      q: query.trim() || undefined,
      published: true,
      sortBy: "publishedAt",
      sortOrder: "desc",
      category: activeCategory === "All" ? undefined : activeCategory,
    })
      .then((res: BlogsResponse) => {
        if (!isActive) return;

        const nextPosts = res.items ?? res.data ?? [];
        const nextTotal = res.total ?? nextPosts.length;
        const nextTotalPages =
          res.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize));

        setPosts(nextPosts);
        setTotalItems(nextTotal);
        setTotalPages(nextTotalPages);

        if (page > nextTotalPages) {
          setPage(nextTotalPages);
        }
      })
      .catch(() => {
        if (isActive) {
          setPosts([]);
          setTotalItems(0);
          setTotalPages(1);
        }
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [activeCategory, page, query]);

  const handleCategoryPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;

    const element = categoryScrollRef.current;
    if (!element) return;

    categoryDragRef.current = {
      isDragging: true,
      moved: false,
      scrollLeft: element.scrollLeft,
      startX: event.clientX,
    };
    element.setPointerCapture(event.pointerId);
  };

  const handleCategoryPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const element = categoryScrollRef.current;
    const dragState = categoryDragRef.current;
    if (!element || !dragState.isDragging) return;

    const dragDistance = event.clientX - dragState.startX;
    if (Math.abs(dragDistance) > 4) {
      dragState.moved = true;
    }

    element.scrollLeft = dragState.scrollLeft - dragDistance;
  };

  const handleCategoryPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const element = categoryScrollRef.current;
    if (!element || !categoryDragRef.current.isDragging) return;

    categoryDragRef.current.isDragging = false;
    element.releasePointerCapture(event.pointerId);

    window.setTimeout(() => {
      categoryDragRef.current.moved = false;
    }, 0);
  };

  return (
    <main className="min-h-screen bg-[#F8FBF9]">
      <section className="border-b border-gray-100 bg-white">
        <div className="container flex flex-col gap-5 px-4 py-7 sm:py-9">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Real estate insights made simple
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-gray-500 sm:text-base">
              Market updates, buying tips, project launches, and local property
              stories in one place.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px] lg:items-center">
            <label className="relative block">
              <FiSearch className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search blogs"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-4 text-sm text-gray-700 outline-none transition focus:border-[#26ad5f] focus:ring-4 focus:ring-green-100"
              />
            </label>

            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600">
              {totalItems} stories
            </div>
          </div>

          <div
            ref={categoryScrollRef}
            onPointerDown={handleCategoryPointerDown}
            onPointerMove={handleCategoryPointerMove}
            onPointerUp={handleCategoryPointerEnd}
            onPointerCancel={handleCategoryPointerEnd}
            className="-mx-4 flex cursor-grab select-none gap-2 overflow-x-auto px-4 pb-1 no-scrollbar active:cursor-grabbing sm:mx-0 sm:px-0"
          >
            {categories.map((category) => {
              const isActiveCategory = activeCategory === category;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    if (categoryDragRef.current.moved) return;
                    setPage(1);
                    setActiveCategory(category);
                  }}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    isActiveCategory
                      ? "border-[#26ad5f] bg-[#26ad5f] text-white shadow-sm"
                      : "border-gray-200 bg-white text-gray-600 hover:border-green-200 hover:bg-green-50"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="container px-4 py-8 sm:py-10">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <BlogSkeleton key={index} />
            ))}
          </div>
        ) : posts.length > 0 ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {posts.map((post, index) => (
                <BlogCard
                  key={post._id ?? post.slug}
                  post={post}
                  priority={page === 1 && index < 4}
                />
              ))}
            </div>
            <BlogsPagination
              page={page}
              totalItems={totalItems}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-sm">
            <p className="text-sm font-semibold text-[#26ad5f]">No blogs found</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-950">
              Try another search or category
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-500">
              Clear the search term or switch back to All to see more stories.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
