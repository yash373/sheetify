"use client";

import Link from "next/link";
import { Clock3, Music2, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { readAllCachedSheets, removeCache } from "@/lib/cache";
import { difficulties } from "@/lib/types";
import type { CacheEntry, Difficulty, Song } from "@/lib/types";

const difficultyLabels: Record<Difficulty, string> = { beginner: "Beginner", medium: "Medium", hard: "Hard" };

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function songHref(song: Song, difficulty: Difficulty) {
  const params = new URLSearchParams({ songId: song.id, difficulty });
  return `/processing/new?${params.toString()}`;
}

export function HomePage() {
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("medium");
  const [cachedSheets, setCachedSheets] = useState<CacheEntry[]>(() => readAllCachedSheets());
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/songs/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (response.ok) setSongs((await response.json() as { songs: Song[] }).songs);
      } catch {
        if (!controller.signal.aborted) setSongs([]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  function deleteCachedSheet(sheet: CacheEntry) {
    removeCache(sheet.song.id, sheet.difficulty);
    setCachedSheets((current) => current.filter((entry) => entry.sheetId !== sheet.sheetId));
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-7 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between border-b border-border/80 pb-5">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight"><span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Music2 className="size-4" aria-hidden="true" /></span>Sheetify</Link>
        <span className="text-xs text-muted-foreground">A quieter way to practice</span>
      </header>

      <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div className="max-w-xl">
          <Badge variant="outline" className="mb-5 border-primary/25 bg-primary/5 text-primary">Piano practice studio</Badge>
          <h1 className="font-heading text-5xl leading-[0.98] tracking-[-0.045em] text-balance sm:text-7xl">Find the song.<br /><span className="text-primary">Stay with the music.</span></h1>
          <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">Turn a song into a readable piano arrangement built for the way you actually practice.</p>

          <div className="mt-10 rounded-2xl border border-border/80 bg-card/80 p-3 shadow-[0_18px_60px_oklch(0.3_0.04_265/0.08)]">
            <label htmlFor="song-search" className="sr-only">Search songs</label>
            <div className="flex items-center gap-3 px-2"><Search className="size-5 text-muted-foreground" aria-hidden="true" /><Input id="song-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by song or artist" className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" />{isSearching && <span className="text-xs text-muted-foreground">Searching…</span>}</div>
            <Separator className="my-3" />
            <div className="flex flex-wrap items-center gap-2 px-2 pb-1"><span className="mr-1 text-xs font-medium text-muted-foreground">Arrangement</span>{difficulties.map((difficulty) => <button type="button" key={difficulty} onClick={() => setSelectedDifficulty(difficulty)} aria-pressed={selectedDifficulty === difficulty} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedDifficulty === difficulty ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}>{difficultyLabels[difficulty]}</button>)}</div>
          </div>

          <div className="mt-8 space-y-2">
            {songs.map((song) => <Link href={songHref(song, selectedDifficulty)} key={song.id} className="group flex items-center justify-between rounded-xl border border-transparent px-4 py-3 transition-colors hover:border-border hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span><span className="block text-sm font-medium">{song.title}</span><span className="block text-xs text-muted-foreground">{song.artist} · {song.genre}</span></span><span className="text-xs text-muted-foreground transition-transform group-hover:translate-x-1">Open →</span></Link>)}
            {!isSearching && query && songs.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No songs found. Try another title or artist.</p>}
          </div>
        </div>

        <div className="relative hidden min-h-[430px] items-center justify-center lg:flex"><div className="absolute inset-10 rounded-[3rem] bg-accent/30 blur-3xl" /><div className="relative w-full max-w-md rotate-[-3deg] rounded-2xl border border-border bg-card p-7 shadow-[0_30px_80px_oklch(0.3_0.04_265/0.16)]"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Practice sheet</span><span>01 / 04</span></div><h2 className="mt-12 font-heading text-3xl">Moonlit Keys</h2><p className="mt-1 text-sm text-muted-foreground">The Quiet Room · C major</p><div className="my-10 space-y-4 opacity-75" aria-hidden="true">{[0, 1, 2, 3, 4].map((line) => <div key={line} className="border-t border-foreground/35" />)}<div className="flex justify-around text-4xl leading-none"><span>𝅘𝅥𝅮</span><span>♩</span><span>♪</span><span>𝅘𝅥𝅮</span></div>{[0, 1, 2, 3, 4].map((line) => <div key={line} className="border-t border-foreground/35" />)}</div><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Moderato</span><span>92 BPM</span></div></div></div>
      </section>

      <section className="border-t border-border/80 py-8"><div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Your desk</p><h2 className="mt-1 font-heading text-2xl">Recently practiced</h2></div><span className="text-xs text-muted-foreground">Saved on this device</span></div>{cachedSheets.length === 0 ? <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Your finished sheets will appear here after the first practice session.</div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cachedSheets.map((sheet) => <Card key={sheet.sheetId} className="bg-card/70"><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle>{sheet.song.title}</CardTitle><Badge variant="secondary">{difficultyLabels[sheet.difficulty]}</Badge></div><p className="text-sm text-muted-foreground">{sheet.song.artist}</p></CardHeader><CardContent className="flex items-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock3 className="size-3.5" />{formatDuration(sheet.song.durationSeconds)}</span><span>{sheet.tempo} BPM</span></CardContent><CardFooter className="justify-between gap-2"><Button nativeButton={false} render={<Link href={`/practice/${sheet.sheetId}`} />}>Open practice</Button><Button variant="ghost" size="icon" aria-label={`Remove ${sheet.song.title}`} onClick={() => deleteCachedSheet(sheet)}><Trash2 className="size-4" /></Button></CardFooter></Card>)}</div>}</section>
    </main>
  );
}
