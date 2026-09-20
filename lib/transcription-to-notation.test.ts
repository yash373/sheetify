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

  it("keeps simultaneous notes as chords and derives a usable tempo and key", () => {
    const notation = transcriptionToNotation(
      {
        provider: "basic-pitch-hosted",
        model: "test",
        durationSeconds: 3,
        notes: [
          { startTimeSeconds: 0, endTimeSeconds: 0.5, pitchMidi: 60, velocity: 0.8 },
          { startTimeSeconds: 0, endTimeSeconds: 0.5, pitchMidi: 64, velocity: 0.8 },
          { startTimeSeconds: 1, endTimeSeconds: 1.5, pitchMidi: 67, velocity: 0.8 },
        ],
      },
      { title: "Chord", artist: "Composer", tempo: 92, autoTempo: true },
    );

    const notes = notation.measures.flatMap((measure) => measure.events.filter((event) => event.kind === "note"));
    expect(notation.tempo).toBe(60);
    expect(notation.keyFifths).toBe(0);
    expect(notes.filter((note) => note.onset === 0)).toHaveLength(2);
    expect(notes.find((note) => note.onset === 0 && note.midi === 64)?.chordId).toBe("chord-0");
  });

  it("reduces dense onsets for beginner and medium arrangements", () => {
    const transcription = {
      provider: "basic-pitch-hosted" as const,
      model: "test",
      durationSeconds: 2,
      notes: [
        { startTimeSeconds: 0, endTimeSeconds: 0.5, pitchMidi: 60, velocity: 0.8 },
        { startTimeSeconds: 0, endTimeSeconds: 0.5, pitchMidi: 64, velocity: 0.8 },
        { startTimeSeconds: 0, endTimeSeconds: 0.5, pitchMidi: 67, velocity: 0.8 },
      ],
    };
    const beginner = transcriptionToNotation(transcription, { title: "Test", artist: "Composer", tempo: 60, difficulty: "beginner" });
    const medium = transcriptionToNotation(transcription, { title: "Test", artist: "Composer", tempo: 60, difficulty: "medium" });
    expect(beginner.measures.flatMap((measure) => measure.events).filter((event) => event.kind === "note")).toHaveLength(1);
    expect(medium.measures.flatMap((measure) => measure.events).filter((event) => event.kind === "note")).toHaveLength(2);
  });

  it("beams adjacent short notes without beaming a chord as a run", () => {
    const notation = transcriptionToNotation(
      {
        provider: "basic-pitch-hosted",
        model: "test",
        durationSeconds: 2,
        notes: [
          { startTimeSeconds: 0, endTimeSeconds: 0.5, pitchMidi: 60, velocity: 0.8 },
          { startTimeSeconds: 0, endTimeSeconds: 0.5, pitchMidi: 64, velocity: 0.8 },
          { startTimeSeconds: 0.5, endTimeSeconds: 1, pitchMidi: 62, velocity: 0.8 },
        ],
      },
      { title: "Beams", artist: "Composer", tempo: 60 },
    );
    const notes = notation.measures.flatMap((measure) => measure.events.filter((event) => event.kind === "note"));
    expect(notes.filter((note) => note.onset === 0).map((note) => note.beam)).toEqual(["begin", "begin"]);
    expect(notes.find((note) => note.onset === 0.5)?.beam).toBe("end");
  });
});
