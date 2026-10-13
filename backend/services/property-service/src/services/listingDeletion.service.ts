import mongoose from "mongoose";
import User from "../models/userModel";
import {
  archiveDeletedProperty,
  archiveEventFromActor,
  ListingCategory,
} from "./deletedPropertyArchive.service";

export type ListingActor = {
  id?: string | undefined;
  name?: string | undefined;
  email?: string | undefined;
  roleName?: string | undefined;
};

export async function resolveListingActor(
  actor?: ListingActor | null,
): Promise<ListingActor> {
  const id = String(actor?.id || "");
  let name = String(actor?.name || "");
  let email = String(actor?.email || "");
  let roleName = String(actor?.roleName || "");
  if (id && mongoose.Types.ObjectId.isValid(id) && (!name || !email || !roleName)) {
    const user = await User.findById(id).select("name email roleName").lean();
    name = name || String(user?.name || "");
    email = email || String(user?.email || "");
    roleName = roleName || String((user as { roleName?: string })?.roleName || "");
  }
  return { id, name, email, roleName };
}

const objectIdOf = (id?: string) =>
  id && mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : undefined;

/** Soft-delete. The live row stays, with who deactivated it and when. */
export async function deactivateListing(
  Model: mongoose.Model<any>,
  id: string,
  actor?: ListingActor | null,
) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");
  const property = await Model.findById(id);
  if (!property) return null;

  const who = await resolveListingActor(actor);
  const now = new Date();
  const userId = objectIdOf(who.id);

  property.status = "deactivated";
  property.isPublished = false;
  property.deactivatedAt = now;
  if (userId) {
    property.deactivatedBy = userId;
    property.updatedBy = userId;
  }
  property.deactivationActor = {
    userId,
    name: who.name || "",
    email: who.email || "",
    roleName: who.roleName || "",
  };
  property.lastUpdatedBy = {
    userId,
    name: who.name || "",
    email: who.email || "",
    roleName: who.roleName || "",
    updatedAt: now,
  };

  const history = Array.isArray(property.updateHistory) ? property.updateHistory : [];
  history.push({
    userId,
    name: who.name || "",
    email: who.email || "",
    roleName: who.roleName || "",
    updatedAt: now,
  });
  property.updateHistory = history;
  property.updateCount = Number(property.updateCount || 0) + 1;
  await property.save();
  return property;
}

/**
 * Copy the full listing into deleted properties, then remove the live row.
 * Media stays so the details page can still open the saved gallery.
 */
export async function permanentlyDeleteListing(
  Model: mongoose.Model<any>,
  category: ListingCategory,
  id: string,
  actor?: ListingActor | null,
) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");
  const existing = await Model.findById(id).lean();
  if (!existing) return null;

  const status = String((existing as { status?: string }).status || "").toLowerCase();
  if (status !== "deactivated" && !(existing as { deactivatedAt?: Date }).deactivatedAt) {
    throw new Error("Property must be deactivated first before permanent delete");
  }

  const who = await resolveListingActor(actor);
  const removedAt = new Date();
  const archived = await archiveDeletedProperty(category, existing, {
    purged: true,
    event: archiveEventFromActor("permanently_deleted", removedAt, who),
  });
  if (!archived) {
    throw new Error("Could not save the deleted property copy");
  }
  await Model.findByIdAndDelete(id);
  return { id, category };
}
