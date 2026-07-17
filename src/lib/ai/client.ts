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

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 500)}`);
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
