import { searchDemoSongs } from "@/lib/demo-data";
import type { Song, TrackLicense } from "@/lib/types";
import catalogIndex from "@/lib/catalog-index.json";

export type JamendoTrack = {
  id: string;
  name: string;
  artist_name: string;
  duration: number;
  license_ccurl?: string;
  audiodownload_allowed?: boolean;
  audiodownload?: string;
  tags?: string[];
};

type JamendoResponse = { results?: JamendoTrack[] };

export type CatalogProvider = {
  readonly id: "jamendo" | "internetarchive" | "imslp";
  search(query: string): Promise<Song[]>;
};

type CatalogIndexEntry = {
  id: string;
  title: string;
  artist: string;
  catalogUrl: string;
  genre: string;
  provider?: "imslp" | "openopus";
};

const IMSLP_LICENSE_URL = "https://imslp.org/wiki/IMSLP:Copyright_Made_Easy";
const IMSLP_METADATA_VERIFIED_AT = "2026-09-20T00:00:00.000Z";

const JAMENDO_API = "https://api.jamendo.com/v3.0/tracks/";
const JAMENDO_CATALOG = "https://www.jamendo.com/track";
const INTERNET_ARCHIVE_SEARCH = "https://archive.org/advancedsearch.php";
const INTERNET_ARCHIVE_METADATA = "https://archive.org/metadata";
const INTERNET_ARCHIVE_DOWNLOAD = "https://archive.org/download";

function licenseMetadata(url: string | undefined, title: string, artist: string): TrackLicense {
  const normalized = url?.toLowerCase() ?? "";
  const isCreativeCommons = normalized.includes("creativecommons.org/licenses/") || normalized.includes("creativecommons.org/publicdomain/zero/");
  const commercialUse = normalized.includes("by-nc") ? "not-allowed" : isCreativeCommons ? "allowed" : "unknown";
  const derivatives = normalized.includes("-nd/") || normalized.includes("/nd/") ? "not-allowed" : isCreativeCommons ? "allowed" : "unknown";
  const licenseUrl = url ?? "https://www.jamendo.com/legal/licenses";
  return { name: url ? "Creative Commons" : "Jamendo license", url: licenseUrl, attributionRequired: true, attributionText: `${title} by ${artist} — licensed via Jamendo (${licenseUrl})`, commercialUse, derivatives };
}

export function mapJamendoTrack(track: JamendoTrack, metadataVerifiedAt = new Date().toISOString()): Song {
  const title = track.name.trim();
  const artist = track.artist_name.trim();
  const explicitPermission = track.audiodownload_allowed === true;
  const directUrl = typeof track.audiodownload === "string" && track.audiodownload.trim() !== "" ? track.audiodownload.trim() : undefined;
  const license = licenseMetadata(track.license_ccurl, title, artist);
  const downloadAllowed = explicitPermission && Boolean(directUrl) && license.commercialUse === "allowed" && license.derivatives === "allowed";
  return {
    id: `jamendo-${track.id}`, title, artist, durationSeconds: track.duration, genre: track.tags?.[0] ?? "Licensed audio",
    source: { provider: "jamendo", trackId: track.id, catalogUrl: `${JAMENDO_CATALOG}/${encodeURIComponent(track.id)}`, ...(downloadAllowed ? { downloadUrl: directUrl } : {}), durationSeconds: track.duration, downloadAllowed, metadataVerifiedAt, license },
    processingEstimateSeconds: 90,
  };
}

async function searchJamendoSongs(query: string, clientId: string): Promise<Song[]> {
  const params = new URLSearchParams({ client_id: clientId, format: "json", limit: "20", search: query, audioformat: "mp32", audiodlformat: "mp32", include: "licenses" });
  const response = await fetch(`${JAMENDO_API}?${params.toString()}`, { next: { revalidate: 300 } });
  if (!response.ok) throw new Error(`Jamendo search failed with ${response.status}.`);
  const body = await response.json() as JamendoResponse;
  const verifiedAt = new Date().toISOString();
  return (body.results ?? []).map((track) => mapJamendoTrack(track, verifiedAt)).filter((song) => song.source.downloadAllowed && song.source.downloadUrl);
}

type InternetArchiveSearchResponse = { response?: { docs?: Array<{ identifier?: string; title?: string; creator?: string; licenseurl?: string }> } };
type InternetArchiveFile = { name?: string; format?: string; size?: string; length?: string };
type InternetArchiveMetadataResponse = { metadata?: { identifier?: string; title?: string; creator?: string; licenseurl?: string }; files?: InternetArchiveFile[] };

function isPermissiveArchiveLicense(url: string | undefined) {
  const normalized = url?.toLowerCase() ?? "";
  return normalized.includes("creativecommons.org/licenses/publicdomain") || normalized.includes("creativecommons.org/publicdomain");
}

function archiveLicense(url: string, title: string, artist: string): TrackLicense {
  return {
    name: "Public domain / CC0",
    url,
    attributionRequired: false,
    attributionText: `${title} by ${artist} — public-domain or CC0 recording from Internet Archive`,
    commercialUse: "allowed",
    derivatives: "allowed",
  };
}

function archiveAudioFile(files: InternetArchiveFile[]) {
  const candidates = files
    .filter((file) => typeof file.name === "string" && /\.(mp3|ogg|flac|wav)$/i.test(file.name))
    .map((file) => ({ ...file, sizeBytes: Number(file.size), durationSeconds: Number(file.length) }))
    .filter((file) => Number.isFinite(file.sizeBytes) && file.sizeBytes > 0 && file.sizeBytes <= 25 * 1024 * 1024 && Number.isFinite(file.durationSeconds) && file.durationSeconds > 0 && file.durationSeconds <= 15 * 60);
  return candidates.sort((a, b) => {
    const aMp3 = /\.mp3$/i.test(a.name ?? "") ? 0 : 1;
    const bMp3 = /\.mp3$/i.test(b.name ?? "") ? 0 : 1;
    return aMp3 - bMp3 || a.sizeBytes - b.sizeBytes;
  })[0];
}

async function searchInternetArchiveSongs(query: string): Promise<Song[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  const params = new URLSearchParams({
    q: `mediatype:audio AND format:MP3 AND licenseurl:*publicdomain* AND (title:${normalized} OR creator:${normalized} OR subject:${normalized})`,
    fl: "identifier,title,creator,licenseurl",
    rows: "8",
    page: "1",
    output: "json",
  });
  const searchResponse = await fetch(`${INTERNET_ARCHIVE_SEARCH}?${params.toString()}`, { next: { revalidate: 600 } });
  if (!searchResponse.ok) throw new Error(`Internet Archive search failed with ${searchResponse.status}.`);
  const searchBody = await searchResponse.json() as InternetArchiveSearchResponse;
  const verifiedAt = new Date().toISOString();
  const songs: Array<Song | null> = await Promise.all((searchBody.response?.docs ?? []).map(async (entry): Promise<Song | null> => {
    if (!entry.identifier || !isPermissiveArchiveLicense(entry.licenseurl)) return null;
    const metadataResponse = await fetch(`${INTERNET_ARCHIVE_METADATA}/${encodeURIComponent(entry.identifier)}`, { next: { revalidate: 3600 } });
    if (!metadataResponse.ok) return null;
    const metadata = await metadataResponse.json() as InternetArchiveMetadataResponse;
    const licenseUrl = metadata.metadata?.licenseurl ?? entry.licenseurl;
    if (!isPermissiveArchiveLicense(licenseUrl)) return null;
    const audio = archiveAudioFile(metadata.files ?? []);
    if (!audio?.name) return null;
    const title = (metadata.metadata?.title ?? entry.title ?? entry.identifier).trim();
    const artist = (metadata.metadata?.creator ?? entry.creator ?? "Public-domain recording").trim();
    return {
      id: `internetarchive-${entry.identifier}`,
      title,
      artist,
      durationSeconds: audio.durationSeconds,
      genre: "Public-domain piano audio",
      source: {
        provider: "internetarchive" as const,
        trackId: entry.identifier,
        catalogUrl: `https://archive.org/details/${encodeURIComponent(entry.identifier)}`,
        downloadUrl: `${INTERNET_ARCHIVE_DOWNLOAD}/${encodeURIComponent(entry.identifier)}/${encodeURIComponent(audio.name)}`,
        durationSeconds: audio.durationSeconds,
        downloadAllowed: true,
        metadataVerifiedAt: verifiedAt,
        license: archiveLicense(licenseUrl!, title, artist),
      },
      processingEstimateSeconds: 90,
    } satisfies Song;
  }));
  return songs.filter((song): song is Song => song !== null);
}

export function createInternetArchiveProvider(): CatalogProvider {
  return { id: "internetarchive", search: searchInternetArchiveSongs };
}

export function createJamendoProvider(clientId = process.env.JAMENDO_CLIENT_ID): CatalogProvider | null {
  if (!clientId) return null;
  return { id: "jamendo", search: (query) => searchJamendoSongs(query, clientId) };
}

function mapMetadataEntry(entry: CatalogIndexEntry): Song {
  const title = entry.title.trim();
  const artist = entry.artist.trim();
  const provider = entry.provider ?? (entry.id.startsWith("openopus-") ? "openopus" : "imslp");
  const isOpenOpus = provider === "openopus";
  return {
    id: entry.id,
    title,
    artist,
    durationSeconds: 0,
    genre: entry.genre,
    source: {
      provider,
      trackId: entry.id,
      catalogUrl: entry.catalogUrl,
      durationSeconds: 0,
      downloadAllowed: false,
      metadataVerifiedAt: IMSLP_METADATA_VERIFIED_AT,
      license: {
        name: isOpenOpus ? "Open Opus catalog metadata" : "IMSLP catalog metadata",
        url: isOpenOpus ? "https://github.com/openopus-org/openopus_api" : IMSLP_LICENSE_URL,
        attributionRequired: true,
        attributionText: `${title} by ${artist} — catalog metadata from ${isOpenOpus ? "Open Opus" : "IMSLP"}`,
        commercialUse: "unknown",
        derivatives: "unknown",
      },
    },
    processingEstimateSeconds: 90,
  };
}

function searchImslpSongs(query: string): Song[] {
  const normalized = query.trim().toLocaleLowerCase();
  const entries = catalogIndex as CatalogIndexEntry[];
  const matches = normalized
    ? entries.filter((entry) => `${entry.title} ${entry.artist}`.toLocaleLowerCase().includes(normalized))
    : entries;
  return matches.slice(0, 20).map(mapMetadataEntry);
}

export const catalogProviders = {
  jamendo: createJamendoProvider(),
  internetarchive: createInternetArchiveProvider(),
  imslp: { id: "imslp", search: async (query: string) => searchImslpSongs(query) },
} satisfies Partial<Record<CatalogProvider["id"], CatalogProvider | null>>;

export async function searchCatalogSongs(query: string) {
  const provider = catalogProviders.jamendo;
  if (provider) {
    try {
      const songs = await provider.search(query);
      if (songs.length > 0) return { provider: provider.id, songs };
    } catch {
      // The open metadata catalog remains available when a licensed provider is down.
    }
  }
  const archiveProvider = catalogProviders.internetarchive;
  if (archiveProvider) {
    try {
      const songs = await archiveProvider.search(query);
      if (songs.length > 0) return { provider: archiveProvider.id, songs };
    } catch {
      // Metadata search remains available when the public archive is unavailable.
    }
  }
  const demoMatches = searchDemoSongs(query);
  if (demoMatches.length > 0) return { provider: "demo" as const, songs: demoMatches };
  const metadataSongs = await catalogProviders.imslp?.search(query);
  if (metadataSongs && metadataSongs.length > 0) return { provider: "metadata" as const, songs: metadataSongs };
  return { provider: "demo" as const, songs: [] };
}

export const searchableCatalogSize = (catalogIndex as CatalogIndexEntry[]).length;
