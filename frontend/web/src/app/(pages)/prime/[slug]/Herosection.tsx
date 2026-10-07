// components/HeroSection.tsx
"use client";

import Link from "next/link";
import {
  checkProjectLeadSubmitted,
  me,
  patchProjectLeadIntention,
  projectpostLeads,
  requestProjectLeadOtp,
  verifyProjectLeadOtp,
} from "@/data/ClientData";
import OtpFourDigitInput from "@/components/builder/OtpFourDigitInput";
import { useShortlist } from "@/hooks/useShortlist";
import { useMutation, useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { FiHeart } from "react-icons/fi";
import { IoIosShareAlt } from "react-icons/io";
import { toast } from "sonner";

type Props = {
  hero?: Hero;
};

type ContactLike = {
  name?: string;
  fullName?: string;
  companyName?: string;
  phone?: string;
  contact?: string;
  email?: string;
};

type UserProfile = {
  name?: string;
  fullName?: string;
  phone?: string;
  email?: string;
};

type IntentionAnswer = {
  question: string;
  answer: string;
};

const BUY_TIMELINE_QUESTION = "When do you plan to buy?";
const BUDGET_QUESTION = "Your Budget?";
const buyTimelineOptions = ["30 Days", "1 - 3 Months", "3 - 6 Months", "More than 6 Months"];
const budgetOptions = ["50L - 1Cr", "1Cr - 2Cr", "2Cr+"];
const LEAD_OTP_LENGTH = 4;

export type Stat = {
  value: string;
  label: string;
};

export type Hero = {
  projectId: string;
  title?: string;
  logo?: { url?: string };
  developer?: ContactLike | string | null;
  createdBy?: ContactLike | string | null;
  phone?: string;
  contact?: string;
  contactPhone?: string;
  phoneNumber?: string;
  mobile?: string;
  email?: string;
  contactEmail?: string;
  subTagline?: string;
  description?: string;
  color?: string;
  heroImage?: string | { url?: string };
  stats?: Stat[];
  propertyType?: string;
  heroTagline?: string;
};


export interface ProjectLeadPayload {
  name: string;
  phone: string;
  email?: string;
  projectId?: string;
  remarks?: string;
  sourceCreatedAt?: string;
  purchaseTimeline?: string;
  budgetRange?: string;
  status?: string;
}

function isValidPhoneNumber(value: string) {
  const normalized = value.replace(/[^\d+]/g, "");
  return /^\+?[1-9]\d{9,14}$/.test(normalized);
}

function sanitizePhoneInput(value: string) {
  const cleaned = value.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    return cleaned.replace(/\+/g, "");
  }

  return `+${cleaned.slice(1).replace(/\+/g, "")}`;
}

function sanitizeNameInput(value: string) {
  return value.replace(/[^A-Za-z\s]/g, "");
}

function getUserPrefill(user?: UserProfile | null) {
  return {
    name: sanitizeNameInput(user?.name || user?.fullName || ""),
    phone: user?.phone ? sanitizePhoneInput(user.phone) : "",
    email: user?.email || "",
  };
}

function isContactObject(value: unknown): value is ContactLike {
  return Boolean(value) && typeof value === "object";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getLeadErrorMessage(error: unknown) {
  const fallback = "Failed to submit lead";
  const maybeAxiosError = error as {
    response?: {
      data?: {
        message?: string;
        error?: string;
        errors?: string[] | Record<string, string | string[]>;
      };
    };
    message?: string;
  };

  const data = maybeAxiosError.response?.data;

  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }

  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error;
  }

  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    return data.errors.join(", ");
  }

  if (data?.errors && typeof data.errors === "object") {
    const firstError = Object.values(data.errors)
      .flat()
      .find((value) => typeof value === "string" && value.trim());

    if (firstError) return firstError;
  }

  if (typeof maybeAxiosError.message === "string" && maybeAxiosError.message.trim()) {
    return maybeAxiosError.message;
  }

  return fallback;
}

function getFieldValidationMessage(
  field: HTMLInputElement,
) {
  const { name, validity } = field;

  if (validity.valueMissing) {
    if (name === "name") return "Please enter your name";
    if (name === "phone") return "Please enter your mobile number";
    if (name === "email") return "Please enter your email address";
  }

  if (validity.patternMismatch) {
    if (name === "name") return "Name should contain letters only";
    if (name === "phone") return "Please enter a valid phone number";
    if (name === "email") return "Please enter a valid email address";
  }

  if (validity.typeMismatch && name === "email") {
    return "Please enter a valid email address";
  }

  return "Please check this field";
}

export default function HeroSection({ hero }: Props) {
  if (!hero) return null;

  // Type guard: ensure hero is not undefined for the rest of the component
  const h = hero as Hero;
  const heroImageUrl =
    typeof h.heroImage === "string" ? h.heroImage : h.heroImage?.url;
  const { isShortlisted, isShortlistLoading, toggleShortlist } = useShortlist(
    h.projectId,
    "FeaturedProject",
  );

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [showSubmittedStep, setShowSubmittedStep] = useState(false);
  const [intentionAnswers, setIntentionAnswers] = useState<IntentionAnswer[]>([]);
  const [leadStep, setLeadStep] = useState<"form" | "otp">("form");
  const [leadOtp, setLeadOtp] = useState("");
  const [leadOtpError, setLeadOtpError] = useState("");
  const [leadOtpSubmitting, setLeadOtpSubmitting] = useState(false);

  const developer = h.developer;
  const createdBy = h.createdBy;
  const contactName =
    isContactObject(developer)
      ? developer.companyName ||
        developer.name ||
        developer.fullName ||
        (isContactObject(createdBy) ? createdBy.name : undefined) ||
        h.title ||
        "Seller"
      : isContactObject(createdBy)
        ? createdBy.name || h.title || "Seller"
        : h.title || "Seller";
  const contactPhone =
    (isContactObject(developer) ? developer.phone || developer.contact : "") ||
    (isContactObject(createdBy) ? createdBy.phone || createdBy.contact : "") ||
    h.phone ||
    h.contact ||
    h.contactPhone ||
    h.phoneNumber ||
    h.mobile ||
    "";
  const contactEmail =
    (isContactObject(developer) ? developer.email : "") ||
    (isContactObject(createdBy) ? createdBy.email : "") ||
    h.email ||
    h.contactEmail ||
    "";
  const selectedTimeline = intentionAnswers.find(
    (item) => item.question === BUY_TIMELINE_QUESTION,
  )?.answer;
  const selectedBudget = intentionAnswers.find(
    (item) => item.question === BUDGET_QUESTION,
  )?.answer;

  const { data: userData } = useQuery({
    queryKey: ["user"],
    queryFn: me,
    retry: 1,
  });
  const loggedInUser = userData?.user as UserProfile | undefined;
  const userLeadPhone = loggedInUser?.phone
    ? sanitizePhoneInput(loggedInUser.phone)
    : "";
  const userLeadEmail = loggedInUser?.email?.trim() || "";
  const hasPrefilledUserDetails =
    Boolean(loggedInUser) &&
    Boolean(form.name.trim()) &&
    Boolean(form.phone.trim());

  const { data: existingLeadData } = useQuery({
    queryKey: ["prime-project-lead-submitted", h.projectId, userLeadPhone, userLeadEmail],
    queryFn: () =>
      checkProjectLeadSubmitted({
        projectId: h.projectId,
        phone: userLeadPhone,
        email: userLeadEmail,
      }),
    enabled: Boolean(h.projectId && (userLeadPhone || userLeadEmail)),
    retry: 1,
  });

  useEffect(() => {
    if (!loggedInUser) return;

    const prefill = getUserPrefill(loggedInUser);
    setForm((current) => ({
      name: current.name || prefill.name,
      phone: current.phone || prefill.phone,
      email: current.email || prefill.email,
    }));
  }, [loggedInUser]);

  useEffect(() => {
    const existingLead = existingLeadData?.data;
    if (!existingLeadData?.submitted || !existingLead) return;

    setLeadId(String(existingLead._id || ""));
    setIntentionAnswers(
      Array.isArray(existingLead.intention) ? existingLead.intention : [],
    );
    setShowSubmittedStep(true);
  }, [existingLeadData]);

  const leadsMutation = useMutation({
    mutationFn: projectpostLeads,
    onSuccess: (response) => {
      toast.success("Lead submitted successfully");
      const createdLeadId = response?.data?._id || response?.data?.id || "";
      setLeadId(createdLeadId);
      setShowSubmittedStep(true);
      setLeadStep("form");
      setLeadOtp("");
      setLeadOtpError("");
      setForm(getUserPrefill(loggedInUser));
    },
    onError: (error) => {
      toast.error(getLeadErrorMessage(error));
    },
  });

  const intentionMutation = useMutation({
    mutationFn: ({
      leadId: currentLeadId,
      intention,
    }: {
      leadId: string;
      intention: IntentionAnswer[];
    }) => patchProjectLeadIntention(currentLeadId, { intention }),
    onError: (error) => {
      toast.error(getLeadErrorMessage(error));
    },
  });

  const updateIntentionAnswer = (question: string, answer: string) => {
    setIntentionAnswers((current) => {
      const next = [
        ...current.filter((item) => item.question !== question),
        { question, answer },
      ];

      if (leadId) {
        intentionMutation.mutate({ leadId, intention: next });
      }

      return next;
    });
  };

  const finalizeLeadSubmission = () => {
    leadsMutation.mutate({
      name: form.name.trim(),
      phone: form.phone,
      email: form.email.trim(),
      projectId: h.projectId,
      remarks: "Requested contact details",
    });
  };

  const requestLeadOtp = async () => {
    setLeadOtpSubmitting(true);
    setLeadOtpError("");

    try {
      await requestProjectLeadOtp({
        phone: form.phone,
        projectId: h.projectId || undefined,
      });
      setLeadStep("otp");
      setLeadOtp("");
      toast.success("OTP sent to your mobile number");
    } catch (error) {
      const errorMessage = getLeadErrorMessage(error);
      setLeadOtpError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLeadOtpSubmitting(false);
    }
  };

  const handleVerifyLeadOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const cleanOtp = leadOtp.trim();
    if (cleanOtp.length !== LEAD_OTP_LENGTH) {
      setLeadOtpError("Please enter a 4-digit OTP");
      return;
    }

    setLeadOtpSubmitting(true);
    setLeadOtpError("");

    try {
      await verifyProjectLeadOtp({
        phone: form.phone,
        otp: cleanOtp,
        projectId: h.projectId || undefined,
      });
      toast.success("Phone number verified successfully");
      finalizeLeadSubmission();
    } catch (error) {
      const errorMessage = getLeadErrorMessage(error);
      setLeadOtpError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLeadOtpSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Please enter your name");
      return;
    }

    if (!isValidPhoneNumber(form.phone)) {
      toast.error("Please enter a valid phone number");
      return;
    }

    if (form.email.trim() && !isValidEmail(form.email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (!hasPrefilledUserDetails && !termsAccepted) {
      toast.error("Please accept the Terms & Conditions");
      return;
    }

    if (hasPrefilledUserDetails) {
      finalizeLeadSubmission();
      return;
    }

    await requestLeadOtp();
  };


  function handleChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const { name, value } = e.target;
    setForm((p) => ({
      ...p,
      [name]:
        name === "phone"
          ? sanitizePhoneInput(value)
          : name === "name"
            ? sanitizeNameInput(value)
            : value,
    }));
    if (leadStep === "otp") {
      setLeadStep("form");
      setLeadOtp("");
    }
    if (leadOtpError) setLeadOtpError("");
  }

  function handleInvalid(
    e: React.FormEvent<HTMLInputElement>,
  ) {
    e.currentTarget.setCustomValidity(getFieldValidationMessage(e.currentTarget));
  }

  function handleFieldInput(
    e: React.FormEvent<HTMLInputElement>,
  ) {
    e.currentTarget.setCustomValidity("");
  }

  const accentColor = h.color || "#27AE60";
  const optionButtonClass =
    "min-h-7 rounded-md px-1.5 py-1 text-center text-[12px] font-semibold leading-tight  transition";
  const inactiveOptionButtonClass =
    "border border-white/25 bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] hover:bg-white/18 hover:text-white";
  const intentionQuestions = (
    <div className=" px-3 py-3">


      <p className="text-xs font-semibold text-white">{BUY_TIMELINE_QUESTION}</p>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {buyTimelineOptions.map((option) => {
          const active = selectedTimeline === option;

          return (
            <button
              key={option}
              type="button"
              onClick={() => updateIntentionAnswer(BUY_TIMELINE_QUESTION, option)}
              style={active ? { backgroundColor: accentColor } : undefined}
              className={`${optionButtonClass} ${
                active ? "text-white shadow-sm" : inactiveOptionButtonClass
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs font-semibold text-white">{BUDGET_QUESTION}</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {budgetOptions.map((option) => {
          const active = selectedBudget === option;

          return (
            <button
              key={option}
              type="button"
              onClick={() => updateIntentionAnswer(BUDGET_QUESTION, option)}
              style={active ? { backgroundColor: accentColor } : undefined}
              className={`${optionButtonClass} ${
                active ? "text-white shadow-sm" : inactiveOptionButtonClass
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
  async function shareProject() {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    const shareData = {
      title: h.title || h.subTagline || "Prime Project",
      text: `Check out ${h.title || h.subTagline || "this prime project"}`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      toast.success("Project link copied");
    } catch {
      // Ignore cancelled share / clipboard issues.
    }
  }



  return (
    <section
      aria-label="#hero-section"
      className="relative min-h-[75vh] md:min-h-[85vh] bg-slate-800 bg-cover bg-center"
      style={{
        backgroundImage: heroImageUrl ? `url("${heroImageUrl}")` : undefined,
      }}
    >
      {/* DARK OVERLAY */}
      <div className="absolute inset-0 bg-linear-to-b from-black/70 via-black/50 to-black/80" />
      {/* MAIN CONTENT */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 md:pt-20 pb-48">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* LEFT TEXT */}
          <div className="lg:col-span-7 space-y-6">
            {h.heroTagline ? (
              <div className="mb-5 inline-flex items-center gap-3 rounded-full bg-black/35 pr-4 pl-2 py-2 backdrop-blur-md border border-white/20">
                <span
                  className="h-2.5 w-2.5 rounded-full shadow-[0_0_12px]"
                  style={{ backgroundColor: h.color || "#f59e0b", boxShadow: `0 0 12px ${h.color || "#f59e0b"}` }}
                />
                <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
                  {h.heroTagline}
                </p>
              </div>
            ) : null}
            <h1 className="text-white text-2xl sm:text-3xl md:text-[64px] leading-tight">
              {h.subTagline}
            </h1>
            <h2
              className="lg:text-xl sm:text-3xl line-clamp-2 drop-shadow-lg"
              style={{
                color: h.color || "#fff",
                textShadow: "0 2px 10px rgba(0,0,0,0.8)"
              }}
            >
              {h.description}
            </h2>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={toggleShortlist}
                disabled={isShortlistLoading}
                className={`flex h-10 items-center gap-2 rounded-lg border border-white/70 bg-white/95 px-4 text-sm font-semibold shadow-sm backdrop-blur transition hover:bg-white cursor-pointer ${
                  isShortlisted ? "text-rose-500" : "text-slate-700 hover:text-rose-500"
                } disabled:cursor-not-allowed disabled:opacity-70`}
                aria-label={isShortlisted ? "Remove project from shortlist" : "Shortlist project"}
                aria-pressed={isShortlisted}
              >
                <FiHeart className={`h-4 w-4 ${isShortlisted ? "fill-current" : ""}`} />
                <span>
                  {isShortlistLoading ? "Saving..." : isShortlisted ? "Shortlisted" : "Shortlist"}
                </span>
              </button>

              <button
                type="button"
                onClick={shareProject}
                className="flex h-10 items-center gap-2 rounded-lg border border-white/70 bg-white/95 px-4 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-emerald-600 cursor-pointer"
                aria-label="Share project"
              >
                <IoIosShareAlt className="h-4 w-4" />
                <span>Share</span>
              </button>
            </div>

            <div className="absolute bottom-0 left-0 z-10 w-full lg:w-[78%]">
              <div className="grid grid-cols-2 gap-2 py-4 text-center sm:gap-3 sm:py-6 md:grid-cols-4 lg:py-8">
                {h.stats?.map((stat, idx) => (
                  <div key={idx} className="min-w-0 px-1">
                    <div className="whitespace-nowrap text-base font-bold leading-tight text-white sm:text-xl md:text-[26px]">
                      {stat.value}
                    </div>

                    <div className="mt-1 whitespace-nowrap text-[11px] text-gray-200 sm:text-xs md:text-sm">{stat.label}</div>

                    <div
                      className="mx-auto mt-1 h-0.5 w-8 sm:mt-2 sm:w-10 md:w-12"
                      style={{ backgroundColor: h.color }}
                    />
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* RIGHT FORM */}
          <div className="lg:col-span-5">
            <div className={`w-full lg:ml-auto ${
              showSubmittedStep
                ? "max-w-sm rounded-xl border border-white/30 bg-white/20 p-2 text-slate-950 shadow-2xl shadow-black/20 backdrop-blur-xl"
                : "max-w-md rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-lg sm:p-6"
            }`}>
              {showSubmittedStep ? (
                <div className="overflow-hidden rounded-lg shadow-[0_14px_38px_rgba(15,23,42,0.16)]">
                  <div className="relative overflow-hidden border border-white/20 bg-white/95 px-4 py-5 text-center">
                    <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accentColor }} />
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[0_10px_24px_rgba(39,174,96,0.28)]" style={{ backgroundColor: accentColor }}>
                      <span className="h-4 w-2 rotate-45 border-b-2 border-r-2 border-white" />
                    </div>
                    <p className="mt-3 text-base font-bold text-slate-950">Thank You!</p>
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      Your enquiry has been submitted.
                    </p>
                  </div>

                  <div className="border-t border-slate-500 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                        Contact Builder 
                      </p>
                      <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                        Prime
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-500 shadow-sm">
                        {h.logo?.url ? (
                          <img
                            src={h.logo.url}
                            alt={`${contactName} logo`}
                            className="h-full w-full object-contain p-1"
                          />
                        ) : (
                          <span className="text-sm font-semibold text-emerald-600">
                            {contactName.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{contactName}</p>
                        <p className="mt-0.5 text-xs font-medium text-white">Builder</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 border-t border-slate-500 pt-2.5 text-sm text-slate-700">
                      <p className="flex items-center justify-between gap-3 rounded-md border border-white/20 bg-white/10 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                        <span className="text-xs text-white/80">Phone</span>
                        <span className="font-medium text-white text-xs">{contactPhone || "Not available"}</span>
                      </p>
                      {contactEmail && (
                        <p className="flex items-start justify-between gap-3 rounded-md border border-white/20 bg-white/10 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                          <span className="shrink-0 text-xs text-white/80">Email</span>
                          <span className="break-all text-right text-xs font-medium text-white">{contactEmail}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-200">{intentionQuestions}</div>
                </div>
              ) : leadStep === "otp" ? (
                <>
                  <h3 className="mb-2 text-base font-semibold text-white sm:mb-4 sm:text-lg">
                    Verify Mobile Number
                  </h3>

                  <form onSubmit={handleVerifyLeadOtp} className="space-y-3">
                    <div className="rounded-md border border-white/20 bg-white/10 px-3 py-3 text-center">
                      <p className="text-xs text-white/80">
                        Enter the 4-digit OTP sent to
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">{form.phone}</p>
                    </div>

                    <div className="py-1">
                      <OtpFourDigitInput
                        value={leadOtp}
                        onChange={(value) => {
                          setLeadOtp(value);
                          setLeadOtpError("");
                        }}
                        disabled={leadOtpSubmitting || leadsMutation.isPending}
                        error={Boolean(leadOtpError)}
                        autoFocus
                      />
                    </div>

                    {leadOtpError ? (
                      <p className="text-center text-xs font-medium text-red-200">
                        {leadOtpError}
                      </p>
                    ) : null}

                    <button
                      type="submit"
                      disabled={
                        leadOtpSubmitting ||
                        leadsMutation.isPending ||
                        leadOtp.length !== LEAD_OTP_LENGTH
                      }
                      style={{ backgroundColor: h.color || "#27AE60" }}
                      className="w-full cursor-pointer rounded-md py-1.5 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70 sm:py-2 sm:text-base"
                    >
                      {leadOtpSubmitting || leadsMutation.isPending
                        ? "Verifying..."
                        : "Verify & Continue"}
                    </button>

                    <div className="flex items-center justify-between text-xs text-white/80">
                      <button
                        type="button"
                        onClick={() => {
                          setLeadStep("form");
                          setLeadOtp("");
                          setLeadOtpError("");
                        }}
                        className="font-medium underline underline-offset-2 hover:text-white"
                      >
                        Edit Contact Info
                      </button>
                      <button
                        type="button"
                        onClick={requestLeadOtp}
                        disabled={leadOtpSubmitting || leadsMutation.isPending}
                        className="font-semibold underline-offset-2 hover:underline disabled:opacity-60"
                      >
                        Resend OTP
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <h3 className="mb-2 text-base font-semibold text-white sm:mb-4 sm:text-lg">
                    Enquiry Now
                  </h3>

                  <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-3">
                    {!hasPrefilledUserDetails ? (
                      <>
                        <input
                          name="name"
                          value={form.name}
                          onChange={handleChange}
                          onInvalid={handleInvalid}
                          onInput={handleFieldInput}
                          inputMode="text"
                          pattern="[A-Za-z\s]+"
                          title="Name should contain letters only"
                          placeholder="Your Name"
                          required
                          className="w-full rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white outline-none placeholder-white/70 focus:ring-2 focus:ring-yellow-400 sm:px-3 sm:py-2 sm:text-sm"
                        />

                        <input
                          name="phone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          pattern="^\+?[1-9]\d{9,14}$"
                          value={form.phone}
                          onChange={handleChange}
                          onInvalid={handleInvalid}
                          onInput={handleFieldInput}
                          title="Please enter a valid phone number"
                          placeholder="Your Mobile Number"
                          required
                          className="w-full rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white outline-none placeholder-white/70 focus:ring-2 focus:ring-yellow-400 sm:px-3 sm:py-2 sm:text-sm"
                        />

                        <input
                          name="email"
                          value={form.email}
                          onChange={handleChange}
                          onInvalid={handleInvalid}
                          onInput={handleFieldInput}
                          type="email"
                          autoComplete="email"
                          pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                          title="Please enter a valid email address"
                          placeholder="Your Email"
                          className="w-full rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white outline-none placeholder-white/70 focus:ring-2 focus:ring-yellow-400 sm:px-3 sm:py-2 sm:text-sm"
                        />

                        <label className="flex items-start gap-1.5 text-[11px] text-white/80 sm:gap-2 sm:text-xs">
                          <input
                            name="terms"
                            type="checkbox"
                            checked={termsAccepted}
                            onChange={(event) => {
                              event.currentTarget.setCustomValidity("");
                              setTermsAccepted(event.target.checked);
                            }}
                            onInvalid={(event) =>
                              event.currentTarget.setCustomValidity(
                                "Please accept the Terms & Conditions",
                              )
                            }
                            required
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-white/40 bg-white/10 transition peer-checked:border-[#27AE60] peer-checked:bg-[#27AE60] peer-focus-visible:ring-2 peer-focus-visible:ring-[#27AE60]/25 sm:h-4 sm:w-4"
                          >
                            {termsAccepted ? (
                              <span className="h-2 w-1 rotate-45 border-b-2 border-r-2 border-white" />
                            ) : null}
                          </span>
                          <span className="leading-4 sm:leading-5">
                            I agree to Propenu's{" "}
                            <Link
                              href="/terms"
                              className="font-medium text-white underline underline-offset-2 hover:text-[#27AE60]"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Terms & Conditions
                            </Link>
                          </span>
                        </label>
                      </>
                    ) : null}

                    <button
                      type="submit"
                      disabled={leadsMutation.isPending || leadOtpSubmitting}
                      style={{ backgroundColor: h.color || "#27AE60" }}
                      className="w-full cursor-pointer rounded-md py-1.5 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70 sm:py-2 sm:text-base"
                    >
                      {leadOtpSubmitting
                        ? "Sending OTP..."
                        : leadsMutation.isPending
                          ? "Submitting..."
                          : "Get Contact Details"}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
















