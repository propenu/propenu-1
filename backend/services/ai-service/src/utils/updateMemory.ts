const knownCities = ["hyderabad", "bangalore", "bengaluru", "mumbai", "pune", "chennai", "delhi"];
const knownLocalities = ["orr", "kokapet", "tellapur", "whitefield", "jubilee hills", "ameerpet", "venkateshwara colony"];
const requestWords = [
  "i want",
  "want",
  "show",
  "search",
  "find",
  "looking for",
  "need",
  "please",
  "property",
  "properties",
  "home",
  "homes",
  "commercial",
  "residential",
  "buy",
  "sale",
  "rent",
  "lease",
  "new",
  "latest",
  "fresh",
  "some",
  "any",
  "the",
  "this",
  "that",
  "just",
  "only",
  "more",
  "other",
  "others",
  "different",
  "li",
];

function titleCase(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bOrr\b/i, "ORR");
}

function parseMoney(amount: string, unit: string) {
  const value = Number(amount);
  if (!value || Number.isNaN(value)) return undefined;
  return /cr|crore/.test(unit) ? value * 10000000 : value * 100000;
}

function extractKeyword(message: string) {
  let keyword = message.toLowerCase();

  for (const city of knownCities) {
    keyword = keyword.replace(new RegExp(`\\b${city}\\b`, "gi"), " ");
  }

  for (const locality of knownLocalities) {
    keyword = keyword.replace(new RegExp(`\\b${locality}\\b`, "gi"), " ");
  }

  for (const word of requestWords) {
    keyword = keyword.replace(new RegExp(`\\b${word}\\b`, "gi"), " ");
  }

  keyword = keyword
    .replace(/\b(?:in|near|around|at|for|under|below|upto|up to|max|within)\b/gi, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:cr|crore|crores|l|lac|lakh|lakhs|k|bhk|bk|bed|bedroom)\b/gi, " ")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return keyword.length >= 3 ? titleCase(keyword) : undefined;
}

function guidedReply(message: string) {
  const text = message.trim().toLowerCase().replace(/\s+/g, " ");

  if (text === "buy property" || text === "buy a property") {
    return { intent: "buy", listingType: "sale", propertyCategory: "residential" };
  }
  if (text === "rent property" || text === "rent a property") {
    return { intent: "rent", listingType: "rent", propertyCategory: "residential" };
  }
  if (text === "buy commercial") {
    return { intent: "buy", listingType: "sale", propertyCategory: "commercial" };
  }
  if (text === "lease commercial") {
    return { intent: "lease", listingType: "lease", propertyCategory: "commercial" };
  }
  if (text === "buy plot") {
    return { intent: "buy", listingType: "sale", propertyCategory: "land", propertyType: "plot" };
  }
  if (text === "apartment" || /^\d+\s*bhk apartment$/.test(text)) {
    return { propertyType: "apartment", propertyCategory: "residential" };
  }
  if (text === "villa" || /^\d+\s*bhk villa$/.test(text)) {
    return { propertyType: "villa", propertyCategory: "residential" };
  }
  if (text === "independent house") {
    return { propertyType: "independent_house", propertyCategory: "residential" };
  }
  if (text === "gated community") {
    return { propertyType: "gated community", propertyCategory: "residential" };
  }
  if (text === "plot") {
    return { propertyType: "plot", propertyCategory: "land" };
  }
  if (text === "show all homes") {
    return { propertyCategory: "residential", propertyType: "all" };
  }

  return null;
}

function isGreeting(message: string) {
  const text = message
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+/g, "")
    .replace(/\s+/g, " ");
  return /^(hi+|hello+|hey+|hai|helo|namaste|namaskar|good morning|good evening|good afternoon)$/.test(text);
}

export function updateMemory(memory: any, message: string) {
  if (isGreeting(message)) {
    return {
      city: memory.city,
      state: memory.state,
      analytics: false,
      quickSearch: false,
      keyword: "",
      seenSlugs: [],
    };
  }

  const choice = guidedReply(message);
  if (choice) {
    return {
      ...memory,
      ...choice,
      analytics: false,
      quickSearch: false,
      keyword: "",
    };
  }

  const lower = message.toLowerCase();
  const hasPropertyRequest =
    /\b(home|homes|property|properties|apartment|apartments|flat|flats|bhk|bk|villa|villas|plot|plots|land|commercial|office|shop|warehouse|showroom|retail|project|projects)\b/.test(lower);

  const next = hasPropertyRequest
    ? {
        city: memory.city,
        state: memory.state,
        seenSlugs: memory.seenSlugs || [],
        analytics: false,
        quickSearch: true,
        keyword: "",
      }
    : { ...memory, analytics: false, quickSearch: false };

  const keyword = extractKeyword(message);
  if (keyword && (hasPropertyRequest || next.locality)) {
    next.keyword = keyword;
    next.intent = next.intent || "buy";
    next.listingType = next.listingType || "sale";
    next.quickSearch = true;
  }

  if (/\b(buy|purchase|sale)\b/.test(lower)) {
    next.intent = "buy";
    next.listingType = "sale";
  }

  if (/\brent\b/.test(lower)) {
    next.intent = "rent";
    next.listingType = "rent";
  }

  if (/\blease\b/.test(lower)) {
    next.intent = "lease";
    next.listingType = "lease";
  }

  if (!hasPropertyRequest && /\b(analytics?|market|trends?|insights?|dashboard|data)\b/.test(lower)) {
    next.analytics = true;
  }

  if (/\b(villa|villas)\b/.test(lower)) {
    next.propertyType = "villa";
    next.propertyCategory = "residential";
  }

  if (/\b(home|homes|property|properties)\b/.test(lower)) {
    next.intent = next.intent || "buy";
    next.listingType = next.listingType || "sale";
    next.propertyCategory = "residential";
    next.quickSearch = true;
  }

  if (/\b(apartment|apartments|flat|flats|bhk|bk)\b/.test(lower)) {
    next.intent = next.intent || "buy";
    next.listingType = next.listingType || "sale";
    next.propertyType = "apartment";
    next.propertyCategory = "residential";
    next.quickSearch = true;
  }

  if (/\b(independent house|house)\b/.test(lower)) {
    next.propertyType = "independent_house";
    next.propertyCategory = "residential";
  }

  if (/\b(plot|plots|land)\b/.test(lower)) {
    next.intent = next.intent || "buy";
    next.listingType = next.listingType || "sale";
    next.propertyType = "plot";
    next.propertyCategory = "land";
    next.quickSearch = true;
  }

  if (/\b(farm|agriculture|agricultural)\b/.test(lower)) {
    next.intent = next.intent || "buy";
    next.listingType = next.listingType || "sale";
    next.propertyCategory = "agricultural";
    next.quickSearch = true;
  }

  if (/\b(commercial|office|shop|warehouse|showroom|retail)\b/.test(lower)) {
    next.intent = next.intent || "buy";
    next.listingType = next.listingType || "sale";
    next.propertyCategory = "commercial";
    next.quickSearch = true;
    if (lower.includes("office")) next.propertyType = "office";
    if (lower.includes("shop")) next.propertyType = "shop";
    if (lower.includes("warehouse")) next.propertyType = "warehouse";
    if (lower.includes("showroom")) next.propertyType = "showroom";
    if (lower.includes("retail")) next.propertyType = "retail";
  }

  for (const city of knownCities) {
    if (lower.includes(city)) {
      next.city = city === "bengaluru" ? "Bangalore" : titleCase(city);
    }
  }

  const cityMatch = message.match(/\bcity\s+([a-z][a-z\s-]{2,})/i);
  if (cityMatch?.[1]) next.city = titleCase(cityMatch[1]);

  for (const locality of knownLocalities) {
    if (lower.includes(locality)) next.locality = titleCase(locality);
  }

  const localityMatch = message.match(/\b(?:in|near|around|at)\s+([a-z][a-z\s-]{2,})(?:\s+(?:under|below|upto|up to|for|with|ready|east|west|north|south)\b|$)/i);
  if (localityMatch?.[1]) {
    const candidate = titleCase(localityMatch[1]);
    if (!knownCities.includes(candidate.toLowerCase())) next.locality = candidate;
  }

  const bhkMatch = lower.match(/\b([1-9])\s*(?:bhk|bk|bed|bedroom)\b/);
  if (bhkMatch?.[1]) next.bhk = Number(bhkMatch[1]);

  const priceMatch = lower.match(/\b(?:under|below|upto|up to|max|within)\s*(\d+(?:\.\d+)?)\s*(cr|crore|crores|l|lac|lakh|lakhs)\b/);
  if (priceMatch?.[1] && priceMatch?.[2]) {
    next.maxPrice = parseMoney(priceMatch[1], priceMatch[2]);
    next.budget = /cr|crore/.test(priceMatch[2])
      ? `Under ${priceMatch[1]}Cr`
      : `Under ${priceMatch[1]}L`;
  }

  if (/under\s*50\s*(l|lac|lakh)/.test(lower)) {
    next.budget = "Under 50L";
    next.maxPrice = 5000000;
  } else if (/50\s*(l|lac|lakh)\s*-\s*1\s*(cr|crore)|\b1\s*(cr|crore)\b/.test(lower)) {
    next.budget = "50L - 1Cr";
    next.maxPrice = 10000000;
  } else if (/1\s*(cr|crore)\s*-\s*2\s*(cr|crore)|\b2\s*(cr|crore)\b/.test(lower)) {
    next.budget = "1Cr - 2Cr";
    next.maxPrice = 20000000;
  } else if (/2\s*(cr|crore)\+|3\s*(cr|crore)/.test(lower)) {
    next.budget = "2Cr - 3Cr";
    next.maxPrice = 30000000;
  }

  if (/under\s*25\s*k/.test(lower)) {
    next.budget = "Under 25K";
    next.maxPrice = 25000;
  } else if (/25\s*k\s*-\s*50\s*k/.test(lower)) {
    next.budget = "25K - 50K";
    next.maxPrice = 50000;
  } else if (/50\s*k\s*-\s*1\s*l/.test(lower)) {
    next.budget = "50K - 1L";
    next.maxPrice = 100000;
  } else if (/^1\s*l\+$/.test(lower.trim()) || /\b1\s*l\+\b/.test(lower)) {
    next.budget = "1L+";
    next.maxPrice = undefined;
  }

  if (/ready[\s-]to[\s-]move/.test(lower)) next.constructionStatus = "ready-to-move";
  if (/under[\s-]construction/.test(lower)) next.constructionStatus = "under-construction";
  if (/new[\s-]launch|new[\s-]lanch/.test(lower)) next.constructionStatus = "new-lanch";

  if (lower.includes("east facing")) next.facing = "east";
  if (lower.includes("west facing")) next.facing = "west";
  if (lower.includes("north facing")) next.facing = "north";
  if (lower.includes("south facing")) next.facing = "south";

  if (lower.includes("fully furnished")) next.furnishing = "fully-furnished";
  if (lower.includes("semi furnished") || lower.includes("semi-furnished")) next.furnishing = "semi-furnished";
  if (lower.includes("unfurnished")) next.furnishing = "unfurnished";

  if (lower.includes("negotiable")) next.isPriceNegotiable = true;
  if (/ready[\s-]to[\s-]construct/.test(lower)) next.readyToConstruct = true;

  const answeringLocality =
    Boolean(memory.city) &&
    !memory.locality &&
    Boolean(memory.intent) &&
    Boolean(memory.budget || memory.quickSearch) &&
    !hasPropertyRequest;

  if (answeringLocality) {
    const chipLocality = message.replace(/^search in\s+/i, "").trim();
    if (!next.locality && chipLocality) next.locality = titleCase(chipLocality);
    if (!next.locality && next.keyword) next.locality = next.keyword;
    next.keyword = "";
    next.quickSearch = Boolean(memory.quickSearch);
  }

  return next;
}
