import { withRetries } from "@/lib/retry";

export type AudioArtifact = { bytes: Uint8Array; contentType: string; filename: string; cleanup?: () => Promise<void> | void };
export type TranscriptionNote = { startTimeSeconds: number; endTimeSeconds: number; pitchMidi: number; velocity: number };
export type TranscriptionResult = { provider: "basic-pitch-hosted"; model: string; durationSeconds: number; notes: TranscriptionNote[] };

export interface TranscriptionProvider {
  readonly id: TranscriptionResult["provider"];
  transcribe(audio: AudioArtifact): Promise<TranscriptionResult>;
}

export class TranscriptionConfigurationError extends Error {
  constructor(message: string) { super(message); this.name = "TranscriptionConfigurationError"; }
}

export class TranscriptionProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, options: { retryable?: boolean } = {}) { super(message); this.name = "TranscriptionProviderError"; this.retryable = options.retryable ?? false; }
}

export class TranscriptionQuotaError extends TranscriptionProviderError {
  constructor(message = "The hosted transcription quota is exhausted.") { super(message, { retryable: false }); this.name = "TranscriptionQuotaError"; }
}

export class TranscriptionTimeoutError extends TranscriptionProviderError {
  constructor(message = "The hosted transcription timed out while waiting for the Space.") { super(message, { retryable: true }); this.name = "TranscriptionTimeoutError"; }
}

type BasicPitchResponse = { model?: unknown; duration_seconds?: unknown; notes?: unknown; note_events?: unknown; data?: unknown };
type BasicPitchResponseNote = { start_time_s?: unknown; end_time_s?: unknown; pitch_midi?: unknown; velocity?: unknown };

export type HostedBasicPitchOptions = {
  endpoint?: string;
  token?: string;
  apiName?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  pollIntervalMs?: number;
  maxPolls?: number;
  maxAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function providerHeaders(token?: string): Record<string, string> { return { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: "application/json" }; }

function providerErrorForResponse(response: Response, operation: string): TranscriptionProviderError {
  if (response.status === 402 || response.status === 429) return new TranscriptionQuotaError(`Basic Pitch ${operation} was rejected because hosted quota is exhausted.`);
  return new TranscriptionProviderError(`Basic Pitch ${operation} failed with status ${response.status}.`, { retryable: response.status >= 500 });
}

function parseNotes(payload: BasicPitchResponse): TranscriptionNote[] {
  const rawNotes = payload.notes ?? payload.note_events;
  if (!Array.isArray(rawNotes)) throw new TranscriptionProviderError("Basic Pitch returned no note events.");
  return rawNotes.map((rawNote, index) => {
    const note = rawNote as BasicPitchResponseNote;
    if (!isFiniteNumber(note.start_time_s) || !isFiniteNumber(note.end_time_s) || !isFiniteNumber(note.pitch_midi) || !isFiniteNumber(note.velocity) || note.start_time_s < 0 || note.end_time_s <= note.start_time_s || note.pitch_midi < 0 || note.pitch_midi > 127 || note.velocity < 0 || note.velocity > 1) {
      throw new TranscriptionProviderError(`Basic Pitch returned an invalid note at index ${index}.`);
    }
    return { startTimeSeconds: note.start_time_s, endTimeSeconds: note.end_time_s, pitchMidi: Math.round(note.pitch_midi), velocity: note.velocity } satisfies TranscriptionNote;
  });
}

function parseSse(text: string): { event?: string; data?: string } {
  let event: string | undefined;
  const data: string[] = [];
  for (const line of text.split(/\r?\n/)) { if (line.startsWith("event:")) event = line.slice(6).trim(); if (line.startsWith("data:")) data.push(line.slice(5).trim()); }
  return { event, data: data.length ? data.join("\n") : undefined };
}

function parseJsonData(value: string): unknown { try { return JSON.parse(value); } catch { throw new TranscriptionProviderError("Basic Pitch returned malformed poll data."); } }

function normalizePayload(value: unknown): BasicPitchResponse {
  const candidate = value as BasicPitchResponse;
  const data = Array.isArray(value) && value.length === 1 ? value[0] : Array.isArray(candidate?.data) && candidate.data.length === 1 ? candidate.data[0] : value;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new TranscriptionProviderError("Basic Pitch returned a malformed result.");
  return data as BasicPitchResponse;
}

function eventIdFrom(value: unknown): string {
  if (!value || typeof value !== "object" || typeof (value as { event_id?: unknown }).event_id !== "string") throw new TranscriptionProviderError("Basic Pitch did not return a queue event id.");
  return (value as { event_id: string }).event_id;
}

function isQuotaMessage(value: string) { return /quota|exhausted|out of credits|rate limit/i.test(value); }

export function createHostedBasicPitchAdapter(options: HostedBasicPitchOptions = {}): TranscriptionProvider {
  const endpoint = options.endpoint ?? process.env.BASIC_PITCH_ENDPOINT;
  const token = options.token ?? process.env.BASIC_PITCH_TOKEN;
  const apiName = options.apiName ?? process.env.BASIC_PITCH_API_NAME ?? "predict";
  const model = options.model ?? process.env.BASIC_PITCH_MODEL ?? "basic-pitch";
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? 60_000));
  const pollIntervalMs = Math.max(0, Math.floor(options.pollIntervalMs ?? 250));
  const maxPolls = Math.max(1, Math.floor(options.maxPolls ?? 120));
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  return {
    id: "basic-pitch-hosted",
    async transcribe(audio) {
      if (!endpoint) throw new TranscriptionConfigurationError("BASIC_PITCH_ENDPOINT is not configured.");
      if (!apiName.trim()) throw new TranscriptionConfigurationError("BASIC_PITCH_API_NAME is not configured.");
      const base = endpoint.replace(/\/+$/, "");
      const uploadUrl = `${base}/gradio_api/upload`;
      const callUrl = `${base}/gradio_api/call/${encodeURIComponent(apiName)}`;

      const transcribeOnce = async () => {
        const audioBuffer = audio.bytes.buffer.slice(audio.bytes.byteOffset, audio.bytes.byteOffset + audio.bytes.byteLength) as ArrayBuffer;
        const form = new FormData();
        form.append("files", new Blob([audioBuffer], { type: audio.contentType }), audio.filename);
        const uploadResponse = await fetchImpl(uploadUrl, { method: "POST", headers: providerHeaders(token), body: form });
        if (!uploadResponse.ok) throw providerErrorForResponse(uploadResponse, "upload");
        let uploadPayload: unknown;
        try { uploadPayload = await uploadResponse.json(); } catch { throw new TranscriptionProviderError("Basic Pitch returned malformed upload data."); }
        const uploadPath = Array.isArray(uploadPayload) && typeof uploadPayload[0] === "string" ? uploadPayload[0] : undefined;
        if (!uploadPath) throw new TranscriptionProviderError("Basic Pitch did not return an uploaded file path.");

        const callResponse = await fetchImpl(callUrl, { method: "POST", headers: { ...providerHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify({ data: [{ path: uploadPath, meta: { _type: "gradio.FileData" }, orig_name: audio.filename }] }) });
        if (!callResponse.ok) throw providerErrorForResponse(callResponse, "queue request");
        let callPayload: unknown;
        try { callPayload = await callResponse.json(); } catch { throw new TranscriptionProviderError("Basic Pitch returned malformed queue data."); }
        const eventId = eventIdFrom(callPayload);
        const deadline = Date.now() + timeoutMs;

        for (let poll = 0; poll < maxPolls && Date.now() <= deadline; poll += 1) {
          const pollResponse = await fetchImpl(`${callUrl}/${encodeURIComponent(eventId)}`, { headers: providerHeaders(token) });
          if (pollResponse.status === 202 || pollResponse.status === 204) { await sleep(pollIntervalMs); continue; }
          if (!pollResponse.ok) throw providerErrorForResponse(pollResponse, "poll");
          const sse = parseSse(await pollResponse.text());
          if (sse.event === "error") {
            const message = sse.data ?? "Basic Pitch queue failed.";
            if (isQuotaMessage(message)) throw new TranscriptionQuotaError(message);
            throw new TranscriptionProviderError(message, { retryable: true });
          }
          if (sse.event !== "complete" || !sse.data) { await sleep(pollIntervalMs); continue; }
          const payload = normalizePayload(parseJsonData(sse.data));
          const notes = parseNotes(payload);
          return { provider: "basic-pitch-hosted" as const, model: typeof payload.model === "string" && payload.model.length > 0 ? payload.model : model, durationSeconds: isFiniteNumber(payload.duration_seconds) ? payload.duration_seconds : Math.max(0, ...notes.map((note) => note.endTimeSeconds)), notes } satisfies TranscriptionResult;
        }
        throw new TranscriptionTimeoutError();
      };

      return withRetries(transcribeOnce, { maxAttempts, delayMs: pollIntervalMs, sleep, shouldRetry: (value) => value instanceof TypeError || (value instanceof TranscriptionProviderError && value.retryable) });
    },
  };
}
