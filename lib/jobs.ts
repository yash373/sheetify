import { createDemoSheet, findDemoSong } from "@/lib/demo-data";
import type { Difficulty, JobStatus, SheetPackage } from "@/lib/types";

type JobRecord = {
  jobId: string;
  songId: string;
  difficulty: Difficulty;
  createdAt: number;
  sheet?: SheetPackage;
};

const jobs = new Map<string, JobRecord>();
const stages: Array<{ name: JobStatus["stage"]; start: number; end: number; message: string }> = [
  { name: "queued", start: 0, end: 8, message: "Your practice sheet is in line." },
  { name: "preparing", start: 8, end: 18, message: "Preparing the arrangement request." },
  { name: "fetching-audio", start: 18, end: 34, message: "Finding a clean audio source." },
  { name: "transcribing", start: 34, end: 66, message: "Listening for melody, rhythm, and harmony." },
  { name: "engraving", start: 66, end: 88, message: "Engraving a readable piano score." },
  { name: "caching", start: 88, end: 100, message: "Putting the finished sheet on your desk." },
];

export function createJob(songId: string, difficulty: Difficulty) {
  const song = findDemoSong(songId);
  if (!song) return null;

  const jobId = crypto.randomUUID();
  jobs.set(jobId, { jobId, songId, difficulty, createdAt: Date.now() });
  return jobId;
}

export function getJob(jobId: string): JobStatus | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  const song = findDemoSong(job.songId);
  if (!song) return null;

  const elapsed = Date.now() - job.createdAt;
  const progress = Math.min(100, Math.floor(elapsed / 85));
  if (progress >= 100) {
    if (!job.sheet) job.sheet = createDemoSheet(song, job.difficulty, `sheet-${job.jobId}`);
    return { jobId, song, difficulty: job.difficulty, stage: "ready", progress: 100, message: "Your practice sheet is ready.", sheetId: job.sheet.sheetId };
  }

  const current = stages.find((stage) => progress >= stage.start && progress < stage.end) ?? stages[0];
  return { jobId, song, difficulty: job.difficulty, stage: current.name, progress, message: current.message };
}

export function getSheet(sheetId: string) {
  for (const job of jobs.values()) if (job.sheet?.sheetId === sheetId) return job.sheet;
  return null;
}
