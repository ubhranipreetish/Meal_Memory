"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { analyzeReport } from "@/lib/ai/reportReader";
import { dateKey } from "@/lib/time";
import { validateBase64Upload } from "@/lib/uploadValidation";

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
      date: dateKey(),
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
    const upload = validateBase64Upload(base64, mimeType, "report");
    const analysis = await analyzeReport(base64, upload.mimeType);

    // best-effort file storage
    let filePath: string | null = null;
    try {
      const supabase = await createClient();
      const path = `${user.id}/${Date.now()}.${upload.extension}`;
      const { error } = await supabase.storage
        .from("reports")
        .upload(path, upload.buffer, { contentType: upload.mimeType });
      if (!error) filePath = path;
    } catch {
      /* optional */
    }

    const db = getDb();
    await db.insert(schema.bodyReports).values({
      userId: user.id,
      reportType: analysis.reportType,
      reportDate: dateKey(),
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
