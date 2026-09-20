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

export function mapJamendoTrack(track: JamendoTrack): Song {
  const downloadAllowed = track.audiodownload_allowed === true && Boolean(track.audiodownload);
  const license: TrackLicense = {
    name: track.license_ccurl ? "Creative Commons" : "Jamendo license",
    ...(track.license_ccurl ? { url: track.license_ccurl } : {}),
    attributionRequired: true,
  };
  return {
    id: `jamendo-${track.id}`,
    title: track.name.trim(),
    artist: track.artist_name.trim(),
    durationSeconds: track.duration,
    genre: track.tags?.[0] ?? "Licensed audio",
    source: {
      provider: "jamendo",
      trackId: track.id,
      sourceUrl: `https://www.jamendo.com/track/${track.id}`,
      ...(downloadAllowed ? { downloadUrl: track.audiodownload } : {}),
      downloadAllowed,
      license,
    },
    processingEstimateSeconds: 90,
  };
}

async function searchJamendoSongs(query: string, clientId: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    format: "json",
    limit: "20",
    search: query,
    audioformat: "mp32",
    audiodlformat: "mp32",
    include: "licenses",
  });
  const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params.toString()}`, { next: { revalidate: 300 } });
  if (!response.ok) throw new Error(`Jamendo search failed with ${response.status}.`);
  const body = await response.json() as JamendoResponse;
  return (body.results ?? []).map(mapJamendoTrack).filter((song) => song.source.downloadAllowed);
}

export async function searchCatalogSongs(query: string) {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) return { provider: "demo" as const, songs: searchDemoSongs(query) };
  try {
    return { provider: "jamendo" as const, songs: await searchJamendoSongs(query, clientId) };
  } catch {
    return { provider: "demo" as const, songs: query.trim() ? [] : demoSongs };
  }
}
