/**
 * AI Coach (Sprint 5): daily brief + conversational Q&A.
 * All numbers come from metrics.ts (SQL); the model explains and prioritizes
 * but is explicitly forbidden from computing or inventing figures.
 */
import { eq, sql as dsql } from "drizzle-orm";
import { aiClient } from "@/lib/ai/client";
import { getDb, schema } from "@/lib/db";
import { deriveSignals, getCoachContext, type CoachContext } from "@/lib/services/metrics";

const BRIEF_SYSTEM = `You are a supportive, no-nonsense personal fitness coach inside a tracking app.
You receive the user's computed metrics as JSON. Rules:
- Use ONLY the numbers provided. Never compute, extrapolate, or invent figures.
- Explain WHY something matters, not just what happened.
- The "signals" list contains pre-computed findings. You MUST address EVERY signal marked PROBLEM (explain why it matters + what to do); mention WINs briefly.
- End with ONE clear, actionable focus for today ("Today: ...").
- Tone: encouraging, direct, zero fluff. 90-160 words. Plain text, no markdown headers.`;

const CHAT_SYSTEM = `You are the user's personal fitness coach inside their tracking app.
You receive their computed metrics as JSON plus the conversation. Rules:
- Answer using ONLY the provided numbers; if the data doesn't contain the answer, say so plainly.
- Never invent or recompute figures. "proteinRemaining" etc. are already computed for you.
- Be specific, practical and brief (under 120 words unless asked for detail).
- For food suggestions respect dietType and known facts.`;

export async function generateDailyBrief(userId: string): Promise<string> {
  const ctx = await getCoachContext(userId);
  const signals = deriveSignals(ctx);
  const brief = await aiClient.generateText({
    system: BRIEF_SYSTEM,
    prompt: `Metrics JSON:\n${JSON.stringify(ctx)}\n\nsignals (address every PROBLEM):\n${signals.map((s) => `- ${s}`).join("\n") || "- (none — steady week)"}\n\nWrite today's brief.`,
    temperature: 0.4,
  });

  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  // one brief per day — replace if regenerated
  await db
    .delete(schema.coachNotes)
    .where(
      dsql`${schema.coachNotes.userId} = ${userId} and ${schema.coachNotes.date} = ${today} and ${schema.coachNotes.kind} = 'daily_brief'`,
    );
  await db.insert(schema.coachNotes).values({
    userId,
    date: today,
    kind: "daily_brief",
    content: brief.trim(),
    sourceMetrics: ctx,
  });
  return brief.trim();
}

export async function getTodayBrief(userId: string): Promise<string | null> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .select({ content: schema.coachNotes.content })
    .from(schema.coachNotes)
    .where(
      dsql`${schema.coachNotes.userId} = ${userId} and ${schema.coachNotes.date} = ${today} and ${schema.coachNotes.kind} = 'daily_brief'`,
    )
    .limit(1);
  return row?.content ?? null;
}

export interface ChatTurn {
  role: "user" | "coach";
  text: string;
}

export async function coachChat(
  userId: string,
  message: string,
  history: ChatTurn[],
): Promise<{ reply: string; context: CoachContext }> {
  const ctx = await getCoachContext(userId);
  const signals = deriveSignals(ctx);
  const convo = history
    .slice(-8)
    .map((t) => `${t.role === "user" ? "User" : "Coach"}: ${t.text}`)
    .join("\n");
  const reply = await aiClient.generateText({
    system: CHAT_SYSTEM,
    prompt: `Metrics JSON:\n${JSON.stringify(ctx)}\n\nsignals:\n${signals.map((s) => `- ${s}`).join("\n") || "- none"}\n\n${convo ? convo + "\n" : ""}User: ${message}\nCoach:`,
    temperature: 0.5,
  });

  // Lightweight long-term memory: harvest durable facts from user statements.
  if (message.length > 25) {
    void extractFacts(userId, message).catch(() => {});
  }
  return { reply: reply.trim(), context: ctx };
}

const FACTS_SCHEMA = {
  type: "object",
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fact: { type: "string" },
          category: { type: "string", enum: ["habit", "preference", "supplement", "constraint", "other"] },
        },
        required: ["fact", "category"],
      },
    },
  },
  required: ["facts"],
} as const;

/** Extract durable user facts worth remembering (RULES: DB is the memory). */
async function extractFacts(userId: string, message: string) {
  const out = await aiClient.generateJSON<{ facts: { fact: string; category: string }[] }>({
    system:
      "Extract durable personal facts a fitness coach should remember long-term (habits, food preferences/dislikes, supplements, schedule constraints, injuries). Ignore one-off events, questions, and anything already generic. Return an empty array if nothing durable.",
    prompt: message,
    jsonSchema: FACTS_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.1,
  });
  if (!out.facts?.length) return;
  const db = getDb();
  const existing = await db
    .select({ fact: schema.userFacts.fact })
    .from(schema.userFacts)
    .where(eq(schema.userFacts.userId, userId));
  const have = new Set(existing.map((e) => e.fact.toLowerCase()));
  for (const f of out.facts.slice(0, 3)) {
    if (have.has(f.fact.toLowerCase())) continue;
    await db.insert(schema.userFacts).values({
      userId,
      fact: f.fact,
      category: f.category,
      source: "stated",
      lastConfirmedAt: new Date(),
    });
  }
}
