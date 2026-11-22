import { useEffect, useState } from "react";

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export interface SceneTheme {
  mode: "light" | "dark";
  background: RGB;
  land: RGB;
  landSide: RGB;
  neighbour: RGB;
  border: RGB;
  /** Sequential ramp for stadium fill rate, low -> high. */
  fillRamp: string[];
  ghost: RGBA;
  missing: RGBA;
  arc: RGB;
  flare: RGB;
  label: RGBA;
  labelHalo: RGBA;
  /** Categorical slots for followed teams (reference palette slots 3-6; blue is the towers, orange the light-mode flare). */
  follow: string[];
}

export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Blue sequential ramp (dataviz reference palette). Light mode runs light -> dark,
// dark mode runs dark -> light so that "more" is always the higher-contrast end.
const BLUE = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];

export const THEMES: Record<"light" | "dark", SceneTheme> = {
  dark: {
    mode: "dark",
    background: hex("#0e1116"),
    land: hex("#1d232c"),
    landSide: hex("#141920"),
    neighbour: hex("#151a21"),
    border: hex("#3a4452"),
    fillRamp: BLUE.slice(1, 8).reverse(),
    ghost: [205, 226, 251, 26],
    missing: [195, 194, 183, 150],
    arc: hex("#c3c2b7"),
    flare: hex("#fff4c2"),
    label: [240, 239, 236, 255],
    labelHalo: [14, 17, 22, 230],
    follow: ["#199e70", "#c98500", "#d55181", "#008300"],
  },
  light: {
    mode: "light",
    background: hex("#eef1f4"),
    land: hex("#fcfcfb"),
    landSide: hex("#d9dde2"),
    neighbour: hex("#e4e7eb"),
    border: hex("#b9c0c9"),
    fillRamp: BLUE.slice(2),
    ghost: [13, 54, 107, 22],
    missing: [82, 81, 78, 160],
    arc: hex("#52514e"),
    flare: hex("#eb6834"),
    label: [11, 11, 11, 255],
    labelHalo: [252, 252, 251, 230],
    follow: ["#1baf7a", "#eda100", "#e87ba4", "#008300"],
  },
};

/** Color for a 0..1 value on the theme's sequential ramp. */
export function rampColor(ramp: string[], v: number): RGB {
  const x = Math.min(1, Math.max(0, v)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = hex(ramp[i]);
  const b = hex(ramp[i + 1]);
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as RGB;
}

type Pref = "light" | "dark" | "system";

export function useThemeMode(): ["light" | "dark", Pref, (p: Pref) => void] {
  const [pref, setPref] = useState<Pref>(() => {
    try {
      return (localStorage.getItem("theme") as Pref) || "system";
    } catch {
      return "system";
    }
  });
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const mode = pref === "system" ? (systemDark ? "dark" : "light") : pref;
  useEffect(() => {
    if (pref === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", pref);
    try {
      localStorage.setItem("theme", pref);
    } catch {
      /* storage unavailable */
    }
  }, [pref]);
  return [mode, pref, setPref];
}
