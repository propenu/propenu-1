import mongoose from "mongoose";
import Counter from "../models/counterModel";
import HomeLoanApplication from "../models/homeLoanApplicationModel";
import Role from "../models/roleModel";
import {
  anyTerritoryCovers,
  sanitizeWorkingLocations,
  type WorkingLocationInput,
} from "./workingLocations";

const CCE_ROLE_NAMES = [
  "customer_care",
  "customer_care_executive",
  "customer_care_executives",
] as const;

/** Same counter keys as the Client Progress Queue follow-up assigner. */
const GLOBAL_RR_KEY = "follow-up-cce-round-robin";
const LOCATION_RR_KEY = "follow-up-cce-location-round-robin";

type AssignMethod = "location_round_robin" | "round_robin" | "existing_owner";

type Executive = {
  userId: string;
  state: string;
  city: string;
  locality: string;
  workingLocations: WorkingLocationInput[];
};

const users = () => mongoose.connection.collection("users");

const nextRoundRobinIndex = async (size: number, key: string) => {
  if (size <= 0) return 0;
  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  const seq = Math.max(0, Number(doc?.seq || 1) - 1);
  return seq % size;
};

const effectiveTerritories = (exec: Executive): WorkingLocationInput[] => {
  const stored = sanitizeWorkingLocations(exec.workingLocations);
  if (stored.length) return stored;
  return sanitizeWorkingLocations([
    { state: exec.state || "", city: exec.city || "", locality: exec.locality || "" },
  ]);
};

const covers = (exec: Executive, location: WorkingLocationInput) =>
  anyTerritoryCovers(effectiveTerritories(exec), location);

async function listCustomerCareExecutives(): Promise<Executive[]> {
  const roles = await Role.find({ name: { $in: [...CCE_ROLE_NAMES] } })
    .select("_id")
    .lean();
  const roleIds = roles.map((role) => role._id);
  if (!roleIds.length) return [];

  const rows = await users()
    .find({
      roleId: { $in: roleIds },
      isActive: { $ne: false },
      accountStatus: "active",
    })
    .project({ state: 1, city: 1, locality: 1, workingLocations: 1 })
    .toArray();

  return rows
    .map((row) => ({
      userId: String(row._id),
      state: String(row.state || ""),
      city: String(row.city || ""),
      locality: String(row.locality || ""),
      workingLocations: Array.isArray(row.workingLocations) ? row.workingLocations : [],
    }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

async function pickExecutive(location?: WorkingLocationInput | null) {
  const pool = await listCustomerCareExecutives();
  if (!pool.length) return null;

  if (location?.state) {
    const localPool = pool.filter((exec) => covers(exec, location));
    if (localPool.length) {
      const index = await nextRoundRobinIndex(localPool.length, LOCATION_RR_KEY);
      const selected = localPool[index] || localPool[0];
      if (!selected) return null;
      return { userId: selected.userId, method: "location_round_robin" as const };
    }
  }

  const index = await nextRoundRobinIndex(pool.length, GLOBAL_RR_KEY);
  const selected = pool[index] || pool[0];
  if (!selected) return null;
  return { userId: selected.userId, method: "round_robin" as const };
}

const phoneNeedles = (mobile: string) => {
  const digits = String(mobile || "").replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) return [];
  return [digits, `91${digits}`, `+91${digits}`];
};

export async function findLoanUser(application: {
  userId?: mongoose.Types.ObjectId | null;
  mobileNumber?: string;
}) {
  if (application.userId && mongoose.Types.ObjectId.isValid(String(application.userId))) {
    const byId = await users().findOne(
      { _id: new mongoose.Types.ObjectId(String(application.userId)) },
      {
        projection: {
          name: 1,
          phone: 1,
          email: 1,
          accountStatus: 1,
          state: 1,
          city: 1,
          locality: 1,
          tempState: 1,
          tempCity: 1,
          followUpAssignedTo: 1,
          createdAt: 1,
        },
      },
    );
    if (byId) return byId;
  }

  const needles = phoneNeedles(String(application.mobileNumber || ""));
  if (!needles.length) return null;
  return users().findOne(
    { phone: { $in: needles } },
    {
      projection: {
        name: 1,
        phone: 1,
        email: 1,
        accountStatus: 1,
        state: 1,
        city: 1,
        locality: 1,
        tempState: 1,
        tempCity: 1,
        followUpAssignedTo: 1,
        createdAt: 1,
      },
    },
  );
}

const locationOf = (user: any): WorkingLocationInput | null => {
  const state = String(user?.state || "").trim();
  if (state) {
    return {
      state,
      city: String(user?.city || "").trim() || undefined,
      locality: String(user?.locality || "").trim() || undefined,
    };
  }
  const tempState = String(user?.tempState || "").trim();
  if (!tempState) return null;
  return {
    state: tempState,
    city: String(user?.tempCity || "").trim() || undefined,
  };
};

async function ownerStillCovers(ownerId: string, location: WorkingLocationInput | null) {
  if (!location?.state) return true;
  if (!mongoose.Types.ObjectId.isValid(ownerId)) return false;
  const owner = await users().findOne(
    { _id: new mongoose.Types.ObjectId(ownerId), isActive: { $ne: false } },
    { projection: { state: 1, city: 1, locality: 1, workingLocations: 1 } },
  );
  if (!owner) return false;
  const exec: Executive = {
    userId: ownerId,
    state: String(owner.state || ""),
    city: String(owner.city || ""),
    locality: String(owner.locality || ""),
    workingLocations: Array.isArray(owner.workingLocations) ? owner.workingLocations : [],
  };
  return covers(exec, location);
}

/**
 * Attach one customer-care owner to a saved home-loan form.
 * Existing follow-up owner is kept. Otherwise the Client Progress Queue
 * location round-robin (then global round-robin) picks the next executive.
 */
export async function assignHomeLoan(applicationId: string) {
  if (!mongoose.Types.ObjectId.isValid(applicationId)) return null;
  const application = await HomeLoanApplication.findById(applicationId);
  if (!application || application.assignedTo) return application;

  const user = await findLoanUser(application);
  const location = locationOf(user);
  const existingOwner = user?.followUpAssignedTo ? String(user.followUpAssignedTo) : "";

  let ownerId = "";
  let method: AssignMethod = "round_robin";

  if (existingOwner && (await ownerStillCovers(existingOwner, location))) {
    ownerId = existingOwner;
    method = "existing_owner";
  } else {
    const picked = await pickExecutive(location);
    if (!picked) return application;
    ownerId = picked.userId;
    method = picked.method;
    if (user?._id) {
      const assignedAt = new Date();
      await users().updateOne(
        {
          _id: user._id,
          $or: [{ followUpAssignedTo: null }, { followUpAssignedTo: { $exists: false } }],
        },
        {
          $set: {
            followUpAssignedTo: new mongoose.Types.ObjectId(ownerId),
            followUpAssignedAt: assignedAt,
            followUpAssignMethod: method,
            followUpWorkStatus: "assigned",
            followUpWorkUpdatedAt: assignedAt,
          },
        },
      );
    }
  }

  if (!mongoose.Types.ObjectId.isValid(ownerId)) return application;

  return HomeLoanApplication.findOneAndUpdate(
    {
      _id: application._id,
      $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }],
    },
    {
      $set: {
        assignedTo: new mongoose.Types.ObjectId(ownerId),
        assignedAt: new Date(),
        assignMethod: method,
        ...(user?._id && !application.userId ? { userId: user._id } : {}),
      },
    },
    { new: true },
  );
}

/** Assign a small batch of saved forms that still have no owner. */
export async function ensureUnassignedHomeLoans(limit = 12) {
  const pending = await HomeLoanApplication.find({
    $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }],
  })
    .sort({ createdAt: 1 })
    .select("_id")
    .limit(Math.min(20, Math.max(1, limit)))
    .lean();

  for (const row of pending) {
    await assignHomeLoan(String(row._id));
  }
  return pending.length;
}
