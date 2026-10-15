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
import { LuPencilLine } from "react-icons/lu";
import { MdOutlineWhatsapp, MdOutlineBadge } from "react-icons/md";
import { AiOutlineUser } from "react-icons/ai";
import { BsBuildings } from "react-icons/bs";
import {
  createRequestOtp,
  createVerifyOtp,
  getSiteLogo,
  syncShortlist,
} from "@/data/ClientData";
import {
  accountSchema,
  COMPANY_NAME_MAX_LENGTH,
  FormErrors,
  mapAuthZodErrors,
  NAME_MAX_LENGTH,
  OTP_LENGTH,
  otpSchema,
  phoneSchema,
} from "@/app/(auth)/AuthZod";
import { getLocalShortlist } from "@/utilies/shortlistLocal";
import Logo from "@/animations/Logo";
import AuthHeroSection from "@/components/auth/AuthHeroSection";

const RESEND_OTP_SECONDS = 30;
const INDIA_COUNTRY_CODE = "+91";
const INDIA_PHONE_INPUT_MAX_LENGTH = 15;

function validateFullName(name: string): string {
  const value = name.trim();
  if (!value) return "Full name is required.";
  if (value.length < 3) return "Name must be at least 3 characters.";
  if (value.length > NAME_MAX_LENGTH) {
    return `Full name must not exceed ${NAME_MAX_LENGTH} characters.`;
  }
  if (/\d/.test(value)) {
    return "Name cannot contain numbers.";
  }
  return "";
}

function RegisterFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/";

  const [role, setRole] = useState<"user" | "builder" | "agent">("user");
  const [formData, setFormData] = useState({
    name: "",
    companyName: "",
    email: "",
  });
  const [phone, setPhone] = useState(INDIA_COUNTRY_CODE);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [otpRequested, setOtpRequested] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(
    Array(OTP_LENGTH).fill(""),
  );
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const otp = otpDigits.join("");

  const { data: siteLogoData, isLoading: isLogoLoading } = useQuery({
    queryKey: ["site-branding-logo"],
    queryFn: getSiteLogo,
    staleTime: 1000 * 60 * 30,
  });
  const logoUrl = siteLogoData?.data?.logoUrl;

  useEffect(() => {
    if (!otpRequested || resendCooldown <= 0) return;

    const timer = window.setTimeout(() => {
      setResendCooldown((seconds) => Math.max(seconds - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [otpRequested, resendCooldown]);

  async function handleSendOtp(isResend = false) {
    if (isResend && resendCooldown > 0) return;

    const accountValidation = accountSchema.safeParse({
      name: formData.name,
      companyName: formData.companyName,
      email: formData.email,
      role,
    });
    const phoneValidation = phoneSchema.safeParse({ phone });
    const nameError = validateFullName(formData.name);
    const termsError = termsAccepted
      ? ""
      : "Please accept the Terms & Conditions to proceed.";

    if (
      !accountValidation.success ||
      !phoneValidation.success ||
      nameError ||
      termsError
    ) {
      setErrors((prev) => ({
        ...prev,
        ...(accountValidation.success
          ? {}
          : mapAuthZodErrors(accountValidation.error)),
        ...(phoneValidation.success
          ? {}
          : mapAuthZodErrors(phoneValidation.error)),
        ...(nameError ? { name: nameError } : {}),
        ...(termsError ? { termsAccepted: termsError } : {}),
      }));
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      await createRequestOtp({ phone: phoneValidation.data.phone });
      setOtpRequested(true);
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setResendCooldown(RESEND_OTP_SECONDS);
      toast.success(
        isResend
          ? "OTP resent to your WhatsApp number"
          : "OTP sent to your WhatsApp number",
      );
      setTimeout(() => {
        inputsRef.current[0]?.focus();
      }, 100);
    } catch (err) {
      const backendMessage = axios.isAxiosError(err)
        ? err.response?.data?.message ||
        err.response?.data?.error ||
        err.response?.data
        : null;

      const msg =
        typeof backendMessage === "string" && backendMessage.trim()
          ? backendMessage
          : "Failed to send verification code. Please check your phone number.";

      setErrors((prev) => ({
        ...prev,
        phone: msg,
      }));
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyAndRegister(manualOtp?: string | React.MouseEvent) {
    const otpToSubmit = typeof manualOtp === "string" ? manualOtp : otp;

    const phoneValidation = phoneSchema.safeParse({ phone });
    const accountValidation = accountSchema.safeParse({
      name: formData.name,
      companyName: formData.companyName,
      email: formData.email,
      role,
    });
    const otpValidation = otpSchema.safeParse(otpToSubmit);
    const termsError = termsAccepted
      ? ""
      : "Please accept the Terms & Conditions.";

    if (
      !phoneValidation.success ||
      !accountValidation.success ||
      !otpValidation.success ||
      termsError
    ) {
      setErrors((prev) => ({
        ...prev,
        ...(phoneValidation.success
          ? {}
          : mapAuthZodErrors(phoneValidation.error)),
        ...(accountValidation.success
          ? {}
          : mapAuthZodErrors(accountValidation.error)),
        ...(otpValidation.success
          ? {}
          : { otp: otpValidation.error.issues[0]?.message }),
        ...(termsError ? { termsAccepted: termsError } : {}),
      }));
      return;
    }

    setLoading(true);

    try {
      const payload = {
        name: accountValidation.data.name,
        companyName:
          role === "builder" ? accountValidation.data.companyName : undefined,
        email: accountValidation.data.email,
        role,
        phone: phoneValidation.data.phone,
        otp: otpToSubmit,
      };

      const res = await createVerifyOtp(payload);

      if (res?.token) {
        Cookies.set("token", res.token, {
          path: "/",
          expires: 30,
          secure: process.env.NODE_ENV === "production",
          sameSite: "Lax",
        });
      }

      window.dispatchEvent(new Event("auth-changed"));

      const localShortlist = getLocalShortlist();
      if (localShortlist.length > 0) {
        await syncShortlist(localShortlist);
        localStorage.removeItem("shortlist");
      }

      toast.success("Account created successfully!");

      setTimeout(() => {
        window.location.assign(redirectUrl);
      }, 600);
    } catch (err: any) {
      const errorData = err?.response?.data;
      if (errorData?.field === "name") {
        setErrors((prev) => ({
          ...prev,
          name: errorData.message || "Invalid name",
        }));
      } else if (errorData?.field === "companyName") {
        setErrors((prev) => ({
          ...prev,
          companyName: errorData.message || "Invalid company name",
        }));
      } else if (errorData?.field === "otp") {
        setErrors((prev) => ({
          ...prev,
          otp: errorData.message || "Invalid OTP",
        }));
      } else {
        const msg =
          errorData?.message ||
          errorData?.error ||
          "Verification failed. Please check OTP and try again.";
        setErrors((prev) => ({
          ...prev,
          otp: msg,
        }));
        toast.error(msg);
      }
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(value: string, index: number) {
    setErrors((prev) => ({ ...prev, otp: undefined }));
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
      handleVerifyAndRegister(combinedOtp);
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
      handleVerifyAndRegister(combinedOtp);
    } else {
      const lastIndex = Math.min(paste.length - 1, OTP_LENGTH - 1);
      inputsRef.current[lastIndex]?.focus();
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-white font-['Poppins',sans-serif]">
      {/* Left 70% Column: Hero Showcase */}
      <AuthHeroSection />

      {/* Right 30% Column: Register Screen */}
      <div className="flex w-full lg:w-[30%] lg:flex-[0_0_30%] min-h-screen flex-col justify-between p-6 sm:p-8 xl:p-10 bg-white shadow-2xl shadow-gray-200/50 z-20 overflow-y-auto">
        <div />

        {/* Center Register Content */}
        <div className="my-auto w-full max-w-[360px] mx-auto py-2">
          {/* Brand Logo Centered */}
          <div className="flex justify-center mb-5">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2.5 transition-opacity hover:opacity-85"
              aria-label="Propenu Home"
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Propenu Logo"
                  className="h-9 sm:h-10 max-w-[170px] object-contain"
                />
              ) : isLogoLoading ? (
                <div className="h-9 w-28 animate-pulse rounded-md bg-gray-100" />
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
                Join Propenu
              </span>
              <p className="mt-0.5 text-xs font-semibold text-white drop-shadow">
                Register for Verified Listings
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Header Titles */}
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-100/80">
                <MdOutlineWhatsapp className="h-3.5 w-3.5 text-[#27AE60]" />
                <span>Verified WhatsApp Sign Up</span>
              </div>

              <h2 className="mt-2.5 text-2xl xl:text-3xl font-bold tracking-tight text-gray-900">
                Create Account
              </h2>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                Join verified homeowners, buyers, and developers across India.
              </p>
            </div>

            {/* Role Switcher */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                I am a:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRole("user");
                    setErrors((prev) => ({ ...prev, companyName: undefined }));
                  }}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-xs font-semibold transition-all cursor-pointer ${role === "user"
                    ? "border-[#27AE60] bg-emerald-50/70 text-emerald-900 shadow-2xs"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                >
                  <AiOutlineUser className="h-4 w-4" />
                  <span className="truncate">Buyer/Tenant</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("builder")}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-xs font-semibold transition-all cursor-pointer ${role === "builder"
                    ? "border-[#27AE60] bg-emerald-50/70 text-emerald-900 shadow-2xs"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                >
                  <BsBuildings className="h-4 w-4" />
                  <span className="truncate">Builder</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRole("agent");
                    setErrors((prev) => ({ ...prev, companyName: undefined }));
                  }}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-xs font-semibold transition-all cursor-pointer ${role === "agent"
                    ? "border-[#27AE60] bg-emerald-50/70 text-emerald-900 shadow-2xs"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                >
                  <MdOutlineBadge className="h-4 w-4" />
                  <span className="truncate">Agent</span>
                </button>
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-3">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter full name"
                  maxLength={NAME_MAX_LENGTH}
                  value={formData.name}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, name: e.target.value }));
                    setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-3 ${errors.name
                    ? "border-red-400 bg-red-50/30 focus:border-red-500 focus:ring-red-100"
                    : "border-gray-200 bg-[#fbfdfb] focus:border-[#27AE60] focus:ring-emerald-100"
                    }`}
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-600">{errors.name}</p>
                )}
              </div>

              {/* Company Name (Builder required) */}
              {role === "builder" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter builder or firm name"
                    maxLength={COMPANY_NAME_MAX_LENGTH}
                    value={formData.companyName}
                    onChange={(e) => {
                      setFormData((p) => ({ ...p, companyName: e.target.value }));
                      setErrors((prev) => ({ ...prev, companyName: undefined }));
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-3 ${errors.companyName
                      ? "border-red-400 bg-red-50/30 focus:border-red-500 focus:ring-red-100"
                      : "border-gray-200 bg-[#fbfdfb] focus:border-[#27AE60] focus:ring-emerald-100"
                      }`}
                  />
                  {errors.companyName && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.companyName}
                    </p>
                  )}
                </div>
              )}

              {/* Email (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Email Address{" "}
                  <span className="text-gray-400 normal-case font-normal">(Optional)</span>
                </label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, email: e.target.value }));
                    setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-3 ${errors.email
                    ? "border-red-400 bg-red-50/30 focus:border-red-500 focus:ring-red-100"
                    : "border-gray-200 bg-[#fbfdfb] focus:border-[#27AE60] focus:ring-emerald-100"
                    }`}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600">{errors.email}</p>
                )}
              </div>

              {/* WhatsApp Phone */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  WhatsApp Mobile Number <span className="text-red-500">*</span>
                </label>
                <div
                  className={`relative rounded-xl border px-3 py-1.5 transition-all focus-within:ring-3 [&_.PhoneInputInput]:border-none! [&_.PhoneInputInput]:outline-none! [&_.PhoneInputInput]:ring-0! [&_.PhoneInputInput]:focus:outline-none! [&_.PhoneInputInput]:focus:ring-0! [&_.PhoneInputCountrySelect]:outline-none! ${errors.phone
                    ? "border-red-400 bg-red-50/30 focus-within:border-red-500 focus-within:ring-red-100"
                    : "border-gray-200 bg-[#fbfdfb] focus-within:border-[#27AE60] focus-within:ring-emerald-100"
                    }`}
                >
                  <PhoneInput
                    international
                    defaultCountry="IN"
                    countries={["IN"]}
                    withCountryCallingCode
                    limitMaxLength
                    countryCallingCodeEditable={false}
                    disabled={otpRequested}
                    numberInputProps={{
                      maxLength: INDIA_PHONE_INPUT_MAX_LENGTH,
                      inputMode: "numeric",
                      id: "register-phone-input",
                      className: "outline-none! border-none! ring-0! focus:outline-none! focus:ring-0! shadow-none! bg-transparent w-full text-sm font-medium",
                    }}
                    value={phone}
                    onChange={(value) => {
                      setPhone(value || INDIA_COUNTRY_CODE);
                      setErrors((prev) => ({ ...prev, phone: undefined }));
                    }}
                    placeholder="Enter 10-digit number"
                    className="w-full text-sm font-medium outline-none border-none"
                  />
                </div>
                {errors.phone && (
                  <p className="mt-1 text-xs text-red-600">{errors.phone}</p>
                )}
              </div>

              {/* OTP section if requested */}
              {otpRequested && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">
                      Enter 4-Digit Code:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpRequested(false);
                        setOtpDigits(Array(OTP_LENGTH).fill(""));
                      }}
                      className="flex cursor-pointer items-center gap-1 text-xs font-medium text-[#27AE60] hover:underline"
                    >
                      <LuPencilLine />
                      Change number
                    </button>
                  </div>

                  <div
                    className="flex justify-center gap-2.5"
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
                        className="h-11 w-11 rounded-lg border border-gray-200 bg-white text-center text-lg font-bold text-gray-900 shadow-2xs outline-none focus:border-[#27AE60] focus:ring-2 focus:ring-emerald-200"
                      />
                    ))}
                  </div>

                  {errors.otp && (
                    <p className="text-center text-xs text-red-600 font-medium">
                      {errors.otp}
                    </p>
                  )}

                  <div className="text-center text-xs text-gray-500">
                    {resendCooldown > 0 ? (
                      <p>
                        Resend code in{" "}
                        <span className="font-semibold text-gray-700">
                          {resendCooldown}s
                        </span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendOtp(true)}
                        disabled={loading}
                        className="cursor-pointer font-semibold text-[#27AE60] hover:underline"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Terms Checkbox */}
              <div className="pt-0.5">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => {
                      setTermsAccepted(e.target.checked);
                      if (e.target.checked) {
                        setErrors((prev) => ({
                          ...prev,
                          termsAccepted: undefined,
                        }));
                      }
                    }}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-[#27AE60] focus:ring-[#27AE60]"
                  />
                  <span className="text-[11px] text-gray-600 leading-tight">
                    I agree to the{" "}
                    <Link
                      href="/terms"
                      target="_blank"
                      className="font-medium text-[#27AE60] hover:underline"
                    >
                      Terms of Service
                    </Link>{" "}
                    &amp;{" "}
                    <Link
                      href="/privacy"
                      target="_blank"
                      className="font-medium text-[#27AE60] hover:underline"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
                {errors.termsAccepted && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.termsAccepted}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-1">
                {!otpRequested ? (
                  <button
                    type="button"
                    onClick={() => handleSendOtp()}
                    disabled={loading}
                    className="w-full cursor-pointer rounded-xl bg-[#27AE60] hover:bg-[#219652] py-3 text-sm sm:text-base font-semibold text-white shadow-md shadow-emerald-600/25 transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="h-4 w-4 animate-spin"
                          viewBox="0 0 24 24"
                        >
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
                      "Continue with WhatsApp"
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleVerifyAndRegister()}
                    disabled={loading || otp.length < OTP_LENGTH}
                    className="w-full cursor-pointer rounded-xl bg-[#27AE60] hover:bg-[#219652] py-3 text-sm sm:text-base font-semibold text-white shadow-md shadow-emerald-600/25 transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="h-4 w-4 animate-spin"
                          viewBox="0 0 24 24"
                        >
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
                        Creating Account...
                      </span>
                    ) : (
                      "Verify & Create Account"
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Switch to Login */}
            <div className="pt-2 text-center">
              <p className="text-xs sm:text-sm text-gray-600">
                Already have an account?{" "}
                <Link
                  href={
                    redirectUrl !== "/"
                      ? `/login?redirect=${encodeURIComponent(redirectUrl)}`
                      : "/login"
                  }
                  className="font-semibold text-[#27AE60] hover:text-[#219652] hover:underline"
                >
                  Log in
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Clean Footer copyright */}
        <div className="pt-3 text-center text-[11px] text-gray-400">
          © 2026 Propenu Private Limited · All Rights Reserved
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white font-['Poppins',sans-serif]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#27AE60] border-t-transparent" />
        </div>
      }
    >
      <RegisterFormContent />
    </Suspense>
  );
}
