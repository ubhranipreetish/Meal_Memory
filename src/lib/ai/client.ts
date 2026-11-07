/**
 * Provider-agnostic AI client (RULES.md #2: all AI calls go through src/lib/ai/).
 *
 * Default implementation: Google Gemini via its REST API (no SDK dependency,
 * so it never breaks on SDK version churn and stays easy to swap). To move to
 * Claude / Groq / Ollama later, implement the AIClient interface here and
 * change `aiClient` — nothing else in the app calls a provider directly.
 */

import { env } from "@/lib/env";

export interface GenerateOptions {
  system?: string;
  prompt: string;
  /** JSON schema (provider-neutral subset) for structured output. */
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
}

export interface AIClient {
  generateText(opts: GenerateOptions): Promise<string>;
  /** Returns parsed JSON validated by the caller (e.g. with Zod). */
  generateJSON<T = unknown>(opts: GenerateOptions & { jsonSchema: Record<string, unknown> }): Promise<T>;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Longest we'll block a user's log waiting out a rate limit before falling back. */
const MAX_RETRY_WAIT_MS = 12_000;

/** Google returns "Please retry in 30.6s" on 429 — use its number, not a guess. */
export function retryAfterMs(body: string): number | null {
  const m = /retry in ([\d.]+)s/i.exec(body);
  if (!m) return null;
  const seconds = Number(m[1]);
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null;
}

/**
 * Turn a provider HTTP failure into something worth showing a human. The raw
 * body is a wall of JSON quoting Google's billing docs — useless on a phone in
 * a kitchen. The technical detail still goes to the server log.
 */
export function aiError(status: number, body: string): Error {
  console.error(`[ai] ${status}: ${body.slice(0, 500)}`);
  if (status === 429) {
    return new Error("The free AI quota is used up for now — wait a minute, or add it manually");
  }
  if (status === 503 || status === 500) {
    return new Error("The AI service is busy right now — try again in a moment");
  }
  if (status === 400 || status === 403) {
    return new Error("The AI service rejected that request — check the API key in .env.local");
  }
  return new Error("Couldn't reach the AI service");
}

async function geminiGenerate(opts: GenerateOptions): Promise<string> {
  const model = env.geminiModel();
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${env.googleApiKey()}`;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      ...(opts.jsonSchema
        ? { responseMimeType: "application/json", responseSchema: opts.jsonSchema }
        : {}),
    },
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  // Retry transient overload (503) / rate limit (429). On 429 Google tells us
  // exactly how long to wait ("Please retry in 12.3s") — honour that instead of
  // guessing, but only while the wait is short enough that the user is still
  // watching. Longer than that and the manual-entry fallback is the kinder answer.
  let res: Response;
  let lastBody = "";
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok || attempt >= 2 || (res.status !== 503 && res.status !== 429)) break;
    lastBody = await res.text().catch(() => "");
    const wait = retryAfterMs(lastBody) ?? 4000 * (attempt + 1);
    if (wait > MAX_RETRY_WAIT_MS) break;
    await new Promise((r) => setTimeout(r, wait));
  }

  if (!res.ok) {
    throw aiError(res.status, lastBody || (await res.text().catch(() => "")));
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const out = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof out !== "string") {
    throw new Error("Gemini API returned no text content");
  }
  return out;
}

export const aiClient: AIClient = {
  generateText: (opts) => geminiGenerate(opts),
  async generateJSON<T>(opts: GenerateOptions & { jsonSchema: Record<string, unknown> }) {
    const raw = await geminiGenerate(opts);
    return JSON.parse(raw) as T;
  },
};
