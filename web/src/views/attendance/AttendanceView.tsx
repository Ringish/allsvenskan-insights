import { AmbientLight, DirectionalLight, LightingEffect, type PickingInfo, WebMercatorViewport } from "@deck.gl/core";
import DeckGL from "@deck.gl/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AttendanceModel } from "../../data/attendance";
import type { Dataset, MatchDay } from "../../data/types";
import { fmtInt, fmtPct } from "../../format";
import { PRESETS, type Preset, useCamera } from "../../map/useCamera";
import type { SceneTheme } from "../../theme";
import { Timeline } from "../../timeline/Timeline";
import { useTimeline } from "../../timeline/useTimeline";
import { buildLayers, type Tower, towersFor } from "./layers";
import { SidePanel } from "./SidePanel";
import { VenueHistory } from "./VenueHistory";

type Mode = "matchday" | "skyline";

const lighting = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.15 }),
  key: new DirectionalLight({ color: [255, 250, 240], intensity: 1.6, direction: [-3, -6, -8] }),
  fill: new DirectionalLight({ color: [180, 200, 255], intensity: 0.6, direction: [4, 3, -2] }),
});

function dayAverage(d: MatchDay): number | null {
  const known = d.matches.filter((m) => m.att != null && m.att > 0);
  return known.length ? known.reduce((s, m) => s + m.att!, 0) / known.length : null;
}

export default function AttendanceView({ data, theme }: { data: Dataset; theme: SceneTheme }) {
  const model = useMemo(() => new AttendanceModel(data), [data]);
  const venueOrder = useMemo(() => [...data.venues.values()].sort((a, b) => a.id.localeCompare(b.id)), [data]);
  const timeline = useTimeline(data.days);
  const [mode, setMode] = useState<Mode>("skyline");
  const [showGhosts, setShowGhosts] = useState(true);
  const [showArcs, setShowArcs] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const day = timeline.day;
  const states = mode === "matchday" ? model.matchDay(timeline.dayIndex) : model.skyline(timeline.dayIndex);
  const towers = towersFor(states, venueOrder);

  const biggest = day.matches.find((m) => m.venue && data.venues.has(m.venue) && (m.att ?? 0) > 0);
  const focusVenue = biggest ? data.venues.get(biggest.venue!)! : null;
  const camera = useCamera(timeline.playing, focusVenue ? [focusVenue.lon, focusVenue.lat] : null);

  // Pulse only animates while something on screen glows.
  const glowing =
    day.matches.some((m) => model.records.has(m.id)) || towers.some((t) => t.known && (t.fill ?? 0) >= 0.95);
  useEffect(() => {
    if (!glowing) return;
    let raf = 0;
    const tick = (now: number) => {
      setPulse(0.5 + 0.5 * Math.sin(now / 260));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [glowing]);

  const layers = buildLayers({
    data,
    model,
    theme,
    towers,
    todays: day.matches,
    year: day.year,
    selected,
    showGhosts,
    showArcs,
    pulse,
    scale: Math.min(1, Math.max(0.06, 2 ** ((5.35 - camera.viewState.zoom) * 0.85))),
    project: size.width
      ? (() => {
          const vp = new WebMercatorViewport({ ...camera.viewState, ...size });
          return (p: [number, number, number]) => vp.project(p);
        })()
      : undefined,
  });

  const selectVenue = useCallback(
    (id: string | null) => {
      setSelected(id);
      const v = id ? data.venues.get(id) : null;
      if (v) {
        camera.setAuto(false);
        camera.flyTo({ longitude: v.lon, latitude: v.lat - 0.06, zoom: 9.4, pitch: 58 });
      }
    },
    [camera, data.venues],
  );

  const tooltip = useCallback(
    ({ object }: PickingInfo<Tower>) => {
      if (!object?.venue) return null;
      const t = object;
      const team = data.teams.get(t.homeTeam ?? "")?.name ?? "";
      const m = t.match;
      const lines =
        mode === "skyline"
          ? [
              t.known ? `Season average <b>${fmtInt(t.value!)}</b> (${t.count} matches)` : "No attendance data",
              t.fill != null ? `${fmtPct(t.fill)} of capacity` : "",
            ]
          : [
              m ? `${data.teams.get(m.home)?.short_name} ${m.hg ?? ""}–${m.ag ?? ""} ${data.teams.get(m.away)?.short_name}` : "",
              t.closedDoors ? "Played without spectators" : t.known ? `<b>${fmtInt(t.value!)}</b> spectators` : "Attendance unknown",
              t.fill != null ? `${fmtPct(t.fill)} of capacity` : "",
            ];
      return {
        html: `<div class="tip-title">${t.venue.name}</div><div class="tip-sub">${team}</div>${lines
          .filter(Boolean)
          .map((l) => `<div>${l}</div>`)
          .join("")}`,
        className: "deck-tip",
        style: {},
      };
    },
    [data.teams, mode],
  );

  return (
    <div className="view">
      <div className="stage" ref={stageRef}>
        <DeckGL
          viewState={camera.viewState}
          onViewStateChange={camera.onViewStateChange as never}
          controller={{ dragRotate: true, touchRotate: true, inertia: 250 }}
          layers={layers}
          effects={[lighting]}
          getTooltip={tooltip as never}
          onClick={(info) => selectVenue((info.object as Tower | undefined)?.venue?.id ?? null)}
          style={{ background: `rgb(${theme.background.join(",")})` }}
        />

        <div className="map-controls">
          <div className="segmented" role="radiogroup" aria-label="Mode">
            {(
              [
                ["skyline", "Season skyline"],
                ["matchday", "Match day"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="radio" aria-checked={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="chips">
            <label className="chip">
              <input type="checkbox" checked={showGhosts} onChange={(e) => setShowGhosts(e.target.checked)} />
              Capacity
            </label>
            <label className="chip">
              <input type="checkbox" checked={showArcs} onChange={(e) => setShowArcs(e.target.checked)} />
              Away trips
            </label>
          </div>
          <div className="chips">
            {(Object.keys(PRESETS) as Preset[]).map((p) => (
              <button
                key={p}
                className="chip"
                onClick={() => {
                  camera.setAuto(false);
                  camera.flyTo(PRESETS[p]);
                }}
              >
                {p}
              </button>
            ))}
            <button
              className={`chip ${camera.auto ? "on" : ""}`}
              aria-pressed={camera.auto}
              onClick={() => camera.setAuto(!camera.auto)}
              title="Orbit and follow the biggest crowd while playing"
            >
              Auto camera
            </button>
          </div>
        </div>

        {day.year === 2020 && <div className="banner">2020: every match played without spectators</div>}

        {selected && data.venues.get(selected) && (
          <VenueHistory
            venue={data.venues.get(selected)!}
            matches={model.venueHistory(selected)}
            data={data}
            currentYear={day.year}
            onClose={() => setSelected(null)}
          />
        )}
      </div>

      <SidePanel data={data} model={model} timeline={timeline} theme={theme} mode={mode} onSelectVenue={selectVenue} />

      <Timeline days={data.days} timeline={timeline} value={dayAverage} valueLabel="avg crowd" />
    </div>
  );
}
