import { NextResponse } from "next/server";

import { accessTokenFromRequest } from "@/lib/job-access";
import { getSheet } from "@/lib/jobs";

export async function GET(_request: Request, { params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = await params;
  const token = accessTokenFromRequest(_request, sheetId);
  const sheet = token ? await getSheet(sheetId, token) : null;
  if (!sheet) return NextResponse.json({ error: "Practice sheet not found." }, { status: 404 });
  return NextResponse.json(sheet);
}
