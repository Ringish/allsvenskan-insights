import { t } from "./i18n";

// Formatters follow the active language; rebuilt only when the locale changes.
let cached: { locale: string; int: Intl.NumberFormat; pct: Intl.NumberFormat; date: Intl.DateTimeFormat } | null = null;

function fmt() {
  if (cached?.locale !== t.locale) {
    cached = {
      locale: t.locale,
      int: new Intl.NumberFormat(t.locale, { maximumFractionDigits: 0 }),
      pct: new Intl.NumberFormat(t.locale, { style: "percent", maximumFractionDigits: 0 }),
      date: new Intl.DateTimeFormat(t.locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    };
  }
  return cached;
}

export const fmtInt = (n: number) => fmt().int.format(Math.round(n));
export const fmtDate = (day: string) => fmt().date.format(new Date(`${day}T12:00:00Z`));
export const fmtPct = (x: number) => fmt().pct.format(x);
