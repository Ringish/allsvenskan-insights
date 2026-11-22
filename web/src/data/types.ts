export interface Team {
  id: string;
  name: string;
  short_name: string;
  city: string | null;
  color: string | null;
  color2: string | null;
  /** Round badge image, relative to the app base. */
  logo: string | null;
}

export interface Venue {
  id: string;
  name: string;
  city: string | null;
  lat: number;
  lon: number;
  capacity: number | null;
  opened: number | null;
  closed: number | null;
}

export interface SeasonMeta {
  year: number;
  matches: number;
  withAttendance: number;
  closedDoors: number;
  total: number;
  average: number | null;
  start: string;
  end: string;
}

export interface Meta {
  generatedAt: string;
  competition: string;
  sources: Record<string, string>;
  seasons: SeasonMeta[];
}

export type AttendanceSource = "sportomedia" | "allstat" | "closed-doors" | null;

export interface Match {
  id: string;
  year: number;
  /** Local (Europe/Stockholm) calendar date, YYYY-MM-DD. */
  day: string;
  kickoff: Date;
  round: number | null;
  home: string;
  away: string;
  hg: number | null;
  ag: number | null;
  /** null = unknown, 0 = played without spectators. */
  att: number | null;
  attSrc: AttendanceSource;
  venue: string | null;
}

export interface MatchDay {
  index: number;
  day: string;
  /** Noon local time of that day, ms. Used for positioning on the timeline. */
  t: number;
  year: number;
  matches: Match[];
}

export interface Dataset {
  meta: Meta;
  teams: Map<string, Team>;
  venues: Map<string, Venue>;
  matches: Match[];
  days: MatchDay[];
  /** Home venue per team per season (most used), for arcs from the away team's home. */
  homes: Map<number, Map<string, string>>;
}
