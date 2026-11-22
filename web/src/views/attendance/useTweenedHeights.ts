import { useEffect, useRef, useState } from "react";
import type { Tower } from "./layers";

// Exponential approach; about 95% of the way after 3 * TAU ms.
const TAU = 120;
const SETTLED_M = 40;

/**
 * Animates tower heights in the view rather than in deck.gl, so everything placed on a
 * tower top (badge, number) moves with the tower instead of jumping ahead of it.
 */
export function useTweenedHeights(towers: Tower[]): Tower[] {
  const shown = useRef(new Map<string, number>());
  const targets = useRef(towers);
  targets.current = towers;
  const [, setFrame] = useState(0);
  const signature = towers.map((t) => Math.round(t.height)).join();

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const f = 1 - Math.exp(-(now - last) / TAU);
      last = now;
      let moving = false;
      for (const t of targets.current) {
        const h = shown.current.get(t.teamId) ?? 0;
        const next = Math.abs(t.height - h) < SETTLED_M ? t.height : h + (t.height - h) * f;
        shown.current.set(t.teamId, next);
        if (next !== t.height) moving = true;
      }
      setFrame((n) => n + 1);
      if (moving) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [signature]);

  return towers.map((t) => ({ ...t, height: shown.current.get(t.teamId) ?? 0 }));
}
