import { Request, Response } from "express";
import {
  checkWhatsAppCloudHealth,
  getConversationMessages,
  listConversations,
  markConversationRead,
  normalizeWaId,
  processWhatsAppWebhookPayload,
  registerWhatsAppWebhookOverride,
  resolveExpectedWhatsAppWebhookUrl,
  sendInboxTextMessage,
  startConversation,
  syncInboxFromWhatsAppLogs,
  updateConversationMeta,
} from "./whatsappInbox.service";
import { WhatsAppConversation } from "./whatsappInbox.model";
import { whatsappInboxBus } from "./whatsappInbox.events";
import {
  canAssignInboxAgent,
  canControlInboxAssistant,
  canViewAllInboxConversations,
  isInboxBranchLead,
  listInboxAssignableRoles,
  listReportingDescendantIds,
  resolveInboxAssignee,
  searchInboxAssignableAgents,
} from "./whatsappInbox.assign";

type AuthedRequest = Request & {
  user?: { roleName?: string; sub?: string; id?: string };
};

function actorUserId(req: AuthedRequest) {
  return String(req.user?.sub || req.user?.id || "").trim();
}

async function assertCanAccessConversation(
  req: AuthedRequest,
  waIdRaw: string,
) {
  if (canViewAllInboxConversations(req.user?.roleName)) {
    return { ok: true as const };
  }
  const actorId = actorUserId(req);
  if (!actorId) {
    return { ok: false as const, status: 401, message: "Unauthorized" };
  }
  const waId = normalizeWaId(waIdRaw) || String(waIdRaw || "");
  const conversation = await WhatsAppConversation.findOne({ waId })
    .select("assignedAgentId")
    .lean();
  if (!conversation) {
    return { ok: false as const, status: 404, message: "Conversation not found" };
  }
  const assignedId = String(conversation.assignedAgentId || "");
  if (assignedId === actorId) return { ok: true as const };
  if (
    isInboxBranchLead(req.user?.roleName) &&
    assignedId &&
    (await listReportingDescendantIds(actorId)).includes(assignedId)
  ) {
    return { ok: true as const };
  }
  return {
    ok: false as const,
    status: 403,
    message: "This chat is not assigned to you.",
  };
}

async function assertCanControlAssistant(req: AuthedRequest, waIdRaw: string) {
  if (!canControlInboxAssistant(req.user?.roleName)) {
    return {
      ok: false as const,
      status: 403,
      message:
        "Only the customer-care hierarchy can change the assistant for this chat.",
    };
  }
  if (canViewAllInboxConversations(req.user?.roleName)) {
    return { ok: true as const };
  }
  return assertCanAccessConversation(req, waIdRaw);
}

export async function handleInboxWebhook(req: Request, res: Response) {
  try {
    await processWhatsAppWebhookPayload(req.body);
    return res.sendStatus(200);
  } catch (error) {
    console.error("WhatsApp inbox webhook error:", error);
    return res.sendStatus(200);
  }
}

export async function getConversations(req: AuthedRequest, res: Response) {
  try {
    const raw = String(req.query.includeCampaignLogs ?? "1").toLowerCase();
    const includeCampaignLogs = !(raw === "0" || raw === "false");
    const actorId = actorUserId(req);
    const seesAll = canViewAllInboxConversations(req.user?.roleName);

    const teamIds =
      !seesAll && actorId && isInboxBranchLead(req.user?.roleName)
        ? [actorId, ...(await listReportingDescendantIds(actorId))]
        : [];
    const conversations = await listConversations({
      q: String(req.query.q || ""),
      limit: Number(req.query.limit) || 50,
      includeCampaignLogs,
      ...(seesAll || !actorId
        ? {}
        : teamIds.length
          ? { assignedAgentIds: teamIds }
          : { onlyAssignedTo: actorId }),
    });
    return res.json({
      success: true,
      data: conversations,
      meta: {
        scope: seesAll ? "all" : "assigned",
        assignedAgentId: seesAll ? null : actorId || null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to load conversations",
    });
  }
}

export async function postSyncFromLogs(_req: Request, res: Response) {
  try {
    const result = await syncInboxFromWhatsAppLogs();
    const conversations = await listConversations({
      limit: 80,
      includeCampaignLogs: true,
    });
    return res.json({
      success: true,
      data: { ...result, conversations },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to sync inbox from logs",
    });
  }
}

export async function getCloudHealth(_req: Request, res: Response) {
  try {
    const data = await checkWhatsAppCloudHealth();
    return res.status(data.ok ? 200 : 400).json({ success: data.ok, data });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Health check failed",
    });
  }
}

/** Point Meta inbound webhook at a public Propenu HTTPS URL */
export async function postRegisterWebhook(req: Request, res: Response) {
  try {
    const fromBody = String(req.body?.callbackUrl || "").trim();
    const { expectedPublicWebhook } = resolveExpectedWhatsAppWebhookUrl();
    const callbackUrl = fromBody || expectedPublicWebhook || "";

    const data = await registerWhatsAppWebhookOverride(callbackUrl);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message:
        error?.response?.data?.error?.message ||
        error?.message ||
        "Failed to register webhook",
    });
  }
}

/** Real-time stream: webhook/dashboard events → admin UI */
export async function streamInboxEvents(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const unsubscribe = whatsappInboxBus.subscribe((event) => {
    res.write(`event: inbox\ndata: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

export async function getMessages(req: AuthedRequest, res: Response) {
  try {
    const waId = String(req.params.waId || "");
    const access = await assertCanAccessConversation(req, waId);
    if (!access.ok) {
      return res.status(access.status).json({
        success: false,
        message: access.message,
      });
    }
    const before = req.query.before ? String(req.query.before) : undefined;
    const data = await getConversationMessages(waId, {
      limit: Number(req.query.limit) || 100,
      ...(before ? { before } : {}),
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Failed to load messages",
    });
  }
}

export async function postMessage(req: AuthedRequest, res: Response) {
  try {
    const waId = String(req.params.waId || "");
    const text = String(req.body?.text || req.body?.message || "");
    const actorId = String(req.user?.sub || req.user?.id || "").trim();
    const isHead = canAssignInboxAgent(req.user?.roleName);
    const normalized = normalizeWaId(waId);

    const conversation = await WhatsAppConversation.findOne({
      waId: normalized || waId,
    })
      .select("assignedAgentId")
      .lean();

    const assignedId = String(conversation?.assignedAgentId || "").trim();

    // Heads (SA / Ops / CSH / BDH) can always reply.
    // Staff can reply only on chats assigned to them.
    if (isHead) {
      // ok
    } else if (!assignedId) {
      return res.status(403).json({
        success: false,
        message: "This chat is not assigned to you yet.",
      });
    } else if (!actorId || actorId !== assignedId) {
      return res.status(403).json({
        success: false,
        message: "Only the assigned agent or a head can reply in this chat.",
      });
    }

    const message = await sendInboxTextMessage(waId, text);
    return res.status(201).json({ success: true, data: message });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Failed to send message",
    });
  }
}

export async function postMarkRead(req: AuthedRequest, res: Response) {
  try {
    const waId = String(req.params.waId || "");
    const access = await assertCanAccessConversation(req, waId);
    if (!access.ok) {
      return res.status(access.status).json({
        success: false,
        message: access.message,
      });
    }
    const conversation = await markConversationRead(waId);
    return res.json({ success: true, data: conversation });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Failed to mark as read",
    });
  }
}

export async function postStartConversation(req: AuthedRequest, res: Response) {
  try {
    if (!canAssignInboxAgent(req.user?.roleName)) {
      return res.status(403).json({
        success: false,
        message: "Only heads can start new WhatsApp chats.",
      });
    }
    const waId = String(req.body?.waId || req.body?.phone || "");
    const profileName = String(req.body?.profileName || req.body?.name || "");
    const conversation = await startConversation(waId, profileName);
    return res.status(201).json({ success: true, data: conversation });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Failed to start conversation",
    });
  }
}

export async function getAssignableRoles(req: AuthedRequest, res: Response) {
  try {
    if (!canAssignInboxAgent(req.user?.roleName)) {
      return res.status(403).json({
        success: false,
        message:
          "Only Super Admin, Operations Head, Customer Support Head, or Business Development Head can assign agents.",
      });
    }
    const roles = await listInboxAssignableRoles();
    return res.json({ success: true, data: roles });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to load roles",
    });
  }
}

export async function getAssignableAgents(req: AuthedRequest, res: Response) {
  try {
    if (!canAssignInboxAgent(req.user?.roleName)) {
      return res.status(403).json({
        success: false,
        message:
          "Only Super Admin, Operations Head, Customer Support Head, or Business Development Head can assign agents.",
      });
    }
    const agents = await searchInboxAssignableAgents(
      String(req.query.q || ""),
      Number(req.query.limit) || 20,
      String(req.query.role || ""),
    );
    return res.json({ success: true, data: agents });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to search team members",
    });
  }
}

export async function patchConversation(req: AuthedRequest, res: Response) {
  try {
    const waId = String(req.params.waId || "");
    const patch: {
      inboxStatus?: "new" | "waiting" | "resolved";
      assignedAgentId?: string;
      assignedAgentName?: string;
      assignedAgentRole?: string;
      profileName?: string;
      botPaused?: boolean;
    } = {};

    if (typeof req.body?.botPaused === "boolean") {
      const access = await assertCanControlAssistant(req, waId);
      if (!access.ok) {
        return res.status(access.status).json({
          success: false,
          message: access.message,
        });
      }
      patch.botPaused = req.body.botPaused;
    }

    if (req.body?.inboxStatus) patch.inboxStatus = req.body.inboxStatus;
    if (patch.inboxStatus === "resolved") patch.botPaused = false;
    if (typeof req.body?.profileName === "string") {
      patch.profileName = req.body.profileName;
    }

    const assigning =
      typeof req.body?.assignedAgentId === "string" ||
      typeof req.body?.assignedAgentName === "string";

    if (assigning) {
      if (!canAssignInboxAgent(req.user?.roleName)) {
        return res.status(403).json({
          success: false,
          message:
            "Only Super Admin, Operations Head, Customer Support Head, or Business Development Head can assign agents.",
        });
      }

      const agentId =
        typeof req.body?.assignedAgentId === "string"
          ? req.body.assignedAgentId.trim()
          : "";

      // Clearing assignment
      if (!agentId) {
        patch.assignedAgentId = "";
        patch.assignedAgentName = "";
        patch.assignedAgentRole = "";
      } else {
        const resolved = await resolveInboxAssignee(agentId);
        if (!resolved) {
          return res.status(400).json({
            success: false,
            message:
              "Selected team member is not valid for WhatsApp inbox assignment.",
          });
        }
        patch.assignedAgentId = resolved.assignedAgentId;
        patch.assignedAgentName = resolved.assignedAgentName;
        patch.assignedAgentRole = resolved.assignedAgentRole;
      }
    }

    const conversation = await updateConversationMeta(waId, patch);
    return res.json({ success: true, data: conversation });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Failed to update conversation",
    });
  }
}
