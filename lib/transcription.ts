export type AudioArtifact = {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  cleanup?: () => Promise<void> | void;
};

export type TranscriptionNote = {
  startTimeSeconds: number;
  endTimeSeconds: number;
  pitchMidi: number;
  velocity: number;
};

export type TranscriptionResult = {
  provider: "basic-pitch-hosted";
  model: string;
  durationSeconds: number;
  notes: TranscriptionNote[];
};

export interface TranscriptionProvider {
  readonly id: TranscriptionResult["provider"];
  transcribe(audio: AudioArtifact): Promise<TranscriptionResult>;
}

export class TranscriptionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptionConfigurationError";
  }
}

export class TranscriptionProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptionProviderError";
  }
}

type BasicPitchResponse = {
  model?: unknown;
  duration_seconds?: unknown;
  notes?: unknown;
  note_events?: unknown;
};

type BasicPitchResponseNote = {
  start_time_s?: unknown;
  end_time_s?: unknown;
  pitch_midi?: unknown;
  velocity?: unknown;
};

type HostedBasicPitchOptions = {
  endpoint?: string;
  token?: string;
  fetchImpl?: typeof fetch;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseNotes(payload: BasicPitchResponse) {
  const rawNotes = payload.notes ?? payload.note_events;
  if (!Array.isArray(rawNotes)) {
    throw new TranscriptionProviderError("Basic Pitch returned no note events.");
  }

  return rawNotes.map((rawNote, index) => {
    const note = rawNote as BasicPitchResponseNote;
    if (
      !isFiniteNumber(note.start_time_s) ||
      !isFiniteNumber(note.end_time_s) ||
      !isFiniteNumber(note.pitch_midi) ||
      !isFiniteNumber(note.velocity) ||
      note.start_time_s < 0 ||
      note.end_time_s <= note.start_time_s ||
      note.pitch_midi < 0 ||
      note.pitch_midi > 127 ||
      note.velocity < 0 ||
      note.velocity > 1
    ) {
      throw new TranscriptionProviderError(`Basic Pitch returned an invalid note at index ${index}.`);
    }

    return {
      startTimeSeconds: note.start_time_s,
      endTimeSeconds: note.end_time_s,
      pitchMidi: Math.round(note.pitch_midi),
      velocity: note.velocity,
    } satisfies TranscriptionNote;
  });
}

export function createHostedBasicPitchAdapter(options: HostedBasicPitchOptions = {}): TranscriptionProvider {
  const endpoint = options.endpoint ?? process.env.BASIC_PITCH_ENDPOINT;
  const token = options.token ?? process.env.BASIC_PITCH_TOKEN;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: "basic-pitch-hosted",
    async transcribe(audio) {
      if (!endpoint) {
        throw new TranscriptionConfigurationError("BASIC_PITCH_ENDPOINT is not configured.");
      }

      const form = new FormData();
      const audioBuffer = audio.bytes.buffer.slice(
        audio.bytes.byteOffset,
        audio.bytes.byteOffset + audio.bytes.byteLength,
      ) as ArrayBuffer;
      form.append("audio", new Blob([audioBuffer], { type: audio.contentType }), audio.filename);
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: "application/json" },
        body: form,
      });

      if (!response.ok) {
        throw new TranscriptionProviderError(`Basic Pitch request failed with status ${response.status}.`);
      }

      let payload: BasicPitchResponse;
      try {
        payload = (await response.json()) as BasicPitchResponse;
      } catch {
        throw new TranscriptionProviderError("Basic Pitch returned invalid JSON.");
      }

      const notes = parseNotes(payload);
      const durationSeconds = isFiniteNumber(payload.duration_seconds)
        ? payload.duration_seconds
        : Math.max(0, ...notes.map((note) => note.endTimeSeconds));

      return {
        provider: "basic-pitch-hosted",
        model: typeof payload.model === "string" && payload.model.length > 0 ? payload.model : "basic-pitch",
        durationSeconds,
        notes,
      };
    },
  };
}
