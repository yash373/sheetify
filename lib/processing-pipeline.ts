import { notationToMusicXml } from "@/lib/notation";
import { createLicensedAudioDownloader } from "@/lib/audio-download";
import { transcriptionToNotation } from "@/lib/transcription-to-notation";
import { createHostedBasicPitchAdapter } from "@/lib/transcription";
import type { AudioArtifact, TranscriptionProvider } from "@/lib/transcription";
import type { Difficulty, NoteEvent, SheetPackage, Song } from "@/lib/types";

export type AudioDownloader = {
  download(source: Song["source"]): Promise<AudioArtifact>;
};

export type SheetCache = {
  get(key: string): Promise<SheetPackage | null>;
  set(key: string, sheet: SheetPackage): Promise<void>;
};

export type ProcessingRequest = {
  song: Song;
  difficulty: Difficulty;
  tempo: number;
  transcriptionModel: string;
  downloader: AudioDownloader;
  transcriber: TranscriptionProvider;
  cache: SheetCache;
};

export type HostedProcessingRequest = Omit<ProcessingRequest, "downloader" | "transcriber">;

export function createHostedProcessingPipeline(options: { endpoint?: string; token?: string; fetchImpl?: typeof fetch } = {}) {
  const downloader = createLicensedAudioDownloader({ fetchImpl: options.fetchImpl });
  const transcriber = createHostedBasicPitchAdapter({ endpoint: options.endpoint, token: options.token, fetchImpl: options.fetchImpl });
  return (request: HostedProcessingRequest) => processLicensedSong({ ...request, downloader, transcriber });
}

export class LicensingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicensingError";
  }
}

export function processingCacheKey(request: Pick<ProcessingRequest, "song" | "difficulty" | "transcriptionModel">) {
  return [
    "sheetify",
    request.song.source.provider,
    request.song.source.trackId,
    request.difficulty,
    request.transcriptionModel,
  ].map((part) => encodeURIComponent(part)).join(":");
}

function pitchLabel(pitch: NonNullable<SheetPackage["notation"]["measures"][number]["events"][number]["pitch"]>) {
  return `${pitch.step}${pitch.alter === 1 ? "#" : pitch.alter === -1 ? "b" : ""}${pitch.octave}`;
}

function keyLabelFromFifths(fifths: number) {
  const names: Record<number, string> = { [-7]: "Cb", [-6]: "Gb", [-5]: "Db", [-4]: "Ab", [-3]: "Eb", [-2]: "Bb", [-1]: "F", 0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#" };
  return `${names[fifths] ?? "C"} major`;
}

function noteEventsFromSheet(sheet: SheetPackage["notation"]): NoteEvent[] {
  return sheet.measures.flatMap((measure) => measure.events.filter((event) => event.kind === "note" && event.pitch && typeof event.midi === "number").map((event) => ({
    id: event.id,
    pitch: pitchLabel(event.pitch!),
    midi: event.midi!,
    start: event.onset,
    duration: event.durationBeats,
    measure: event.measure,
  })));
}

export async function processLicensedSong(request: ProcessingRequest) {
  const { song, difficulty, tempo, downloader, transcriber, cache } = request;
  if (!song.source.downloadAllowed || !song.source.downloadUrl) {
    throw new LicensingError(`Audio download is not permitted for ${song.title}.`);
  }

  const key = processingCacheKey(request);
  const cached = await cache.get(key);
  if (cached) return { sheet: cached, cacheHit: true };

  let audio: AudioArtifact | undefined;
  try {
    audio = await downloader.download(song.source);
    const transcription = await transcriber.transcribe(audio);
    const notation = transcriptionToNotation(transcription, {
      title: song.title,
      artist: song.artist,
      tempo,
      difficulty,
    });
    const sheetId = `${key}:result`;
    const sheet: SheetPackage = {
      sheetId,
      song,
      difficulty,
      tempo: notation.tempo,
      key: keyLabelFromFifths(notation.keyFifths),
      timeSignature: "4/4",
      musicXml: notationToMusicXml(notation),
      noteEvents: noteEventsFromSheet(notation),
      notation,
      generatedAt: new Date().toISOString(),
    };
    await cache.set(key, sheet);
    return { sheet, cacheHit: false };
  } finally {
    await audio?.cleanup?.();
  }
}
