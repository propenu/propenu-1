"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";
import { toast } from "sonner";
import { stopImpersonation } from "@/data/ClientData";
import {
  clearViewAsSession,
  consumeReturnUrl,
  decodeTokenClaims,
  isViewAsTokenActive,
  readViewAsMeta,
  type ViewAsMeta,
} from "@/utilies/viewAsSession";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSec = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatExpiresClock(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Close the view-as tab when admin opened it; otherwise replace history. */
function leaveViewAsTab(target: string) {
  const canClose =
    typeof window !== "undefined" &&
    Boolean(window.opener) &&
    !window.opener.closed;

  if (canClose) {
    try {
      window.opener.focus();
    } catch {
      /* cross-origin focus may throw */
    }
    window.close();
    // If the browser blocks close, fall back without stacking history.
    window.setTimeout(() => {
      if (!window.closed) {
        window.location.replace(target);
      }
    }, 150);
    return;
  }

  window.location.replace(target);
}

export default function ViewAsBanner() {
  const [meta, setMeta] = useState<ViewAsMeta | null>(null);
  const [active, setActive] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const refresh = useCallback(() => {
    const claims = decodeTokenClaims();
    const fromClaims =
      claims?.impersonation && claims?.readOnly
        ? {
            targetName: String(claims.name || "User"),
            targetRoleName: String(claims.roleName || ""),
            expiresAt: claims.exp
              ? new Date(Number(claims.exp) * 1000).toISOString()
              : "",
            impersonatorSub: claims.impersonatorSub
              ? String(claims.impersonatorSub)
              : undefined,
          }
        : null;
    const stored = readViewAsMeta();
    const next = fromClaims || stored;
    setMeta(next);
    setActive(Boolean(next && isViewAsTokenActive()));
  }, []);

  useEffect(() => {
    refresh();
    const onAuth = () => refresh();
    window.addEventListener("auth-changed", onAuth);
    return () => window.removeEventListener("auth-changed", onAuth);
  }, [refresh]);

  useEffect(() => {
    if (!active || !meta?.expiresAt) {
      setRemainingMs(null);
      return;
    }
    const endsAt = new Date(meta.expiresAt).getTime();
    if (!Number.isFinite(endsAt)) {
      setRemainingMs(null);
      return;
    }

    const tick = () => {
      const left = endsAt - Date.now();
      setRemainingMs(left);
      if (left <= 0) {
        toast.message("View-as session expired");
        clearViewAsSession();
        setActive(false);
        leaveViewAsTab(consumeReturnUrl() || "/");
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [active, meta?.expiresAt]);

  const roleLabel = useMemo(
    () => String(meta?.targetRoleName || "").replace(/_/g, " "),
    [meta?.targetRoleName],
  );

  const expiresClock = useMemo(
    () => (meta?.expiresAt ? formatExpiresClock(meta.expiresAt) : ""),
    [meta?.expiresAt],
  );

  const onExit = async () => {
    if (exiting) return;
    setExiting(true);
    try {
      const token = Cookies.get("token");
      if (token) {
        await stopImpersonation().catch(() => undefined);
      }
    } finally {
      const returnUrl = consumeReturnUrl();
      clearViewAsSession();
      setActive(false);
      setExiting(false);
      toast.success("Exited read-only view-as");
      leaveViewAsTab(returnUrl || "/");
    }
  };

  if (!active || !meta) return null;

  const remainingLabel =
    remainingMs == null
      ? null
      : remainingMs <= 0
        ? "Expired"
        : formatRemaining(remainingMs);

  return (
    <div
      role="status"
      className="sticky top-0 z-[100] flex flex-wrap items-center justify-between gap-2 border-b border-amber-700/30 bg-amber-500 px-3 py-2 text-sm text-amber-950 shadow-sm sm:px-4"
    >
      <p className="min-w-0 font-semibold leading-snug">
        Read-only view as{" "}
        <span className="font-extrabold">{meta.targetName || "user"}</span>
        {roleLabel ? (
          <span className="font-medium opacity-80"> ({roleLabel})</span>
        ) : null}
        . Changes are blocked.
        {expiresClock || remainingLabel ? (
          <span className="ml-2 font-bold tabular-nums opacity-90">
            {expiresClock ? `Expires ${expiresClock}` : null}
            {expiresClock && remainingLabel ? " · " : null}
            {remainingLabel
              ? remainingLabel === "Expired"
                ? "Expired"
                : `${remainingLabel} left`
              : null}
          </span>
        ) : null}
      </p>
      <button
        type="button"
        onClick={onExit}
        disabled={exiting}
        className="shrink-0 rounded-md bg-amber-950 px-3 py-1.5 text-xs font-bold text-amber-50 hover:bg-black disabled:opacity-70"
      >
        {exiting ? "Exiting…" : "Exit view-as"}
      </button>
    </div>
  );
}
