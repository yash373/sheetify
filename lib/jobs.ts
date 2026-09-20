import { createDemoSheet, findDemoSong } from "@/lib/demo-data";
import { createHostedProcessingPipeline } from "@/lib/processing-pipeline";
import type { Difficulty, JobStatus, SheetPackage, Song } from "@/lib/types";

const registeredSongs = new Map<string, Song>();
const retryCounts = new Map<string, number>();
const runtimeStatuses = new Map<string, JobStatus>();
const runtimeSheets = new Map<string, Awaited<ReturnType<typeof createDemoSheet>>>();
const hostedSheetCache = new Map<string, SheetPackage>();
export const MAX_JOB_RETRIES = 3;
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
    typeof song.source.catalogUrl === "string" &&
    typeof song.source.durationSeconds === "number" &&
    typeof song.source.metadataVerifiedAt === "string" &&
    typeof song.source.downloadAllowed === "boolean" &&
    typeof song.source.license?.name === "string" &&
    typeof song.source.license?.attributionRequired === "boolean" &&
    typeof song.source.license?.url === "string" &&
    typeof song.source.license?.attributionText === "string" &&
    ["allowed", "not-allowed", "unknown"].includes(song.source.license?.commercialUse ?? "") &&
    ["allowed", "not-allowed", "unknown"].includes(song.source.license?.derivatives ?? "") &&
    (song.source.provider === "demo" || (song.source.downloadAllowed && typeof song.source.downloadUrl === "string"))
  );
}

export function createJob(songId: string, difficulty: Difficulty, suppliedSong?: unknown) {
  const candidate = isProcessableSong(suppliedSong) && suppliedSong.id === songId ? suppliedSong : findDemoSong(songId);
  if (!candidate || (candidate.source.provider !== "demo" && !candidate.source.downloadAllowed)) return null;

  const jobId = `${songId}--${difficulty}--${Date.now().toString(36)}`;
  registeredSongs.set(jobId, candidate);
  retryCounts.set(jobId, 0);
  return jobId;
}

export function hostedPipelineConfigured() {
  return Boolean(process.env.BASIC_PITCH_ENDPOINT);
}

function tempoForDifficulty(difficulty: Difficulty) {
  return difficulty === "beginner" ? 76 : difficulty === "medium" ? 92 : 108;
}

export async function startHostedJob(jobId: string, options: { endpoint?: string; token?: string; fetchImpl?: typeof fetch } = {}) {
  const [, difficulty] = jobId.split("--");
  const song = registeredSongs.get(jobId);
  if (!song || song.source.provider === "demo" || !["beginner", "medium", "hard"].includes(difficulty ?? "")) return false;
  const typedDifficulty = difficulty as Difficulty;
  const base = { jobId, song, difficulty: typedDifficulty, retryCount: retryCounts.get(jobId) ?? 0, maxRetries: MAX_JOB_RETRIES };
  runtimeStatuses.set(jobId, { ...base, stage: "transcribing", progress: 45, message: "Listening for melody, rhythm, and harmony." });

  try {
    const processingRequest = {
      song,
      difficulty: typedDifficulty,
      tempo: tempoForDifficulty(typedDifficulty),
      transcriptionModel: process.env.BASIC_PITCH_MODEL ?? "basic-pitch",
    };
    const result = await createHostedProcessingPipeline(options)({
      ...processingRequest,
      cache: {
        get: async (key) => hostedSheetCache.get(key) ?? null,
        set: async (key, sheet) => { hostedSheetCache.set(key, sheet); },
      },
    });
    const sheetId = `sheet-${jobId}`;
    const sheet = { ...result.sheet, sheetId };
    runtimeSheets.set(jobId, sheet);
    runtimeStatuses.set(jobId, { ...base, stage: "ready", progress: 100, message: result.cacheHit ? "Your cached practice sheet is ready." : "Your practice sheet is ready.", sheetId });
    return true;
  } catch (error) {
    runtimeStatuses.set(jobId, { ...base, stage: "failed", progress: 100, message: "Transcription could not be completed.", error: error instanceof Error ? error.message : "Hosted transcription failed." });
    return false;
  }
}

export function retryJob(jobId: string) {
  const [songId, difficulty] = jobId.split("--");
  const song = registeredSongs.get(jobId) ?? findDemoSong(songId ?? "");
  if (!song || !["beginner", "medium", "hard"].includes(difficulty ?? "")) return null;
  const retryCount = retryCounts.get(jobId) ?? 0;
  if (retryCount >= MAX_JOB_RETRIES) return null;
  const nextJobId = `${song.id}--${difficulty}--${Date.now().toString(36)}`;
  registeredSongs.set(nextJobId, song);
  retryCounts.set(nextJobId, retryCount + 1);
  return nextJobId;
}

export function getJob(jobId: string): JobStatus | null {
  const runtimeStatus = runtimeStatuses.get(jobId);
  if (runtimeStatus) return runtimeStatus;
  const [songId, difficulty, createdAtToken] = jobId.split("--");
  const createdAt = Number.parseInt(createdAtToken ?? "", 36);
  const song = registeredSongs.get(jobId) ?? findDemoSong(songId ?? "");
  if (!song || !Number.isFinite(createdAt) || !["beginner", "medium", "hard"].includes(difficulty ?? "")) return null;
  const typedDifficulty = difficulty as Difficulty;
  if (!song) return null;

  const elapsed = Date.now() - createdAt;
  const progress = Math.min(100, Math.floor(elapsed / 85));
  if (progress >= 100) {
    return { jobId, song, difficulty: typedDifficulty, retryCount: retryCounts.get(jobId) ?? 0, maxRetries: MAX_JOB_RETRIES, stage: "ready", progress: 100, message: "Your practice sheet is ready.", sheetId: `sheet-${jobId}` };
  }

  const current = stages.find((stage) => progress >= stage.start && progress < stage.end) ?? stages[0];
  return { jobId, song, difficulty: typedDifficulty, retryCount: retryCounts.get(jobId) ?? 0, maxRetries: MAX_JOB_RETRIES, stage: current.name, progress, message: current.message };
}

export function getSheet(sheetId: string) {
  const jobId = sheetId.startsWith("sheet-") ? sheetId.slice(6) : "";
  const runtimeSheet = runtimeSheets.get(jobId);
  if (runtimeSheet) return runtimeSheet;
  const [songId, difficulty] = jobId.split("--");
  const song = registeredSongs.get(jobId) ?? findDemoSong(songId ?? "");
  if (!song || !["beginner", "medium", "hard"].includes(difficulty ?? "")) return null;
  return createDemoSheet(song, difficulty as Difficulty, sheetId);
}
