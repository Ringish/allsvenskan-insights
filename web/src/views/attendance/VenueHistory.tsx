import { useMemo, useState } from "react";
import type { Dataset, Match, Venue } from "../../data/types";
import { fmtInt } from "../../format";
import { t } from "../../i18n";
import type { SceneTheme } from "../../theme";
import { Badge } from "./FollowPicker";

interface Props {
  venue: Venue;
  matches: Match[];
  data: Dataset;
  currentYear: number;
  theme: SceneTheme;
  slots: (string | null)[];
  onToggleFollow: (team: string) => void;
  onClose: () => void;
}

const W = 360;
const H = 170;
const PAD = { l: 40, r: 10, t: 12, b: 22 };

/** Every Allsvenskan match at a venue (dots) with the season average (line). */
export function VenueHistory({ venue, matches, data, currentYear, theme, slots, onToggleFollow, onClose }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const years = data.meta.seasons.map((s) => s.year);
  const y0 = years[0];
  const y1 = years.at(-1)!;

  const { seasons, max, teams } = useMemo(() => {
    const by = new Map<number, number[]>();
    const teams = new Set<string>();
    for (const m of matches) {
      teams.add(m.home);
      if (m.att != null && m.att > 0) by.set(m.year, [...(by.get(m.year) ?? []), m.att]);
    }
    const seasons = [...by.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, v]) => ({ year, avg: v.reduce((s, x) => s + x, 0) / v.length, n: v.length, max: Math.max(...v) }));
    const max = Math.max(venue.capacity ?? 0, ...matches.map((m) => m.att ?? 0), 1000);
    return { seasons, max: niceMax(max), teams: [...teams] };
  }, [matches, venue.capacity]);

  const x = (year: number, frac = 0.5) => PAD.l + ((year - y0 + frac) / (y1 - y0 + 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const line = seasons.map((s, i) => `${i && seasons[i - 1].year === s.year - 1 ? "L" : "M"}${x(s.year)},${y(s.avg)}`).join("");
  const hs = hover != null ? seasons.find((s) => s.year === hover) : null;
  const ticks = [0, max / 2, max];

  return (
    <div className="venue-card" role="dialog" aria-label={t.att.history(venue.name)}>
      <button className="close" onClick={onClose} aria-label={t.att.close}>
        ×
      </button>
      <div className="tip-title">{venue.name}</div>
      <div className="tip-sub">
        {[venue.city, venue.capacity ? t.att.capacityN(fmtInt(venue.capacity)) : null, venue.opened ? t.att.opened(venue.opened) : null]
          .filter(Boolean)
          .join(" · ")}
      </div>
      <div className="venue-teams">
        {teams.map((id) => {
          const tm = data.teams.get(id);
          if (!tm) return null;
          const slot = slots.indexOf(id);
          const full = slot < 0 && !slots.includes(null);
          return (
            <button
              key={id}
              className={`chip ${slot >= 0 ? "on" : ""}`}
              aria-pressed={slot >= 0}
              disabled={full}
              title={full ? t.att.maxFollow : undefined}
              style={slot >= 0 ? { boxShadow: `inset 3px 0 0 ${theme.follow[slot]}` } : undefined}
              onClick={() => onToggleFollow(id)}
            >
              <Badge team={tm} size={18} />
              {tm.short_name} · {slot >= 0 ? t.att.following : t.att.followBtn}
            </button>
          );
        })}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="venue-chart" onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.l - 6} y={y(t) + 3} className="axis" textAnchor="end">
              {t >= 1000 ? `${Math.round(t / 1000)}k` : t}
            </text>
          </g>
        ))}
        {[y0, 2010, 2020, y1].filter((v, i, a) => a.indexOf(v) === i && v >= y0 && v <= y1).map((yr) => (
          <text key={yr} x={x(yr)} y={H - 6} className="axis" textAnchor="middle">
            {yr}
          </text>
        ))}
        <line x1={x(currentYear, 0)} x2={x(currentYear, 0)} y1={PAD.t} y2={H - PAD.b} className="now" />
        {venue.capacity && (
          <>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(venue.capacity)} y2={y(venue.capacity)} className="capacity" />
            <text x={W - PAD.r} y={y(venue.capacity) - 4} className="axis" textAnchor="end">
              {t.att.capacityAxis}
            </text>
          </>
        )}
        {matches
          .filter((m) => m.att != null && m.att > 0)
          .map((m) => {
            const doy = (m.kickoff.getTime() - Date.UTC(m.year, 2, 1)) / (86_400_000 * 275);
            return <circle key={m.id} cx={x(m.year, Math.min(0.95, Math.max(0.05, doy)))} cy={y(m.att!)} r={2} className="dot" />;
          })}
        <path d={line} className="avg" />
        {seasons.map((s) => (
          <circle key={s.year} cx={x(s.year)} cy={y(s.avg)} r={hover === s.year ? 5 : 3} className="avg-dot" />
        ))}
        {years.map((yr) => (
          <rect
            key={yr}
            x={x(yr, 0)}
            width={x(yr, 1) - x(yr, 0)}
            y={PAD.t}
            height={H - PAD.t - PAD.b}
            className="hit"
            onPointerEnter={() => setHover(yr)}
          />
        ))}
      </svg>
      <div className="venue-readout">
        {hs ? (
          <>
            <b>{hs.year}</b> {t.att.readout(fmtInt(hs.avg), hs.n, fmtInt(hs.max))}
          </>
        ) : hover != null ? (
          <>
            <b>{hover}</b> {t.att.readoutNone}
          </>
        ) : (
          <>{t.att.readoutHint}</>
        )}
      </div>
    </div>
  );
}

function niceMax(v: number) {
  const step = v > 20000 ? 10000 : v > 5000 ? 5000 : 1000;
  return Math.ceil(v / step) * step;
}
