import { createHash, randomBytes } from "node:crypto";

import { createDemoSheet, findDemoSong } from "@/lib/demo-data";
import { createHostedProcessingPipeline, processingCacheKey } from "@/lib/processing-pipeline";
import { ADVANCE_LEASE_MS, JOB_TTL_MS, SHEET_TTL_MS, getDurableStore, toJobStatus, type JobRecord, type SheetRecord } from "@/lib/durable-store";
import type { Difficulty, JobStatus, SheetPackage, Song } from "@/lib/types";

export const MAX_JOB_RETRIES = 3;
const stages: Array<{ name: JobStatus["stage"]; progress: number; message: string }> = [
  { name: "queued", progress: 0, message: "Your practice sheet is in line." },
  { name: "preparing", progress: 18, message: "Preparing the arrangement request." },
  { name: "fetching-audio", progress: 34, message: "Finding a clean audio source." },
  { name: "transcribing", progress: 66, message: "Listening for melody, rhythm, and harmony." },
  { name: "engraving", progress: 88, message: "Engraving a readable piano score." },
  { name: "caching", progress: 96, message: "Putting the finished sheet on your desk." },
];

export function hashAccessToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function newAccessToken() { return randomBytes(24).toString("base64url"); }

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

export function hostedPipelineConfigured() { return Boolean(process.env.BASIC_PITCH_ENDPOINT); }

function baseRecord(jobId: string, token: string, song: Song, difficulty: Difficulty, retryCount = 0): JobRecord {
  const now = new Date();
  return { jobId, accessTokenHash: hashAccessToken(token), song, difficulty, stage: "queued", progress: 0, retryCount, maxRetries: MAX_JOB_RETRIES, message: stages[0].message, createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + JOB_TTL_MS).toISOString() };
}

export async function createJob(songId: string, difficulty: Difficulty, suppliedSong?: unknown) {
  const candidate = isProcessableSong(suppliedSong) && suppliedSong.id === songId ? suppliedSong : findDemoSong(songId);
  if (!candidate || (candidate.source.provider !== "demo" && !candidate.source.downloadAllowed)) return null;
  const token = newAccessToken();
  const jobId = `job_${randomBytes(12).toString("base64url")}`;
  await getDurableStore().putJob(baseRecord(jobId, token, candidate, difficulty));
  if (candidate.source.provider === "demo") {
    const sheetId = `sheet_${randomBytes(12).toString("base64url")}`;
    const sheet = createDemoSheet(candidate, difficulty, sheetId);
    await persistSheet(jobId, `demo:${candidate.id}:${difficulty}`, sheet, candidate);
    await getDurableStore().updateJob(jobId, { stage: "ready", progress: 100, message: "Your practice sheet is ready.", sheetId, leaseUntil: undefined });
    return { jobId, accessToken: token, sheet };
  }
  return { jobId, accessToken: token };
}

export async function getJob(jobId: string, accessToken?: string) {
  const record = await getDurableStore().getJob(jobId);
  if (!record || (accessToken && record.accessTokenHash !== hashAccessToken(accessToken))) return null;
  return toJobStatus(record);
}

export async function authorizeJob(jobId: string, accessToken: string | undefined) {
  if (!accessToken) return false;
  const record = await getDurableStore().getJob(jobId);
  return Boolean(record && record.accessTokenHash === hashAccessToken(accessToken));
}

export async function advanceJob(jobId: string, accessToken: string) {
  const store = getDurableStore();
  const current = await store.getJob(jobId);
  if (!current || current.accessTokenHash !== hashAccessToken(accessToken)) return null;
  const leased = await store.acquireAdvanceLease(jobId, new Date(), ADVANCE_LEASE_MS);
  if (!leased) return null;
  if (leased.stage === "ready" || leased.stage === "failed") return toJobStatus(leased);
  if (leased.stage === "caching" && leased.song.source.provider === "demo") {
    const sheetId = `sheet_${randomBytes(12).toString("base64url")}`;
    const sheet = createDemoSheet(leased.song, leased.difficulty, sheetId);
    await persistSheet(jobId, `demo:${leased.song.id}:${leased.difficulty}`, sheet, leased.song);
    const completed = await store.updateJob(jobId, { stage: "ready", progress: 100, message: "Your practice sheet is ready.", sheetId, leaseUntil: undefined });
    return completed ? toJobStatus(completed) : null;
  }
  const nextIndex = Math.min(stages.length - 1, Math.max(0, stages.findIndex((stage) => stage.name === leased.stage) + 1));
  const next = stages[nextIndex];
  const updated = await store.updateJob(jobId, { stage: next.name, progress: next.progress, message: next.message, leaseUntil: undefined });
  return updated ? toJobStatus(updated) : null;
}

function tempoForDifficulty(difficulty: Difficulty) { return difficulty === "beginner" ? 76 : difficulty === "medium" ? 92 : 108; }

export async function startHostedJob(jobId: string, options: { endpoint?: string; token?: string; fetchImpl?: typeof fetch } = {}) {
  const store = getDurableStore();
  const record = await store.getJob(jobId);
  if (!record || record.song.source.provider === "demo") return false;
  const modelVersion = process.env.BASIC_PITCH_MODEL ?? "basic-pitch";
  const cacheKey = processingCacheKey({ song: record.song, difficulty: record.difficulty, transcriptionModel: modelVersion });
  await store.updateJob(jobId, { stage: "transcribing", progress: 45, message: "Listening for melody, rhythm, and harmony.", cacheKey, modelVersion });
  try {
    const result = await createHostedProcessingPipeline(options)({ song: record.song, difficulty: record.difficulty, tempo: tempoForDifficulty(record.difficulty), transcriptionModel: modelVersion, cache: { get: async (key) => (await store.getSheetByCacheKey(key))?.sheet ?? null, set: async (key, sheet) => persistSheet(jobId, key, sheet, record.song), } });
    const sheetId = `sheet_${randomBytes(12).toString("base64url")}`;
    const sheet = { ...result.sheet, sheetId };
    await persistSheet(jobId, cacheKey, sheet, record.song);
    await store.updateJob(jobId, { stage: "ready", progress: 100, message: result.cacheHit ? "Your cached practice sheet is ready." : "Your practice sheet is ready.", sheetId, leaseUntil: undefined });
    return true;
  } catch (error) {
    await store.updateJob(jobId, { stage: "failed", progress: 100, message: "Transcription could not be completed.", error: error instanceof Error ? error.message : "Hosted transcription failed.", leaseUntil: undefined });
    return false;
  }
}

async function persistSheet(ownerJobId: string, cacheKey: string, sheet: SheetPackage, song: Song) {
  const now = new Date();
  const record: SheetRecord = { sheet, ownerJobId, cacheKey, musicXml: sheet.musicXml, playbackEvents: sheet.noteEvents, licenseMetadata: song.source.license, attribution: song.source.license.attributionRequired ? `${song.title} by ${song.artist}` : "", modelVersion: process.env.BASIC_PITCH_MODEL ?? "basic-pitch", createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + SHEET_TTL_MS).toISOString() };
  await getDurableStore().putSheet(record);
}

export async function retryJob(jobId: string, accessToken: string) {
  const current = await getDurableStore().getJob(jobId);
  if (!current || current.accessTokenHash !== hashAccessToken(accessToken) || current.retryCount >= MAX_JOB_RETRIES) return null;
  const next = baseRecord(`job_${randomBytes(12).toString("base64url")}`, accessToken, current.song, current.difficulty, current.retryCount + 1);
  await getDurableStore().putJob(next);
  return { jobId: next.jobId, accessToken };
}

export async function getSheet(sheetId: string, accessToken: string) {
  const record = await getDurableStore().getSheet(sheetId);
  if (!record || !(await authorizeJob(record.ownerJobId, accessToken))) return null;
  return record.sheet;
}

// Kept as a named export for route-level tests and compatibility with the old contract.
export { ADVANCE_LEASE_MS };
export function demoSheetForJob(song: Song, difficulty: Difficulty, sheetId: string) { return createDemoSheet(song, difficulty, sheetId); }
