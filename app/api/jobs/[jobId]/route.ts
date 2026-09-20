import { NextResponse } from "next/server";

import { accessTokenFromRequest } from "@/lib/job-access";
import { getJob } from "@/lib/jobs";

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const token = accessTokenFromRequest(_request, jobId);
  if (!token) return NextResponse.json({ error: "A job access token is required." }, { status: 401 });
  const job = await getJob(jobId, token);
  if (!job) return NextResponse.json({ error: "Processing job not found." }, { status: 404 });
  return NextResponse.json(job);
}
