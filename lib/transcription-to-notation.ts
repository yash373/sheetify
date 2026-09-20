import { createNotation, durationForBeats, midiToPitch } from "@/lib/notation";
import type { Notation } from "@/lib/notation";
import type { TranscriptionResult } from "@/lib/transcription";
import type { Difficulty } from "@/lib/types";

type TranscriptionNotationMetadata = {
  title: string;
  artist: string;
  tempo: number;
  keyFifths?: number;
  timeSignature?: { beats: number; beatType: number };
  clef?: "G" | "F" | "C";
  subdivisionBeats?: number;
  difficulty?: Difficulty;
  autoTempo?: boolean;
};

const supportedDurations = [4, 2, 1.5, 1, 0.75, 0.5, 0.25];

function quantize(value: number, subdivision: number) {
  return Math.max(0, Math.round(value / subdivision) * subdivision);
}

function largestWrittenDuration(maxBeats: number) {
  return supportedDurations.find((duration) => duration <= maxBeats + 0.0001) ?? 0.25;
}

function estimatedTempo(transcription: TranscriptionResult, fallback: number) {
  const onsets = [...new Set(transcription.notes.map((note) => note.startTimeSeconds))].sort((a, b) => a - b);
  const intervals = onsets.slice(1).map((onset, index) => onset - onsets[index]).filter((interval) => interval > 0.05);
  if (intervals.length === 0) return fallback;
  const median = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
  return Math.max(40, Math.min(200, Math.round(60 / median)));
}

function estimatedKeyFifths(transcription: TranscriptionResult) {
  if (transcription.notes.length === 0) return 0;
  const pitchClasses = new Map<number, number>();
  for (const note of transcription.notes) {
    const pitchClass = ((Math.round(note.pitchMidi) % 12) + 12) % 12;
    pitchClasses.set(pitchClass, (pitchClasses.get(pitchClass) ?? 0) + Math.max(0.1, note.endTimeSeconds - note.startTimeSeconds));
  }
  const tonic = [...pitchClasses.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 0;
  const fifthsByPitchClass: Record<number, number> = { 0: 0, 1: 7, 2: 2, 3: -5, 4: 4, 5: -1, 6: 6, 7: 1, 8: -4, 9: 3, 10: -2, 11: 5 };
  return fifthsByPitchClass[tonic] ?? 0;
}

function notesForDifficulty(transcription: TranscriptionResult, tempo: number, subdivision: number, difficulty?: Difficulty) {
  if (!difficulty || difficulty === "hard") return transcription.notes.slice();
  const grouped = new Map<number, TranscriptionResult["notes"]>();
  for (const note of transcription.notes) {
    const onset = quantize((note.startTimeSeconds * tempo) / 60, subdivision);
    grouped.set(onset, [...(grouped.get(onset) ?? []), note]);
  }
  const maxNotes = difficulty === "beginner" ? 1 : 2;
  return [...grouped.values()].flatMap((notes) => notes.slice().sort((left, right) => right.pitchMidi - left.pitchMidi).slice(0, maxNotes));
}

export function transcriptionToNotation(
  transcription: TranscriptionResult,
  metadata: TranscriptionNotationMetadata,
): Notation {
  const timeSignature = metadata.timeSignature ?? { beats: 4, beatType: 4 };
  const beatsPerMeasure = timeSignature.beats * (4 / timeSignature.beatType);
  const subdivision = metadata.subdivisionBeats ?? 0.25;
  if (subdivision <= 0 || beatsPerMeasure <= 0) throw new Error("Notation subdivision and time signature must be positive.");

  const effectiveTempo = metadata.autoTempo ? estimatedTempo(transcription, metadata.tempo) : metadata.tempo;
  const events = notesForDifficulty(transcription, effectiveTempo, subdivision, metadata.difficulty)
    .slice()
    .sort((left, right) => left.startTimeSeconds - right.startTimeSeconds || left.pitchMidi - right.pitchMidi)
    .flatMap((note, noteIndex) => {
      const onset = quantize((note.startTimeSeconds * effectiveTempo) / 60, subdivision);
      const end = Math.max(onset + subdivision, quantize((note.endTimeSeconds * effectiveTempo) / 60, subdivision));
      const segments = [];
      let cursor = onset;
      let segmentIndex = 0;

      while (cursor < end - 0.0001) {
        const measureRemaining = beatsPerMeasure - (cursor % beatsPerMeasure);
        const duration = largestWrittenDuration(Math.min(end - cursor, measureRemaining));
        const isFirst = segmentIndex === 0;
        const reachesEnd = cursor + duration >= end - 0.0001;
        const segment = {
          id: `transcription-note-${noteIndex}-${segmentIndex}`,
          kind: "note" as const,
          pitch: midiToPitch(note.pitchMidi),
          midi: Math.round(note.pitchMidi),
          onset: cursor,
          durationBeats: duration,
          ...durationForBeats(duration),
          measure: Math.floor(cursor / beatsPerMeasure) + 1,
          beat: cursor % beatsPerMeasure,
          voice: 1,
          staff: 1,
          tieStop: !isFirst,
          tieStart: !reachesEnd,
        };
        segments.push(segment);
        cursor += duration;
        segmentIndex += 1;
      }

      return segments;
    });

  const chordGroups = new Map<number, number[]>();
  events.forEach((event, index) => {
    chordGroups.set(event.onset, [...(chordGroups.get(event.onset) ?? []), index]);
  });
  const normalizedEvents = events.map((event, index) => {
    const peers = chordGroups.get(event.onset) ?? [];
    return peers.length > 1 && peers[0] !== index
      ? { ...event, chordId: `chord-${event.onset}` }
      : event;
  });

  return createNotation({
    title: metadata.title,
    artist: metadata.artist,
    tempo: effectiveTempo,
    divisions: 4,
    keyFifths: metadata.keyFifths ?? estimatedKeyFifths(transcription),
    timeSignature,
    clef: metadata.clef ?? "G",
    events: normalizedEvents,
  });
}
