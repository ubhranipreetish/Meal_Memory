/**
 * Daily brief cron (Sprint 5). Localhost: hit manually or via a scheduler.
 * On Vercel later: schedule in vercel.json; optionally set CRON_SECRET.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { generateDailyBrief } from "@/lib/ai/coach";
import { authorizeCron } from "@/lib/cron";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = authorizeCron(req);
  if (auth === "missing-secret") {
    return NextResponse.json({ error: "cron is not configured" }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const users = await db.select({ id: schema.profiles.id }).from(schema.profiles);
  const results: Record<string, string> = {};
  for (const u of users) {
    try {
      await generateDailyBrief(u.id);
      results[u.id] = "ok";
    } catch (e) {
      results[u.id] = e instanceof Error ? e.message.slice(0, 80) : "failed";
    }
  }
  return NextResponse.json({ generated: results });
}
