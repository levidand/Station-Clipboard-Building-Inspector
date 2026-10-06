import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import L from "leaflet";
import { get } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { BASE, CASE_STATUS, DUE, keys, typeLabel, useSettings } from "@/lib/inspections";
import { MAP_BASES as BASES, type MapBase as Base } from "@/lib/maps";
import type { MapData } from "@/lib/types";
import { Checkbox, Segmented } from "@/components/ui";
import { QueryState } from "@/components/kit";
import { businessLook, houseSvg, hydrantSvg, pinSvg } from "./art";
import { businessStyle, hydrantStyle, pinIcon, scaleFor, shapeMarker } from "./markers";

const BUSINESS_R = 8;
const OFF_PROGRAM_R = 6;
const HYDRANT_R = 5;

/** The map key's symbols, drawn by the same code that draws them on the map. */
const KEY = {
  business: houseSvg({ fill: "none", stroke: "currentColor", width: 1.8 }),
  overdue: houseSvg(businessLook("overdue")),
  dueSoon: houseSvg(businessLook("due_soon")),
  current: houseSvg(businessLook("current")),
  none: houseSvg(businessLook("none")),
  inspection: pinSvg("inspection", 24),
  complaint: pinSvg("complaint", 24),
  hydrant: hydrantSvg({ inService: true }),
  hydrantOut: hydrantSvg({ inService: false }),
  draftSite: hydrantSvg({ inService: true, isDraftSite: true }),
};

/**
 * The department on one map: every business as a house coloured by when it's
 * due, hydrants from the Command Portal, and pins for open complaints and the
 * next two weeks of inspections. Businesses and hydrants are drawn on one
 * canvas, so a department with thousands of hydrants still pans smoothly (the
 * Command Portal learned that the hard way).
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
  const canvas = useRef<L.Canvas | null>(null);
  // The canvas markers and their size at scale 1, resized as the map zooms.
  const sized = useRef<{ marker: L.CircleMarker; base: number }[]>([]);
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { preferCanvas: true, zoomControl: true, center: [29.42, -95.42], zoom: 13 });
    map.current = m;
    dataLayer.current = L.layerGroup().addTo(m);
    // A little tap tolerance round each marker, for gloved fingers.
    canvas.current = L.canvas({ padding: 0.5, tolerance: 4 });
    let scale = scaleFor(m.getZoom());
    m.on("zoomend", () => {
      const s = scaleFor(m.getZoom());
      if (s === scale) return;
      scale = s;
      for (const x of sized.current) x.marker.setRadius(x.base * s);
    });
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
    draftSites: data?.hydrants.filter(h => h.isDraftSite).length ?? 0,
  }), [data]);

  useEffect(() => {
    const m = map.current;
    const layer = dataLayer.current;
    const renderer = canvas.current;
    if (!m || !layer || !renderer || !data) return;
    layer.clearLayers();
    const points: L.LatLng[] = [];
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
    const link = (href: string, text: string) => `<a href="${href}" data-href="${href}" style="color:#64b5f6;font-weight:500">${esc(text)}</a>`;
    const scale = scaleFor(m.getZoom());
    const sizes: typeof sized.current = [];
    const sizedAt = (marker: L.CircleMarker, base: number) => { sizes.push({ marker, base }); return marker; };

    // Hydrants first, so the businesses sit on top of them.
    if (show.hydrants) {
      for (const h of data.hydrants) {
        sizedAt(shapeMarker([h.latitude, h.longitude], { renderer, ...hydrantStyle(h), radius: HYDRANT_R * scale }), HYDRANT_R)
          .bindPopup(`<b>${h.isDraftSite ? "Draft site" : "Hydrant"} ${esc(h.identifier)}</b><br>${h.flowGpm ? `${h.flowGpm} GPM · ` : ""}class ${esc(h.hydrantClass)}${h.inService ? "" : "<br><b>Out of service</b>"}`)
          .addTo(layer);
      }
    }
    let focused: L.CircleMarker | null = null;
    if (show.businesses) {
      for (const p of data.properties) {
        if (p.latitude == null || p.longitude == null) continue;
        const ll = L.latLng(p.latitude, p.longitude);
        points.push(ll);
        const base = p.onProgram ? BUSINESS_R : OFF_PROGRAM_R;
        const marker = sizedAt(shapeMarker(ll, { renderer, ...businessStyle(p.dueState), radius: base * scale }), base).bindPopup(
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
        L.marker(ll, { icon: pinIcon("complaint"), riseOnHover: true })
          .bindPopup(`${link(`/complaints/${c.id}`, `${typeLabel(settings.data?.caseTypes, c.typeKey)}`)}<br>${esc(c.address)}<br>${CASE_STATUS[c.status].label}`)
          .addTo(layer);
      }
    }
    if (show.inspections) {
      for (const i of data.inspections) {
        if (i.latitude == null || i.longitude == null) continue;
        L.marker([i.latitude, i.longitude], { icon: pinIcon("inspection"), riseOnHover: true })
          .bindPopup(`${link(`/inspections/${i.id}`, `${typeLabel(settings.data?.inspectionTypes, i.typeKey)}`)}<br>${esc(i.placeName ?? i.address)}<br>${i.scheduledOn ? esc(formatDay(i.scheduledOn)) : "No day set"}`)
          .addTo(layer);
      }
    }
    sized.current = sizes;
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
        <Checkbox checked={show.businesses} onChange={toggle("businesses")}><span className="flex items-center"><Key svg={KEY.business} />Businesses ({counts.businesses})</span></Checkbox>
        <Checkbox checked={show.inspections} onChange={toggle("inspections")}><span className="flex items-center"><Key svg={KEY.inspection} />Inspections, next 2 weeks ({counts.inspections})</span></Checkbox>
        <Checkbox checked={show.complaints} onChange={toggle("complaints")}><span className="flex items-center"><Key svg={KEY.complaint} />Open complaints ({counts.complaints})</span></Checkbox>
        <Checkbox checked={show.hydrants} onChange={toggle("hydrants")}><span className="flex items-center"><Key svg={KEY.hydrant} />Hydrants ({counts.hydrants})</span></Checkbox>
        <Segmented className="ml-auto" value={base} onChange={setBase} options={[{ value: "streets", label: "Streets" }, { value: "aerial", label: "Aerial" }]} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 bg-surface px-4 py-1.5 text-[14px] text-ink-2 sm:px-6">
        <span className="inline-flex items-center"><Key svg={KEY.overdue} />Overdue</span>
        <span className="inline-flex items-center"><Key svg={KEY.dueSoon} />Due within 30 days</span>
        <span className="inline-flex items-center"><Key svg={KEY.current} />Up to date</span>
        <span className="inline-flex items-center"><Key svg={KEY.none} />Not on the program</span>
        <span className="inline-flex items-center"><Key svg={KEY.hydrantOut} />Hydrant out of service</span>
        {counts.draftSites > 0 && <span className="inline-flex items-center"><Key svg={KEY.draftSite} />Draft site</span>}
      </div>
      <div className="relative isolate min-h-0 flex-1">
        <div ref={el} className="absolute inset-0" />
        {!data && <div className="absolute inset-0 z-10 bg-surface/80"><QueryState query={q}>{null}</QueryState></div>}
      </div>
    </div>
  );
}

/** One of the map's symbols, in the key. Built from art.ts's own strings, never from data. */
function Key({ svg }: { svg: string }) {
  return <span className="mr-1.5 inline-flex shrink-0 align-middle" dangerouslySetInnerHTML={{ __html: svg }} />;
}
