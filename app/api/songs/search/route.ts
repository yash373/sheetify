import { NextResponse } from "next/server";

import { searchDemoSongs } from "@/lib/demo-data";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ songs: searchDemoSongs(query) });
}
