import { NextResponse } from "next/server";

import { createJob } from "@/lib/jobs";
import { difficulties } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json() as { songId?: string; difficulty?: string };
  if (!body.songId || !body.difficulty || !difficulties.includes(body.difficulty as typeof difficulties[number])) {
    return NextResponse.json({ error: "A song and valid difficulty are required." }, { status: 400 });
  }

  const jobId = createJob(body.songId, body.difficulty as typeof difficulties[number]);
  if (!jobId) return NextResponse.json({ error: "That demo song is not available." }, { status: 404 });
  return NextResponse.json({ jobId }, { status: 201 });
}
