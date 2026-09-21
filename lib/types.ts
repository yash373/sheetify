export const difficulties = ["beginner", "medium", "hard"] as const;

export type Difficulty = (typeof difficulties)[number];

export type TrackLicense = {
  name: string;
  url: string;
  attributionRequired: boolean;
  attributionText: string;
  commercialUse: "allowed" | "not-allowed" | "unknown";
  derivatives: "allowed" | "not-allowed" | "unknown";
};

export type TrackSource = {
  provider: "demo" | "jamendo" | "imslp" | "openopus" | "upload";
  trackId: string;
  catalogUrl: string;
  downloadUrl?: string;
  durationSeconds: number;
  downloadAllowed: boolean;
  metadataVerifiedAt: string;
  license: TrackLicense;
};

export type Song = {
  id: string;
  title: string;
  artist: string;
  durationSeconds: number;
  genre: string;
  source: TrackSource;
  processingEstimateSeconds: number;
};

export type AudioSource = {
  provider: TrackSource["provider"];
  trackId: string;
  downloadUrl?: string;
  license: TrackLicense;
};

export type JobStage =
  | "queued"
  | "preparing"
  | "fetching-audio"
  | "transcribing"
  | "engraving"
  | "caching"
  | "ready"
  | "failed";

export type JobStatus = {
  jobId: string;
  song: Song;
  difficulty: Difficulty;
  retryCount: number;
  maxRetries: number;
  stage: JobStage;
  progress: number;
  message: string;
  sheetId?: string;
  error?: string;
};

export type NoteEvent = {
  id: string;
  pitch: string;
  midi: number;
  start: number;
  duration: number;
  measure: number;
};

import type { Notation } from "@/lib/notation";

export type SheetPackage = {
  sheetId: string;
  song: Song;
  difficulty: Difficulty;
  tempo: number;
  key: string;
  timeSignature: string;
  musicXml: string;
  noteEvents: NoteEvent[];
  notation: Notation;
  generatedAt: string;
};

export type CacheEntry = SheetPackage & {
  schemaVersion: 1;
  expiresAt: string;
};

export type SearchResponse = {
  songs: Song[];
};
