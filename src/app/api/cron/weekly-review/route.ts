/** Weekly review cron (Sprint 6). Schedule Sundays on Vercel later. */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { generateReview } from "@/lib/services/reviews";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const users = await db.select({ id: schema.profiles.id }).from(schema.profiles);
  const results: Record<string, string> = {};
  for (const u of users) {
    try {
      await generateReview(u.id, "weekly");
      results[u.id] = "ok";
    } catch (e) {
      results[u.id] = e instanceof Error ? e.message.slice(0, 80) : "failed";
    }
  }
  return NextResponse.json({ generated: results });
}
