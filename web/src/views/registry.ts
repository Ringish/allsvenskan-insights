import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { Dataset } from "../data/types";
import type { SceneTheme } from "../theme";

export interface ViewProps {
  data: Dataset;
  theme: SceneTheme;
}

export interface InsightView {
  id: string;
  title: string;
  description: string;
  component: LazyExoticComponent<ComponentType<ViewProps>>;
}

/** Every insight is one entry here. New views reuse data/, timeline/ and map/. */
export const VIEWS: InsightView[] = [
  {
    id: "attendance",
    title: "Crowd skyline",
    description: "Attendance at every Allsvenskan stadium since 2000, as 3D towers over time.",
    component: lazy(() => import("./attendance/AttendanceView")),
  },
];
