import { NextResponse } from "next/server";

import { createJob, getJob, hostedPipelineConfigured, startHostedJob } from "@/lib/jobs";
import { difficulties } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json() as { songId?: string; difficulty?: string; song?: unknown };
  if (!body.songId || !body.difficulty || !difficulties.includes(body.difficulty as typeof difficulties[number])) {
    return NextResponse.json({ error: "A song and valid difficulty are required." }, { status: 400 });
  }

  if (body.song && typeof body.song === "object" && "source" in body.song && (body.song as { source?: { provider?: string } }).source?.provider !== "demo" && !hostedPipelineConfigured()) {
    return NextResponse.json({ error: "Hosted transcription is not configured for licensed catalog songs." }, { status: 503 });
  }
  const jobId = createJob(body.songId, body.difficulty as typeof difficulties[number], body.song);
  if (!jobId) return NextResponse.json({ error: "That demo song is not available." }, { status: 404 });
  const job = getJob(jobId);
  if (job?.song.source.provider !== "demo") void startHostedJob(jobId);
  return NextResponse.json({ jobId }, { status: 201 });
}
