"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/useAuth";
import { createHomeLoanApplication } from "@/data/ClientData";
import {
  getIndianPhoneDigits,
  INDIA_COUNTRY_CODE,
  INDIAN_PHONE_DIGIT_LENGTH,
  isValidIndianPhoneNumber,
} from "@/utilies/indianPhone";

interface HomeLoanApplyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  titleId: string;
  metadata?: Record<string, unknown>;
}

export default function HomeLoanApplyDialog({
  isOpen,
  onClose,
  titleId,
  metadata = {},
}: HomeLoanApplyDialogProps) {
  const { user } = useAuth();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [formErrors, setFormErrors] = useState({
    fullName: "",
    mobileNumber: "",
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !user) return;

    setFullName(user.name || "");
    setMobileNumber(getIndianPhoneDigits(user.phone));
    setFormErrors({ fullName: "", mobileNumber: "" });
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const resetForm = () => {
    setIsSubmitted(false);
    setIsSubmitting(false);
    setSubmitError("");
    setFullName("");
    setMobileNumber("");
    setFormErrors({ fullName: "", mobileNumber: "" });
  };

  const handleClose = () => {
    onClose();
    resetForm();
  };

  const handleApplySubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = fullName.trim();
    const normalizedMobile = mobileNumber.replace(/\D/g, "");
    const nextErrors = {
      fullName: "",
      mobileNumber: "",
    };

    if (!normalizedName) {
      nextErrors.fullName = "Please enter your full name.";
    } else if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(normalizedName)) {
      nextErrors.fullName = "Name can contain letters and spaces only.";
    } else if (normalizedName.length < 3) {
      nextErrors.fullName = "Name must be at least 3 letters.";
    }

    if (!normalizedMobile) {
      nextErrors.mobileNumber = "Please enter your mobile number.";
    } else if (!isValidIndianPhoneNumber(normalizedMobile)) {
      nextErrors.mobileNumber = "Enter a valid 10-digit mobile number.";
    }

    if (nextErrors.fullName || nextErrors.mobileNumber) {
      setFormErrors(nextErrors);
      return;
    }

    setFormErrors({ fullName: "", mobileNumber: "" });
    setSubmitError("");
    setIsSubmitting(true);

    try {
      await createHomeLoanApplication({
        fullName: normalizedName,
        mobileNumber: normalizedMobile,
        email: user?.email || undefined,
        source: "home_loans",
        pageUrl:
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : "/home-loans",
        metadata: {
          entryPoint: "home_loan_apply_dialog",
          ...metadata,
          attribution: {
            page:
              typeof window !== "undefined"
                ? `${window.location.pathname}${window.location.search}`
                : "/home-loans",
            submittedAt: new Date().toISOString(),
            ...(typeof window !== "undefined"
              ? { userAgent: window.navigator.userAgent }
              : {}),
            ...((metadata.attribution as Record<string, unknown> | undefined) ?? {}),
          },
        },
      });

      setIsSubmitted(true);
    } catch (error: any) {
      setSubmitError(
        error?.response?.data?.message ||
          error?.response?.data?.errors?.[0] ||
          "Unable to submit your application. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 p-4 transition-opacity"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={`relative w-full rounded-md bg-white shadow-2xl ${
          isSubmitted ? "max-w-[425px] px-6 py-8 sm:px-7 sm:py-9" : "max-w-[380px] p-5"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {!isSubmitted ? (
          <form onSubmit={handleApplySubmit}>
            <div className="mb-6 flex items-start justify-between gap-3">
              <h3 id={titleId} className="text-xl font-semibold text-gray-950">
                Apply for Home Loan
              </h3>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close apply form"
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.75}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <label className="block text-xs font-medium text-gray-700">
              Full Name<span className="text-red-500">*</span>
              <input
                type="text"
                value={fullName}
                onChange={(event) => {
                  const nextValue = event.target.value.replace(/[^A-Za-z\s]/g, "");
                  setFullName(nextValue.replace(/\s{2,}/g, " "));
                  setFormErrors((current) => ({ ...current, fullName: "" }));
                }}
                placeholder="Enter your full name"
                className={`mt-2 h-11 w-full rounded-md border bg-[#F2FFF8] px-3 text-sm font-medium text-gray-800 outline-none transition focus:ring-2 ${
                  formErrors.fullName
                    ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                    : "border-transparent focus:border-[#9FE5BF] focus:ring-[#27AE60]/25"
                }`}
              />
              {formErrors.fullName ? (
                <span className="mt-1.5 block text-xs font-medium text-red-500">
                  {formErrors.fullName}
                </span>
              ) : null}
            </label>

            <label className="mt-5 block text-xs font-medium text-gray-700">
              Mobile Number<span className="text-red-500">*</span>
              <div
                className={`mt-2 flex h-11 overflow-hidden rounded-md border bg-[#F2FFF8] transition focus-within:ring-2 ${
                  formErrors.mobileNumber
                    ? "border-red-300 focus-within:border-red-400 focus-within:ring-red-100"
                    : "border-transparent focus-within:border-[#9FE5BF] focus-within:ring-[#27AE60]/25"
                }`}
              >
                <span className="flex items-center border-r border-emerald-100 px-3 text-sm font-semibold text-gray-700">
                  {INDIA_COUNTRY_CODE}
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={INDIAN_PHONE_DIGIT_LENGTH}
                  value={mobileNumber}
                  onChange={(event) => {
                    setMobileNumber(getIndianPhoneDigits(event.target.value));
                    setFormErrors((current) => ({ ...current, mobileNumber: "" }));
                  }}
                  placeholder="Enter your mobile number"
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm font-medium text-gray-800 outline-none"
                />
              </div>
              {formErrors.mobileNumber ? (
                <span className="mt-1.5 block text-xs font-medium text-red-500">
                  {formErrors.mobileNumber}
                </span>
              ) : null}
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-7 w-full rounded-md bg-[#27AE60] px-4 py-3 text-sm font-medium text-white shadow-xs transition-colors hover:bg-[#219653] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Submitting..." : "Apply Now"}
            </button>

            {submitError ? (
              <p className="mt-3 text-center text-xs font-medium text-red-500">
                {submitError}
              </p>
            ) : null}

            <p className="mt-4 text-center text-[11px] leading-5 text-gray-500">
              By clicking on "Apply Now", you agree to our{" "}
              <a href="/terms" className="text-[#27AE60] underline">
                Terms & Conditions
              </a>{" "}
              and{" "}
              <a href="/privacy" className="text-[#27AE60] underline">
                Privacy Policy
              </a>
              .
            </p>
          </form>
        ) : (
          <div className="text-center">
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close success message"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-[#15803D] shadow-xs transition-colors hover:border-emerald-200 hover:bg-emerald-100 hover:text-[#166534]"
            >
              <svg
                className="h-5.5 w-5.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#27AE60] text-white shadow-[0_10px_24px_rgba(39,174,96,0.28)] ring-8 ring-[#DFF8EA]">
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.25}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 id={titleId} className="mt-7 text-base font-semibold text-gray-950">
              Submitted successfully
            </h3>
            <p className="mx-auto mt-3 max-w-[310px] text-sm leading-5 text-gray-500">
              Our Home Loan Expert will get in touch soon to discuss your offers
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
