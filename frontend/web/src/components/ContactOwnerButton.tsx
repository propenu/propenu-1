"use client";

import LoginDialog from "@/app/(auth)/Login";
import {
  me,
  postLeads,
  postPublicPropertyLead,
  requestPublicPropertyLeadOtp,
  syncShortlist,
  verifyPublicPropertyLeadOtp,
} from "@/data/ClientData";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { listingSourceToOwnershipLabel } from "@/utilies/resolveListingSource";
import { trackInteraction } from "@/services/trackingService";
import { HiXMark } from "react-icons/hi2";
import { z } from "zod";
import OtpFourDigitInput from "@/components/builder/OtpFourDigitInput";
import Cookies from "js-cookie";
import { VerifyPublicPropertyLeadOtpResponse } from "@/types/property";
import {
  formatIndianPhoneNumber,
  getIndianPhoneDigits,
  INDIA_COUNTRY_CODE,
  INDIAN_PHONE_DIGIT_LENGTH,
  isValidIndianPhoneNumber,
} from "@/utilies/indianPhone";

interface ContactOwnerButtonProps {
  listingType?: string;
  projectId: undefined | string;
  listingSource?: "User" | "Agent" | "builder" | string;
  createdBy?: Record<string, unknown>;
  propertyType?:
    | "residentials"
    | "commercials"
    | "agriculturals"
    | "landplots"
    | "featuredprojects";
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  postedOn?: string | Date;
  price?: number | string;
  propertyLabel?: string;
  className?: string;
  children?: React.ReactNode;
}

type ContactOwnerFormValues = {
  name: string;
  phone: string;
  email: string;
  termsAccepted: boolean;
};

type ContactOwnerFormErrors = Partial<
  Record<keyof ContactOwnerFormValues, string>
>;

const CONTACT_OWNER_OTP_LENGTH = 4;
const INITIAL_CONTACT_FORM = {
  name: "",
  phone: "",
  email: "",
};
function normalizeComparableValue(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

function sanitizePhoneInput(value?: string | null) {
  return formatIndianPhoneNumber(value);
}

function normalizeIndianPhone(value?: string | null) {
  return formatIndianPhoneNumber(value);
}

function getEntityId(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const entity = value as { _id?: string; id?: string };
    return entity._id?.trim() || entity.id?.trim() || "";
  }
  return "";
}

function sanitizeNameInput(value?: string | null) {
  return String(value || "").replace(/[^A-Za-z\s]/g, "");
}

function isValidName(value: string) {
  return /^[A-Za-z\s]+$/.test(value.trim());
}

function isValidPhoneNumber(value: string) {
  return isValidIndianPhoneNumber(value);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isLeadReadyUser(user?: any) {
  if (!user) return false;

  const hasVerifiedPhone =
    user.phoneVerified !== false && Boolean(String(user.phone || "").trim());
  const hasName = Boolean(String(user.name || "").trim());
  const hasRole = Boolean(String(user.roleName || user.role || "").trim());
  const builderNeedsCompany =
    (user.roleName || user.role) !== "builder" ||
    Boolean(String(user.companyName || "").trim());

  return hasVerifiedPhone && hasName && hasRole && builderNeedsCompany;
}

function isPlanRestrictionError(statusCode?: number, message?: string) {
  const lowerMessage = String(message || "").toLowerCase();

  const hasPlanRestrictionMessage =
    lowerMessage.includes("plan required") ||
    lowerMessage.includes("subscription required") ||
    lowerMessage.includes("upgrade your plan") ||
    lowerMessage.includes("please upgrade") ||
    lowerMessage.includes("please purchase") ||
    lowerMessage.includes("buy a plan") ||
    lowerMessage.includes("purchase a plan") ||
    lowerMessage.includes("purchase a buyer plan") ||
    lowerMessage.includes("subscribe to a plan") ||
    lowerMessage.includes("active plan") ||
    lowerMessage.includes("membership required") ||
    lowerMessage.includes("plan limit") ||
    lowerMessage.includes("owner contacts");

  return statusCode === 402 || hasPlanRestrictionMessage;
}

function isAgentListing(value?: string) {
  return String(value || "").trim().toLowerCase() === "agent";
}

const contactOwnerFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Please enter your full name" })
    .refine(isValidName, { message: "Full Name should contain letters only" }),
  phone: z
    .string()
    .trim()
    .min(1, { message: "Please enter your mobile number" })
    .refine(isValidPhoneNumber, { message: "Please enter a valid 10-digit mobile number" }),
  email: z
    .string()
    .trim()
    .refine((value) => !value || isValidEmail(value), {
      message: "Please enter a valid email address",
    }),
  termsAccepted: z.boolean().refine((value) => value === true, {
    message: "Please accept the Terms & Conditions",
  }),
});

function validateContactOwnerForm(
  values: ContactOwnerFormValues,
): ContactOwnerFormErrors {
  const result = contactOwnerFormSchema.safeParse(values);

  if (result.success) return {};

  const nextErrors: ContactOwnerFormErrors = {};

  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof ContactOwnerFormValues | undefined;
    if (field && !nextErrors[field]) {
      nextErrors[field] = issue.message;
    }
  }

  return nextErrors;
}

export default function ContactOwnerButton({
  listingType,
  listingSource,
  createdBy,
  projectId,
  propertyType = "residentials",
  ownerName,
  ownerPhone,
  ownerEmail,
  postedOn,
  price,
  propertyLabel,
  className,
  children,
}: ContactOwnerButtonProps) {
  const [showContactModal, setShowContactModal] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [openLoginAfterClose, setOpenLoginAfterClose] = useState(false);
  const [showGuestSuccessState, setShowGuestSuccessState] = useState(false);
  const [leadDetails, setLeadDetails] = useState<any>(null);
  const [form, setForm] = useState(INITIAL_CONTACT_FORM);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [formErrors, setFormErrors] = useState<ContactOwnerFormErrors>({});
  const [contactLeadStep, setContactLeadStep] = useState<"form" | "otp">("form");
  const [contactLeadOtp, setContactLeadOtp] = useState("");
  const [contactLeadOtpError, setContactLeadOtpError] = useState("");
  const [contactLeadOtpSubmitting, setContactLeadOtpSubmitting] = useState(false);
  const router = useRouter();

  const normalizeListingType = (
    value?: string,
  ): "sale" | "rent" | undefined => {
    const normalized = value?.toLowerCase().trim();
    if (!normalized) return undefined;
    if (
      normalized === "sale" ||
      normalized === "sell" ||
      normalized === "buy"
    ) {
      return "sale";
    }
    if (
      normalized === "rent" ||
      normalized === "rental" ||
      normalized === "lease"
    ) {
      return "rent";
    }
    return undefined;
  };

  const resolvedListingType = normalizeListingType(listingType);

  const redirectToPlan = () => {
    if (resolvedListingType === "rent") {
      router.push("/plans/pricing/rent-view");
      return;
    }

    router.push("/plans/pricing/buy-view");
  };

  const {
    data: userData,
    isLoading: isLoadingUser,
    refetch: refetchUser,
  } = useQuery({
    queryKey: ["user"],
    queryFn: me,
    retry: 1,
  });

  const getContactPerson = () => {
    return listingSourceToOwnershipLabel(listingSource, createdBy);
  };

  const user = userData?.user;
  const hasAuthToken = Boolean(Cookies.get("token"));
  const isLeadReady = isLeadReadyUser(user);
  const createdById = getEntityId(createdBy);
  const normalizedUserPhone = sanitizePhoneInput(user?.phone);
  const normalizedOwnerPhone = sanitizePhoneInput(ownerPhone);
  const normalizedOwnerEmail = normalizeComparableValue(ownerEmail);
  const shouldHidePrefilledContactFields =
    isLeadReady &&
    Boolean(form.name.trim()) &&
    Boolean(sanitizePhoneInput(form.phone));
  const canBypassOtpForLoggedInUser = Boolean(user);

  const isOwnLeadForUser = (currentUser?: any) => {
    const currentUserId = getEntityId(currentUser);
    const currentUserPhone = sanitizePhoneInput(currentUser?.phone);
    const currentUserEmail = normalizeComparableValue(currentUser?.email);

    return (
      Boolean(currentUser) &&
      ((Boolean(currentUserId) &&
        Boolean(createdById) &&
        currentUserId === createdById) ||
        (Boolean(currentUserPhone) &&
          Boolean(normalizedOwnerPhone) &&
          currentUserPhone === normalizedOwnerPhone) ||
        (Boolean(currentUserEmail) &&
          Boolean(normalizedOwnerEmail) &&
          currentUserEmail === normalizedOwnerEmail))
    );
  };

  const isOwnPropertyLead = isOwnLeadForUser(user);
  const ownPropertyLeadMessage =
    propertyType === "featuredprojects"
      ? "You cannot submit a lead for your own project."
      : "You cannot submit a lead for your own property.";
  const guestContactAccess = leadDetails?.contactAccess;
  const isAuthenticatedViewer = Boolean(user || hasAuthToken);
  const guestDisplayPhone =
    guestContactAccess === "masked"
      ? leadDetails?.ownerId?.phone
      : leadDetails?.ownerId?.phone ?? ownerPhone;
  const guestDisplayEmail =
    guestContactAccess === "masked"
      ? leadDetails?.ownerId?.email
      : leadDetails?.ownerId?.email ?? ownerEmail;

  const getPrefilledForm = () => {
    if (!user) return INITIAL_CONTACT_FORM;

    return {
      name: sanitizeNameInput(user.name || user.fullName || ""),
      phone: sanitizePhoneInput(user.phone),
      email: String(user.email || ""),
    };
  };

  const resetContactFormState = () => {
    setForm(getPrefilledForm());
    setFormErrors({});
    setContactLeadStep("form");
    setContactLeadOtp("");
    setContactLeadOtpError("");
    setContactLeadOtpSubmitting(false);
    setTermsAccepted(isLeadReady);
  };

  const saveAuthToken = (token?: string) => {
    if (!token) return;

    Cookies.set("token", token, {
      expires: 30,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
    });
  };

  const notifyAuthChanged = () => {
    window.dispatchEvent(new Event("auth-changed"));
  };

  const syncLocalShortlistIfNeeded = async () => {
    const localShortlist = JSON.parse(localStorage.getItem("shortlist") || "[]");

    if (localShortlist.length > 0) {
      await syncShortlist(localShortlist);
      localStorage.removeItem("shortlist");
    }
  };

  const getAuthenticatedUserWithRetry = async (attempts = 3, delayMs = 250) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await refetchUser();
      if (response.data?.user) return response.data.user;

      if (attempt < attempts - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      }
    }

    return undefined;
  };

  useEffect(() => {
    if (!user) return;

    setForm((current) => ({
      name: current.name || sanitizeNameInput(user.name || user.fullName || ""),
      phone: current.phone || sanitizePhoneInput(user.phone),
      email: current.email || String(user.email || ""),
    }));
  }, [user]);

  useEffect(() => {
    if (isLeadReady) {
      setTermsAccepted(true);
    }
  }, [isLeadReady]);

  useEffect(() => {
    if (!showContactModal && openLoginAfterClose) {
      const timer = window.setTimeout(() => {
        setShowLoginDialog(true);
        setOpenLoginAfterClose(false);
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [showContactModal, openLoginAfterClose]);

  const handleLeadError = (error: any) => {
    const statusCode = error?.response?.status;
    const apiMessage =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to contact owner";
    const currentRole = String(user?.roleName || user?.role || "").toLowerCase();
    const isBuilderUser = currentRole === "builder";
    const isContactingAgent = isAgentListing(listingSource);

    if (isContactingAgent && isPlanRestrictionError(statusCode, apiMessage)) {
      toast.error("Unable to submit your contact request. Please try again.");
      return;
    }

    if (!isBuilderUser && isPlanRestrictionError(statusCode, apiMessage)) {
      toast.error(apiMessage);
      redirectToPlan();
      return;
    }

    toast.error(apiMessage);
  };

  const { mutateAsync: postPublicLead, isPending: isLeadPosting } = useMutation({
    mutationFn: postPublicPropertyLead,
    onSuccess: (response) => {
      toast.success(response?.message || "Lead submitted successfully");
      trackInteraction({
        eventType: "contact_owner_clicked",
        eventCategory: "conversion",
        entityType:
          propertyType === "featuredprojects" ? "project" : "property",
        ...(propertyType === "featuredprojects"
          ? { projectId }
          : { propertyId: projectId }),
        source: "contact_owner",
        metadata: {
          title: propertyLabel,
          propertyType,
          listingType: resolvedListingType,
        },
      });
      setLeadDetails(response?.data ?? null);
      setShowGuestSuccessState(true);
    },
    onError: handleLeadError,
  });

  const { mutateAsync: postAuthenticatedLead } = useMutation({
    mutationFn: postLeads,
    onError: handleLeadError,
  });

  const submitLead = async (payload: {
    name: string;
    phone: string;
    email?: string;
  }, currentUser?: any, options?: { forcePublicLead?: boolean }) => {
    if (!options?.forcePublicLead && isOwnLeadForUser(currentUser || user)) {
      toast.error(ownPropertyLeadMessage);
      return;
    }

    if (!projectId) {
      toast.error("Property ID missing");
      return;
    }

    trackInteraction({
      eventType: "lead_form_started",
      eventCategory: "conversion",
      entityType: propertyType === "featuredprojects" ? "project" : "property",
      ...(propertyType === "featuredprojects"
        ? { projectId }
        : { propertyId: projectId }),
      source: "contact_owner",
      metadata: {
        title: propertyLabel,
        propertyType,
        listingType: resolvedListingType,
      },
    });

    const leadPayload = {
      name: payload.name,
      phone: payload.phone,
      email: payload.email ?? undefined,
      projectId,
      propertyType,
      listingType: resolvedListingType,
      listingSource,
      remarks: "Interested in this property",
    };

    if (currentUser && !options?.forcePublicLead) {
      const response = await postAuthenticatedLead(leadPayload);
      toast.success(response?.message || "Lead submitted successfully");
      trackInteraction({
        eventType: "contact_owner_clicked",
        eventCategory: "conversion",
        entityType:
          propertyType === "featuredprojects" ? "project" : "property",
        ...(propertyType === "featuredprojects"
          ? { projectId }
          : { propertyId: projectId }),
        source: "contact_owner",
        metadata: {
          title: propertyLabel,
          propertyType,
          listingType: resolvedListingType,
        },
      });
      setLeadDetails(response?.data ?? null);
      setShowGuestSuccessState(true);
      return;
    }

    await postPublicLead(leadPayload);
  };

  const handleRequestLeadOtp = async () => {
    setContactLeadOtpSubmitting(true);
    setContactLeadOtpError("");

    const normalizedPhone = normalizeIndianPhone(form.phone);

    try {
      const response = await requestPublicPropertyLeadOtp({
        phone: normalizedPhone,
        projectId: projectId || undefined,
        propertyType,
      });

      if (response?.skipOtp && user) {
        await submitLead(
          {
            name: form.name.trim(),
            phone: normalizedPhone,
            email: form.email.trim() || undefined,
          },
          user,
        );
        setContactLeadStep("form");
        setContactLeadOtp("");
        setContactLeadOtpError("");
        return;
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to send OTP";
      setContactLeadOtpError(message);
      toast.error(message);
      return;
    } finally {
      setContactLeadOtpSubmitting(false);
    }

    setContactLeadStep("otp");
    setContactLeadOtp("");
    toast.success("OTP sent to your mobile number");
  };

  const handleVerifyLeadOtp = async (
    e?: React.FormEvent<HTMLFormElement>,
  ) => {
    if (e) e.preventDefault();

    const cleanOtp = contactLeadOtp.trim();
    const normalizedPhone = normalizeIndianPhone(form.phone);
    if (cleanOtp.length !== CONTACT_OWNER_OTP_LENGTH) {
      setContactLeadOtpError("Please enter a 4-digit OTP");
      return;
    }

    setContactLeadOtpSubmitting(true);
    setContactLeadOtpError("");

    try {
      const verificationResponse: VerifyPublicPropertyLeadOtpResponse =
        await verifyPublicPropertyLeadOtp({
        phone: normalizedPhone,
        otp: cleanOtp,
        projectId: projectId || undefined,
        });
      toast.success("Phone number verified successfully");

      let authenticatedUser = user;
      const shouldSubmitAsGuestLead = !user;

      if (!authenticatedUser && verificationResponse.token) {
        saveAuthToken(verificationResponse.token);
        await syncLocalShortlistIfNeeded();
        notifyAuthChanged();
        authenticatedUser = shouldSubmitAsGuestLead
          ? undefined
          : await getAuthenticatedUserWithRetry();
      }

      await submitLead(
        {
          name: form.name.trim(),
          phone: normalizedPhone,
          email: form.email.trim() || undefined,
        },
        authenticatedUser,
        { forcePublicLead: shouldSubmitAsGuestLead },
      );
      setContactLeadStep("form");
      setContactLeadOtp("");
      setContactLeadOtpError("");
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "OTP verification failed";
      setContactLeadOtpError(message);
      toast.error(message);
    } finally {
      setContactLeadOtpSubmitting(false);
    }
  };

  const handleContactOwner = () => {
    if (isOwnPropertyLead) {
      toast.error(ownPropertyLeadMessage);
      return;
    }

    if (!projectId) {
      toast.error("Property ID missing");
      return;
    }

    resetContactFormState();
    setShowContactModal(true);
    setShowGuestSuccessState(false);
  };

  const handleSubmitLeadForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const nextErrors = validateContactOwnerForm({
      name: form.name,
      phone: form.phone,
      email: form.email,
      termsAccepted,
    });

    setFormErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (canBypassOtpForLoggedInUser) {
      let authenticatedUser = user;

      setContactLeadStep("form");
      setContactLeadOtp("");
      setContactLeadOtpError("");

      await submitLead(
        {
          name: form.name.trim(),
          phone: form.phone,
          email: form.email.trim() || undefined,
        },
        authenticatedUser,
      );
      return;
    }

    await handleRequestLeadOtp();
  };

  return (
    <>
      <button
        onClick={handleContactOwner}
        disabled={isLeadPosting || isLoadingUser || isOwnPropertyLead}
        className={
          className ??
          "rounded btn-primary px-6 py-2 font-medium text-white disabled:cursor-not-allowed transition-opacity"
        }
      >
        {children ??
          (isLeadPosting ? "Sending..." : `Contact ${getContactPerson()}`)}
      </button>

      {showContactModal &&
        createPortal(
          <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/40 px-4">
            <div
              className="absolute inset-0"
              onClick={() => setShowContactModal(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-[420px] rounded-md border border-slate-200 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                aria-label="Close contact dialog"
                className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 shadow-sm transition hover:bg-slate-200 hover:text-slate-700"
              >
                <HiXMark className="h-5 w-5" />
              </button>

              <div className="mt-4 flex items-center gap-3 border-b border-slate-200 pb-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-100 bg-white text-sm font-semibold text-emerald-600">
                  {(ownerName || getContactPerson()).charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-950 sm:text-base">
                    {ownerName || "Property owner"}
                  </p>
                  <p className="text-sm text-slate-500">{getContactPerson()}</p>
                </div>
              </div>

              {contactLeadStep === "otp" ? (
                <form onSubmit={handleVerifyLeadOtp} className="mt-5 space-y-4">
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-900">
                      Verify Mobile Number
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Enter the 4-digit OTP sent to{" "}
                      <span className="font-semibold text-slate-800">
                        {form.phone}
                      </span>
                    </p>
                  </div>

                  <div className="py-2">
                    <OtpFourDigitInput
                      value={contactLeadOtp}
                      onChange={(value) => {
                        setContactLeadOtp(value);
                        setContactLeadOtpError("");
                      }}
                      disabled={contactLeadOtpSubmitting || isLeadPosting}
                      error={Boolean(contactLeadOtpError)}
                      autoFocus
                    />
                  </div>

                  {contactLeadOtpError ? (
                    <p className="text-center text-xs font-medium text-red-600">
                      {contactLeadOtpError}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={
                      contactLeadOtpSubmitting ||
                      isLeadPosting ||
                      contactLeadOtp.length !== CONTACT_OWNER_OTP_LENGTH
                    }
                    className="h-10 w-full rounded-xl bg-[#27AE60] text-sm font-bold text-white shadow-sm transition hover:bg-[#219150] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {contactLeadOtpSubmitting || isLeadPosting
                      ? "Verifying..."
                      : "Verify & Continue"}
                  </button>

                  <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
                    <button
                      type="button"
                      onClick={() => {
                        setContactLeadStep("form");
                        setContactLeadOtp("");
                        setContactLeadOtpError("");
                      }}
                      className="font-medium text-slate-600 underline hover:text-slate-900"
                    >
                      ← Edit Contact Info
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestLeadOtp}
                      disabled={contactLeadOtpSubmitting || isLeadPosting}
                      className="font-semibold text-[#27AE60] hover:underline disabled:opacity-60"
                    >
                      Resend OTP
                    </button>
                  </div>
                </form>
              ) : showGuestSuccessState ? (
                <div className="mt-5 space-y-4 text-center">
                  {/* <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#27AE60] text-white shadow-md">
                    <span className="h-6 w-3 rotate-45 border-b-2 border-r-2 border-white" />
                  </div> */}
                  <div>
                    {/* <p className="text-base font-bold text-[#27AE60]">
                      Lead Submitted Successfully
                    </p> */}
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {isAuthenticatedViewer
                        ? ` `
                        : leadDetails?.contactAccess === "masked"
                        ? "You have reached the free guest contact limit. Please log in to view full contact details."
                        : "To view the owner's contact details, please log in here."}
                    </p>
                  </div>
                  {guestDisplayPhone || guestDisplayEmail ? (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-left">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {getContactPerson()} Details
                      </p>
                      {guestDisplayPhone ? (
                        <p className="mt-2 text-sm font-medium text-slate-800">
                          Phone: {guestDisplayPhone}
                        </p>
                      ) : null}
                      {guestDisplayEmail ? (
                        <p className="mt-1 text-sm font-medium text-slate-800 break-all">
                          Email: {guestDisplayEmail}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {isAuthenticatedViewer ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowGuestSuccessState(false);
                        setShowContactModal(false);
                      }}
                      className="h-10 w-full rounded-md bg-[#27AE60] text-sm font-semibold text-white shadow-sm transition hover:bg-[#219150]"
                    >
                      Close
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowGuestSuccessState(false);
                          setShowContactModal(false);
                          setOpenLoginAfterClose(true);
                        }}
                        className="h-10 w-full rounded-md bg-[#27AE60] text-sm font-semibold text-white shadow-sm transition hover:bg-[#219150]"
                      >
                        Login Here
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {!shouldHidePrefilledContactFields ? (
                    <p className="mt-4 text-sm font-medium text-slate-950 sm:text-base">
                      Please share your contact details
                    </p>
                  ) : null}

                  <form
                    onSubmit={handleSubmitLeadForm}
                    className={
                      shouldHidePrefilledContactFields
                        ? "mt-4"
                        : "mt-4 space-y-3 sm:space-y-4"
                    }
                  >
                    {shouldHidePrefilledContactFields ? (
                      <></>
                    ) : (
                      <>
                        <label className="block">
                          <span className="text-sm text-slate-600">Full Name</span>
                          <input
                            name="name"
                            value={form.name}
                            onChange={(event) => {
                              setFormErrors((current) => ({
                                ...current,
                                name: undefined,
                              }));
                              setForm((current) => ({
                                ...current,
                                name: sanitizeNameInput(event.target.value),
                              }));
                            }}
                            placeholder="Enter Name"
                            inputMode="text"
                            required
                            aria-invalid={Boolean(formErrors.name)}
                            className="mt-2 h-10 w-full rounded-md border-0 bg-emerald-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500"
                          />
                          {formErrors.name ? (
                            <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>
                          ) : null}
                        </label>

                        <label className="block">
                          <span className="text-sm text-slate-600">Mobile</span>
                          <div className="mt-2 flex h-10 overflow-hidden rounded-md bg-emerald-50 focus-within:ring-2 focus-within:ring-emerald-500">
                            <span className="flex items-center border-r border-emerald-100 px-3 text-sm font-semibold text-slate-700">
                              {INDIA_COUNTRY_CODE}
                            </span>
                            <input
                              name="phone"
                              type="tel"
                              inputMode="numeric"
                              autoComplete="tel"
                              maxLength={INDIAN_PHONE_DIGIT_LENGTH}
                              value={getIndianPhoneDigits(form.phone)}
                              onChange={(event) => {
                                setFormErrors((current) => ({
                                  ...current,
                                  phone: undefined,
                                }));
                                setForm((current) => ({
                                  ...current,
                                  phone: sanitizePhoneInput(event.target.value),
                                }));
                              }}
                              placeholder="Enter Mobile Number"
                              required
                              aria-invalid={Boolean(formErrors.phone)}
                              className="min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400"
                            />
                          </div>
                          {formErrors.phone ? (
                            <p className="mt-1 text-xs text-red-600">{formErrors.phone}</p>
                          ) : null}
                        </label>

                        <label className="block">
                          <span className="text-sm text-slate-600">Email ID</span>
                          <input
                            name="email"
                            type="email"
                            value={form.email}
                            onChange={(event) => {
                              setFormErrors((current) => ({
                                ...current,
                                email: undefined,
                              }));
                              setForm((current) => ({
                                ...current,
                                email: event.target.value,
                              }));
                            }}
                            autoComplete="email"
                            placeholder="Enter your Email ID"
                            aria-invalid={Boolean(formErrors.email)}
                            className="mt-2 h-10 w-full rounded-md border-0 bg-emerald-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500"
                          />
                          {formErrors.email ? (
                            <p className="mt-1 text-xs text-red-600">{formErrors.email}</p>
                          ) : null}
                        </label>

                        <label className="flex items-start gap-2 text-xs text-slate-600 sm:text-sm">
                          <input
                            name="terms"
                            type="checkbox"
                            checked={termsAccepted}
                            onChange={(event) => {
                              setTermsAccepted(event.target.checked);
                              setFormErrors((current) => ({
                                ...current,
                                termsAccepted: undefined,
                              }));
                            }}
                            required
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-slate-300 bg-white transition peer-checked:border-[#27AE60] peer-checked:bg-[#27AE60] peer-focus-visible:ring-2 peer-focus-visible:ring-[#27AE60]/25"
                          >
                            <span className="h-2 w-1 rotate-45 border-b-2 border-r-2 border-white" />
                          </span>
                          <span className="leading-5">
                            I agree to Propenu's{" "}
                            <Link
                              href="/terms"
                              className="font-medium text-slate-900 underline underline-offset-2 hover:text-[#27AE60]"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Terms & Conditions
                            </Link>
                          </span>
                        </label>
                        {formErrors.termsAccepted ? (
                          <p className="-mt-1 text-xs text-red-600">
                            {formErrors.termsAccepted}
                          </p>
                        ) : null}
                      </>
                    )}

                    <button
                      type="submit"
                      disabled={contactLeadOtpSubmitting || isLeadPosting}
                      className="h-10 w-full btn-primary text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {contactLeadOtpSubmitting
                        ? "Sending OTP..."
                        : isLeadPosting
                          ? "Submitting..."
                          : `Contact ${getContactPerson()}`}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      {showLoginDialog &&
        createPortal(
          <LoginDialog
            open
            onClose={() => setShowLoginDialog(false)}
            onSwitchToRegister={() => setShowLoginDialog(false)}
          />,
          document.body,
        )}
    </>
  );
}
