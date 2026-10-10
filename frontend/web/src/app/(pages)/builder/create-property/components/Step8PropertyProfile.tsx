"use client";

import React from "react";
import { ICreatePropertyFormState } from "../types";
import InputField from "@/ui/InputField";

interface Step8PropertyProfileProps {
  data: ICreatePropertyFormState;
  onUpdate: <K extends keyof ICreatePropertyFormState>(
    field: K,
    value: ICreatePropertyFormState[K]
  ) => void;
  errors: string[];
}

export const Step8PropertyProfile: React.FC<Step8PropertyProfileProps> = ({
  data,
  onUpdate,
  errors = [],
}) => {
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Property Profile</h2>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <ul className="list-disc list-inside text-sm text-red-700">
            {errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Project Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InputField
          label="Total Units"
          type="number"
          required
          placeholder="e.g., 250"
          value={data.totalUnits ?? ""}
          onChange={(v) => onUpdate("totalUnits", Number(v) || 0)}
        />

        <InputField
          label="Available Units (Optional)"
          type="number"
          placeholder="e.g., 45"
          value={data.availableUnits ?? ""}
          onChange={(v) => onUpdate("availableUnits", Number(v) || 0)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InputField
          label="Total Towers (Optional)"
          type="number"
          placeholder="e.g., 5"
          value={data.totalTowers ?? ""}
          onChange={(v) => onUpdate("totalTowers", Number(v) || 0)}
        />

        <InputField
          label="Total Floors (Optional)"
          placeholder="e.g., 30"
          value={data.totalFloors ?? ""}
          onChange={(v) => onUpdate("totalFloors", v)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InputField
          label="Project Area (Optional)"
          type="number"
          placeholder="In acres / sq ft"
          value={data.projectArea ?? ""}
          onChange={(v) => onUpdate("projectArea", Number(v) || 0)}
        />

        <InputField
          label="Possession Date"
          required
          placeholder="e.g., Q4 2025"
          value={data.possessionDate ?? ""}
          onChange={(v) => onUpdate("possessionDate", v)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InputField
          label="Launch Date (Optional)"
          placeholder="e.g., Q1 2024"
          value={data.launchDate ?? ""}
          onChange={(v) => onUpdate("launchDate", v)}
        />
      </div>

      {/* Status */}
      {/* Status & RERA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status */}
        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Status
          </label>
          <select
            value={data.status ?? "active"}
            onChange={(e) => onUpdate("status", e.target.value as any)}
            className="
        w-full px-3 py-2 border rounded-md text-sm
        border-gray-300 bg-white
        focus:outline-none focus:ring-2
        focus:ring-green-500 focus:border-green-500
      "
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* RERA Number */}
        <InputField
          label="RERA Number (Optional)"
          value={data.reraNumber ?? ""}
          onChange={(v) => onUpdate("reraNumber", v)}
          placeholder="e.g., RERA/2024/123"
        />
      </div>

      {/* Featured */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="featured"
          checked={data.isFeatured ?? false}
          onChange={(e) => onUpdate("isFeatured", e.target.checked)}
          className="h-4 w-4 rounded"
        />
        <label htmlFor="featured" className="text-sm font-medium">
          Mark as Featured Project
        </label>
      </div>

      {/* Rank */}
      {data.isFeatured && (
        <InputField
          label="Ranking (1–10)"
          type="number"
          value={data.rank ?? 1}
          onChange={(v) => onUpdate("rank", Number(v) || 1)}
        />
      )}
    </div>
  );
};
