import type { TranscriptionResult } from "@/lib/transcription";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_SECONDS = 180;
const MODEL_SAMPLE_RATE = 22_050;

function audioContextConstructor() {
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

async function decodeAndResample(file: File) {
  const Context = audioContextConstructor();
  if (!Context) throw new Error("This browser cannot decode audio files.");
  const context = new Context();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration <= 0 || decoded.duration > MAX_UPLOAD_SECONDS) {
      throw new Error(`Choose an audio file shorter than ${MAX_UPLOAD_SECONDS / 60} minutes.`);
    }
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * MODEL_SAMPLE_RATE), MODEL_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return await offline.startRendering();
  } finally {
    await context.close();
  }
}

export async function transcribeAudioFile(file: File, onProgress: (progress: number) => void): Promise<TranscriptionResult> {
  if (file.size === 0) throw new Error("Choose a non-empty audio file.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Choose an audio file smaller than 25 MB.");
  if (!file.type.startsWith("audio/")) throw new Error("Choose an MP3, WAV, OGG, or FLAC audio file.");

  onProgress(4);
  const audio = await decodeAndResample(file);
  onProgress(12);
  const { BasicPitch, addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } = await import("@spotify/basic-pitch");
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  const engine = new BasicPitch("/basic-pitch/model.json");
  await engine.evaluateModel(
    audio,
    (nextFrames, nextOnsets, nextContours) => {
      frames.push(...nextFrames);
      onsets.push(...nextOnsets);
      contours.push(...nextContours);
    },
    (fraction) => onProgress(12 + Math.round(fraction * 76)),
  );
  const rawNotes = noteFramesToTime(addPitchBendsToNoteEvents(contours, outputToNotesPoly(frames, onsets, 0.25, 0.25, 5)));
  const notes = rawNotes.map((note) => ({
    startTimeSeconds: note.startTimeSeconds,
    endTimeSeconds: note.startTimeSeconds + note.durationSeconds,
    pitchMidi: note.pitchMidi,
    velocity: Math.max(0, Math.min(1, note.amplitude)),
  }));
  if (notes.length === 0) throw new Error("No playable notes were detected in this audio.");
  onProgress(92);
  return { provider: "basic-pitch-browser", model: "spotify-basic-pitch-ts-1.0.1", durationSeconds: audio.duration, notes };
}
