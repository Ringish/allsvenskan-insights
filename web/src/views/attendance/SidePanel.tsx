import { useState } from "react";
import type { AttendanceModel } from "../../data/attendance";
import type { Dataset, Match } from "../../data/types";
import { fmtDate, fmtInt } from "../../format";
import type { SceneTheme } from "../../theme";
import type { Timeline } from "../../timeline/useTimeline";

interface Props {
  data: Dataset;
  model: AttendanceModel;
  timeline: Timeline;
  theme: SceneTheme;
  mode: "matchday" | "skyline";
  onSelectVenue: (id: string) => void;
}

export function SidePanel({ data, model, timeline, theme, mode, onSelectVenue }: Props) {
  // Collapsed by default on phones, where it overlays the map.
  const [open, setOpen] = useState(() => !matchMedia("(max-width: 760px)").matches);
  const day = timeline.day;
  const soFar = model.seasonSoFar(timeline.dayIndex);
  const seasonMeta = data.meta.seasons.find((s) => s.year === day.year);
  const prev = data.meta.seasons.find((s) => s.year === day.year - 1);
  const delta = soFar.average != null && prev?.average ? soFar.average / prev.average - 1 : null;
  const team = (id: string) => data.teams.get(id)?.short_name ?? id;

  const matchRow = (m: Match, withDate = false) => (
    <li key={m.id}>
      <button className="match" onClick={() => m.venue && onSelectVenue(m.venue)} disabled={!m.venue}>
        <span className="teams">
          {team(m.home)} <span className="score">{m.hg ?? "–"}–{m.ag ?? "–"}</span> {team(m.away)}
        </span>
        <span className="att">
          {m.attSrc === "closed-doors" ? "no crowd" : m.att == null ? "unknown" : fmtInt(m.att)}
          {model.records.has(m.id) && (
            <span className="record" title={model.records.get(m.id) === "venue" ? "Venue record" : "Season high"}>
              {model.records.get(m.id) === "venue" ? "Record" : "High"}
            </span>
          )}
        </span>
        <span className="where">
          {withDate ? `${fmtDate(m.day)} · ` : ""}
          {m.venue ? data.venues.get(m.venue)?.name : "Venue unknown"}
        </span>
      </button>
    </li>
  );

  return (
    <aside className={`panel ${open ? "open" : ""}`}>
      <button className="panel-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide details" : "Details"}
      </button>
      <div className="panel-body">
        <div className="eyebrow">Allsvenskan {day.year}</div>
        <div className="hero">
          <div className="hero-label">League average so far</div>
          <div className="hero-value">{soFar.average != null ? fmtInt(soFar.average) : "–"}</div>
          {delta != null && (
            <div className={`delta ${delta >= 0 ? "up" : "down"}`}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}% vs {day.year - 1} ({fmtInt(prev!.average!)})
            </div>
          )}
          <div className="hero-sub">
            {soFar.matches} matches played
            {soFar.known < soFar.matches && soFar.year !== 2020 ? `, ${soFar.matches - soFar.known} without attendance data` : ""}
          </div>
        </div>

        <section>
          <h3>{fmtDate(day.day)}</h3>
          <ul className="matches">{day.matches.map((m) => matchRow(m))}</ul>
        </section>

        <section>
          <h3>Top crowds {day.year} so far</h3>
          <ol className="matches top">{soFar.top.map((m) => matchRow(m, true))}</ol>
        </section>

        <section className="legend">
          <h3>How to read</h3>
          <div className="legend-row">
            <span className="ramp" style={{ background: `linear-gradient(90deg, ${theme.fillRamp.join(",")})` }} />
            <span className="ramp-labels">
              <span>empty</span>
              <span>sold out</span>
            </span>
          </div>
          <p>
            Tower height is {mode === "skyline" ? "the season-to-date average at the venue" : "the attendance, fading in the days after the match"}.
            Color is how full the stadium was. The glass column around it is capacity, and the colored base is the home team.
            Arcs run from the away team's home ground. A hollow ring means no attendance figure.
          </p>
        </section>

        {seasonMeta && (
          <p className="source">
            {seasonMeta.withAttendance} of {seasonMeta.matches} matches in {day.year} have attendance. Source: allsvenskan.se data
            feed, gaps filled from AllStat where available.
          </p>
        )}
      </div>
    </aside>
  );
}
