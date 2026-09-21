import { afterEach, describe, expect, it, vi } from "vitest";

import { getSheet, listSheets, readCache, removeCache, writeCache } from "@/lib/cache";
import type { SheetPackage } from "@/lib/types";

type RecordValue = Record<string, unknown>;

class FakeRequest<T = unknown> {
  result!: T;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class FakeStore {
  constructor(private readonly values: Map<string, RecordValue>) {}
  put(value: RecordValue) { this.values.set(String(value.sheetId), structuredClone(value)); }
  get(key: string) { const request = new FakeRequest<RecordValue | undefined>(); queueMicrotask(() => { request.result = this.values.get(key); request.onsuccess?.(); }); return request; }
  getAll() { const request = new FakeRequest<RecordValue[]>(); queueMicrotask(() => { request.result = [...this.values.values()].map((value) => structuredClone(value)); request.onsuccess?.(); }); return request; }
  delete(key: string) { this.values.delete(key); }
  createIndex() { return undefined; }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor(private readonly store: FakeStore) { queueMicrotask(() => this.oncomplete?.()); }
  objectStore() { return this.store; }
}

class FakeDatabase {
  objectStoreNames = { contains: () => true };
  constructor(private readonly store: FakeStore) {}
  transaction() { return new FakeTransaction(this.store); }
  close() {}
}

class FakeIndexedDb {
  private readonly values = new Map<string, RecordValue>();
  open() {
    const request = new FakeRequest<FakeDatabase>();
    const database = new FakeDatabase(new FakeStore(this.values));
    queueMicrotask(() => { request.result = database; (request as FakeRequest<FakeDatabase> & { onupgradeneeded?: () => void }).onupgradeneeded?.(); request.onsuccess?.(); });
    return request as FakeRequest<FakeDatabase> & { onupgradeneeded?: () => void };
  }
}

function sheet(sheetId = "sheet-1", musicXml = "<score />") {
  return { sheetId, song: { id: "song-1", title: "Song", artist: "Artist" }, difficulty: "medium", tempo: 92, key: "C major", timeSignature: "4/4", musicXml, noteEvents: [], notation: {}, generatedAt: new Date().toISOString() } as unknown as SheetPackage;
}

function setup() {
  const values = new Map<string, string>();
  vi.stubGlobal("window", { indexedDB: new FakeIndexedDb(), localStorage: { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }, dispatchEvent: vi.fn() });
}

afterEach(() => vi.unstubAllGlobals());

describe("IndexedDB sheet storage", () => {
  it("persists and reads a sheet larger than the old localStorage limit", async () => {
    setup();
    const saved = await writeCache(sheet("large", "x".repeat(500_000)));
    expect(saved.musicXml).toHaveLength(500_000);
    await expect(getSheet("large")).resolves.toMatchObject({ sheetId: "large" });
  });

  it("overwrites duplicate IDs, lists entries, and deletes by cache identity", async () => {
    setup();
    await writeCache(sheet());
    await writeCache(sheet("sheet-1", "updated"));
    expect((await listSheets()).filter((entry) => entry.sheetId === "sheet-1")).toHaveLength(1);
    await removeCache("song-1", "medium");
    await expect(readCache("song-1", "medium")).resolves.toBeNull();
  });

  it("reports unavailable browser storage instead of silently losing a sheet", async () => {
    vi.stubGlobal("window", { localStorage: { length: 0 }, dispatchEvent: vi.fn() });
    await expect(writeCache(sheet())).rejects.toMatchObject({ code: "unavailable" });
  });
});
