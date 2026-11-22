import type { Dataset, Match } from "./types";

export type RecordKind = "venue" | "season";

/** A team's home crowd at a point in time, ready to be drawn as a tower at its venue. */
export interface TowerState {
  teamId: string;
  venueId: string;
  /** Attendance the tower represents (last match, or season-to-date average). */
  value: number | null;
  /** 0..1, how present the tower is (decays after a match in match-day mode). */
  presence: number;
  /** The match behind the value, when there is one. */
  match: Match | null;
  /** Number of matches behind a season average. */
  count: number;
  /** Played without spectators. */
  closedDoors: boolean;
  /** Attendance unknown for the last match. */
  missing: boolean;
}

interface HomeEntry {
  dayIndex: number;
  match: Match;
  /** Season-to-date sum and count of the team's known home attendances, including this match. */
  seasonSum: number;
  seasonCount: number;
}

/** A team's season-to-date home figures. */
export interface TeamSeason {
  teamId: string;
  average: number | null;
  count: number;
  /** Average as a share of the capacity of the venue it last played at. */
  fill: number | null;
  /** 1-based rank by average among teams with data. */
  rank: number | null;
  venueId: string | null;
}

// Towers fade after a match; tau in days.
const DECAY_TAU = 5;
const DECAY_MAX_DAYS = 18;
// A venue record only counts once the venue has some history.
const MIN_HISTORY_FOR_RECORD = 10;

function lastAtOrBefore<T extends { dayIndex: number }>(list: T[], dayIndex: number): T | null {
  let lo = 0;
  let hi = list.length - 1;
  let found: T | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].dayIndex <= dayIndex) {
      found = list[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export class AttendanceModel {
  readonly dayOf = new Map<string, number>();
  readonly records = new Map<string, RecordKind>();
  readonly byVenue = new Map<string, Match[]>();
  readonly byTeam = new Map<string, HomeEntry[]>();
  /** Per season: highest attendance in any season, for scaling. */
  readonly maxAttendance: number;

  constructor(readonly data: Dataset) {
    for (const d of data.days) for (const m of d.matches) this.dayOf.set(m.id, d.index);

    const venueMax = new Map<string, { max: number; n: number }>();
    const seasonMax = new Map<number, number>();
    let max = 0;
    for (const m of data.matches) {
      const known = m.att != null && m.att > 0;
      const list = this.byTeam.get(m.home) ?? [];
      const prev = list.at(-1);
      const sameSeason = prev && prev.match.year === m.year;
      list.push({
        dayIndex: this.dayOf.get(m.id)!,
        match: m,
        seasonSum: (sameSeason ? prev.seasonSum : 0) + (known ? m.att! : 0),
        seasonCount: (sameSeason ? prev.seasonCount : 0) + (known ? 1 : 0),
      });
      this.byTeam.set(m.home, list);

      if (!m.venue) continue;
      this.byVenue.set(m.venue, [...(this.byVenue.get(m.venue) ?? []), m]);
      if (!known) continue;
      max = Math.max(max, m.att!);
      const vm = venueMax.get(m.venue) ?? { max: 0, n: 0 };
      const sm = seasonMax.get(m.year) ?? 0;
      if (vm.n >= MIN_HISTORY_FOR_RECORD && m.att! > vm.max) this.records.set(m.id, "venue");
      else if (sm > 0 && m.att! > sm && this.dayOf.get(m.id)! > 0) this.records.set(m.id, "season");
      venueMax.set(m.venue, { max: Math.max(vm.max, m.att!), n: vm.n + 1 });
      seasonMax.set(m.year, Math.max(sm, m.att!));
    }
    this.maxAttendance = max;
  }

  /** Towers for match-day mode: each team's last home match, fading over the following days. */
  matchDay(dayIndex: number): TowerState[] {
    const day = this.data.days[dayIndex];
    const out: TowerState[] = [];
    for (const [teamId, list] of this.byTeam) {
      const e = lastAtOrBefore(list, dayIndex);
      if (!e || e.match.year !== day.year || !e.match.venue) continue;
      const days = (day.t - this.data.days[e.dayIndex].t) / 86_400_000;
      if (days > DECAY_MAX_DAYS) continue;
      out.push({
        teamId,
        venueId: e.match.venue,
        value: e.match.att,
        presence: Math.exp(-days / DECAY_TAU),
        match: e.match,
        count: 1,
        closedDoors: e.match.attSrc === "closed-doors",
        missing: e.match.att == null,
      });
    }
    return out;
  }

  /** Towers for skyline mode: each team's season-to-date home average, at the venue of its last home match. */
  skyline(dayIndex: number): TowerState[] {
    const day = this.data.days[dayIndex];
    const out: TowerState[] = [];
    for (const [teamId, list] of this.byTeam) {
      const e = lastAtOrBefore(list, dayIndex);
      if (!e || e.match.year !== day.year || !e.match.venue) continue;
      const closed = e.match.attSrc === "closed-doors";
      out.push({
        teamId,
        venueId: e.match.venue,
        value: e.seasonCount ? e.seasonSum / e.seasonCount : closed ? 0 : null,
        presence: 1,
        match: e.match,
        count: e.seasonCount,
        closedDoors: closed,
        missing: !e.seasonCount && !closed,
      });
    }
    return out;
  }

  /** Every team's season-to-date home average at a day, ranked. */
  teamTable(dayIndex: number): Map<string, TeamSeason> {
    const year = this.data.days[dayIndex].year;
    const rows: TeamSeason[] = [];
    for (const [teamId, list] of this.byTeam) {
      const e = lastAtOrBefore(list, dayIndex);
      if (!e || e.match.year !== year) {
        if (list.some((x) => x.match.year === year)) rows.push({ teamId, average: null, count: 0, fill: null, rank: null, venueId: null });
        continue;
      }
      const average = e.seasonCount ? e.seasonSum / e.seasonCount : null;
      const cap = e.match.venue ? this.data.venues.get(e.match.venue)?.capacity : null;
      rows.push({ teamId, average, count: e.seasonCount, fill: average != null && cap ? average / cap : null, rank: null, venueId: e.match.venue });
    }
    rows
      .filter((r) => r.average != null)
      .sort((a, b) => b.average! - a.average!)
      .forEach((r, i) => (r.rank = i + 1));
    return new Map(rows.map((r) => [r.teamId, r]));
  }

  /** Full-season home average for a team, or null when it has no data that year. */
  seasonAverage(teamId: string, year: number): number | null {
    let sum = 0;
    let n = 0;
    for (const e of this.byTeam.get(teamId) ?? []) {
      if (e.match.year === year && e.match.att != null && e.match.att > 0) {
        sum += e.match.att;
        n += 1;
      }
    }
    return n ? sum / n : null;
  }

  /** The team's running home average through a season: one point per home match with a known crowd. */
  running(teamId: string, year: number): { dayIndex: number; average: number }[] {
    return (this.byTeam.get(teamId) ?? [])
      .filter((e) => e.match.year === year && e.seasonCount > 0)
      .map((e) => ({ dayIndex: e.dayIndex, average: e.seasonSum / e.seasonCount }));
  }

  /** Season-to-date league figures and top crowds. */
  seasonSoFar(dayIndex: number) {
    const day = this.data.days[dayIndex];
    let sum = 0;
    let n = 0;
    const played: Match[] = [];
    for (const d of this.data.days) {
      if (d.year !== day.year) continue;
      if (d.index > dayIndex) break;
      for (const m of d.matches) {
        played.push(m);
        if (m.att != null && m.att > 0) {
          sum += m.att;
          n += 1;
        }
      }
    }
    const top = played
      .filter((m) => m.att != null && m.att > 0)
      .sort((a, b) => b.att! - a.att!)
      .slice(0, 5);
    return { year: day.year, average: n ? sum / n : null, matches: played.length, known: n, top };
  }

  venueHistory(venueId: string): Match[] {
    return this.byVenue.get(venueId) ?? [];
  }
}
