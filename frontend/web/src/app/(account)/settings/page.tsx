"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { me, getMembershipHistory, updateUser } from "@/data/ClientData";
import { HiOutlineDownload } from "react-icons/hi";
import { toast } from "sonner";

type InfoFieldProps = {
  label: string;
  value?: string | number | null;
};

type FormData = {
  name: string;
  email: string;
  locality?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

const SettingsPage = () => {
  const queryClient = useQueryClient();

  /* -------------------- User Profile -------------------- */
  const {
    data: user,
    isLoading: userLoading,
    isError: userError,
  } = useQuery({
    queryKey: ["me"],
    queryFn: me,
  });

  /* -------------------- Membership History -------------------- */
  const {
    data: membership,
    isLoading: membershipLoading,
    isError: membershipError,
  } = useQuery({
    queryKey: ["membershipHistory"],
    queryFn: getMembershipHistory,
  });

  /* -------------------- Update User -------------------- */
  const updateProfileMutation = useMutation({
    mutationFn: (data: Partial<FormData>) => updateUser(data),
    onSuccess: () => {
      toast.success("Profile updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["me"] });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || "Failed to update profile.",
      );
    },
  });

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    locality: "",
    city: "",
    state: "",
    pincode: "",
  });

  useEffect(() => {
    if (user?.user) {
      setFormData({
        name: user.user.name || "",
        email: user.user.email || "",
        locality: user.user.locality || "",
        city: user.user.city || "",
        state: user.user.state || "",
        pincode: user.user.pincode || "",
      });
    }
  }, [user]);

  /* -------------------- Loading -------------------- */
  if (userLoading || membershipLoading) {
    return (
      <div className="p-6 text-center text-gray-500">Loading profile...</div>
    );
  }

  /* -------------------- Error -------------------- */
  if (userError || membershipError || !user) {
    return (
      <div className="p-6 text-center text-red-500">
        Failed to load user profile
      </div>
    );
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditStart = () => {
    setFormData({
      name: user?.user?.name || "",
      email: user?.user?.email || "",
      locality: user?.user?.locality || "",
      city: user?.user?.city || "",
      state: user?.user?.state || "",
      pincode: user?.user?.pincode || "",
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateProfileMutation.mutate(formData);
  };

  
  /* -------------------- Success -------------------- */
  return (
    <div className="sm:p-4 md:p-1 lg:p-0 font-sans text-[#4A4A4A]">
      <div className="max-w-5xl space-y-6">
        <div className="rounded-2xl border border-green-100 bg-linear-to-r from-green-50 via-white to-emerald-50 px-5 py-6">
          <h1 className="text-2xl font-semibold text-gray-900 md:text-3xl">
            Account Settings
          </h1>
          <p className="mt-2 text-sm text-gray-600 md:text-base">
            Update your profile details, review your membership history, and
            keep your account information up to date.
          </p>
        </div>

        {/* Profile Card */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Avatar */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-green-600 flex items-center justify-center text-white text-lg sm:text-xl font-semibold shrink-0">
              {user?.user?.name?.charAt(0).toUpperCase()}
            </div>

            {/* Name + Role */}
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-800 wrap-break-word">
                {user.user.name}
              </h2>

              <p className="text-gray-400 text-sm capitalize">
                {user.user.roleName}
              </p>
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <div className="space-y-3">
          <div className="px-1 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <h3 className="text-lg font-medium text-[#545454]">
              Personal information
            </h3>
            {!isEditing && (
              <button
                onClick={handleEditStart}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                Edit
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-6 md:p-8">
            {isEditing ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-6 sm:gap-y-8 gap-x-6 sm:gap-x-12">
                  <EditableField
                    label="Name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                  />
                  <EditableField
                    label="Email Address"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                  />
                  <InfoField label="Phone Number" value={user.user.phone} />
                  <EditableField
                    label="Locality"
                    name="locality"
                    value={formData.locality}
                    onChange={handleInputChange}
                  />
                  <EditableField
                    label="City"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                  />
                  <EditableField
                    label="State"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                  />
                  <EditableField
                    label="Pincode"
                    name="pincode"
                    value={formData.pincode}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:gap-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="w-full sm:w-auto px-6 py-2 rounded-lg font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={updateProfileMutation.isPending}
                    className="w-full sm:w-auto px-6 py-2 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:bg-gray-400"
                  >
                    {updateProfileMutation.isPending ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-6 sm:gap-y-8 gap-x-6 sm:gap-x-12">
                <InfoField label="Name" value={user.user.name} />
                <InfoField label="Email Address" value={user.user.email} />
                <InfoField label="Phone Number" value={user.user.phone} />
                <InfoField label="Locality" value={user.user.locality} />
                <InfoField label="City" value={user.user.city} />
                <InfoField label="State" value={user.user.state} />
                <InfoField label="Pincode" value={user.user.pincode} />
              </div>
            )}
          </div>
        </div>

        {membership?.history?.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-lg font-medium text-[#545454]">
                Membership History
              </h3>
            </div>

            <div className="space-y-3 md:hidden">
              {membership.history.map((item: any, index: number) => (
                <div
                  key={index}
                  className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm space-y-3"
                >
                  <div>
                    <p className="font-semibold text-gray-800 leading-none">
                      {item.planName}
                    </p>
                    <p className="text-xs text-gray-400 mt-1 capitalize">
                      {item.planCode?.replace(/_/g, " ").toLowerCase()}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">
                        Category
                      </p>
                      <p className="text-gray-700 capitalize">
                        {item.category}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">
                        Price
                      </p>
                      <p className="text-gray-700 font-medium">₹{item.price}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">
                        Duration
                      </p>
                      <p className="text-gray-700">
                        {formatDate(item.startDate)} to{" "}
                        {formatDate(item.endDate)}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">
                        Status
                      </p>
                      <div className="mt-1">
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                  </div>
                  <div className="pt-1">
                    {item.invoiceUrl ? (
                      <a
                        href={item.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-[#27AE60] hover:text-white"
                      >
                        <HiOutlineDownload size={14} />
                        Download Invoice
                      </a>
                    ) : (
                      <span className="text-xs italic text-gray-400">
                        No invoice available
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-100 shadow-sm bg-white">
              <table className="w-full min-w-[900px] text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-sm font-semibold text-gray-400">
                      Plan
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-400">
                      Category
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-400">
                      Duration
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-400">
                      Price
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-400">
                      Status
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-400">
                      Invoice
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {membership.history.map((item: any, index: number) => (
                    <tr
                      key={index}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <p className="font-semibold text-gray-800 leading-none">
                            {item.planName}
                          </p>
                          <p className="text-xs text-gray-400 mt-1 capitalize">
                            {item.planCode?.replace(/_/g, " ").toLowerCase()}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 capitalize">
                        {item.category}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="flex flex-col">
                          <span>{formatDate(item.startDate)}</span>
                          <span className="text-xs text-gray-400">
                            to {formatDate(item.endDate)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-700 whitespace-nowrap">
                        ₹{item.price}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-6 py-4">
                        {item.invoiceUrl ? (
                          <a
                            href={item.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-[#27AE60] hover:text-white whitespace-nowrap"
                          >
                            <HiOutlineDownload size={14} />
                            Download Invoice
                          </a>
                        ) : (
                          <span className="text-xs italic text-gray-400">
                            No invoice available
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const InfoField = ({ label, value }: InfoFieldProps) => (
  <div className="flex flex-col gap-1">
    <p className="text-[12px] tracking-wider text-gray-400">{label}</p>
    <p className="text-gray-800 font-medium text-sm">{value || "—"}</p>
  </div>
);

const EditableField = ({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-[12px] tracking-wider text-gray-400">{label}</label>
    <input
      type="text"
      name={name}
      value={value ?? ""}
      onChange={onChange}
      className="text-gray-800 font-medium text-sm p-2 border border-gray-200 rounded-md focus:ring-green-500 focus:border-green-500 transition"
    />
  </div>
);

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const StatusBadge = ({ status }: { status: string }) => {
  const isActive = status === "active";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold
    ${
      isActive ? "bg-[#E9F9EF] text-[#1E7F4B]" : "bg-[#EBEDEF] text-[#7F8C8D]"
    }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full
      ${isActive ? "bg-[#27AE60]" : "bg-[#95A5A6]"}`}
      />
      {isActive ? "Active" : "Expired"}
    </span>
  );
};

export default SettingsPage;
