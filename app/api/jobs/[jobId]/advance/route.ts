import { NextResponse } from "next/server";

import { accessTokenFromRequest } from "@/lib/job-access";
import { advanceJob } from "@/lib/jobs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const token = accessTokenFromRequest(request, jobId);
  if (!token) return NextResponse.json({ error: "A job access token is required." }, { status: 401 });
  const job = await advanceJob(jobId, token);
  if (!job) return NextResponse.json({ error: "Processing job not found or currently leased." }, { status: 404 });
  return NextResponse.json(job);
}
