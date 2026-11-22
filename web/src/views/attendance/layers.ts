import { ArcLayer, ColumnLayer, GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { AttendanceModel } from "../../data/attendance";
import type { Dataset, Match, Venue } from "../../data/types";
import { LAND_H, neighbours, sweden } from "../../map/basemap";
import { fmtInt } from "../../format";
import { t } from "../../i18n";
import { hex, rampColor, type RGB, type SceneTheme } from "../../theme";
import type { VenueState } from "../../data/attendance";

// Meters of tower per spectator: 50,000 -> 250 km.
export const METERS_PER_SPECTATOR = 5;
const TOWER_RADIUS = 9000;
const RING_RADIUS = 12500;
const SOLD_OUT = 0.95;

export interface Tower extends VenueState {
  venue: Venue;
  fill: number | null;
  height: number;
  /** Venue not in play at this moment; kept so array indices stay stable for transitions. */
  absent: boolean;
  /** Has a positive attendance to draw. */
  known: boolean;
}

/** One entry per venue in a fixed order, so deck.gl attribute transitions morph the right tower. */
export function towersFor(states: VenueState[], venueOrder: Venue[]): Tower[] {
  const byId = new Map(states.map((s) => [s.venueId, s]));
  return venueOrder.map((venue) => {
    const s = byId.get(venue.id);
    if (!s) {
      return {
        venueId: venue.id, value: null, presence: 0, match: null, count: 0, homeTeam: null,
        closedDoors: false, missing: false, venue, fill: null, height: 0, absent: true, known: false,
      };
    }
    const known = !s.missing && !s.closedDoors && (s.value ?? 0) > 0;
    const fill = known && venue.capacity ? s.value! / venue.capacity : null;
    const height = known ? s.value! * METERS_PER_SPECTATOR * s.presence : 0;
    return { ...s, venue, fill, height, absent: false, known };
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
  /** World -> screen projection for the current camera, used to declutter labels. */
  project?: (p: [number, number, number]) => number[];
}

const pos = (v: Venue, z: number): [number, number, number] => [v.lon, v.lat, z];

export function buildLayers(a: Args): Layer[] {
  const { theme, towers, data, scale: k } = a;
  const ground = LAND_H * k;
  const known = towers.filter((t) => t.known).sort((x, y) => y.height - x.height);
  const empty = towers.filter((t) => !t.absent && (t.missing || t.closedDoors));
  const colorOf = (t: Tower): RGB =>
    t.fill == null ? rampColor(theme.fillRamp, 0.5) : rampColor(theme.fillRamp, t.fill / SOLD_OUT);

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
      getPosition: (t) => pos(t.venue, ground),
      getElevation: 900,
      getFillColor: (t) => {
        const c = data.teams.get(t.homeTeam ?? "")?.color;
        return [...(c ? hex(c) : theme.arc), 255 * Math.max(0.35, t.presence)];
      },
      updateTriggers: { getFillColor: [theme.mode] },
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
      getPosition: (t) => pos(t.venue, ground),
      getElevation: (t) => t.height,
      getFillColor: (t) => {
        const c = colorOf(t);
        if (!t.known) return [...c, 0];
        return t.venue.id === a.selected ? [...theme.flare, 255] : [...c, 120 + 135 * t.presence];
      },
      material: { ambient: 0.55, diffuse: 0.65, shininess: 40, specularColor: [90, 90, 90] },
      updateTriggers: { getFillColor: [a.selected, theme.mode] },
      transitions: { getElevation: { duration: 450, easing: easeOut }, getFillColor: 300 },
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
      getPosition: (t) => pos(t.venue, ground + 1000 * k),
      getLineColor: theme.missing,
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
        getPosition: (t) => pos(t.venue, ground),
        getElevation: (t) => (t.known && t.venue.capacity ? t.venue.capacity * METERS_PER_SPECTATOR * t.presence : 0),
        getFillColor: (t) => {
          const [r, g, b, al] = theme.ghost;
          if (!t.known || !t.venue.capacity) return [r, g, b, 0];
          // A sold-out tower makes its ghost glow.
          return (t.fill ?? 0) >= SOLD_OUT ? [...theme.flare, 70 + 50 * a.pulse] : [r, g, b, al * t.presence];
        },
        getLineColor: (t) => [...hex(theme.fillRamp[theme.fillRamp.length - 1]), t.known ? 90 * t.presence : 0],
        material: false,
        // Glass: drawn after the towers and without depth writes so towers show through.
        parameters: { depthWriteEnabled: false },
        updateTriggers: { getFillColor: [a.pulse, theme.mode], getLineColor: [theme.mode], getPosition: [k] },
        transitions: { getElevation: 500 },
      }),
    );
  }

  if (a.showArcs && a.todays.length) {
    const homes = data.homes.get(a.year);
    const arcs = a.todays
      .map((m) => {
        const to = m.venue ? data.venues.get(m.venue) : undefined;
        const fromId = homes?.get(m.away);
        const from = fromId ? data.venues.get(fromId) : undefined;
        return to && from && from.id !== to.id ? { m, from, to } : null;
      })
      .filter((x) => x != null);
    layers.push(
      new ArcLayer<(typeof arcs)[number]>({
        id: "arcs",
        data: arcs,
        getSourcePosition: (d) => pos(d.from, ground + 500 * k),
        getTargetPosition: (d) => pos(d.to, ground + 500 * k),
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
    .filter((m) => a.model.records.has(m.id) && m.venue && data.venues.has(m.venue))
    .map((m) => ({ m, v: data.venues.get(m.venue!)!, kind: a.model.records.get(m.id)! }));
  if (flares.length) {
    layers.push(
      new ColumnLayer<(typeof flares)[number]>({
        id: "flares",
        data: flares,
        diskResolution: 12,
        radius: 1400 * Math.max(k, 0.3),
        elevationScale: k,
        extruded: true,
        getPosition: (d) => pos(d.v, ground),
        getElevation: (d) => (d.m.att ?? 0) * METERS_PER_SPECTATOR + 120_000,
        getFillColor: [...theme.flare, 110 + 120 * a.pulse],
        material: false,
        updateTriggers: { getFillColor: [a.pulse] },
      }),
    );
  }

  const candidates = [
    ...known.filter((t) => t.presence > 0.45).map((t) => ({
      text: `${data.teams.get(t.homeTeam ?? "")?.short_name ?? t.venue.name}\n${fmtInt(t.value!)}`,
      position: pos(t.venue, ground + (t.height + 12_000) * k),
      size: 13,
    })),
  ];
  const flareLabels = flares.map((f) => ({
      text: `${f.kind === "venue" ? t.att.venueRecord : t.att.seasonHigh} ${fmtInt(f.m.att!)}`,
      position: pos(f.v, ground + ((f.m.att ?? 0) * METERS_PER_SPECTATOR + 45_000) * k),
      size: 14,
    }));
  const labels = a.project ? declutter([...flareLabels, ...candidates], a.project) : [...flareLabels, ...candidates].slice(0, 8);
  layers.push(
    new TextLayer<(typeof labels)[number]>({
      id: "labels",
      data: labels,
      getText: (d) => d.text,
      getPosition: (d) => d.position,
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
function declutter<T extends { position: [number, number, number]; text: string }>(
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
    const box = { x: x - w / 2, y: y - h, w, h };
    if (kept.some((k) => box.x < k.x + k.w && k.x < box.x + box.w && box.y < k.y + k.h && k.y < box.y + box.h)) continue;
    kept.push(box);
    out.push(it);
    if (out.length >= max) break;
  }
  return out;
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3;
}
