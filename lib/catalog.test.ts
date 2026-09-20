import { afterEach, describe, expect, it, vi } from "vitest";

import { mapJamendoTrack, searchCatalogSongs } from "@/lib/catalog";

afterEach(() => vi.unstubAllEnvs());

describe("catalog licensing boundary", () => {
  it("only exposes a download URL when Jamendo explicitly allows downloading", () => {
    const song = mapJamendoTrack({
      id: "101",
      name: "  Licensed Theme  ",
      artist_name: "Composer",
      duration: 120,
      license_ccurl: "https://creativecommons.org/licenses/by/4.0/",
      audiodownload_allowed: true,
      audiodownload: "https://audio.example/101.mp3",
      tags: ["piano"],
    });
    expect(song.source.downloadAllowed).toBe(true);
    expect(song.source.downloadUrl).toBe("https://audio.example/101.mp3");
    expect(song.source.catalogUrl).toBe("https://www.jamendo.com/track/101");
    expect(song.source.metadataVerifiedAt).toMatch(/^20/);
    expect(song.source.license.attributionRequired).toBe(true);
    expect(song.source.license.attributionText).toContain("Licensed Theme by Composer");
    expect(song.source.license.commercialUse).toBe("allowed");
    expect(song.source.license.derivatives).toBe("allowed");
    expect(song.title).toBe("Licensed Theme");
  });

  it("rejects a URL when the provider says downloading is not allowed", () => {
    const song = mapJamendoTrack({
      id: "102",
      name: "Restricted Theme",
      artist_name: "Composer",
      duration: 90,
      audiodownload_allowed: false,
      audiodownload: "https://audio.example/should-not-be-used.mp3",
    });
    expect(song.source.downloadAllowed).toBe(false);
    expect(song.source.downloadUrl).toBeUndefined();
  });

  it("fails closed for missing permission and ambiguous direct URLs", () => {
    expect(mapJamendoTrack({ id: "103", name: "Missing", artist_name: "Composer", duration: 90 }).source.downloadAllowed).toBe(false);
    expect(mapJamendoTrack({ id: "104", name: "Ambiguous", artist_name: "Composer", duration: 90, audiodownload_allowed: true }).source.downloadAllowed).toBe(false);
  });

  it("excludes non-commercial and no-derivatives licenses from processing", () => {
    expect(mapJamendoTrack({ id: "105", name: "Non-commercial", artist_name: "Composer", duration: 90, license_ccurl: "https://creativecommons.org/licenses/by-nc/4.0/", audiodownload_allowed: true, audiodownload: "https://audio.example/105.mp3" }).source.downloadAllowed).toBe(false);
    expect(mapJamendoTrack({ id: "106", name: "No derivatives", artist_name: "Composer", duration: 90, license_ccurl: "https://creativecommons.org/licenses/by-nd/4.0/", audiodownload_allowed: true, audiodownload: "https://audio.example/106.mp3" }).source.downloadAllowed).toBe(false);
  });

  it("keeps deterministic demo search filtering when no catalog credential is configured", async () => {
    vi.stubEnv("JAMENDO_CLIENT_ID", "");
    const result = await searchCatalogSongs("Moonlit");
    expect(result.provider).toBe("demo");
    expect(result.songs.map((song) => song.id)).toEqual(["moonlit-keys"]);
  });
});
