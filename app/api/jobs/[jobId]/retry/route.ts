import { NextResponse } from "next/server";

import { retryJob } from "@/lib/jobs";

export async function POST(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const nextJobId = retryJob(jobId);
  if (!nextJobId) return NextResponse.json({ error: "This processing job cannot be retried." }, { status: 409 });
  return NextResponse.json({ jobId: nextJobId }, { status: 201 });
}
