import { buildShortPropertyPrompt, ShortProperty } from "../prompts/system.prompt";

let readingPaused = false;

export async function writeShortPropertyReply(
  message: string,
  properties: ShortProperty[],
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const rows = properties.slice(0, 2).filter((row) => row.title);
  if (!apiKey || readingPaused || !rows.length) return null;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5-nano";
  const prompt = buildShortPropertyPrompt(message, rows);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const text = await requestReply(apiKey, model, prompt, controller.signal, true);
    return text || null;
  } catch (error) {
    console.error(
      "Short property reply failed:",
      error instanceof Error ? error.message : "request failed",
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function requestReply(
  apiKey: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
  allowRetry: boolean,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: 80,
      reasoning_effort: "minimal",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (response.status === 400 && allowRetry) {
    return requestReplyWithoutReasoning(apiKey, model, prompt, signal);
  }

  if (response.status === 401 || response.status === 402 || response.status === 429) {
    readingPaused = true;
    console.error("Short property reply paused:", response.status);
    return "";
  }

  if (!response.ok) {
    console.error("Short property reply failed:", response.status);
    return "";
  }

  const body = await response.json() as {
    choices?: { message?: { content?: string } }[];
  };
  return String(body.choices?.[0]?.message?.content || "").trim();
}

async function requestReplyWithoutReasoning(
  apiKey: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: 80,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (response.status === 401 || response.status === 402 || response.status === 429) {
    readingPaused = true;
    console.error("Short property reply paused:", response.status);
    return "";
  }

  if (!response.ok) {
    console.error("Short property reply failed:", response.status);
    return "";
  }

  const body = await response.json() as {
    choices?: { message?: { content?: string } }[];
  };
  return String(body.choices?.[0]?.message?.content || "").trim();
}
