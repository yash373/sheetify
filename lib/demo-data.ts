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
    pitch: ["C4", "E4", "G4", "B4", "G4", "E4", "D4", "F4"][index],
    midi: 60 + offset,
    start: index * 0.75,
    duration: difficulty === "hard" && index % 3 === 0 ? 0.5 : 0.7,
    measure: Math.floor(index / 4) + 1,
  }));

  return {
    sheetId,
    song,
    difficulty,
    tempo: difficulty === "beginner" ? 76 : difficulty === "medium" ? 92 : 108,
    key: "C major",
    timeSignature: "4/4",
    musicXml: `<score-partwise version="4.0"><work><work-title>${song.title}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes></measure></part></score-partwise>`,
    noteEvents,
    generatedAt: new Date().toISOString(),
  };
}
