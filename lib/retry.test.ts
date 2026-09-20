import { describe, expect, it, vi } from "vitest";

import { isRetryableProviderFailure, withRetries } from "@/lib/retry";

describe("provider retries", () => {
  it("retries transient failures with exponential delays", async () => {
    const operation = vi.fn().mockRejectedValueOnce(new TypeError("network")).mockResolvedValue("ok");
    const sleep = vi.fn(async () => undefined);
    await expect(withRetries(operation, { delayMs: 10, sleep, shouldRetry: isRetryableProviderFailure })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("does not retry client errors", async () => {
    const operation = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    await expect(withRetries(operation, { shouldRetry: isRetryableProviderFailure })).resolves.toMatchObject({ status: 400 });
    expect(operation).toHaveBeenCalledOnce();
  });
});
