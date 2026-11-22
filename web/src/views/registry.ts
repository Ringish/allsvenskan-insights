import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { Dataset } from "../data/types";
import type { Dict } from "../i18n";
import type { SceneTheme } from "../theme";

export interface ViewProps {
  data: Dataset;
  theme: SceneTheme;
}

export interface InsightView {
  id: string;
  strings: (t: Dict) => { title: string; description: string };
  component: LazyExoticComponent<ComponentType<ViewProps>>;
}

/** Every insight is one entry here. New views reuse data/, timeline/ and map/. */
export const VIEWS: InsightView[] = [
  {
    id: "attendance",
    strings: (t) => t.views.attendance,
    component: lazy(() => import("./attendance/AttendanceView")),
  },
];
