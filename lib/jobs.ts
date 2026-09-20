import { createDemoSheet, findDemoSong } from "@/lib/demo-data";
import type { Difficulty, JobStatus, Song } from "@/lib/types";

const registeredSongs = new Map<string, Song>();
const stages: Array<{ name: JobStatus["stage"]; start: number; end: number; message: string }> = [
  { name: "queued", start: 0, end: 8, message: "Your practice sheet is in line." },
  { name: "preparing", start: 8, end: 18, message: "Preparing the arrangement request." },
  { name: "fetching-audio", start: 18, end: 34, message: "Finding a clean audio source." },
  { name: "transcribing", start: 34, end: 66, message: "Listening for melody, rhythm, and harmony." },
  { name: "engraving", start: 66, end: 88, message: "Engraving a readable piano score." },
  { name: "caching", start: 88, end: 100, message: "Putting the finished sheet on your desk." },
];

export function isProcessableSong(value: unknown): value is Song {
  if (!value || typeof value !== "object") return false;
  const song = value as Partial<Song> & { source?: Partial<Song["source"]> };
  return (
    typeof song.id === "string" &&
    typeof song.title === "string" &&
    typeof song.artist === "string" &&
    typeof song.durationSeconds === "number" &&
    typeof song.genre === "string" &&
    typeof song.processingEstimateSeconds === "number" &&
    !!song.source &&
    (song.source.provider === "demo" || song.source.provider === "jamendo") &&
    typeof song.source.trackId === "string" &&
    typeof song.source.downloadAllowed === "boolean" &&
    typeof song.source.license?.name === "string" &&
    typeof song.source.license?.attributionRequired === "boolean" &&
    (song.source.provider === "demo" || (song.source.downloadAllowed && typeof song.source.downloadUrl === "string"))
  );
}

export function createJob(songId: string, difficulty: Difficulty, suppliedSong?: unknown) {
  const candidate = isProcessableSong(suppliedSong) && suppliedSong.id === songId ? suppliedSong : findDemoSong(songId);
  if (!candidate || (candidate.source.provider !== "demo" && !candidate.source.downloadAllowed)) return null;

  const jobId = `${songId}--${difficulty}--${Date.now().toString(36)}`;
  registeredSongs.set(jobId, candidate);
  return jobId;
}

export function getJob(jobId: string): JobStatus | null {
  const [songId, difficulty, createdAtToken] = jobId.split("--");
  const createdAt = Number.parseInt(createdAtToken ?? "", 36);
  const song = registeredSongs.get(jobId) ?? findDemoSong(songId ?? "");
  if (!song || !Number.isFinite(createdAt) || !["beginner", "medium", "hard"].includes(difficulty ?? "")) return null;
  const typedDifficulty = difficulty as Difficulty;
  if (!song) return null;

  const elapsed = Date.now() - createdAt;
  const progress = Math.min(100, Math.floor(elapsed / 85));
  if (progress >= 100) {
    return { jobId, song, difficulty: typedDifficulty, stage: "ready", progress: 100, message: "Your practice sheet is ready.", sheetId: `sheet-${jobId}` };
  }

  const current = stages.find((stage) => progress >= stage.start && progress < stage.end) ?? stages[0];
  return { jobId, song, difficulty: typedDifficulty, stage: current.name, progress, message: current.message };
}

export function getSheet(sheetId: string) {
  const jobId = sheetId.startsWith("sheet-") ? sheetId.slice(6) : "";
  const [songId, difficulty] = jobId.split("--");
  const song = registeredSongs.get(jobId) ?? findDemoSong(songId ?? "");
  if (!song || !["beginner", "medium", "hard"].includes(difficulty ?? "")) return null;
  return createDemoSheet(song, difficulty as Difficulty, sheetId);
}
