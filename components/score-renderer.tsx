"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type ScoreRendererProps = { musicXml: string; currentMeasure: number };

export function ScoreRenderer({ musicXml, currentMeasure }: ScoreRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<import("opensheetmusicdisplay").OpenSheetMusicDisplay | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");

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
      } catch {
        if (active) setError("This score could not be engraved. The practice controls are still available.");
      }
    }
    void renderScore();
    return () => { active = false; displayRef.current = null; };
  }, [musicXml, zoom]);

  function adjustZoom(nextZoom: number) {
    setZoom(Math.max(0.65, Math.min(1.35, Number(nextZoom.toFixed(2)))));
  }

  return <div className="score-renderer" aria-label={`Engraved score, current measure ${currentMeasure}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3 text-xs text-muted-foreground">
      <span>Engraved notation · Measure {currentMeasure} highlighted in practice status</span>
      <div className="flex items-center gap-2" aria-label="Score zoom controls">
        <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => adjustZoom(zoom - 0.1)}><Minus /></Button>
        <Slider aria-label="Score zoom" min={65} max={135} step={5} value={[Math.round(zoom * 100)]} onValueChange={(value) => adjustZoom((Array.isArray(value) ? value[0] : zoom * 100) / 100)} className="w-24" />
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => adjustZoom(zoom + 0.1)}><Plus /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Reset score zoom" onClick={() => adjustZoom(1)}><RotateCcw /></Button>
        <span className="w-10 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
    {error ? <p className="p-8 text-center text-sm text-muted-foreground" role="status">{error}</p> : <div ref={containerRef} className="min-h-64 overflow-x-auto px-3 py-8 sm:px-8" />}
  </div>;
}
