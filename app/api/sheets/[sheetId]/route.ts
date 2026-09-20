import { NextResponse } from "next/server";

import { getSheet } from "@/lib/jobs";

export async function GET(_request: Request, { params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = await params;
  const sheet = getSheet(sheetId);
  if (!sheet) return NextResponse.json({ error: "Practice sheet not found." }, { status: 404 });
  return NextResponse.json(sheet);
}
