const intFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const fmtInt = (n: number) => intFmt.format(Math.round(n));
export const fmtDate = (day: string) => dateFmt.format(new Date(`${day}T12:00:00Z`));
export const fmtPct = (x: number) => `${Math.round(x * 100)}%`;
