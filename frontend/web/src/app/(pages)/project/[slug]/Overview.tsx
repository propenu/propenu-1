import { FeaturedProject, IBhkUnit } from "@/types";

type OverviewProps = {
  project: FeaturedProject;
};

function formatDate(date?: string) {
  if (!date) return null;

  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return date;

  return value.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatAvgPrice(project: FeaturedProject) {
  const price = project.priceFrom;
  const sqft = project.sqftRange?.min;

  if (!price || !sqft) return "--";

  const pricePerSqft = price / sqft;
  if (!Number.isFinite(pricePerSqft) || pricePerSqft <= 0) return "--";

  if (pricePerSqft >= 1000) {
    return `\u20b9${(pricePerSqft / 1000).toFixed(1).replace(".0", "")} K/sq.ft`;
  }

  return `\u20b9${Math.round(pricePerSqft).toLocaleString("en-IN")}/sq.ft`;
}

function formatSqftRange(project: FeaturedProject) {
  const min = project.sqftRange?.min;
  const max = project.sqftRange?.max;

  if (min && max) {
    return `${min} - ${max} sq.ft.`;
  }

  if (min) return `${min} sq.ft.`;
  if (max) return `${max} sq.ft.`;
  return "--";
}

function formatBhkConfiguration(project: FeaturedProject) {
  const summary = project.projectSummary ?? project.bhkSummary ?? [];
  const values = Array.from(
    new Set(
      summary
        .map((item) => item.label ?? item.bhkLabel ?? item.bhk)
        .filter(Boolean)
        .map((value) => String(value).replace(/\s*BHK\s*/gi, "").trim()),
    ),
  );

  if (!values.length) return "--";

  return `${values.join(", ")} Configuration`;
}

function formatPropertyType(value?: string) {
  if (!value) return "Residential Project";

  return value.replace(/[-_]+/g, " ");
}

function formatAvailableUnits(project: FeaturedProject) {
  if (
    typeof project.availableUnits === "number" &&
    Number.isFinite(project.availableUnits) &&
    project.availableUnits >= 0
  ) {
    return `${project.availableUnits} Units`;
  }

  const summary = project.projectSummary ?? project.bhkSummary ?? [];
  const availableUnits = summary.reduce((total: number, item) => {
    const unitCount = (item.units ?? []).reduce((unitTotal: number, unit: IBhkUnit) => {
      const availableCount = unit.availableCount;

      return typeof availableCount === "number" &&
        Number.isFinite(availableCount) &&
        availableCount > 0
        ? unitTotal + availableCount
        : unitTotal;
    }, 0);

    return total + unitCount;
  }, 0);

  return availableUnits > 0 ? `${availableUnits} Units` : "--";
}

export default function Overview({ project }: OverviewProps) {
  const launchLabel = formatDate(project.launchDate);
  const possessionLabel = formatDate(project.possessionDate);
  const items = [
    {
      label: "Property Type",
      value: formatPropertyType(project.propertyType),
    },
    {
      label: "Units",
      value: project.totalUnits ? `${project.totalUnits} Units` : "--",
    },
    {
      label: "Project Area",
      value: project.projectArea ? `${project.projectArea} Acre` : "--",
    },
    {
      label: "Amenities",
      value: project.amenities?.length
        ? `${project.amenities.length} Amenities`
        : "--",
    },
    ...(launchLabel
      ? [
          {
            label: "Launch Date",
            value: launchLabel,
          },
        ]
      : []),
    ...(possessionLabel
      ? [
          {
            label: "Possession Date",
            value: possessionLabel,
          },
        ]
      : []),
    {
      label: "RERA ID",
      value: project.reraNumber || "--",
    },
  ];

  return (
    <section id="overview">
      <div className="container mx-auto px-1 sm:px-4 lg:px-3">
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-3 py-3 text-base font-medium text-slate-950 sm:px-5 sm:py-5 sm:text-xl">
            Overview
          </h2>

          <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-3 py-3.5 sm:gap-x-12 sm:gap-y-7 sm:px-5 sm:py-6 lg:grid-cols-3">
            {items.map((item, index) => (
              <div key={`${item.label}-${index}`} className="min-w-0">
                <p className="text-xs font-medium text-slate-950 sm:text-sm">{item.label}</p>
                <p className="mt-0.5 wrap-break-word text-xs text-slate-500 capitalize sm:mt-1 sm:truncate sm:text-sm">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
