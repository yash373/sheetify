import { describe, expect, it } from "vitest";

import { beatsForDuration, createNotation, durationForBeats, midiToPitch, notationToMusicXml } from "@/lib/notation";

describe("canonical notation", () => {
  it("maps written durations, including dotted values, to beats", () => {
    expect(beatsForDuration("whole")).toBe(4);
    expect(beatsForDuration("half")).toBe(2);
    expect(beatsForDuration("quarter")).toBe(1);
    expect(beatsForDuration("eighth")).toBe(0.5);
    expect(beatsForDuration("16th")).toBe(0.25);
    expect(beatsForDuration("quarter", 1)).toBe(1.5);
    expect(durationForBeats(1.5)).toEqual({ writtenDuration: "quarter", dots: 1 });
  });

  it("fills silent spans with rests and preserves measure boundaries", () => {
    const notation = createNotation({
      title: "Test",
      artist: "Composer",
      tempo: 90,
      divisions: 4,
      keyFifths: 0,
      timeSignature: { beats: 4, beatType: 4 },
      clef: "G",
      events: [{
        id: "note-1",
        kind: "note",
        pitch: midiToPitch(60),
        midi: 60,
        onset: 2,
        durationBeats: 1,
        writtenDuration: "quarter",
        measure: 1,
        beat: 2,
        voice: 1,
        staff: 1,
      }],
    });

    expect(notation.measures).toHaveLength(1);
    expect(notation.measures[0].events.map((event) => event.kind)).toEqual(["rest", "note", "rest"]);
    expect(notation.measures[0].events.map((event) => event.durationBeats)).toEqual([2, 1, 1]);
  });

  it("serializes notes, rests, dots, ties, beams, and score metadata to MusicXML", () => {
    const notation = createNotation({
      title: "A & B",
      artist: "Composer",
      tempo: 120,
      divisions: 4,
      keyFifths: 2,
      timeSignature: { beats: 3, beatType: 4 },
      clef: "G",
      events: [{
        id: "note-1",
        kind: "note",
        pitch: { step: "F", octave: 4, alter: 1 },
        midi: 66,
        onset: 0,
        durationBeats: 1.5,
        writtenDuration: "quarter",
        dots: 1,
        measure: 1,
        beat: 0,
        voice: 1,
        staff: 1,
        accidental: "sharp",
        tieStart: true,
        beam: "begin",
      }],
    });
    const xml = notationToMusicXml(notation);

    expect(xml).toContain("A &amp; B");
    expect(xml).toContain("<fifths>2</fifths>");
    expect(xml).toContain("<beats>3</beats>");
    expect(xml).toContain("<type>quarter</type><dot/>");
    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain("<beam number=\"1\">begin</beam>");
    expect(xml).toContain("<rest/>");
  });
});
