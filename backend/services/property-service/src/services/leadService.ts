import mongoose, { Types } from "mongoose";
import Lead from "../models/LeadModel";
import { Subscription } from "../models/subscriptionModel";
import { Plan } from "../models/planModel";
import Residential from "../models/residentialModel";
import Commercial from "../models/commercialModel";
import Agricultural from "../models/agriculturalModel";
import LandPlot from "../models/landModel";
import FeaturedProject from "../models/featurePropertiesModel";
import PublicLead from "../models/PublicLead";
import User from "../models/userModel";
import { notifyOwnerAndAdmins } from "./pushNotificationService";
import { buildLeadPropertySnapshot } from "../utils/leadPropertySnapshot";
import { sendLeadWhatsApp } from "../utils/whatsapp";
import { sendUserContactingEmail } from "../../../../shared/email/email.helper";

const PROPERTY_MODEL_MAP: Record<string, any> = {
  featuredprojects: FeaturedProject,
  residentials: Residential,
  commercials: Commercial,
  agriculturals: Agricultural,
  landplots: LandPlot,
};

const getLeadWithDialogDetails = (leadId: Types.ObjectId) =>
  Lead.findById(leadId)
    .populate("ownerId", "name phone email")
    .populate(
      "projectId",
      "title price priceFrom priceTo bedrooms propertyType listingType createdAt"
    )
    .lean();

const getExistingLeadWithDialogDetails = async (lead: any) => {
  if (lead.propertyType === "featuredprojects") {
    const [owner, project] = await Promise.all([
      mongoose.model("User").findById(lead.ownerId).select("name phone email").lean(),
      FeaturedProject.findById(lead.projectId)
        .select("title price priceFrom priceTo propertyType createdAt")
        .lean(),
    ]);

    return {
      ...lead.toObject(),
      ownerId: owner,
      projectId: project,
    };
  }

  return getLeadWithDialogDetails(lead._id);
};

function isAgentRole(value?: string | null) {
  return String(value || "").trim().toLowerCase() === "agent";
}

const isAgentListedProperty = async (property: any, listingSource?: string) => {
  if (isAgentRole(listingSource)) return true;
  if (isAgentRole(property?.listingSource)) return true;

  const ownerId = property?.createdBy;
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

const notifyLeadCreated = async ({
  lead,
  property,
  userId,
}: {
  lead: any;
  property: any;
  userId: string;
}) => {
  const [user, owner] = await Promise.all([
    User.findById(userId).select("name phone email").lean(),
    User.findById(lead.ownerId).select("name phone email").lean(),
  ]);
  const propertyTitle =
    property?.title ||
    property?.projectName ||
    property?.buildingName ||
    "your property";
  const userName = user?.name || lead?.name || "A user";

  await notifyOwnerAndAdmins({
    type: "contact_requested",
    title: "New Contact Request",
    body: `${userName} requested contact for ${propertyTitle}.`,
    actorUserId: userId,
    ownerId: lead.ownerId,
    projectId: lead.projectId,
    propertyType: lead.propertyType,
    metadata: {
      leadId: String(lead._id),
      propertyTitle,
      userName,
      userPhone: user?.phone || lead?.phone || "",
      userEmail: user?.email || lead?.email || "",
    },
  });

  if (owner?.phone) {
    sendLeadWhatsApp(owner.phone, {
      leadType:
        String(property?.listingType || "").toLowerCase() === "rent" ||
        String(property?.listingType || "").toLowerCase() === "lease"
          ? "Rental"
          : lead.propertyType === "featuredprojects"
            ? "Project"
            : "Sale",
      name: userName,
      leadPhone: user?.phone || lead?.phone || "",
      email: user?.email || lead?.email || "",
      interestedIn: propertyTitle,
    }).catch((err) =>
      console.error("Error sending lead WhatsApp:", err),
    );
  }

  const ownerEmail = String(owner?.email || "").trim();
  if (ownerEmail) {
    const location =
      property?.locality ||
      property?.city ||
      property?.location?.city ||
      "your area";
    sendUserContactingEmail(
      ownerEmail,
      owner?.name || "Owner",
      userName,
      propertyTitle,
      location,
      "https://propenu.com/my-properties",
    ).catch((err) => console.error("Error sending lead email:", err));
  }
};

/** CREATE LEAD **/
export const createLead = async (
  data: any,
  userId: string | null,
  actorRoleName?: string | null,
) => {
  const { propertyType, projectId } = data;

  if (!userId) {
    throw new Error("Unauthorized");
  }

  if (!Types.ObjectId.isValid(projectId)) {
    throw new Error("Invalid project/property ID");
  }

  const PropertyModel = PROPERTY_MODEL_MAP[propertyType];
  if (!PropertyModel) {
    throw new Error(`Invalid propertyType: ${propertyType}`);
  }

  const existingLead = await Lead.findOne({
    projectId,
    createdBy: userId,
  });
  if (existingLead) {
    return getExistingLeadWithDialogDetails(existingLead);
  }

  const property = await PropertyModel.findById(projectId);
  if (!property) {
    throw new Error("Property not found");
  }

  const ownerId = (property as any).createdBy;
  if (!ownerId) {
    throw new Error("Property owner not found");
  }

  // User/agent/builder cannot contact their own property.
  if (String(ownerId) === String(userId)) {
    const error: any = new Error(
      "You cannot submit a lead for your own property",
    );
    error.statusCode = 403;
    throw error;
  }

  const listingType = (
    propertyType === "featuredprojects" ? "sale" : (property as any).listingType
  ) as
    | "sale"
    | "rent"
    | "lease"
    | undefined;
  if (!listingType) {
    throw new Error("Invalid listing type for property");
  }

  // Featured projects skip subscription checks.
  if (propertyType === "featuredprojects") {
    const lead = await Lead.create({
      ...data,
      propertyModel: PropertyModel.modelName,
      createdBy: userId,
      ownerId,
      listingType,
      propertySnapshot: buildLeadPropertySnapshot(property, propertyType),
    });

    await notifyLeadCreated({ lead, property, userId });

    return getLeadWithDialogDetails(lead._id);
  }

  const actorRole = String(actorRoleName || "").toLowerCase();

  if (actorRole === "builder") {
    const { listingType: _ignore, ...safeData } = data;

    const lead = await Lead.create({
      ...safeData,
      propertyModel: PropertyModel.modelName,
      createdBy: userId,
      ownerId,
      listingType,
      propertySnapshot: buildLeadPropertySnapshot(property, propertyType),
    });

    await notifyLeadCreated({ lead, property, userId });
    return getLeadWithDialogDetails(lead._id);
  }

  if (await isAgentListedProperty(property, data?.listingSource)) {
    const { listingType: _ignore, ...safeData } = data;

    const lead = await Lead.create({
      ...safeData,
      propertyModel: PropertyModel.modelName,
      createdBy: userId,
      ownerId,
      listingType,
      propertySnapshot: buildLeadPropertySnapshot(property, propertyType),
    });

    await notifyLeadCreated({ lead, property, userId });
    return getLeadWithDialogDetails(lead._id);
  }

  const requiredViewerCategory = listingType === "sale" ? "buy" : "rent_view";

  const viewerSub = await Subscription.findOne({
    userId,
    status: "active",
    category: requiredViewerCategory,
  });

  if (!viewerSub) {
    throw new Error(
      listingType === "sale"
        ? "Please purchase a Buyer plan to contact this property owner"
        : "Please purchase a Rent View plan to contact this property owner"
    );
  }

  if (!viewerSub.usage) {
    viewerSub.usage = { contactUsed: 0, enquiryUsed: 0 };
  }

  const viewerPlan = await Plan.findOne({ code: viewerSub.planCode });
  if (!viewerPlan) {
    throw new Error("Invalid buyer subscription plan");
  }

  const contactLimit =
    viewerSub.usage?.contactLimit ??
    viewerPlan.features?.get("CONTACT_OWNER_LIMIT") ??
    viewerPlan.features?.get("CONTACT_LIMIT");
  if (
    typeof contactLimit === "number" &&
    viewerSub.usage.contactUsed >= contactLimit
  ) {
    throw new Error("Your contact limit is over. Please upgrade your plan.");
  }

  // Do not trust listingType sent by client.
  const { listingType: _ignore, ...safeData } = data;

  const lead = await Lead.create({
    ...safeData,
    propertyModel: PropertyModel.modelName,
    createdBy: userId,
    ownerId,
    listingType,
    propertySnapshot: buildLeadPropertySnapshot(property, propertyType),
  });

  viewerSub.usage.contactUsed += 1;
  await viewerSub.save();
  await notifyLeadCreated({ lead, property, userId });

  return getLeadWithDialogDetails(lead._id);
};

/** ASSIGN LEAD TO SALES **/
export const assignLead = async (leadId: string, assignedTo: string) => {
  if (!Types.ObjectId.isValid(leadId)) {
    throw new Error("Invalid lead ID");
  }

  if (!Types.ObjectId.isValid(assignedTo)) {
    throw new Error("Invalid user ID");
  }

  const lead = await Lead.findByIdAndUpdate(leadId, { assignedTo }, { new: true });

  if (!lead) throw new Error("Lead not found");

  return lead;
};

/** UPDATE LEAD STATUS **/
export const updateLeadStatus = async (
  leadId: string,
  status: string,
  user?: any
) => {
  if (!Types.ObjectId.isValid(leadId)) {
    throw new Error("Invalid lead ID");
  }

  const lead = await Lead.findByIdAndUpdate(
    leadId,
    {
      status,
      approvedByManager: false,
    },
    { new: true }
  );

  if (!lead) throw new Error("Lead not found");

  return lead;
};

/** GET LEADS (ROLE BASED) **/
export const getLeads = async (query: any, user?: any) => {
  const filter: any = {};

  if (query.projectId) {
    if (!Types.ObjectId.isValid(query.projectId)) {
      throw new Error("Invalid projectId");
    }
    filter.projectId = query.projectId;
  }

  if (query.propertyType) filter.propertyType = query.propertyType;
  if (query.status) filter.status = query.status;

  if (user?.role === "sales") {
    filter.assignedTo = user.id;
  }

  return Lead.find(filter)
    .populate("assignedTo", "name email")
    .sort({ createdAt: -1 })
    .lean();
};

/** GET SINGLE LEAD **/
export const getLeadById = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid lead ID");
  }

  const lead = await Lead.findById(id)
    .populate("assignedTo", "name email")
    .populate("projectId");

  if (!lead) throw new Error("Lead not found");

  return lead;
};

export const updateLeadStatusService = async (
  leadId: string,
  status: string
) => {
  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new Error("Invalid Lead ID");
  }

  const lead = await PublicLead.findByIdAndUpdate(
    leadId,
    { status },
    { new: true }
  );

  if (lead) {
    return lead;
  }

  const propertyLead = await Lead.findByIdAndUpdate(
    leadId,
    { status },
    { new: true }
  );

  if (!propertyLead) {
    throw new Error("Lead not found");
  }

  return propertyLead;
};

export const deleteLeadService = async (leadId: string) => {
  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new Error("Invalid Lead ID");
  }

  const publicLead = await PublicLead.findByIdAndDelete(leadId);
  if (publicLead) {
    return publicLead;
  }

  const propertyLead = await Lead.findByIdAndDelete(leadId);
  if (propertyLead) {
    return propertyLead;
  }

  throw new Error("Lead not found");
};

export const deleteProjectLeadsService = async (projectId: string) => {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new Error("Invalid projectId");
  }

  const [publicLeadResult, propertyLeadResult] = await Promise.all([
    PublicLead.deleteMany({ projectId }),
    Lead.deleteMany({ projectId }),
  ]);

  return {
    deletedCount:
      (publicLeadResult.deletedCount ?? 0) +
      (propertyLeadResult.deletedCount ?? 0),
    publicLeadDeletedCount: publicLeadResult.deletedCount ?? 0,
    propertyLeadDeletedCount: propertyLeadResult.deletedCount ?? 0,
  };
};
