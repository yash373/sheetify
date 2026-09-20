import type { AudioArtifact } from "@/lib/transcription";
import type { TrackSource } from "@/lib/types";
import { isRetryableProviderFailure, withRetries } from "@/lib/retry";

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export class AudioDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioDownloadError";
  }
}

export type AudioDownloadOptions = {
  fetchImpl?: typeof fetch;
  maxBytes?: number;
};

function isAudioContentType(contentType: string) {
  return contentType.startsWith("audio/") || contentType === "application/octet-stream";
}

export function createLicensedAudioDownloader(options: AudioDownloadOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_AUDIO_BYTES;

  return {
    async download(source: TrackSource): Promise<AudioArtifact> {
      if (!source.downloadAllowed || !source.downloadUrl) {
        throw new AudioDownloadError("The selected source does not permit audio download.");
      }

      let url: URL;
      try {
        url = new URL(source.downloadUrl);
      } catch {
        throw new AudioDownloadError("The licensed audio URL is invalid.");
      }
      if (url.protocol !== "https:") throw new AudioDownloadError("Licensed audio must be downloaded over HTTPS.");

      const response = await withRetries(() => fetchImpl(url, { redirect: "error" }), { shouldRetry: isRetryableProviderFailure });
      if (!response.ok) throw new AudioDownloadError(`Licensed audio request failed with status ${response.status}.`);

      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "application/octet-stream";
      if (!isAudioContentType(contentType)) throw new AudioDownloadError("The licensed source did not return an audio file.");

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0) throw new AudioDownloadError("The licensed audio file was empty.");
      if (bytes.byteLength > maxBytes) throw new AudioDownloadError("The licensed audio file exceeds the size limit.");

      return {
        bytes,
        contentType,
        filename: `${source.trackId}.audio`,
        cleanup: () => undefined,
      };
    },
  };
}
