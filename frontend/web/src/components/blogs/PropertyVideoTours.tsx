"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiPlay, FiX } from "react-icons/fi";
import { getBlogs } from "@/data/ClientData";

type VideoBlog = {
  _id?: string;
  slug: string;
  title: string;
  url?: string;
  videoTitle?: string;
  videoFormat?: "landscape" | "short";
  videoDescription?: string;
  excerpt?: string;
  featuredImage?: string;
  imageAlt?: string;
};

type BlogsResponse = { items?: VideoBlog[]; data?: VideoBlog[] };

const fallbackImage = "/images/placeholder.svg";

function isShortVideoUrl(value?: string, format?: VideoBlog["videoFormat"]) {
  if (format === "short") return true;
  if (format === "landscape") return false;
  if (!value) return false;
  try {
    const videoUrl = new URL(value);
    return /\/shorts\//i.test(videoUrl.pathname);
  } catch {
    return false;
  }
}

export default function PropertyVideoTours() {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [videos, setVideos] = useState<VideoBlog[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number | null>(null);
  const [isEmbeddedVideoPlaying, setIsEmbeddedVideoPlaying] = useState(true);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let active = true;

    getBlogs({ limit: 100, published: true, sortBy: "publishedAt", sortOrder: "desc" })
      .then((response: BlogsResponse) => {
        if (!active) return;
        setVideos((response.items ?? response.data ?? []).filter((blog) => blog.url?.trim()));
      })
      .catch((error) => console.error("Property video tours fetch failed:", error));

    return () => {
      active = false;
    };
  }, []);

  const syncActiveIndex = () => {
    const rail = railRef.current;
    if (!rail) return;
    const firstCard = rail.querySelector<HTMLElement>("[data-video-card]");
    if (!firstCard) return;
    const gap = Number.parseFloat(getComputedStyle(rail).columnGap || "0");
    const stride = firstCard.offsetWidth + gap;
    setActiveIndex(stride ? Math.round(rail.scrollLeft / stride) : 0);
    setAtEnd(rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4);
  };

  const move = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const firstCard = rail.querySelector<HTMLElement>("[data-video-card]");
    if (!firstCard) return;
    const gap = Number.parseFloat(getComputedStyle(rail).columnGap || "0");
    rail.scrollBy({ left: direction * (firstCard.offsetWidth + gap), behavior: "smooth" });
  };

  const getYouTubeThumbnail = (value?: string) => {
    if (!value) return null;
    try {
      const videoUrl = new URL(value);
      const host = videoUrl.hostname.replace(/^www\./, "").toLowerCase();
      const videoId = host === "youtu.be"
        ? videoUrl.pathname.split("/").filter(Boolean)[0]
        : ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)
          ? videoUrl.searchParams.get("v") || videoUrl.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]
          : null;
      return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
    } catch {
      return null;
    }
  };

  const getEmbedUrl = (value?: string) => {
    if (!value) return null;
    try {
      const videoUrl = new URL(value);
      const host = videoUrl.hostname.replace(/^www\./, "").toLowerCase();
      if (host === "youtu.be") {
        const id = videoUrl.pathname.split("/").filter(Boolean)[0];
        return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1` : null;
      }
      if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
        const id = videoUrl.searchParams.get("v") || videoUrl.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
        return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1` : null;
      }
      if (["vimeo.com", "player.vimeo.com"].includes(host)) {
        const id = videoUrl.pathname.split("/").filter(Boolean).pop();
        return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}?autoplay=1` : null;
      }
    } catch {
      return null;
    }
    return null;
  };

  useEffect(() => {
    if (selectedVideoIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedVideoIndex(null);
      if (event.key === "ArrowLeft") setSelectedVideoIndex((index) => index === null ? null : (index - 1 + videos.length) % videos.length);
      if (event.key === "ArrowRight") setSelectedVideoIndex((index) => index === null ? null : (index + 1) % videos.length);
      if (event.code === "Space" && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        if (videoElementRef.current) {
          if (videoElementRef.current.paused) void videoElementRef.current.play();
          else videoElementRef.current.pause();
          return;
        }
        const iframe = document.querySelector<HTMLIFrameElement>("[data-video-player-frame]");
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: "command", func: isEmbeddedVideoPlaying ? "pauseVideo" : "playVideo", args: [] }),
            "https://www.youtube-nocookie.com",
          );
          setIsEmbeddedVideoPlaying((playing) => !playing);
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [selectedVideoIndex, videos.length, isEmbeddedVideoPlaying]);

  useEffect(() => {
    setIsEmbeddedVideoPlaying(true);
    videoElementRef.current = null;
  }, [selectedVideoIndex]);

  if (videos.length === 0) return null;

  const visibleCount = 4;
  const rangeStart = Math.min(activeIndex + 1, videos.length);
  const rangeEnd = Math.min(activeIndex + visibleCount, videos.length);
  const hasMoreVideos = videos.length > visibleCount;
  const selectedVideo = selectedVideoIndex === null ? null : videos[selectedVideoIndex];
  const selectedIsShort = isShortVideoUrl(selectedVideo?.url, selectedVideo?.videoFormat);

  return (
    <section className="w-full" aria-labelledby="property-video-tours-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="headingSideBar min-w-0">
          <h2 id="property-video-tours-title" className="truncate text-base font-bold sm:text-2xl">
            PropView
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 sm:mt-1 sm:text-base">
            Explore Properties, Projects & Beyond.
          </p>
        </div>

        {hasMoreVideos && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="mr-1 text-xs text-gray-500" aria-live="polite">
              {rangeStart}–{rangeEnd} of {videos.length}
            </span>
            <button
              type="button"
              aria-label="Previous videos"
              onClick={() => move(-1)}
              disabled={activeIndex === 0}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 disabled:opacity-40"
            >
              <FiChevronLeft />
            </button>
            <button
              type="button"
              aria-label="Next videos"
              onClick={() => move(1)}
              disabled={atEnd}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 disabled:opacity-40"
            >
              <FiChevronRight />
            </button>
          </div>
        )}
      </div>

      <div
        ref={railRef}
        onScroll={syncActiveIndex}
        className="flex items-start snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 no-scrollbar"
      >
        {videos.map((video, index) => (
          <button
            key={video._id ?? video.slug}
            type="button"
            data-video-card
            onClick={() => setSelectedVideoIndex(index)}
            className="group w-[78%] shrink-0 snap-start self-start text-left sm:w-[48%] lg:w-[calc((100%-3rem)/4)]"
          >
            <div className="relative aspect-video overflow-hidden rounded-xl bg-gray-100">
              <Image
                src={getYouTubeThumbnail(video.url) || video.featuredImage || fallbackImage}
                alt={video.imageAlt || video.videoTitle || video.title}
                fill
                sizes="(max-width: 640px) 78vw, (max-width: 1024px) 48vw, 33vw"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/20">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#26ad5f] shadow">
                  <FiPlay className="ml-0.5" size={18} fill="currentColor" />
                </span>
              </span>
            </div>
            <h3 className="mt-2 line-clamp-1 text-base font-semibold text-gray-900">
              {video.videoTitle || video.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-600">
              {video.videoDescription || video.excerpt}
            </p>
          </button>
        ))}
      </div>

      {selectedVideoIndex !== null && videos[selectedVideoIndex] && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 sm:p-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedVideoIndex(null);
          }}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={videos[selectedVideoIndex].videoTitle || videos[selectedVideoIndex].title}
            className={`relative rounded-xl bg-black shadow-2xl ${selectedIsShort ? "w-fit max-w-[90vw]" : "w-full max-w-5xl"}`}
          >
            <div className="flex items-center justify-between gap-3 rounded-t-xl bg-black px-3 py-2 text-white sm:px-4">
              <span className="text-xs text-gray-300" aria-live="polite">
                {videos.length > 1 ? `${selectedVideoIndex + 1} / ${videos.length}` : ""}
              </span>
              <button
                type="button"
                onClick={() => setSelectedVideoIndex(null)}
                aria-label="Close video"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <FiX size={22} />
              </button>
            </div>

            <div className="relative">
              {videos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedVideoIndex((index) => index === null ? null : (index - 1 + videos.length) % videos.length)}
                    aria-label="Previous video"
                    className="absolute left-1 top-1/2 z-20 flex h-10 w-10 -translate-x-full -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow hover:bg-white sm:left-0"
                  >
                    <FiChevronLeft size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedVideoIndex((index) => index === null ? null : (index + 1) % videos.length)}
                    aria-label="Next video"
                    className="absolute right-1 top-1/2 z-20 flex h-10 w-10 translate-x-full -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow hover:bg-white sm:right-0"
                  >
                    <FiChevronRight size={22} />
                  </button>
                </>
              )}
              <div className={selectedIsShort ? "mx-auto h-[min(70vh,560px)] aspect-[9/16] max-w-[90vw] bg-black" : "aspect-video w-full bg-black"}>
              {getEmbedUrl(videos[selectedVideoIndex].url) ? (
                <iframe
                  key={videos[selectedVideoIndex]._id ?? videos[selectedVideoIndex].slug}
                  src={`${getEmbedUrl(videos[selectedVideoIndex].url)!}&enablejsapi=1`}
                  title={videos[selectedVideoIndex].videoTitle || videos[selectedVideoIndex].title}
                  className="h-full w-full"
                  data-video-player-frame
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                  autoFocus
                />
              ) : /\.(mp4|webm|ogg)(?:$|[?#])/i.test(videos[selectedVideoIndex].url || "") ? (
                <video ref={videoElementRef} className="h-full w-full" src={videos[selectedVideoIndex].url} controls autoPlay />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-white">
                  <a href={videos[selectedVideoIndex].url} target="_blank" rel="noreferrer" className="underline">
                    Open this video in a new tab
                  </a>
                </div>
              )}
              </div>
            </div>
            <div className="rounded-b-xl bg-black px-4 py-3 text-white sm:px-6">
              <p className="mb-2 text-xs text-gray-400">Space: play/pause · Esc: close</p>
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-semibold">
                  {videos[selectedVideoIndex].videoTitle || videos[selectedVideoIndex].title}
                </h3>
                {videos.length > 1 && (
                  <span className="shrink-0 text-xs text-gray-300" aria-live="polite">
                    {selectedVideoIndex + 1} / {videos.length}
                  </span>
                )}
              </div>
              {videos[selectedVideoIndex].videoDescription && (
                <p className="mt-1 text-sm leading-6 text-gray-300">
                  {videos[selectedVideoIndex].videoDescription}
                </p>
              )}
              {videos.length > 1 && (
                <div className="mt-3 flex items-center justify-center gap-2" aria-label="Choose a video">
                  {videos.map((video, index) => (
                    <button
                      key={video._id ?? video.slug}
                      type="button"
                      onClick={() => setSelectedVideoIndex(index)}
                      aria-label={`Play video ${index + 1}: ${video.videoTitle || video.title}`}
                      aria-current={index === selectedVideoIndex ? "true" : undefined}
                      className={`h-2 rounded-full transition-all ${index === selectedVideoIndex ? "w-6 bg-white" : "w-2 bg-white/45 hover:bg-white/75"}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
