import type { NoteEvent } from "@/lib/types";

export function noteIndexAtBeat(notes: NoteEvent[], beat: number) {
  const active = notes.findIndex((note) => note.start <= beat && beat < note.start + note.duration);
  if (active >= 0) return active;
  const previous = notes.reduce((index, note, candidate) => (note.start <= beat ? candidate : index), -1);
  return Math.max(0, previous);
}

export function noteIndicesCrossed(notes: NoteEvent[], fromBeat: number, toBeat: number) {
  if (toBeat < fromBeat) return [];
  return notes.reduce<number[]>((crossed, note, index) => {
    if (note.start > fromBeat && note.start <= toBeat) crossed.push(index);
    return crossed;
  }, []);
}

export function wrapBeat(beat: number, start: number, end: number) {
  if (end <= start) return start;
  return beat >= end ? start + ((beat - start) % (end - start)) : beat;
}

export function fallbackPointerPercent(index: number, total: number) {
  if (total <= 1) return 0;
  return Math.min(100, Math.max(0, (index / (total - 1)) * 100));
}
