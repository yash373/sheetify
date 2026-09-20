import { describe, expect, it, vi } from "vitest";

import { createHostedBasicPitchAdapter, TranscriptionConfigurationError, TranscriptionProviderError, TranscriptionQuotaError, TranscriptionTimeoutError } from "@/lib/transcription";

const audio = { bytes: new Uint8Array([1, 2, 3]), contentType: "audio/wav", filename: "demo.wav" };
const noSleep = vi.fn(async () => {});
const upload = () => new Response(JSON.stringify(["/tmp/gradio/demo.wav"]), { status: 200 });
const queued = () => new Response(JSON.stringify({ event_id: "evt-1" }), { status: 200 });
const complete = (extra: Record<string, unknown> = {}) => new Response(`event: complete\ndata: ${JSON.stringify([{ model: "basic-pitch-space", notes: [{ start_time_s: 0, end_time_s: 0.5, pitch_midi: 60, velocity: 0.8 }], ...extra }])}\n\n`, { status: 200 });

describe("hosted Basic Pitch Gradio adapter", () => {
  it("fails closed when the hosted endpoint is not configured", async () => {
    await expect(createHostedBasicPitchAdapter({ endpoint: "" }).transcribe(audio)).rejects.toBeInstanceOf(TranscriptionConfigurationError);
  });

  it("uploads in memory, calls the queue, polls SSE, and normalizes note events", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(upload()).mockResolvedValueOnce(queued()).mockResolvedValueOnce(complete({ duration_seconds: 2 }));
    const result = await createHostedBasicPitchAdapter({ endpoint: "https://space.example.test/", token: "secret-token", apiName: "transcribe", fetchImpl, sleep: noSleep }).transcribe(audio);

    expect(result).toEqual({ provider: "basic-pitch-hosted", model: "basic-pitch-space", durationSeconds: 2, notes: [{ startTimeSeconds: 0, endTimeSeconds: 0.5, pitchMidi: 60, velocity: 0.8 }] });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://space.example.test/gradio_api/upload");
    expect(fetchImpl.mock.calls[1][0]).toBe("https://space.example.test/gradio_api/call/transcribe");
    expect(fetchImpl.mock.calls[2][0]).toBe("https://space.example.test/gradio_api/call/transcribe/evt-1");
    expect(fetchImpl.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer secret-token" }));
    expect(fetchImpl.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
    expect((fetchImpl.mock.calls[0][1]?.body as FormData).get("files")).toBeInstanceOf(Blob);
    expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toEqual({ data: [{ path: "/tmp/gradio/demo.wav", meta: { _type: "gradio.FileData" }, orig_name: "demo.wav" }] });
  });

  it("waits through queued poll responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(upload()).mockResolvedValueOnce(queued()).mockResolvedValueOnce(new Response(null, { status: 202 })).mockResolvedValueOnce(complete());
    await expect(createHostedBasicPitchAdapter({ endpoint: "https://example.test", fetchImpl, sleep: noSleep }).transcribe(audio)).resolves.toMatchObject({ durationSeconds: 0.5 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("does not retry quota exhaustion", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("quota exceeded", { status: 429 }));
    await expect(createHostedBasicPitchAdapter({ endpoint: "https://example.test", fetchImpl, sleep: noSleep }).transcribe(audio)).rejects.toBeInstanceOf(TranscriptionQuotaError);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects malformed results without retrying", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(upload()).mockResolvedValueOnce(queued()).mockResolvedValueOnce(new Response("event: complete\ndata: {\"notes\": [{\"start_time_s\": 1, \"end_time_s\": 0, \"pitch_midi\": 60, \"velocity\": 0.5}]}\n\n", { status: 200 }));
    await expect(createHostedBasicPitchAdapter({ endpoint: "https://example.test", fetchImpl, sleep: noSleep }).transcribe(audio)).rejects.toThrow("invalid note");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries transient provider failures within the attempt budget", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(upload()).mockResolvedValueOnce(queued()).mockResolvedValueOnce(complete());
    await expect(createHostedBasicPitchAdapter({ endpoint: "https://example.test", fetchImpl, maxAttempts: 2, sleep: noSleep }).transcribe(audio)).resolves.toMatchObject({ provider: "basic-pitch-hosted" });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("bounds queue polling and reports a retryable timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(upload()).mockResolvedValueOnce(queued()).mockResolvedValue(new Response(null, { status: 202 }));
    await expect(createHostedBasicPitchAdapter({ endpoint: "https://example.test", fetchImpl, maxPolls: 2, maxAttempts: 1, sleep: noSleep }).transcribe(audio)).rejects.toBeInstanceOf(TranscriptionTimeoutError);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("marks terminal provider errors as non-retryable", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    await expect(createHostedBasicPitchAdapter({ endpoint: "https://example.test", fetchImpl, sleep: noSleep }).transcribe(audio)).rejects.toMatchObject({ retryable: false });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(new TranscriptionProviderError("x").retryable).toBe(false);
  });
});
