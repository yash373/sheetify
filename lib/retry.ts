export type RetryOptions<T> = {
  maxAttempts?: number;
  delayMs?: number;
  shouldRetry?: (value: T | unknown, attempt: number) => boolean;
  sleep?: (milliseconds: number) => Promise<void>;
};

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function withRetries<T>(operation: () => Promise<T>, options: RetryOptions<T> = {}) {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
  const delayMs = Math.max(0, options.delayMs ?? 250);
  const shouldRetry = options.shouldRetry ?? (() => false);
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await operation();
      if (attempt === maxAttempts || !shouldRetry(value, attempt)) return value;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) throw error;
    }
    await sleep(delayMs * 2 ** (attempt - 1));
  }

  throw lastError instanceof Error ? lastError : new Error("Operation failed after retries.");
}

export function isRetryableProviderFailure(value: unknown) {
  return value instanceof TypeError || (value instanceof Response && value.status >= 500);
}
