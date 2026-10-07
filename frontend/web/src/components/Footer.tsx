"use client";

import Logo from "@/animations/Logo";
import {
  AppStoreBadge,
  FacebookSVG,
  InstagramSVG,
  LinkedInSVG,
  PlayStoreBadge,
  TwitterSVG,
  WhatsAppSVG,
  YouTubeSVG,
} from "@/icons/icons";
import Link from "next/link";
import BuildingFooterSvg from "../svg/BuildingFooterSvg";

export function FooterLegalBar() {
  return (
    <div className="bg-[#111111] px-3 py-2 text-[10px] leading-none text-white sm:px-4 sm:text-xs">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-2 sm:gap-3">
        <p className="min-w-0 text-center text-white/90 sm:text-left">
          All trademarks, logos and names are properties of their respective
          owners. All Rights Reserved. Copyright 2026 Propenu Private Limited.
        </p>
        <Link
          href="/terms"
          className="flex shrink-0 items-center gap-1.5 underline underline-offset-2"
        >
          <span>Terms of use</span>
          <span className="block h-3.5 w-2.5 text-[#27AE60]">
            <Logo />
          </span>
        </Link>
      </div>
    </div>
  );
}

export default function Footer() {
  return (
    <footer
      className="relative overflow-hidden pt-8 pb-0 text-gray-800 sm:pt-10 lg:pt-12"
      style={{
        background: "linear-gradient(180deg, #27AE60 -337.72%, #FBFFFD 38.63%)",
      }}
    >
      <div className="relative mx-auto w-full max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
          {/* 1. Company Column */}
          <div>
            <h3 className="mb-6 text-lg font-semibold text-gray-900">
              Company
            </h3>
            <ul className="space-y-4 text-sm text-gray-700 font-medium">
              <li>
                <Link href="/new-projects" className="hover:text-primary">
                  New Projects
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-primary">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-primary">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-primary">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/safety-guide" className="hover:text-primary">
                  Safety Guide
                </Link>
              </li>
              <li>
                <Link href="/help-center" className="hover:text-primary">
                  Help Center
                </Link>
              </li>
            </ul>
          </div>

          {/* 2. Contact Us Column */}
          <div>
            <h3 className="mb-6 text-lg font-semibold text-gray-900">
              Contact Us
            </h3>
            <div className="space-y-5 text-sm text-gray-700 font-medium">
              <div>
                <p>Helpline – +91 9182334233</p>
                <p className="text-gray-500 font-normal">
                  9:30 AM to 6:30 PM (Mon–Sun)
                </p>
              </div>
              <div>
                <p>Email – contact@propenu.com</p>
              </div>
              <div>
                <p className="font-medium">Registered Office</p>
                <p className="leading-relaxed text-gray-700">
                  # 193, 3rd Floor, SV Chambers,
                  <br />
                  Kavuri Hills, Madhapur,
                  <br />
                  Hyderabad – 500081, Telangana, India
                </p>
              </div>
            </div>
          </div>

          {/* 3. App Download Column */}
          <div>
            <h3 className="mb-6 text-lg font-semibold text-gray-900 text-center">
              Experience Propenu on Mobile
            </h3>
            <div className="flex flex-col gap-4 items-center">
              <div className="flex flex-col items-center justify-center gap-4 mt-2">
                <div className="rounded-xl border border-emerald-100 bg-white p-1 shadow-sm ring-4 ring-white/60">
                  <img
                    src="/images/qr.png"
                    alt="QR Code"
                    className="h-38 w-38 rounded-md object-cover"
                  />
                </div>
                <p className="text-[12px] text-gray-600 leading-snug text-center">
                  Scan the QR code to
                  <br /> Download the App
                </p>
              </div>
            </div>
          </div>

          {/* 4. Follow Us Column */}
          <div>
            <h3 className="mb-6 text-lg font-semibold text-gray-900">
              Follow Us
            </h3>
            <div className="flex items-center gap-3 mb-2">
              <Link
                href="https://www.linkedin.com/company/propenu"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm transition hover:shadow-md hover:bg-[#0A66C2] group"
              >
                <span className="w-7 h-7 text-[#0A66C2] group-hover:text-white transition">
                  <LinkedInSVG />
                </span>
              </Link>

              <Link
                href="https://www.instagram.com/propenu"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm transition-all duration-300 hover:shadow-md group hover:bg-[linear-gradient(45deg,#f09433_0%,#e6683c_25%,#dc2743_50%,#cc2366_75%,#bc1888_100%)]"
              >
                <span className="w-6 h-6">
                  <InstagramSVG />
                </span>
              </Link>

              <Link
                href="https://wa.me/9182334233"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm transition-all duration-300 hover:shadow-md group hover:bg-[#25D366]"
              >
                <span className="w-6 h-6">
                  <WhatsAppSVG />
                </span>
              </Link>

              <Link
                href="https://www.facebook.com/profile.php?id=61584609591479"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm transition hover:shadow-md hover:bg-[#1877F2] group"
              >
                <span className="w-7 h-7 text-[#1877F2] group-hover:text-white transition">
                  <FacebookSVG />
                </span>
              </Link>

              <Link
                href="https://x.com/propenu"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm transition-all hover:shadow-md hover:bg-black group"
              >
                <span className="w-5 h-5 text-black group-hover:text-white transition-colors">
                  <TwitterSVG />
                </span>
              </Link>

              <Link
                href="https://www.youtube.com/@Propenu"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm transition hover:shadow-md hover:bg-[#FF0000] group"
              >
                <span className="w-6 h-6 text-[#FF0000] group-hover:text-white transition">
                  <YouTubeSVG />
                </span>
              </Link>
            </div>

            <div className="mt-6 flex flex-col items-start gap-4 max-lg:items-center max-lg:text-center lg:mt-3">
              <div className="flex flex-wrap items-center gap-3">
                <PlayStoreBadge />
                <AppStoreBadge />
              </div>

              <div className="mt-4 w-full max-w-xs">
                <h4 className="mb-3 text-center text-lg font-semibold text-gray-900 lg:text-left">
                  Associated Businesses
                </h4>
                <div className="grid grid-cols-2 items-center gap-4 sm:gap-5">
                  <a
                    href="https://www.eteamworks.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-14 items-center justify-center sm:h-12"
                  >
                    <img
                      src="/email/teamworks.png"
                      alt="Teamworks"
                      className="max-h-full w-full max-w-[132px] object-contain sm:max-w-[160px] lg:object-left"
                    />
                  </a>
                  <a
                    href="https://www.aslijobs.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-14 items-center justify-center sm:h-12"
                  >
                    <img
                      src="/email/aslijobs.png"
                      alt="AsliJobs"
                      className="max-h-full w-full max-w-[132px] object-contain sm:max-w-[160px] lg:object-left"
                    />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Background Cityscape Svg */}
      <div className="-mt-1 flex w-full items-end justify-center sm:mt-0">
        <div className="pointer-events-none flex w-full opacity-60">
          <BuildingFooterSvg />
        </div>
      </div>

      <FooterLegalBar />
    </footer>
  );
}
