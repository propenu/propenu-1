import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import { resolveLeadActor } from "../services/deletedLeadArchive.service";
import {
  AccessRequestError,
  createAccessRequest,
  decideAccessRequest,
  getAccessRequestByTicket,
  listAccessRequests,
} from "../services/accessRequest.service";
import {
  isDeletedAccessArea,
  lastDeletedAccessChanges,
  listDeletedAccessHistory,
  resolveDeletedAccess,
  setHeadsDeletedAccess,
  setTeamDeletedAccess,
  subscribeDeletedAccessChanges,
} from "../services/deletedAccess.service";

/** Live push of access switch changes; clients refetch their own access on each event. */
export const streamDeletedAccessController = (req: AuthRequest, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`event: connected\ndata: {"ok":true}\n\n`);

  const unsubscribe = subscribeDeletedAccessChanges((change) => {
    res.write(`event: access\ndata: ${JSON.stringify(change)}\n\n`);
  });
  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
};

const sendRequestError = (res: Response, err: any, fallback: string) => {
  if (err instanceof AccessRequestError) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: err?.message || fallback });
};

const areasFromQuery = (value: unknown) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(isDeletedAccessArea);

export const createAccessRequestController = async (req: AuthRequest, res: Response) => {
  try {
    const data = await createAccessRequest(req, req.body?.area, req.body?.reason);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendRequestError(res, err, "Failed to create access request");
  }
};

export const listAccessRequestsController = async (req: AuthRequest, res: Response) => {
  try {
    const box = req.query.box === "pending" ? "pending" : "mine";
    const result = await listAccessRequests(req, box, req.query.page, areasFromQuery(req.query.areas));
    return res.json({ success: true, ...result });
  } catch (err) {
    return sendRequestError(res, err, "Failed to load access requests");
  }
};

export const getAccessRequestByTicketController = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getAccessRequestByTicket(req, String(req.params.ticketId || ""));
    if (!data) return res.status(404).json({ error: "No access request for this ticket" });
    return res.json({ success: true, data });
  } catch (err) {
    return sendRequestError(res, err, "Failed to load access request");
  }
};

export const decideAccessRequestController =
  (approve: boolean) => async (req: AuthRequest, res: Response) => {
    try {
      const data = await decideAccessRequest(
        req,
        String(req.params.id || ""),
        approve,
        req.body?.note,
      );
      return res.json({ success: true, data });
    } catch (err) {
      return sendRequestError(res, err, "Failed to update access request");
    }
  };

export const getDeletedAccessController = async (req: AuthRequest, res: Response) => {
  try {
    const access = await resolveDeletedAccess(req);
    let lastChanges = {};
    if (access.level === "super_admin") lastChanges = await lastDeletedAccessChanges("heads");
    else if (access.level === "head") {
      lastChanges = await lastDeletedAccessChanges("team", String(req.user?.id || ""));
    }
    return res.json({ success: true, data: { ...access, lastChanges } });
  } catch (err: any) {
    console.error("getDeletedAccess:", err);
    return res.status(500).json({ error: err.message || "Failed to load deleted access" });
  }
};

export const updateDeletedAccessController = async (req: AuthRequest, res: Response) => {
  try {
    const { area, enabled } = req.body || {};
    if (!isDeletedAccessArea(area)) {
      return res.status(400).json({
        error: "area must be properties, propertyLeads, projects or projectLeads",
      });
    }
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be true or false" });
    }

    const access = await resolveDeletedAccess(req);
    const actor = await resolveLeadActor(req);

    if (access.level === "super_admin") {
      await setHeadsDeletedAccess(area, enabled, actor);
    } else if (access.level === "head") {
      if (!access[area].canManageTeam) {
        return res.status(403).json({
          error: "Super Admin has not enabled this deleted area for heads",
        });
      }
      await setTeamDeletedAccess(area, String(req.user?.id || ""), enabled, actor);
    } else {
      return res.status(403).json({ error: "Only Super Admin or a head can change this" });
    }

    const next = await resolveDeletedAccess(req);
    const lastChanges =
      next.level === "super_admin"
        ? await lastDeletedAccessChanges("heads")
        : await lastDeletedAccessChanges("team", String(req.user?.id || ""));
    return res.json({ success: true, data: { ...next, lastChanges } });
  } catch (err: any) {
    console.error("updateDeletedAccess:", err);
    return res.status(500).json({ error: err.message || "Failed to update deleted access" });
  }
};

export const listDeletedAccessHistoryController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const access = await resolveDeletedAccess(req);
    if (access.level === "staff") {
      return res.status(403).json({ error: "Only Super Admin or a head can view this history" });
    }
    const areas = String(req.query.areas || "")
      .split(",")
      .map((value) => value.trim())
      .filter(isDeletedAccessArea);
    const result = await listDeletedAccessHistory(
      req.query.page,
      access.level === "head" ? String(req.user?.id || "") : undefined,
      areas,
    );
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("listDeletedAccessHistory:", err);
    return res.status(500).json({ error: err.message || "Failed to load history" });
  }
};
