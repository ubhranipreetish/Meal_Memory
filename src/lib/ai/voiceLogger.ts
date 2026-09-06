/**
 * Voice food logging (ADR-010): audio → transcript + structured items in ONE
 * Gemini call.
 *
 * Why not the Web Speech API any more: it needs `lang` declared up front
 * (en-IN *or* hi-IN), so it could never auto-detect what the user actually
 * spoke — that's what the language toggle was papering over. Gemini takes the
 * raw audio and identifies the language itself, which also means one call does
 * transcription AND parsing instead of two steps.
 *
 * Audio arrives as 16 kHz mono WAV (encoded in the browser — see LogClient)
 * because that is a format Gemini accepts everywhere and every browser can
 * produce via the Web Audio API.
 */
import { env } from "@/lib/env";
import { aiError } from "@/lib/ai/client";
import { FOOD_PARSE_SCHEMA } from "@/lib/ai/prompts/foodParse";
import { normalizeLlmResult } from "@/lib/ai/foodParser";
import type { ParseResult } from "@/types/food";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const VOICE_SYSTEM = `You are the voice food-logging engine of a personal fitness tracker used in India.
The user speaks what they ate. The audio may be English, Hindi, Hinglish (Hindi in Latin letters) or a mix — identify it yourself; the user never tells you which.

Transcription:
- "transcript" is EXACTLY what was said, verbatim, in the language and script it was spoken in. Hindi speech stays in Devanagari; Hinglish stays in Latin letters.
- Never add timestamps, speaker labels, punctuation commentary or a translation to the transcript.
- "language" is the detected language: "en", "hi", or "hinglish".

Parsing:
- Parse the spoken foods into items using the SAME rules as typed logs: item names always in English title-case, allowed units only, totals for the whole quantity eaten.
- NEVER invent a food that was not spoken. If you hear a container ("a glass", "one bowl") but cannot make out what is in it, leave that item out rather than guessing water or milk.
- If the audio is silent, unintelligible, or is not about food, return an empty items array and put whatever you did hear in the transcript.
- Speech recognition of Indian food words is error-prone: prefer the plausible Indian food over a similar-sounding English word ("char uble ande" is four boiled eggs, not "chart").`;

/** FOOD_PARSE_SCHEMA plus the transcript/language the voice path needs. */
const VOICE_SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    language: { type: "string", enum: ["en", "hi", "hinglish"] },
    ...FOOD_PARSE_SCHEMA.properties,
  },
  required: ["transcript", "items"],
} as const;

export interface VoiceParseResult extends ParseResult {
  transcript: string;
  language: string;
}

export async function parseMealAudio(audioBase64: string, mimeType = "audio/wav"): Promise<VoiceParseResult> {
  const model = env.geminiModel();
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${env.googleApiKey()}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: VOICE_SYSTEM }] },
      // Audio only — an extra text part would get transcribed into the transcript.
      contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: audioBase64 } }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: VOICE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    throw aiError(res.status, await res.text().catch(() => ""));
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Voice API returned no content");

  const raw = JSON.parse(text) as { transcript?: string; language?: string };
  const parsed = normalizeLlmResult(raw, "Voice");
  return { ...parsed, transcript: (raw.transcript ?? "").trim(), language: raw.language ?? "en" };
}
