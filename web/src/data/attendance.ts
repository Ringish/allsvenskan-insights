import type { Dataset, Match } from "./types";

export type RecordKind = "venue" | "season";

/** A venue's state at a point in time, ready to be drawn as a tower. */
export interface VenueState {
  venueId: string;
  /** Attendance the tower represents (last match, or season-to-date average). */
  value: number | null;
  /** 0..1, how present the tower is (decays after a match in match-day mode). */
  presence: number;
  /** The match behind the value, when there is one. */
  match: Match | null;
  /** Number of matches behind a season average. */
  count: number;
  homeTeam: string | null;
  /** Played without spectators. */
  closedDoors: boolean;
  /** Attendance unknown for the last match. */
  missing: boolean;
}

interface VenueEntry {
  dayIndex: number;
  match: Match;
  /** Season-to-date sum and count of known attendances at this venue, including this match. */
  seasonSum: number;
  seasonCount: number;
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
  readonly byVenue = new Map<string, VenueEntry[]>();
  /** Per season: highest attendance in any season, for scaling. */
  readonly maxAttendance: number;

  constructor(readonly data: Dataset) {
    for (const d of data.days) for (const m of d.matches) this.dayOf.set(m.id, d.index);

    const venueMax = new Map<string, { max: number; n: number }>();
    const seasonMax = new Map<number, number>();
    let max = 0;
    for (const m of data.matches) {
      if (!m.venue) continue;
      const list = this.byVenue.get(m.venue) ?? [];
      const prev = list.at(-1);
      const sameSeason = prev && prev.match.year === m.year;
      const known = m.att != null && m.att > 0;
      list.push({
        dayIndex: this.dayOf.get(m.id)!,
        match: m,
        seasonSum: (sameSeason ? prev.seasonSum : 0) + (known ? m.att! : 0),
        seasonCount: (sameSeason ? prev.seasonCount : 0) + (known ? 1 : 0),
      });
      this.byVenue.set(m.venue, list);

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

  /** Towers for match-day mode: the last match at each venue, fading over the following days. */
  matchDay(dayIndex: number): VenueState[] {
    const day = this.data.days[dayIndex];
    const out: VenueState[] = [];
    for (const [venueId, list] of this.byVenue) {
      const e = lastAtOrBefore(list, dayIndex);
      if (!e || e.match.year !== day.year) continue;
      const days = (day.t - this.data.days[e.dayIndex].t) / 86_400_000;
      if (days > DECAY_MAX_DAYS) continue;
      out.push({
        venueId,
        value: e.match.att,
        presence: Math.exp(-days / DECAY_TAU),
        match: e.match,
        count: 1,
        homeTeam: e.match.home,
        closedDoors: e.match.attSrc === "closed-doors",
        missing: e.match.att == null,
      });
    }
    return out;
  }

  /** Towers for skyline mode: season-to-date average attendance per venue. */
  skyline(dayIndex: number): VenueState[] {
    const day = this.data.days[dayIndex];
    const out: VenueState[] = [];
    for (const [venueId, list] of this.byVenue) {
      const e = lastAtOrBefore(list, dayIndex);
      if (!e || e.match.year !== day.year) continue;
      const closed = e.match.attSrc === "closed-doors";
      out.push({
        venueId,
        value: e.seasonCount ? e.seasonSum / e.seasonCount : closed ? 0 : null,
        presence: 1,
        match: e.match,
        count: e.seasonCount,
        homeTeam: e.match.home,
        closedDoors: closed,
        missing: !e.seasonCount && !closed,
      });
    }
    return out;
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
    return (this.byVenue.get(venueId) ?? []).map((e) => e.match);
  }
}
