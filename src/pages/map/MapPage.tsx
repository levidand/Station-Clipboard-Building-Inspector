import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import L from "leaflet";
import { get } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { BASE, CASE_STATUS, DUE, keys, typeLabel, useSettings } from "@/lib/inspections";
import { MAP_BASES as BASES, MAP_COLORS as COLORS, type MapBase as Base } from "@/lib/maps";
import type { MapData } from "@/lib/types";
import { Checkbox, Segmented } from "@/components/ui";
import { QueryState } from "@/components/kit";

/**
 * The department on one map: every business coloured by when it's due,
 * hydrants from the Command Portal, open complaints and the next two weeks of
 * inspections. Drawn on one canvas, so a department with thousands of hydrants
 * still pans smoothly (the Command Portal learned that the hard way).
 * Opened with ?focus=<business id> (Show on the map, from a business), it
 * starts close in on that business with its card open.
 */
export function MapPage() {
  const settings = useSettings();
  const [, navigate] = useLocation();
  const focus = Number(new URLSearchParams(useSearch()).get("focus")) || null;
  const q = useQuery({ queryKey: keys.map, queryFn: ({ signal }) => get<MapData>(`${BASE}/map`, signal) });
  const [base, setBase] = useState<Base>("streets");
  const [show, setShow] = useState({ businesses: true, hydrants: true, complaints: true, inspections: true });
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const baseLayer = useRef<L.LayerGroup | null>(null);
  const dataLayer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { preferCanvas: true, zoomControl: true, center: [29.42, -95.42], zoom: 13 });
    map.current = m;
    dataLayer.current = L.layerGroup().addTo(m);
    // Links inside popups use the app's router instead of reloading the page.
    m.on("popupopen", e => {
      e.popup.getElement()?.querySelectorAll<HTMLAnchorElement>("a[data-href]").forEach(a => {
        a.onclick = ev => { ev.preventDefault(); navigate(a.dataset.href!); };
      });
    });
    return () => { m.remove(); map.current = null; };
  }, [navigate]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    baseLayer.current?.remove();
    const b = BASES[base];
    baseLayer.current = L.layerGroup(b.layers.map((url, i) => L.tileLayer(url, { attribution: i === 0 ? b.attribution : undefined, maxZoom: 20, maxNativeZoom: 19 }))).addTo(m);
    m.getContainer().dataset.base = base === "aerial" ? "aerial" : "";
  }, [base]);

  const data = q.data;
  const counts = useMemo(() => ({
    businesses: data?.properties.length ?? 0, hydrants: data?.hydrants.length ?? 0,
    complaints: data?.cases.length ?? 0, inspections: data?.inspections.length ?? 0,
  }), [data]);

  useEffect(() => {
    const m = map.current;
    const layer = dataLayer.current;
    if (!m || !layer || !data) return;
    layer.clearLayers();
    const renderer = L.canvas({ padding: 0.5 });
    const points: L.LatLng[] = [];
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
    const link = (href: string, text: string) => `<a href="${href}" data-href="${href}" style="color:#64b5f6;font-weight:500">${esc(text)}</a>`;

    if (show.hydrants) {
      for (const h of data.hydrants) {
        L.circleMarker([h.latitude, h.longitude], {
          renderer, radius: 4, weight: 1, color: "#0d2345", fillOpacity: 0.9, fillColor: h.inService ? COLORS.hydrant : COLORS.hydrantOut,
        }).bindPopup(`<b>Hydrant ${esc(h.identifier)}</b><br>${h.flowGpm ? `${h.flowGpm} GPM · ` : ""}class ${esc(h.hydrantClass)}${h.inService ? "" : "<br><b>Out of service</b>"}`).addTo(layer);
      }
    }
    let focused: L.CircleMarker | null = null;
    if (show.businesses) {
      for (const p of data.properties) {
        if (p.latitude == null || p.longitude == null) continue;
        const ll = L.latLng(p.latitude, p.longitude);
        points.push(ll);
        const marker = L.circleMarker(ll, {
          renderer, radius: p.onProgram ? 8 : 6, weight: 2, color: "#111", fillOpacity: 0.95, fillColor: COLORS[p.dueState],
        }).bindPopup(
          `${link(`/businesses/${p.preplanId}`, p.name)}<br>${esc(p.address)}<br>${DUE[p.dueState].label}` +
          `${p.nextDueOn && p.onProgram ? `, due ${esc(formatDay(p.nextDueOn))}` : ""}${p.openViolations ? `<br>${p.openViolations} open violation(s)` : ""}`,
        ).addTo(layer);
        if (p.preplanId === focus) focused = marker;
      }
    }
    if (show.complaints) {
      for (const c of data.cases) {
        if (c.latitude == null || c.longitude == null) continue;
        const ll = L.latLng(c.latitude, c.longitude);
        points.push(ll);
        L.circleMarker(ll, { renderer, radius: 9, weight: 3, color: COLORS.complaint, fillOpacity: 0.25, fillColor: COLORS.complaint })
          .bindPopup(`${link(`/complaints/${c.id}`, `${typeLabel(settings.data?.caseTypes, c.typeKey)}`)}<br>${esc(c.address)}<br>${CASE_STATUS[c.status].label}`)
          .addTo(layer);
      }
    }
    if (show.inspections) {
      for (const i of data.inspections) {
        if (i.latitude == null || i.longitude == null) continue;
        L.circleMarker([i.latitude, i.longitude], { renderer, radius: 12, weight: 3, color: COLORS.inspection, fill: false })
          .bindPopup(`${link(`/inspections/${i.id}`, `${typeLabel(settings.data?.inspectionTypes, i.typeKey)}`)}<br>${esc(i.placeName ?? i.address)}<br>${i.scheduledOn ? esc(formatDay(i.scheduledOn)) : "No day set"}`)
          .addTo(layer);
      }
    }
    if (!fitted.current && focused) {
      m.setView(focused.getLatLng(), 17);
      focused.openPopup();
      fitted.current = true;
    }
    if (!fitted.current && points.length) {
      m.fitBounds(L.latLngBounds(points).pad(0.1), { maxZoom: 16 });
      fitted.current = true;
    }
  }, [data, show, settings.data, focus]);

  const toggle = (k: keyof typeof show) => (v: boolean) => setShow(s => ({ ...s, [k]: v }));

  return (
    <div className="flex h-full flex-col">
      <div className="z-10 flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-divider bg-alt px-4 py-2 shadow-bar sm:px-6">
        <h1 className="mr-2 text-[22px] font-medium">Map</h1>
        <Checkbox checked={show.businesses} onChange={toggle("businesses")}><Legend color={COLORS.overdue} />Businesses ({counts.businesses})</Checkbox>
        <Checkbox checked={show.inspections} onChange={toggle("inspections")}><Legend color={COLORS.inspection} ring />Inspections, next 2 weeks ({counts.inspections})</Checkbox>
        <Checkbox checked={show.complaints} onChange={toggle("complaints")}><Legend color={COLORS.complaint} ring />Open complaints ({counts.complaints})</Checkbox>
        <Checkbox checked={show.hydrants} onChange={toggle("hydrants")}><Legend color={COLORS.hydrant} small />Hydrants ({counts.hydrants})</Checkbox>
        <Segmented className="ml-auto" value={base} onChange={setBase} options={[{ value: "streets", label: "Streets" }, { value: "aerial", label: "Aerial" }]} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 bg-surface px-4 py-1.5 text-[14px] text-ink-2 sm:px-6">
        <span><Legend color={COLORS.overdue} />Overdue</span>
        <span><Legend color={COLORS.due_soon} />Due within 30 days</span>
        <span><Legend color={COLORS.current} />Up to date</span>
        <span><Legend color={COLORS.none} />Not on the program</span>
        <span><Legend color={COLORS.hydrantOut} small />Hydrant out of service</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={el} className="absolute inset-0" />
        {!data && <div className="absolute inset-0 z-[500] bg-surface/80"><QueryState query={q}>{null}</QueryState></div>}
      </div>
    </div>
  );
}

function Legend({ color, ring, small }: { color: string; ring?: boolean; small?: boolean }) {
  return (
    <span className="mr-1.5 inline-block rounded-full align-middle" style={{
      width: small ? 10 : 14, height: small ? 10 : 14,
      background: ring ? "transparent" : color, border: `2px solid ${ring ? color : "#111"}`,
    }} />
  );
}
