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
    hint: "← → steg · ⇧ säsong",
    stepBy: "Steg",
    round: "Omgång",
    day: "Dag",
    roundN: (n: number) => `Omgång ${n}`,
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
      `Tornets höjd är ${skyline ? "lagets publiksnitt hemma hittills i säsongen" : "publiken i lagets senaste hemmamatch, som klingar av dagarna efter"}.`,
    legendRest:
      "Färgen visar hur full arenan var och glaspelaren runt tornet är kapaciteten. Märket på toppen och den färgade basen visar laget. Bågarna går från bortalagets hemmaarena. En tom ring betyder att publiksiffra saknas.",
    sourceNote: (k: number, n: number, year: number) =>
      `${k} av ${n} matcher ${year} har publiksiffra. Källa: allsvenskan.se:s dataflöde, luckor fyllda från AllStat där det finns.`,

    history: (venue: string) => `Publikhistorik för ${venue}`,
    close: "Stäng",
    capacityN: (v: string) => `kapacitet ${v}`,
    opened: (y: number) => `invigd ${y}`,
    capacityAxis: "kapacitet",
    readout: (avg: string, n: number, max: string) => `snitt ${avg} · ${n} ${n === 1 ? "match" : "matcher"} · högst ${max}`,
    readoutNone: "inga allsvenska matcher med publiksiffra här",
    readoutHint: "Prickarna är matcher, linjen är säsongssnittet. Peka på en säsong.",

    follow: "Följ lag",
    followHint: "Välj upp till 4 lag att jämföra",
    clear: "Rensa",
    maxFollow: "Max 4 lag. Ta bort ett för att välja ett nytt.",
    unfollow: (name: string) => `Sluta följa ${name}`,
    followBtn: "Följ",
    following: "Följer",
    seasonTeams: (year: number) => `Lag ${year}`,
    otherTeams: "Övriga lag",
    followed: "Följda lag",
    colAvg: "Snitt",
    colRank: "Plac.",
    colFill: "Fyllnad",
    noHomeYet: "Ingen hemmamatch än",
    notInSeason: (year: number) => `Inte i Allsvenskan ${year}`,
    runningTitle: (year: number) => `Publiksnitt hemma ${year}, matchdag för matchdag`,
    rankOf: (r: number, n: number) => `${r} av ${n}`,
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
    hint: "← → step · ⇧ season",
    stepBy: "Step",
    round: "Round",
    day: "Day",
    roundN: (n) => `Round ${n}`,
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
      `Tower height is ${skyline ? "the team's home average so far this season" : "the crowd at the team's latest home match, fading in the days after"}.`,
    legendRest:
      "Color is how full the stadium was, and the glass column around it is capacity. The badge on top and the colored base show the team. Arcs run from the away team's home ground. A hollow ring means no attendance figure.",
    sourceNote: (k, n, year) =>
      `${k} of ${n} matches in ${year} have attendance. Source: allsvenskan.se data feed, gaps filled from AllStat where available.`,

    history: (venue) => `${venue} attendance history`,
    close: "Close",
    capacityN: (v) => `capacity ${v}`,
    opened: (y) => `opened ${y}`,
    capacityAxis: "capacity",
    readout: (avg, n, max) => `average ${avg} · ${n} ${n === 1 ? "match" : "matches"} · high ${max}`,
    readoutNone: "no Allsvenskan matches with attendance here",
    readoutHint: "Dots are matches, the line is the season average. Hover a season.",

    follow: "Follow teams",
    followHint: "Pick up to 4 teams to compare",
    clear: "Clear",
    maxFollow: "Up to 4 teams. Remove one to pick another.",
    unfollow: (name) => `Unfollow ${name}`,
    followBtn: "Follow",
    following: "Following",
    seasonTeams: (year) => `Teams ${year}`,
    otherTeams: "Other teams",
    followed: "Followed teams",
    colAvg: "Avg",
    colRank: "Rank",
    colFill: "Fill",
    noHomeYet: "No home match yet",
    notInSeason: (year) => `Not in Allsvenskan ${year}`,
    runningTitle: (year) => `Home average ${year}, match day by match day`,
    rankOf: (r, n) => `${r} of ${n}`,
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
