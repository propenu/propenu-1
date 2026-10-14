import User from "../../../services/user-service/src/models/userModel";
import Role from "../../../services/user-service/src/models/roleModel";
import { filterUsersInReportingTree } from "../../../services/user-service/src/utils/reportingTree";

export const normalizeInboxRole = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Who may assign WhatsApp inbox chats. */
export const INBOX_ASSIGNER_ROLES = new Set([
  "super_admin",
  "admin",
  "operations_head",
  "operation_head",
  "customer_support_head",
  "business_development_head",
]);

/** Marketplace / end-customer roles — never assignable as inbox agents. */
const INBOX_EXCLUDED_ROLES = new Set([
  "user",
  "agent",
  "builder",
  "builder_staff",
]);

const ROLE_SEARCH_ALIASES: Record<string, string[]> = {
  customer_care: [
    "customer_care",
    "customer_care_executive",
    "customer_care_executives",
  ],
  customer_care_executive: [
    "customer_care",
    "customer_care_executive",
    "customer_care_executives",
  ],
  customer_care_executives: [
    "customer_care",
    "customer_care_executive",
    "customer_care_executives",
  ],
  customer_support_team_lead: [
    "team_lead",
    "team_leads",
    "customer_support_team_lead",
    "customer_support_team_leads",
  ],
  team_lead: [
    "team_lead",
    "team_leads",
    "customer_support_team_lead",
    "customer_support_team_leads",
  ],
  sales_agent: ["sales_agent", "sales_executive", "sales_executives"],
  sales_executive: ["sales_agent", "sales_executive", "sales_executives"],
  operations_head: ["operations_head", "operation_head"],
  operation_head: ["operations_head", "operation_head"],
  regional_manager: ["regional_manager", "regional_managers"],
};

/** Stable colors for role chips / searchable dropdown. */
type RoleColor = { bg: string; text: string; border: string; accent: string };

const ROLE_COLOR_PALETTE: RoleColor[] = [
  { bg: "#ECFDF5", text: "#047857", border: "#6EE7B7", accent: "#10B981" },
  { bg: "#EFF6FF", text: "#1D4ED8", border: "#93C5FD", accent: "#3B82F6" },
  { bg: "#FFF7ED", text: "#C2410C", border: "#FDBA74", accent: "#F97316" },
  { bg: "#F5F3FF", text: "#6D28D9", border: "#C4B5FD", accent: "#8B5CF6" },
  { bg: "#FDF2F8", text: "#BE185D", border: "#F9A8D4", accent: "#EC4899" },
  { bg: "#FFFBEB", text: "#B45309", border: "#FCD34D", accent: "#F59E0B" },
  { bg: "#F0FDFA", text: "#0F766E", border: "#5EEAD4", accent: "#14B8A6" },
  { bg: "#FEF2F2", text: "#B91C1C", border: "#FCA5A5", accent: "#EF4444" },
  { bg: "#F8FAFC", text: "#334155", border: "#CBD5E1", accent: "#64748B" },
  { bg: "#EEF2FF", text: "#4338CA", border: "#A5B4FC", accent: "#6366F1" },
];

const pickRoleColor = (index: number): RoleColor =>
  ROLE_COLOR_PALETTE[index] ?? ROLE_COLOR_PALETTE[0]!;

const ROLE_COLOR_BY_NAME: Record<string, RoleColor> = {
  super_admin: pickRoleColor(9),
  admin: pickRoleColor(9),
  ceo: pickRoleColor(8),
  operations_head: pickRoleColor(1),
  operation_head: pickRoleColor(1),
  business_development_head: pickRoleColor(2),
  regional_manager: pickRoleColor(2),
  business_development_manager: pickRoleColor(2),
  sales_manager: pickRoleColor(5),
  sales_agent: pickRoleColor(5),
  sales_executive: pickRoleColor(5),
  customer_support_head: pickRoleColor(0),
  customer_support_team_lead: pickRoleColor(0),
  team_lead: pickRoleColor(0),
  customer_care: pickRoleColor(0),
  customer_care_executive: pickRoleColor(0),
  relationship_manager: pickRoleColor(6),
  marketing_head: pickRoleColor(3),
  digital_marketing: pickRoleColor(3),
  social_media: pickRoleColor(4),
  content_team: pickRoleColor(3),
  creative_team: pickRoleColor(4),
  performance_marketing: pickRoleColor(3),
  accounts: pickRoleColor(5),
  legal_compliance: pickRoleColor(8),
  hr_administration: pickRoleColor(4),
  technical_support_head: pickRoleColor(1),
  technical_support_team: pickRoleColor(1),
};

export const getInboxRoleColor = (roleName?: string): RoleColor => {
  const key = normalizeInboxRole(roleName);
  const named = ROLE_COLOR_BY_NAME[key];
  if (named) return named;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash + key.charCodeAt(i) * (i + 1)) % ROLE_COLOR_PALETTE.length;
  }
  return pickRoleColor(hash);
};

export const formatInboxRoleLabel = (roleName?: string, label?: string) => {
  const key = normalizeInboxRole(roleName);
  if (label && String(label).trim()) return String(label).trim();
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

/** Customer-care chain that may turn the assistant on or off for a chat. */
export const INBOX_ASSISTANT_CONTROL_ROLES = new Set([
  ...INBOX_ASSIGNER_ROLES,
  "customer_care",
  "customer_care_executive",
  "customer_care_executives",
  "relationship_manager",
  "relationship_managers",
  "customer_support_team_lead",
  "customer_support_team_leads",
  "team_lead",
  "team_leads",
]);

/** Leads who cover their own chats and the people who report to them. */
export const INBOX_BRANCH_LEAD_ROLES = new Set([
  "customer_support_team_lead",
  "customer_support_team_leads",
  "team_lead",
  "team_leads",
  "relationship_manager",
  "relationship_managers",
]);

export const canAssignInboxAgent = (roleName?: string) =>
  INBOX_ASSIGNER_ROLES.has(normalizeInboxRole(roleName));

export const canControlInboxAssistant = (roleName?: string) =>
  INBOX_ASSISTANT_CONTROL_ROLES.has(normalizeInboxRole(roleName));

export const isInboxBranchLead = (roleName?: string) =>
  INBOX_BRANCH_LEAD_ROLES.has(normalizeInboxRole(roleName));

export async function listReportingDescendantIds(actorId: string) {
  const actor = String(actorId || "").trim();
  if (!actor) return [];
  const users = await User.find({ isActive: { $ne: false } })
    .select("_id managerId reportsTo")
    .lean();
  return filterUsersInReportingTree(users, actor).map((user) => String(user._id));
}

/** Heads see full inbox; other staff only see chats assigned to them. */
export const canViewAllInboxConversations = (roleName?: string) =>
  canAssignInboxAgent(roleName);

export const isInboxAssignableRole = (roleName?: string) => {
  const key = normalizeInboxRole(roleName);
  if (!key) return false;
  return !INBOX_EXCLUDED_ROLES.has(key);
};

export type InboxAssignableRole = {
  value: string;
  label: string;
  color: {
    bg: string;
    text: string;
    border: string;
    accent: string;
  };
};

export type InboxAssignableAgent = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  roleLabel: string;
};

function expandRoleNames(roleFilter: string): string[] {
  if (!roleFilter) return [];
  const aliases = ROLE_SEARCH_ALIASES[roleFilter] || [roleFilter];
  return [...new Set(aliases.map(normalizeInboxRole).filter(Boolean))];
}

/** All internal staff roles for the searchable assign dropdown. */
export async function listInboxAssignableRoles(): Promise<InboxAssignableRole[]> {
  const roles = await Role.find({
    isActive: { $ne: false },
    name: { $nin: [...INBOX_EXCLUDED_ROLES] },
  })
    .select("name label")
    .sort({ label: 1 })
    .lean();

  return roles
    .map((r: any) => {
      const value = normalizeInboxRole(r.name);
      if (!value || INBOX_EXCLUDED_ROLES.has(value)) return null;
      return {
        value,
        label: formatInboxRoleLabel(value, r.label),
        color: getInboxRoleColor(value),
      };
    })
    .filter(Boolean) as InboxAssignableRole[];
}

export async function searchInboxAssignableAgents(
  qRaw: string,
  limit = 20,
  roleFilterRaw = "",
): Promise<InboxAssignableAgent[]> {
  const q = String(qRaw || "").trim();
  const roleFilter = normalizeInboxRole(roleFilterRaw);

  const roleQuery: Record<string, unknown> = {
    isActive: { $ne: false },
    name: { $nin: [...INBOX_EXCLUDED_ROLES] },
  };

  if (roleFilter) {
    const names = expandRoleNames(roleFilter);
    if (!names.length) return [];
    roleQuery.name = { $in: names };
  }

  const roleDocs = await Role.find(roleQuery).select("_id name label").lean();
  if (!roleDocs.length) return [];

  const roleIds = roleDocs.map((r) => r._id);
  const roleMap = new Map(
    roleDocs.map((r) => [String(r._id), { name: r.name, label: r.label }]),
  );

  const match: Record<string, unknown> = {
    roleId: { $in: roleIds },
    isActive: { $ne: false },
  };

  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    match.$or = [
      { name: { $regex: safe, $options: "i" } },
      { email: { $regex: safe, $options: "i" } },
      { phone: { $regex: safe, $options: "i" } },
      { userCode: { $regex: safe, $options: "i" } },
    ];
  }

  const users = await User.find(match)
    .select("_id name email phone roleId")
    .sort({ name: 1 })
    .limit(Math.min(Math.max(limit, 1), 50))
    .lean();

  return users.map((u: any) => {
    const roleMeta = roleMap.get(String(u.roleId)) || { name: "", label: "" };
    const role = normalizeInboxRole(roleMeta.name);
    return {
      id: String(u._id),
      name: String(u.name || u.email || "Team member").trim(),
      email: u.email || "",
      phone: u.phone || "",
      role,
      roleLabel: formatInboxRoleLabel(role, roleMeta.label),
    };
  });
}

export async function resolveInboxAssignee(agentId: string): Promise<{
  assignedAgentId: string;
  assignedAgentName: string;
  assignedAgentRole: string;
} | null> {
  const id = String(agentId || "").trim();
  if (!id) {
    return {
      assignedAgentId: "",
      assignedAgentName: "",
      assignedAgentRole: "",
    };
  }

  const user = await User.findById(id)
    .select("_id name email roleId isActive")
    .populate("roleId", "name label isActive")
    .lean();

  if (!user || user.isActive === false) return null;

  const roleDoc: any = user.roleId;
  if (roleDoc?.isActive === false) return null;
  const roleName = normalizeInboxRole(roleDoc?.name);
  if (!isInboxAssignableRole(roleName)) return null;

  return {
    assignedAgentId: String(user._id),
    assignedAgentName: String(user.name || user.email || "Team member").trim(),
    assignedAgentRole: formatInboxRoleLabel(roleName, roleDoc?.label),
  };
}
