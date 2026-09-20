# Production readiness

Sheetify has three explicit runtime modes. The mode is derived from server-side configuration; there is no separate flag that can drift from the capabilities actually available.

| Mode | Meaning | Health status |
| --- | --- | --- |
| `demo` | None of the production capabilities is configured. The deterministic demo catalog and in-memory runtime remain available. | `200` |
| `live` | Jamendo, durable Postgres storage, and hosted Basic Pitch are all configured with valid shapes. | `200` |
| `degraded` | Production configuration is partial or malformed. The deployment must not be treated as production-ready. | `503` |

An empty string is malformed configuration, not an absent value. This prevents a deployment platform's blank environment setting from being mistaken for intentional demo mode.

## Server configuration

Keep every variable below server-only. Do not add a `NEXT_PUBLIC_` prefix and do not commit real values to the repository.

| Capability | Variables | Validation |
| --- | --- | --- |
| Jamendo catalog | `JAMENDO_CLIENT_ID` | Required and non-blank for live mode. |
| Durable database | `NEON_DATABASE_URL` or `DATABASE_URL` | The runtime prefers `NEON_DATABASE_URL` when both exist. The selected value must be a Postgres URL with a hostname. Apply `db/migrations/001_durable_runtime.sql` before serving production traffic. |
| Basic Pitch | `BASIC_PITCH_ENDPOINT`; optional `BASIC_PITCH_TOKEN`, `BASIC_PITCH_API_NAME`, and `BASIC_PITCH_MODEL` | The endpoint must be an HTTPS URL with a hostname. An explicitly supplied API name must be non-blank; otherwise it defaults to `predict`. The token is optional for a public Space and remains server-only. |

Live mode describes configuration readiness, not external-provider availability. A release still needs a controlled smoke test against the deployed database, Jamendo account, and Basic Pitch Space, including quota and authentication behavior.

## Health endpoint

`GET /api/health` returns the current mode, overall status, and one status for each capability. A check is `ready`, `missing`, or `invalid`. The response lists environment variable names only and never returns their values.

The endpoint deliberately performs no network request, database query, catalog search, upload, or transcription. It is safe for frequent load-balancer checks and cannot consume provider quota. Responses use `Cache-Control: no-store` so configuration state is evaluated by the running server rather than reused from a public cache.

Example demo response:

```json
{
  "status": "ok",
  "mode": "demo",
  "checks": {
    "jamendo": { "status": "missing", "variables": ["JAMENDO_CLIENT_ID"] },
    "database": { "status": "missing", "variables": ["NEON_DATABASE_URL", "DATABASE_URL"] },
    "basicPitch": { "status": "missing", "variables": ["BASIC_PITCH_ENDPOINT"] }
  }
}
```

Do not use this endpoint as proof that external services are reachable. Operational monitoring should combine the cheap public endpoint with private, rate-limited synthetic checks that use controlled test data and credentials.

## Release check

1. Set the server variables in the deployment environment and confirm `/api/health` reports `live` without exposing values.
2. Apply the database migration and verify job creation, polling, expiry, and sheet retrieval against the deployed database.
3. Search Jamendo, confirm only explicitly downloadable and compatible tracks are offered, and preserve attribution in generated output.
4. Process one controlled licensed track through Basic Pitch and verify upload cleanup, timeout/retry behavior, and quota handling.
5. Run tests, lint, typecheck, and a production build from the release commit.

Automated tests validate configuration classification, response status, cache policy, and secret redaction. They do not establish live credentials, network access, provider quota, migration state, or browser behavior.
