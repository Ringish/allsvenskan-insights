import { useEffect, useRef, useState } from "react";
import type { Dataset, Team } from "../../data/types";
import { t } from "../../i18n";
import type { SceneTheme } from "../../theme";
import type { useFollow } from "./useFollow";

interface Props {
  data: Dataset;
  theme: SceneTheme;
  year: number;
  /** Teams with matches in `year`, listed first. */
  seasonTeams: Set<string>;
  follow: ReturnType<typeof useFollow>;
}

export function Badge({ team, size = 20 }: { team: Team; size?: number }) {
  return team.logo ? (
    <img className="badge" src={import.meta.env.BASE_URL + team.logo} width={size} height={size} alt="" />
  ) : (
    <span className="badge" style={{ width: size, height: size, background: team.color ?? undefined }} />
  );
}

/** Followed-team chips plus a popover to pick teams. */
export function FollowPicker({ data, theme, year, seasonTeams, follow }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const all = [...data.teams.values()].sort((a, b) => a.short_name.localeCompare(b.short_name, "sv"));
  const inSeason = all.filter((tm) => seasonTeams.has(tm.id));
  const others = all.filter((tm) => !seasonTeams.has(tm.id));
  const slotOf = (id: string) => follow.slots.indexOf(id);

  const option = (tm: Team) => {
    const slot = slotOf(tm.id);
    const on = slot >= 0;
    return (
      <button
        key={tm.id}
        className={`team-option ${on ? "on" : ""}`}
        aria-pressed={on}
        disabled={!on && follow.full}
        onClick={() => follow.toggle(tm.id)}
        style={on ? { borderColor: theme.follow[slot] } : undefined}
      >
        <Badge team={tm} size={22} />
        <span>{tm.short_name}</span>
        {on && <span className="slot-dot" style={{ background: theme.follow[slot] }} />}
      </button>
    );
  };

  return (
    <div className="follow" ref={ref}>
      <div className="chips">
        <button className={`chip ${open ? "on" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {t.att.follow}
          {follow.followed.length > 0 && <span className="count">{follow.followed.length}</span>}
        </button>
        {follow.followed.map(({ id, slot }) => {
          const tm = data.teams.get(id);
          if (!tm) return null;
          return (
            <button
              key={id}
              className="chip followed-chip"
              style={{ boxShadow: `inset 3px 0 0 ${theme.follow[slot]}` }}
              onClick={() => follow.toggle(id)}
              title={t.att.unfollow(tm.short_name)}
              aria-label={t.att.unfollow(tm.short_name)}
            >
              <Badge team={tm} size={18} />
              {tm.short_name}
              <span aria-hidden className="x">×</span>
            </button>
          );
        })}
      </div>
      {open && (
        <div className="follow-pop" role="dialog" aria-label={t.att.follow}>
          <div className="follow-head">
            <span>{follow.full ? t.att.maxFollow : t.att.followHint}</span>
            <span className="follow-actions">
              {follow.followed.length > 0 && (
                <button className="link" onClick={follow.clear}>
                  {t.att.clear}
                </button>
              )}
              <button className="link" onClick={() => setOpen(false)}>
                {t.att.close}
              </button>
            </span>
          </div>
          <h4>{t.att.seasonTeams(year)}</h4>
          <div className="team-grid">{inSeason.map(option)}</div>
          {others.length > 0 && (
            <>
              <h4>{t.att.otherTeams}</h4>
              <div className="team-grid">{others.map(option)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
