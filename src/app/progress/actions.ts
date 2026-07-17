"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { analyzeReport } from "@/lib/ai/reportReader";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

const measurementSchema = z.object({
  chestCm: z.coerce.number().positive().optional(),
  waistCm: z.coerce.number().positive().optional(),
  hipsCm: z.coerce.number().positive().optional(),
  armCm: z.coerce.number().positive().optional(),
  thighCm: z.coerce.number().positive().optional(),
});

export async function saveMeasurementAction(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const m = measurementSchema.parse(raw);
    if (Object.values(m).every((v) => v == null)) return { ok: false, error: "Enter at least one measurement" };
    const db = getDb();
    await db.insert(schema.measurements).values({
      userId: user.id,
      date: new Date().toISOString().slice(0, 10),
      chestCm: m.chestCm != null ? String(m.chestCm) : null,
      waistCm: m.waistCm != null ? String(m.waistCm) : null,
      hipsCm: m.hipsCm != null ? String(m.hipsCm) : null,
      armCm: m.armCm != null ? String(m.armCm) : null,
      thighCm: m.thighCm != null ? String(m.thighCm) : null,
    });
    revalidatePath("/progress");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function analyzeReportAction(
  base64: string,
  mimeType: string,
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const analysis = await analyzeReport(base64, mimeType);

    // best-effort file storage
    let filePath: string | null = null;
    try {
      const supabase = await createClient();
      const ext = mimeType.includes("pdf") ? "pdf" : mimeType.includes("png") ? "png" : "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("reports")
        .upload(path, Buffer.from(base64, "base64"), { contentType: mimeType });
      if (!error) filePath = path;
    } catch {
      /* optional */
    }

    const db = getDb();
    await db.insert(schema.bodyReports).values({
      userId: user.id,
      reportType: analysis.reportType,
      reportDate: new Date().toISOString().slice(0, 10),
      filePath,
      metrics: analysis.metrics,
      aiSummary: analysis.summary,
    });
    revalidatePath("/progress");
    return { ok: true, summary: analysis.summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Analysis failed" };
  }
}
