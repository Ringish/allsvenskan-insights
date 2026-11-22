import type { AttendanceSource, Dataset, Match, MatchDay, Meta, Team, Venue } from "./types";

const BASE = `${import.meta.env.BASE_URL}data`;

interface SeasonFile {
  year: number;
  columns: string[];
  rows: (string | number | null)[][];
  homes: Record<string, string>;
}

async function json<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}/${path}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

const localDay = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toMatches(file: SeasonFile): Match[] {
  const col = Object.fromEntries(file.columns.map((c, i) => [c, i]));
  return file.rows.map((r) => {
    const kickoff = new Date(r[col.kickoff] as string);
    return {
      id: String(r[col.id]),
      year: file.year,
      day: localDay.format(kickoff),
      kickoff,
      round: r[col.round] as number | null,
      home: r[col.home] as string,
      away: r[col.away] as string,
      hg: r[col.hg] as number | null,
      ag: r[col.ag] as number | null,
      att: r[col.att] as number | null,
      attSrc: r[col.attSrc] as AttendanceSource,
      venue: r[col.venue] as string | null,
    };
  });
}

function groupDays(matches: Match[]): MatchDay[] {
  const byDay = new Map<string, Match[]>();
  for (const m of matches) {
    const list = byDay.get(m.day);
    if (list) list.push(m);
    else byDay.set(m.day, [m]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, ms], index) => ({
      index,
      day,
      t: Date.parse(`${day}T12:00:00Z`),
      year: ms[0].year,
      matches: ms.sort((a, b) => (b.att ?? -1) - (a.att ?? -1)),
    }));
}

export async function loadDataset(): Promise<Dataset> {
  const [meta, teams, venues] = await Promise.all([
    json<Meta>("meta.json"),
    json<Team[]>("teams.json"),
    json<Venue[]>("venues.json"),
  ]);
  const files = await Promise.all(meta.seasons.map((s) => json<SeasonFile>(`matches/${s.year}.json`)));
  const matches = files.flatMap(toMatches).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  return {
    meta,
    teams: new Map(teams.map((t) => [t.id, t])),
    venues: new Map(venues.filter((v) => v.lat != null).map((v) => [v.id, v])),
    matches,
    days: groupDays(matches),
    homes: new Map(files.map((f) => [f.year, new Map(Object.entries(f.homes))])),
  };
}
