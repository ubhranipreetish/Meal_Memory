/**
 * Deterministic pre-parser. If EVERY segment of an utterance matches a known
 * alias in the user's food memory, the log resolves with ZERO AI calls
 * (RULES.md #15 — the core economic/UX loop). Anything it can't fully handle
 * falls through to the LLM parser.
 *
 * Handles: "2 aloo parathas", "paneer paratha", "half bowl dal and a roti",
 * "2 x roti, 1 glass milk", "drank 1l water". Pure logic — unit tested.
 */

export interface QuickSegment {
  qty: number;
  unit: string | null; // explicit unit word if present
  namePart: string; // candidate food name (normalized)
  original: string; // original segment text
}

export interface QuickWater {
  ml: number;
}

/** English + Hinglish number words (voice input often comes back as Hinglish). */
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6,
  saat: 7, aath: 8, nau: 9, das: 10, aadha: 0.5, adha: 0.5, dedh: 1.5, dhai: 2.5, dhaai: 2.5,
};
const NUMBER_WORD_RE = new RegExp(`^(${Object.keys(NUMBER_WORDS).join("|")})\\s+`);

const UNIT_SINGULAR: Record<string, string> = {
  piece: "piece", pieces: "piece",
  bowl: "bowl", bowls: "bowl",
  plate: "plate", plates: "plate",
  glass: "glass", glasses: "glass",
  cup: "cup", cups: "cup",
  katori: "bowl", katoris: "bowl", // katori folds into bowl (ADR-010)
  slice: "slice", slices: "slice",
  scoop: "scoop", scoops: "scoop",
  serving: "serving", servings: "serving",
  tbsp: "tbsp", tsp: "tsp",
  // measured units: nutrition is per 100 g / 100 ml (servingSize in types/food)
  g: "g", gm: "g", gms: "g", gram: "g", grams: "g",
  ml: "ml", millilitre: "ml", milliliter: "ml",
};

/** Normalize free text for alias matching. */
export function normalizeAlias(s: string): string {
  return s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();
}

/** Candidate alias keys for a name (exact + naive singular). */
export function aliasCandidates(name: string): string[] {
  const n = normalizeAlias(name);
  const out = [n];
  if (n.endsWith("es")) out.push(n.slice(0, -2));
  if (n.endsWith("s")) out.push(n.slice(0, -1));
  return [...new Set(out)];
}

/** Detect a plain-water utterance: "drank 1l water", "500 ml water", "2 glasses of water". */
export function quickParseWater(utterance: string): QuickWater | null {
  // Keep digits + dots intact ("1.5l"); normalizeAlias would strip the dot.
  const t = utterance.toLowerCase().replace(/[^\p{L}\p{N}\s.']/gu, " ").replace(/\s+/g, " ").trim();
  if (!/\bwater\b/.test(t)) return null;
  // must be ONLY about water (no other food words beyond filler)
  const stripped = t
    .replace(/[\d.]+\s*(?:ml|l|litre|litres|liter|liters)\b/g, " ") // volume tokens first ("1l", "500 ml")
    .replace(/\b(i|had|drank|drink|some|of|just|glass|glasses|bottle|bottles|litre|liter|water|a|an|one|two|three|half)\b/g, " ")
    .replace(/[\d.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length > 0) return null;

  const num = t.match(/([\d.]+)\s*(l|litre|litres|liter|liters|ml)\b/);
  if (num) {
    const v = parseFloat(num[1]);
    if (!isFinite(v)) return null;
    return { ml: num[2] === "ml" ? Math.round(v) : Math.round(v * 1000) };
  }
  const glasses = t.match(/(\d+|a|an|one|two|three|half)\s*(glass|glasses)/);
  if (glasses) {
    const q = NUMBER_WORDS[glasses[1]] ?? parseFloat(glasses[1]);
    if (!isFinite(q)) return null;
    return { ml: Math.round(q * 250) };
  }
  const bottle = t.match(/(\d+|a|an|one|two|half)\s*(bottle|bottles)/);
  if (bottle) {
    const q = NUMBER_WORDS[bottle[1]] ?? parseFloat(bottle[1]);
    if (!isFinite(q)) return null;
    return { ml: Math.round(q * 750) };
  }
  return null;
}

/**
 * Split an utterance into food segments and extract qty/unit/name.
 * Returns null if any part looks unparseable deterministically.
 */
export function quickParseSegments(utterance: string): QuickSegment[] | null {
  // Split on separators BEFORE normalizing (normalize strips , and +).
  const rawParts = utterance
    .toLowerCase()
    .split(/\s*(?:,|\+|\band\b|\bwith\b)\s*/)
    .filter(Boolean);
  if (rawParts.length === 0) return null;

  const parts = rawParts
    .map((p) =>
      normalizeAlias(p).replace(
        /^(i (ate|had|took)|ate|had|log|logged|breakfast was|lunch was|dinner was|snack was)\s+/g,
        "",
      ),
    )
    .filter(Boolean);
  if (parts.length === 0) return null;

  const segments: QuickSegment[] = [];
  for (const part of parts) {
    const seg = parseSegment(part);
    if (!seg) return null; // one unknown shape → whole utterance goes to AI
    segments.push(seg);
  }
  return segments;
}

function parseSegment(part: string): QuickSegment | null {
  let rest = part.trim();
  if (!rest) return null;
  let qty = 1;

  // leading number or number-word ("2", "2.5", "two", "half", "1/2", "char")
  const numMatch = rest.match(/^([\d]+(?:\.\d+)?|\d+\/\d+)\s*(?:x\s+)?/);
  if (numMatch) {
    const token = numMatch[1];
    qty = token.includes("/")
      ? Number(token.split("/")[0]) / Number(token.split("/")[1])
      : parseFloat(token);
    rest = rest.slice(numMatch[0].length);
  } else {
    const wordMatch = rest.match(NUMBER_WORD_RE);
    if (wordMatch) {
      qty = NUMBER_WORDS[wordMatch[1]];
      rest = rest.slice(wordMatch[0].length);
    }
  }
  if (!isFinite(qty) || qty <= 0) return null;

  // optional unit word ("bowl of dal" / "bowls dal")
  let unit: string | null = null;
  const unitMatch = rest.match(/^(\p{L}+)\s+(?:of\s+)?/u);
  if (unitMatch && UNIT_SINGULAR[unitMatch[1]]) {
    unit = UNIT_SINGULAR[unitMatch[1]];
    rest = rest.slice(unitMatch[0].length);
  }

  const namePart = rest.trim();
  if (!namePart || namePart.length < 2) return null;
  // names with digits are suspicious → send to AI
  if (/\d/.test(namePart)) return null;
  return { qty, unit, namePart, original: part };
}
