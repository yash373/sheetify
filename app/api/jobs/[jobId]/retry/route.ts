import { NextResponse } from "next/server";

import { getJob, hostedPipelineConfigured, retryJob, startHostedJob } from "@/lib/jobs";

export async function POST(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const existing = getJob(jobId);
  if (existing?.song.source.provider !== "demo" && !hostedPipelineConfigured()) return NextResponse.json({ error: "Hosted transcription is not configured." }, { status: 503 });
  const nextJobId = retryJob(jobId);
  if (!nextJobId) return NextResponse.json({ error: "This processing job cannot be retried." }, { status: 409 });
  const nextJob = getJob(nextJobId);
  if (nextJob?.song.source.provider !== "demo") void startHostedJob(nextJobId);
  return NextResponse.json({ jobId: nextJobId }, { status: 201 });
}
