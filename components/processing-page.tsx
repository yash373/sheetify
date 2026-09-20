"use client";

import Link from "next/link";
import { AlertCircle, Check, LoaderCircle, Music2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Difficulty, JobStatus } from "@/lib/types";

const labels: Record<Difficulty, string> = { beginner: "Beginner", medium: "Medium", hard: "Hard" };
const stageLabels: Record<JobStatus["stage"], string> = { queued: "Queued", preparing: "Preparing", "fetching-audio": "Finding audio", transcribing: "Transcribing", engraving: "Engraving", caching: "Saving sheet", ready: "Ready", failed: "Failed" };

export function ProcessingPage({ jobId }: { jobId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState("");
  const createdJob = useRef<Promise<string> | null>(null);
  const [activeJobId, setActiveJobId] = useState(jobId === "new" ? "" : jobId);
  const songId = params.get("songId");
  const difficulty = (params.get("difficulty") ?? "medium") as Difficulty;

  useEffect(() => {
    if (jobId !== "new") return;
    if (!songId) return;
    if (!createdJob.current) {
      createdJob.current = fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ songId, difficulty }) }).then(async (response) => {
        if (!response.ok) throw new Error("This demo song could not be prepared.");
        return (await response.json() as { jobId: string }).jobId;
      });
    }
    void createdJob.current.then(setActiveJobId).catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : "This demo song could not be prepared."));
  }, [difficulty, jobId, songId]);

  useEffect(() => {
    if (!activeJobId || activeJobId === "new") return;
    let timer: number | undefined;
    let active = true;

    async function poll() {
      const response = await fetch(`/api/jobs/${activeJobId}`, { cache: "no-store" });
      if (!response.ok) { setError("This processing session expired. Return home and try again."); return; }
      const nextStatus = await response.json() as JobStatus;
      if (!active) return;
      setStatus(nextStatus);
      if (nextStatus.stage === "ready" && nextStatus.sheetId) {
        window.setTimeout(() => { router.push(`/practice/${nextStatus.sheetId}`); }, 500);
        return;
      }
      timer = window.setTimeout(() => void poll(), 260);
    }

    void poll();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [activeJobId, router]);

  const progress = status?.progress ?? 4;
  const missingSong = jobId === "new" && !songId;
  const displayError = error || (missingSong ? "Choose a song before starting a practice sheet." : "");
  const isFailed = Boolean(displayError) || status?.stage === "failed";

  return <main className="flex min-h-screen flex-col px-5 py-7 sm:px-8"><header className="mx-auto flex w-full max-w-5xl items-center justify-between border-b border-border/80 pb-5"><Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Music2 className="size-4" /></span>Sheetify</Link><Link href="/" className="text-xs text-muted-foreground hover:text-foreground">Return home</Link></header><section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-20"><div className="mb-8 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">{isFailed ? <AlertCircle className="size-7" /> : status?.stage === "ready" ? <Check className="size-7" /> : <LoaderCircle className="size-7 animate-spin" />}</div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{isFailed ? "Something needs attention" : status ? stageLabels[status.stage] : "Starting session"}</p><h1 className="mt-3 font-heading text-4xl tracking-[-0.03em] sm:text-5xl">{status?.song.title ?? "Preparing your practice sheet"}</h1><p className="mt-3 text-muted-foreground">{status ? `${status.song.artist} · ${labels[status.difficulty]}` : "Loading the selected arrangement."}</p><div className="mt-12"><div className="mb-3 flex justify-between text-sm"><span>{displayError || status?.message || "Setting up the score desk…"}</span><span className="tabular-nums">{progress}%</span></div><Progress value={progress} aria-label="Processing progress" className="h-2" /></div>{isFailed && <div className="mt-8 flex gap-3"><Link className={buttonVariants()} href="/">Return home</Link><Button variant="outline" onClick={() => window.location.reload()}>Try again</Button></div>}<div className="mt-12 grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground"><span className={progress >= 34 ? "text-primary" : ""}>Listen</span><span className={progress >= 66 ? "text-primary" : ""}>Arrange</span><span className={progress >= 88 ? "text-primary" : ""}>Engrave</span></div></section></main>;
}
