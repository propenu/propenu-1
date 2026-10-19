import { Types } from "mongoose";
import FeaturedProject from "../models/featurePropertiesModel";
import Location from "../models/locationModel";
import { BuilderInvoiceRead, BuilderPlanRead } from "../models/builderPlanReadModels";
import {
  CoverageMap,
  buildNormalPromotion,
  cloneCoverage,
  describePromotion,
  isCoverageEmpty,
  normalizeSponsoredAd,
  promotionPriority,
} from "./promotionService";
import { notifyLifecycleEvent } from "./lifecycleNotificationService";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Back-to-back invoices within this gap count as one continuous paid period. */
const CHAIN_TOLERANCE_MS = 60 * 1000;

export type MainPlacement = "none" | "prime" | "featured";
export type LocationRule = "project_city" | "all_india" | "team_picks" | "fixed";
export type PromotionMode = "auto" | "plan" | "manual";
type PlanPromotionType = "normal" | "featured" | "sponsored" | "prime";

export interface PlanPackage {
  planId?: string | undefined;
  code?: string | undefined;
  title?: string | undefined;
  durationDays: number;
  mainPlacement: MainPlacement;
  sponsoredEnabled: boolean;
  locationRule: LocationRule;
  mainCoverage: CoverageMap;
  sponsoredSameAsMain: boolean;
  sponsoredAd: CoverageMap;
  visibleLeadLimit: number;
  startMode: "auto" | "team";
}

export interface PlanActor {
  userId?: string | undefined;
  name?: string | undefined;
  email?: string | undefined;
  roleName?: string | undefined;
}

export interface CoverageOverride {
  mainCoverage?: unknown;
  sponsoredSameAsMain?: boolean | undefined;
  sponsoredAd?: unknown;
}

export interface ActivePlan {
  invoice: any;
  pkg: PlanPackage;
  periodStart: Date;
  periodEnd: Date;
  chain: Array<{ id: string; start: Date; end: Date }>;
  chainIds: string[];
}

type CoverageResult =
  | {
      ok: true;
      mainCoverage: CoverageMap;
      sponsoredSameAsMain: boolean;
      sponsoredAd: CoverageMap;
    }
  | { ok: false; code: string; message: string };

const MAIN_PLACEMENTS: MainPlacement[] = ["none", "prime", "featured"];
const LOCATION_RULES: LocationRule[] = ["project_city", "all_india", "team_picks", "fixed"];

const LEGACY_PLACEMENT: Record<string, { main: MainPlacement; sponsored: boolean }> = {
  prime: { main: "prime", sponsored: false },
  featured: { main: "featured", sponsored: false },
  sponsored: { main: "none", sponsored: true },
  normal: { main: "none", sponsored: false },
};

const PLACEMENT_LABEL: Record<string, string> = { prime: "Prime", featured: "Top Selling" };

export function packageFromInvoice(invoice: any, planDoc?: any): PlanPackage {
  const src =
    invoice?.planSnapshot && typeof invoice.planSnapshot === "object"
      ? invoice.planSnapshot
      : planDoc || {};

  let main = src.mainPlacement as MainPlacement | undefined;
  let sponsored = Boolean(src.sponsoredEnabled);
  if (!main || !MAIN_PLACEMENTS.includes(main)) {
    const legacy =
      LEGACY_PLACEMENT[
        String(src.promotionType || invoice?.serviceType || "normal").toLowerCase()
      ] || LEGACY_PLACEMENT.normal!;
    main = legacy.main;
    sponsored = legacy.sponsored;
  }

  const planId = src.planId || src._id || invoice?.servicePlanId;
  return {
    planId: planId ? String(planId) : undefined,
    code: src.code,
    title: src.title || invoice?.servicePlanName,
    durationDays: Number(src.durationDays) || 30,
    mainPlacement: main,
    sponsoredEnabled: sponsored,
    locationRule: LOCATION_RULES.includes(src.locationRule) ? src.locationRule : "project_city",
    mainCoverage: normalizeSponsoredAd(src.mainCoverage),
    sponsoredSameAsMain: src.sponsoredSameAsMain !== false,
    sponsoredAd: normalizeSponsoredAd(src.sponsoredAd),
    visibleLeadLimit: Math.max(0, Math.trunc(Number(src.visibleLeadLimit) || 0)),
    startMode: src.startMode === "team" ? "team" : "auto",
  };
}

export function packageMainType(pkg: PlanPackage): PlanPromotionType {
  if (pkg.mainPlacement === "prime" || pkg.mainPlacement === "featured") return pkg.mainPlacement;
  return pkg.sponsoredEnabled ? "sponsored" : "normal";
}

export function describePackage(pkg: PlanPackage) {
  const main = PLACEMENT_LABEL[pkg.mainPlacement];
  if (main) return pkg.sponsoredEnabled ? `${main} + Sponsored` : main;
  return pkg.sponsoredEnabled ? "Sponsored" : "Listing only";
}

export function isProjectApproved(project: any) {
  const status = String(project?.status || "").toLowerCase();
  if (["inactive", "deleted", "draft", "rejected", "archived"].includes(status)) return false;
  return status === "active" || String(project?.approvalStatus || "").toLowerCase() === "approved";
}

function toObjectId(value: unknown) {
  return value && Types.ObjectId.isValid(String(value))
    ? new Types.ObjectId(String(value))
    : undefined;
}

async function allIndiaCoverage(): Promise<CoverageMap> {
  const rows = await Location.find({}).select("city state").lean();
  const map: CoverageMap = {};
  for (const row of rows as any[]) {
    const state = String(row?.state || "").trim();
    const city = String(row?.city || "").trim();
    if (!state || !city) continue;
    (map[state] ||= {})[city] = [];
  }
  return map;
}

function projectCityCoverage(project: any): CoverageMap {
  const state = String(project?.state || "").trim();
  const city = String(project?.city || "").trim();
  return state && city ? { [state]: { [city]: [] } } : {};
}

/** Locations used by this project's previous plan promotion, so a restart keeps them. */
function lastPlanCoverage(project: any): CoverageOverride | undefined {
  const history = Array.isArray(project?.promotionHistory) ? project.promotionHistory : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const row = history[i];
    if (row?.source !== "subscription") continue;
    if (isCoverageEmpty(row.mainCoverage) && isCoverageEmpty(row.sponsoredAd)) continue;
    return { mainCoverage: row.mainCoverage, sponsoredSameAsMain: false, sponsoredAd: row.sponsoredAd };
  }
  return undefined;
}

function hasOverride(override?: CoverageOverride) {
  return Boolean(
    override && (!isCoverageEmpty(override.mainCoverage) || !isCoverageEmpty(override.sponsoredAd)),
  );
}

export async function resolvePlanCoverage(
  pkg: PlanPackage,
  project: any,
  override?: CoverageOverride,
): Promise<CoverageResult> {
  const hasMain = pkg.mainPlacement !== "none";
  const wantsSponsored = pkg.sponsoredEnabled;

  const fromPicks = (picks: CoverageOverride): CoverageResult => {
    const main = hasMain ? normalizeSponsoredAd(picks.mainCoverage) : {};
    const same =
      hasMain && wantsSponsored && (picks.sponsoredSameAsMain ?? pkg.sponsoredSameAsMain);
    const sponsored = wantsSponsored
      ? same
        ? cloneCoverage(main)
        : normalizeSponsoredAd(picks.sponsoredAd)
      : {};
    return { ok: true, mainCoverage: main, sponsoredSameAsMain: Boolean(same), sponsoredAd: sponsored };
  };

  const fromWholeArea = (area: CoverageMap): CoverageResult => ({
    ok: true,
    mainCoverage: hasMain ? area : {},
    sponsoredSameAsMain: hasMain && wantsSponsored,
    sponsoredAd: wantsSponsored ? cloneCoverage(area) : {},
  });

  let result: CoverageResult;
  if (hasOverride(override)) {
    result = fromPicks(override!);
  } else if (pkg.locationRule === "project_city") {
    const area = projectCityCoverage(project);
    if (isCoverageEmpty(area)) {
      return {
        ok: false,
        code: "no_project_city",
        message: "The project has no state / city saved. Add it, or pick locations with Start from plan.",
      };
    }
    result = fromWholeArea(area);
  } else if (pkg.locationRule === "all_india") {
    const area = await allIndiaCoverage();
    if (isCoverageEmpty(area)) {
      return { ok: false, code: "no_locations", message: "No saved locations. Add them on the Locations page." };
    }
    result = fromWholeArea(area);
  } else if (pkg.locationRule === "fixed") {
    result = fromPicks({
      mainCoverage: pkg.mainCoverage,
      sponsoredSameAsMain: pkg.sponsoredSameAsMain,
      sponsoredAd: pkg.sponsoredAd,
    });
  } else {
    const previous = lastPlanCoverage(project);
    if (!previous) {
      return {
        ok: false,
        code: "needs_locations",
        message: "This plan lets the team pick locations. Use Start from plan on the project card.",
      };
    }
    result = fromPicks(previous);
  }

  if (!result.ok) return result;
  if (result.sponsoredSameAsMain && isCoverageEmpty(result.mainCoverage)) {
    return { ok: false, code: "needs_locations", message: "Pick at least one location for the plan." };
  }
  if (wantsSponsored && isCoverageEmpty(result.sponsoredAd)) {
    return { ok: false, code: "needs_locations", message: "Pick at least one Sponsored location." };
  }
  return result;
}

function invoiceStart(invoice: any) {
  const raw = invoice?.startDate || invoice?.invoiceDate || invoice?.createdAt;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/** Paid, uncancelled invoices that still cover the project, merged into one continuous period. */
export async function findActivePlan(projectId: string, now = new Date()): Promise<ActivePlan | null> {
  const propertyId = toObjectId(projectId);
  if (!propertyId) return null;

  const invoices = await BuilderInvoiceRead.find({
    propertyId,
    paymentStatus: "paid",
    promotionStatus: { $ne: "cancelled" },
    $or: [{ endDate: { $gt: now } }, { endDate: null }],
  })
    .sort({ startDate: 1, invoiceDate: 1 })
    .lean();
  if (!invoices.length) return null;

  const legacyPlanIds = invoices
    .filter((inv: any) => !inv.planSnapshot && inv.servicePlanId)
    .map((inv: any) => inv.servicePlanId);
  const plans = legacyPlanIds.length
    ? await BuilderPlanRead.find({ _id: { $in: legacyPlanIds } }).lean()
    : [];
  const planById = new Map(plans.map((plan: any) => [String(plan._id), plan]));

  const rows = invoices
    .map((inv: any) => {
      const pkg = packageFromInvoice(inv, planById.get(String(inv.servicePlanId)));
      const start = invoiceStart(inv);
      const end = inv.endDate
        ? new Date(inv.endDate)
        : new Date(start.getTime() + pkg.durationDays * DAY_MS);
      return { inv, pkg, start, end };
    })
    .filter((row) => row.end.getTime() > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (!rows.length) return null;

  const first = rows[0]!;
  const chain = [first];
  let periodEnd = first.end;
  for (const row of rows.slice(1)) {
    if (row.start.getTime() > periodEnd.getTime() + CHAIN_TOLERANCE_MS) break;
    chain.push(row);
    if (row.end.getTime() > periodEnd.getTime()) periodEnd = row.end;
  }

  const started = chain.filter((row) => row.start.getTime() <= now.getTime());
  const current = started.length ? started[started.length - 1]! : first;

  return {
    invoice: current.inv,
    pkg: current.pkg,
    periodStart: first.start,
    periodEnd,
    chain: chain.map((row) => ({ id: String(row.inv._id), start: row.start, end: row.end })),
    chainIds: chain.map((row) => String(row.inv._id)),
  };
}

async function markInvoices(ids: string[], status: string, note?: string) {
  if (!ids.length) return;
  const now = new Date();
  const update: Record<string, unknown> = {
    $set: { promotionStatus: status, ...(note ? { promotionNote: note } : {}) },
  };
  if (!note) update.$unset = { promotionNote: "" };
  await BuilderInvoiceRead.updateMany({ _id: { $in: ids.map(toObjectId) } }, update);
  if (status === "running") {
    await BuilderInvoiceRead.updateMany(
      { _id: { $in: ids.map(toObjectId) }, promotionStartedAt: { $exists: false } },
      { $set: { promotionStartedAt: now } },
    );
  }
  if (status === "ended" || status === "cancelled") {
    await BuilderInvoiceRead.updateMany(
      { _id: { $in: ids.map(toObjectId) } },
      { $set: { promotionEndedAt: now } },
    );
  }
}

/** Started invoices in the period are running; queued renewals are scheduled. */
async function markChainLive(active: ActivePlan, now = new Date()) {
  const startedIds = active.chain
    .filter((row) => row.start.getTime() <= now.getTime())
    .map((row) => row.id);
  const queuedIds = active.chain
    .filter((row) => row.start.getTime() > now.getTime())
    .map((row) => row.id);
  await markInvoices(startedIds, "running");
  await markInvoices(queuedIds, "scheduled", "Renewal queued; extends the running promotion");
}

function pushHistory(
  project: any,
  promotion: any,
  reason: string,
  actor: PlanActor | undefined,
  source: "subscription" | "manual" | "system",
) {
  const now = new Date();
  const previous = project.promotion || {};
  const history = Array.isArray(project.promotionHistory) ? project.promotionHistory : [];
  const last = history[history.length - 1];
  if (last && !last.endedAt) last.endedAt = now;

  project.promotionHistory = history;
  project.lastPromotionType = previous.type || "normal";
  project.promotionHistory.push({
    fromType: previous.type || "normal",
    toType: promotion.type || "normal",
    source,
    changedBy: toObjectId(actor?.userId),
    changedByRole: actor?.roleName,
    changedByName: actor?.name,
    changedByEmail: actor?.email,
    reason,
    startedAt: promotion.startDate || now,
    endedAt: null,
    expiresAt: promotion.boostExpiry || null,
    sponsoredEnabled: Boolean(promotion.sponsoredEnabled),
    mainCoverage: isCoverageEmpty(promotion.mainCoverage) ? undefined : promotion.mainCoverage,
    sponsoredAd: isCoverageEmpty(promotion.sponsoredAd) ? undefined : promotion.sponsoredAd,
    metadata: {
      previousPriority: previous.priority ?? 0,
      newPriority: promotion.priority ?? 0,
    },
  });
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export async function applyPlanPromotion(
  project: any,
  active: ActivePlan,
  opts: {
    deliveryMode: "auto" | "plan";
    actor?: PlanActor | undefined;
    override?: CoverageOverride | undefined;
    reason?: string | undefined;
  },
): Promise<{ ok: true; scheduled: boolean } | { ok: false; code: string; message: string }> {
  const type = packageMainType(active.pkg);
  if (type === "normal") {
    return { ok: false, code: "no_promotion", message: "This plan is listing only and has no promotion." };
  }

  const coverage = await resolvePlanCoverage(active.pkg, project, opts.override);
  if (!coverage.ok) return coverage;

  const now = new Date();
  const startDate = active.periodStart.getTime() > now.getTime() ? active.periodStart : now;
  const scheduled = startDate.getTime() > now.getTime() + 30_000;
  const previousType = project.promotion?.type || "normal";
  const isMain = type === "prime" || type === "featured";

  const promotion = {
    type,
    priority: promotionPriority(type),
    source: "subscription" as const,
    startDate,
    boostExpiry: active.periodEnd,
    visibleLeadLimit: active.pkg.visibleLeadLimit,
    enquiryLimit: 0,
    enquiriesUsed: 0,
    mainCoverage: isMain ? coverage.mainCoverage : {},
    sponsoredEnabled: isMain && active.pkg.sponsoredEnabled,
    sponsoredSameAsMain: isMain && coverage.sponsoredSameAsMain,
    sponsoredAd: coverage.sponsoredAd,
    promotedBy: {
      userId: toObjectId(opts.actor?.userId),
      name: opts.actor?.name || "Builder plan (automatic)",
      email: opts.actor?.email,
      roleName: opts.actor?.roleName || "system",
      at: now,
    },
    deliveryMode: opts.deliveryMode,
    plan: {
      invoiceId: toObjectId(active.invoice._id),
      invoiceNumber: active.invoice.invoiceNumber,
      planId: toObjectId(active.pkg.planId),
      code: active.pkg.code,
      title: active.pkg.title,
      locationRule: active.pkg.locationRule,
    },
  };

  const label = describePromotion(promotion);
  const planName = active.pkg.title || "builder plan";
  pushHistory(
    project,
    promotion,
    opts.reason ||
      (scheduled
        ? `Scheduled from ${planName} (${label}) for ${formatDay(startDate)}`
        : `Started from ${planName} (${label})`),
    opts.actor,
    "subscription",
  );

  project.promotion = promotion;
  project.markModified?.("promotion");

  if (type !== previousType) {
    const top = await FeaturedProject.findOne({
      _id: { $ne: project._id },
      "promotion.type": type,
      status: { $ne: "inactive" },
    })
      .sort({ rank: -1 })
      .select("rank")
      .lean();
    project.rank = (Number((top as any)?.rank) || 0) + 1;
  }

  await project.save();
  await markChainLive(active, now);

  if (!scheduled) {
    void notifyLifecycleEvent({
      type: "promotion_started",
      listing: project,
      kind: "project",
      category: project.categoryType,
      promotionType: type,
      expiresAt: active.periodEnd,
    });
  }

  return { ok: true, scheduled };
}

async function endPlanPromotion(project: any, reason: string) {
  const previousType = project.promotion?.type || "normal";
  const promotion = buildNormalPromotion(new Date());
  pushHistory(project, promotion, reason, undefined, "system");
  project.promotion = promotion;
  project.markModified?.("promotion");
  await project.save();

  void notifyLifecycleEvent({
    type: "promotion_expired",
    listing: project,
    kind: "project",
    category: project.categoryType,
    promotionType: previousType,
    dedupeKey: `promotion_expired:${String(project._id)}:${previousType}:plan`,
  });
}

/** Keeps a plan promotion in step with renewals and upgrades inside its paid period. */
async function refreshLinkedPromotion(project: any, active: ActivePlan, now: Date) {
  const promo = project.promotion;
  const currentId = String(active.invoice._id);
  const linkedId = String(promo.plan?.invoiceId || "");

  if (currentId !== linkedId) {
    const nextType = packageMainType(active.pkg);
    const runningSponsored = Boolean(promo.sponsoredEnabled);
    const nextSponsored = nextType !== "sponsored" && active.pkg.sponsoredEnabled;
    if (nextType !== promo.type || nextSponsored !== runningSponsored) {
      const override =
        active.pkg.locationRule === "team_picks"
          ? {
              mainCoverage: promo.mainCoverage,
              sponsoredSameAsMain: Boolean(promo.sponsoredSameAsMain),
              sponsoredAd: promo.sponsoredAd,
            }
          : undefined;
      const switched = await applyPlanPromotion(project, active, {
        deliveryMode: promo.deliveryMode === "plan" ? "plan" : "auto",
        override,
        reason: `Switched to ${active.pkg.title || "builder plan"} (${describePackage(active.pkg)})`,
      });
      if (switched.ok) return;
    }
  }

  let changed = false;
  const currentEnd = promo.boostExpiry ? new Date(promo.boostExpiry).getTime() : 0;
  if (currentEnd !== active.periodEnd.getTime()) {
    promo.boostExpiry = active.periodEnd;
    if (active.periodEnd.getTime() > currentEnd) {
      pushHistory(
        project,
        promo,
        `Builder plan renewed until ${formatDay(active.periodEnd)}`,
        undefined,
        "subscription",
      );
    }
    changed = true;
  }
  if (currentId !== linkedId) {
    promo.plan.invoiceId = toObjectId(active.invoice._id);
    promo.plan.invoiceNumber = active.invoice.invoiceNumber;
    changed = true;
  }
  if (changed) {
    project.markModified?.("promotion");
    await project.save();
  }
  await markChainLive(active, now);
}

function isLiveManualPromotion(promo: any, now: Date) {
  if (!promo?.type || promo.type === "normal") return false;
  if (promo.source === "subscription" && promo.plan?.invoiceId) return false;
  return !promo.boostExpiry || new Date(promo.boostExpiry).getTime() > now.getTime();
}

export type PlanSyncState =
  | "missing"
  | "no_plan"
  | "listing_only"
  | "waiting_team"
  | "waiting_approval"
  | "scheduled"
  | "running"
  | "ending"
  | "ended";

export async function syncProjectPlanPromotion(
  projectId: string,
): Promise<{ state: PlanSyncState; message?: string }> {
  const project: any = await FeaturedProject.findById(projectId);
  if (!project) return { state: "missing" };

  const now = new Date();
  const active = await findActivePlan(projectId, now);
  const promo = project.promotion || {};
  const linkedId =
    promo.source === "subscription" && promo.plan?.invoiceId ? String(promo.plan.invoiceId) : "";

  if (linkedId && promo.type && promo.type !== "normal") {
    if (active?.chainIds.includes(linkedId)) {
      await refreshLinkedPromotion(project, active, now);
      return { state: "running" };
    }

    const linked: any = await BuilderInvoiceRead.findById(linkedId).lean();
    if (linked && linked.paymentStatus === "paid" && linked.promotionStatus !== "cancelled") {
      return { state: "ending" };
    }

    await endPlanPromotion(
      project,
      !linked
        ? "Builder plan invoice was deleted"
        : linked.paymentStatus !== "paid"
          ? "Builder plan invoice is no longer paid"
          : "Builder plan was cancelled",
    );
    if (linked && linked.paymentStatus !== "paid") {
      await markInvoices([linkedId], "waiting_payment", "Promotion stopped: invoice not paid");
    }
    if (!active) return { state: "ended" };
  }

  if (!active) return { state: "no_plan" };

  if (packageMainType(active.pkg) === "normal") {
    await markInvoices(active.chainIds, "not_started", "Listing plan: no promotion included");
    return { state: "listing_only" };
  }

  const mode = project.promotionMode as PromotionMode | null | undefined;
  const autoAllowed = mode === "auto" || (!mode && active.invoice.deliveryMode !== "team");
  if (!autoAllowed) {
    const message =
      mode === "manual"
        ? "Project is on Direct promotions. Choose Automatic or Start from plan on the project card."
        : "Waiting for the team to press Start from plan on the project card.";
    await markInvoices(active.chainIds, "waiting_team", message);
    return { state: "waiting_team", message };
  }

  if (mode !== "auto" && isLiveManualPromotion(project.promotion, now)) {
    const message =
      "A direct promotion is running. Choose Automatic on the project card to replace it with the plan.";
    await markInvoices(active.chainIds, "waiting_team", message);
    return { state: "waiting_team", message };
  }

  if (!isProjectApproved(project)) {
    const message = "Starts automatically once the project is approved.";
    await markInvoices(active.chainIds, "waiting_approval", message);
    return { state: "waiting_approval", message };
  }

  const result = await applyPlanPromotion(project, active, { deliveryMode: "auto" });
  if (!result.ok) {
    await markInvoices(active.chainIds, "waiting_team", result.message);
    return { state: "waiting_team", message: result.message };
  }
  return { state: result.scheduled ? "scheduled" : "running" };
}

export async function syncAllPlanPromotions() {
  const now = new Date();

  await BuilderInvoiceRead.updateMany(
    {
      paymentStatus: "paid",
      endDate: { $lte: now },
      promotionStatus: { $nin: ["ended", "cancelled"] },
    },
    { $set: { promotionStatus: "ended", promotionEndedAt: now } },
  );

  const [invoiceProjects, linkedProjects] = await Promise.all([
    BuilderInvoiceRead.distinct("propertyId", {
      paymentStatus: "paid",
      promotionStatus: { $nin: ["cancelled", "ended"] },
      $or: [{ endDate: { $gt: now } }, { endDate: null }],
    }),
    FeaturedProject.distinct("_id", {
      "promotion.source": "subscription",
      "promotion.plan.invoiceId": { $exists: true, $ne: null },
      "promotion.type": { $ne: "normal" },
    }),
  ]);

  const ids = new Set([...invoiceProjects, ...linkedProjects].map(String));
  let processed = 0;
  for (const id of ids) {
    try {
      await syncProjectPlanPromotion(id);
      processed += 1;
    } catch (error) {
      console.error(`Plan promotion sync failed for project ${id}:`, error);
    }
  }
  return processed;
}

export async function getProjectPlanStatus(projectId: string) {
  const project: any = await FeaturedProject.findById(projectId)
    .select("title city state locality status approvalStatus promotion promotionMode promotionHistory")
    .lean();
  if (!project) return null;

  const now = new Date();
  const active = await findActivePlan(projectId, now);
  const promo = project.promotion || {};
  const linkedInvoiceId =
    promo.source === "subscription" && promo.plan?.invoiceId ? String(promo.plan.invoiceId) : null;
  const running = Boolean(promo.type && promo.type !== "normal");

  let plan = null;
  if (active) {
    const coverage = await resolvePlanCoverage(active.pkg, project);
    plan = {
      invoiceId: String(active.invoice._id),
      invoiceNumber: active.invoice.invoiceNumber,
      planName: active.pkg.title,
      code: active.pkg.code,
      label: describePackage(active.pkg),
      mainType: packageMainType(active.pkg),
      package: active.pkg,
      periodStart: active.periodStart,
      periodEnd: active.periodEnd,
      renewals: Math.max(0, active.chainIds.length - 1),
      deliveryMode: active.invoice.deliveryMode === "team" ? "team" : "auto",
      promotionStatus: active.invoice.promotionStatus || "not_started",
      note: active.invoice.promotionNote || null,
      coverage: coverage.ok
        ? {
            mainCoverage: coverage.mainCoverage,
            sponsoredSameAsMain: coverage.sponsoredSameAsMain,
            sponsoredAd: coverage.sponsoredAd,
          }
        : null,
      needsLocations: !coverage.ok,
      coverageMessage: coverage.ok ? null : coverage.message,
    };
  }

  return {
    projectId: String(project._id),
    mode: (project.promotionMode as PromotionMode | null) || null,
    runningMode: linkedInvoiceId
      ? promo.deliveryMode === "plan"
        ? "plan"
        : "auto"
      : running
        ? "manual"
        : null,
    approved: isProjectApproved(project),
    linkedToPlan: Boolean(linkedInvoiceId && active?.chainIds.includes(linkedInvoiceId)),
    manualRunning: isLiveManualPromotion(promo, now),
    promotion: running
      ? { type: promo.type, label: describePromotion(promo), boostExpiry: promo.boostExpiry || null }
      : null,
    plan,
  };
}
