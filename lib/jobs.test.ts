import { describe, expect, it, vi } from "vitest";

import { createJob, getJob, getSheet, isProcessableSong, MAX_JOB_RETRIES, retryJob, startHostedJob } from "@/lib/jobs";
import type { Song } from "@/lib/types";

const licensedSong: Song = {
  id: "remote-song",
  title: "Remote Song",
  artist: "Remote Artist",
  durationSeconds: 120,
  genre: "Piano",
  source: {
    provider: "jamendo",
    trackId: "jamendo-1",
    catalogUrl: "https://www.jamendo.com/track/jamendo-1",
    downloadUrl: "https://prod-1.storage.jamendo.com/download/track/jamendo-1/mp32/",
    durationSeconds: 120,
    metadataVerifiedAt: "2026-09-20T00:00:00.000Z",
    downloadAllowed: true,
    license: { name: "CC BY", url: "https://creativecommons.org/licenses/by/4.0/", attributionRequired: true, attributionText: "Remote Song by Remote Artist", commercialUse: "allowed", derivatives: "allowed" },
  },
  processingEstimateSeconds: 30,
};

describe("job catalog handoff", () => {
  it("validates licensed catalog metadata", () => {
    expect(isProcessableSong(licensedSong)).toBe(true);
    expect(isProcessableSong({ ...licensedSong, source: { ...licensedSong.source, downloadAllowed: false } })).toBe(false);
  });

  it("keeps the selected provider-neutral song through processing and sheet creation", async () => {
    const created = await createJob(licensedSong.id, "medium", licensedSong);
    expect(created).toBeTruthy();
    expect(await getJob(created!.jobId)).toMatchObject({ song: licensedSong, difficulty: "medium" });
  });

  it("creates bounded retry jobs with retry metadata", async () => {
    const created = await createJob("retry-song", "beginner", { ...licensedSong, id: "retry-song" });
    expect(await getJob(created!.jobId)).toMatchObject({ retryCount: 0, maxRetries: MAX_JOB_RETRIES });
    const retried = await retryJob(created!.jobId, created!.accessToken);
    expect(await getJob(retried!.jobId)).toMatchObject({ retryCount: 1, maxRetries: MAX_JOB_RETRIES });
  });

  it("uses the hosted pipeline for licensed jobs instead of demo output", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "audio/mpeg" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(["/tmp/gradio/remote.mp3"]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ event_id: "job-event" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("event: complete\ndata: {\"model\":\"basic-pitch-v1\",\"notes\":[{\"start_time_s\":0,\"end_time_s\":1,\"pitch_midi\":60,\"velocity\":0.8}]}\n\n", { status: 200 }));
    const created = await createJob("hosted-song", "medium", { ...licensedSong, id: "hosted-song" });
    expect(await startHostedJob(created!.jobId, { endpoint: "https://transcriber.example.test", token: "token", fetchImpl })).toBe(true);
    const status = await getJob(created!.jobId);
    expect(status).toMatchObject({ stage: "ready" });
    expect(await getSheet(status!.sheetId!, created!.accessToken)).toMatchObject({ musicXml: expect.stringContaining("<step>C</step>") });

    const cachedJob = await createJob("hosted-song", "medium", { ...licensedSong, id: "hosted-song" });
    const shouldNotDownload = vi.fn<typeof fetch>();
    expect(await startHostedJob(cachedJob!.jobId, { endpoint: "https://transcriber.example.test/predict", token: "token", fetchImpl: shouldNotDownload })).toBe(true);
    expect(await getJob(cachedJob!.jobId)).toMatchObject({ stage: "ready", message: "Your cached practice sheet is ready." });
    expect(shouldNotDownload).not.toHaveBeenCalled();
  });
});
