import { NextResponse } from "next/server";

import { searchCatalogSongs } from "@/lib/catalog";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const result = await searchCatalogSongs(query);
  return NextResponse.json(result);
}
