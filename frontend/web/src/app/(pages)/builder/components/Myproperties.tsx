"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import {
  FiCalendar,
  FiMoreVertical,
  FiStar,
  FiUsers,
  FiLayers,
  FiBarChart2,
  FiChevronRight,
} from "react-icons/fi";
import { FeaturedProject } from "@/types";
import { getBuilderMembers } from "@/data/ClientData";
import formatINR from "@/utilies/PriceFormat";

interface ProjectCardProps {
  items?: FeaturedProject[];
  project?: FeaturedProject;
  title?: string;
  city?: string;
  detailsBasePath?: "/prime" | "/project";
}

type BuilderMember = {
  _id: string;
  builderRoleId?: { _id?: string } | string;
  projectIds?: Array<string | { _id?: string }>;
  isActive?: boolean;
};

const fallbackImage = "/images/placeholder.svg";

const getPromotionBadge = (project: FeaturedProject) => {
  switch (project.promotion?.type) {
    case "prime":
      return "Prime Project";
    case "featured":
      return "Top Selling";
    case "sponsored":
      return "Sponsored";
    default:
      return "Project";
  }
};

const getProjectConfig = (project: FeaturedProject) => {
  if (project.categoryType?.toLowerCase() === "land") {
    return project.propertyType || "Land";
  }

  const summary = project.projectSummary || project.bhkSummary || [];
  const labels = summary
    .map((item) => item.label || item.bhkLabel || item.name)
    .filter(Boolean);

  return labels.length ? labels.slice(0, 2).join(", ") : "Residential Apartments";
};

const getProjectPrice = (project: FeaturedProject) => {
  if (project.priceFrom && project.priceTo) {
    return `${formatINR(project.priceFrom)} - ${formatINR(project.priceTo)}`;
  }
  if (project.priceFrom) return formatINR(project.priceFrom);
  if (project.priceTo) return formatINR(project.priceTo);
  return "Price on request";
};

const getProjectLocation = (project: FeaturedProject) =>
  [project.locality, project.city].filter(Boolean).join(", ") ||
  "Location not available";

const getProjectDetailsHref = (
  project: FeaturedProject,
  detailsBasePath?: "/prime" | "/project",
) => {
  const basePath =
    detailsBasePath ??
    (project.promotion?.type === "prime" ? "/prime" : "/project");

  return `${basePath}/${project.slug}`;
};

const formatDate = (value?: string) => {
  if (!value) return "--";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(parsed);
};

const getUpdateDate = (project: FeaturedProject) => {
  return formatDate(project.updatedAt);
};

const getUploadedDate = (project: FeaturedProject) => {
  return formatDate(project.createdAt);
};

const getPrimeDateRange = (project: FeaturedProject) => {
  const start = formatDate(
    typeof project.promotion?.startDate === "string"
      ? project.promotion.startDate
      : project.promotion?.startDate?.toString(),
  );
  const end = formatDate(
    typeof project.promotion?.boostExpiry === "string"
      ? project.promotion.boostExpiry
      : project.promotion?.boostExpiry?.toString(),
  );

  if (start === "--" && end === "--") return "--";
  if (start !== "--" && end === "--") return start;
  if (start === "--" && end !== "--") return end;
  return `${start} to ${end}`;
};

const normalizeId = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
    const nestedId = (value as { _id?: unknown })._id;
    return typeof nestedId === "string" ? nestedId : "";
  }
  return "";
};

const getAssignedMembers = (members: BuilderMember[], projectId: string) =>
  members.filter(
    (member) =>
      member.isActive !== false &&
      Array.isArray(member.projectIds) &&
      member.projectIds.map(normalizeId).includes(projectId),
  );

const getTeamCount = (members: BuilderMember[], projectId: string) => {
  const count = getAssignedMembers(members, projectId).length;
  return count > 0 ? String(count) : "-";
};

const getRoleCount = (members: BuilderMember[], projectId: string) => {
  const uniqueRoleIds = new Set(
    getAssignedMembers(members, projectId)
      .map((member) => normalizeId(member.builderRoleId))
      .filter(Boolean),
  );

  return uniqueRoleIds.size > 0 ? String(uniqueRoleIds.size) : "-";
};

const getUpdateCount = (project: FeaturedProject) => {
  if (typeof project.updateCount === "number" && project.updateCount > 0) {
    return String(project.updateCount);
  }

  return "-";
};

const InfoCol = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="min-w-0">
    <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#3b3b3b]">
      <span className="text-[#3b3b3b]">{icon}</span>
      <span>{label}</span>
    </div>
    <p className="mt-1 text-[14px] font-medium text-[#1f2937]">{value}</p>
  </div>
);

const StatCol = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="min-w-0">
    <div className="flex items-center gap-1 text-[12px] text-[#22313f]">
      <span>{icon}</span>
      <span className="font-medium">{label}</span>
    </div>
    <p className="mt-0.5 text-[13px] font-medium text-[#111827]">{value}</p>
  </div>
);

const Myproperties: React.FC<ProjectCardProps> = ({
  items,
  project,
  detailsBasePath,
}) => {
  const list = items ?? (project ? [project] : []);
  const membersQuery = useQuery<{ members: BuilderMember[] }>({
    queryKey: ["builder-members"],
    queryFn: getBuilderMembers,
  });
  const builderMembers = membersQuery.data?.members ?? [];

  return (
    <div className="w-full space-y-4">
      {list.map((projectItem) => {
        const detailsHref = getProjectDetailsHref(projectItem, detailsBasePath);
        const badge = getPromotionBadge(projectItem);
        const location = getProjectLocation(projectItem);
        const price = getProjectPrice(projectItem);
        const config = getProjectConfig(projectItem);

        return (
          <article
            key={projectItem._id}
            className="overflow-hidden rounded-[10px] border border-[#d8d8d8] bg-white shadow-[0_4px_14px_rgba(15,23,42,0.07)]"
          >
            <div className="grid lg:grid-cols-2">
              <Link
                href={detailsHref}
                className="relative block h-[190px] overflow-hidden bg-[#d9e2ea] sm:h-[230px] md:h-[260px] lg:h-[250px]"
              >
                <span className="absolute left-4 top-4 z-10 inline-flex items-center rounded-full border border-white/10 bg-[rgba(15,23,42,0.68)] px-3 py-1.5 text-[11px] font-semibold tracking-[0.01em] text-white shadow-[0_8px_18px_rgba(15,23,42,0.24)] backdrop-blur-md">
                  {badge}
                </span>

                <img
                  src={projectItem.heroImage ?? fallbackImage}
                  alt={projectItem.title}
                  className="h-full w-full object-cover"
                />
              </Link>

              <div className="flex min-w-0 flex-col p-3 sm:p-4 lg:p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#d9d9d9] bg-white sm:h-[52px] sm:w-[52px] lg:h-[46px] lg:w-[46px]">
                      <Image
                        src={projectItem.logo?.url ?? fallbackImage}
                        alt={projectItem.title}
                        width={38}
                        height={38}
                        className="object-cover"
                      />
                    </div>

                    <div className="min-w-0">
                      <p className="line-clamp-1 text-[12px] font-semibold uppercase tracking-[0.02em] text-[#111827] sm:text-[13px] lg:text-[12px]">
                        {projectItem.title?.split(" ")[0] || "PROJECT"}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-[#4b5563] sm:text-[13px] lg:text-[12px]">
                        {location}
                      </p>
                    </div>
                  </div>
{/* 
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#111827] transition hover:bg-gray-100"
                    aria-label="Project actions"
                  >
                    <FiMoreVertical size={15} />
                  </button> */}
                </div>

                <div className="mt-2.5 grid gap-3 sm:gap-4 md:grid-cols-[1fr_auto] md:items-start">
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-[17px] font-semibold leading-6 text-[#111827] sm:text-[20px] lg:text-[17px] lg:leading-5">
                      {projectItem.title}
                    </h2>
                    <p className="mt-1 line-clamp-1 text-[12px] text-[#4b5563] sm:text-[13px] lg:mt-0.5 lg:text-[12px]">
                      {location}
                    </p>
                  </div>

                  <div className="md:text-right">
                    <p className="text-[15px] font-semibold leading-5 text-[#111827] sm:text-[17px] lg:text-[15px]">{price}</p>
                    <p className="mt-0.5 text-[12px] text-[#4b5563] sm:text-[13px] lg:text-[12px]">{config}</p>
                  </div>
                </div>

                <div className="mt-2.5 border-t border-[#e4e4e4]" />

                <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-2.5 sm:grid-cols-3 sm:gap-0">
                  <div className="col-span-1 sm:pr-2.5">
                    <InfoCol
                      icon={<FiCalendar size={12} />}
                      label="Uploaded"
                      value={getUploadedDate(projectItem)}
                    />
                  </div>
                  <div className="col-span-1 sm:border-l sm:border-r sm:border-[#dddddd] sm:px-2.5">
                    <InfoCol
                      icon={<FiCalendar size={12} />}
                      label="Last Update"
                      value={getUpdateDate(projectItem)}
                    />
                  </div>
                  <div className="col-span-2 border-t border-[#ececec] pt-3 sm:col-span-1 sm:border-t-0 sm:pt-0 sm:pl-2.5">
                    <InfoCol
                      icon={<FiStar size={12} />}
                      label="Prime"
                      value={getPrimeDateRange(projectItem)}
                    />
                  </div>
                </div>

                <div className="mt-3 rounded-[10px] bg-[#eef8f1] p-2 sm:p-3 lg:mt-auto lg:p-2">
                  <div className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center">
                    <StatCol
                      icon={<FiUsers size={12} />}
                      label="Team"
                      value={getTeamCount(builderMembers, projectItem._id)}
                    />
                    <StatCol
                      icon={<FiLayers size={12} />}
                      label="Roles"
                      value={getRoleCount(builderMembers, projectItem._id)}
                    />
                    <StatCol
                      icon={<FiBarChart2 size={12} />}
                      label="Updates"
                      value={getUpdateCount(projectItem)}
                    />

                    <Link
                      href={detailsHref}
                      className="col-span-3 inline-flex h-[34px] w-full items-center justify-center gap-1 rounded-[7px] bg-[#2db463] px-3 text-[12px] font-medium text-white transition hover:bg-[#249a53] sm:w-auto md:col-span-1 md:justify-self-start lg:h-[30px]"
                    >
                      View Project
                      <FiChevronRight size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default Myproperties;
