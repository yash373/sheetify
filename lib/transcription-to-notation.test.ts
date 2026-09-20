import { describe, expect, it } from "vitest";

import { transcriptionToNotation } from "@/lib/transcription-to-notation";

describe("transcription to notation", () => {
  it("quantizes Basic Pitch seconds into written rhythmic values", () => {
    const notation = transcriptionToNotation(
      {
        provider: "basic-pitch-hosted",
        model: "test",
        durationSeconds: 2,
        notes: [{ startTimeSeconds: 0.1, endTimeSeconds: 0.8, pitchMidi: 60, velocity: 0.8 }],
      },
      { title: "Test", artist: "Composer", tempo: 60 },
    );

    const note = notation.measures[0].events.find((event) => event.kind === "note");
    expect(note).toMatchObject({ onset: 0, durationBeats: 0.75, writtenDuration: "eighth", dots: 1, midi: 60 });
    expect(notation.measures[0].events.filter((event) => event.kind === "rest").map((event) => event.durationBeats)).toEqual([2, 1, 0.25]);
  });

  it("splits notes at measure boundaries and emits ties", () => {
    const notation = transcriptionToNotation(
      {
        provider: "basic-pitch-hosted",
        model: "test",
        durationSeconds: 5,
        notes: [{ startTimeSeconds: 3, endTimeSeconds: 5, pitchMidi: 64, velocity: 0.7 }],
      },
      { title: "Test", artist: "Composer", tempo: 60 },
    );

    const notes = notation.measures.flatMap((measure) => measure.events.filter((event) => event.kind === "note"));
    expect(notes).toHaveLength(2);
    expect(notes.map((note) => [note.measure, note.onset, note.durationBeats])).toEqual([[1, 3, 1], [2, 4, 1]]);
    expect(notes[0]).toMatchObject({ tieStart: true, tieStop: false });
    expect(notes[1]).toMatchObject({ tieStart: false, tieStop: true });
  });
});
