// services/property.service.ts

import { IFeaturedProject } from "@/app/(pages)/builder/create-property/types";
import { ProjectLeadPayload } from "@/app/(pages)/prime/[slug]/Herosection";
import {
  ApiResponse,
  createRequestOtpPayload,
  createVerifyOtpPayload,
  PublicPropertyLeadResponse,
  RequestOtpPayload,
  VerifyOtpPayload,
  VerifyOtpResponse,
  VerifyPublicPropertyLeadOtpResponse,
} from "@/types/property";
import { SearchFilterParams } from "@/types/sharedTypes";
import axiosInstance from "@/utilies/axiosInstance";
import axios from "axios";
import Cookies from "js-cookie";

const url = process.env.NEXT_PUBLIC_API_URL;

const getTokenPayload = () => {
  const token = Cookies.get("token");
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1] ?? ""));
  } catch {
    return null;
  }
};

const filterAssignedBuilderProjects = <T extends { _id?: string }>(response: any) => {
  const payload = getTokenPayload();
  const roleName = payload?.roleName;
  const assignedProjectIds = payload?.builderAccess?.projectIds;
  if (
    roleName !== "builder_staff" ||
    !Array.isArray(assignedProjectIds) ||
    assignedProjectIds.includes("*")
  ) {
    return response;
  }

  const allowed = new Set(assignedProjectIds.map(String));
  const filterProjects = (projects: T[]) =>
    projects.filter((project) => project?._id && allowed.has(String(project._id)));
  if (Array.isArray(response)) {
    return filterProjects(response);
  }
  if (Array.isArray(response?.data)) {
    return {
      ...response,
      data: filterProjects(response.data),
    };
  }
  return response;
};

export async function getFeaturedProjects(params?: {
  state?: string;
  city?: string;
}) {
  const query = new URLSearchParams();
  if (params?.state) query.append("state", params.state);
  if (params?.city) query.append("city", params.city);

  const res = await fetch(
`${url}/api/properties/featured-project?type=prime&${query.toString()}`,
    { cache: "no-store" }, // for dynamic search
  );

  if (!res.ok) {
    throw new Error("Failed to fetch featured projects");
  }
  return res.json();
}

export type PrimeDisplayMode = "ranked" | "shuffle";

export async function getPrimeDisplaySettings(): Promise<{
  displayMode: PrimeDisplayMode;
}> {
  const res = await fetch(`${url}/api/properties/site-branding/prime-display`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch prime display settings");
  }

  const json = await res.json();
  const displayMode = json?.data?.displayMode === "shuffle" ? "shuffle" : "ranked";
  return { displayMode };
}

export type NewProjectSearchParams = {
  q?: string;
  city?: string;
  state?: string;
  locality?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  bhk?: string;
  rera?: boolean;
  possession?: string;
  builder?: string;
  propertyType?: string;
  minSqft?: string;
  maxSqft?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export async function searchNewProjects(params: NewProjectSearchParams = {}) {
  const query = new URLSearchParams();
  query.set("view", "card");
  query.set("status", "active");
  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 12));

  if (params.q) query.set("q", params.q);
  if (params.city) query.set("city", params.city);
  if (params.state) query.set("state", params.state);
  if (params.locality) query.set("locality", params.locality);
  if (params.category) query.set("category", params.category);
  if (params.minPrice) query.set("minPrice", params.minPrice);
  if (params.maxPrice) query.set("maxPrice", params.maxPrice);
  if (params.bhk) query.set("bhk", params.bhk);
  if (params.rera) query.set("rera", "1");
  if (params.possession) query.set("possession", params.possession);
  if (params.builder) query.set("builder", params.builder);
  if (params.propertyType) query.set("propertyType", params.propertyType);
  if (params.minSqft) query.set("minSqft", params.minSqft);
  if (params.maxSqft) query.set("maxSqft", params.maxSqft);
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortOrder) query.set("sortOrder", params.sortOrder);

  const res = await fetch(
    `${url}/api/properties/featured-project?${query.toString()}`,
    { cache: "no-store" },
  );

  if (!res.ok) {
    throw new Error("Failed to search projects");
  }

  return res.json();
}

//highlight projects
export async function getHighlightProjects(params?: {
  state?: string;
  city?: string;
  locality?: string;
}) {
  const query = new URLSearchParams();
  query.append("type", "featured");
  if (params?.state) query.append("state", params.state);
  if (params?.city) query.append("city", params.city);
  if (params?.locality) query.append("locality", params.locality);

  const res = await fetch(
    `${url}/api/properties/featured-project?${query.toString()}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error("Failed to fetch highlight projects");
  }
  return res.json();
}


// export async function getAllAgentConnect(){
//   const res = await fetch(`${url}/api/users/agent`, {next : { revalidate: 10}});
//   if(!res.ok) {
//       throw new Error('Failed to fetch Agent Connect data');
//   }
//   return res.json();
// }


export async function getOwnerProperties(params?: {
  state?: string;
  city?: string;
}) {
  const query = new URLSearchParams();

  if (params?.state) query.append("state", params.state);
  if (params?.city) query.append("city", params.city);

  const res = await fetch(
    `${url}/api/properties/owners-properties?${query.toString()}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error("Failed to fetch popular Owner Properties");
  }
  return res.json();
}

export async function getAgentConnect(params?: { city?: string; locality?: string }) {
  const query = new URLSearchParams();

  if (params?.city) query.append("city", params.city);
  if (params?.locality) query.append("locality", params.locality);

  const res = await fetch(`${url}/api/users/agent/city?${query.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Failed to fetch Agent Connect data");
  }
  return res.json();
}

export type BlogListParams = {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  tag?: string;
  published?: boolean;
  featured?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

export async function getBlogs(params: BlogListParams = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.append(key, String(value));
    }
  });

  const res = await fetch(`${url}/api/properties/blogs?${query.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch blogs");
  }

  return res.json();
}

export const searchFilter = async (params: SearchFilterParams) => {
  const res = await axiosInstance.get<ApiResponse>(
    `${url}/api/properties/search`,
    { params },
  );
  return res.data;
};

export const getSponsored = async (params?: Record<string, unknown>) => {
  const res = await axiosInstance.get(
    `${url}/api/properties/sponsored`,
    { params }
  );
  return filterAssignedBuilderProjects(res.data);
};


export const requestOtp = async (payload: RequestOtpPayload) => {
  const res = await axiosInstance.post<RequestOtpPayload>(
    `${url}/api/users/auth/request-otp`,
    payload,
  );
  return res.data;
};

export const unsubscribeFromEmail = async (payload: { email?: string; phone?: string }) => {
  const res = await axiosInstance.post<{ message: string }>(
    `${url}/api/users/unsubscribe-email`,
    payload,
  );
  return res.data;
};

export const verifyOtp = async (payload: VerifyOtpPayload) => {
  const res = await axiosInstance.post<VerifyOtpResponse>(
    `${url}/api/users/auth/verify-otp`,
    payload,
  );

  return res.data; // this is now VerifyOtpResponse
};

export const createRequestOtp = async (payload: createRequestOtpPayload) => {
  const res = await axiosInstance.post<createRequestOtpPayload>(
    `${url}/api/users/auth/request-otp/create`,
    payload,
  );
  return res.data;
};

export const createVerifyOtp = async (
  payload: createVerifyOtpPayload,
): Promise<VerifyOtpResponse> => {
  const res = await axiosInstance.post<VerifyOtpResponse>(
    `${url}/api/users/auth/verify-otp/create`,
    payload,
  );
  return res.data;
};

export const me = async () => {
  const token = Cookies.get("token");
  if (!token) return null;

  const res = await axiosInstance.get(`${url}/api/users/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
};

export const updateUser = async (payload: {
  name?: string;
  companyName?: string;
  email?: string;
  address?: string;
  locality?: string;
  city?: string;
  state?: string;
  pincode?: string;
}) => {
  const token = Cookies.get("token");
  if (!token) return null;

  const cleanedPayload = Object.entries(payload).reduce<Record<string, string>>(
    (result, [key, value]) => {
      if (typeof value !== "string") return result;

      const cleaned = value.trim();
      if (key !== "name" && cleaned === "") return result;

      result[key] = cleaned;
      return result;
    },
    {},
  );

  const res = await axiosInstance.patch(`${url}/api/users/auth/me/update`, cleanedPayload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
};

export type HomeLoanApplicationPayload = {
  fullName: string;
  mobileNumber: string;
  email?: string;
  source?: string;
  pageUrl?: string;
  metadata?: Record<string, unknown>;
};

export const createHomeLoanApplication = async (
  payload: HomeLoanApplicationPayload,
) => {
  const token = Cookies.get("token");
  const res = await axiosInstance.post(
    "/properties/home-loans/applications",
    payload,
    token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined,
  );

  return res.data;
};

export type AdminUserProfilePayload = {
  name?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  phoneOtp?: string;
  address?: string;
  locality?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

export const getAllUsers = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/auth/all-users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
};

export const searchUsers = async (params: { q?: string; role?: string }) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/auth/search`, {
    params,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
};

export const updateUserProfileById = async (
  userId: string,
  payload: AdminUserProfilePayload,
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.patch(
    `${url}/api/users/auth/${userId}/profile`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.data;
};

export const requestAdminUserPhoneChangeOtp = async (
  userId: string,
  payload: { phone: string },
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.post(
    `${url}/api/users/auth/${userId}/profile/phone/request-otp`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.data;
};

export type BuilderProfilePayload = {
  name?: string;
  companyName?: string;
  email?: string;
  address?: string;
  locality?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

export type BuilderPhoneOtpPayload = {
  phone: string;
};

export type BuilderPhoneVerifyPayload = {
  phone: string;
  otp: string;
};

export type BuilderInvoiceListItem = {
  _id: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  startDate?: string;
  endDate?: string;
  propertyTitle?: string;
  projectCode?: string;
  propertyId?:
    | string
    | {
        _id?: string;
        propertyCode?: string;
        title?: string;
      };
  servicePlanName?: string;
  totalAmount?: number;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  paidAmount?: number;
  paymentStatus?: string;
};

export const getBuilderProfile = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/builder/profile`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
};

export const getBuilderInvoices = async (userId: string) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/payments/builder-invoices`, {
    params: { userId },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data as { success: boolean; invoices: BuilderInvoiceListItem[] };
};

export const downloadBuilderInvoicePdf = async (
  invoiceId: string,
  invoiceNumber?: string,
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(
    `${url}/api/payments/builder-invoices/${invoiceId}/pdf`,
    {
      responseType: "blob",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `${invoiceNumber || "builder-invoice"}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

export const updateBuilderProfile = async (payload: BuilderProfilePayload) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.patch(
    `${url}/api/users/builder/profile`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.data;
};

export const requestBuilderPhoneChangeOtp = async (
  payload: BuilderPhoneOtpPayload,
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.post(
    `${url}/api/users/builder/profile/phone/request-otp`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.data;
};

export const verifyBuilderPhoneChangeOtp = async (
  payload: BuilderPhoneVerifyPayload,
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.post(
    `${url}/api/users/builder/profile/phone/verify-otp`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.data;
};

export const getBuilderProfileById = async (builderId: string) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(
    `${url}/api/users/builder/profile/${builderId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.data;
};

export const updateBuilderProfileById = async (
  builderId: string,
  payload: BuilderProfilePayload,
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.patch(
    `${url}/api/users/builder/profile/${builderId}`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.data;
};

export const deleteMyAccount = async (payload: {
  reason?: string;
  feedback?: string;
}) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.delete(`${url}/api/users/auth/me`, {
    data: payload,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};

export const getShortlistedProperties = async () => {
  const token = Cookies.get("token");
  if (!token) return null;

  const res = await axiosInstance.get(`${url}/api/users/shortlist`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
};

export const getUserShortlist = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/shortlist`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const getShortlistStatus = async (propertyId: string) => {
  const token = Cookies.get("token");
  const res = await axiosInstance.get(`${url}/api/users/shortlist/status`, {
    params: { propertyId }, // This sends ?propertyId=...
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data; 
};


export const postShortlistProperty = async (payload: {
  propertyId: string;
  propertyType: string;
}) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.post(`${url}/api/users/shortlist`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};
export const removeShortlistProperty = async (propertyId: string) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.delete(
    `${url}/api/users/shortlist/${propertyId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return res.data;
};

export const getMyProperties = async () => {
  const token = Cookies.get("token");
  if (!token) return null;

  const res = await axiosInstance.get(`${url}/api/properties/search/my`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data?.data ?? res.data;
};

export const getPlans = async ({
  userType,
  category,
}: {
  userType: "buyer" | "owner" | "agent" | "builder";
  category?: "rent" | "sell" | "both" | "rent_view" | "buy";
}) => {
  const res = await axiosInstance.get(`${url}/api/payments/plans`, {
    params: {
      userType,
      category,
    },
  });

  return res.data;
};


export const projectpostLeads = async (
  payload: ProjectLeadPayload
) => {
  const res = await axiosInstance.post(
    `${url}/api/properties/leads/project/lead`,
    payload
  );

  return res.data;
};

export const requestProjectLeadOtp = async (payload: {
  phone: string;
  projectId?: string;
}) => {
  const res = await axiosInstance.post(
    `${url}/api/properties/leads/project/lead/request-otp`,
    payload,
  );

  return res.data;
};

export const verifyProjectLeadOtp = async (payload: {
  phone: string;
  otp: string;
  projectId?: string;
}) => {
  const res = await axiosInstance.post(
    `${url}/api/properties/leads/project/lead/verify-otp`,
    payload,
  );

  return res.data;
};


export const patchProjectLeadIntention = async (
  leadId: string,
  payload: {
    intention: { question: string; answer: string }[];
  },
) => {
  const res = await axiosInstance.patch(
    `${url}/api/properties/leads/project/lead/${leadId}/intention`,
    payload,
  );

  return res.data;
};
export const checkProjectLeadSubmitted = async (params: {
  projectId: string;
  phone?: string;
  email?: string;
}) => {
  const res = await axiosInstance.get(
    `${url}/api/properties/leads/project/lead/check`,
    { params },
  );

  return res.data;
};
// export const projectpostLeads = async (payload: {
//   name: string;
//   phone: string;
//   email?: string;
//   projectId?: string;
//   remarks?: string;
// }) => {
//   const res = await axiosInstance.post(`${url}/api/properties/leads/project/lead`, payload);
//   return res.data;
// }; 

export const postLeads = async (payload: {
  name: string;
  phone: string;
  email?: string;
  projectId?: string;
  listingType?: string;
  propertyType?: string;
  remarks?: string;
}) => {
  const cookies = Cookies.get("token");
  if (!cookies) return null;

  const res = await axiosInstance.post(`${url}/api/properties/leads`, payload, {
    headers: {
      Authorization: `Bearer ${cookies}`,
    },
  });
  return res.data;
};

export const postPublicPropertyLead = async (payload: {
  name: string;
  phone: string;
  email?: string;
  projectId?: string;
  listingType?: string;
  propertyType?: string;
  remarks?: string;
}) => {
  const token = Cookies.get("token");
  const res = await axiosInstance.post<PublicPropertyLeadResponse>(
    `${url}/api/properties/leads/public/lead`,
    payload,
    token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined,
  );
  return res.data;
};

export const requestPublicPropertyLeadOtp = async (payload: {
  phone: string;
  projectId?: string;
  propertyType?: string;
}) => {
  const res = await axiosInstance.post(
    `${url}/api/properties/leads/public/lead/request-otp`,
    payload,
  );
  return res.data;
};

export const verifyPublicPropertyLeadOtp = async (payload: {
  phone: string;
  otp: string;
  projectId?: string;
}) => {
  const res = await axiosInstance.post<VerifyPublicPropertyLeadOtpResponse>(
    `${url}/api/properties/leads/public/lead/verify-otp`,
    payload,
  );
  return res.data;
};

export const getProjectLeads = async (projectId: string) => {
  const token = Cookies.get("token");
  if (!token) return null;

  const res = await axiosInstance.get(
    `${url}/api/properties/leads?projectId=${projectId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.data;
};


export const getProjectbuilderLeads = async (projectId: string, from?: Date, to?: Date) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const params = new URLSearchParams();
  if (from) params.append("from", from.toISOString());
  if (to) params.append("to", to.toISOString());

  const res = await axiosInstance.get(
    `${url}/api/properties/leads/project/${projectId}/leads`,
    {
      params,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return res.data;
};

export const downloadLeadsCSV = async (
  projectId: string,
  from?: string,
  to?: string
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const params = new URLSearchParams();

  if (from) params.append("from", from);
  if (to) params.append("to", to);

  const res = await axiosInstance.get(
    `${url}/api/properties/leads/project/${projectId}/leads/csv`,
    {
      params,
      responseType: "blob",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = "leads.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

export const importProjectLeadsCSV = async (
  projectId: string,
  file: File
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const formData = new FormData();
  formData.append("file", file);

  const res = await axiosInstance.post(
    `${url}/api/properties/leads/project/${projectId}/leads/import`,
    formData,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return res.data;
};


export const updateLeadStatus = async (id: string, status: string) => {
 const token = Cookies.get("token");
 if (!token) throw new Error("Not authenticated");

 const res  = await axiosInstance.patch(
    `${url}/api/properties/leads/project/${id}/status`,
    { status },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return res.data;
}

export const getBuilderPermissionCatalog = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/builder-access/permissions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const getBuilderRoles = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/builder-access/roles`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const createBuilderRole = async (payload: {
  name: string;
  permissions: string[];
}) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.post(`${url}/api/users/builder-access/roles`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const updateBuilderRole = async (
  id: string,
  payload: { name?: string; permissions?: string[]; isActive?: boolean }
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.patch(
    `${url}/api/users/builder-access/roles/${id}`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const getBuilderMembers = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/builder-access/members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const createBuilderMember = async (payload: {
  name: string;
  email?: string;
  phone?: string;
  builderRoleId: string;
  projectIds?: string[];
}) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.post(`${url}/api/users/builder-access/members`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const updateBuilderMember = async (
  id: string,
  payload: { builderRoleId?: string; projectIds?: string[]; isActive?: boolean }
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.patch(
    `${url}/api/users/builder-access/members/${id}`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};


export const getHighlightProjectBuilders = async () => {
  const res = await axiosInstance.get(
    `${url}/api/properties/highlight-projects/builder/me`,
    {
      headers: {
        Authorization: `Bearer ${Cookies.get("token")}`,
      },
    },
  );
  return res.data;
};

export const getMyAgentProfile = async () => {
  const token = Cookies.get("token");
  if (!token) return null;

  const res = await axiosInstance.get(`${url}/api/users/agent/me/profile`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
};


export const updateAgentProfileByPhone = async (
  phone: string,
  payload: Partial<{
    name: string;
    bio: string;
    agencyName: string;
    city: string;
    areasServed: string[];
    languages: string[];
    experienceYears: number;
    licenseNumber: string;
    licenseValidTill: string;
    reraAgentId?: string;
    avatar?: File;
    coverImage?: File;
  }>
) => {
  const hasFiles = payload.avatar || payload.coverImage;

  if (hasFiles) {
    const formData = new FormData();

    Object.entries(payload).forEach(([key, value]) => {
      if ((key === "avatar" || key === "coverImage") && value instanceof File) {
        formData.append(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => formData.append(`${key}[]`, v));
      } else if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });

    const res = await axiosInstance.patch(
      `${url}/api/users/agent/by-phone/${phone}`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${Cookies.get("token")}`,
          "Content-Type": "multipart/form-data",
        },
      }
    );

    return res.data;
  }

  const res = await axiosInstance.patch(
    `${url}/api/users/agent/by-phone/${phone}`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${Cookies.get("token")}`,
      },
    }
  );

  return res.data;
};


export const createFeaturedProperty = async (
  formData: FormData,
): Promise<IFeaturedProject> => {
  const token = Cookies.get("token");

  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${url}/api/properties/featured-project`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create featured property");
  }

  return response.json();
};

export const getMyContactedProperties = async () => {
  const token = Cookies.get("token");
  if (!token) return null;

  const res = await axiosInstance.get(
    `${url}/api/properties/leads/my-contacts`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.data;
};

export const getBuilderDashboards = async (
  range: string = "30d",
  filters?: { state?: string; city?: string; fromDate?: string; toDate?: string },
) => {
  const token = Cookies.get("token");
  if (!token) return null;

  const res = await axiosInstance.get(`${url}/api/users/builder/analytics`, {
    params: {
      range,
      ...(filters?.state ? { state: filters.state } : {}),
      ...(filters?.city ? { city: filters.city } : {}),
      ...(filters?.fromDate ? { fromDate: filters.fromDate } : {}),
      ...(filters?.toDate ? { toDate: filters.toDate } : {}),
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
};

export const getBuilderFeaturedShortlists = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(
    `${url}/api/users/builder/featured-shortlists`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return res.data;
};

export const getBuilderProjectActivity = async (projectId: string) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  try {
    const res = await axiosInstance.get(
      `${url}/api/users/builder/projects/${projectId}/activity`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    return res.data;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return {
        success: false,
        project: undefined,
        summary: {
          totalUsers: 0,
          shortlistedUsers: 0,
          leadSubmittedUsers: 0,
          pageViewedUsers: 0,
          brochureDownloadedUsers: 0,
          avgTimeSpentMinutes: 0,
          totalPageViews: 0,
        },
        users: [],
        fallbackReason: "activity_endpoint_missing",
      };
    }

    throw error;
  }
};

export const getBuilderNotifications = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/builder/notifications`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};

export const getBuilderNotificationSummary = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/builder/notifications/summary`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};

export const markBuilderNotificationsSeen = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.post(
    `${url}/api/users/builder/notifications/seen`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return res.data;
};

export const getAgentNotifications = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/agent/notifications`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};

export const getAgentNotificationSummary = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/agent/notifications/summary`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};

export const markAgentNotificationsSeen = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.post(
    `${url}/api/users/agent/notifications/seen`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return res.data;
};

export const getUserNotifications = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/shortlist/notifications/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};

export const getUserNotificationSummary = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/shortlist/notifications/me/summary`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};

export const markUserNotificationsSeen = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.post(
    `${url}/api/users/shortlist/notifications/me/seen`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return res.data;
};

export type AdminNotificationAudience = "all" | "builder" | "agent" | "owner" | "user";

export type SendAdminNotificationPayload = {
  title: string;
  body: string;
  audience: AdminNotificationAudience;
  image?: File | null;
  city?: string;
  state?: string;
  locality?: string;
  userIds?: string[];
};

export const sendAdminNotification = async (
  payload: SendAdminNotificationPayload,
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const formData = new FormData();
  formData.append("title", payload.title);
  formData.append("body", payload.body);
  formData.append("audience", payload.audience);

  if (payload.image) formData.append("image", payload.image);
  if (payload.city?.trim()) formData.append("city", payload.city.trim());
  if (payload.state?.trim()) formData.append("state", payload.state.trim());
  if (payload.locality?.trim()) formData.append("locality", payload.locality.trim());
  if (payload.userIds?.length) {
    formData.append("userIds", JSON.stringify(payload.userIds));
  }

  const res = await axiosInstance.post(
    `${url}/api/users/notifications/admin/notify/custom`,
    formData,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return res.data;
};

export const getAdminNotifications = async () => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/users/notifications/admin/feed`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};

export const trackProjectBrochureDownload = async (projectId: string) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.post(
    `${url}/api/properties/leads/project/${projectId}/brochure-download`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return res.data;
};

export const trackProjectViewDuration = async (
  projectId: string,
  durationMs: number,
  pathname?: string,
) => {
  const token = Cookies.get("token");
  if (!token) return null;

  if (!Number.isFinite(durationMs) || durationMs < 1000) {
    return null;
  }

  try {
    const res = await fetch(`${url}/api/properties/leads/project/${projectId}/view-duration`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        durationMs: Math.round(durationMs),
        pathname,
      }),
      keepalive: true,
    });

    if (!res.ok) {
      return null;
    }

    return res.json();
  } catch {
    return null;
  }
};

export const trackPropertyViewDuration = async (
  propertyType: string,
  projectId: string,
  durationMs: number,
  pathname?: string,
) => {
  const token = Cookies.get("token");
  if (!token) return null;

  if (!Number.isFinite(durationMs) || durationMs < 1000) {
    return null;
  }

  try {
    const res = await fetch(
      `${url}/api/properties/leads/property/${propertyType}/${projectId}/view-duration`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          durationMs: Math.round(durationMs),
          pathname,
        }),
        keepalive: true,
      },
    );

    if (!res.ok) {
      return null;
    }

    return res.json();
  } catch {
    return null;
  }
};



export const getMembershipHistory = async () => {
  const token = Cookies.get("token");
  if (!token) return null;

  const res = await axiosInstance.get(`${url}/api/payments/subscriptions/history`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
};

export const deactivateMyProperty = async (propertyId: string, propertyType: string) => {
  const token = Cookies.get("token");
  if (!token) return null;

  const res = await axiosInstance.post(
    `${url}/api/properties/${propertyType}/${propertyId}/deactive`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.data;
};

export const getFeaturedProjectsDashboard = async () => {
  const token = Cookies.get("token");
  if (!token) return null;

  const res = await axiosInstance.get(`${url}/api/properties/highlight-projects/builder/featured/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return filterAssignedBuilderProjects(res.data);
  }


  export const syncShortlist = async (properties: any[]) => {

  const token = Cookies.get("token");

  if (!token) return null;

  const res = await axiosInstance.post(
    `${url}/api/users/shortlist/sync`,   
    {
      properties,                 
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  return res.data;
};


export const updateLocation = async (payload:any) => {

  const token = Cookies.get("token");

  const res = await axios.post(
    `${url}/api/users/auth/update-location/create`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return res.data;
};




export const sendTokenToBackend = async (
  tokenOrUserId: string,
  maybeTokenOrPlatform?: string,
  maybePlatformOrDeviceId?: string,
  maybeDeviceId?: string,
) => {
  const authToken = Cookies.get("token");
  console.info("[Login Push Debug] save FCM helper called", {
    hasAuthToken: Boolean(authToken),
  });

  if (!authToken) {
    return null;
  }

  let token = tokenOrUserId;
  let platform: "android" | "ios" | "web" = "web";
  let deviceId: string | undefined = undefined;

  if (maybeTokenOrPlatform && !["web", "android", "ios"].includes(maybeTokenOrPlatform)) {
    token = maybeTokenOrPlatform;
    if (maybePlatformOrDeviceId && ["web", "android", "ios"].includes(maybePlatformOrDeviceId)) {
      platform = maybePlatformOrDeviceId as any;
    }
    deviceId = maybeDeviceId;
  } else {
    token = tokenOrUserId;
    if (maybeTokenOrPlatform && ["web", "android", "ios"].includes(maybeTokenOrPlatform)) {
      platform = maybeTokenOrPlatform as any;
    }
    deviceId = maybePlatformOrDeviceId;
  }

  const res = await axiosInstance.post(
    `${url}/api/users/notifications/save-fcm-token`,
    {
      token,
      platform,
      deviceId,
    },
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    },
  );

  console.info("[Login Push Debug] save FCM response", {
    status: res.status,
    data: res.data,
  });

  return res.data;
};

// chatbot related APIs
export const getChatbotResponse = async (
  message: string,
  context?: {
    city?: string;
    state?: string;
    localities?: string[];
  }
) => {
  const sessionIdKey = "homemate_chat_session_id_v4";
  const sessionId =
    typeof window !== "undefined"
      ? window.localStorage.getItem(sessionIdKey) || crypto.randomUUID()
      : "guest";

  if (typeof window !== "undefined") {
    window.localStorage.removeItem("homemate_chat_session_id");
    window.localStorage.removeItem("homemate_chat_session_id_v2");
    window.localStorage.removeItem("homemate_chat_session_id_v3");
    window.localStorage.setItem(sessionIdKey, sessionId);
  }

  const res = await axiosInstance.post(`${url}/api/chatbot`, { message, context }, {
    headers: {
      "x-session-id": sessionId,
    },
    responseType: "text",
  });
  return res.data;
};

export const getChatbotSuggestions = async (city?: string) => {
  const res = await axiosInstance.get(`${url}/api/chatbot/suggestions`, {
    params: city ? { city } : undefined,
  });

  return res.data?.suggestions || [];
};

export type RequestCallTicketPayload = {
  requester: {
    userId?: string;
    name: string;
    email?: string;
    phone?: string;
  };
  date: string;
  timeSlot: string;
  category: string;
  subject: string;
  relationshipManagerName?: string;
  relationshipManagerId?: string;
  notes?: string;
  relatedProjectId?: string;
  relatedProjectName?: string;
  source?: "web" | "email" | "phone" | "chat" | "admin";
};

export const createRequestCallTicket = async (
  payload: RequestCallTicketPayload,
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.post(
    `${url}/api/tickets/request-call`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return res.data;
};

export type CreateSupportTicketPayload = {
  title: string;
  description: string;
  requester: {
    userId?: string;
    name: string;
    email?: string;
    phone?: string;
  };
  assignedTo?: {
    userId?: string;
    name?: string;
    email?: string;
    role?: string;
  };
  category?: string;
  propertyId?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  source?: "web" | "email" | "phone" | "chat" | "admin";
  metadata?: Record<string, unknown>;
};

export const createSupportTicket = async (
  payload: CreateSupportTicketPayload,
) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.post(`${url}/api/tickets`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};

export const createPublicSupportTicket = async (
  payload: CreateSupportTicketPayload,
) => {
  const res = await axiosInstance.post(`${url}/api/tickets`, payload);
  return res.data;
};

export type GetTicketsParams = {
  requesterId?: string;
  category?: string;
  module?: string;
  requestType?: string;
  relatedProjectId?: string;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "updatedAt" | "priority" | "dueAt" | "status";
  sortOrder?: "asc" | "desc";
};

export const getTickets = async (params: GetTicketsParams = {}) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.get(`${url}/api/tickets`, {
    params,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};

export const deleteTicket = async (ticketId: string) => {
  const token = Cookies.get("token");
  if (!token) throw new Error("Not authenticated");

  const res = await axiosInstance.delete(`${url}/api/tickets/${ticketId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};

export interface SiteLogoData {
  _id?: string;
  logoUrl?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SiteLogoResponse {
  success: boolean;
  data: SiteLogoData;
}

export interface BannerDeviceConfig {
  image?: string;
  clickUrl?: string;
  heading?: {
    enabled: boolean;
    html: string;
  };
  subheading?: {
    enabled: boolean;
    html: string;
  };
  location?: {
    state?: string;
    city?: string;
    locality?: string;
    subLocality?: string;
    /** Sponsored-style: { [state]: { [city]: localities[] } } */
    coverage?: Record<string, Record<string, string[]>>;
  };
}

export interface SiteBannerItem {
  _id: string;
  title?: string;
  priority?: number;
  location?: {
    state?: string;
    city?: string;
    locality?: string;
    subLocality?: string;
    coverage?: Record<string, Record<string, string[]>>;
  };
  devices?: {
    desktop?: BannerDeviceConfig;
    laptop?: BannerDeviceConfig;
    tablet?: BannerDeviceConfig;
    mobile?: BannerDeviceConfig;
  };
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  savedDevices?: string[];
}

export interface SiteBannersResponse {
  success: boolean;
  data: SiteBannerItem[];
}

/** Public resolve GET — slim image items only */
export interface ResolvedBannerImage {
  priority: number;
  image: string;
  heading: {
    enabled: boolean;
    html: string;
  };
}

export interface ResolvedBannerDeviceBucket {
  images: ResolvedBannerImage[];
}

export interface ResolvedSiteBannersData {
  query: {
    device: string;
    state: string;
    city: string;
    locality: string;
    subLocality: string;
  };
  desktop?: ResolvedBannerDeviceBucket;
  laptop?: ResolvedBannerDeviceBucket;
  tablet?: ResolvedBannerDeviceBucket;
  mobile?: ResolvedBannerDeviceBucket;
}

export interface ResolvedSiteBannersResponse {
  success: boolean;
  data: ResolvedSiteBannersData;
}

export const getSiteLogo = async (): Promise<SiteLogoResponse | null> => {
  try {
    const res = await fetch(`${url}/api/properties/site-branding/logo`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("Error fetching site logo:", error);
    return null;
  }
};

export const getSiteBanners = async (): Promise<SiteBannersResponse | null> => {
  try {
    const res = await fetch(`${url}/api/properties/site-branding/banners`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("Error fetching site banners:", error);
    return null;
  }
};

export const getResolvedSiteBanners = async (params?: {
  state?: string;
  city?: string;
  locality?: string;
  subLocality?: string;
  device?: string;
}): Promise<ResolvedSiteBannersResponse | null> => {
  try {
    const query = new URLSearchParams();

    Object.entries(params || {}).forEach(([key, value]) => {
      const cleanedValue = String(value || "").trim();
      if (cleanedValue) query.set(key, cleanedValue);
    });

    const queryString = query.toString();
    const res = await fetch(
      `${url}/api/properties/site-branding/banners/resolve${
        queryString ? `?${queryString}` : ""
      }`,
      {
        cache: "no-store",
      },
    );

    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("Error fetching resolved site banners:", error);
    return null;
  }
};
