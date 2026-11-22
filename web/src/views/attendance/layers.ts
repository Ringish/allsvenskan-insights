import { ArcLayer, ColumnLayer, GeoJsonLayer, IconLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { AttendanceModel, TowerState } from "../../data/attendance";
import type { Dataset, Match, Team, Venue } from "../../data/types";
import { LAND_H, neighbours, sweden } from "../../map/basemap";
import { fmtInt } from "../../format";
import { t } from "../../i18n";
import { hex, rampColor, type RGB, type SceneTheme } from "../../theme";

// Meters of tower per spectator: 50,000 -> 250 km.
export const METERS_PER_SPECTATOR = 5;
const TOWER_RADIUS = 9000;
const RING_RADIUS = 12500;
const SOLD_OUT = 0.95;
// Alpha factor for teams that are not followed while some are.
const DIM = 0.25;

export interface Tower extends TowerState {
  team: Team;
  venue: Venue;
  /** Tower base, shifted sideways when teams share a venue. */
  lon: number;
  lat: number;
  fill: number | null;
  height: number;
  /** Team not in play at this moment; kept so array indices stay stable for transitions. */
  absent: boolean;
  /** Has a positive attendance to draw. */
  known: boolean;
  /** Slot in the follow list, or -1. */
  follow: number;
}

/**
 * One entry per team in a fixed order, so deck.gl attribute transitions morph the right tower.
 * `homeOf` places absent teams at their usual venue, so they fade in where they will appear.
 */
export function towersFor(
  states: TowerState[],
  teams: Team[],
  data: Dataset,
  homeOf: Map<string, string>,
  /** Followed team per color slot. */
  follow: (string | null)[],
  k: number,
): Tower[] {
  const byTeam = new Map(states.map((s) => [s.teamId, s]));
  const sharing = new Map<string, string[]>();
  for (const s of states) sharing.set(s.venueId, [...(sharing.get(s.venueId) ?? []), s.teamId].sort());
  const anyVenue = data.venues.values().next().value!;

  return teams.map((team) => {
    const s = byTeam.get(team.id);
    const venue = data.venues.get(s?.venueId ?? homeOf.get(team.id) ?? "") ?? anyVenue;
    // Teams sharing a venue stand side by side, east-west.
    const group = s ? sharing.get(s.venueId)! : [team.id];
    const shiftM = (group.indexOf(team.id) - (group.length - 1) / 2) * 2 * RING_RADIUS * k;
    const lon = venue.lon + shiftM / (111_320 * Math.cos((venue.lat * Math.PI) / 180));
    const base = { team, venue, lon, lat: venue.lat, follow: follow.indexOf(team.id) };
    if (!s) {
      return {
        ...base, teamId: team.id, venueId: venue.id, value: null, presence: 0, match: null, count: 0,
        closedDoors: false, missing: false, fill: null, height: 0, absent: true, known: false,
      };
    }
    const known = !s.missing && !s.closedDoors && (s.value ?? 0) > 0;
    const fill = known && venue.capacity ? s.value! / venue.capacity : null;
    const height = known ? s.value! * METERS_PER_SPECTATOR * s.presence : 0;
    return { ...s, ...base, fill, height, absent: false, known };
  });
}

interface Args {
  data: Dataset;
  model: AttendanceModel;
  theme: SceneTheme;
  towers: Tower[];
  todays: Match[];
  year: number;
  selected: string | null;
  showGhosts: boolean;
  showArcs: boolean;
  pulse: number;
  /** Size factor from zoom, so towers keep a readable size from country to city view. */
  scale: number;
  /** Base URL for team badge images. */
  assetBase: string;
  /** World -> screen projection for the current camera, used to declutter labels. */
  project?: (p: [number, number, number]) => number[];
}

const at = (t: Tower, z: number): [number, number, number] => [t.lon, t.lat, z];

// Placeholder icon for a team without a badge image (drawn fully transparent).
let blankUrl: string | null = null;
function blank(): string {
  if (blankUrl) return blankUrl;
  const c = document.createElement("canvas");
  c.width = c.height = 4;
  blankUrl = c.toDataURL();
  return blankUrl;
}

export function buildLayers(a: Args): Layer[] {
  const { theme, towers, data, scale: k } = a;
  const ground = LAND_H * k;
  const following = towers.some((t) => t.follow >= 0);
  // While following, other teams turn grey: tower, base and badge.
  const greyed = (t: Tower) => following && t.follow < 0;
  const focus = (t: Tower) => (greyed(t) ? DIM : 1);
  const followColor = (t: Tower): RGB => hex(theme.follow[t.follow]);
  const known = towers.filter((t) => t.known).sort((x, y) => y.height - x.height);
  const empty = towers.filter((t) => !t.absent && (t.missing || t.closedDoors));
  const byTeam = new Map(towers.map((t) => [t.teamId, t]));
  const colorOf = (t: Tower): RGB =>
    t.fill == null ? rampColor(theme.fillRamp, 0.5) : rampColor(theme.fillRamp, t.fill / SOLD_OUT);
  const followKey = towers.map((t) => t.follow).join();
  // Badge size in pixels grows as the camera moves in.
  const badgePx = (t: Tower) => 26 + 14 * (1 - k) + (t.follow >= 0 ? 8 : 0);
  const top = (t: Tower) => at(t, ground + t.height * k);

  const layers: Layer[] = [
    new GeoJsonLayer({
      id: "neighbours",
      data: neighbours,
      filled: true,
      stroked: false,
      getFillColor: theme.neighbour,
    }),
    new GeoJsonLayer({
      id: "sweden",
      data: sweden,
      filled: true,
      extruded: true,
      wireframe: false,
      getElevation: LAND_H,
      elevationScale: k,
      getFillColor: theme.land,
      material: { ambient: 0.35, diffuse: 0.35, shininess: 4, specularColor: [20, 20, 20] },
    }),
    new GeoJsonLayer({
      id: "sweden-edge",
      data: sweden,
      filled: false,
      stroked: true,
      getLineColor: theme.border,
      lineWidthMinPixels: 1,
      // Draw the coastline on top of the slab.
      getElevation: LAND_H,
      elevationScale: k,
      parameters: { depthCompare: "always" },
    }),
  ];

  layers.push(
    new ColumnLayer<Tower>({
      id: "team-ring",
      data: towers.filter((t) => !t.absent),
      diskResolution: 6,
      radius: RING_RADIUS * k,
      elevationScale: k,
      extruded: true,
      getPosition: (t) => at(t, ground),
      getElevation: (t) => (t.follow >= 0 ? 2400 : 900),
      getFillColor: (t) => {
        if (t.follow >= 0) return [...followColor(t), 255];
        if (greyed(t)) return [...theme.muted, 70];
        const c = t.team.color;
        return [...(c ? hex(c) : theme.arc), 255 * Math.max(0.35, t.presence)];
      },
      updateTriggers: { getFillColor: [theme.mode, followKey], getElevation: [followKey] },
    }),
    new ColumnLayer<Tower>({
      id: "towers",
      data: towers,
      diskResolution: 6,
      radius: TOWER_RADIUS * k,
      elevationScale: k,
      extruded: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [...theme.flare, 255],
      getPosition: (t) => at(t, ground),
      getElevation: (t) => t.height,
      getFillColor: (t) => {
        const c = colorOf(t);
        if (!t.known) return [...c, 0];
        if (t.venue.id === a.selected) return [...theme.flare, 255];
        return greyed(t) ? [...theme.muted, 45 + 60 * t.presence] : [...c, 120 + 135 * t.presence];
      },
      material: { ambient: 0.55, diffuse: 0.65, shininess: 40, specularColor: [90, 90, 90] },
      updateTriggers: { getFillColor: [a.selected, theme.mode, followKey], getPosition: [k] },
      // Heights are tweened by the view, so badges and labels move with the tower tops.
      transitions: { getFillColor: 300 },
    }),
    new ScatterplotLayer<Tower>({
      id: "empty",
      data: empty,
      pickable: true,
      stroked: true,
      filled: false,
      radiusUnits: "meters",
      getRadius: TOWER_RADIUS * k,
      lineWidthMinPixels: 1.5,
      getPosition: (t) => at(t, ground + 1000 * k),
      getLineColor: (t) => [...(theme.missing.slice(0, 3) as RGB), theme.missing[3] * focus(t)],
      updateTriggers: { getLineColor: [theme.mode, followKey] },
    }),
  );

  if (a.showGhosts) {
    layers.push(
      new ColumnLayer<Tower>({
        id: "capacity-ghost",
        data: towers,
        diskResolution: 6,
        radius: TOWER_RADIUS * 1.18 * k,
        elevationScale: k,
        extruded: true,
        wireframe: true,
        getPosition: (t) => at(t, ground),
        getElevation: (t) => (t.known && t.venue.capacity ? t.venue.capacity * METERS_PER_SPECTATOR * t.presence : 0),
        getFillColor: (t) => {
          const [r, g, b, al] = theme.ghost;
          if (!t.known || !t.venue.capacity) return [r, g, b, 0];
          // A sold-out tower makes its ghost glow.
          return (t.fill ?? 0) >= SOLD_OUT
            ? [...theme.flare, (70 + 50 * a.pulse) * focus(t)]
            : [r, g, b, al * t.presence * focus(t)];
        },
        getLineColor: (t) => [
          ...hex(theme.fillRamp[theme.fillRamp.length - 1]),
          t.known ? 90 * t.presence * focus(t) : 0,
        ],
        material: false,
        // Glass: drawn after the towers and without depth writes so towers show through.
        parameters: { depthWriteEnabled: false },
        updateTriggers: {
          getFillColor: [a.pulse, theme.mode, followKey],
          getLineColor: [theme.mode, followKey],
          getPosition: [k],
        },
        transitions: { getElevation: 500 },
      }),
    );
  }

  if (a.showArcs && a.todays.length) {
    const homes = data.homes.get(a.year);
    const arcs = a.todays
      .filter((m) => !following || byTeam.get(m.home)!.follow >= 0 || (byTeam.get(m.away)?.follow ?? -1) >= 0)
      .map((m) => {
        const to = byTeam.get(m.home);
        const away = byTeam.get(m.away);
        const fromVenue = data.venues.get(homes?.get(m.away) ?? "");
        const from: [number, number] | null =
          away && !away.absent ? [away.lon, away.lat] : fromVenue ? [fromVenue.lon, fromVenue.lat] : null;
        return to && !to.absent && from && (from[0] !== to.lon || from[1] !== to.lat) ? { m, from, to } : null;
      })
      .filter((x) => x != null);
    layers.push(
      new ArcLayer<(typeof arcs)[number]>({
        id: "arcs",
        data: arcs,
        getSourcePosition: (d) => [d.from[0], d.from[1], ground + 500 * k],
        getTargetPosition: (d) => at(d.to, ground + 500 * k),
        getSourceColor: [...theme.arc, 20],
        getTargetColor: [...theme.arc, 150],
        getWidth: (d) => 1 + Math.sqrt(d.m.att ?? 0) / 60,
        getHeight: 0.35,
        widthUnits: "pixels",
      }),
    );
  }

  // Record flares: a beam of light above the tower on the day a record falls.
  const flares = a.todays
    .filter((m) => a.model.records.has(m.id) && byTeam.get(m.home) && !byTeam.get(m.home)!.absent)
    .map((m) => ({ m, tw: byTeam.get(m.home)!, kind: a.model.records.get(m.id)! }));
  if (flares.length) {
    layers.push(
      new ColumnLayer<(typeof flares)[number]>({
        id: "flares",
        data: flares,
        diskResolution: 12,
        radius: 1400 * Math.max(k, 0.3),
        elevationScale: k,
        extruded: true,
        getPosition: (d) => at(d.tw, ground),
        getElevation: (d) => (d.m.att ?? 0) * METERS_PER_SPECTATOR + 120_000,
        getFillColor: (d) => [...theme.flare, (110 + 120 * a.pulse) * focus(d.tw)],
        material: false,
        updateTriggers: { getFillColor: [a.pulse, followKey] },
      }),
    );
  }

  // Team badges on top of the towers. Teams not followed use a pre-faded copy of their badge.
  const badgeAlpha = (t: Tower) => (t.absent || !t.team.logo ? 0 : 255 * Math.min(1, 0.25 + t.presence));
  layers.push(
    new IconLayer<Tower>({
      id: "badges",
      data: towers,
      pickable: true,
      getIcon: (t) => {
        if (!t.team.logo) return { id: "blank", url: blank(), width: 4, height: 4 };
        const faded = greyed(t);
        const url = a.assetBase + (faded ? t.team.logo.replace(/\.png$/, "-faded.png") : t.team.logo);
        return { id: faded ? `${t.teamId}-faded` : t.teamId, url, width: 128, height: 128 };
      },
      getPosition: top,
      getPixelOffset: (t) => [0, -(badgePx(t) / 2 + 3)],
      getSize: badgePx,
      sizeUnits: "pixels",
      getColor: (t) => [255, 255, 255, badgeAlpha(t)],
      billboard: true,
      alphaCutoff: 0.02,
      parameters: { depthCompare: "always" },
      updateTriggers: {
        getIcon: [followKey],
        getColor: [followKey],
        getSize: [k, followKey],
        getPixelOffset: [k, followKey],
      },
    }),
  );

  // Numbers above the badges. While following, only followed teams are labeled.
  const candidates = known
    .filter((t) => t.presence > 0.45 && (!following || t.follow >= 0))
    .sort((x, y) => (y.follow >= 0 ? 1 : 0) - (x.follow >= 0 ? 1 : 0))
    .map((t) => ({
      text: fmtInt(t.value!),
      position: top(t),
      offset: badgePx(t) + 6,
      size: t.follow >= 0 ? 15 : 13,
      keep: t.follow >= 0,
    }));
  const flareLabels = flares.map((f) => ({
    text: `${f.kind === "venue" ? t.att.venueRecord : t.att.seasonHigh} ${fmtInt(f.m.att!)}`,
    position: at(f.tw, ground + ((f.m.att ?? 0) * METERS_PER_SPECTATOR + 45_000) * k),
    offset: 0,
    size: 14,
    keep: false,
  }));
  const all = [...flareLabels, ...candidates];
  const labels = a.project ? declutter(all, a.project) : all.slice(0, 8);
  layers.push(
    new TextLayer<(typeof labels)[number]>({
      id: "labels",
      data: labels,
      getText: (d) => d.text,
      getPosition: (d) => d.position,
      getPixelOffset: (d) => [0, -d.offset],
      getSize: (d) => d.size,
      getColor: theme.label,
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: 600,
      lineHeight: 1.15,
      billboard: true,
      getTextAnchor: "middle",
      getAlignmentBaseline: "bottom",
      fontSettings: { sdf: true, fontSize: 64, buffer: 6 },
      outlineWidth: 3,
      outlineColor: theme.labelHalo,
      characterSet: "auto",
      parameters: { depthCompare: "always" },
      updateTriggers: { getColor: [theme.mode] },
    }),
  );

  return layers;
}

/** Greedy label placement in priority order: skip any label whose box overlaps one already kept. */
function declutter<T extends { position: [number, number, number]; text: string; offset: number; keep: boolean }>(
  items: T[],
  project: (p: [number, number, number]) => number[],
  max = 12,
): T[] {
  const kept: { x: number; y: number; w: number; h: number }[] = [];
  const out: T[] = [];
  for (const it of items) {
    const [x, y] = project(it.position);
    const lines = it.text.split("\n");
    const w = Math.max(...lines.map((l) => l.length)) * 7.5 + 8;
    const h = lines.length * 16 + 4;
    const box = { x: x - w / 2, y: y - it.offset - h, w, h };
    const hit = kept.some((k) => box.x < k.x + k.w && k.x < box.x + box.w && box.y < k.y + k.h && k.y < box.y + box.h);
    if (hit && !it.keep) continue;
    kept.push(box);
    out.push(it);
    if (out.length >= max) break;
  }
  return out;
}
