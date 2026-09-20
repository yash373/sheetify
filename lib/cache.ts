import type { CacheEntry, Difficulty } from "@/lib/types";

const CACHE_PREFIX = "sheetify:";
const SCHEMA_VERSION = 1 as const;
const MAX_ENTRY_BYTES = 450_000;

export function cacheKey(songId: string, difficulty: Difficulty) {
  return `${CACHE_PREFIX}${encodeURIComponent(songId)}:${difficulty}`;
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CacheEntry>;
  return (
    entry.schemaVersion === SCHEMA_VERSION &&
    typeof entry.sheetId === "string" &&
    typeof entry.difficulty === "string" &&
    typeof entry.song?.id === "string" &&
    Array.isArray(entry.noteEvents) &&
    typeof entry.musicXml === "string"
  );
}

export function readCache(songId: string, difficulty: Difficulty): CacheEntry | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(cacheKey(songId, difficulty));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isCacheEntry(parsed)) {
      window.localStorage.removeItem(cacheKey(songId, difficulty));
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(cacheKey(songId, difficulty));
    return null;
  }
}

export function writeCache(entry: Omit<CacheEntry, "schemaVersion">) {
  if (typeof window === "undefined") return false;

  const value: CacheEntry = { ...entry, schemaVersion: SCHEMA_VERSION };
  const serialized = JSON.stringify(value);
  if (new Blob([serialized]).size > MAX_ENTRY_BYTES) return false;

  try {
    window.localStorage.setItem(cacheKey(entry.song.id, entry.difficulty), serialized);
    window.dispatchEvent(new Event("sheetify-cache-change"));
    return true;
  } catch {
    return false;
  }
}

export function readAllCachedSheets() {
  if (typeof window === "undefined") return [] as CacheEntry[];
  const entries: CacheEntry[] = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(CACHE_PREFIX)) continue;
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "");
      if (isCacheEntry(parsed)) entries.push(parsed);
    } catch {
      window.localStorage.removeItem(key);
    }
  }

  return entries.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export function removeCache(songId: string, difficulty: Difficulty) {
  window.localStorage.removeItem(cacheKey(songId, difficulty));
  window.dispatchEvent(new Event("sheetify-cache-change"));
}
