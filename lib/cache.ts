import type { CacheEntry, Difficulty, SheetPackage } from "@/lib/types";

const CACHE_PREFIX = "sheetify:";
const SCHEMA_VERSION = 1 as const;
const DATABASE_NAME = "sheetify-sheets";
const DATABASE_VERSION = 1;
const SHEET_STORE = "sheets";
const MIGRATION_MARKER = "sheetify:indexeddb-migration-v1";
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class SheetStoreError extends Error {
  constructor(message: string, public readonly code: "unavailable" | "corrupt" | "migration" | "write" | "verify") {
    super(message);
    this.name = "SheetStoreError";
  }
}

function dispatchChange() {
  window.dispatchEvent(new Event("sheetify-cache-change"));
}

function cacheEntryFor(sheet: SheetPackage): CacheEntry {
  return { ...sheet, schemaVersion: SCHEMA_VERSION, expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString() };
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CacheEntry>;
  return entry.schemaVersion === SCHEMA_VERSION && typeof entry.sheetId === "string" && typeof entry.difficulty === "string" && typeof entry.generatedAt === "string" && typeof entry.song?.id === "string" && Array.isArray(entry.noteEvents) && typeof entry.musicXml === "string" && typeof entry.expiresAt === "string" && Number.isFinite(Date.parse(entry.expiresAt)) && Date.parse(entry.expiresAt) > Date.now();
}

function assertBrowser() {
  if (typeof window === "undefined" || !window.indexedDB) throw new SheetStoreError("Browser storage is unavailable. Enable site storage and try again.", "unavailable");
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

async function openDatabase() {
  assertBrowser();
  const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(SHEET_STORE)) {
      const store = request.result.createObjectStore(SHEET_STORE, { keyPath: "sheetId" });
      store.createIndex("expiresAt", "expiresAt");
      store.createIndex("generatedAt", "generatedAt");
    }
  };
  const database = await requestResult(request);
  await migrateLegacyEntries(database);
  return database;
}

async function migrateLegacyEntries(database: IDBDatabase) {
  let done = false;
  try { done = window.localStorage.getItem(MIGRATION_MARKER) === "done"; } catch { return; }
  if (done) return;
  const legacy: CacheEntry[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(CACHE_PREFIX)) continue;
      const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "");
      if (isCacheEntry(parsed)) legacy.push(parsed);
    }
  } catch { throw new SheetStoreError("Existing local sheets could not be migrated safely.", "migration"); }
  try {
    const transaction = database.transaction(SHEET_STORE, "readwrite");
    const store = transaction.objectStore(SHEET_STORE);
    for (const entry of legacy) store.put(entry);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Migration failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Migration aborted."));
    });
    window.localStorage.setItem(MIGRATION_MARKER, "done");
  } catch (error) { throw new SheetStoreError(error instanceof Error ? error.message : "Existing local sheets could not be migrated.", "migration"); }
}

function close(database: IDBDatabase) { database.close(); }

export function cacheKey(songId: string, difficulty: Difficulty) { return `${CACHE_PREFIX}${encodeURIComponent(songId)}:${difficulty}`; }

export async function saveSheet(sheet: SheetPackage) {
  const entry = cacheEntryFor(sheet);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SHEET_STORE, "readwrite");
    transaction.objectStore(SHEET_STORE).put(entry);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Sheet could not be saved."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Sheet save was aborted."));
    });
    return entry;
  } catch (error) { throw new SheetStoreError(error instanceof Error ? error.message : "Sheet could not be saved.", "write"); }
  finally { close(database); }
}

export async function getSheet(sheetId: string) {
  const database = await openDatabase();
  try {
    const value = await requestResult(database.transaction(SHEET_STORE, "readonly").objectStore(SHEET_STORE).get(sheetId));
    if (!value) return null;
    if (!isCacheEntry(value)) { await deleteSheet(sheetId); return null; }
    return value;
  } catch (error) {
    if (error instanceof SheetStoreError) throw error;
    throw new SheetStoreError("The saved practice sheet could not be read.", "corrupt");
  } finally { close(database); }
}

export async function listSheets() {
  const database = await openDatabase();
  try {
    const values = await requestResult(database.transaction(SHEET_STORE, "readonly").objectStore(SHEET_STORE).getAll());
    const valid = values.filter(isCacheEntry);
    const invalid = values.filter((value) => !isCacheEntry(value));
    if (invalid.length > 0) {
      const cleanup = database.transaction(SHEET_STORE, "readwrite");
      for (const value of invalid) if (value && typeof value === "object" && typeof (value as { sheetId?: unknown }).sheetId === "string") cleanup.objectStore(SHEET_STORE).delete((value as { sheetId: string }).sheetId);
      await new Promise<void>((resolve, reject) => { cleanup.oncomplete = () => resolve(); cleanup.onerror = () => reject(cleanup.error ?? new Error("Sheet cleanup failed.")); });
    }
    return valid.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  } finally { close(database); }
}

export async function deleteSheet(sheetId: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SHEET_STORE, "readwrite");
    transaction.objectStore(SHEET_STORE).delete(sheetId);
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error("Sheet could not be deleted.")); });
    dispatchChange();
  } finally { close(database); }
}

export async function clearExpiredSheets() { await listSheets(); }

export async function readCache(songId: string, difficulty: Difficulty) {
  const entries = await listSheets();
  return entries.find((entry) => entry.song.id === songId && entry.difficulty === difficulty) ?? null;
}

export async function writeCache(sheet: SheetPackage) {
  const saved = await saveSheet(sheet);
  const verified = await getSheet(saved.sheetId);
  if (!verified) throw new SheetStoreError("The practice sheet could not be verified after saving.", "verify");
  dispatchChange();
  return verified;
}

export async function readAllCachedSheets() { return listSheets(); }

export async function removeCache(songId: string, difficulty: Difficulty) {
  const entry = await readCache(songId, difficulty);
  if (entry) await deleteSheet(entry.sheetId);
}
