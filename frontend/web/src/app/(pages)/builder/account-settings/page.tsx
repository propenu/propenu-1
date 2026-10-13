"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BuilderProfilePayload,
  BuilderInvoiceListItem,
  downloadBuilderInvoicePdf,
  getBuilderInvoices,
  getBuilderProfile,
  requestBuilderPhoneChangeOtp,
  updateBuilderProfile,
  verifyBuilderPhoneChangeOtp,
} from "@/data/ClientData";
import { FiBriefcase, FiDownload, FiEdit2, FiMail, FiMapPin, FiPhone, FiSave, FiX } from "react-icons/fi";
import { toast } from "sonner";

type BuilderProfile = {
  id: string;
  name?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  locality?: string;
  city?: string;
  state?: string;
  pincode?: string;
  accountStatus?: string;
};

const emptyForm: Required<BuilderProfilePayload> = {
  name: "",
  companyName: "",
  email: "",
  address: "",
  locality: "",
  city: "",
  state: "",
  pincode: "",
};

const toForm = (profile?: BuilderProfile): Required<BuilderProfilePayload> => ({
  name: profile?.name || "",
  companyName: profile?.companyName || "",
  email: profile?.email || "",
  address: profile?.address || "",
  locality: profile?.locality || "",
  city: profile?.city || "",
  state: profile?.state || "",
  pincode: profile?.pincode || "",
});

export default function BuilderAccountSettingsPage() {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [phoneInput, setPhoneInput] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");

  const profileQuery = useQuery<{ profile: BuilderProfile }>({
    queryKey: ["builder-profile"],
    queryFn: getBuilderProfile,
  });

  const profile = profileQuery.data?.profile;

  const invoicesQuery = useQuery<{ success: boolean; invoices: BuilderInvoiceListItem[] }>({
    queryKey: ["builder-invoices", profile?.id],
    queryFn: () => getBuilderInvoices(profile!.id),
    enabled: Boolean(profile?.id),
  });

  useEffect(() => {
    if (profile) {
      setFormData(toForm(profile));
      setPhoneInput(profile.phone || "");
    }
  }, [profile]);

  const refreshProfile = () => {
    queryClient.invalidateQueries({ queryKey: ["builder-profile"] });
    queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  const updateMutation = useMutation({
    mutationFn: updateBuilderProfile,
    onSuccess: () => {
      toast.success("Builder profile updated");
      refreshProfile();
      setIsEditing(false);
      setPendingPhone("");
      setPhoneOtp("");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to update builder profile");
    },
  });

  const requestPhoneOtpMutation = useMutation({
    mutationFn: requestBuilderPhoneChangeOtp,
    onSuccess: (_data, variables) => {
      setPendingPhone(variables.phone);
      setPhoneOtp("");
      toast.success("OTP sent to new phone number");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to send OTP");
    },
  });

  const verifyPhoneOtpMutation = useMutation({
    mutationFn: verifyBuilderPhoneChangeOtp,
    onSuccess: () => {
      toast.success("Phone number verified and updated");
      refreshProfile();
      setPendingPhone("");
      setPhoneOtp("");
      updateMutation.mutate(formData);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to verify OTP");
    },
  });

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleCancel = () => {
    setFormData(toForm(profile));
    setPhoneInput(profile?.phone || "");
    setPendingPhone("");
    setPhoneOtp("");
    setIsEditing(false);
  };

  const phoneChanged =
    phoneInput.trim() !== (profile?.phone || "").trim();

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (!formData.companyName.trim()) {
      toast.error("Company name is required");
      return;
    }

    if (phoneChanged) {
      if (!phoneInput.trim()) {
        toast.error("Phone number is required");
        return;
      }

      if (pendingPhone !== phoneInput.trim()) {
        requestPhoneOtpMutation.mutate({ phone: phoneInput.trim() });
        return;
      }

      if (!phoneOtp.trim()) {
        toast.error("Enter OTP to verify the new phone number");
        return;
      }

      verifyPhoneOtpMutation.mutate({
        phone: pendingPhone,
        otp: phoneOtp.trim(),
      });
      return;
    }

    updateMutation.mutate(formData);
  };

  if (profileQuery.isLoading) {
    return <BuilderAccountSettingsSkeleton />;
  }

  if (profileQuery.isError || !profile) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 p-5 text-sm text-red-700">
        Failed to load builder profile.
      </div>
    );
  }

  const avatarLabel = (profile.companyName || profile.name || "B").charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-[#DDE8E1] bg-white shadow-sm">
        <div className="border-b border-[#E6EFE9] bg-[#F4FAF6] px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#16A34A] text-xl font-semibold text-white">
                {avatarLabel}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#15803D]">
                  Builder Profile
                </p>
                <h1 className="mt-1 text-xl font-semibold text-gray-950 sm:text-2xl">
                  {profile.companyName || "Company profile"}
                </h1>
                <p className="mt-1 text-sm text-gray-600">{profile.name || "Builder account"}</p>
              </div>
            </div>

            {isEditing ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={updateMutation.isPending || requestPhoneOtpMutation.isPending || verifyPhoneOtpMutation.isPending}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                >
                  <FiX className="h-4 w-4" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={updateMutation.isPending || requestPhoneOtpMutation.isPending || verifyPhoneOtpMutation.isPending}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#16A34A] px-4 text-sm font-semibold text-white transition hover:bg-[#15803D] disabled:opacity-60"
                >
                  <FiSave className="h-4 w-4" />
                  {requestPhoneOtpMutation.isPending
                    ? "Sending OTP..."
                    : verifyPhoneOtpMutation.isPending
                      ? "Verifying..."
                      : updateMutation.isPending
                        ? "Saving..."
                        : phoneChanged && pendingPhone !== phoneInput.trim()
                          ? "Send OTP"
                          : phoneChanged
                            ? "Verify & Save"
                            : "Save Changes"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#16A34A] px-4 text-sm font-semibold text-white transition hover:bg-[#15803D]"
              >
                <FiEdit2 className="h-4 w-4" />
                Edit Profile
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-px bg-[#E6EFE9] md:grid-cols-3">
          <SummaryItem icon={FiBriefcase} label="Company" value={profile.companyName} />
          <SummaryItem icon={FiPhone} label="Phone" value={profile.phone} />
          <SummaryItem
            icon={FiMapPin}
            label="Location"
            value={[profile.locality, profile.city].filter(Boolean).join(", ")}
          />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-950">Company Details</h2>
            <p className="mt-1 text-sm text-gray-500">Primary identity shown for builder-owned projects.</p>
          </div>
          <FiBriefcase className="h-5 w-5 text-[#16A34A]" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {isEditing ? (
            <>
              <EditableField label="Builder Name" name="name" value={formData.name} onChange={handleChange} />
              <EditableField
                label="Company Name"
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
              />
            </>
          ) : (
            <>
              <ReadOnlyField label="Builder Name" value={profile.name} />
              <ReadOnlyField label="Company Name" value={profile.companyName} />
            </>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-950">Contact & Location</h2>
            <p className="mt-1 text-sm text-gray-500">Keep contact and office location details current.</p>
          </div>
          <FiMail className="h-5 w-5 text-[#16A34A]" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isEditing ? (
            <>
              <EditableField label="Email" name="email" value={formData.email} onChange={handleChange} />
              <PhoneVerificationField
                phone={phoneInput}
                oldPhone={profile.phone}
                otp={phoneOtp}
                pendingPhone={pendingPhone}
                disabled={requestPhoneOtpMutation.isPending || verifyPhoneOtpMutation.isPending}
                onPhoneChange={(value) => {
                  setPhoneInput(value);
                  if (value.trim() !== pendingPhone) {
                    setPendingPhone("");
                    setPhoneOtp("");
                  }
                }}
                onOtpChange={setPhoneOtp}
                onRequestOtp={() => {
                  if (!phoneInput.trim()) {
                    toast.error("Phone number is required");
                    return;
                  }
                  requestPhoneOtpMutation.mutate({ phone: phoneInput.trim() });
                }}
                onVerifyOtp={() => {
                  if (!pendingPhone) {
                    toast.error("Send OTP first");
                    return;
                  }
                  if (!phoneOtp.trim()) {
                    toast.error("Enter OTP");
                    return;
                  }
                  verifyPhoneOtpMutation.mutate({
                    phone: pendingPhone,
                    otp: phoneOtp.trim(),
                  });
                }}
              />
              <EditableField label="Locality" name="locality" value={formData.locality} onChange={handleChange} />
              <EditableField label="City" name="city" value={formData.city} onChange={handleChange} />
              <EditableField label="State" name="state" value={formData.state} onChange={handleChange} />
              <EditableField label="Pincode" name="pincode" value={formData.pincode} onChange={handleChange} />
            </>
          ) : (
            <>
              <ReadOnlyField label="Email" value={profile.email} />
              <ReadOnlyField label="Phone" value={profile.phone} />
              <ReadOnlyField label="Locality" value={profile.locality} />
              <ReadOnlyField label="City" value={profile.city} />
              <ReadOnlyField label="State" value={profile.state} />
              <ReadOnlyField label="Pincode" value={profile.pincode} />
            </>
          )}
        </div>

        <div className="mt-4">
          {isEditing ? (
            <TextAreaField label="Office Address" name="address" value={formData.address} onChange={handleChange} />
          ) : (
            <ReadOnlyField label="Office Address" value={profile.address} />
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-950">Invoices</h2>
            <p className="mt-1 text-sm text-gray-500">Billing records for builder plans assigned to your projects.</p>
          </div>
        </div>

        {invoicesQuery.isLoading ? (
          <InvoicesSkeleton />
        ) : invoicesQuery.isError ? (
          <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            Failed to load invoices.
          </div>
        ) : !invoicesQuery.data?.invoices?.length ? (
          <div className="rounded-md border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
            No invoices available.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-[#F4FAF6] text-left">
                  <th className="px-4 py-4 text-sm font-semibold text-gray-900">Invoice ID</th>
                  <th className="px-4 py-4 text-sm font-semibold text-gray-900">Project Code</th>
                  <th className="px-4 py-4 text-sm font-semibold text-gray-900">Service/Plan</th>
                  <th className="px-4 py-4 text-sm font-semibold text-gray-900">Activated</th>
                  <th className="px-4 py-4 text-sm font-semibold text-gray-900">Validity</th>
                  <th className="px-4 py-4 text-sm font-semibold text-gray-900">Total Amount</th>
                  <th className="px-4 py-4 text-sm font-semibold text-gray-900">Offer Applied</th>
                  <th className="px-4 py-4 text-sm font-semibold text-gray-900">Paid Amount</th>
                  <th className="px-4 py-4 text-sm font-semibold text-gray-900">Payment Status</th>
                  <th className="px-4 py-4 text-sm font-semibold text-gray-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoicesQuery.data.invoices.map((invoice) => (
                  <tr key={invoice._id} className="border-b border-gray-100">
                    <td className="px-4 py-4 text-sm text-gray-700">{invoice.invoiceNumber || "-"}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{getProjectCode(invoice)}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{invoice.servicePlanName || "-"}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{formatCompactDate(invoice.startDate || invoice.invoiceDate)}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{formatCompactDate(invoice.endDate)}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{formatCurrency(invoice.totalAmount)}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{formatOffer(invoice)}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{formatCurrency(invoice.paidAmount)}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{formatStatus(invoice.paymentStatus)}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      <button
                        type="button"
                        onClick={() =>
                          downloadBuilderInvoicePdf(invoice._id, invoice.invoiceNumber).catch(
                            (error: any) => {
                              toast.error(
                                error?.response?.data?.message ||
                                  "Failed to download invoice PDF",
                              );
                            },
                          )
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-700 transition hover:bg-gray-100"
                        aria-label={`Download ${invoice.invoiceNumber || "invoice"}`}
                      >
                        <FiDownload className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded-md bg-gray-200/80 ${className}`}
    />
  );
}

function BuilderAccountSettingsSkeleton() {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-[#DDE8E1] bg-white shadow-sm">
        <div className="border-b border-[#E6EFE9] bg-[#F4FAF6] px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <SkeletonBlock className="h-14 w-14 shrink-0 rounded-full" />
              <div className="min-w-0">
                <SkeletonBlock className="h-3 w-28" />
                <SkeletonBlock className="mt-2 h-7 w-56" />
                <SkeletonBlock className="mt-2 h-4 w-36" />
              </div>
            </div>
            <SkeletonBlock className="h-10 w-32" />
          </div>
        </div>

        <div className="grid gap-px bg-[#E6EFE9] md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="bg-white px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-9 w-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <SkeletonBlock className="h-3 w-20" />
                  <SkeletonBlock className="mt-2 h-4 w-32" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ProfileSectionSkeleton titleWidth="w-36" descriptionWidth="w-72" fields={2} />
      <ProfileSectionSkeleton titleWidth="w-40" descriptionWidth="w-80" fields={6} hasAddress />

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-5">
          <SkeletonBlock className="h-5 w-24" />
          <SkeletonBlock className="mt-2 h-4 w-80 max-w-full" />
        </div>
        <InvoicesSkeleton />
      </section>
    </div>
  );
}

function ProfileSectionSkeleton({
  titleWidth,
  descriptionWidth,
  fields,
  hasAddress = false,
}: {
  titleWidth: string;
  descriptionWidth: string;
  fields: number;
  hasAddress?: boolean;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className={`h-5 ${titleWidth}`} />
          <SkeletonBlock className={`mt-2 h-4 max-w-full ${descriptionWidth}`} />
        </div>
        <SkeletonBlock className="h-5 w-5" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: fields }).map((_, index) => (
          <div key={index}>
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-2 h-6 w-full" />
          </div>
        ))}
      </div>

      {hasAddress ? (
        <div className="mt-4">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="mt-2 h-16 w-full" />
        </div>
      ) : null}
    </section>
  );
}

function InvoicesSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr className="bg-[#F4FAF6] text-left">
            {Array.from({ length: 10 }).map((_, index) => (
              <th key={index} className="px-4 py-4">
                <SkeletonBlock className="h-4 w-24" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <tr key={rowIndex} className="border-b border-gray-100">
              {Array.from({ length: 10 }).map((_, columnIndex) => (
                <td key={columnIndex} className="px-4 py-4">
                  <SkeletonBlock
                    className={`h-4 ${
                      columnIndex === 9
                        ? "w-8"
                        : columnIndex % 3 === 0
                          ? "w-28"
                          : columnIndex % 3 === 1
                            ? "w-20"
                            : "w-24"
                    }`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCompactDate(value?: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function formatCurrency(value?: number) {
  if (typeof value !== "number") return "-";
  return `${value.toLocaleString("en-IN")}/-`;
}

function formatOffer(invoice: BuilderInvoiceListItem) {
  const discountValue = invoice.discountValue;
  const discountAmount = invoice.discountAmount;
  const totalAmount = invoice.totalAmount;

  if (
    typeof discountValue !== "number" &&
    typeof discountAmount !== "number"
  ) {
    return "No Offer";
  }

  if (typeof discountValue === "number" && discountValue > 0) {
    if (invoice.discountType === "percentage") {
      return `${discountValue}% OFF`;
    }

    if (
      typeof discountAmount === "number" &&
      discountAmount > 0 &&
      typeof totalAmount === "number" &&
      totalAmount > 0
    ) {
      const baseAmount = totalAmount + discountAmount;
      const derivedPercentage = Math.round((discountAmount / baseAmount) * 100);

      if (derivedPercentage > 0) {
        return `${derivedPercentage}% OFF`;
      }
    }
  }

  if (
    typeof discountAmount === "number" &&
    discountAmount > 0 &&
    typeof totalAmount === "number" &&
    totalAmount > 0
  ) {
    const baseAmount = totalAmount + discountAmount;
    const derivedPercentage = Math.round((discountAmount / baseAmount) * 100);

    if (derivedPercentage > 0) {
      return `${derivedPercentage}% OFF`;
    }
  }

  if (typeof discountValue === "number" && discountValue > 0) {
    return `${discountValue.toLocaleString("en-IN")}/- OFF`;
  }

  if (typeof discountAmount === "number" && discountAmount > 0) {
    return `${discountAmount.toLocaleString("en-IN")}/- OFF`;
  }

  return "No Offer";
}

function formatStatus(value?: string) {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getProjectCode(invoice: BuilderInvoiceListItem) {
  if (invoice.projectCode) return invoice.projectCode;

  if (invoice.propertyId && typeof invoice.propertyId === "object") {
    return invoice.propertyId.propertyCode || "-";
  }

  return "-";
}

function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="bg-white px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-green-50 text-[#16A34A]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
          <p className="mt-1 truncate text-sm font-medium text-gray-900">{value || "Not set"}</p>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
      <p className="mt-1 min-h-6 text-sm font-medium text-gray-900">{value || "Not set"}</p>
    </div>
  );
}

function EditableField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-gray-500">{label}</span>
      <input
        name={name}
        value={value}
        onChange={onChange}
        className="mt-2 h-11 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 outline-none transition focus:border-[#16A34A] focus:ring-2 focus:ring-green-100"
      />
    </label>
  );
}

function PhoneVerificationField({
  phone,
  oldPhone,
  otp,
  pendingPhone,
  disabled,
  onPhoneChange,
  onOtpChange,
  onRequestOtp,
  onVerifyOtp,
}: {
  phone: string;
  oldPhone?: string | null;
  otp: string;
  pendingPhone: string;
  disabled?: boolean;
  onPhoneChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onRequestOtp: () => void;
  onVerifyOtp: () => void;
}) {
  const phoneChanged = phone.trim() !== (oldPhone || "").trim();

  return (
    <div className="md:col-span-2 xl:col-span-1">
      <label className="block">
        <span className="text-xs font-semibold uppercase text-gray-500">Phone</span>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={phone}
            onChange={(event) => onPhoneChange(event.target.value)}
            className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 outline-none transition focus:border-[#16A34A] focus:ring-2 focus:ring-green-100"
          />
          {phoneChanged && (
            <button
              type="button"
              onClick={onRequestOtp}
              disabled={disabled}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-[#16A34A] px-3 text-sm font-semibold text-[#15803D] transition hover:bg-green-50 disabled:opacity-60"
            >
              {pendingPhone === phone.trim() ? "Resend OTP" : "Send OTP"}
            </button>
          )}
        </div>
      </label>

      {phoneChanged && pendingPhone === phone.trim() && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={otp}
            onChange={(event) =>
              onOtpChange(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            placeholder="Enter OTP"
            className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 outline-none transition focus:border-[#16A34A] focus:ring-2 focus:ring-green-100"
          />
          <button
            type="button"
            onClick={onVerifyOtp}
            disabled={disabled}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-[#16A34A] px-3 text-sm font-semibold text-white transition hover:bg-[#15803D] disabled:opacity-60"
          >
            Verify
          </button>
        </div>
      )}

      {phoneChanged && (
        <p className="mt-2 text-xs text-gray-500">
          Current phone stays unchanged until the new number is verified.
        </p>
      )}
    </div>
  );
}

function TextAreaField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-gray-500">{label}</span>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        rows={4}
        className="mt-2 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#16A34A] focus:ring-2 focus:ring-green-100"
      />
    </label>
  );
}
