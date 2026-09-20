import { PracticePage } from "@/components/practice-page";

export default async function PracticeRoute({ params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = await params;
  return <PracticePage sheetId={sheetId} />;
}
