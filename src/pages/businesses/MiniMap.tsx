import { useEffect, useRef } from "react";
import L from "leaflet";
import { MAP_BASES } from "@/lib/maps";
import type { DueState, Hydrant } from "@/lib/types";
import { businessStyle, hydrantStyle, shapeMarker } from "../map/markers";

/**
 * The business close in, with the hydrants round it, labelled. Drawn with the
 * big map's symbols: the business a house in its due colour, hydrants as
 * hydrants. Loaded on its own (React.lazy) so Leaflet only comes down when a
 * business with a map position is opened. It doesn't take the scroll wheel, so
 * scrolling the page past it doesn't zoom it by accident.
 */
export default function MiniMap({ latitude, longitude, due, hydrants }: { latitude: number; longitude: number; due: DueState; hydrants: Hydrant[] }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { center: [latitude, longitude], zoom: 17, scrollWheelZoom: false, zoomControl: true });
    const base = MAP_BASES.streets;
    base.layers.forEach((url, i) => L.tileLayer(url, { attribution: i === 0 ? base.attribution : undefined, maxZoom: 20, maxNativeZoom: 19 }).addTo(m));
    const renderer = L.canvas({ padding: 0.5 });
    for (const h of hydrants) {
      // Each label points away from the business, so two hydrants either side of it don't cover each other.
      const west = h.longitude < longitude;
      shapeMarker([h.latitude, h.longitude], { renderer, ...hydrantStyle(h), radius: 7 })
        .bindTooltip(`${h.identifier}${h.inService ? "" : " (out of service)"}`, { permanent: true, direction: west ? "left" : "right", offset: [west ? -10 : 10, 0] })
        .addTo(m);
    }
    shapeMarker([latitude, longitude], { renderer, ...businessStyle(due), radius: 12, weight: 2 }).addTo(m);
    // Framed on the business and the nearest few hydrants, so the closest one is always in view.
    const frame = [L.latLng(latitude, longitude), ...hydrants.slice(0, 3).map(h => L.latLng(h.latitude, h.longitude))];
    if (frame.length > 1) m.fitBounds(L.latLngBounds(frame), { padding: [36, 36], maxZoom: 18 });
    return () => { m.remove(); };
  }, [latitude, longitude, due, hydrants]);

  // `isolate`: Leaflet's panes carry z-indexes in the hundreds; without their own stacking
  // context they'd paint over the sticky page head and the Actions menu.
  return <div ref={el} className="isolate h-64 w-full" role="img" aria-label="Map of the business and the hydrants near it" />;
}
