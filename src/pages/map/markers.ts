import L from "leaflet";
import type { DueState, Hydrant } from "@/lib/types";
import {
  SLASH, businessLook, hydrantLook, pinSvg, slashWidth, traceDiamond, traceHouse, traceHydrant, traceSlash, type PinKind,
} from "./art";

// Businesses and hydrants go on the map's canvas, so a department with
// thousands of hydrants still pans smoothly. Leaflet's canvas only knows
// circles; these markers keep a circle's hit area and draw a house, a hydrant
// or a draft site's diamond instead, as the Command Portal's map does (its
// map/shapes.ts). They reach into Leaflet 1.9's canvas internals
// (_updatePath, _updateBounds, _fillStroke), so only ever give them a canvas
// renderer.

export type Shape = "house" | "hydrant" | "diamond";

export interface ShapeMarkerOptions extends L.CircleMarkerOptions {
  shape: Shape;
  /** A hydrant out of service, slashed through. */
  struck?: boolean;
}

interface Drawn {
  _point: L.Point;
  _radius: number;
  _pxBounds?: L.Bounds;
  _renderer: { _ctx: CanvasRenderingContext2D; _drawing: boolean; _fillStroke(ctx: CanvasRenderingContext2D, layer: unknown): void };
  options: ShapeMarkerOptions;
  _empty(): boolean;
  _clickTolerance(): number;
}

const ShapeMarkerClass: new (at: L.LatLngExpression, options: ShapeMarkerOptions) => L.CircleMarker = L.CircleMarker.extend({
  _updatePath(this: Drawn) {
    const r = this._renderer;
    if (!r._drawing || this._empty()) return;
    const ctx = r._ctx, { x, y } = this._point, s = Math.max(this._radius, 1);
    ctx.beginPath();
    if (this.options.shape === "house") traceHouse(ctx, x, y, s);
    else if (this.options.shape === "diamond") traceDiamond(ctx, x, y, s);
    else traceHydrant(ctx, x, y, s);
    r._fillStroke(ctx, this);
    if (!this.options.struck) return;
    // The slash is its own colour, so it's stroked on its own: its dark casing, then the red.
    const { w, casing } = slashWidth(s);
    ctx.save();
    ctx.beginPath();
    traceSlash(ctx, x, y, s);
    ctx.lineCap = "round";
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = SLASH.casing; ctx.lineWidth = casing; ctx.stroke();
    ctx.strokeStyle = SLASH.color; ctx.lineWidth = w; ctx.stroke();
    ctx.restore();
  },
  // A roof, a hydrant's nut or its slash reaches past the circle, so the area Leaflet clears round one does too.
  _updateBounds(this: Drawn) {
    const p = this._radius * 1.5 + 3 + this._clickTolerance();
    this._pxBounds = L.bounds(this._point.subtract([p, p]), this._point.add([p, p]));
  },
});

export function shapeMarker(at: L.LatLngExpression, options: ShapeMarkerOptions): L.CircleMarker {
  return new ShapeMarkerClass(at, options);
}

export function businessStyle(due: DueState): ShapeMarkerOptions {
  const look = businessLook(due);
  return { shape: "house", color: look.stroke, weight: look.width, fillColor: look.fill, fillOpacity: 1 };
}

export function hydrantStyle(h: Pick<Hydrant, "inService" | "isDraftSite">): ShapeMarkerOptions {
  const look = hydrantLook(h.inService);
  return {
    shape: h.isDraftSite ? "diamond" : "hydrant", struck: !h.inService && !h.isDraftSite,
    color: look.stroke, weight: look.width, fillColor: look.fill, fillOpacity: 1,
  };
}

const pins = new Map<PinKind, L.DivIcon>();

/**
 * An inspection or a complaint: a pin over the spot. Its tip stops a few
 * pixels short, on the roof, so the business's house under it still shows
 * its colour.
 */
export function pinIcon(kind: PinKind): L.DivIcon {
  let icon = pins.get(kind);
  if (!icon) {
    icon = L.divIcon({ className: "ip-pin", html: pinSvg(kind, 40), iconSize: [30, 40], iconAnchor: [15, 46], popupAnchor: [0, -41] });
    pins.set(kind, icon);
  }
  return icon;
}

/** Markers grow as the map zooms in, so a whole-town view isn't a carpet of them. */
export const scaleFor = (zoom: number) => (zoom >= 17 ? 1.4 : zoom >= 15 ? 1.15 : zoom >= 13 ? 0.9 : 0.65);
