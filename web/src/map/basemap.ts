import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-50m.json";

const SWEDEN = "752";
// Norway, Finland, Denmark, Estonia, Latvia, Lithuania, Germany, Poland, Russia.
const NEIGHBOURS = new Set(["578", "246", "208", "233", "428", "440", "276", "616", "643"]);

const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
const all = feature(topo, topo.objects.countries) as FeatureCollection<Geometry>;

export const sweden: Feature<Geometry>[] = all.features.filter((f) => String(f.id) === SWEDEN);
export const neighbours: Feature<Geometry>[] = all.features.filter((f) => NEIGHBOURS.has(String(f.id)));

/** Height of the extruded land slab in meters. Towers stand on top of it. */
export const LAND_H = 6000;
