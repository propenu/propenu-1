import FeaturedProject from "../models/featurePropertiesModel";
import { Types } from "mongoose";
import PublicLead from "../models/PublicLead";
import { Plan } from "../models/planModel";
import { notifyOwnerAndAdmins } from "./pushNotificationService";
import Residential from "../models/residentialModel";
import Commercial from "../models/commercialModel";
import Agricultural from "../models/agriculturalModel";
import LandPlot from "../models/landModel";
import User from "../models/userModel";
import { buildLeadPropertySnapshot } from "../utils/leadPropertySnapshot";
import {
  sendUserContactingEmail,
  sendCallbackRequestEmail,
} from "../../../../shared/email/email.helper";
import { sendLeadWhatsApp } from "../utils/whatsapp";

const PROPERTY_MODEL_MAP: Record<string, any> = {
  featuredprojects: FeaturedProject,
  residentials: Residential,
  commercials: Commercial,
  agriculturals: Agricultural,
  landplots: LandPlot,
};

const normalizePhone = (value?: string | null) =>
  String(value || "").replace(/[^\d+]/g, "");

const normalizeEmail = (value?: string | null) =>
  String(value || "").trim().toLowerCase();

const maskPhone = (phone?: string | null) => {
  const value = String(phone || "").trim();
  if (!value) return "";
  if (value.length <= 4) return "*".repeat(value.length);

  return `${value.slice(0, 2)}${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`;
};

const maskEmail = (email?: string | null) => {
  const value = normalizeEmail(email);
  if (!value) return "";

  const [name = "", domain = ""] = value.split("@");
  if (!domain) {
    return name.length <= 2 ? `${name.slice(0, 1)}***` : `${name.slice(0, 2)}***`;
  }

  const visibleName = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${visibleName}***@${domain}`;
};

function isAgentRole(value?: string | null) {
  return String(value || "").trim().toLowerCase() === "agent";
}

const isAgentListedProperty = async (property: any, listingSource?: string) => {
  if (isAgentRole(listingSource)) return true;
  if (isAgentRole(property?.listingSource)) return true;

  const createdBy = property?.createdBy;
  if (
    isAgentRole(createdBy?.roleName) ||
    isAgentRole(createdBy?.role) ||
    isAgentRole(createdBy?.roleId?.name) ||
    isAgentRole(createdBy?.roleId?.label)
  ) {
    return true;
  }

  const ownerId = String(createdBy?._id || createdBy || "").trim();
  if (!ownerId) return false;

  const owner = await User.findById(ownerId)
    .select("roleName role roleId")
    .populate("roleId", "name label")
    .lean();
  const roleDoc = (owner as any)?.roleId;

  return (
    isAgentRole((owner as any)?.roleName) ||
    isAgentRole((owner as any)?.role) ||
    isAgentRole(roleDoc?.name) ||
    isAgentRole(roleDoc?.label)
  );
};

const getGuestFreePlanCodeForListingType = (listingType: string) => {
  if (listingType === "rent" || listingType === "lease") {
    return "RENTAL_FREE";
  }

  return "BUYER_FREE";
};

const getGuestContactOwnerLimit = async (listingType: string) => {
  const planCode = getGuestFreePlanCodeForListingType(listingType);
  const plan = await Plan.findOne({ code: planCode }).lean();
  const limit =
    typeof plan?.features?.get === "function"
      ? plan.features.get("CONTACT_OWNER_LIMIT")
      : (plan as any)?.features?.CONTACT_OWNER_LIMIT;

  return typeof limit === "number" ? limit : 2;
};

export const createPublicLead = async (
  data: any,
  options?: { actorUserId?: string | null },
) => {
  const { projectId } = data;

  // 1️⃣ Validate ObjectId
  if (!Types.ObjectId.isValid(projectId)) {
    throw new Error("Invalid projectId");
  }

  // 2️⃣ Check project exists
  const project = await FeaturedProject.findById(projectId).populate(
    "createdBy",
    "name phone email",
  );
  if (!project) {
    throw new Error("Featured project not found");
  }

  const actorUserId = String(options?.actorUserId || "").trim();
  const ownerId = String((project as any)?.createdBy?._id || project.createdBy || "").trim();
  const ownerPhone = normalizePhone((project as any)?.createdBy?.phone);
  const ownerEmail = normalizeEmail((project as any)?.createdBy?.email);
  const submittedPhone = normalizePhone(data.phone);
  const submittedEmail = normalizeEmail(data.email);

  if (
    (actorUserId && ownerId && actorUserId === ownerId) ||
    (submittedPhone && ownerPhone && submittedPhone === ownerPhone) ||
    (submittedEmail && ownerEmail && submittedEmail === ownerEmail)
  ) {
    const error: any = new Error("You cannot submit a lead for your own project");
    error.statusCode = 403;
    throw error;
  }

  // 3️⃣ Prevent duplicate spam (same phone same project)
  const exists = await PublicLead.findOne({
    projectId,
    phone: data.phone,
  });

  if (exists) {
    throw new Error("You already contacted this project");
  }

  // 4️⃣ Save lead
  const lead = await PublicLead.create({
    ...data,
    propertyType: data.propertyType || "featuredprojects",
    propertyModel: (project as any).constructor?.modelName || FeaturedProject.modelName,
    propertySnapshot: buildLeadPropertySnapshot(project, "featuredprojects"),
  });
  const projectTitle =
    project.title || (project as any).projectName || "your project";

  if (!project.createdBy) {
    return lead;
  }

  if (ownerPhone && (lead.source || "site") !== "imported") {
    sendLeadWhatsApp(ownerPhone, {
      leadType: "Project",
      name: lead.name,
      leadPhone: lead.phone,
      email: lead.email || "",
      interestedIn: projectTitle,
    }).catch((err) =>
      console.error("Error sending project lead WhatsApp:", err),
    );
  }

  await notifyOwnerAndAdmins({
    type: "contact_requested",
    title: "New Project Lead",
    body: `${lead.name} submitted a lead for ${projectTitle}.`,
    ownerId: project.createdBy,
    projectId,
    propertyType: "featuredprojects",
    metadata: {
      leadId: String(lead._id),
      projectTitle,
      userName: lead.name,
      userPhone: lead.phone,
      userEmail: lead.email || "",
      source: lead.source || "site",
    },
  });

  if (ownerEmail) {
    const ownerName = (project as any)?.createdBy?.name || "Owner";
    const location = (project as any)?.location?.city || (project as any)?.city || "your area";
    const targetLink = `${process.env.FRONTEND_URL || "https://propenu.com"}/my-properties`;
    const isCallback = data.contactPreference === "callback" || data.type === "callback" || data.source === "callback";
    if (isCallback) {
      sendCallbackRequestEmail(ownerEmail, ownerName, lead.name, projectTitle, location, targetLink)
        .catch((err) => console.error("Error sending project callback email:", err));
    } else {
      sendUserContactingEmail(ownerEmail, ownerName, lead.name, projectTitle, location, targetLink)
        .catch((err) => console.error("Error sending project contact email:", err));
    }
  }

  return lead;
};

export const createPublicPropertyLead = async (
  data: any,
  options?: { actorUserId?: string | null },
) => {
  const { projectId, propertyType } = data;

  if (!Types.ObjectId.isValid(projectId)) {
    throw new Error("Invalid projectId");
  }

  const PropertyModel = PROPERTY_MODEL_MAP[propertyType];
  if (!PropertyModel) {
    throw new Error(`Invalid propertyType: ${propertyType}`);
  }

  const property = await PropertyModel.findById(projectId).populate(
    "createdBy",
    "name phone email",
  );
  if (!property) {
    throw new Error("Property not found");
  }

  const actorUserId = String(options?.actorUserId || "").trim();
  const ownerId = String((property as any)?.createdBy?._id || (property as any)?.createdBy || "").trim();
  const ownerPhone = normalizePhone((property as any)?.createdBy?.phone);
  const ownerEmail = normalizeEmail((property as any)?.createdBy?.email);
  const submittedPhone = normalizePhone(data.phone);
  const submittedEmail = normalizeEmail(data.email);

  if (
    (actorUserId && ownerId && actorUserId === ownerId) ||
    (submittedPhone && ownerPhone && submittedPhone === ownerPhone) ||
    (submittedEmail && ownerEmail && submittedEmail === ownerEmail)
  ) {
    const error: any = new Error("You cannot submit a lead for your own property");
    error.statusCode = 403;
    throw error;
  }

  const exists = await PublicLead.findOne({
    projectId,
    propertyType,
    phone: data.phone,
  });

  if (exists) {
    throw new Error("You already contacted this property");
  }

  const listingType =
    propertyType === "featuredprojects"
      ? "sale"
      : String((property as any)?.listingType || "").trim().toLowerCase();

  if (!listingType || !["sale", "rent", "lease"].includes(listingType)) {
    throw new Error("Invalid listing type for property");
  }

  const isContactingAgent = await isAgentListedProperty(
    property,
    data?.listingSource,
  );
  const guestContactLimit = isContactingAgent
    ? Number.POSITIVE_INFINITY
    : await getGuestContactOwnerLimit(listingType);
  const priorGuestLeadCount = isContactingAgent
    ? 0
    : await PublicLead.countDocuments({
        phone: submittedPhone,
        source: "site",
      });
  const shouldMaskGuestContactDetails =
    !actorUserId && priorGuestLeadCount >= guestContactLimit;

  const lead = await PublicLead.create({
    ...data,
    ownerId: ownerId || undefined,
    propertyModel: PropertyModel.modelName,
    listingType,
    propertySnapshot: {
      ...buildLeadPropertySnapshot(property, propertyType),
      listingType,
    },
  });

  const propertyTitle =
    (property as any)?.title ||
    (property as any)?.projectName ||
    (property as any)?.buildingName ||
    "your property";

  if (ownerId) {
    if (ownerPhone && (lead.source || "site") !== "imported") {
      sendLeadWhatsApp(ownerPhone, {
        leadType: listingType === "rent" || listingType === "lease" ? "Rental" : "Sale",
        name: lead.name,
        leadPhone: lead.phone,
        email: lead.email || "",
        interestedIn: propertyTitle,
      }).catch((err) =>
        console.error("Error sending property lead WhatsApp:", err),
      );
    }

    await notifyOwnerAndAdmins({
      type: "contact_requested",
      title: "New Contact Request",
      body: `${lead.name} requested contact for ${propertyTitle}.`,
      ownerId,
      projectId,
      propertyType,
      metadata: {
        leadId: String(lead._id),
        propertyTitle,
        userName: lead.name,
        userPhone: lead.phone,
        userEmail: lead.email || "",
        source: lead.source || "site",
      },
    });

    if (ownerEmail) {
      const ownerName = (property as any)?.createdBy?.name || "Owner";
      const location =
        (property as any)?.location?.city ||
        (property as any)?.city ||
        (property as any)?.location?.address ||
        "your area";
      const targetLink = `${process.env.FRONTEND_URL || "https://propenu.com"}/my-properties`;
      const isCallback =
        data.contactPreference === "callback" ||
        data.type === "callback" ||
        data.source === "callback";
      if (isCallback) {
        sendCallbackRequestEmail(
          ownerEmail,
          ownerName,
          lead.name,
          propertyTitle,
          location,
          targetLink,
        ).catch((err) =>
          console.error("Error sending property callback email:", err),
        );
      } else {
        sendUserContactingEmail(
          ownerEmail,
          ownerName,
          lead.name,
          propertyTitle,
          location,
          targetLink,
        ).catch((err) =>
          console.error("Error sending property contact email:", err),
        );
      }
    }
  }

  return {
    ...lead.toObject(),
    contactAccess: shouldMaskGuestContactDetails ? "masked" : "full",
    ownerId: (property as any)?.createdBy
      ? {
          _id: (property as any).createdBy._id,
          name: (property as any).createdBy.name,
          phone: shouldMaskGuestContactDetails
            ? maskPhone((property as any).createdBy.phone)
            : (property as any).createdBy.phone,
          email: shouldMaskGuestContactDetails
            ? maskEmail((property as any).createdBy.email)
            : (property as any).createdBy.email,
        }
      : null,
    projectId: {
      _id: (property as any)._id,
      title: (property as any).title,
      price: (property as any).price,
      priceFrom: (property as any).priceFrom,
      priceTo: (property as any).priceTo,
      createdAt: (property as any).createdAt,
    },
  };
};
