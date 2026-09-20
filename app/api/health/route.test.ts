import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health", () => {
  it("returns a non-cached degraded response for invalid configuration", async () => {
    vi.stubEnv("JAMENDO_CLIENT_ID", "");
    vi.stubEnv("NEON_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("BASIC_PITCH_ENDPOINT", "");

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ status: "degraded", mode: "degraded" });
  });

  it("returns 200 for an intentionally unconfigured demo environment", async () => {
    vi.stubEnv("JAMENDO_CLIENT_ID", undefined);
    vi.stubEnv("NEON_DATABASE_URL", undefined);
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("BASIC_PITCH_ENDPOINT", undefined);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", mode: "demo" });
  });

  it("returns 200 for complete live configuration without exposing secrets", async () => {
    vi.stubEnv("JAMENDO_CLIENT_ID", "catalog-secret");
    vi.stubEnv("NEON_DATABASE_URL", "postgresql://user:database-secret@db.example.test/sheetify");
    vi.stubEnv("BASIC_PITCH_ENDPOINT", "https://pitch.example.test");
    vi.stubEnv("BASIC_PITCH_TOKEN", "provider-secret");

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ status: "ok", mode: "live" });
    expect(body).not.toMatch(/catalog-secret|database-secret|provider-secret/);
  });
});
