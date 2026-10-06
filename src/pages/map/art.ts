import { MAP_COLORS } from "@/lib/maps";
import type { DueState } from "@/lib/types";

// The map's symbols. A business is a house, as the Command Portal draws a
// preplan, filled with when it's due; a hydrant is a hydrant, greyed with a
// red slash when it's out of service. Inspections and complaints are pins
// carrying the same pictures as the side menu. Each shape is one outline, so
// the map's canvas (markers.ts), its pins and its key all draw the same
// thing. No Leaflet here.

type Pen = Pick<CanvasPath, "moveTo" | "lineTo" | "closePath">;

/** A square with a pitched roof, standing on its point. `s` is half its width. */
export function traceHouse(pen: Pen, x: number, y: number, s: number) {
  pen.moveTo(x - s, y + s); pen.lineTo(x + s, y + s); pen.lineTo(x + s, y - s * 0.2);
  pen.lineTo(x, y - s * 1.25); pen.lineTo(x - s, y - s * 0.2);
  pen.closePath();
}

/** A draft site: somewhere an engine can draft water, not a hydrant. */
export function traceDiamond(pen: Pen, x: number, y: number, s: number) {
  const d = s * 1.3;
  pen.moveTo(x, y - d); pen.lineTo(x + d, y); pen.lineTo(x, y + d); pen.lineTo(x - d, y);
  pen.closePath();
}

// A fire hydrant, front on: the operating nut, a round bonnet, a capped
// outlet each side and the barrel on its foot. Squat and chunky, so it still
// reads as a hydrant at 10 px; the Command Portal's taller one (board/map/
// pins.ts) reads as an arrow that small. In units of `s`, centred on its point,
// y down. The right half, top to bottom; the left mirrors it.
const HYDRANT_HALF: [number, number][] = (() => {
  const domeY = -0.42, domeR = 0.8, from = -Math.PI / 2 + 0.23;
  const half: [number, number][] = [[0.18, -1.3], [0.18, -1.12]];
  for (let i = 1; i <= 7; i++) {
    const a = from * (1 - i / 7);
    half.push([domeR * Math.cos(a), domeY + domeR * Math.sin(a)]);
  }
  half.push([0.8, -0.1], [1.25, -0.1], [1.25, 0.5], [0.8, 0.5], [0.8, 0.95], [1, 0.95], [1, 1.25]);
  return half;
})();
const HYDRANT_OUTLINE = [...HYDRANT_HALF, ...HYDRANT_HALF.slice().reverse().map(([x, y]): [number, number] => [-x, y])];

/** A hydrant of size `s` at (x, y). */
export function traceHydrant(pen: Pen, x: number, y: number, s: number) {
  HYDRANT_OUTLINE.forEach(([px, py], i) => (i ? pen.lineTo(x + px * s, y + py * s) : pen.moveTo(x + px * s, y + py * s)));
  pen.closePath();
}

/** The slash across a hydrant out of service: red, cased dark so it holds on any map. */
export function traceSlash(pen: Pen, x: number, y: number, s: number) {
  const d = 1.2 * s;
  pen.moveTo(x - d, y + d);
  pen.lineTo(x + d, y - d);
}

export const SLASH = { color: "#ff5252", casing: "#111" };
/** The slash's width, and its casing's, for a hydrant of size `s`. */
export const slashWidth = (s: number) => { const w = Math.max(2.5, s * 0.4); return { w, casing: w + 2 }; };

export interface Look { fill: string; stroke: string; width: number }

export const businessLook = (due: DueState): Look => ({ fill: MAP_COLORS[due], stroke: "#111", width: 1.5 });

export const hydrantLook = (inService: boolean): Look =>
  ({ fill: inService ? MAP_COLORS.hydrant : MAP_COLORS.hydrantOut, stroke: "#111", width: 1.5 });

// --- As SVG, for the pins and the map key ----------------------------------

const num = (v: number) => +v.toFixed(2);

function svgPath(draw: (pen: Pen) => void): string {
  let d = "";
  draw({ moveTo: (a, b) => { d += `M${num(a)} ${num(b)}`; }, lineTo: (a, b) => { d += `L${num(a)} ${num(b)}`; }, closePath: () => { d += "Z"; } });
  return d;
}

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${num(w)}" height="${num(h)}" viewBox="0 0 ${num(w)} ${num(h)}" aria-hidden="true">${body}</svg>`;

const shape = (d: string, l: Look) =>
  `<path d="${d}" fill="${l.fill}" stroke="${l.stroke}" stroke-width="${l.width}" stroke-linejoin="round" stroke-linecap="round"/>`;

/** A business for the key, `size` px square. */
export function houseSvg(look: Look, size = 18): string {
  const s = (size - look.width - 1) / 2.25;
  return svg(size, size, shape(svgPath(p => traceHouse(p, size / 2, size / 2 + s * 0.125, s)), look));
}

/** A hydrant (or a draft site's diamond) for the key, `size` px square. */
export function hydrantSvg(h: { inService: boolean; isDraftSite?: boolean }, size = 18): string {
  const look = hydrantLook(h.inService), s = (size - look.width - 1) / 2.6, c = size / 2;
  if (h.isDraftSite) return svg(size, size, shape(svgPath(p => traceDiamond(p, c, c, s)), look));
  let body = shape(svgPath(p => traceHydrant(p, c, c + s * 0.025, s)), look);
  if (!h.inService) {
    const slash = svgPath(p => traceSlash(p, c, c, s)), { w, casing } = slashWidth(s);
    body += `<path d="${slash}" stroke="${SLASH.casing}" stroke-width="${casing}" stroke-linecap="round"/>`
      + `<path d="${slash}" stroke="${SLASH.color}" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  return svg(size, size, body);
}

// Lucide's clipboard-check and megaphone, the side menu's Inspections and
// Complaints, on their 24 × 24 grid.
const GLYPHS = {
  inspection: `<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>`,
  complaint: `<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>`
    + `<path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/><path d="M8 6v8"/>`,
};

export type PinKind = keyof typeof GLYPHS;

/** Blue with a white edge, as the Command Portal's incident pin is red with one; yellow with a dark one. */
const PIN_LOOK: Record<PinKind, { fill: string; edge: string; ink: string }> = {
  inspection: { fill: MAP_COLORS.inspection, edge: "#fff", ink: "#fff" },
  complaint: { fill: MAP_COLORS.complaint, edge: "#222", ink: "#222" },
};

/** The Command Portal's map pin, on a 34 × 46 grid; its tip is at (17, 44.5). */
const PIN = "M17 1.5C8.4 1.5 1.5 8.3 1.5 16.9 1.5 28.6 17 44.5 17 44.5S32.5 28.6 32.5 16.9C32.5 8.3 25.6 1.5 17 1.5z";

/** A pin `h` px tall, its picture in the head. */
export function pinSvg(kind: PinKind, h = 40): string {
  const look = PIN_LOOK[kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(h * 34 / 46)}" height="${h}" viewBox="0 0 34 46" aria-hidden="true">`
    + `<path d="${PIN}" fill="${look.fill}" stroke="${look.edge}" stroke-width="2.5"/>`
    + `<g transform="translate(8 7.9) scale(.75)" fill="none" stroke="${look.ink}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[kind]}</g>`
    + `</svg>`;
}
