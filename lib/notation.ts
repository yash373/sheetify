export const writtenDurations = ["whole", "half", "quarter", "eighth", "16th"] as const;

export type WrittenDuration = (typeof writtenDurations)[number];

export type Clef = "G" | "F" | "C";

export type Pitch = {
  step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  octave: number;
  alter?: -1 | 0 | 1;
};

export type NotationEvent = {
  id: string;
  kind: "note" | "rest";
  pitch?: Pitch;
  midi?: number;
  onset: number;
  durationBeats: number;
  writtenDuration: WrittenDuration;
  dots?: number;
  measure: number;
  beat: number;
  voice: number;
  staff: number;
  accidental?: "sharp" | "flat" | "natural";
  tieStart?: boolean;
  tieStop?: boolean;
  beam?: "begin" | "continue" | "end";
  chordId?: string;
};

export type NotationMeasure = {
  number: number;
  events: NotationEvent[];
};

export type Notation = {
  title: string;
  artist: string;
  tempo: number;
  divisions: number;
  keyFifths: number;
  timeSignature: { beats: number; beatType: number };
  clef: Clef;
  measures: NotationMeasure[];
};

const durationBeats: Record<WrittenDuration, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  "16th": 0.25,
};

export function beatsForDuration(duration: WrittenDuration, dots = 0) {
  const base = durationBeats[duration];
  return base * (dots === 0 ? 1 : dots === 1 ? 1.5 : 1.75);
}

export function durationForBeats(beats: number): Pick<NotationEvent, "writtenDuration" | "dots"> {
  const candidates: Array<Pick<NotationEvent, "writtenDuration" | "dots">> = [
    { writtenDuration: "whole" },
    { writtenDuration: "half" },
    { writtenDuration: "half", dots: 1 },
    { writtenDuration: "quarter" },
    { writtenDuration: "quarter", dots: 1 },
    { writtenDuration: "eighth" },
    { writtenDuration: "eighth", dots: 1 },
    { writtenDuration: "16th" },
  ];
  return candidates.find((candidate) => Math.abs(beatsForDuration(candidate.writtenDuration, candidate.dots) - beats) < 0.0001) ?? { writtenDuration: "quarter" };
}

export function midiToPitch(midi: number): Pitch {
  const names: Array<Pitch["step"]> = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
  const alters: Array<-1 | 0 | 1> = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const index = ((midi % 12) + 12) % 12;
  const alter = alters[index];
  return { step: names[index], octave: Math.floor(midi / 12) - 1, ...(alter ? { alter } : {}) };
}

function makeRest(id: string, onset: number, duration: number, measure: number, beat: number, voice: number, staff: number): NotationEvent {
  return { id, kind: "rest", onset, durationBeats: duration, ...durationForBeats(duration), measure, beat, voice, staff };
}

const restDurations = [4, 2, 1.5, 1, 0.75, 0.5, 0.25];

export function fillRests(events: NotationEvent[], beatsPerMeasure = 4) {
  const grouped = new Map<string, NotationEvent[]>();
  for (const event of events) {
    const key = `${event.voice}:${event.staff}`;
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }
  const result: NotationEvent[] = [];
  for (const group of grouped.values()) {
    const sorted = group.slice().sort((a, b) => a.onset - b.onset || a.id.localeCompare(b.id));
    let cursor = 0;
    const appendRestsUntil = (target: number) => {
      while (target - cursor > 0.0001) {
        const remaining = beatsPerMeasure - (cursor % beatsPerMeasure);
        const maxDuration = Math.min(target - cursor, remaining);
        const duration = restDurations.find((candidate) => candidate <= maxDuration + 0.0001) ?? 0.25;
        const measure = Math.floor(cursor / beatsPerMeasure) + 1;
        const first = sorted[0];
        result.push(makeRest(`rest-${first.voice}-${first.staff}-${measure}-${cursor}`, cursor, duration, measure, cursor % beatsPerMeasure, first.voice, first.staff));
        cursor += duration;
      }
    };
    for (const event of sorted) {
      appendRestsUntil(event.onset);
      result.push(event);
      cursor = Math.max(cursor, event.onset + event.durationBeats);
    }
    if (sorted.length > 0) appendRestsUntil(Math.ceil(cursor / beatsPerMeasure) * beatsPerMeasure);
  }
  return result.sort((a, b) => a.onset - b.onset || a.voice - b.voice || a.staff - b.staff);
}

function normalizeGroups(events: NotationEvent[]) {
  const result = [...events];
  const groups = new Map<string, number[]>();
  result.forEach((event, index) => {
    if (event.kind !== "note") return;
    const key = `${event.voice}:${event.staff}:${event.measure}`;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  for (const indices of groups.values()) {
    const shortNotes = indices.filter((index) => result[index].durationBeats <= 0.5);
    for (let index = 0; index < shortNotes.length; ) {
      const run: number[][] = [[shortNotes[index]]];
      while (shortNotes[index + 1] !== undefined) {
        const currentGroup = run[run.length - 1];
        const current = result[currentGroup[currentGroup.length - 1]];
        const nextIndex = shortNotes[index + 1];
        const next = result[nextIndex];
        if (next.onset > current.onset + current.durationBeats + 0.0001) break;
        if (Math.abs(next.onset - current.onset) < 0.0001) currentGroup.push(nextIndex);
        else run.push([nextIndex]);
        index += 1;
      }
      if (run.length > 1) run.forEach((eventGroup, position) => {
        const beam = position === 0 ? "begin" : position === run.length - 1 ? "end" : "continue";
        eventGroup.forEach((eventIndex) => { result[eventIndex] = { ...result[eventIndex], beam }; });
      });
      index += 1;
    }
  }
  return result;
}

export function createNotation(input: Omit<Notation, "measures"> & { events: NotationEvent[] }): Notation {
  const beatsPerMeasure = input.timeSignature.beats * (4 / input.timeSignature.beatType);
  const events = normalizeGroups(fillRests(input.events, beatsPerMeasure));
  const measures = new Map<number, NotationEvent[]>();
  for (const event of events) {
    const list = measures.get(event.measure) ?? [];
    list.push(event);
    measures.set(event.measure, list);
  }
  return { ...input, measures: [...measures.entries()].sort(([a], [b]) => a - b).map(([number, measureEvents]) => ({ number, events: measureEvents })) };
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function eventXml(event: NotationEvent, divisions: number) {
  const duration = Math.round(event.durationBeats * divisions);
  const type = event.writtenDuration === "16th" ? "16th" : event.writtenDuration;
  const pitch = event.kind === "rest" || !event.pitch ? "<rest/>" : `<pitch><step>${event.pitch.step}</step>${event.pitch.alter ? `<alter>${event.pitch.alter}</alter>` : ""}<octave>${event.pitch.octave}</octave></pitch>`;
  const accidental = event.accidental ?? (event.pitch?.alter === 1 ? "sharp" : event.pitch?.alter === -1 ? "flat" : undefined);
  const tie = `${event.tieStart ? '<tie type="start"/>' : ""}${event.tieStop ? '<tie type="stop"/>' : ""}`;
  const notations = event.tieStart || event.tieStop ? `<notations>${event.tieStart ? '<tied type="start"/>' : ""}${event.tieStop ? '<tied type="stop"/>' : ""}</notations>` : "";
  const beam = event.beam ? `<beam number="1">${event.beam}</beam>` : "";
  return `<note>${pitch}${event.chordId ? "<chord/>" : ""}<duration>${duration}</duration><voice>${event.voice}</voice><type>${type}</type>${event.dots ? "<dot/>".repeat(event.dots) : ""}${accidental ? `<accidental>${accidental}</accidental>` : ""}${tie}${beam}${notations}</note>`;
}

export function notationToMusicXml(notation: Notation) {
  const { beats, beatType } = notation.timeSignature;
  const attributes = `<attributes><divisions>${notation.divisions}</divisions><key><fifths>${notation.keyFifths}</fifths></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>${notation.clef}</sign><line>${notation.clef === "F" ? 4 : notation.clef === "C" ? 3 : 2}</line></clef></attributes>`;
  const measures = notation.measures.map((measure, index) => `<measure number="${measure.number}">${index === 0 ? attributes : ""}${measure.events.map((event) => eventXml(event, notation.divisions)).join("")}</measure>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${escapeXml(notation.title)}</work-title></work><identification><creator type="composer">${escapeXml(notation.artist)}</creator></identification><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}
