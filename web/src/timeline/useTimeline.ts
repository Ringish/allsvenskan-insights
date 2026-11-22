import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchDay } from "../data/types";

export const SPEEDS = [1, 4, 16] as const;
export type Speed = (typeof SPEEDS)[number];
// Match days advanced per second at 1x.
const BASE_RATE = 1.2;

export interface Timeline {
  dayIndex: number;
  day: MatchDay;
  playing: boolean;
  speed: Speed;
  setDayIndex: (i: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: Speed) => void;
  step: (unit: "day" | "round" | "season", dir: 1 | -1) => void;
}

/** Shared playback state over a list of match days: scrub, play/pause, speed, keyboard. */
export function useTimeline(days: MatchDay[], initial = days.length - 1): Timeline {
  const [dayIndex, setIdx] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const frac = useRef(0);

  const setDayIndex = useCallback(
    (i: number) => setIdx(Math.max(0, Math.min(days.length - 1, Math.round(i)))),
    [days.length],
  );

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frac.current += ((now - last) / 1000) * BASE_RATE * speed;
      last = now;
      const whole = Math.floor(frac.current);
      if (whole > 0) {
        frac.current -= whole;
        setIdx((i) => {
          const next = i + whole;
          if (next >= days.length - 1) {
            setPlaying(false);
            return days.length - 1;
          }
          return next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, days.length]);

  const step = useCallback(
    (unit: "day" | "round" | "season", dir: 1 | -1) => {
      setIdx((i) => {
        const cur = days[i];
        if (unit === "day") return Math.max(0, Math.min(days.length - 1, i + dir));
        if (unit === "season") {
          const target = cur.year + dir;
          const first = days.find((d) => d.year === target);
          return first ? first.index : i;
        }
        // Round: next/previous day whose matches belong to a different round number.
        const round = cur.matches[0]?.round;
        let j = i + dir;
        while (j > 0 && j < days.length - 1 && days[j].matches[0]?.round === round) j += dir;
        return Math.max(0, Math.min(days.length - 1, j));
      });
    },
    [days],
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
        const dir = e.key === "ArrowRight" ? 1 : -1;
        step(e.shiftKey ? "season" : e.altKey ? "round" : "day", dir);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  return { dayIndex, day: days[dayIndex], playing, speed, setDayIndex, setPlaying, setSpeed, step };
}
