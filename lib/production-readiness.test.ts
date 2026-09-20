import { describe, expect, it } from "vitest";

import { getProductionReadiness } from "@/lib/production-readiness";

describe("production readiness", () => {
  it("reports an unconfigured environment as an intentional demo", () => {
    expect(getProductionReadiness({})).toEqual({
      status: "ok",
      mode: "demo",
      checks: {
        jamendo: { status: "missing", variables: ["JAMENDO_CLIENT_ID"] },
        database: { status: "missing", variables: ["NEON_DATABASE_URL", "DATABASE_URL"] },
        basicPitch: { status: "missing", variables: ["BASIC_PITCH_ENDPOINT"] },
      },
    });
  });

  it("reports live only when every production capability is configured", () => {
    const readiness = getProductionReadiness({
      JAMENDO_CLIENT_ID: "catalog-secret",
      NEON_DATABASE_URL: "postgresql://user:database-secret@db.example.test/sheetify",
      BASIC_PITCH_ENDPOINT: "https://pitch.example.test",
      BASIC_PITCH_TOKEN: "provider-secret",
      BASIC_PITCH_API_NAME: "predict",
    });

    expect(readiness.status).toBe("ok");
    expect(readiness.mode).toBe("live");
    expect(Object.values(readiness.checks).every((check) => check.status === "ready")).toBe(true);
    expect(JSON.stringify(readiness)).not.toMatch(/catalog-secret|database-secret|provider-secret/);
  });

  it("reports partial production configuration as degraded", () => {
    const readiness = getProductionReadiness({ JAMENDO_CLIENT_ID: "configured" });

    expect(readiness.status).toBe("degraded");
    expect(readiness.mode).toBe("degraded");
    expect(readiness.checks.jamendo.status).toBe("ready");
    expect(readiness.checks.database.status).toBe("missing");
    expect(readiness.checks.basicPitch.status).toBe("missing");
  });

  it.each([
    [{ JAMENDO_CLIENT_ID: " " }, "jamendo"],
    [{ DATABASE_URL: "https://not-a-postgres-database.example.test" }, "database"],
    [{ BASIC_PITCH_ENDPOINT: "http://pitch.example.test" }, "basicPitch"],
    [{ BASIC_PITCH_ENDPOINT: "https://pitch.example.test", BASIC_PITCH_API_NAME: " " }, "basicPitch"],
  ] as const)("rejects malformed configuration without echoing it: %j", (environment, check) => {
    const readiness = getProductionReadiness(environment);

    expect(readiness.mode).toBe("degraded");
    expect(readiness.checks[check].status).toBe("invalid");
    expect(JSON.stringify(readiness)).not.toContain(Object.values(environment)[0]);
  });

  it("validates the database variable selected by the runtime", () => {
    const readiness = getProductionReadiness({
      JAMENDO_CLIENT_ID: "configured",
      NEON_DATABASE_URL: "not-a-url",
      DATABASE_URL: "postgresql://user:password@db.example.test/sheetify",
      BASIC_PITCH_ENDPOINT: "https://pitch.example.test",
    });

    expect(readiness.mode).toBe("degraded");
    expect(readiness.checks.database).toEqual({ status: "invalid", variables: ["NEON_DATABASE_URL"] });
  });
});
