"use client";

import Link from "next/link";
import { ChevronLeft, CircleHelp, Pause, Play, RotateCcw, SkipBack, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { writeCache } from "@/lib/cache";
import type { Difficulty, NoteEvent, SheetPackage } from "@/lib/types";

const difficultyLabels: Record<Difficulty, string> = { beginner: "Beginner", medium: "Medium", hard: "Hard" };
const loopLength = 6;

function notePosition(midi: number) {
  return `${Math.max(8, Math.min(88, 78 - (midi - 60) * 4.8))}%`;
}

export function PracticePage({ sheetId }: { sheetId: string }) {
  const [sheet, setSheet] = useState<SheetPackage | null>(null);
  const [error, setError] = useState("");
  const [tempo, setTempo] = useState(92);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(loopLength);
  const animation = useRef<number | undefined>(undefined);
  const lastNote = useRef(-1);
  const lastFrame = useRef<number | undefined>(undefined);
  const elapsedRef = useRef(0);
  const tempoRef = useRef(tempo);
  const playingRef = useRef(playing);
  const sheetRef = useRef<SheetPackage | null>(null);
  const audioContext = useRef<AudioContext | null>(null);

  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);
  useEffect(() => { tempoRef.current = tempo; }, [tempo]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { sheetRef.current = sheet; }, [sheet]);

  useEffect(() => {
    let active = true;
    fetch(`/api/sheets/${sheetId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Practice sheet not found.");
        return await response.json() as SheetPackage;
      })
      .then((nextSheet) => {
        if (!active) return;
        setSheet(nextSheet);
        setTempo(nextSheet.tempo);
        writeCache(nextSheet);
      })
      .catch((nextError: Error) => { if (active) setError(nextError.message); });
    return () => { active = false; };
  }, [sheetId]);

  const duration = useMemo(() => Math.max(loopLength, (sheet?.noteEvents.at(-1)?.start ?? 0) + 1.2), [sheet]);

  function playNote(note: NoteEvent) {
    if (typeof window === "undefined") return;
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = audioContext.current ?? new Context();
    audioContext.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 440 * 2 ** ((note.midi - 69) / 12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + Math.min(0.45, note.duration));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + Math.min(0.5, note.duration + 0.05));
  }

  function tick(timestamp: number) {
    if (!playingRef.current) return;
    const speed = tempoRef.current / 92;
    const nextElapsed = elapsedRef.current + (timestamp - (lastFrame.current ?? timestamp)) / 1000 * speed;
    lastFrame.current = timestamp;
    const next = looping && nextElapsed >= loopEnd ? loopStart : nextElapsed;
    elapsedRef.current = next >= duration ? 0 : next;
    setElapsed(next >= duration ? 0 : next);
    const event = sheetRef.current?.noteEvents.findIndex((note) => note.start <= next && note.start + note.duration >= next);
    if (event !== undefined && event >= 0 && event !== lastNote.current) {
      lastNote.current = event;
      if (sheetRef.current) playNote(sheetRef.current.noteEvents[event]);
    }
    animation.current = window.requestAnimationFrame(tick);
  }

  useEffect(() => {
    playingRef.current = playing;
    if (playing) {
      lastFrame.current = undefined;
      animation.current = window.requestAnimationFrame(tick);
    } else if (animation.current) {
      window.cancelAnimationFrame(animation.current);
    }
    return () => { if (animation.current) window.cancelAnimationFrame(animation.current); };
    // The playback loop intentionally reads the latest values through this component render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration, loopEnd, loopStart, looping]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      if (event.code === "Space") { event.preventDefault(); setPlaying((current) => !current); }
      if (event.key.toLowerCase() === "r") { setElapsed(0); lastNote.current = -1; }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (error) return <main className="flex min-h-screen items-center justify-center p-6"><div className="max-w-md text-center"><h1 className="font-heading text-4xl">Sheet unavailable</h1><p className="mt-3 text-muted-foreground">{error} This demo session may have expired.</p><Link className={`${buttonVariants()} mt-7`} href="/">Return home</Link></div></main>;
  if (!sheet) return <main className="flex min-h-screen items-center justify-center p-6 text-muted-foreground">Loading your practice sheet…</main>;

  const currentMeasure = sheet.noteEvents.find((note) => note.start <= elapsed && note.start + note.duration >= elapsed)?.measure ?? 1;

  return <main className="min-h-screen bg-background"><header className="border-b border-border/80 bg-card/50"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8"><Link href="/" className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Sheetify</Link><div className="flex items-center gap-3"><Badge variant="outline">{difficultyLabels[sheet.difficulty]}</Badge><Button variant="ghost" size="icon" aria-label="Practice help"><CircleHelp className="size-4" /></Button></div></div></header><section className="mx-auto max-w-7xl px-5 py-8 sm:px-8"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Practice sheet</p><h1 className="mt-2 font-heading text-4xl tracking-[-0.03em] sm:text-5xl">{sheet.song.title}</h1><p className="mt-2 text-sm text-muted-foreground">{sheet.song.artist} · {sheet.key} · {sheet.timeSignature}</p></div><div className="flex items-center gap-4 text-sm text-muted-foreground"><span>{tempo} BPM</span><span>Measure {currentMeasure}</span><Volume2 className="size-4" /></div></div><div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_70px_oklch(0.3_0.04_265/0.08)]"><div className="flex items-center justify-between border-b border-border/70 px-5 py-3 text-xs text-muted-foreground"><span>Treble clef · {sheet.key}</span><span>Generated from {sheet.noteEvents.length} notes</span></div><div className="space-y-10 px-5 py-12 sm:px-12"><div className="relative h-32">{[0, 1, 2, 3, 4].map((line) => <div key={line} className="absolute left-0 right-0 border-t border-foreground/30" style={{ top: `${line * 25}%` }} />)}{sheet.noteEvents.map((note) => <span key={note.id} className={`absolute z-10 block size-5 -translate-x-1/2 rounded-full border-2 border-card bg-foreground after:absolute after:-top-4 after:left-1/2 after:h-4 after:w-px after:bg-current transition-colors ${Math.abs(note.start - elapsed) < 0.4 ? "bg-primary ring-4 ring-primary/20" : ""}`} style={{ left: `${15 + note.start / duration * 70}%`, top: notePosition(note.midi) }} title={`${note.pitch}, measure ${note.measure}`} aria-label={`${note.pitch}, measure ${note.measure}`} />)}</div><div className="relative h-20 border-t-2 border-foreground/40 pt-8"><div className="flex justify-between text-xs text-muted-foreground"><span>LH</span><span>Melody notes · {sheet.noteEvents.map((note) => note.pitch).join(" · ")}</span><span>RH</span></div></div></div></div><div className="mt-6 rounded-2xl border border-border bg-card p-5"><div className="flex flex-wrap items-center gap-3"><Button variant="secondary" size="icon" aria-label="Restart" onClick={() => { setElapsed(0); lastNote.current = -1; }}><RotateCcw className="size-4" /></Button><Button size="icon-lg" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((current) => !current)}>{playing ? <Pause className="size-5" /> : <Play className="size-5" />}</Button><div className="min-w-44 flex-1"><Progress value={(elapsed / duration) * 100} aria-label="Playback progress" className="h-2" /><input aria-label="Playback position" type="range" min="0" max={duration} step="0.1" value={elapsed} onChange={(event) => { setElapsed(Number(event.target.value)); lastNote.current = -1; }} className="mt-3 w-full accent-[var(--primary)]" /></div><span className="tabular-nums text-xs text-muted-foreground">{elapsed.toFixed(1)} / {duration.toFixed(1)}</span></div><div className="mt-5 grid gap-5 border-t border-border/70 pt-5 sm:grid-cols-[1fr_auto] sm:items-end"><label className="text-xs font-medium text-muted-foreground">Tempo <span className="ml-2 text-foreground">{tempo} BPM</span><Slider aria-label="Tempo" min={50} max={150} value={[tempo]} onValueChange={(value) => setTempo(Array.isArray(value) ? value[0] : tempo)} className="mt-3" /></label><div className="flex flex-wrap gap-2"><Button variant={looping ? "default" : "outline"} onClick={() => setLooping((current) => !current)}><SkipBack className="size-4" />Loop {looping ? "on" : "off"}</Button><Button variant="ghost" onClick={() => { setLoopStart(0); setLoopEnd(loopLength); }}>Reset loop</Button></div></div></div><p className="mt-4 text-center text-xs text-muted-foreground">Space play/pause · R restart · Loop repeats {loopStart.toFixed(0)}–{loopEnd.toFixed(0)} seconds</p></section></main>;
}
