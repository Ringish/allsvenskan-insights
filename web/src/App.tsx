import { Suspense, useEffect, useState } from "react";
import { loadDataset } from "./data/load";
import type { Dataset } from "./data/types";
import { t, useLang } from "./i18n";
import { THEMES, useThemeMode } from "./theme";
import { VIEWS } from "./views/registry";

function viewFromHash() {
  const id = location.hash.slice(1);
  return VIEWS.find((v) => v.id === id) ?? VIEWS[0];
}

export function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState(viewFromHash);
  const [mode, pref, setPref] = useThemeMode();
  const [lang, setLang] = useLang();

  useEffect(() => {
    loadDataset().then(setData, (e: Error) => setError(e.message));
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const View = view.component;
  const nextPref = pref === "system" ? (mode === "dark" ? "light" : "dark") : pref === "dark" ? "light" : "system";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden />
          <span>Allsvenskan Insights</span>
        </div>
        <nav className="views">
          {VIEWS.map((v) => (
            <a key={v.id} href={`#${v.id}`} className={v.id === view.id ? "on" : ""} title={v.strings(t).description}>
              {v.strings(t).title}
            </a>
          ))}
        </nav>
        <button className="theme-toggle" onClick={() => setLang(lang === "sv" ? "en" : "sv")} title={t.langTitle}>
          {lang === "sv" ? "EN" : "SV"}
        </button>
        <button className="theme-toggle" onClick={() => setPref(nextPref)} title={t.theme.title}>
          {t.theme[pref]}
        </button>
      </header>
      <main>
        {error ? (
          <div className="state">{t.loadError(error)}</div>
        ) : !data ? (
          <div className="state">{t.loading}</div>
        ) : (
          <Suspense fallback={<div className="state">{t.loadingView}</div>}>
            <View data={data} theme={THEMES[mode]} />
          </Suspense>
        )}
      </main>
    </div>
  );
}
