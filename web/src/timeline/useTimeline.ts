import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Match, MatchDay } from "../data/types";

export const SPEEDS = [1, 4, 16] as const;
export type Speed = (typeof SPEEDS)[number];
export type Unit = "round" | "day";
// Steps advanced per second at 1x: a round spans about three match days.
const RATE: Record<Unit, number> = { day: 1.2, round: 0.5 };
// A round's stop is the match day by which this share of its matches has been played,
// so a single postponed match does not hold the round open for weeks.
const ROUND_QUANTILE = 0.75;
const UNIT_KEY = "timeline-unit";

export interface Timeline {
  dayIndex: number;
  day: MatchDay;
  playing: boolean;
  speed: Speed;
  unit: Unit;
  /** Round at the current position, when the feed has round numbers. */
  round: number | null;
  /** Matches of the current step: the round so far, or the day. */
  matches: Match[];
  setDayIndex: (i: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: Speed) => void;
  setUnit: (u: Unit) => void;
  step: (unit: Unit | "season", dir: 1 | -1) => void;
}

interface Stop {
  index: number;
  year: number;
  round: number | null;
}

/** Day indices where each round is complete, in order. Seasons without round numbers stop on every day. */
function roundStops(days: MatchDay[]): Stop[] {
  const byRound = new Map<string, { year: number; round: number; idx: number[] }>();
  const withRounds = new Set<number>();
  for (const d of days)
    for (const m of d.matches) {
      if (m.round == null) continue;
      withRounds.add(d.year);
      const key = `${d.year}:${m.round}`;
      const e = byRound.get(key) ?? { year: d.year, round: m.round, idx: [] };
      e.idx.push(d.index);
      byRound.set(key, e);
    }
  const stops = new Map<number, Stop>();
  for (const e of byRound.values()) {
    const idx = e.idx.sort((a, b) => a - b);
    const index = idx[Math.ceil(idx.length * ROUND_QUANTILE) - 1];
    const prev = stops.get(index);
    if (!prev || (prev.round ?? 0) < e.round) stops.set(index, { index, year: e.year, round: e.round });
  }
  for (const d of days) if (!withRounds.has(d.year)) stops.set(d.index, { index: d.index, year: d.year, round: null });
  return [...stops.values()].sort((a, b) => a.index - b.index);
}

function commonRound(d: MatchDay): number | null {
  const n = new Map<number, number>();
  for (const m of d.matches) if (m.round != null) n.set(m.round, (n.get(m.round) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function loadUnit(): Unit {
  try {
    return localStorage.getItem(UNIT_KEY) === "day" ? "day" : "round";
  } catch {
    return "round";
  }
}

/** Shared playback state over a list of match days: scrub, play/pause, speed, step unit, keyboard. */
export function useTimeline(days: MatchDay[], initial = days.length - 1): Timeline {
  const [dayIndex, setIdx] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [unit, setUnitState] = useState<Unit>(loadUnit);
  const frac = useRef(0);

  const stops = useMemo(() => roundStops(days), [days]);
  const stopAt = useMemo(() => new Map(stops.map((s) => [s.index, s])), [stops]);
  const roundMatches = useMemo(() => {
    const m = new Map<string, { match: Match; dayIndex: number }[]>();
    for (const d of days)
      for (const match of d.matches) {
        if (match.round == null) continue;
        const key = `${d.year}:${match.round}`;
        m.set(key, [...(m.get(key) ?? []), { match, dayIndex: d.index }]);
      }
    return m;
  }, [days]);

  const clamp = useCallback((i: number) => Math.max(0, Math.min(days.length - 1, Math.round(i))), [days.length]);
  const nextStop = useCallback((i: number) => stops.find((s) => s.index > i)?.index ?? null, [stops]);
  const prevStop = useCallback((i: number) => stops.findLast((s) => s.index < i)?.index ?? null, [stops]);
  const nearestStop = useCallback(
    (i: number) =>
      stops.reduce((best, s) => (Math.abs(s.index - i) < Math.abs(best - i) ? s.index : best), stops[0]?.index ?? i),
    [stops],
  );

  const setDayIndex = useCallback(
    (i: number) => setIdx(unit === "round" ? nearestStop(clamp(i)) : clamp(i)),
    [unit, nearestStop, clamp],
  );

  const setUnit = useCallback(
    (u: Unit) => {
      setUnitState(u);
      try {
        localStorage.setItem(UNIT_KEY, u);
      } catch {
        /* storage unavailable */
      }
      // Entering round mode completes the round in progress.
      if (u === "round") setIdx((i) => (stopAt.has(i) ? i : (nextStop(i) ?? i)));
    },
    [stopAt, nextStop],
  );

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frac.current += ((now - last) / 1000) * RATE[unit] * speed;
      last = now;
      const whole = Math.floor(frac.current);
      if (whole > 0) {
        frac.current -= whole;
        setIdx((i) => {
          let next = i;
          for (let k = 0; k < whole; k++) {
            const n = unit === "round" ? nextStop(next) : next + 1 < days.length ? next + 1 : null;
            if (n == null) {
              setPlaying(false);
              break;
            }
            next = n;
          }
          return next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, unit, days.length, nextStop]);

  const step = useCallback(
    (by: Unit | "season", dir: 1 | -1) => {
      setIdx((i) => {
        if (by === "day") return clamp(i + dir);
        if (by === "round") return (dir > 0 ? nextStop(i) : prevStop(i)) ?? i;
        const target = days[i].year + dir;
        const first = days.find((d) => d.year === target);
        if (!first) return i;
        return unit === "round" ? (stops.find((s) => s.year === target)?.index ?? first.index) : first.index;
      });
    },
    [days, stops, unit, clamp, nextStop, prevStop],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        step(e.shiftKey ? "season" : unit, e.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, unit]);

  const day = days[dayIndex];
  const round = (unit === "round" ? stopAt.get(dayIndex)?.round : null) ?? commonRound(day);
  const matches =
    unit === "round" && round != null
      ? (roundMatches.get(`${day.year}:${round}`) ?? [])
          .filter((e) => e.dayIndex <= dayIndex)
          .map((e) => e.match)
          .sort((a, b) => (b.att ?? -1) - (a.att ?? -1))
      : day.matches;

  return {
    dayIndex, day, playing, speed, unit, round, matches,
    setDayIndex, setPlaying, setSpeed, setUnit, step,
  };
}
