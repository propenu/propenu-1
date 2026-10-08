export type PermissionAction = { key: string; label: string };
export type PermissionModule = {
  key: string;
  label: string;
  description: string;
  actions: PermissionAction[];
};

const definePermissionModule = (
  key: string,
  label: string,
  description: string,
  actions: Array<string | [string, string]>,
): PermissionModule => ({
  key,
  label,
  description,
  actions: actions.map((action) => {
    const [value, actionLabel] = Array.isArray(action) ? action : [action, action];
    return { key: `${key}:${value}`, label: actionLabel.replace(/_/g, " ") };
  }),
});

export const PERMISSION_CATALOG: PermissionModule[] = [
  definePermissionModule("dashboard", "Dashboard", "Opens this role's own dashboard.", [["view", "View"]]),
  definePermissionModule("user", "Users", "Manage Propenu customer accounts.", ["create", "view", "update", "delete", "activate", "deactivate", ["assign_role", "Assign role"], ["assign_manager", "Assign manager"]]),
  definePermissionModule("role", "Roles & permissions", "Create roles and control access.", ["create", "view", "update", "delete", ["update_permissions", "Update permissions"], "activate", "deactivate"]),
  definePermissionModule("builder", "Builders", "Manage builder organisations and profiles.", ["create", "view", "update", "delete", "verify", "activate", "deactivate", ["view_profile", "View profile"], ["update_profile", "Update profile"]]),
  definePermissionModule("builder_staff", "Builder staff", "Manage members belonging to builders.", ["create", "view", "update", "delete", "activate", "deactivate", ["assign_role", "Assign role"]]),
  definePermissionModule("agent", "Agents", "Manage agent accounts and verification.", ["create", "view", "edit", "update", "delete", "verify", "activate", "deactivate", ["view_stats", "View statistics"]]),
  definePermissionModule("team", "Teams & managers", "Manage reporting lines and team access.", ["create", "view", "update", "delete", ["add_member", "Add member"], ["remove_member", "Remove member"], ["assign_manager", "Assign manager"], ["view_performance", "View performance"]]),
  definePermissionModule("project", "Projects", "Manage projects and their lifecycle.", ["create", "view", "edit", "update", "delete", "approve", "reject", "activate", "deactivate", "transfer", "promote", ["view_drafts", "View drafts"], ["verify_document", "Verify document"]]),
  definePermissionModule("residential", "Residential", "Manage residential properties.", ["create", "view", "update", "delete", ["view_drafts", "View drafts"], "approve", "reject", "activate", "deactivate", ["verify_document", "Verify document"], "promote", ["manage_gallery", "Manage gallery"]]),
  definePermissionModule("commercial", "Commercial", "Manage commercial properties.", ["create", "view", "update", "delete", ["view_drafts", "View drafts"], "approve", "reject", "activate", "deactivate", ["verify_document", "Verify document"], "promote", ["manage_gallery", "Manage gallery"]]),
  definePermissionModule("land", "Land", "Manage land properties.", ["create", "view", "update", "delete", ["view_drafts", "View drafts"], "approve", "reject", "activate", "deactivate", ["verify_document", "Verify document"], "promote", ["manage_gallery", "Manage gallery"]]),
  definePermissionModule("agricultural", "Agricultural", "Manage agricultural properties.", ["create", "view", "update", "delete", ["view_drafts", "View drafts"], "approve", "reject", "activate", "deactivate", ["verify_document", "Verify document"], "promote", ["manage_gallery", "Manage gallery"]]),
  definePermissionModule("featured_property", "Featured properties", "Manage featured inventory and placement.", ["create", "view", "update", "delete", "promote", "renew", "expire", "reset", ["manage_gallery", "Manage gallery"]]),
  definePermissionModule("highlight_project", "Highlight projects", "Manage highlighted project placements.", ["create", "view", "update", "delete", "feature", "unfeature"]),
  definePermissionModule("promotion", "Promotions", "Manage property promotion lifecycle.", ["create", "view", "update", "delete", "approve", "renew", "expire", "reset"]),
  definePermissionModule("lead", "Leads", "Manage enquiries, ownership and exports.", ["create", "view", "edit", "update", "delete", "assign", "transfer", "import", "export", "download", ["update_status", "Update status"], ["add_note", "Add note"], ["view_contacts", "View contacts"]]),
  definePermissionModule("blog", "Blogs", "Create and publish editorial content.", ["create", "view", "edit", "update", "delete", "publish", "unpublish"]),
  definePermissionModule("site_banner", "Site banner & logo", "Manage website banners (multi-size WebP) and company GIF logo.", ["create", "view", "update", "delete"]),
  definePermissionModule("kyc", "KYC", "Review and decide verification requests.", ["view", "update", "verify", "approve", "reject", ["request_changes", "Request changes"]]),
  definePermissionModule("location", "Locations", "Manage supported locations.", ["create", "view", "update", "delete", "activate", "deactivate"]),
  definePermissionModule("shortlist", "Shortlists", "Review customer shortlist insights.", ["view", ["view_analytics", "View analytics"], ["view_featured", "View featured"], "export"]),
  definePermissionModule("plan", "Plans", "Manage subscription plan definitions (Builder / Agent / Owner plans).", ["create", "view", "update", "delete", "activate", "deactivate", "assign"]),
  definePermissionModule("builder_invoice", "Builder invoices", "Create and manage builder plan invoices and PDFs.", ["create", "view", "update", "delete"]),
  definePermissionModule("subscription", "Subscriptions", "Manage customer subscriptions.", ["view", ["view_history", "View history"], "assign", "update", "cancel", "renew"]),
  definePermissionModule("payment", "Payments", "Manage payments and financial operations.", ["create", "view", "verify", "refund", ["view_reports", "View reports"], "export"]),
  definePermissionModule("ticket", "Tickets", "Manage support requests.", ["create", "view", "update", "delete", "assign", ["update_status", "Update status"], ["update_priority", "Update priority"], ["add_comment", "Add comment"], ["delete_comment", "Delete comment"], ["view_summary", "View summary"]]),
  definePermissionModule("department", "Ticket departments", "Manage support departments and members.", ["create", "view", "update", "delete", ["add_member", "Add member"], ["remove_member", "Remove member"]]),
  definePermissionModule("ticket_category", "Ticket categories", "Manage ticket classification.", ["create", "view", "update", "delete"]),
  definePermissionModule("ticket_attachment", "Ticket attachments", "Manage support attachments.", ["create", "view", "delete", ["update_scan_status", "Update scan status"]]),
  definePermissionModule("ticket_dashboard", "Ticket dashboard", "View support performance insights.", ["view", ["view_trends", "View trends"], ["view_agent_performance", "View agent performance"]]),
  definePermissionModule("email_campaign", "Email campaigns", "Manage email campaigns and delivery logs.", ["create", "view", "send", "retry", ["view_logs", "View logs"], ["view_stats", "View statistics"]]),
  definePermissionModule("whatsapp_campaign", "WhatsApp campaigns", "Manage WhatsApp campaigns and delivery logs.", ["create", "view", "send", "retry", ["view_logs", "View logs"], ["view_stats", "View statistics"]]),
  definePermissionModule("notification", "Notifications", "Send push and platform notifications.", ["create", "view", "send", "delete", "broadcast"]),
  definePermissionModule("ai_chat", "AI chat", "Use and administer AI assistance.", ["use", ["view_history", "View history"], "manage"]),
];

export const ALL_PERMISSIONS = PERMISSION_CATALOG.flatMap(({ actions }) =>
  actions.map(({ key }) => key),
);

export const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);
