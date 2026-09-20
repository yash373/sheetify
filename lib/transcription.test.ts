import { describe, expect, it, vi } from "vitest";

import {
  createHostedBasicPitchAdapter,
  TranscriptionConfigurationError,
  TranscriptionProviderError,
} from "@/lib/transcription";

const audio = { bytes: new Uint8Array([1, 2, 3]), contentType: "audio/wav", filename: "demo.wav" };

describe("hosted Basic Pitch adapter", () => {
  it("fails closed when the hosted endpoint is not configured", async () => {
    await expect(createHostedBasicPitchAdapter({ endpoint: "" }).transcribe(audio)).rejects.toBeInstanceOf(
      TranscriptionConfigurationError,
    );
  });

  it("sends multipart audio and normalizes note events", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "icasp-2022",
          notes: [{ start_time_s: 0, end_time_s: 0.5, pitch_midi: 60, velocity: 0.8 }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await createHostedBasicPitchAdapter({
      endpoint: "https://transcriber.example.test/predict",
      token: "secret-token",
      fetchImpl,
    }).transcribe(audio);

    expect(result).toEqual({
      provider: "basic-pitch-hosted",
      model: "icasp-2022",
      durationSeconds: 0.5,
      notes: [{ startTimeSeconds: 0, endTimeSeconds: 0.5, pitchMidi: 60, velocity: 0.8 }],
    });

    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://transcriber.example.test/predict");
    expect(request?.method).toBe("POST");
    expect(request?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer secret-token", Accept: "application/json" }));
    expect(request?.body).toBeInstanceOf(FormData);
    expect((request?.body as FormData).get("audio")).toBeInstanceOf(Blob);
  });

  it("rejects provider failures and malformed note events", async () => {
    const failedFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(createHostedBasicPitchAdapter({ endpoint: "https://example.test", fetchImpl: failedFetch }).transcribe(audio)).rejects.toBeInstanceOf(
      TranscriptionProviderError,
    );

    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ notes: [{ start_time_s: 1, end_time_s: 0, pitch_midi: 60, velocity: 0.5 }] }), { status: 200 }),
    );
    await expect(createHostedBasicPitchAdapter({ endpoint: "https://example.test", fetchImpl: malformedFetch }).transcribe(audio)).rejects.toThrow(
      "invalid note",
    );
  });
});
