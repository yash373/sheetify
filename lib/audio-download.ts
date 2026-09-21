import type { AudioArtifact } from "@/lib/transcription";
import type { TrackSource } from "@/lib/types";
import { isRetryableProviderFailure, withRetries } from "@/lib/retry";

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 15 * 60;

export class AudioDownloadError extends Error {
  constructor(message: string) { super(message); this.name = "AudioDownloadError"; }
}

export type AudioDownloadOptions = {
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  maxDurationSeconds?: number;
  authorizedHosts?: Partial<Record<TrackSource["provider"], RegExp>>;
};

function isAudioContentType(contentType: string) {
  return contentType.startsWith("audio/") || contentType === "application/octet-stream";
}

async function readBoundedBytes(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new AudioDownloadError("The licensed audio file exceeds the size limit.");
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new AudioDownloadError("The licensed audio file exceeds the size limit.");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new AudioDownloadError("The licensed audio file exceeds the size limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

const defaultAuthorizedHosts: Partial<Record<TrackSource["provider"], RegExp>> = {
  jamendo: /(^|\.)storage\.jamendo\.com$/i,
  internetarchive: /(^|\.)archive\.org$/i,
};

export function createLicensedAudioDownloader(options: AudioDownloadOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_AUDIO_BYTES;
  const maxDurationSeconds = options.maxDurationSeconds ?? MAX_AUDIO_DURATION_SECONDS;
  const authorizedHosts = { ...defaultAuthorizedHosts, ...options.authorizedHosts };

  return {
    async download(source: TrackSource): Promise<AudioArtifact> {
      if (!source.downloadAllowed || !source.downloadUrl) throw new AudioDownloadError("The selected source does not permit audio download.");
      if (!Number.isFinite(source.durationSeconds) || source.durationSeconds <= 0 || source.durationSeconds > maxDurationSeconds) throw new AudioDownloadError("The licensed audio exceeds the duration limit.");
      let url: URL;
      try { url = new URL(source.downloadUrl); } catch { throw new AudioDownloadError("The licensed audio URL is invalid."); }
      if (url.protocol !== "https:") throw new AudioDownloadError("Licensed audio must be downloaded over HTTPS.");
      const hostPattern = authorizedHosts[source.provider];
      if (!hostPattern?.test(url.hostname)) throw new AudioDownloadError("The licensed audio host is not authorized for this provider.");

      const response = await withRetries(() => fetchImpl(url, { redirect: "error" }), { shouldRetry: isRetryableProviderFailure });
      if (!response.ok) throw new AudioDownloadError(`Licensed audio request failed with status ${response.status}.`);
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
      if (!isAudioContentType(contentType)) throw new AudioDownloadError("The licensed source did not return an audio file.");
      const bytes = await readBoundedBytes(response, maxBytes);
      if (bytes.byteLength === 0) throw new AudioDownloadError("The licensed audio file was empty.");
      return { bytes, contentType, filename: `${source.trackId}.audio`, cleanup: () => { bytes.fill(0); } };
    },
  };
}
