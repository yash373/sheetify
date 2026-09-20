import { NextResponse } from "next/server";

import { accessCookie, accessTokenFromRequest } from "@/lib/job-access";
import { getJob, hostedPipelineConfigured, retryJob, startHostedJob } from "@/lib/jobs";

export async function POST(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const token = accessTokenFromRequest(_request, jobId);
  if (!token) return NextResponse.json({ error: "A job access token is required." }, { status: 401 });
  const existing = await getJob(jobId, token);
  if (!existing) return NextResponse.json({ error: "Processing job not found." }, { status: 404 });
  if (existing?.song.source.provider !== "demo" && !hostedPipelineConfigured()) return NextResponse.json({ error: "Hosted transcription is not configured." }, { status: 503 });
  const nextJob = await retryJob(jobId, token);
  if (!nextJob) return NextResponse.json({ error: "This processing job cannot be retried." }, { status: 409 });
  const nextStatus = await getJob(nextJob.jobId);
  if (nextStatus?.song.source.provider !== "demo") void startHostedJob(nextJob.jobId);
  const response = NextResponse.json({ jobId: nextJob.jobId }, { status: 201 });
  response.headers.append("Set-Cookie", accessCookie(nextJob.jobId, token));
  return response;
}
