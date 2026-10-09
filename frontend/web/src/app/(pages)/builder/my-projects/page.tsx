"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getFeaturedProjectsDashboard,
  getHighlightProjectBuilders,
} from "@/data/ClientData";
import { FeaturedProject } from "@/types";
import Myproperties from "../components/Myproperties";
import ActiveTabs from "@/ui/ActiveTabs";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

type HighlightProjectsBuilderResponse = {
  success?: boolean;
  data: FeaturedProject[];
};

const PROJECT_TABS = [
  "All",
  "Project",
  "Prime Project",
  "Top Selling Project",
  "Sponsored Project",
] as const;

const PROJECTS_PER_PAGE = 6;
const projectSkeletonCards = Array.from({ length: 4 });

function MyProjectsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-40 rounded-md bg-gray-200" />
      <div className="mt-2 h-4 w-80 max-w-full rounded-md bg-gray-100" />

      <div className="mt-5 flex flex-wrap gap-6 border-b border-gray-200 pb-3">
        {PROJECT_TABS.map((tab) => (
          <div
            key={tab}
            className="h-6 w-28 rounded-md bg-gray-100"
          />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {projectSkeletonCards.map((_, index) => (
          <div
            key={`project-skeleton-${index}`}
            className="overflow-hidden rounded-[10px] border border-[#d8d8d8] bg-white shadow-[0_4px_14px_rgba(15,23,42,0.05)]"
          >
            <div className="grid lg:grid-cols-2">
              <div className="h-[190px] bg-gray-200 sm:h-[210px] lg:h-[250px]" />

              <div className="p-3">
                <div className="flex items-start gap-3">
                  <div className="h-[46px] w-[46px] rounded-lg bg-gray-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-20 rounded bg-gray-200" />
                    <div className="h-3 w-32 rounded bg-gray-100" />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
                  <div className="space-y-2">
                    <div className="h-5 w-40 rounded bg-gray-200" />
                    <div className="h-3 w-28 rounded bg-gray-100" />
                  </div>
                  <div className="space-y-2 text-right">
                    <div className="ml-auto h-4 w-20 rounded bg-gray-200" />
                    <div className="ml-auto h-3 w-16 rounded bg-gray-100" />
                  </div>
                </div>

                <div className="mt-3 border-t border-gray-100" />

                <div className="grid gap-3 py-3 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, metaIndex) => (
                    <div key={`meta-skeleton-${metaIndex}`} className="space-y-2">
                      <div className="h-3 w-16 rounded bg-gray-100" />
                      <div className="h-4 w-20 rounded bg-gray-200" />
                    </div>
                  ))}
                </div>

                <div className="rounded-[10px] bg-[#eef8f1] p-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
                    {Array.from({ length: 3 }).map((_, statIndex) => (
                      <div key={`stat-skeleton-${statIndex}`} className="space-y-2">
                        <div className="h-3 w-14 rounded bg-white/70" />
                        <div className="h-4 w-16 rounded bg-white" />
                      </div>
                    ))}
                    <div className="h-[30px] w-28 rounded-[7px] bg-[#b9e8ca]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectsPagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const startItem = totalItems ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, totalItems);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#E5E7EB] bg-white px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="text-sm text-[#6B7280]">
        Showing{" "}
        <span className="font-semibold text-[#111827]">
          {startItem}-{endItem}
        </span>{" "}
        of <span className="font-semibold text-[#111827]">{totalItems}</span>{" "}
        projects
      </p>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-[#4B5563] transition hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:text-[#D1D5DB]"
          aria-label="Previous page"
        >
          <FiChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1">
          {pages.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={`h-9 min-w-9 rounded-md px-3 text-sm font-medium transition ${
                page === item
                  ? "bg-[#16A34A] text-white shadow-sm"
                  : "border border-[#E5E7EB] bg-white text-[#4B5563] hover:bg-[#F9FAFB]"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-[#4B5563] transition hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:text-[#D1D5DB]"
          aria-label="Next page"
        >
          <FiChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
const page = () => {
  const [activeTab, setActiveTab] =
    useState<(typeof PROJECT_TABS)[number]>("All");
  const [pageNumber, setPageNumber] = useState(1);

  const { data, isLoading, isError } = useQuery<{
    regularProjects: HighlightProjectsBuilderResponse | FeaturedProject[] | null;
    primeProjects: HighlightProjectsBuilderResponse | FeaturedProject[] | null;
  }>({
    queryKey: ["highlight-projects-builder"],
    queryFn: async () => {
      const [regularProjects, primeProjects] = await Promise.all([
        getHighlightProjectBuilders(),
        getFeaturedProjectsDashboard(),
      ]);

      return {
        regularProjects,
        primeProjects,
      };
    },
  });

  const regularProjects = Array.isArray(data?.regularProjects)
    ? data.regularProjects
    : data?.regularProjects?.data ?? [];

  const primeProjects = Array.isArray(data?.primeProjects)
    ? data.primeProjects
    : data?.primeProjects?.data ?? [];

  const projects = useMemo(() => {
    const mergedProjects = [...primeProjects, ...regularProjects];
    const uniqueProjects = new Map<string, FeaturedProject>();

    mergedProjects.forEach((project) => {
      uniqueProjects.set(project._id, project);
    });

    return Array.from(uniqueProjects.values()).sort((a, b) => {
      const dateA = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const dateB = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return dateB - dateA;
    });
  }, [primeProjects, regularProjects]);

  const filteredProjects = useMemo(() => {
    switch (activeTab) {
      case "Project":
        return projects.filter(
          (project) =>
            !project.promotion?.type || project.promotion.type === "normal",
        );
      case "Prime Project":
        return projects.filter((project) => project.promotion?.type === "prime");
      case "Top Selling Project":
        return projects.filter((project) => project.promotion?.type === "featured");
      case "Sponsored Project":
        return projects.filter((project) => project.promotion?.type === "sponsored");
      default:
        return projects;
    }
  }, [activeTab, projects]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE),
  );

  const paginatedProjects = useMemo(() => {
    const start = (pageNumber - 1) * PROJECTS_PER_PAGE;
    return filteredProjects.slice(start, start + PROJECTS_PER_PAGE);
  }, [filteredProjects, pageNumber]);

  useEffect(() => {
    setPageNumber(1);
  }, [activeTab]);

  useEffect(() => {
    if (pageNumber > totalPages) {
      setPageNumber(totalPages);
    }
  }, [pageNumber, totalPages]);

  if (isLoading) {
    return <MyProjectsSkeleton />;
  }

  if (isError) {
    return <MyProjectsSkeleton />;
  }

  return (
    <div>
      <h1 className="text-2xl font-medium">My Projects</h1>

      <p className="mt-1 text-sm text-gray-500">
        Manage and track all your property projects in one place.
      </p>

      {projects.length > 0 ? (
        <div className="mt-4 space-y-4">
          <ActiveTabs
            categories={[...PROJECT_TABS]}
            activeTab={activeTab}
            setActiveTab={(tab) =>
              setActiveTab(tab as (typeof PROJECT_TABS)[number])
            }
          />

          {filteredProjects.length > 0 ? (
            <div className="space-y-2">
              <Myproperties items={paginatedProjects} />
              {filteredProjects.length > PROJECTS_PER_PAGE ? (
                <ProjectsPagination
                  page={pageNumber}
                  pageSize={PROJECTS_PER_PAGE}
                  totalItems={filteredProjects.length}
                  totalPages={totalPages}
                  onPageChange={setPageNumber}
                />
              ) : null}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">
              <p>No projects found in this tab.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 text-center text-gray-500">
          <p>You have not added any projects yet.</p>
        </div>
      )}
    </div>
  );
};

export default page;
