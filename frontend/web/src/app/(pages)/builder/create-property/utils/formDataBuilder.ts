import { IFeaturedProject } from "../types";

export const buildFormData = (data: IFeaturedProject): FormData => {
  const formData = new FormData();

  // Basic Details
  if (data.title) formData.append("title", data.title);
  if (data.address) formData.append("address", data.address);
  if (data.city) formData.append("city", data.city);
  if (data.color) formData.append("color", data.color);
  if (data.currency) formData.append("currency", data.currency);
  if (data.createdBy !== undefined && data.createdBy !== null) formData.append("createdBy", data.createdBy);

  // Hero Section
  if (data.heroImage) {
    if (data.heroImage instanceof File) {
      formData.append("heroImage", data.heroImage);
    } else if (
      typeof data.heroImage === "string" &&
      !data.heroImage.includes("http")
    ) {
      formData.append("heroImage", data.heroImage);
    }
  }
  if (data.heroVideo) formData.append("heroVideo", data.heroVideo);
  if (data.heroTagline) formData.append("heroTagline", data.heroTagline);
  if (data.heroSubTagline)
    formData.append("heroSubTagline", data.heroSubTagline);
  if (data.heroDescription)
    formData.append("heroDescription", data.heroDescription);

  // Logo
  if (data.logo) {
    if (data.logo.url instanceof File) {
      formData.append("logo", data.logo.url);
    } else if (typeof data.logo.url === "string" && !data.logo.url.includes("http")) {
      formData.append("logo", data.logo.url);
    }
  }

  // BHK Details
  if (data.bhkSummary && data.bhkSummary.length > 0) {
  const safeBhk = data.bhkSummary.map((b) => ({
    ...b,
    units: (b.units || []).map((u) => ({
      ...u,
      availableCount: Math.max(0, Number(u.availableCount || 0)),
    })),
  }));

  formData.append("bhkSummary", JSON.stringify(safeBhk));
}


  // Sqft Range
  if (data.sqftRange) {
    formData.append("sqftRange", JSON.stringify(data.sqftRange));
  }

  // Possession & Units
  if (data.possessionDate)
    formData.append("possessionDate", data.possessionDate);
  if (data.launchDate)
    formData.append("launchDate", data.launchDate);
  if (data.totalTowers !== undefined && data.totalTowers !== null)
    formData.append("totalTowers", String(data.totalTowers));
  if (data.totalFloors !== undefined && data.totalFloors !== null)
    formData.append("totalFloors", data.totalFloors);
  if (data.projectArea !== undefined && data.projectArea !== null)
    formData.append("projectArea", String(data.projectArea));
  if (data.totalUnits !== undefined && data.totalUnits !== null)
    formData.append("totalUnits", String(data.totalUnits));
  if (data.availableUnits !== undefined && data.availableUnits !== null)
    formData.append("availableUnits", String(data.availableUnits));

  // RERA & Banks
  if (data.reraNumber) formData.append("reraNumber", data.reraNumber);
  if (data.banksApproved && data.banksApproved.length > 0) {
    formData.append("banksApproved", JSON.stringify(data.banksApproved));
  }

  // Amenities
  if (data.amenities && data.amenities.length > 0) {
    formData.append("amenities", JSON.stringify(data.amenities));
  }

  // MEDIA / GALLERY
  if (data.gallerySummary && data.gallerySummary.length > 0) {

    // 1️⃣ send images
    data.gallerySummary.forEach((item) => {
      if (item.url instanceof File) {
        formData.append("galleryFiles", item.url);
      }
    });

    // 2️⃣ send metadata
    formData.append(
      "gallerySummary",
      JSON.stringify(
        data.gallerySummary.map((g, i) => ({
          order: g.order ?? i + 1,
          title: g.title,
          category: g.category,
          url: typeof g.url === "string" ? g.url : undefined,
        }))
      )
    );
  }



  // ABOUT SECTION
  if (data.aboutSummary && data.aboutSummary.length > 0) {

    // image
    data.aboutSummary.forEach((item) => {
      if (item.url instanceof File) {
        formData.append("aboutImage", item.url);
      }
    });

    // metadata (REQUIRED)
    formData.append(
      "aboutSummary",
      JSON.stringify(
        data.aboutSummary.map((a) => ({
          rightContent: a.rightContent,      // 🔥 REQUIRED
          aboutDescription: a.aboutDescription,
        }))
      )
    );
  }


  // Brochure
  if (data.brochure) {
    if (data.brochure.url instanceof File) {
      formData.append("brochure", data.brochure.url);
    } else if (typeof data.brochure.url === "string") {
      formData.append("brochureUrl", data.brochure.url);
    }
  }

  // Location
  if (data.location && data.location.coordinates) {
    formData.append(
      "location",
      JSON.stringify({
        type: "Point",
        coordinates: data.location.coordinates,
      })
    );
  }
  if (data.mapEmbedUrl) formData.append("mapEmbedUrl", data.mapEmbedUrl);

  // Nearby Places
if (Array.isArray(data.nearbyPlaces) && data.nearbyPlaces.length > 0) {
  const cleanedNearby = data.nearbyPlaces
    .filter(
      (p): p is typeof p & { coordinates: [number, number] } =>
        Array.isArray(p.coordinates) &&
        p.coordinates.length === 2 &&
        p.coordinates.every((c) => typeof c === "number" && !isNaN(c))
    )
    .map((p) => ({
      name: p.name,
      type: p.type,
      distanceText: p.distanceText,
      coordinates: [
        Number(p.coordinates[0]),
        Number(p.coordinates[1]),
      ] as [number, number],
      order: p.order,
    }));

  if (cleanedNearby.length > 0) {
    formData.append("nearbyPlaces", JSON.stringify(cleanedNearby));
  }
}


  // Specifications
  if (data.specifications && data.specifications.length > 0) {
    formData.append("specifications", JSON.stringify(data.specifications));
  }

  // SEO
  if (data.metaTitle) formData.append("metaTitle", data.metaTitle);
  if (data.metaDescription)
    formData.append("metaDescription", data.metaDescription);
  if (data.metaKeywords) formData.append("metaKeywords", data.metaKeywords);

  // Status
  if (data.status) formData.append("status", data.status);
  if (data.isFeatured !== undefined)
    formData.append("isFeatured", String(data.isFeatured));
  if (data.rank) formData.append("rank", String(data.rank));

  return formData;
};

/**
 * Validates required fields for each step
 */
export const validateStep = (
  step: number,
  data: IFeaturedProject
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  switch (step) {
    case 1: // Basic Details
      if (!data.title?.trim()) errors.push("Title is required");
      if (!data.address?.trim()) errors.push("Address is required");
      if (!data.city?.trim()) errors.push("City is required");
      break;

    case 2: // Hero
      if (!data.heroImage) errors.push("Hero image is required");
      if (!data.heroTagline?.trim()) errors.push("Hero tagline is required");
      break;

    case 3: // BHK Details
      if (!data.bhkSummary || data.bhkSummary.length === 0) {
        errors.push("At least one BHK configuration is required");
      }
      break;

    case 4: // Amenities
      if (!data.amenities || data.amenities.length === 0) {
        errors.push("At least one amenity is recommended");
      }
      break;

    case 5: // Media
      if (!data.gallerySummary || data.gallerySummary.length === 0) {
        errors.push("At least one gallery image is recommended");
      }
      break;

    case 6: // About
      if (!data.aboutSummary || data.aboutSummary.length === 0) {
        errors.push("About section is recommended");
      }
      break;

    case 7: // Location
      if (!data.location?.coordinates) {
        errors.push("Location coordinates are required");
      }
      break;

    case 8: // Property Profile
      if (!data.totalUnits) errors.push("Total units is required");
      if (!data.possessionDate?.trim())
        errors.push("Possession date is required");
      break;

    case 9: // SEO
      if (!data.metaTitle?.trim()) errors.push("Meta title is required");
      if (!data.metaDescription?.trim())
        errors.push("Meta description is required");
      break;
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
