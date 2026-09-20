import type { Difficulty, JobStage, JobStatus, SheetPackage, Song } from "@/lib/types";

export const JOB_TTL_MS = 30 * 60 * 1000;
export const SHEET_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ADVANCE_LEASE_MS = 4_000;

export type JobRecord = {
  jobId: string;
  accessTokenHash: string;
  song: Song;
  difficulty: Difficulty;
  stage: JobStage;
  progress: number;
  retryCount: number;
  maxRetries: number;
  message: string;
  providerEventId?: string;
  error?: string;
  sheetId?: string;
  cacheKey?: string;
  modelVersion?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  leaseUntil?: string;
};

export type SheetRecord = {
  sheet: SheetPackage;
  ownerJobId: string;
  cacheKey: string;
  musicXml: string;
  playbackEvents: SheetPackage["noteEvents"];
  licenseMetadata: Song["source"]["license"];
  attribution: string;
  modelVersion: string;
  createdAt: string;
  expiresAt: string;
};

export type DurableStore = {
  putJob(record: JobRecord): Promise<void>;
  getJob(jobId: string): Promise<JobRecord | null>;
  updateJob(jobId: string, patch: Partial<JobRecord>): Promise<JobRecord | null>;
  acquireAdvanceLease(jobId: string, now: Date, leaseMs: number): Promise<JobRecord | null>;
  putSheet(record: SheetRecord): Promise<void>;
  getSheet(sheetId: string): Promise<SheetRecord | null>;
  getSheetByCacheKey(cacheKey: string): Promise<SheetRecord | null>;
};

function expired(expiresAt: string, now = Date.now()) {
  return Date.parse(expiresAt) <= now;
}

/** Deterministic local adapter used by tests and development without credentials. */
export class MemoryDurableStore implements DurableStore {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly sheets = new Map<string, SheetRecord>();
  private readonly cache = new Map<string, string>();

  async putJob(record: JobRecord) { this.jobs.set(record.jobId, record); }

  async getJob(jobId: string) {
    const record = this.jobs.get(jobId);
    if (!record || expired(record.expiresAt)) { this.jobs.delete(jobId); return null; }
    return record;
  }

  async updateJob(jobId: string, patch: Partial<JobRecord>) {
    const current = await this.getJob(jobId);
    if (!current) return null;
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.jobs.set(jobId, updated);
    return updated;
  }

  async acquireAdvanceLease(jobId: string, now: Date, leaseMs: number) {
    const current = await this.getJob(jobId);
    if (!current || (current.leaseUntil && Date.parse(current.leaseUntil) > now.getTime())) return null;
    const updated = { ...current, leaseUntil: new Date(now.getTime() + leaseMs).toISOString(), updatedAt: now.toISOString() };
    this.jobs.set(jobId, updated);
    return updated;
  }

  async putSheet(record: SheetRecord) {
    this.sheets.set(record.sheet.sheetId, record);
    this.cache.set(record.cacheKey, record.sheet.sheetId);
  }

  async getSheet(sheetId: string) {
    const record = this.sheets.get(sheetId);
    if (!record || expired(record.expiresAt)) { this.sheets.delete(sheetId); return null; }
    return record;
  }

  async getSheetByCacheKey(cacheKey: string) {
    const sheetId = this.cache.get(cacheKey);
    return sheetId ? this.getSheet(sheetId) : null;
  }
}

/**
 * SQL boundary for Neon/Postgres. The application injects a parameterized
 * executor in production; tests use MemoryDurableStore and never contact a DB.
 */
export type PostgresExecutor = (sql: string, params: readonly unknown[]) => Promise<readonly Record<string, unknown>[]>;

export class NeonDurableStore implements DurableStore {
  constructor(private readonly query: PostgresExecutor) {}

  async putJob(record: JobRecord) {
    await this.query(`INSERT INTO jobs (job_id, access_token_hash, source_metadata, difficulty, stage, progress, retry_count, max_retries, message, provider_event_id, error, sheet_id, cache_key, model_version, created_at, updated_at, expires_at, lease_until) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT (job_id) DO UPDATE SET stage=EXCLUDED.stage, progress=EXCLUDED.progress, retry_count=EXCLUDED.retry_count, message=EXCLUDED.message, provider_event_id=EXCLUDED.provider_event_id, error=EXCLUDED.error, sheet_id=EXCLUDED.sheet_id, updated_at=EXCLUDED.updated_at, expires_at=EXCLUDED.expires_at, lease_until=EXCLUDED.lease_until`, [record.jobId, record.accessTokenHash, JSON.stringify(record.song), record.difficulty, record.stage, record.progress, record.retryCount, record.maxRetries, record.message, record.providerEventId ?? null, record.error ?? null, record.sheetId ?? null, record.cacheKey ?? null, record.modelVersion ?? null, record.createdAt, record.updatedAt, record.expiresAt, record.leaseUntil ?? null]);
  }

  async getJob(jobId: string) {
    const rows = await this.query("SELECT * FROM jobs WHERE job_id = $1 AND expires_at > now()", [jobId]);
    return rows[0] ? rowToJob(rows[0]) : null;
  }

  async updateJob(jobId: string, patch: Partial<JobRecord>) {
    const current = await this.getJob(jobId);
    if (!current) return null;
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await this.putJob(updated);
    return updated;
  }

  async acquireAdvanceLease(jobId: string, now: Date, leaseMs: number) {
    const rows = await this.query("UPDATE jobs SET lease_until = $2, updated_at = $3 WHERE job_id = $1 AND expires_at > $3 AND (lease_until IS NULL OR lease_until <= $3) RETURNING *", [jobId, new Date(now.getTime() + leaseMs).toISOString(), now.toISOString()]);
    return rows[0] ? rowToJob(rows[0]) : null;
  }

  async putSheet(record: SheetRecord) {
    await this.query("INSERT INTO sheets (sheet_id, owner_job_id, cache_key, musicxml, playback_events, license_metadata, attribution, model_version, sheet_payload, created_at, expires_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9::jsonb,$10,$11) ON CONFLICT (sheet_id) DO UPDATE SET expires_at=EXCLUDED.expires_at", [record.sheet.sheetId, record.ownerJobId, record.cacheKey, record.musicXml, JSON.stringify(record.playbackEvents), JSON.stringify(record.licenseMetadata), record.attribution, record.modelVersion, JSON.stringify(record.sheet), record.createdAt, record.expiresAt]);
  }

  async getSheet(sheetId: string) { return this.readSheet("sheet_id", sheetId); }
  async getSheetByCacheKey(cacheKey: string) { return this.readSheet("cache_key", cacheKey); }

  private async readSheet(column: "sheet_id" | "cache_key", value: string) {
    const rows = await this.query(`SELECT * FROM sheets WHERE ${column} = $1 AND expires_at > now()`, [value]);
    return rows[0] ? rowToSheet(rows[0]) : null;
  }
}

function rowToJob(row: Record<string, unknown>): JobRecord {
  return { ...row, jobId: row.job_id, accessTokenHash: row.access_token_hash, song: row.source_metadata, retryCount: row.retry_count, maxRetries: row.max_retries, providerEventId: row.provider_event_id, sheetId: row.sheet_id, cacheKey: row.cache_key, modelVersion: row.model_version, createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at, leaseUntil: row.lease_until } as JobRecord;
}

function rowToSheet(row: Record<string, unknown>): SheetRecord {
  return { sheet: row.sheet_payload, ownerJobId: row.owner_job_id, cacheKey: row.cache_key, musicXml: row.musicxml, playbackEvents: row.playback_events, licenseMetadata: row.license_metadata, attribution: row.attribution, modelVersion: row.model_version, createdAt: row.created_at, expiresAt: row.expires_at } as SheetRecord;
}

let defaultStore: DurableStore | undefined;
export function getDurableStore() {
  // The executor is deliberately injected by the deployment adapter. Without
  // it, local development remains deterministic and credential-free.
  return defaultStore ??= new MemoryDurableStore();
}
export function setDurableStore(store: DurableStore) { defaultStore = store; }

export function toJobStatus(record: JobRecord): JobStatus {
  return { jobId: record.jobId, song: record.song, difficulty: record.difficulty, retryCount: record.retryCount, maxRetries: record.maxRetries, stage: record.stage, progress: record.progress, message: record.message, sheetId: record.sheetId, error: record.error };
}
