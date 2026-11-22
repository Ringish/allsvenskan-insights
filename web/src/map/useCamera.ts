import { FlyToInterpolator, type MapViewState } from "@deck.gl/core";
import { useCallback, useEffect, useRef, useState } from "react";

export const PRESETS = {
  Sweden: { longitude: 14.6, latitude: 57.2, zoom: 5.35, pitch: 55, bearing: -10 },
  Stockholm: { longitude: 17.98, latitude: 59.2, zoom: 8.6, pitch: 58, bearing: -20 },
  Göteborg: { longitude: 11.96, latitude: 57.6, zoom: 8.9, pitch: 58, bearing: 10 },
  Skåne: { longitude: 13.1, latitude: 55.55, zoom: 7.7, pitch: 55, bearing: -8 },
} satisfies Record<string, Partial<MapViewState>>;
export type Preset = keyof typeof PRESETS;

const PHONE = typeof matchMedia !== "undefined" && matchMedia("(max-width: 760px)").matches;
const INITIAL: MapViewState = {
  ...PRESETS.Sweden,
  ...(PHONE ? { zoom: 4.3, latitude: 58.2 } : {}),
  minZoom: 3.5,
  maxZoom: 13,
  maxPitch: 75,
};
// Degrees per second while auto-orbiting.
const ORBIT_SPEED = 2.2;

/**
 * Controlled deck.gl camera. While `auto` is on and playback runs, the camera slowly
 * orbits and drifts toward `focus`. Any user drag turns auto off.
 */
export function useCamera(playing: boolean, focus: [number, number] | null) {
  const [viewState, setViewState] = useState<MapViewState>(INITIAL);
  const [auto, setAuto] = useState(true);
  const focusRef = useRef(focus);
  focusRef.current = focus;

  useEffect(() => {
    if (!auto || !playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setViewState((v) => {
        const f = focusRef.current;
        // Drift gently, never more than a fraction of the way per frame.
        const k = f ? 1 - Math.exp(-dt * 0.35) : 0;
        return {
          ...v,
          bearing: (v.bearing ?? 0) + ORBIT_SPEED * dt,
          longitude: f ? v.longitude + (f[0] - v.longitude) * k : v.longitude,
          latitude: f ? v.latitude + (f[1] - v.latitude) * k : v.latitude,
          transitionDuration: 0,
        };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto, playing]);

  const flyTo = useCallback((target: Partial<MapViewState>, duration = 1600) => {
    setViewState((v) => ({
      ...v,
      ...target,
      transitionDuration: duration,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
    }));
  }, []);

  const onViewStateChange = useCallback(
    ({ viewState: next, interactionState }: { viewState: MapViewState; interactionState: { isDragging?: boolean; isZooming?: boolean; isRotating?: boolean } }) => {
      if (interactionState?.isDragging || interactionState?.isRotating || interactionState?.isZooming) setAuto(false);
      setViewState(next);
    },
    [],
  );

  return { viewState, onViewStateChange, flyTo, auto, setAuto };
}
