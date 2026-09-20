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
    downloadUrl: "https://audio.example.test/remote.mp3",
    downloadAllowed: true,
    license: { name: "CC BY", attributionRequired: true },
  },
  processingEstimateSeconds: 30,
};

describe("job catalog handoff", () => {
  it("validates licensed catalog metadata", () => {
    expect(isProcessableSong(licensedSong)).toBe(true);
    expect(isProcessableSong({ ...licensedSong, source: { ...licensedSong.source, downloadAllowed: false } })).toBe(false);
  });

  it("keeps the selected provider-neutral song through processing and sheet creation", () => {
    const jobId = createJob(licensedSong.id, "medium", licensedSong);
    expect(jobId).toBeTruthy();
    expect(getJob(jobId!)).toMatchObject({ song: licensedSong, difficulty: "medium" });
    expect(getSheet(`sheet-${jobId}`)).toMatchObject({ song: licensedSong, difficulty: "medium" });
  });

  it("creates bounded retry jobs with retry metadata", () => {
    const jobId = createJob("retry-song", "beginner", { ...licensedSong, id: "retry-song" });
    expect(getJob(jobId!)).toMatchObject({ retryCount: 0, maxRetries: MAX_JOB_RETRIES });
    const retryId = retryJob(jobId!);
    expect(getJob(retryId!)).toMatchObject({ retryCount: 1, maxRetries: MAX_JOB_RETRIES });
  });

  it("uses the hosted pipeline for licensed jobs instead of demo output", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "audio/mpeg" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(["/tmp/gradio/remote.mp3"]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ event_id: "job-event" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("event: complete\ndata: {\"model\":\"basic-pitch-v1\",\"notes\":[{\"start_time_s\":0,\"end_time_s\":1,\"pitch_midi\":60,\"velocity\":0.8}]}\n\n", { status: 200 }));
    const jobId = createJob("hosted-song", "medium", { ...licensedSong, id: "hosted-song" });
    expect(await startHostedJob(jobId!, { endpoint: "https://transcriber.example.test", token: "token", fetchImpl })).toBe(true);
    expect(getJob(jobId!)).toMatchObject({ stage: "ready", sheetId: `sheet-${jobId}` });
    expect(getSheet(`sheet-${jobId}`)?.musicXml).toContain("<step>C</step>");

    const cachedJobId = createJob("hosted-song-cached", "medium", { ...licensedSong, id: "hosted-song-cached" });
    const shouldNotDownload = vi.fn<typeof fetch>();
    expect(await startHostedJob(cachedJobId!, { endpoint: "https://transcriber.example.test/predict", token: "token", fetchImpl: shouldNotDownload })).toBe(true);
    expect(getJob(cachedJobId!)).toMatchObject({ stage: "ready", message: "Your cached practice sheet is ready." });
    expect(shouldNotDownload).not.toHaveBeenCalled();
  });
});
