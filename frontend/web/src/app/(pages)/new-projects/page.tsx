import type { Metadata } from "next";
import { Suspense } from "react";
import NewProjectsExplorer from "./NewProjectsExplorer";

export const metadata: Metadata = {
  title: "New Projects | Propenu",
  description:
    "Search new residential, commercial, plot, and agricultural projects by city, locality, budget, and configuration.",
};

function NewProjectsFallback() {
  return (
    <div className="min-h-screen bg-[#f6f8f7]">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto h-28 max-w-7xl animate-pulse px-4 py-5 sm:px-6" />
      </div>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="hidden h-96 animate-pulse rounded-2xl bg-white lg:block" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-2xl bg-white"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function NewProjectsPage() {
  return (
    <Suspense fallback={<NewProjectsFallback />}>
      <NewProjectsExplorer />
    </Suspense>
  );
}
