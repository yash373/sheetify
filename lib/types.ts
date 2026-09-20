export const difficulties = ["beginner", "medium", "hard"] as const;

export type Difficulty = (typeof difficulties)[number];

export type Song = {
  id: string;
  title: string;
  artist: string;
  durationSeconds: number;
  genre: string;
};

export type AudioSource = {
  kind: "demo";
  songId: string;
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

export type SheetPackage = {
  sheetId: string;
  song: Song;
  difficulty: Difficulty;
  tempo: number;
  key: string;
  timeSignature: string;
  musicXml: string;
  noteEvents: NoteEvent[];
  generatedAt: string;
};

export type CacheEntry = SheetPackage & {
  schemaVersion: 1;
};

export type SearchResponse = {
  songs: Song[];
};
