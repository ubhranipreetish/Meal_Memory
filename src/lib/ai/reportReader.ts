/**
 * Body-report analysis (Sprint 6): InBody/DEXA/blood report image or PDF →
 * structured metrics + plain-language summary. Comparison across reports is
 * SQL/code; the model only extracts and explains.
 */
import { env } from "@/lib/env";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const SYSTEM = `You read body-composition and health reports (InBody, DEXA, BMI, blood panels) for a fitness app.
Extract every metric you can find, then explain the report in simple language for a non-expert.
- metrics: key-value pairs; keys snake_case (weight_kg, skeletal_muscle_mass_kg, body_fat_pct, visceral_fat_level, bmr_kcal, bmi, ...); values numeric only.
- report_type: inbody | dexa | blood | bmi | other.
- summary: 60-120 words, plain language, encouraging but honest. This is educational, not medical advice; suggest consulting a doctor for abnormal blood values.`;

const SCHEMA = {
  type: "object",
  properties: {
    report_type: { type: "string" },
    metrics: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, value: { type: "number" } },
        required: ["key", "value"],
      },
    },
    summary: { type: "string" },
  },
  required: ["report_type", "metrics", "summary"],
} as const;

export interface ReportAnalysis {
  reportType: string;
  metrics: Record<string, number>;
  summary: string;
}

export async function analyzeReport(base64: string, mimeType: string): Promise<ReportAnalysis> {
  const url = `${GEMINI_BASE}/models/${env.geminiModel()}:generateContent?key=${env.googleApiKey()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType, data: base64 } }, { text: "Extract and explain this report." }],
        },
      ],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`Report API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Report API returned no content");
  const raw = JSON.parse(text) as { report_type: string; metrics: { key: string; value: number }[]; summary: string };
  const metrics: Record<string, number> = {};
  for (const m of raw.metrics ?? []) metrics[m.key] = m.value;
  return { reportType: raw.report_type, metrics, summary: raw.summary };
}
