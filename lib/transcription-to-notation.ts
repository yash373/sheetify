import { createNotation, durationForBeats, midiToPitch } from "@/lib/notation";
import type { Notation } from "@/lib/notation";
import type { TranscriptionResult } from "@/lib/transcription";

type TranscriptionNotationMetadata = {
  title: string;
  artist: string;
  tempo: number;
  keyFifths?: number;
  timeSignature?: { beats: number; beatType: number };
  clef?: "G" | "F" | "C";
  subdivisionBeats?: number;
};

const supportedDurations = [4, 2, 1.5, 1, 0.75, 0.5, 0.25];

function quantize(value: number, subdivision: number) {
  return Math.max(0, Math.round(value / subdivision) * subdivision);
}

function largestWrittenDuration(maxBeats: number) {
  return supportedDurations.find((duration) => duration <= maxBeats + 0.0001) ?? 0.25;
}

export function transcriptionToNotation(
  transcription: TranscriptionResult,
  metadata: TranscriptionNotationMetadata,
): Notation {
  const timeSignature = metadata.timeSignature ?? { beats: 4, beatType: 4 };
  const beatsPerMeasure = timeSignature.beats * (4 / timeSignature.beatType);
  const subdivision = metadata.subdivisionBeats ?? 0.25;
  if (subdivision <= 0 || beatsPerMeasure <= 0) throw new Error("Notation subdivision and time signature must be positive.");

  const events = transcription.notes
    .slice()
    .sort((left, right) => left.startTimeSeconds - right.startTimeSeconds || left.pitchMidi - right.pitchMidi)
    .flatMap((note, noteIndex) => {
      const onset = quantize((note.startTimeSeconds * metadata.tempo) / 60, subdivision);
      const end = Math.max(onset + subdivision, quantize((note.endTimeSeconds * metadata.tempo) / 60, subdivision));
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
          beam: duration <= 0.5 ? "continue" as const : undefined,
        };
        segments.push(segment);
        cursor += duration;
        segmentIndex += 1;
      }

      return segments;
    });

  return createNotation({
    title: metadata.title,
    artist: metadata.artist,
    tempo: metadata.tempo,
    divisions: 4,
    keyFifths: metadata.keyFifths ?? 0,
    timeSignature,
    clef: metadata.clef ?? "G",
    events,
  });
}
