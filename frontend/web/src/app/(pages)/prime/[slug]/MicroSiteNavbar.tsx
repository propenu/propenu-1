"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Download } from "@/icons/icons";
import { trackProjectBrochureDownload } from "@/data/ClientData";
import Cookies from "js-cookie";
import LoginDialog from "@/app/(auth)/Login";
import RegisterDialog from "@/app/(auth)/Register";
import { FiArrowLeft } from "react-icons/fi";
import { trackInteraction } from "@/services/trackingService";

const OPEN_AUTH_LOGIN_EVENT = "propenu:open-auth-login";

export type NavLink = {
  title: string;
  href: string;
};

type Props = {
  links?: NavLink[];
  // either a string URL ("/logo.png") or a StaticImageData-like object { src: string }
  logoUrl?: string | { src: string } | null;
  // hex color or CSS color string for icon / accents
  color?: string | null;
  // optional brochure URL to download when clicking the download icon
  brochureUrl?: string | null;
  projectId?: string | null;
  projectTitle?: string;
  // optional aria label for logo (defaults to "Site logo")
  logoAlt?: string;
  redirectUrl?: string;

};

export default function MicroSiteNavbar({
  links = [],
  logoUrl = "/logo.png",
  color = "#FFAC1D",
  brochureUrl,
  projectId,
  projectTitle,
  logoAlt = "Site logo",
  redirectUrl,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [activeHash, setActiveHash] = useState("");

  useEffect(() => {
    const hashes = links
      .map((link) => extractHash(link.href))
      .filter((hash): hash is string => Boolean(hash));

    const updateActiveSection = () => {
      if (hashes.length === 0) return;

      const scrollPosition = window.scrollY + 90;
      let currentHash = hashes[0];

      for (const hash of hashes) {
        const section = document.getElementById(hash.slice(1));
        if (section && section.offsetTop <= scrollPosition) {
          currentHash = hash;
        }
      }

      setActiveHash((previous) =>
        previous === currentHash ? previous : currentHash,
      );
    };

    updateActiveSection();
    window.addEventListener("hashchange", updateActiveSection);
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      window.removeEventListener("hashchange", updateActiveSection);
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [links]);

  useEffect(() => {
    const body = document.body;
    const syncGalleryState = () => {
      setIsGalleryOpen(body.classList.contains("gallery-modal-open"));
    };

    syncGalleryState();
    const observer = new MutationObserver(syncGalleryState);
    observer.observe(body, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const openAuthLogin = () => {
      setShowRegisterDialog(false);
      setShowLoginDialog(true);
    };

    window.addEventListener(OPEN_AUTH_LOGIN_EVENT, openAuthLogin);

    return () => {
      window.removeEventListener(OPEN_AUTH_LOGIN_EVENT, openAuthLogin);
    };
  }, []);

  // support both string URL or object with src
  const resolvedLogo =
    typeof logoUrl === "string"
      ? logoUrl
      : (logoUrl && (logoUrl as any).src) || "/logo.png";

  // safe color fallback
  const iconColor = typeof color === "string" && color.trim() !== "" ? color : "#FFAC1D";
  const navAccentStyle = { "--nav-accent": iconColor } as React.CSSProperties;
  const extractHash = (href: string) => {
    const hashIndex = href.indexOf("#");
    return hashIndex >= 0 ? href.slice(hashIndex) : "";
  };
  const handleNavClick = (href: string) => {
    const nextHash = extractHash(href);
    if (nextHash) setActiveHash(nextHash);
  };
  const isLinkActive = (href: string) => {
    if (!href) return false;
    if (href.startsWith("#")) return activeHash === href;

    const hashIndex = href.indexOf("#");
    if (hashIndex >= 0) {
      const hrefPath = href.slice(0, hashIndex) || pathname;
      const hrefHash = href.slice(hashIndex);
      const pathMatches = pathname === hrefPath || pathname.startsWith(hrefPath + "/");
      return pathMatches && activeHash === hrefHash;
    }

    return pathname === href || pathname.startsWith(href + "/");
  };
  const logoHref = redirectUrl?.trim() || "/";
  const isExternalLogoHref = /^https?:\/\//i.test(logoHref);
  const handleBrochureDownload = async () => {
    if (!brochureUrl) return;

    const token = Cookies.get("token")?.trim();
    if (!token) {
      setOpen(false);
      setShowRegisterDialog(false);
      setShowLoginDialog(true);
      return;
    }

    if (projectId) {
      try {
        await trackProjectBrochureDownload(projectId);
      } catch (error) {
        console.error("Brochure download tracking failed:", error);
        // Do not block the actual download if tracking fails.
      }
    }

    trackInteraction({
      eventType: "brochure_downloaded",
      eventCategory: "conversion",
      entityType: "project",
      projectId: projectId || undefined,
      source: "prime_microsite",
      metadata: { title: projectTitle, brochureUrl },
    });
    window.open(brochureUrl, "_blank", "noopener,noreferrer");
  };
 

  return (
    <>
      <header className={`propenu-site-navbar bg-white shadow-md border-b border-gray-200 sticky top-0 z-9999 ${isGalleryOpen ? "hidden" : ""}`}>
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-14 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
          

            {/* logo */}
            {isExternalLogoHref ? (
              <a
                // href={logoHref}
                // target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-3"
              >
                <img
                  src={resolvedLogo}
                  alt={logoAlt}
                  className="h-12 w-auto object-contain"
                />
              </a>
            ) : (
              <Link href={logoHref} className="flex min-w-0 items-center gap-3">
                <img
                  src={resolvedLogo}
                  alt={logoAlt}
                  className="h-12 w-auto object-contain"
                />
              </Link>
            )}
          </div>

          {/* desktop links + download icon */}
          <div className="hidden md:flex items-center" style={navAccentStyle}>
            <ul className="flex items-center gap-6 text-sm font-medium text-slate-700">
              {links.map((l) => {
                const active = isLinkActive(l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={() => handleNavClick(l.href)}
                      className={`relative px-2 py-1 transition rounded text-(--nav-accent) after:absolute after:left-1/2 after:-bottom-4 after:h-1 after:w-full after:-translate-x-1/2 after:bg-(--nav-accent) after:transition-all after:duration-300 ${active
                        ? "after:opacity-100 after:scale-x-100"
                        : "after:opacity-0 after:scale-x-0"
                        }
  `}
                      aria-current={active ? "page" : undefined}
                    >
                      {l.title}
                    </Link>


                  </li>

                );
              })}
            </ul>

            {/* download / brochure */}
            <div className="relative group">
              {brochureUrl ? (
                <button
                  type="button"
                  onClick={handleBrochureDownload}
                  aria-label="Download brochure"
                  className="p-2 rounded hover:bg-slate-100 transition inline-flex items-center"
                >
                  <Download size={24} color={iconColor} />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Brochure not available"
                  className="p-2 rounded hover:bg-slate-100 transition inline-flex items-center opacity-80 cursor-not-allowed"
                >
                  <Download size={24} color={iconColor} />
                </button>
              )}

              {/* Tooltip */}
              <span
                className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100 z-50"
              >
                {brochureUrl ? "Download brochure" : "Brochure not available"}
              </span>
            </div>

          </div>

          {/* mobile hamburger */}
          <div className="md:hidden flex items-center">
            <button
              aria-label="Toggle menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="p-2 rounded-md text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
                {open ? (
                  <path
                    d="M6 18L18 6M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : (
                  <path
                    d="M3 6h18M3 12h18M3 18h18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* mobile menu */}
        {open && (
          <div className="md:hidden mt-1 pb-4" style={navAccentStyle}>
            <ul className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              {links.map((l) => {
                const active = isLinkActive(l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={() => {
                        handleNavClick(l.href);
                        setOpen(false);
                      }}
                      className={
                        "block px-3 py-2 rounded-md hover:bg-slate-50 transition " +
                        (active
                          ? "text-(--nav-accent)"
                          : "text-(--nav-accent)")
                      }
                      aria-current={active ? "page" : undefined}
                    >
                      {l.title}
                    </Link>
                  </li>
                );
              })}

              {/* mobile download button shown in the menu too */}
              <li>
                {brochureUrl ? (
                  <button
                    type="button"
                    onClick={handleBrochureDownload}
                    className=" px-3 py-2 rounded-md hover:bg-slate-50 hover:text-sky-600 transition flex items-center"
                  >
                    <Download size={18} color={iconColor} />
                    <span>Download Brochure</span>
                  </button>
                ) : (
                  <div className="block px-3 py-2 text-sm text-slate-500">Brochure not available</div>
                )}
              </li>
            </ul>
          </div>
        )}
        </nav>
      </header>

      {showLoginDialog && (
        <LoginDialog
          open
          onClose={() => setShowLoginDialog(false)}
          onSwitchToRegister={() => {
            setShowLoginDialog(false);
            setShowRegisterDialog(true);
          }}
        />
      )}

      {showRegisterDialog && (
        <RegisterDialog
          open
          onClose={() => setShowRegisterDialog(false)}
          onSwitchToLogin={() => {
            setShowRegisterDialog(false);
            setShowLoginDialog(true);
          }}
        />
      )}
    </>
  );
}

