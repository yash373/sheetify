import { ProcessingPage } from "@/components/processing-page";

export default async function ProcessingRoute({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <ProcessingPage jobId={jobId} />;
}
