import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

export function authorizeCron(request: NextRequest): "ok" | "missing-secret" | "unauthorized" {
  let expected: string;
  try {
    expected = `Bearer ${env.cronSecret()}`;
  } catch {
    return "missing-secret";
  }

  const actual = request.headers.get("authorization") ?? "";
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  if (expectedBytes.length !== actualBytes.length) return "unauthorized";
  return timingSafeEqual(expectedBytes, actualBytes) ? "ok" : "unauthorized";
}
