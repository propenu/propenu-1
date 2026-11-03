"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { exchangeImpersonation } from "@/data/ClientData";
import { setViewAsToken } from "@/utilies/viewAsSession";

function ViewAsEnterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const code = String(searchParams.get("code") || "").trim();
      const returnUrl = String(searchParams.get("returnUrl") || "").trim();

      if (!code) {
        setError("Missing view-as exchange code.");
        return;
      }

      try {
        const data = await exchangeImpersonation(code);
        if (cancelled) return;

        if (!data?.token) {
          setError(data?.message || "Invalid view-as response.");
          return;
        }

        setViewAsToken(
          data.token,
          {
            targetName: data.target?.name || "User",
            targetRoleName: data.target?.roleName || "",
            expiresAt: data.expiresAt || "",
            impersonatorSub: data.impersonation?.impersonatorSub,
          },
          returnUrl || undefined,
        );

        const path = data.redirectPath || "/";
        router.replace(path);
      } catch (err: any) {
        if (cancelled) return;
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to start read-only view-as session.",
        );
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  if (error) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-lg font-bold text-slate-900">View-as failed</h1>
        <p className="max-w-md text-sm text-slate-600">{error}</p>
        <button
          type="button"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => router.replace("/")}
        >
          Go home
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="text-base font-semibold text-slate-900">
        Opening read-only dashboard…
      </p>
      <p className="text-sm text-slate-500">Super Admin view-as session</p>
    </main>
  );
}

export default function ViewAsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[60vh] items-center justify-center text-sm text-slate-600">
          Opening read-only dashboard…
        </main>
      }
    >
      <ViewAsEnterInner />
    </Suspense>
  );
}
