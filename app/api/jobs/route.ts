import { NextResponse } from "next/server";

import { accessCookie } from "@/lib/job-access";
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
  const created = await createJob(body.songId, body.difficulty as typeof difficulties[number], body.song);
  if (!created) return NextResponse.json({ error: "That demo song is not available." }, { status: 404 });
  const job = await getJob(created.jobId);
  if (job?.song.source.provider !== "demo") void startHostedJob(created.jobId);
  const response = NextResponse.json({ jobId: created.jobId, accessToken: created.accessToken, ...(created.sheet ? { sheet: created.sheet } : {}) }, { status: 201 });
  response.headers.append("Set-Cookie", accessCookie(created.jobId, created.accessToken));
  return response;
}
