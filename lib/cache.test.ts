import { afterEach, describe, expect, it, vi } from "vitest";

import { cacheKey, readAllCachedSheets, readCache, writeCache } from "@/lib/cache";
import type { SheetPackage } from "@/lib/types";

function createStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("sheet cache retention", () => {
  it("adds a finite expiry to completed sheets", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage, dispatchEvent: vi.fn() });
    const sheet = { sheetId: "sheet-1", song: { id: "song-1" }, difficulty: "medium", noteEvents: [], musicXml: "<score />" } as unknown as SheetPackage;

    expect(writeCache(sheet)).toBe(true);
    const stored = JSON.parse(localStorage.getItem(cacheKey("song-1", "medium")) ?? "{}");
    expect(Date.parse(stored.expiresAt)).toBeGreaterThan(Date.now());
    expect(readCache("song-1", "medium")).toMatchObject({ sheetId: "sheet-1" });
  });

  it("removes expired and malformed entries during reads", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage, dispatchEvent: vi.fn() });
    const key = cacheKey("old-song", "beginner");
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, sheetId: "old", song: { id: "old-song" }, difficulty: "beginner", noteEvents: [], musicXml: "<score />", expiresAt: new Date(Date.now() - 1).toISOString() }));
    localStorage.setItem("sheetify:broken:medium", "not-json");

    expect(readCache("old-song", "beginner")).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
    expect(readAllCachedSheets()).toEqual([]);
    expect(localStorage.getItem("sheetify:broken:medium")).toBeNull();
  });
});
