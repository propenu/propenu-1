"use client";

import Cookies from "js-cookie";
import axiosInstance from "@/utilies/axiosInstance";

export type PromotionType = "normal" | "sponsored" | "featured" | "prime";

export type InteractionPayload = {
  eventType: string;
  eventCategory: string;
  entityType?: "project" | "property";
  projectId?: string;
  propertyId?: string;
  plotId?: string;
  promotionType?: PromotionType;
  promotionId?: string;
  source: string;
  placement?: string;
  position?: number;
  searchId?: string;
  searchContext?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

const SESSION_KEY = "propenu_tracking_session";

export function getTrackingSessionId() {
  let sessionId = window.sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = window.crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

function isReadOnlyViewAsToken(token: string): boolean {
  try {
    const claims = JSON.parse(
      atob(token.split(".")[1] ?? ""),
    ) as { impersonation?: boolean; readOnly?: boolean };
    return Boolean(claims.impersonation && claims.readOnly);
  } catch {
    return false;
  }
}

/**
 * Sends a business interaction without delaying the user's current action.
 * Tracking is intentionally limited to authenticated users because the
 * property-service capture endpoint derives user identity from the token.
 */
export function trackInteraction(event: InteractionPayload): void {
  if (typeof window === "undefined") return;

  const token = Cookies.get("token");
  if (!token) return;

  // SuperAdmin read-only view-as: never POST tracking (would 403 and spam logs).
  if (isReadOnlyViewAsToken(token)) return;

  const payload = {
    ...event,
    sessionId: getTrackingSessionId(),
    pageUrl: `${window.location.pathname}${window.location.search}`,
    previousPageUrl: document.referrer || undefined,
    clientTimestamp: new Date().toISOString(),
  };

  void axiosInstance.post("/properties/interactions", payload, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch((error) => {
    // Analytics must never interrupt navigation or primary application actions.
    if (process.env.NODE_ENV === "development") {
      console.warn("Interaction tracking failed", error);
    }
  });
}
