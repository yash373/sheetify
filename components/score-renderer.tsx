"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { fallbackPointerPercent } from "@/lib/practice-playback";

type ScoreRendererProps = { musicXml: string; currentMeasure: number; currentNoteIndex: number; totalNotes: number };

export function ScoreRenderer({ musicXml, currentMeasure, currentNoteIndex, totalNotes }: ScoreRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<import("opensheetmusicdisplay").OpenSheetMusicDisplay | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [noteheadPositions, setNoteheadPositions] = useState<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    let active = true;
    async function renderScore() {
      if (!containerRef.current) return;
      const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
      if (!active || !containerRef.current) return;
      containerRef.current.replaceChildren();
      const display = new OpenSheetMusicDisplay(containerRef.current, {
        backend: "svg",
        autoResize: true,
        drawTitle: true,
        drawComposer: true,
        drawPartNames: false,
        pageFormat: "Endless",
      });
      display.zoom = zoom;
      try {
        await display.load(musicXml);
        if (!active) return;
        setError("");
        display.render();
        displayRef.current = display;
        window.requestAnimationFrame(measureNoteheads);
      } catch {
        if (active) setError("This score could not be engraved. The practice controls are still available.");
      }
    }
    void renderScore();
    return () => { active = false; displayRef.current = null; };
  }, [musicXml, zoom]);

  function measureNoteheads() {
    const surface = containerRef.current;
    if (!surface) return;
    const surfaceBox = surface.getBoundingClientRect();
    const heads = Array.from(surface.querySelectorAll<SVGGraphicsElement>(
      '[class*="vf-notehead"], [class*="notehead"], [id*="NoteHead"], [id*="notehead"]',
    ));
    const positions = heads
      .map((head) => head.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .map((box) => ({ x: box.left - surfaceBox.left + box.width / 2, y: box.top - surfaceBox.top + box.height / 2 }))
      .filter((position, index, all) => index === 0 || Math.abs(position.x - all[index - 1].x) > 0.5 || Math.abs(position.y - all[index - 1].y) > 0.5);
    setNoteheadPositions(positions);
  }

  function adjustZoom(nextZoom: number) {
    setZoom(Math.max(0.65, Math.min(1.35, Number(nextZoom.toFixed(2)))));
  }

  const fallbackPosition = fallbackPointerPercent(currentNoteIndex, totalNotes);
  const notehead = noteheadPositions[currentNoteIndex];

  return <div className="score-renderer" aria-label={`Engraved score, current note ${currentNoteIndex + 1} of ${totalNotes}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3 text-xs text-muted-foreground">
      <span>Engraved notation · Measure {currentMeasure} · Note {currentNoteIndex + 1} of {totalNotes}</span>
      <div className="flex items-center gap-2" aria-label="Score zoom controls">
        <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => adjustZoom(zoom - 0.1)}><Minus /></Button>
        <Slider aria-label="Score zoom" min={65} max={135} step={5} value={[Math.round(zoom * 100)]} onValueChange={(value) => adjustZoom((Array.isArray(value) ? value[0] : zoom * 100) / 100)} className="w-24" />
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => adjustZoom(zoom + 0.1)}><Plus /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Reset score zoom" onClick={() => adjustZoom(1)}><RotateCcw /></Button>
        <span className="w-10 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
    <div className="relative" aria-hidden="true">
      <div ref={containerRef} className="min-h-64 overflow-x-auto px-3 py-8 sm:px-8" />
      <div
        data-testid="score-pointer"
        className="pointer-events-none absolute -translate-x-1/2 transition-[left,top] duration-150 motion-reduce:transition-none"
        style={{ left: notehead === undefined ? `${fallbackPosition}%` : `${notehead.x}px`, top: notehead === undefined ? "0.75rem" : `${notehead.y}px` }}
      >
        <span className="block size-6 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/15 shadow-[0_0_0_5px_oklch(0.43_0.16_259_/_0.12),0_0_18px_oklch(0.43_0.16_259_/_0.35)]" />
      </div>
    </div>
    <p className="sr-only" aria-live="polite">Current note {currentNoteIndex + 1} of {totalNotes}, measure {currentMeasure}.</p>
    {error ? <p className="p-8 text-center text-sm text-muted-foreground" role="status">{error}</p> : null}
  </div>;
}
