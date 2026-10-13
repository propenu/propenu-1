import { Request, Response }
from "express";

import { searchProperties }
from "../services/propertySearch.service";

import { sendNDJSON }
from "../utils/ndjson";

import { toPromptProperty, toPropertyCard }
from "../utils/chatPresentation";

import { writeShortPropertyReply }
from "../services/shortReply.service";

import { updateMemory }
from "../utils/updateMemory";

import { getNextStep }
from "../services/conversation.service";

import { saveMemory }
from "../memory/conversation.memory";

import { getStarterSuggestions }
from "../services/suggestion.service";

import { getCityAnalytics }
from "../services/analytics.service";

export async function chatController(
  req: Request,
  res: Response
) {

  try {

    // STREAM HEADERS
    res.setHeader(
      "Content-Type",
      "application/x-ndjson"
    );

    res.setHeader(
      "Transfer-Encoding",
      "chunked"
    );

    // USER MESSAGE
    const message =
      req.body.message || "";

    const lowerMessage =
      String(message).toLowerCase();

    const currentMessageWantsAnalytics =
      /\b(analytics?|market|trends?|insights?|dashboard|data)\b/.test(lowerMessage) &&
      !/\b(home|homes|property|properties|apartment|apartments|flat|flats|bhk|bk|villa|villas|plot|plots|land|commercial|office|shop|warehouse|showroom|retail|project|projects)\b/.test(lowerMessage);

    const context =
      req.body.context || {};

    const sessionId =
      typeof req.headers["x-session-id"] === "string"
        ? req.headers["x-session-id"]
        : "guest";

    // MEMORY
    const memory =
      updateMemory(
        req.memory || {},
        message
      );

    if (context.city && !memory.city) {
      memory.city = context.city;
    }

    if (context.state && !memory.state) {
      memory.state = context.state;
    }

    if (context.locality && !memory.locality) {
      memory.locality = String(context.locality).trim();
    }

    req.memory = memory;

    saveMemory(sessionId, memory);

    if (currentMessageWantsAnalytics) {
      const analytics =
        await getCityAnalytics(memory.city);

      sendNDJSON(res, {
        type: "message",
        content: analytics.summary ||
          `I do not have enough active listing data for ${memory.city || "this city"} yet.`,
      });

      sendNDJSON(res, {
        type: "analytics",
        analytics,
      });

      sendNDJSON(res, {
        type: "suggestions",
        options: analytics.options.length
          ? analytics.options
          : ["Show homes", "Show plots", "Show commercial"],
      });

      return res.end();
    }

    // ASK NEXT QUESTION
    const nextStep =
      await getNextStep(req.memory);

    // IF FLOW NOT COMPLETE
    if (nextStep) {

      sendNDJSON(res, nextStep);

      return res.end();
    }

    // STATUS
    sendNDJSON(res, {
      type: "status",
      message:
        "Searching properties..."
    });

    // SEARCH
    const properties =
      await searchProperties(
        req.memory
      );

    const excludeSlug = String(context.excludeSlug || "").trim();
    const seenSlugs = new Set(
      (Array.isArray(memory.seenSlugs) ? memory.seenSlugs : []).map(String),
    );
    if (excludeSlug) seenSlugs.add(excludeSlug);

    const unseen = properties.filter(
      (item) => !seenSlugs.has(String(item?.slug || "")),
    );
    const withoutCurrentPage = properties.filter(
      (item) => String(item?.slug || "") !== excludeSlug,
    );
    const picked = (unseen.length ? unseen : withoutCurrentPage).slice(0, 2);

    memory.seenSlugs = [
      ...seenSlugs,
      ...picked.map((item) => String(item?.slug || "")).filter(Boolean),
    ].slice(-30);
    saveMemory(sessionId, memory);

    // NO RESULTS
    if (!properties.length) {
      const locationLabel =
        memory.locality || memory.city || "your selected area";

      const optionLocation =
        memory.locality || memory.city || "Hyderabad";

      sendNDJSON(res, {
        type: "message",
        content:
          `I could not find matching property cards for ${locationLabel}. Try one of these property searches.`,
      });

      sendNDJSON(res, {
        type: "suggestions",
        options: [
          `Homes in ${optionLocation}`,
          `Plots in ${optionLocation}`,
          `Commercial in ${optionLocation}`,
          memory.city ? `Show analytics for ${memory.city}` : "Show market analytics",
        ],
      });

      return res.end();
    }

    if (!picked.length) {
      sendNDJSON(res, {
        type: "message",
        content: "The matching property is the one already open. Ask for another locality or property type.",
      });
      sendNDJSON(res, {
        type: "suggestions",
        options: ["Buy Property", "Rent Property", "Buy Plot", "Buy Commercial"],
      });
      return res.end();
    }

    const shortRows = picked.slice(0, 2).map(toPromptProperty);
    const shortReply = await writeShortPropertyReply(String(message), shortRows);

    const topProperties =
      picked.slice(0, 2).map(toPropertyCard);

    // STREAM PROPERTY CARDS
    for (const property of topProperties) {

      sendNDJSON(res, {
        type: "property",
        property,
      });
    }

    const cityLabel =
      memory.city ? ` in ${memory.city}` : "";

    const aiText = shortReply ||
      `I found ${properties.length} matching verified ${properties.length === 1 ? "property" : "properties"}${cityLabel}. Here are the best matches to start with.`;

    // STREAM AI RESPONSE
    sendNDJSON(res, {
      type: "message",
      content: aiText,
    });

    // RECOMMENDATION OPTIONS
    sendNDJSON(res, {
      type: "suggestions",

      options: [
        "Show more matches",
        "Compare these",
        "Explore nearby areas",
        memory.city ? `Show analytics for ${memory.city}` : "Show market analytics",
      ],
    });

    res.end();

  } catch (error) {

    console.error(
      "CHAT CONTROLLER ERROR:",
      error
    );

    sendNDJSON(res, {
      type: "error",

      message:
        "AI search failed.",
    });

    res.end();
  }
}

export async function suggestionsController(
  req: Request,
  res: Response
) {
  try {
    const city =
      typeof req.query.city === "string"
        ? req.query.city
        : undefined;

    const suggestions =
      await getStarterSuggestions(city);

    return res.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error(
      "SUGGESTIONS CONTROLLER ERROR:",
      error
    );

    return res.json({
      success: true,
      suggestions: [],
    });
  }
}
