# Durable job runtime

The API persists job and hosted-sheet state through `DurableStore`. Local development and tests use `MemoryDurableStore`; this mode needs no credentials and never calls an external service. When `NEON_DATABASE_URL` or `DATABASE_URL` is present, the runtime automatically uses `NeonDurableStore` through the official Neon serverless driver. Apply `db/migrations/001_durable_runtime.sql` before deployment.

Required hosted-processing configuration:

- `BASIC_PITCH_ENDPOINT` — licensed transcription endpoint.
- `BASIC_PITCH_TOKEN` — provider token, supplied only to the server-side adapter.
- `BASIC_PITCH_MODEL` — optional model version, default `basic-pitch`.
- `DATABASE_URL` — deployment connection configuration used by the application’s Neon adapter.

Jobs receive an opaque access token. The API stores only its SHA-256 hash and sets an HttpOnly cookie for browser polling; API clients may send `Authorization: Bearer <token>` or `x-job-access-token`. Jobs expire after 30 minutes and sheets after 30 days. Advancement uses a four-second lease so duplicate requests do not run the same transition concurrently.

Only MusicXML, playback events, license/attribution metadata, and derived sheet data are persisted. Generated source audio and raw transcription responses are cleaned up in the processing pipeline and are intentionally absent from the schema.
