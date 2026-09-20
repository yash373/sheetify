import { describe, expect, it } from "vitest";

import { ADVANCE_LEASE_MS, MemoryDurableStore } from "@/lib/durable-store";

describe("durable store contract", () => {
  const job = (overrides = {}) => ({
    jobId: "job-1", accessTokenHash: "hash", song: { id: "song-1" }, difficulty: "medium", stage: "queued", progress: 0,
    retryCount: 0, maxRetries: 3, message: "queued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10_000).toISOString(), ...overrides,
  } as never);

  it("takes one short lease and makes a second advance idempotently observable", async () => {
    const store = new MemoryDurableStore();
    await store.putJob(job());
    const now = new Date();
    expect(await store.acquireAdvanceLease("job-1", now, ADVANCE_LEASE_MS)).toBeTruthy();
    expect(await store.acquireAdvanceLease("job-1", now, ADVANCE_LEASE_MS)).toBeNull();
  });

  it("expires jobs and sheets without returning stale data", async () => {
    const store = new MemoryDurableStore();
    await store.putJob(job({ expiresAt: new Date(Date.now() - 1).toISOString() }));
    expect(await store.getJob("job-1")).toBeNull();
  });
});
