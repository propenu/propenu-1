import { Request, Response } from "express";
import { Types } from "mongoose";
import { addToShortlistService, getAgentNotificationsFeed, getAgentNotificationsSummary, getBuilderAnalytics, getBuilderFeaturedProjectShortlists, getBuilderNotificationsFeed, getBuilderNotificationsSummary, getBuilderProjectActivity, getShortlistStatusService, getUserNotificationsFeed, getUserNotificationsSummary, getUserShortlistService, markNotificationFeedSeen, removeFromShortlistService } from "../services/shortlistService";
import { AuthRequest } from "../middlewares/authMiddleware";

const authUserObjectId = (req: AuthRequest) => {
  const raw = req.user?._id || req.user?.sub || req.user?.id;
  if (!raw) return null;
  return new Types.ObjectId(String(raw));
};


/* ADD TO SHORTLIST */
export const addToShortlist = async (req: AuthRequest, res: Response) => {
  
try {
    const userId = authUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { propertyId, propertyType  } = req.body;

    if (!propertyId || !propertyType) {
  return res.status(400).json({ message: "propertyId and propertyType required" });
}

    const result = await addToShortlistService(userId, propertyId, propertyType);

    res.status(200).json({
      success: true,
      message: "Property shortlisted",
      notification: result.notification,
    });
  } catch (error) {
    // Handle bad ObjectId or duplicate key errors more gracefully
    const err: any = error;
    if (err?.name === "CastError") {
      return res.status(400).json({ success: false, message: "Invalid propertyId" });
    }
    if (err?.message === "Invalid propertyType" || err?.message === "Property not found") {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err?.message === "This is your own property") {
      return res.status(200).json({
        success: true,
        message: "Skipped self shortlist",
      });
    }
    if (err?.code === 11000) {
      return res.status(200).json({
        success: true,
        message: "Property already shortlisted",
      });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* REMOVE FROM SHORTLIST */
export const removeFromShortlist = async (req: AuthRequest, res: Response) => {
  try {
    const userId = authUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { propertyId } = req.params; // ✅ FIX

    if (!propertyId) {
      return res.status(400).json({ message: "propertyId required" });
    }

    await removeFromShortlistService(String(userId), propertyId);

    res.status(200).json({
      success: true,
      message: "Property removed from shortlist",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};


/* GET USER SHORTLIST */
export const getMyShortlist = async (req: AuthRequest, res: Response) => {
  try {
    const userId = authUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const shortlist = await getUserShortlistService(userId);
    res.status(200).json({
      success: true,
      data: shortlist,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* SHORTLIST STATUS (for ⭐ icon) */
export const getShortlistStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const userId = req.user._id; // from auth middleware
    const { propertyId } = req.query as { propertyId: string };
    const shortlisted = await getShortlistStatusService(userId, propertyId);
    res.status(200).json({ shortlisted });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};




export const getProjectAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const builderId = req.user!.sub;   // from JWT token
    const range = (req.query.range as string) || "30d";
    const state = (req.query.state as string) || undefined;
    const city = (req.query.city as string) || undefined;
    const fromDate = (req.query.fromDate as string) || undefined;
    const toDate = (req.query.toDate as string) || undefined;

    const data = await getBuilderAnalytics(
      builderId,
      range,
      state,
      city,
      fromDate,
      toDate,
    );

    res.json(data);
  } catch (e: any) {
    console.error("ANALYTICS_ERROR:", e);
    res.status(500).json({ message: "Failed to load analytics" });
  }
};

export const getBuilderFeaturedShortlists = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const builderId = req.user?.sub;

    if (!builderId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const data = await getBuilderFeaturedProjectShortlists(builderId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("BUILDER_FEATURED_SHORTLISTS_ERROR:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load shortlisted projects" });
  }
};

const resolveBuilderContext = (req: AuthRequest) => {
  const roleName = req.user?.roleName;
  const rawBuilderAccess = req.user?.builderAccess as
    | {
        builderId?: string;
        projectIds?: string[];
      }
    | undefined;

  if (roleName === "builder" && req.user?.sub) {
    return {
      builderId: req.user.sub,
      projectIds: ["*"],
    };
  }

  if (roleName === "builder_staff" && rawBuilderAccess?.builderId) {
    return {
      builderId: rawBuilderAccess.builderId,
      projectIds: rawBuilderAccess.projectIds ?? [],
    };
  }

  return null;
};

export const getBuilderProjectActivityController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const builderContext = resolveBuilderContext(req);

    if (!builderContext?.builderId) {
      return res.status(403).json({
        success: false,
        message: "Only builders can access project activity",
      });
    }

    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "projectId is required",
      });
    }

    const data = await getBuilderProjectActivity(
      builderContext.builderId,
      projectId,
      builderContext.projectIds,
    );

    return res.status(200).json(data);
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 500;

    if (statusCode === 403) {
      return res.status(403).json({
        success: false,
        message: error?.message || "Project access denied",
      });
    }

    if (statusCode === 404) {
      return res.status(404).json({
        success: false,
        message: error?.message || "Project not found",
      });
    }

    if (error?.message === "Invalid builderId" || error?.message === "Invalid projectId") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("BUILDER_PROJECT_ACTIVITY_ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load project activity",
    });
  }
};

export const getBuilderNotificationsController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const builderContext = resolveBuilderContext(req);

    if (!builderContext?.builderId) {
      return res.status(403).json({
        success: false,
        message: "Only builders can access notifications",
      });
    }

    const data = await getBuilderNotificationsFeed(
      builderContext.builderId,
      builderContext.projectIds,
    );

    return res.status(200).json(data);
  } catch (error: any) {
    if (error?.message === "Invalid builderId") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("BUILDER_NOTIFICATIONS_ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load notifications",
    });
  }
};

export const getBuilderNotificationsSummaryController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const builderContext = resolveBuilderContext(req);

    if (!builderContext?.builderId) {
      return res.status(403).json({
        success: false,
        message: "Only builders can access notification summary",
      });
    }

    const data = await getBuilderNotificationsSummary(
      builderContext.builderId,
      builderContext.projectIds,
    );

    return res.status(200).json(data);
  } catch (error: any) {
    if (error?.message === "Invalid builderId") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("BUILDER_NOTIFICATION_SUMMARY_ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load notification summary",
    });
  }
};

export const getAgentNotificationsController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const data = await getAgentNotificationsFeed(req.user.sub);
    return res.status(200).json(data);
  } catch (error: any) {
    if (error?.message === "Invalid ownerId") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("AGENT_NOTIFICATIONS_ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load notifications",
    });
  }
};

export const getAgentNotificationsSummaryController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const data = await getAgentNotificationsSummary(req.user.sub);
    return res.status(200).json(data);
  } catch (error: any) {
    if (error?.message === "Invalid ownerId") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("AGENT_NOTIFICATION_SUMMARY_ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load notification summary",
    });
  }
};

export const getUserNotificationsController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const data = await getUserNotificationsFeed(req.user.sub);
    return res.status(200).json(data);
  } catch (error: any) {
    if (error?.message === "Invalid userId") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("USER_NOTIFICATIONS_ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load notifications",
    });
  }
};

export const getUserNotificationsSummaryController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const data = await getUserNotificationsSummary(req.user.sub);
    return res.status(200).json(data);
  } catch (error: any) {
    if (error?.message === "Invalid userId") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("USER_NOTIFICATION_SUMMARY_ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load notification summary",
    });
  }
};

export const markBuilderNotificationsSeenController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const builderContext = resolveBuilderContext(req);

    if (!builderContext?.builderId || !req.user?.sub) {
      return res.status(403).json({
        success: false,
        message: "Only builders can update notifications",
      });
    }

    const data = await markNotificationFeedSeen(req.user.sub, "builder");
    return res.status(200).json(data);
  } catch (error: any) {
    if (error?.message === "Invalid userId") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update notifications",
    });
  }
};

export const markAgentNotificationsSeenController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const data = await markNotificationFeedSeen(req.user.sub, "agent");
    return res.status(200).json(data);
  } catch (error: any) {
    if (error?.message === "Invalid userId") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update notifications",
    });
  }
};

export const markUserNotificationsSeenController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const data = await markNotificationFeedSeen(req.user.sub, "user");
    return res.status(200).json(data);
  } catch (error: any) {
    if (error?.message === "Invalid userId") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update notifications",
    });
  }
};


export const syncShortlist = async (req: AuthRequest, res: Response) => {
  try {
    const userId = authUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { properties } = req.body;

    if (!properties || !Array.isArray(properties)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shortlist data",
      });
    }

    for (const item of properties) {
      await addToShortlistService(
        userId,
        item.propertyId,
        item.propertyType
      );
    }

    res.status(200).json({
      success: true,
      message: "Shortlist synced successfully",
    });
  } catch (error) {
    console.error("SYNC_SHORTLIST_ERROR", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
