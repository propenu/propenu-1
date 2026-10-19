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
          className="w-[280px] sm:w-[310px] md:w-[320px] max-w-[320px] shrink-0 min-w-0 overflow-hidden rounded-xl border border-gray-100 bg-white"
        >
          <div className="relative">
            <div className={`${baseBlock} h-28 w-full rounded-none`} />
            <div className="absolute left-5 top-20 h-20 w-20 rounded-full border-4 border-white bg-gray-300" />
          </div>
          <div className="space-y-3 px-5 pb-5 pt-12">
            <div className={`${baseBlock} h-5 w-1/2`} />
            <div className={`${baseBlock} h-4 w-1/3`} />
            <div className={`${baseBlock} h-4 w-full`} />
            <div className={`${baseBlock} h-4 w-3/4`} />
            <div className="grid grid-cols-3 gap-3 border-t border-gray-200 pt-4">
              <div className={`${baseBlock} h-10 w-full`} />
              <div className={`${baseBlock} h-10 w-full`} />
              <div className={`${baseBlock} h-10 w-full`} />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
