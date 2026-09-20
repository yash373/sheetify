import { NextResponse } from "next/server";

import { getProductionReadiness } from "@/lib/production-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = getProductionReadiness();

  return NextResponse.json(readiness, {
    status: readiness.mode === "degraded" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
