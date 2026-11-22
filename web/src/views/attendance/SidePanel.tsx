import { useState } from "react";
import type { AttendanceModel } from "../../data/attendance";
import type { Dataset, Match } from "../../data/types";
import { fmtDate, fmtInt, fmtPct } from "../../format";
import { t } from "../../i18n";
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
          {m.attSrc === "closed-doors" ? t.att.noCrowd : m.att == null ? t.att.unknownShort : fmtInt(m.att)}
          {model.records.has(m.id) && (
            <span className="record" title={model.records.get(m.id) === "venue" ? t.att.venueRecord : t.att.seasonHigh}>
              {model.records.get(m.id) === "venue" ? t.att.recordBadge : t.att.highBadge}
            </span>
          )}
        </span>
        <span className="where">
          {withDate ? `${fmtDate(m.day)} · ` : ""}
          {m.venue ? data.venues.get(m.venue)?.name : t.att.venueUnknown}
        </span>
      </button>
    </li>
  );

  return (
    <aside className={`panel ${open ? "open" : ""}`}>
      <button className="panel-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? t.att.hideDetails : t.att.details}
      </button>
      <div className="panel-body">
        <div className="eyebrow">Allsvenskan {day.year}</div>
        <div className="hero">
          <div className="hero-label">{t.att.leagueAvg}</div>
          <div className="hero-value">{soFar.average != null ? fmtInt(soFar.average) : "–"}</div>
          {delta != null && (
            <div className={`delta ${delta >= 0 ? "up" : "down"}`}>
              {delta >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(delta))} {t.att.vs(day.year - 1, fmtInt(prev!.average!))}
            </div>
          )}
          <div className="hero-sub">
            {t.att.played(soFar.matches)}
            {soFar.known < soFar.matches && soFar.year !== 2020 ? t.att.withoutData(soFar.matches - soFar.known) : ""}
          </div>
        </div>

        <section>
          <h3>{fmtDate(day.day)}</h3>
          <ul className="matches">{day.matches.map((m) => matchRow(m))}</ul>
        </section>

        <section>
          <h3>{t.att.topCrowds(day.year)}</h3>
          <ol className="matches top">{soFar.top.map((m) => matchRow(m, true))}</ol>
        </section>

        <section className="legend">
          <h3>{t.att.howToRead}</h3>
          <div className="legend-row">
            <span className="ramp" style={{ background: `linear-gradient(90deg, ${theme.fillRamp.join(",")})` }} />
            <span className="ramp-labels">
              <span>{t.att.empty}</span>
              <span>{t.att.soldOut}</span>
            </span>
          </div>
          <p>
            {t.att.legendHeight(mode === "skyline")} {t.att.legendRest}
          </p>
        </section>

        {seasonMeta && (
          <p className="source">
            {t.att.sourceNote(seasonMeta.withAttendance, seasonMeta.matches, day.year)}
          </p>
        )}
      </div>
    </aside>
  );
}
