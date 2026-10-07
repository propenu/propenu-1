import { createAsyncThunk } from "@reduxjs/toolkit";

import { getFileStoreFiles, clearFileStore } from "@/utilies/fileStore";

import {
  createDraftApi,
  getPropertyByIdApi,
  finalizeApi,
  getMyDraftApi,
  updateBasicApi,
  updateDetailsApi,
  updateLocationApi,
} from "../apis";

const TEXT_FIELD_LIMIT = 900 * 1024;

const formText = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === "string") {
    if (value.startsWith("data:") || value.length > TEXT_FIELD_LIMIT) return null;
    return value;
  }
  if (typeof File !== "undefined" && value instanceof File) return null;
  if (typeof Blob !== "undefined" && value instanceof Blob) return null;
  if (Array.isArray(value) || typeof value === "object") {
    const json = JSON.stringify(value, (_key, nested) => {
      if (typeof nested !== "string") return nested;
      if (
        nested.startsWith("data:") ||
        nested.startsWith("blob:") ||
        nested.length > TEXT_FIELD_LIMIT
      ) {
        return undefined;
      }
      return nested;
    });
    if (!json || json === "{}" || json === "[]" || json.length > TEXT_FIELD_LIMIT) {
      return null;
    }
    return json;
  }
  return String(value);
};

const normalizeListingTypeForSubmit = (listingType: any) => {
  const normalized = String(listingType ?? "").trim().toLowerCase();
  if (normalized === "rent" || normalized === "lease") return "rent";
  if (normalized === "sale" || normalized === "buy") return "sale";
  return undefined;
};

/* =========================================================
   CREATE DRAFT
========================================================= */

export const createDraftThunk = createAsyncThunk(
  "postProperty/createDraft",
  async (
    arg: string | { category: string; listingType?: string },
  ) => {
    const category = typeof arg === "string" ? arg : arg.category;
    const listingType = typeof arg === "string" ? undefined : arg.listingType;
    return await createDraftApi(category, { listingType });
  },
);

export const getMyDraftThunk = createAsyncThunk(
  "postProperty/getMyDraft",
  async (
    arg: string | { category: string; id?: string; startStep?: number },
    { rejectWithValue },
  ) => {
    try {
      const category = typeof arg === "string" ? arg : arg.category;
      const id = typeof arg === "string" ? undefined : arg.id;

      if (id) {
        return await getPropertyByIdApi(category, id);
      }

      return await getMyDraftApi(category);
    } catch (err: any) {
      return rejectWithValue(err);
    }
  },
);
/* =========================================================
   BASIC
========================================================= */

export const submitBasicThunk = createAsyncThunk(
  "postProperty/basic",
  async ({ category, id, data }: any) => {
    return await updateBasicApi(category, id, data);
  },
);

/* =========================================================
   LOCATION
========================================================= */

export const submitLocationThunk = createAsyncThunk(
  "postProperty/location",
  async ({ category, id, data }: any) => {
    return await updateLocationApi(category, id, data);
  },
);

/* =========================================================
   DETAILS (with images + amenities fix)
========================================================= */

export const submitDetailsThunk = createAsyncThunk(
  "postProperty/details",
  async ({ category, id, payload }: any) => {
    const files = getFileStoreFiles("postProperty");
    const {
      verificationDocuments: _verificationDocuments,
      verificationDocument: _verificationDocument,
      _id: _id,
      __v: _version,
      createdBy: _createdBy,
      updatedBy: _updatedBy,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      status: _status,
      approval: _approval,
      completion: _completion,
      isPublished: _isPublished,
      slug: _slug,
      listingSource: _listingSource,
      promotion: _promotion,
      meta: _meta,
      ...detailsPayload
    } = payload ?? {};

    const safePayload = {
      ...detailsPayload,
      listingType: normalizeListingTypeForSubmit(detailsPayload.listingType),
      totalArea: detailsPayload.totalArea
        ? {
            value: Number(detailsPayload.totalArea.value),
            unit: detailsPayload.totalArea.unit,
          }
        : undefined,
      roadWidth: detailsPayload.roadWidth
        ? {
            value: Number(detailsPayload.roadWidth.value),
            unit: detailsPayload.roadWidth.unit,
          }
        : undefined,
      amenities: Array.isArray(detailsPayload?.amenities)
        ? detailsPayload.amenities.map((a: any) => ({
            title: typeof a === "string" ? a.trim() : String(a.title).trim(),
          }))
        : [],
    };

    const formData = new FormData();

    Object.entries(safePayload).forEach(([key, value]: any) => {
      if (value === undefined || value === null) return;

      if (key === "description" && typeof value === "string") {
        const description = value.slice(0, 500);
        if (description) formData.append(key, description);
        return;
      }

      if (key === "relationshipManagerId" || key === "createdBy") {
        const id =
          value && typeof value === "object"
            ? value._id || value.userId || value.id
            : value;
        if (id) formData.append(key, String(id));
        return;
      }

      const text =
        Array.isArray(value) || typeof value === "object"
          ? formText(value)
          : formText(String(value));
      if (text) formData.append(key, text);
    });

    const hasFiles = Array.isArray(files) && files.length > 0;

    if (hasFiles) {
      files.forEach((file) => {
        formData.append("galleryFiles", file);
      });
    }

    for (let pair of formData.entries()) {
    }

    const response = await updateDetailsApi(category, id, formData);

    if (hasFiles) {
      clearFileStore("postProperty");
    }

    return response;
  },
);

export const submitVerificationThunk = createAsyncThunk(
  "postProperty/verification",
  async ({ category, id, payload }: any, { rejectWithValue }) => {
    try {
      return await finalizeApi(category, id, payload);
    } catch (err: any) {
     
      const errorPayload = {
      code: err?.code || err?.response?.data?.code,      
      message: err?.message || err?.response?.data?.message || "Verification failed",};


      return rejectWithValue(errorPayload);
    }
  },
);

