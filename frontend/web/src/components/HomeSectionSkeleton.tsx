"use client";

type HomeSectionSkeletonProps = {
  variant: "prime" | "highlight" | "owner" | "agent";
  count?: number;
};

const baseBlock = "animate-pulse rounded-xl bg-gray-200";

export default function HomeSectionSkeleton({
  variant,
  count = 3,
}: HomeSectionSkeletonProps) {
  const items = Array.from({ length: count });

  if (variant === "prime") {
    return (
      <>
        {items.map((_, index) => (
          <div
            key={`prime-skeleton-${index}`}
            className="w-[90%] shrink-0 rounded-xl border border-gray-100 bg-white sm:w-[calc(50%-0.5rem)] lg:w-[calc(50%-0.5rem)]"
          >
            <div className={`${baseBlock} h-40 rounded-b-none sm:h-[180px] md:h-[200px] lg:h-[220px]`} />
            <div className="flex items-center justify-between gap-3 p-3">
              <div className={`${baseBlock} h-16 w-16 rounded-md sm:h-20 sm:w-20`} />
              <div className="flex min-w-0 grow flex-col gap-2">
                <div className={`${baseBlock} h-5 w-3/4`} />
                <div className={`${baseBlock} h-4 w-1/2`} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className={`${baseBlock} h-4 w-20`} />
                <div className={`${baseBlock} h-5 w-24`} />
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  if (variant === "highlight") {
    return (
      <>
        {items.map((_, index) => (
          <div
            key={`highlight-skeleton-${index}`}
            className="relative mt-5 w-[260px] shrink-0 sm:w-[280px] md:w-[320px]"
          >
            <div className={`${baseBlock} h-[150px] w-full rounded-2xl sm:h-[170px] md:h-[180px]`} />
            <div className="absolute left-3 right-3 top-[130px] rounded-xl bg-white p-3 shadow-sm sm:top-[140px] md:top-[150px]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className={`${baseBlock} h-4 w-2/3`} />
                <div className={`${baseBlock} h-4 w-16`} />
              </div>
              <div className={`${baseBlock} h-3 w-full`} />
            </div>
          </div>
        ))}
      </>
    );
  }

  if (variant === "owner") {
    return (
      <>
        {items.map((_, index) => (
          <div
            key={`owner-skeleton-${index}`}
            className="w-[280px] shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-white"
          >
            <div className={`${baseBlock} h-44 w-full rounded-none`} />
            <div className="space-y-3 p-4">
              <div className={`${baseBlock} h-5 w-2/3`} />
              <div className={`${baseBlock} h-4 w-1/2`} />
              <div className={`${baseBlock} h-4 w-full`} />
              <div className="flex gap-2 pt-2">
                <div className={`${baseBlock} h-8 w-20 rounded-md`} />
                <div className={`${baseBlock} h-8 w-24 rounded-md`} />
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {items.map((_, index) => (
        <div
          key={`agent-skeleton-${index}`}
          className="flex min-h-[284px] w-full shrink-0 flex-col items-center rounded-2xl border border-gray-100 bg-white px-4 pb-4 pt-6 shadow-[0_3px_6px_-2px_rgba(0,0,0,0.12)] sm:w-[calc(33.333%-14px)] lg:w-[calc(25%-15px)]"
        >
          <div className="relative mb-4 h-[76px] w-[76px] shrink-0 rounded-full border border-emerald-300 p-[3px]">
            <div className="h-full w-full animate-pulse rounded-full bg-gray-200" />
            <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full border-2 border-white bg-teal-700" />
          </div>
          <div className={`${baseBlock} h-5 w-1/2`} />
          <div className={`${baseBlock} mt-1 h-5 w-2/3`} />
          <div className={`${baseBlock} mt-2 h-4 w-4/5`} />
          <div className={`${baseBlock} mt-1 h-5 w-3/5`} />
          <div className={`${baseBlock} mt-auto h-[42px] w-full rounded-md`} />
        </div>
      ))}
    </>
  );
}
