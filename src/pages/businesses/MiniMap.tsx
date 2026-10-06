import { useEffect, useRef } from "react";
import L from "leaflet";
import { MAP_BASES, MAP_COLORS } from "@/lib/maps";
import type { Hydrant } from "@/lib/types";

/**
 * The business close in, with the hydrants round it, labelled. Loaded on its
 * own (React.lazy) so Leaflet only comes down when a business with a map
 * position is opened. It doesn't take the scroll wheel, so scrolling the page
 * past it doesn't zoom it by accident.
 */
export default function MiniMap({ latitude, longitude, hydrants }: { latitude: number; longitude: number; hydrants: Hydrant[] }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { center: [latitude, longitude], zoom: 17, scrollWheelZoom: false, zoomControl: true });
    const base = MAP_BASES.streets;
    base.layers.forEach((url, i) => L.tileLayer(url, { attribution: i === 0 ? base.attribution : undefined, maxZoom: 20, maxNativeZoom: 19 }).addTo(m));
    const renderer = L.canvas({ padding: 0.5 });
    for (const h of hydrants) {
      L.circleMarker([h.latitude, h.longitude], {
        renderer, radius: 7, weight: 2, color: "#0d2345", fillOpacity: 1, fillColor: h.inService ? MAP_COLORS.hydrant : MAP_COLORS.hydrantOut,
      }).bindTooltip(`${h.identifier}${h.inService ? "" : " (out of service)"}`, { permanent: true, direction: "right", offset: [8, 0] }).addTo(m);
    }
    L.circleMarker([latitude, longitude], { renderer, radius: 11, weight: 3, color: "#111", fillOpacity: 1, fillColor: MAP_COLORS.due_soon }).addTo(m);
    return () => { m.remove(); };
  }, [latitude, longitude, hydrants]);

  return <div ref={el} className="h-64 w-full" role="img" aria-label="Map of the business and the hydrants near it" />;
}
