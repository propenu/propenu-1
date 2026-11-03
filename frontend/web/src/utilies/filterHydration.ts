"use client";

import { useSyncExternalStore } from "react";

let hydratedKey: string | null = null;
const listeners = new Set<() => void>();

const makeKey = (hydrationId: string, searchKey: string) =>
  `${hydrationId}:${searchKey}`;

export function markFiltersHydrated(hydrationId: string, searchKey: string) {
  hydratedKey = makeKey(hydrationId, searchKey);
  listeners.forEach((listener) => listener());
}

export function useFiltersHydrated(hydrationId: string, searchKey: string) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => hydratedKey === makeKey(hydrationId, searchKey),
    () => false,
  );
}
