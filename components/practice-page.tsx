"use client";

import Link from "next/link";
import { ChevronLeft, CircleHelp, Drum, Pause, Play, RotateCcw, SkipBack, Square, Timer, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { ScoreRenderer } from "@/components/score-renderer";
import { writeCache } from "@/lib/cache";
import type { Difficulty, NoteEvent, SheetPackage } from "@/lib/types";

const difficultyLabels: Record<Difficulty, string> = { beginner: "Beginner", medium: "Medium", hard: "Hard" };
const loopLength = 6;

export function PracticePage({ sheetId }: { sheetId: string }) {
  const [sheet, setSheet] = useState<SheetPackage | null>(null);
  const [error, setError] = useState("");
  const [tempo, setTempo] = useState(92);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(loopLength);
  const [countIn, setCountIn] = useState(false);
  const [metronome, setMetronome] = useState(false);
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
    const event = sheetRef.current?.noteEvents.findIndex((note) => note.start <= next && note.start + note.duration > next);
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

  const currentMeasure = sheet.noteEvents.find((note) => note.start <= elapsed && note.start + note.duration > elapsed)?.measure ?? 1;
  const currentNoteIndex = Math.max(0, sheet.noteEvents.findIndex((note) => note.start <= elapsed && note.start + note.duration > elapsed));
  const measureCount = Math.max(...sheet.noteEvents.map((note) => note.measure), 1);

  function jumpToMeasure(measure: number) {
    setPlaying(false);
    const nextElapsed = Math.max(0, Math.min(duration, (measure - 1) * 4));
    setElapsed(nextElapsed);
    elapsedRef.current = nextElapsed;
    lastNote.current = -1;
  }

  return <main className="min-h-screen bg-background text-foreground"><header className="border-b border-border bg-background"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 sm:px-6"><Link href="/" className="flex items-center gap-2 text-sm font-semibold text-foreground/80 hover:text-foreground"><ChevronLeft className="size-4" />Sheetify <span className="hidden text-xs font-normal text-muted-foreground sm:inline">/ Practice workspace</span></Link><div className="flex items-center gap-3"><Badge variant="outline" className="border-border text-muted-foreground">{difficultyLabels[sheet.difficulty]}</Badge><Button variant="ghost" size="icon" aria-label="Practice help" className="text-muted-foreground hover:bg-muted hover:text-foreground"><CircleHelp className="size-4" /></Button></div></div></header><section className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-card px-4 py-3"><div><p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">SCORE VIEW</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{sheet.song.title}</h1><p className="text-xs text-muted-foreground">{sheet.song.artist} · {sheet.key} · {sheet.timeSignature}</p></div><div className="flex items-center gap-5 text-xs text-muted-foreground"><span>{tempo} BPM</span><span>Measure {currentMeasure}</span><span className="hidden sm:inline">Note {currentNoteIndex + 1}/{sheet.noteEvents.length}</span><Volume2 className="size-4" /></div></div><div className="overflow-hidden rounded-md border border-black/30 bg-white text-slate-950 shadow-[0_24px_70px_rgba(0,0,0,0.28)]"><ScoreRenderer musicXml={sheet.musicXml} currentMeasure={currentMeasure} currentNoteIndex={currentNoteIndex} totalNotes={sheet.noteEvents.length} /></div><div className="mt-4 rounded-md border border-border bg-card p-4"><div className="flex flex-wrap items-center gap-3"><Button variant="secondary" size="icon" aria-label="Restart" onClick={() => { setElapsed(0); lastNote.current = -1; }}><RotateCcw className="size-4" /></Button><Button size="icon-lg" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((current) => !current)}>{playing ? <Pause className="size-5" /> : <Play className="size-5" />}</Button><Button variant="outline" size="icon" aria-label="Stop" onClick={() => { setPlaying(false); setElapsed(0); lastNote.current = -1; }}><Square className="size-4" /></Button><div className="min-w-44 flex-1"><Progress value={(elapsed / duration) * 100} aria-label="Playback progress" className="h-2 bg-muted" /><input aria-label="Playback position" type="range" min="0" max={duration} step="0.1" value={elapsed} onChange={(event) => { setElapsed(Number(event.target.value)); lastNote.current = -1; }} className="mt-3 w-full accent-[var(--primary)]" /></div><span className="tabular-nums text-xs text-muted-foreground">{elapsed.toFixed(1)} / {duration.toFixed(1)}</span></div><div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-[1fr_auto] sm:items-end"><label className="text-xs font-medium text-muted-foreground">Tempo <span className="ml-2 text-foreground">{tempo} BPM</span><Slider aria-label="Tempo" min={50} max={150} value={[tempo]} onValueChange={(value) => setTempo(Array.isArray(value) ? value[0] : tempo)} className="mt-3" /></label><div className="flex flex-wrap gap-2"><Button variant={countIn ? "default" : "outline"} aria-pressed={countIn} onClick={() => setCountIn((current) => !current)}><Timer className="size-4" />Count-in</Button><Button variant={metronome ? "default" : "outline"} aria-pressed={metronome} onClick={() => setMetronome((current) => !current)}><Drum className="size-4" />Metronome</Button><Button variant={looping ? "default" : "outline"} onClick={() => setLooping((current) => !current)}><SkipBack className="size-4" />Loop {looping ? "on" : "off"}</Button><Button variant="ghost" onClick={() => { setLoopStart(0); setLoopEnd(loopLength); }}>Reset loop</Button></div></div><div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4"><span className="mr-1 text-xs font-medium text-muted-foreground">Jump to measure</span>{Array.from({ length: measureCount }, (_, index) => index + 1).map((measure) => <Button key={measure} variant={measure === currentMeasure ? "secondary" : "ghost"} size="sm" aria-label={`Jump to measure ${measure}`} onClick={() => jumpToMeasure(measure)}>{measure}</Button>)}</div><p className="mt-3 text-xs text-muted-foreground" aria-live="polite">{countIn ? "Count-in on" : "Count-in off"} · {metronome ? "Metronome on" : "Metronome off"} · Space play/pause · R restart · Loop repeats {loopStart.toFixed(0)}–{loopEnd.toFixed(0)} seconds</p></div></section></main>;
}
