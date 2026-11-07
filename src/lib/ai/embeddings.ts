/**
 * Food-name embeddings for fuzzy memory matching (Sprint 2).
 * Uses gemini-embedding-001 at 768 dims (matches the pgvector column).
 * Vectors are L2-normalized client-side so cosine distance is well-behaved.
 */
import { env } from "@/lib/env";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIMS = 768;

export async function embedText(text: string): Promise<number[]> {
  const url = `${GEMINI_BASE}/models/${EMBED_MODEL}:embedContent?key=${env.googleApiKey()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: EMBED_DIMS,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Embedding API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const v = data.embedding?.values;
  if (!v || v.length !== EMBED_DIMS) {
    throw new Error(`Embedding API returned ${v?.length ?? 0} dims, expected ${EMBED_DIMS}`);
  }
  // L2-normalize (truncated gemini embeddings are not normalized).
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
