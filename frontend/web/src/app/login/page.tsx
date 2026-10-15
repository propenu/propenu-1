"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { toast } from "sonner";
import Cookies from "js-cookie";
import axios from "axios";
import { z } from "zod";
import { LuPencilLine } from "react-icons/lu";
import { MdOutlineWhatsapp } from "react-icons/md";
import { getSiteLogo, requestOtp, syncShortlist, verifyOtp } from "@/data/ClientData";
import { VerifyOtpResponse } from "@/types/property";
import { initWebPushToken } from "@/utilies/initWebPush";
import Logo from "@/animations/Logo";
import AuthHeroSection from "@/components/auth/AuthHeroSection";

const OTP_LENGTH = 4;
const RESEND_OTP_SECONDS = 30;
const INDIA_COUNTRY_CODE = "+91";
const INDIA_PHONE_REGEX = /^\+91\d{10}$/;
const INDIA_PHONE_INPUT_MAX_LENGTH = 15;

const phoneSchema = z.string().regex(INDIA_PHONE_REGEX, {
  message: "Enter a valid 10-digit mobile number with +91.",
});

const otpSchema = z
  .string()
  .min(1, { message: "Please enter the OTP." })
  .length(OTP_LENGTH, { message: `OTP must be ${OTP_LENGTH} digits long.` });

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/";

  const [step, setStep] = useState<"request" | "verify">("request");
  const [phone, setPhone] = useState(INDIA_COUNTRY_CODE);
  const [otpDigits, setOtpDigits] = useState<string[]>(
    Array(OTP_LENGTH).fill(""),
  );
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const otp = otpDigits.join("");

  const { data: siteLogoData, isLoading: isLogoLoading } = useQuery({
    queryKey: ["site-branding-logo"],
    queryFn: getSiteLogo,
    staleTime: 1000 * 60 * 30,
  });
  const logoUrl = siteLogoData?.data?.logoUrl;

  useEffect(() => {
    if (step !== "verify" || resendCooldown <= 0) return;

    const timer = window.setTimeout(() => {
      setResendCooldown((seconds) => Math.max(seconds - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendCooldown, step]);

  function normalizeIndianPhone(value?: string) {
    if (!value) return INDIA_COUNTRY_CODE;

    const digitsOnly = value.replace(/\D/g, "");
    const nationalNumber = digitsOnly.startsWith("91")
      ? digitsOnly.slice(2)
      : digitsOnly;

    if (!nationalNumber) return INDIA_COUNTRY_CODE;

    return `${INDIA_COUNTRY_CODE}${nationalNumber.slice(0, 10)}`;
  }

  async function handleRequestOtp(isResend = false) {
    if (isResend && resendCooldown > 0) return;

    const normalizedPhone = normalizeIndianPhone(phone);
    const validation = phoneSchema.safeParse(normalizedPhone);

    if (!validation.success) {
      setError(validation.error.issues[0].message);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await requestOtp({ phone: normalizedPhone });
      setPhone(normalizedPhone);
      toast.success(
        isResend
          ? "OTP resent to your WhatsApp number"
          : "OTP sent to your WhatsApp number",
      );
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setResendCooldown(RESEND_OTP_SECONDS);
      setStep("verify");
      setTimeout(() => {
        inputsRef.current[0]?.focus();
      }, 100);
    } catch (err) {
      const backendMessage = axios.isAxiosError(err)
        ? err.response?.data?.message ||
        err.response?.data?.error ||
        err.response?.data
        : null;

      setError(
        typeof backendMessage === "string" && backendMessage.trim()
          ? backendMessage
          : "Something went wrong while requesting OTP.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(manualOtp?: string | React.MouseEvent) {
    const otpToSubmit = typeof manualOtp === "string" ? manualOtp : otp;
    const normalizedPhone = normalizeIndianPhone(phone);

    const validation = otpSchema.safeParse(otpToSubmit);

    if (!validation.success) {
      setError(validation.error.issues[0].message);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res: VerifyOtpResponse = await verifyOtp({
        phone: normalizedPhone,
        otp: otpToSubmit,
      });

      Cookies.set("token", res.token, {
        path: "/",
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        expires: 30,
      });

      window.dispatchEvent(new Event("auth-changed"));

      void initWebPushToken().catch(() => undefined);

      const localShortlist = JSON.parse(
        localStorage.getItem("shortlist") || "[]",
      );
      if (localShortlist.length > 0) {
        await syncShortlist(localShortlist);
        localStorage.removeItem("shortlist");
      }

      toast.success("Logged in successfully!");

      setTimeout(() => {
        window.location.assign(redirectUrl);
      }, 600);
    } catch (err) {
      const backendMessage = axios.isAxiosError(err)
        ? err.response?.data?.message ||
        err.response?.data?.error ||
        err.response?.data
        : null;

      setError(
        typeof backendMessage === "string" && backendMessage.trim()
          ? backendMessage
          : "Invalid OTP or verification failed.",
      );
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(value: string, index: number) {
    setError(null);
    const digit = value.replace(/\D/g, "").slice(0, 1);

    const newOtp = [...otpDigits];
    newOtp[index] = digit;
    setOtpDigits(newOtp);

    if (digit && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }

    const combinedOtp = newOtp.join("");
    if (combinedOtp.length === OTP_LENGTH) {
      inputsRef.current[index]?.blur();
      handleVerifyOtp(combinedOtp);
    }
  }

  function handleOtpKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const paste = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);

    if (!paste) return;

    const newOtp = [...otpDigits];
    for (let i = 0; i < OTP_LENGTH; i++) {
      newOtp[i] = paste[i] ?? "";
    }
    setOtpDigits(newOtp);

    const combinedOtp = newOtp.join("");
    if (combinedOtp.length === OTP_LENGTH) {
      inputsRef.current[OTP_LENGTH - 1]?.blur();
      handleVerifyOtp(combinedOtp);
    } else {
      const lastIndex = Math.min(paste.length - 1, OTP_LENGTH - 1);
      inputsRef.current[lastIndex]?.focus();
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-white font-['Poppins',sans-serif]">
      {/* Left 70% Column: Hero Showcase */}
      <AuthHeroSection />

      {/* Right 30% Column: Login Screen */}
      <div className="flex w-full lg:w-[30%] lg:flex-[0_0_30%] min-h-screen flex-col justify-between p-6 sm:p-8 xl:p-10 bg-white shadow-2xl shadow-gray-200/50 z-20">
        <div />

        {/* Center Auth Content */}
        <div className="my-auto w-full max-w-[360px] mx-auto py-2">
          {/* Brand Logo Centered */}
          <div className="flex justify-center mb-6">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2.5 transition-opacity hover:opacity-85"
              aria-label="Propenu Home"
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Propenu Logo"
                  className="h-14 sm:h-14 max-w-[170px] object-contain"
                />
              ) : isLogoLoading ? (
                <div className="h-16 w-40 animate-pulse rounded-md bg-gray-100" />
              ) : (
                <div className="flex items-center gap-2 text-[#27AE60]">
                  <span className="flex h-7 w-7 items-center justify-center">
                    <Logo />
                  </span>
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                    Propenu
                  </span>
                </div>
              )}
            </Link>
          </div>

          {/* Mobile Hero preview banner */}
          <div className="relative mb-4 h-28 w-full overflow-hidden rounded-xl lg:hidden shadow-xs">
            <Image
              src="/images/login_hero_img.jpeg"
              alt="Propenu Real Estate"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-2.5 left-3 right-3">
              <span className="inline-block rounded bg-[#27AE60] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                Propenu Verified
              </span>
              <p className="mt-0.5 text-xs font-semibold text-white drop-shadow">
                Discover Your Dream Property
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Header Titles */}
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-100">
                <MdOutlineWhatsapp className="h-3 w-3 text-[#27AE60]" />
                <span>WhatsApp Secure Login</span>
              </div>

              <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                {step === "request" ? "Welcome Back" : "Verify Your OTP"}
              </h2>
              <p className="mt-1 text-xs text-gray-500 font-normal leading-normal">
                {step === "request"
                  ? "Enter your WhatsApp mobile number to access your account."
                  : `Enter the 4-digit code sent to ${phone}.`}
              </p>
            </div>

            {/* STEP 1: Phone Request */}
            {step === "request" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRequestOtp();
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    WhatsApp Mobile Number
                  </label>
                  <div className="relative rounded-xl border border-gray-200 bg-[#fbfdfb] px-3.5 py-2 transition-all focus-within:border-[#27AE60] focus-within:bg-white focus-within:ring-3 focus-within:ring-emerald-100 shadow-2xs [&_.PhoneInputInput]:border-none! [&_.PhoneInputInput]:outline-none! [&_.PhoneInputInput]:ring-0! [&_.PhoneInputInput]:focus:outline-none! [&_.PhoneInputInput]:focus:ring-0! [&_.PhoneInputCountrySelect]:outline-none!">
                    <PhoneInput
                      international
                      defaultCountry="IN"
                      countries={["IN"]}
                      withCountryCallingCode
                      limitMaxLength
                      countryCallingCodeEditable={false}
                      numberInputProps={{
                        maxLength: INDIA_PHONE_INPUT_MAX_LENGTH,
                        inputMode: "numeric",
                        id: "login-phone-input",
                        className: "outline-none! border-none! ring-0! focus:outline-none! focus:ring-0! shadow-none! bg-transparent w-full text-sm font-medium",
                      }}
                      value={phone}
                      onChange={(value) => {
                        setPhone(value || INDIA_COUNTRY_CODE);
                        setError(null);
                      }}
                      placeholder="Enter 10-digit number"
                      className="w-full text-sm font-medium outline-none border-none"
                    />
                  </div>
                  {error && (
                    <p className="mt-2 text-xs text-red-600 font-medium">
                      {error}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full cursor-pointer rounded-md bg-[#27AE60] hover:bg-[#219652] py-2.5 text-sm sm:text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Sending OTP...
                    </span>
                  ) : (
                    "Send OTP via WhatsApp"
                  )}
                </button>
              </form>
            )}

            {/* STEP 2: OTP Verification */}
            {step === "verify" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-xl bg-emerald-50/70 p-3 border border-emerald-100">
                  <div className="flex items-center gap-2">
                    <MdOutlineWhatsapp className="h-4 w-4 text-[#27AE60]" />
                    <span className="text-sm font-semibold text-gray-800">
                      {phone}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("request");
                      setOtpDigits(Array(OTP_LENGTH).fill(""));
                      setError(null);
                    }}
                    className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#27AE60] hover:underline"
                  >
                    <LuPencilLine className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </div>

                <div>
                  <label className="block text-center text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
                    Enter 4-Digit Code
                  </label>

                  <div
                    className="flex justify-center gap-3 sm:gap-3.5"
                    onPaste={handleOtpPaste}
                  >
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          inputsRef.current[index] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={1}
                        value={digit}
                        disabled={loading}
                        onChange={(e) => handleOtpChange(e.target.value, index)}
                        onKeyDown={(e) => handleOtpKeyDown(e, index)}
                        className="h-12 w-12 sm:h-13 sm:w-13 rounded-xl border border-gray-200 bg-white text-center text-xl font-bold text-gray-900 shadow-2xs outline-none transition-all focus:border-[#27AE60] focus:ring-3 focus:ring-emerald-100 disabled:bg-gray-100"
                      />
                    ))}
                  </div>

                  {error && (
                    <p className="mt-2.5 text-center text-xs text-red-600 font-medium">
                      {error}
                    </p>
                  )}

                  <div className="mt-4 text-center text-xs text-gray-500">
                    {resendCooldown > 0 ? (
                      <p>
                        Didn&apos;t get the OTP? Resend in{" "}
                        <span className="font-semibold text-gray-800">
                          {resendCooldown}s
                        </span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRequestOtp(true)}
                        disabled={loading}
                        className="cursor-pointer font-semibold text-[#27AE60] hover:underline disabled:opacity-50"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleVerifyOtp()}
                  disabled={loading || otp.length < OTP_LENGTH}
                  className="w-full cursor-pointer rounded-xl bg-[#27AE60] hover:bg-[#219652] py-3.5 text-sm sm:text-base font-semibold text-white shadow-md shadow-emerald-600/25 transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Verifying...
                    </span>
                  ) : (
                    "Verify & Continue"
                  )}
                </button>
              </div>
            )}

            {/* Switch to Register */}
            <div className="pt-2 text-center">
              <p className="text-xs sm:text-sm text-gray-600">
                Don&apos;t have an account?{" "}
                <Link
                  href={
                    redirectUrl !== "/"
                      ? `/register?redirect=${encodeURIComponent(redirectUrl)}`
                      : "/register"
                  }
                  className="font-semibold text-[#27AE60] hover:text-[#219652] hover:underline"
                >
                  Create an account
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Clean Footer copyright */}
        <div className="pt-4 text-center text-[11px] text-gray-400">
          © 2026 Propenu Private Limited · All Rights Reserved
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white font-['Poppins',sans-serif]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#27AE60] border-t-transparent" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
