import { describe, expect, it } from "vitest";

import { createJob, getJob, getSheet, isProcessableSong } from "@/lib/jobs";
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
});
