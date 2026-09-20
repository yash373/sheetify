import { demoSongs, searchDemoSongs } from "@/lib/demo-data";
import type { Song, TrackLicense } from "@/lib/types";

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
  readonly id: "jamendo";
  search(query: string): Promise<Song[]>;
};

const JAMENDO_API = "https://api.jamendo.com/v3.0/tracks/";
const JAMENDO_CATALOG = "https://www.jamendo.com/track";

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

export function createJamendoProvider(clientId = process.env.JAMENDO_CLIENT_ID): CatalogProvider | null {
  if (!clientId) return null;
  return { id: "jamendo", search: (query) => searchJamendoSongs(query, clientId) };
}

export const catalogProviders = { jamendo: createJamendoProvider() } satisfies Partial<Record<CatalogProvider["id"], CatalogProvider | null>>;

export async function searchCatalogSongs(query: string) {
  const provider = catalogProviders.jamendo;
  if (!provider) return { provider: "demo" as const, songs: searchDemoSongs(query) };
  try { return { provider: provider.id, songs: await provider.search(query) }; }
  catch { return { provider: "demo" as const, songs: query.trim() ? [] : demoSongs }; }
}
