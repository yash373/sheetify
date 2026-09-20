import { describe, expect, it } from "vitest";

import { fallbackPointerPercent, noteIndexAtBeat, noteIndicesCrossed, wrapBeat } from "@/lib/practice-playback";
import type { NoteEvent } from "@/lib/types";

const notes: NoteEvent[] = [
  { id: "a", pitch: "C4", midi: 60, start: 0, duration: 1, measure: 1 },
  { id: "b", pitch: "E4", midi: 64, start: 1, duration: 1, measure: 1 },
  { id: "c", pitch: "G4", midi: 67, start: 2, duration: 1, measure: 1 },
];

describe("practice playback timing", () => {
  it("returns every note crossed by a frame, including skipped frames", () => {
    expect(noteIndicesCrossed(notes, 0, 2.1)).toEqual([1, 2]);
  });

  it("maps a beat to the active canonical note", () => {
    expect(noteIndexAtBeat(notes, 1.25)).toBe(1);
    expect(noteIndexAtBeat(notes, 4)).toBe(2);
  });

  it("wraps loop playback without losing the loop origin", () => {
    expect(wrapBeat(8.5, 2, 6)).toBe(4.5);
  });

  it("provides a bounded fallback pointer position", () => {
    expect(fallbackPointerPercent(2, 5)).toBe(50);
    expect(fallbackPointerPercent(99, 5)).toBe(100);
  });
});
