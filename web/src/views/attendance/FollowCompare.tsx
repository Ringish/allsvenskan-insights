import { useMemo, useState } from "react";
import type { AttendanceModel, TeamSeason } from "../../data/attendance";
import type { Dataset } from "../../data/types";
import { fmtDate, fmtInt, fmtPct } from "../../format";
import { t } from "../../i18n";
import type { SceneTheme } from "../../theme";
import { Badge } from "./FollowPicker";

interface Props {
  data: Dataset;
  model: AttendanceModel;
  theme: SceneTheme;
  dayIndex: number;
  table: Map<string, TeamSeason>;
  followed: { id: string; slot: number }[];
  onSelectVenue: (id: string) => void;
}

const W = 300;
const H = 120;
const PAD = { l: 34, r: 8, t: 8, b: 6 };

/** Side-by-side season figures for followed teams, and their running home averages. */
export function FollowCompare({ data, model, theme, dayIndex, table, followed, onSelectVenue }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const year = data.days[dayIndex].year;
  const ranked = [...table.values()].filter((r) => r.rank != null).length;

  const { first, last, lines, max } = useMemo(() => {
    const first = data.days.findIndex((d) => d.year === year);
    let last = first;
    while (last + 1 < data.days.length && data.days[last + 1].year === year) last++;
    const lines = followed.map((f) => ({ ...f, points: model.running(f.id, year) }));
    const peak = Math.max(1000, ...lines.flatMap((l) => l.points.map((p) => p.average)));
    const step = peak > 20000 ? 10000 : peak > 5000 ? 5000 : 1000;
    return { first, last, lines, max: Math.ceil(peak / step) * step };
  }, [data.days, followed, model, year]);

  const x = (i: number) => PAD.l + ((i - first) / Math.max(1, last - first)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const cursor = hover ?? dayIndex;
  const valueAt = (points: { dayIndex: number; average: number }[], i: number) =>
    points.filter((p) => p.dayIndex <= i).at(-1)?.average ?? null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(first + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (last - first));
    setHover(Math.max(first, Math.min(dayIndex, i)));
  };

  return (
    <section className="compare">
      <h3>{t.att.followed}</h3>
      <table className="compare-table">
        <thead>
          <tr>
            <th />
            <th className="num">{t.att.colAvg}</th>
            <th className="num">{t.att.colRank}</th>
            <th className="num">{t.att.colFill}</th>
          </tr>
        </thead>
        <tbody>
          {followed.map(({ id, slot }) => {
            const tm = data.teams.get(id);
            if (!tm) return null;
            const row = table.get(id);
            const prev = model.seasonAverage(id, year - 1);
            const delta = row?.average != null && prev ? row.average / prev - 1 : null;
            return (
              <tr key={id} style={{ boxShadow: `inset 3px 0 0 ${theme.follow[slot]}` }}>
                <td>
                  <button className="team-cell" onClick={() => row?.venueId && onSelectVenue(row.venueId)} disabled={!row?.venueId}>
                    <Badge team={tm} size={22} />
                    <span>
                      <b>{tm.short_name}</b>
                      <small>
                        {!row
                          ? t.att.notInSeason(year)
                          : row.average == null
                            ? t.att.noHomeYet
                            : delta != null
                              ? `${delta >= 0 ? "▲" : "▼"} ${fmtPct(Math.abs(delta))} ${t.att.vs(year - 1, fmtInt(prev!))}`
                              : t.att.played(row.count)}
                      </small>
                    </span>
                  </button>
                </td>
                <td className="num strong">{row?.average != null ? fmtInt(row.average) : "–"}</td>
                <td className="num" title={row?.rank ? t.att.rankOf(row.rank, ranked) : undefined}>
                  {row?.rank ?? "–"}
                </td>
                <td className="num">{row?.fill != null ? fmtPct(row.fill) : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h4 className="chart-title">{t.att.runningTitle(year)}</h4>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="compare-chart"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={t.att.runningTitle(year)}
      >
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.l - 5} y={y(v) + 3} className="axis" textAnchor="end">
              {v >= 1000 ? `${Math.round(v / 1000)}k` : v}
            </text>
          </g>
        ))}
        <line x1={x(cursor)} x2={x(cursor)} y1={PAD.t} y2={H - PAD.b} className="now" />
        {lines.map((l) => {
          const pts = l.points.filter((p) => p.dayIndex <= dayIndex);
          if (!pts.length) return null;
          const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.dayIndex)},${y(p.average)}`).join("");
          const v = valueAt(l.points, cursor);
          return (
            <g key={l.id}>
              <path d={d} fill="none" stroke={theme.follow[l.slot]} strokeWidth={2} strokeLinejoin="round" />
              {v != null && (
                <circle cx={x(cursor)} cy={y(v)} r={4} fill={theme.follow[l.slot]} className="marker" />
              )}
            </g>
          );
        })}
      </svg>
      <div className="compare-readout">
        <b>{fmtDate(data.days[cursor].day)}</b>
        {lines.map((l) => {
          const v = valueAt(l.points, cursor);
          const tm = data.teams.get(l.id);
          return (
            <span key={l.id}>
              <i style={{ background: theme.follow[l.slot] }} />
              {tm?.short_name} {v != null ? fmtInt(v) : "–"}
            </span>
          );
        })}
      </div>
    </section>
  );
}
