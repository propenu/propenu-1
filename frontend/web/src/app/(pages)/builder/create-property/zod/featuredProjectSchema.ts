"use client"
import { z } from "zod";

/* ---------- Sub Schemas ---------- */

const UnitSchema = z.object({
  minSqft: z.number().optional(),
  maxPrice: z.number().optional(),
  availableCount: z.number().min(0, "Available units must be 0 or more").optional(),
  plan: z.object({
    url: z.string().optional(),
    key: z.string().optional(),
    filename: z.string().optional(),
    mimetype: z.string().optional(),
  }).optional(),
}).strict();

const BhkSummarySchema = z.object({
  bhk: z.number().min(1, "BHK must be >= 1"),
  bhkLabel: z.string().optional(),
  units: z.array(UnitSchema).min(1, "At least one unit required"),
}).strict();

const GallerySchema = z.object({
  url: z.union([z.string(), z.instanceof(File)]),
  order: z.number().min(1).optional(),
  title: z.string().optional(),
  category: z.string().optional(),
}).strict();

const AboutSchema = z.object({
  aboutDescription: z.string().optional(),
  url: z.union([z.string(), z.instanceof(File)]).optional(),
  rightContent: z.string().min(1, "Content is required"),
  key: z.string().optional(),
  filename: z.string().optional(),
  mimetype: z.string().optional(),
}).strict();

const LocationSchema = z.object({
  type: z.literal('Point').optional(),
  coordinates: z
    .tuple([z.number(), z.number()])
    .refine(
      ([lng, lat]) =>
        lng >= -180 &&
        lng <= 180 &&
        lat >= -90 &&
        lat <= 90,
      "Coordinates must be [lng, lat]"
    ),
}).strict();

const AmenitySchema = z.object({
  key: z.string().min(1, "Amenity key is required"),
  title: z.string().min(1, "Amenity title is required"),
  description: z.string().optional(),
}).strict();

const BrochureSchema = z.object({
  key: z.string().optional(),
  url: z.union([z.string(), z.instanceof(File)]).optional(),
  filename: z.string().optional(),
  mimetype: z.string().optional(),
}).strict();

const LogoSchema = z.object({
  url: z.union([z.string(), z.instanceof(File)]).optional(),
  key: z.string().optional(),
  filename: z.string().optional(),
  mimetype: z.string().optional(),
}).strict();

/* ---------- STEP SCHEMAS ---------- */

export const StepSchemas = {
  1: z.object({
    title: z.string().min(1, "Title is required"),
    address: z.string().min(1, "Address is required"),
    city: z.string().min(1, "City is required"),
  }).strict(),

  2: z.object({
    heroImage: z.union([z.string(), z.instanceof(File)]).optional(),
    heroTagline: z.string().min(1, "Hero tagline is required"),
    heroSubTagline: z.string().optional(),
    heroDescription: z.string().optional(),
  }).strict(),

  3: z.object({
    bhkSummary: z.array(BhkSummarySchema).min(1, "At least one BHK configuration required"),
  }).strict(),

  4: z.object({
    amenities: z.array(AmenitySchema).min(1, "Select at least one amenity"),
  }).strict(),

  5: z.object({
    gallerySummary: z.array(GallerySchema).min(1, "Add at least one gallery image"),
  }).strict(),

  6: z.object({
    aboutSummary: z.array(AboutSchema).min(1, "Add at least one about section"),
  }).strict(),

  7: z.object({
    location: LocationSchema,
  }).strict(),

  8: z.object({
    totalUnits: z.number().min(1, "Total units must be at least 1"),
    possessionDate: z.string().min(1, "Possession date is required"),
    launchDate: z.string().optional(),
    totalTowers: z.number().optional(),
    totalFloors: z.string().optional(),
  }).strict(),

  9: z.object({
    metaTitle: z.string().min(1, "Meta title is required"),
    metaDescription: z.string().min(1, "Meta description is required"),
    metaKeywords: z.string().optional(),
  }).strict(),
};
