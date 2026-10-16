import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import { FeaturePropertyService } from "../services/featurePropertiesServices";
import { BuilderOnboardingService } from "../services/builderOnboardingService";
import FeaturedProject from "../models/featurePropertiesModel";
import { sendPendingProjectApprovalEmail } from "../utils/projectPendingApprovalEmail";
import { ZodError } from "zod";
import mongoose from "mongoose";

const staffRolesAllowlist = [
  "builder",
  "sales_manager",
  "sales_agent",
  "sales_executive",
  "customer_care",
  "customer_care_executive",
  "customer_care_executives",
  "relationship_manager",
  "regional_manager",
  "operations_head",
  "business_development_head",
  "ceo",
  "team_lead",
  "admin",
  "super_admin",
];

export const BUILDER_ONBOARDING_STAFF_ROLES = staffRolesAllowlist;

function sendError(res: Response, err: any) {
  const status = err?.statusCode || 500;
  return res.status(status).json({
    success: false,
    error: err?.message || "Internal server error",
    ...(err?.code ? { code: err.code } : {}),
    ...(err?.conflictField ? { conflictField: err.conflictField } : {}),
    ...(err?.conflictRole ? { conflictRole: err.conflictRole } : {}),
    ...(err?.conflictDisplayRole
      ? { conflictDisplayRole: err.conflictDisplayRole }
      : {}),
    ...(err?.conflictValue ? { conflictValue: err.conflictValue } : {}),
  });
}

function asStaff(user: AuthRequest["user"]): {
  id: string;
  name?: string;
  email?: string;
  roleName?: string;
} | undefined {
  if (!user?.id) return undefined;
  return {
    id: String(user.id),
    ...(user.name ? { name: String(user.name) } : {}),
    ...(user.email ? { email: String(user.email) } : {}),
    ...(user.roleName ? { roleName: String(user.roleName) } : {}),
  };
}

/** Staff: create project as draft without builder assignment */
export const createProjectDraft = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const raw = { ...(req.body || {}) };
    // Force draft + onboarding path; builder optional
    raw.status = "draft";
    raw.approvalStatus = "pending";
    delete raw.createdBy;
    delete raw.postedBy;
    delete raw.approvedBy;
    delete raw.approvedAt;

    if (!raw.propertyType) raw.propertyType = "featuredProject";

    const files = req.files as
      | { [fieldname: string]: Express.Multer.File[] }
      | undefined;

    const created = await FeaturePropertyService.createFeatureProperty(
      raw,
      files,
      req.user,
      { mode: "draft" },
    );

    return res.status(201).json({
      success: true,
      message: "Project draft saved. Builder assignment is pending.",
      data: created,
    });
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(422).json({ success: false, errors: err.flatten() });
    }
    console.error("createProjectDraft:", err);
    return sendError(res, err);
  }
};

export const lookupBuilder = async (req: AuthRequest, res: Response) => {
  try {
    const result = await BuilderOnboardingService.lookupBuilder({
      email: String(req.query.email || ""),
      phone: String(req.query.phone || ""),
      q: String(req.query.q || ""),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    console.error("lookupBuilder:", err);
    return sendError(res, err);
  }
};

export const getBuilderOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ success: false, error: "Invalid project id" });
    }
    const data = await BuilderOnboardingService.getOnboardingState(projectId);
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

export const assignExistingBuilder = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.params.id || "");
    const builderId = String(req.body?.builderId || "");
    const data = await BuilderOnboardingService.assignExistingBuilder(
      projectId,
      builderId,
      asStaff(req.user),
    );
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

export const returnActiveProjectToDraft = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const projectId = String(req.params.id || "");
    const data = await BuilderOnboardingService.returnActiveProjectToDraft(
      projectId,
      asStaff(req.user),
    );
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

export const sendBuilderInvite = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.params.id || "");
    const emails = Array.isArray(req.body?.emails)
      ? req.body.emails
      : req.body?.email
        ? [req.body.email]
        : [];

    const data =
      emails.length > 1 || Array.isArray(req.body?.emails)
        ? await BuilderOnboardingService.sendBulkInvites(
            projectId,
            {
              emails,
              companyName: req.body?.companyName,
            },
            asStaff(req.user),
          )
        : await BuilderOnboardingService.sendInvite(
            projectId,
            {
              email: String(emails[0] || req.body?.email || ""),
              phone: req.body?.phone,
              companyName: req.body?.companyName,
            },
            asStaff(req.user),
          );

    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

export const requestDirectBuilderOtp = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.params.id || "");
    const data = await BuilderOnboardingService.requestDirectOtp(
      projectId,
      {
        companyName: String(req.body?.companyName || ""),
        contactName: String(req.body?.contactName || ""),
        email: String(req.body?.email || ""),
        phone: String(req.body?.phone || ""),
      },
      asStaff(req.user),
    );
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

export const verifyDirectBuilderOtp = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.params.id || "");
    const data = await BuilderOnboardingService.verifyDirectOtp(
      projectId,
      {
        otp: String(req.body?.otp || ""),
        inviteId: req.body?.inviteId,
      },
      asStaff(req.user),
    );
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

/** Super Admin / BDH: create builder (name/email/phone) with no OTP and assign Created By */
export const directCreateBuilder = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.params.id || "");
    const builderInput: {
      name: string;
      email: string;
      phone: string;
      companyName?: string;
    } = {
      name: String(req.body?.name || ""),
      email: req.body?.email ? String(req.body.email) : "",
      phone: String(req.body?.phone || ""),
    };
    if (req.body?.companyName) {
      builderInput.companyName = String(req.body.companyName);
    }
    const data = await BuilderOnboardingService.directCreateAndAssignBuilder(
      projectId,
      builderInput,
      asStaff(req.user),
    );
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

export const saveProjectContacts = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.params.id || "");
    const contacts = Array.isArray(req.body?.contacts)
      ? req.body.contacts
      : req.body?.projectContacts;
    const data = await BuilderOnboardingService.saveProjectContacts(
      projectId,
      contacts,
    );
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

export const submitProjectForApproval = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const projectId = String(req.params.id || "");
    const data = await BuilderOnboardingService.submitForApproval(
      projectId,
      asStaff(req.user),
    );

    if (data.approvalStatus === "pending" && req.user?.id) {
      const project = await FeaturedProject.findById(projectId)
        .select("title slug city locality approvalStatus")
        .lean();
      void sendPendingProjectApprovalEmail({
        project,
        posterId: req.user.id,
        posterName: req.user.name,
        posterRole: req.user.roleName,
      }).catch((error) => {
        console.error("Pending project approval email failed:", error);
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

/** Public: 1x1 open-tracking pixel */
export const trackInviteEmailOpen = async (req: Request, res: Response) => {
  try {
    const trackingId = String(req.params.trackingId || "").replace(/\.gif$/i, "");
    await BuilderOnboardingService.markEmailOpened(trackingId);
  } catch {
    // never fail pixel
  }
  const gif = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
  );
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  return res.status(200).end(gif);
};

/** Public: click tracker then redirect to preview/onboard */
export const trackInviteEmailClick = async (req: Request, res: Response) => {
  try {
    const trackingId = String(req.params.trackingId || "");
    const token = String(req.query.token || "");
    const to = String(req.query.to || "preview");
    const result = await BuilderOnboardingService.markEmailClicked(
      trackingId,
      token || undefined,
    );
    const target = result.previewUrl;
    return res.redirect(302, target);
  } catch (err: any) {
    return res
      .status(err?.statusCode || 500)
      .json({ success: false, error: err?.message || "Click tracking failed" });
  }
};

export const getPublicBuilderInvite = async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "");
    const data = await BuilderOnboardingService.getPublicInvite(token);
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

export const requestPublicInviteOtp = async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "");
    const data = await BuilderOnboardingService.requestInviteOtp(token, req.body);
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

export const completePublicInviteOnboarding = async (
  req: Request,
  res: Response,
) => {
  try {
    const token = String(req.params.token || "");
    const data = await BuilderOnboardingService.completeInviteOnboarding(token, {
      otp: String(req.body?.otp || ""),
      companyName: String(req.body?.companyName || ""),
      contactName: String(req.body?.contactName || ""),
      phone: String(req.body?.phone || ""),
      email: req.body?.email,
      projectContacts: req.body?.projectContacts || req.body?.contacts,
    });
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

export const checkPublicInvitePhone = async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "");
    const data = await BuilderOnboardingService.checkInvitePhone(
      token,
      String(req.body?.phone || ""),
    );
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};

/** After phone-OTP builder signup, claim invite (no second OTP). */
export const claimPublicInviteAfterSignup = async (
  req: Request,
  res: Response,
) => {
  try {
    const token = String(req.params.token || "");
    const data = await BuilderOnboardingService.claimInviteAfterPhoneSignup(
      token,
      {
        phone: String(req.body?.phone || ""),
        companyName: req.body?.companyName,
        contactName: req.body?.contactName || req.body?.name,
        email: req.body?.email,
        projectContacts: req.body?.projectContacts || req.body?.contacts,
      },
    );
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return sendError(res, err);
  }
};
