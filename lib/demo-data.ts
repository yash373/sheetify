import { createNotation, durationForBeats, midiToPitch, notationToMusicXml } from "@/lib/notation";
import type { Difficulty, NoteEvent, SheetPackage, Song } from "@/lib/types";

export const demoSongs: Song[] = [
  {
    id: "moonlit-keys",
    title: "Moonlit Keys",
    artist: "The Quiet Room",
    durationSeconds: 214,
    genre: "Ambient pop",
  },
  {
    id: "paper-cranes",
    title: "Paper Cranes",
    artist: "Mina Vale",
    durationSeconds: 187,
    genre: "Indie folk",
  },
  {
    id: "after-the-rain",
    title: "After the Rain",
    artist: "Northbound",
    durationSeconds: 242,
    genre: "Instrumental",
  },
  {
    id: "starlight-drive",
    title: "Starlight Drive",
    artist: "Lumen Arcade",
    durationSeconds: 198,
    genre: "Synthwave",
  },
];

const difficultyOffsets: Record<Difficulty, number[]> = {
  beginner: [0, 4, 7, 4, 0, 2, 5, 2],
  medium: [0, 4, 7, 11, 7, 4, 2, 5],
  hard: [0, 4, 7, 11, 14, 11, 9, 7],
};

const demoPitches = ["C4", "E4", "G4", "B4", "G4", "E4", "D4", "F4"];

function midiForPitch(pitch: string) {
  const match = pitch.match(/^([A-G])([#b]?)(\d)$/);
  if (!match) return 60;
  const semitones: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + semitones[match[1]] + accidental;
}

export function findDemoSong(songId: string) {
  return demoSongs.find((song) => song.id === songId);
}

export function searchDemoSongs(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return demoSongs;

  return demoSongs.filter((song) =>
    `${song.title} ${song.artist} ${song.genre}`.toLowerCase().includes(normalized),
  );
}

export function createDemoSheet(
  song: Song,
  difficulty: Difficulty,
  sheetId: string,
): SheetPackage {
  const offsets = difficultyOffsets[difficulty];
  const noteEvents: NoteEvent[] = offsets.map((offset, index) => ({
    id: `${sheetId}-note-${index}`,
    pitch: demoPitches[index],
    midi: midiForPitch(demoPitches[index]) + (offset - [0, 4, 7, 11, 7, 4, 2, 5][index]),
    start: index,
    duration: difficulty === "hard" && index % 3 === 0 ? 0.5 : 1,
    measure: Math.floor(index / 4) + 1,
  }));

  const notation = createNotation({
    title: song.title,
    artist: song.artist,
    tempo: difficulty === "beginner" ? 76 : difficulty === "medium" ? 92 : 108,
    divisions: 4,
    keyFifths: 0,
    timeSignature: { beats: 4, beatType: 4 },
    clef: "G",
    events: noteEvents.map((note) => ({
      id: note.id,
      kind: "note",
      pitch: midiToPitch(note.midi),
      midi: note.midi,
      onset: note.start,
      durationBeats: note.duration,
      ...durationForBeats(note.duration),
      measure: note.measure,
      beat: note.start % 4,
      voice: 1,
      staff: 1,
      beam: note.duration <= 0.5 ? "continue" : undefined,
    })),
  });

  return {
    sheetId,
    song,
    difficulty,
    tempo: difficulty === "beginner" ? 76 : difficulty === "medium" ? 92 : 108,
    key: "C major",
    timeSignature: "4/4",
    musicXml: notationToMusicXml(notation),
    noteEvents,
    notation,
    generatedAt: new Date().toISOString(),
  };
}
