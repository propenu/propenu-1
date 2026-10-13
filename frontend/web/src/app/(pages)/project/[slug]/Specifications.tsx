"use client";

import { useMemo } from "react";
import { FeaturedProject } from "@/types";

type SpecificationsProps = {
  project: FeaturedProject;
};

type SpecificationItem = {
  title: string;
  description: string;
};

function looksLikeHtml(value = "") {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
}

function sanitizeStyleAttribute(styles: string) {
  const textAlign = styles.match(
    /(?:^|;)\s*text-align\s*:\s*(left|right|center|justify)\s*;?/i,
  );
  return textAlign ? ` style="text-align: ${textAlign[1].toLowerCase()};"` : "";
}

function sanitizeRichText(value?: string) {
  if (!value) return "";
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<(iframe|object|embed|form|input|button)[\s\S]*?>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(iframe|object|embed|form|input|button)\b[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*(["']).*?\1/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "")
    .replace(/\sstyle\s*=\s*(["'])(.*?)\1/gi, (_, __, styles) =>
      sanitizeStyleAttribute(styles),
    )
    .replace(/<p>(?:&nbsp;|\s|<br\s*\/?>)*<\/p>/gi, "")
    .trim();
}

function formatSpecificationDescription(description: string) {
  return description
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(
      /\s*(?=(?:Structure|Super structure|Plastering|Painting|Flooring|Doors|Windows|Kitchen|Toilets|Electrical system|Common Area|Railings|Bedroom and kitchen|Utility \/ Wash Area|Ceiling|Internal|External|Main Door|Internal Door|Windows frame and shutter|Utility areas|Drawing, Dinning, living and foyer|Balcony|Staircase):)/g,
      "\n",
    )
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function isLandProject(project: FeaturedProject) {
  const values = [project.categoryType, project.propertyType]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  return values.some((value) => value === "land" || value === "landplots");
}

export default function Specifications({ project }: SpecificationsProps) {
  const specifications = useMemo(
    () =>
      [...(project.specifications ?? [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      ),
    [project.specifications],
  );
  const descriptions = useMemo(
    () =>
      specifications
        .flatMap((spec) => spec.items ?? [])
        .map((item) => {
          const raw = (item as SpecificationItem).description?.trim() ?? "";
          if (!raw) return null;
          if (looksLikeHtml(raw)) {
            return { kind: "html" as const, value: sanitizeRichText(raw) };
          }
          return {
            kind: "text" as const,
            value: formatSpecificationDescription(raw),
          };
        })
        .filter(
          (
            row,
          ): row is { kind: "html" | "text"; value: string } =>
            Boolean(row?.value),
    ),
    [specifications],
  );

  if (isLandProject(project) || !specifications.length || !descriptions.length) {
    return null;
  }
  return (
    <section id="specifications">
      <div className="container mx-auto px-1 sm:px-4 lg:px-3">
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-4 py-4 text-lg font-medium text-slate-950 sm:px-5 sm:py-5 sm:text-xl">
            Specifications
          </h2>

          <div className="px-4 py-4 sm:px-5">
            <div className="max-h-[420px] overflow-y-auto rounded-md border border-slate-200 bg-white p-4 sm:max-h-[460px] sm:p-5">
              {descriptions.map((row, index) =>
                row.kind === "html" ? (
                  <div
                    key={`html-${index}`}
                    className="mb-3 max-w-full overflow-x-auto text-sm leading-7 text-slate-600 last:mb-0 sm:text-base sm:leading-8 [&_.has-text-align-center]:text-center [&_.has-text-align-left]:text-left [&_.has-text-align-right]:text-right [&_a]:font-medium [&_a]:text-[#16a34a] [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-[#16a34a] [&_blockquote]:bg-green-50 [&_blockquote]:py-2 [&_blockquote]:pl-4 [&_blockquote]:pr-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-slate-900 [&_em]:italic [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:block [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-slate-950 [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:block [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:text-slate-950 [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:block [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-slate-950 [&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:block [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-slate-950 [&_h5]:mb-2 [&_h5]:mt-3 [&_h5]:block [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:uppercase [&_h5]:text-slate-800 [&_h6]:mb-2 [&_h6]:mt-3 [&_h6]:block [&_h6]:text-xs [&_h6]:font-semibold [&_h6]:uppercase [&_h6]:tracking-wide [&_h6]:text-slate-700 [&_hr]:my-5 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-slate-200 [&_li]:mb-1 [&_li_p]:mb-0 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_p.has-text-align-center]:text-center [&_p.has-text-align-right]:text-right [&_s]:line-through [&_strong]:font-semibold [&_strong]:text-slate-950 [&_table]:my-4 [&_table]:w-full [&_table]:min-w-[560px] [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:overflow-hidden [&_table]:rounded-md [&_table]:border [&_table]:border-slate-200 [&_table]:bg-white [&_tbody_tr:nth-child(even)]:bg-slate-50 [&_td]:border-b [&_td]:border-r [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-sm [&_td:last-child]:border-r-0 [&_tbody_tr:last-child_td]:border-b-0 [&_th]:border-b [&_th]:border-r [&_th]:border-slate-200 [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold [&_th]:text-slate-950 [&_th:last-child]:border-r-0 [&_u]:underline [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&>:first-child]:mt-0 [&>:last-child]:mb-0"
                    dangerouslySetInnerHTML={{ __html: row.value }}
                  />
                ) : (
                  <p
                    key={`text-${index}`}
                    className="mb-3 whitespace-pre-line text-sm leading-7 text-slate-600 last:mb-0 sm:text-base sm:leading-8"
                  >
                    {row.value}
                  </p>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
