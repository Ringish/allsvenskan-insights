import { useMemo, useRef, useState } from "react";
import type { MatchDay } from "../data/types";
import { fmtDate, fmtInt } from "../format";
import { t } from "../i18n";
import { SPEEDS, type Timeline as TL } from "./useTimeline";

interface Props {
  days: MatchDay[];
  timeline: TL;
  /** Value drawn as the waveform for each day (e.g. average attendance). null = no data. */
  value: (d: MatchDay) => number | null;
  valueLabel: string;
}

const H = 64;

/** Bottom scrubber. Equal width per match day, so off-seasons take no space. */
export function Timeline({ days, timeline, value, valueLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);
  const n = days.length;

  const { bars, max, seasons } = useMemo(() => {
    const vals = days.map(value);
    const max = Math.max(1, ...vals.map((v) => v ?? 0));
    const seasons: { year: number; from: number; to: number }[] = [];
    for (const d of days) {
      const s = seasons.at(-1);
      if (s && s.year === d.year) s.to = d.index;
      else seasons.push({ year: d.year, from: d.index, to: d.index });
    }
    return { bars: vals, max, seasons };
  }, [days, value]);

  // Waveform as two paths (played / upcoming), in a 0..n x 0..H viewBox.
  const [pastPath, futurePath, missingPath] = useMemo(() => {
    let past = "";
    let future = "";
    let missing = "";
    bars.forEach((v, i) => {
      if (v == null) {
        missing += `M${i + 0.5},${H - 2}v-2`;
        return;
      }
      const h = Math.max(1, (v / max) * (H - 14));
      const seg = `M${i + 0.5},${H}v${-h}`;
      if (i <= timeline.dayIndex) past += seg;
      else future += seg;
    });
    return [past, future, missing];
  }, [bars, max, timeline.dayIndex]);

  const indexAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * n)));
  };

  const onPointer = (e: React.PointerEvent) => {
    if (e.type === "pointerdown") {
      (e.target as Element).setPointerCapture(e.pointerId);
      timeline.setPlaying(false);
    }
    const i = indexAt(e.clientX);
    const r = ref.current!.getBoundingClientRect();
    setHover({ i, x: e.clientX - r.left });
    if (e.buttons & 1) timeline.setDayIndex(i);
  };

  const pct = (i: number) => `${((i + 0.5) / n) * 100}%`;
  const hd = hover ? days[hover.i] : null;

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button
          className="play"
          onClick={() => {
            if (!timeline.playing && timeline.dayIndex >= n - 1) timeline.setDayIndex(0);
            timeline.setPlaying(!timeline.playing);
          }}
          aria-label={timeline.playing ? t.timeline.pause : t.timeline.play}
          title="Space"
        >
          {timeline.playing ? (
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
              <rect x="3" y="2" width="3.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
              <path d="M4 2.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 4 2.5z" />
            </svg>
          )}
        </button>
        <div className="speeds" role="radiogroup" aria-label={t.timeline.speed}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={timeline.speed === s}
              className={timeline.speed === s ? "on" : ""}
              onClick={() => timeline.setSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>
        <div className="timeline-date">
          <span className="date">{fmtDate(timeline.day.day)}</span>
          <span className="hint">{t.timeline.hint}</span>
        </div>
      </div>

      <div
        className="track"
        ref={ref}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerLeave={() => setHover(null)}
        role="slider"
        tabIndex={0}
        aria-label={t.timeline.label}
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={timeline.dayIndex}
        aria-valuetext={fmtDate(timeline.day.day)}
      >
        <svg viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none" className="wave" aria-hidden>
          {seasons.map((s, k) => (
            <rect
              key={s.year}
              x={s.from}
              y={0}
              width={s.to - s.from + 1}
              height={H}
              className={k % 2 ? "band odd" : "band"}
            />
          ))}
          <path d={futurePath} className="bar future" vectorEffect="non-scaling-stroke" />
          <path d={pastPath} className="bar past" vectorEffect="non-scaling-stroke" />
          <path d={missingPath} className="bar missing" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="season-labels" aria-hidden>
          {seasons.map((s) => (
            <span key={s.year} style={{ left: pct((s.from + s.to) / 2) }}>
              {s.year % 5 === 0 || s.year === seasons[0].year || s.year === seasons.at(-1)!.year
                ? s.year
                : `’${String(s.year).slice(2)}`}
            </span>
          ))}
        </div>
        <div className="handle" style={{ left: pct(timeline.dayIndex) }} />
        {hover && hd && (
          <div className="track-tip" style={{ left: hover.x }}>
            <b>{fmtDate(hd.day)}</b>
            <span>
              {t.timeline.matches(hd.matches.length)} · {valueLabel}{" "}
              {bars[hover.i] == null ? t.timeline.missing : fmtInt(bars[hover.i]!)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
