CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY,
  access_token_hash TEXT NOT NULL,
  source_metadata JSONB NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'medium', 'hard')),
  stage TEXT NOT NULL,
  progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  message TEXT NOT NULL,
  provider_event_id TEXT,
  error TEXT,
  sheet_id TEXT,
  cache_key TEXT,
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  lease_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS jobs_expiry_idx ON jobs (expires_at);

CREATE TABLE IF NOT EXISTS sheets (
  sheet_id TEXT PRIMARY KEY,
  owner_job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  musicxml TEXT NOT NULL,
  playback_events JSONB NOT NULL,
  license_metadata JSONB NOT NULL,
  attribution TEXT NOT NULL,
  model_version TEXT NOT NULL,
  sheet_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sheets_cache_key_idx ON sheets (cache_key);
CREATE INDEX IF NOT EXISTS sheets_expiry_idx ON sheets (expires_at);
