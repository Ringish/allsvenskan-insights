import { useCallback, useEffect, useState } from "react";

export const MAX_FOLLOW = 4;
const KEY = "follow";

type Slots = (string | null)[];

function load(): Slots {
  const empty: Slots = Array(MAX_FOLLOW).fill(null);
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(v)) return empty;
    return empty.map((_, i) => (typeof v[i] === "string" ? v[i] : null));
  } catch {
    return empty;
  }
}

/**
 * Followed teams in fixed color slots: a team keeps its slot (and color) when another is
 * unfollowed, and a new team takes the first free slot. Remembered per browser.
 */
export function useFollow() {
  const [slots, setSlots] = useState<Slots>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(slots));
    } catch {
      /* storage unavailable */
    }
  }, [slots]);
  const toggle = useCallback(
    (id: string) =>
      setSlots((s) => {
        if (s.includes(id)) return s.map((x) => (x === id ? null : x));
        const free = s.indexOf(null);
        return free < 0 ? s : s.map((x, i) => (i === free ? id : x));
      }),
    [],
  );
  const clear = useCallback(() => setSlots(Array(MAX_FOLLOW).fill(null)), []);
  const followed = slots.flatMap((id, slot) => (id ? [{ id, slot }] : []));
  return { slots, followed, full: followed.length >= MAX_FOLLOW, toggle, clear };
}
