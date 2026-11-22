import { useEffect, useState } from "react";

export type Lang = "sv" | "en";
export const LANGS: Lang[] = ["sv", "en"];

const sv = {
  locale: "sv-SE",
  loading: "Laddar matcher…",
  loadingView: "Laddar vy…",
  loadError: (e: string) => `Kunde inte ladda data: ${e}. Kör engine export först.`,
  theme: { title: "Tema", system: "Auto", dark: "Mörkt", light: "Ljust" },
  langTitle: "Language: English",

  views: {
    attendance: {
      title: "Publikskyline",
      description: "Publiken på varje allsvensk arena sedan 2000, som 3D-torn över tid.",
    },
  },

  timeline: {
    play: "Spela",
    pause: "Pausa",
    speed: "Hastighet",
    label: "Tidslinje",
    hint: "← → dag · ⌥ omgång · ⇧ säsong",
    matches: (n: number) => `${n} ${n === 1 ? "match" : "matcher"}`,
    missing: "saknas",
  },

  att: {
    mode: "Läge",
    skyline: "Säsongsskyline",
    matchday: "Matchdag",
    capacity: "Kapacitet",
    awayTrips: "Bortaresor",
    presets: { Sweden: "Sverige", Stockholm: "Stockholm", Göteborg: "Göteborg", Skåne: "Skåne" },
    autoCamera: "Autokamera",
    autoCameraTitle: "Kretsa och följ dagens största publik under uppspelning",
    closedBanner: "2020: alla matcher spelades utan publik",
    avgCrowd: "snittpublik",
    seasonAvg: (v: string, n: number) => `Säsongssnitt <b>${v}</b> (${n} ${n === 1 ? "match" : "matcher"})`,
    noData: "Ingen publiksiffra",
    ofCapacity: (p: string) => `${p} av kapaciteten`,
    closedDoors: "Spelad utan publik",
    spectators: (v: string) => `<b>${v}</b> åskådare`,
    unknown: "Publik okänd",
    venueRecord: "Arenarekord",
    seasonHigh: "Säsongstopp",

    details: "Detaljer",
    hideDetails: "Dölj detaljer",
    leagueAvg: "Ligasnitt hittills",
    vs: (year: number, avg: string) => `mot ${year} (${avg})`,
    played: (n: number) => `${n} ${n === 1 ? "match spelad" : "matcher spelade"}`,
    withoutData: (n: number) => `, ${n} utan publiksiffra`,
    topCrowds: (year: number) => `Största publiken ${year} hittills`,
    noCrowd: "ingen publik",
    unknownShort: "okänd",
    recordBadge: "Rekord",
    highBadge: "Topp",
    venueUnknown: "Arena okänd",
    howToRead: "Så läser du kartan",
    empty: "tomt",
    soldOut: "utsålt",
    legendHeight: (skyline: boolean) =>
      `Tornets höjd är ${skyline ? "säsongssnittet hittills på arenan" : "publiken, som klingar av dagarna efter matchen"}.`,
    legendRest:
      "Färgen visar hur full arenan var. Glaspelaren runt tornet är kapaciteten och den färgade basen är hemmalaget. Bågarna går från bortalagets hemmaarena. En tom ring betyder att publiksiffra saknas.",
    sourceNote: (k: number, n: number, year: number) =>
      `${k} av ${n} matcher ${year} har publiksiffra. Källa: allsvenskan.se:s dataflöde, luckor fyllda från AllStat där det finns.`,

    history: (venue: string) => `Publikhistorik för ${venue}`,
    close: "Stäng",
    capacityN: (v: string) => `kapacitet ${v}`,
    opened: (y: number) => `invigd ${y}`,
    homeOf: (teams: string) => `Hemmaarena för ${teams}`,
    capacityAxis: "kapacitet",
    readout: (avg: string, n: number, max: string) => `snitt ${avg} · ${n} ${n === 1 ? "match" : "matcher"} · högst ${max}`,
    readoutNone: "inga allsvenska matcher med publiksiffra här",
    readoutHint: "Prickarna är matcher, linjen är säsongssnittet. Peka på en säsong.",
  },
};

export type Dict = typeof sv;

const en: Dict = {
  locale: "en-GB",
  loading: "Loading matches…",
  loadingView: "Loading view…",
  loadError: (e) => `Could not load data: ${e}. Run the engine export first.`,
  theme: { title: "Theme", system: "Auto", dark: "Dark", light: "Light" },
  langTitle: "Språk: svenska",

  views: {
    attendance: {
      title: "Crowd skyline",
      description: "Attendance at every Allsvenskan stadium since 2000, as 3D towers over time.",
    },
  },

  timeline: {
    play: "Play",
    pause: "Pause",
    speed: "Speed",
    label: "Timeline",
    hint: "← → day · ⌥ round · ⇧ season",
    matches: (n) => `${n} ${n === 1 ? "match" : "matches"}`,
    missing: "missing",
  },

  att: {
    mode: "Mode",
    skyline: "Season skyline",
    matchday: "Match day",
    capacity: "Capacity",
    awayTrips: "Away trips",
    presets: { Sweden: "Sweden", Stockholm: "Stockholm", Göteborg: "Göteborg", Skåne: "Skåne" },
    autoCamera: "Auto camera",
    autoCameraTitle: "Orbit and follow the biggest crowd while playing",
    closedBanner: "2020: every match played without spectators",
    avgCrowd: "avg crowd",
    seasonAvg: (v, n) => `Season average <b>${v}</b> (${n} ${n === 1 ? "match" : "matches"})`,
    noData: "No attendance data",
    ofCapacity: (p) => `${p} of capacity`,
    closedDoors: "Played without spectators",
    spectators: (v) => `<b>${v}</b> spectators`,
    unknown: "Attendance unknown",
    venueRecord: "Venue record",
    seasonHigh: "Season high",

    details: "Details",
    hideDetails: "Hide details",
    leagueAvg: "League average so far",
    vs: (year, avg) => `vs ${year} (${avg})`,
    played: (n) => `${n} ${n === 1 ? "match" : "matches"} played`,
    withoutData: (n) => `, ${n} without attendance data`,
    topCrowds: (year) => `Top crowds ${year} so far`,
    noCrowd: "no crowd",
    unknownShort: "unknown",
    recordBadge: "Record",
    highBadge: "High",
    venueUnknown: "Venue unknown",
    howToRead: "How to read",
    empty: "empty",
    soldOut: "sold out",
    legendHeight: (skyline) =>
      `Tower height is ${skyline ? "the season-to-date average at the venue" : "the attendance, fading in the days after the match"}.`,
    legendRest:
      "Color is how full the stadium was. The glass column around it is capacity, and the colored base is the home team. Arcs run from the away team's home ground. A hollow ring means no attendance figure.",
    sourceNote: (k, n, year) =>
      `${k} of ${n} matches in ${year} have attendance. Source: allsvenskan.se data feed, gaps filled from AllStat where available.`,

    history: (venue) => `${venue} attendance history`,
    close: "Close",
    capacityN: (v) => `capacity ${v}`,
    opened: (y) => `opened ${y}`,
    homeOf: (teams) => `Home of ${teams}`,
    capacityAxis: "capacity",
    readout: (avg, n, max) => `average ${avg} · ${n} ${n === 1 ? "match" : "matches"} · high ${max}`,
    readoutNone: "no Allsvenskan matches with attendance here",
    readoutHint: "Dots are matches, the line is the season average. Hover a season.",
  },
};

const DICTS: Record<Lang, Dict> = { sv, en };

function initial(): Lang {
  try {
    const s = localStorage.getItem("lang");
    if (s === "sv" || s === "en") return s;
  } catch {
    /* storage unavailable */
  }
  return "sv";
}

let current: Lang = initial();

/** Strings for the active language. Read at render time; App re-renders the tree on change. */
export let t: Dict = DICTS[current];

export function lang(): Lang {
  return current;
}

const listeners = new Set<() => void>();

export function setLang(l: Lang) {
  current = l;
  t = DICTS[l];
  document.documentElement.lang = l;
  try {
    localStorage.setItem("lang", l);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((f) => f());
}

export function useLang(): [Lang, (l: Lang) => void] {
  const [l, set] = useState(current);
  useEffect(() => {
    document.documentElement.lang = current;
    const on = () => set(current);
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return [l, setLang];
}
