import { describe, expect, it, vi } from "vitest";

import { createHostedProcessingPipeline, LicensingError, processLicensedSong, processingCacheKey } from "@/lib/processing-pipeline";
import type { SheetPackage, Song } from "@/lib/types";

const song: Song = {
  id: "licensed-song",
  title: "Licensed Song",
  artist: "Composer",
  durationSeconds: 12,
  genre: "Piano",
  source: {
    provider: "jamendo",
    trackId: "track-1",
    downloadUrl: "https://audio.example.test/track-1.mp3",
    downloadAllowed: true,
    license: { name: "CC BY", attributionRequired: true },
  },
  processingEstimateSeconds: 10,
};

function createCache() {
  const values = new Map<string, SheetPackage>();
  return {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, sheet: SheetPackage) => { values.set(key, sheet); }),
  };
}

describe("licensed processing pipeline", () => {
  it("uses a stable cache key containing source, difficulty, and model", () => {
    expect(processingCacheKey({ song, difficulty: "medium", transcriptionModel: "basic-pitch-v1" })).toBe(
      "sheetify:jamendo:track-1:medium:basic-pitch-v1",
    );
  });

  it("rejects audio that is not explicitly downloadable", async () => {
    const cache = createCache();
    await expect(processLicensedSong({
      song: { ...song, source: { ...song.source, downloadAllowed: false } },
      difficulty: "medium",
      tempo: 90,
      transcriptionModel: "basic-pitch-v1",
      downloader: { download: vi.fn() },
      transcriber: { id: "basic-pitch-hosted", transcribe: vi.fn() },
      cache,
    })).rejects.toBeInstanceOf(LicensingError);
  });

  it("transcribes, engraves, caches, and cleans up the in-memory audio", async () => {
    const cache = createCache();
    const cleanup = vi.fn();
    const downloader = { download: vi.fn(async () => ({ bytes: new Uint8Array([1]), contentType: "audio/mpeg", filename: "track.mp3", cleanup })) };
    const transcriber = {
      id: "basic-pitch-hosted" as const,
      transcribe: vi.fn(async () => ({ provider: "basic-pitch-hosted" as const, model: "basic-pitch-v1", durationSeconds: 2, notes: [{ startTimeSeconds: 0, endTimeSeconds: 1, pitchMidi: 60, velocity: 0.8 }] })),
    };

    const first = await processLicensedSong({ song, difficulty: "medium", tempo: 60, transcriptionModel: "basic-pitch-v1", downloader, transcriber, cache });
    expect(first.cacheHit).toBe(false);
    expect(first.sheet.musicXml).toContain("<pitch>");
    expect(first.sheet.noteEvents[0]).toMatchObject({ pitch: "C4", start: 0, duration: 1 });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(cache.set).toHaveBeenCalledOnce();

    const second = await processLicensedSong({ song, difficulty: "medium", tempo: 60, transcriptionModel: "basic-pitch-v1", downloader, transcriber, cache });
    expect(second.cacheHit).toBe(true);
    expect(downloader.download).toHaveBeenCalledOnce();
    expect(transcriber.transcribe).toHaveBeenCalledOnce();
  });

  it("cleans up audio when transcription fails", async () => {
    const cleanup = vi.fn();
    const cache = createCache();
    const transcriber = { id: "basic-pitch-hosted" as const, transcribe: vi.fn(async () => { throw new Error("provider unavailable"); }) };
    await expect(processLicensedSong({
      song,
      difficulty: "hard",
      tempo: 100,
      transcriptionModel: "basic-pitch-v1",
      downloader: { download: vi.fn(async () => ({ bytes: new Uint8Array([1]), contentType: "audio/mpeg", filename: "track.mp3", cleanup })) },
      transcriber,
      cache,
    })).rejects.toThrow("provider unavailable");
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("composes the licensed downloader and hosted transcriber", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "audio/mpeg" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ model: "basic-pitch-v1", notes: [{ start_time_s: 0, end_time_s: 1, pitch_midi: 60, velocity: 0.8 }] }), { status: 200 }));
    const cache = createCache();
    const result = await createHostedProcessingPipeline({ endpoint: "https://transcriber.example.test/predict", token: "token", fetchImpl })({
      song,
      difficulty: "beginner",
      tempo: 60,
      transcriptionModel: "basic-pitch-v1",
      cache,
    });

    expect(result.sheet.noteEvents[0]).toMatchObject({ pitch: "C4", duration: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
