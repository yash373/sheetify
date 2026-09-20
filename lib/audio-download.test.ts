import { describe, expect, it, vi } from "vitest";

import { AudioDownloadError, createLicensedAudioDownloader } from "@/lib/audio-download";
import type { TrackSource } from "@/lib/types";

const source: TrackSource = {
  provider: "jamendo",
  trackId: "track-1",
  downloadUrl: "https://audio.example.test/track-1.mp3",
  downloadAllowed: true,
  license: { name: "CC BY", attributionRequired: true },
};

describe("licensed audio downloader", () => {
  it("downloads an allowed HTTPS audio response into memory", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const artifact = await createLicensedAudioDownloader({ fetchImpl }).download(source);
    expect(artifact).toMatchObject({ contentType: "audio/mpeg", filename: "track-1.audio" });
    expect([...artifact.bytes]).toEqual([1, 2, 3]);
    expect(fetchImpl).toHaveBeenCalledWith(new URL(source.downloadUrl!), { redirect: "error" });
  });

  it("fails closed for disallowed, insecure, non-audio, failed, and oversized sources", async () => {
    await expect(createLicensedAudioDownloader().download({ ...source, downloadAllowed: false })).rejects.toBeInstanceOf(AudioDownloadError);
    await expect(createLicensedAudioDownloader().download({ ...source, downloadUrl: "http://audio.example.test/file.mp3" })).rejects.toThrow("HTTPS");

    const htmlFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html />", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(createLicensedAudioDownloader({ fetchImpl: htmlFetch }).download(source)).rejects.toThrow("audio file");

    const failedFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 502 }));
    await expect(createLicensedAudioDownloader({ fetchImpl: failedFetch }).download(source)).rejects.toThrow("502");

    const largeFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    await expect(createLicensedAudioDownloader({ fetchImpl: largeFetch, maxBytes: 2 }).download(source)).rejects.toThrow("size limit");
  });
});
