"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaBuilding,
  FaBorderAll,
  FaUtensils,
  FaBath,
  FaBolt,
  FaDoorOpen,
} from "react-icons/fa";
import type { IconType } from "react-icons";

type SpecItem = {
  title: string;
  description: string;
};

type SpecificationType = {
  category: string;
  items: SpecItem[];
  order?: number;
};

type Props = {
  specifications: {
    specifications?: SpecificationType[];
    color?: string;
    categoryType?: string | null;
    propertyType?: string | null;
  };
};

const ICONS: Record<string, IconType> = {
  Structure: FaBuilding,
  Flooring: FaBorderAll,
  Kitchen: FaUtensils,
  Bathrooms: FaBath,
  Electrical: FaBolt,
  "Doors & Windows": FaDoorOpen,
};

const HTML_REGEX = /<\/?[a-z][\s\S]*>/i;

function looksLikeHtml(value?: string) {
  return HTML_REGEX.test(String(value || ""));
}

function sanitizeStyleAttribute(styles: string) {
  const textAlign = styles.match(
    /(?:^|;)\s*text-align\s*:\s*(left|right|center|justify)\s*;?/i,
  );

  return textAlign ? ` style="text-align: ${textAlign[1].toLowerCase()};"` : "";
}

function sanitizeRichText(value?: string) {
  if (!value) return "";

  return String(value)
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

function isLandSpecification(specifications?: Props["specifications"]) {
  const values = [specifications?.categoryType, specifications?.propertyType]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  return values.some((value) => value === "land" || value === "landplots");
}

const Specification = ({ specifications }: Props) => {
  const specs = specifications?.specifications || [];
  const color = specifications?.color || "#16a34a";

  const sorted = useMemo(
    () =>
      [...specs]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((spec, index) => ({
          ...spec,
          key: `${spec.category}-${spec.order ?? "na"}-${index}`,
        })),
    [specs],
  );

  const [activeKey, setActiveKey] = useState("");

  useEffect(() => {
    if (!sorted.length) return;
    if (!sorted.some((spec) => spec.key === activeKey)) {
      setActiveKey(sorted[0].key);
    }
  }, [activeKey, sorted]);

  if (isLandSpecification(specifications)) return null;
  if (!sorted.length) return null;

  const activeSpec = sorted.find((s) => s.key === activeKey) || sorted[0];

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* HEADER */}
      <div className="mb-6 flex items-start justify-between gap-6">
        <div style={{ color: color, borderLeft: `5px solid ${color}` }}>
          <div className="ml-2">
            <h1 className="text-[20px] font-bold lg:text-2xl md:text-4xl">
              Specifications
            </h1>
            <p className="headingDesc text-xs lg:text-base md:text-lg">
              Key details of the property
            </p>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 border-gray-500 pb-2 overflow-auto">
        {sorted.map((s) => {
          const Icon = ICONS[s.category] || FaBuilding;

          return (
            <button
              key={s.key}
              onClick={() => setActiveKey(s.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm whitespace-nowrap transition
                ${activeKey === s.key
                  ? "text-white shadow"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }
              `}
              style={activeKey === s.key ? { backgroundColor: color } : {}}
            >
              <Icon />
              {s.category}
            </button>
          );
        })}
      </div>

      <br />
      {/* CONTENT GRID */}
      <div className="h-[360px] overflow-y-auto pr-1 sm:h-[420px] lg:h-[380px]">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {activeSpec.items.map((item, i) => {
            const isRichText = item.description && looksLikeHtml(item.description);

            return (
              <div
                key={i}
                className={`min-w-0 rounded-md bg-white p-5 shadow-sm transition hover:shadow-md ${
                  isRichText ? "md:col-span-2 lg:col-span-3" : ""
                }`}
              >
                {item.title ? (
                  <p className="font-semibold text-gray-800">{item.title}</p>
                ) : null}
                {isRichText ? (
                  <div
                    className="mt-4 max-w-none overflow-x-auto break-words text-sm leading-7 text-gray-600 [&_.has-text-align-center]:text-center [&_.has-text-align-left]:text-left [&_.has-text-align-right]:text-right [&_a]:font-medium [&_a]:text-[#16a34a] [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-[#16a34a] [&_blockquote]:bg-green-50 [&_blockquote]:py-2 [&_blockquote]:pl-4 [&_blockquote]:pr-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-gray-900 [&_em]:italic [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:block [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-gray-900 [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:block [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:text-gray-900 [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:block [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-gray-900 [&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:block [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-gray-900 [&_h5]:mb-2 [&_h5]:mt-3 [&_h5]:block [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:uppercase [&_h5]:text-gray-800 [&_h6]:mb-2 [&_h6]:mt-3 [&_h6]:block [&_h6]:text-xs [&_h6]:font-semibold [&_h6]:uppercase [&_h6]:tracking-wide [&_h6]:text-gray-700 [&_hr]:my-5 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-gray-200 [&_li]:mb-1 [&_li_p]:mb-0 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_p.has-text-align-center]:text-center [&_p.has-text-align-right]:text-right [&_s]:line-through [&_strong]:font-semibold [&_strong]:text-gray-900 [&_table]:my-4 [&_table]:w-full [&_table]:min-w-[640px] [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:overflow-hidden [&_table]:rounded-md [&_table]:border [&_table]:border-gray-200 [&_table]:bg-white [&_tbody_tr:nth-child(even)]:bg-gray-50 [&_td]:border-b [&_td]:border-r [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-sm [&_td:last-child]:border-r-0 [&_tbody_tr:last-child_td]:border-b-0 [&_th]:border-b [&_th]:border-r [&_th]:border-gray-200 [&_th]:bg-gray-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-gray-900 [&_th:last-child]:border-r-0 [&_u]:underline [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&>:first-child]:mt-0 [&>:last-child]:mb-0"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeRichText(item.description),
                    }}
                  />
                ) : (
                  <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">
                    {item.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Specification;
