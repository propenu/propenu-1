"use client";

import { useEffect, useRef, useState } from "react";
import { Meta, Property } from "@/types/property";
import { SearchFilterParams } from "@/types/sharedTypes";
import { minDelay } from "@/utilies/minDelay";

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError");
}

export function useStreamProperties(params: SearchFilterParams) {
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState<number | null>(null);
  const [sponsored, setSponsored] = useState<Property[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const hasLoadedOnce = useRef(false);
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  ).toString();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const showInitialSkeleton = !hasLoadedOnce.current;

    async function start() {
      const startedAt = Date.now();
      if (showInitialSkeleton) setLoading(true);

      const searchUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/properties/search?${query}`;
      const sponsoredUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/properties/sponsored?${query}`;

      const res = await fetch(searchUrl, { signal: controller.signal });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn("Property search rate limited. Skipping this refresh.");
        } else {
          console.error(`Property search failed with status ${res.status}`);
        }
        setLoading(false);
        return;
      }

      if (!res.body) {
        console.error("Streaming not supported");
        setLoading(false);
        return;
      }

      const sponsoredPromise = fetch(sponsoredUrl, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : { data: [] }))
        .catch((error) => {
          if (isAbortError(error) || cancelled) return { data: [] };
          console.error("Failed to fetch sponsored properties", error);
          return { data: [] };
        });

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();

      let buffer = "";
      const nextItems: Property[] = [];
      let nextMeta: Meta | null = null;
      let nextTotal: number | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done || cancelled) break;

        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const parsed = JSON.parse(line) as any;

            if (parsed && parsed.__meta) {
              nextMeta = parsed.__meta as Meta;
              if (typeof parsed.__meta.total === "number") {
                nextTotal = parsed.__meta.total;
              }
              continue;
            }

            nextItems.push(parsed as Property);
            // Stream the first result set in progressively. During later
            // searches, keep the previous results visible until the new
            // response is complete so the page never falls back to skeletons.
            if (showInitialSkeleton) setItems([...nextItems]);
          } catch (err) {
            console.error("Invalid JSON chunk", line);
          }
        }
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < 1000) {
        await minDelay(1000 - elapsed);
      }

      const sponsoredRes = await sponsoredPromise;

      if (!cancelled) {
        setItems(nextItems);
        setMeta(nextMeta);
        setTotal(nextTotal);
        setSponsored(sponsoredRes.data || []);
        hasLoadedOnce.current = true;
        setLoading(false);
      }
    }

    start().catch((error) => {
      if (isAbortError(error) || cancelled) return;
      console.error("Failed to stream properties", error);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query]);

  return { items, sponsored, loading, total, meta };
}
