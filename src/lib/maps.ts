// Map bits shared by the Map page and a business's location box. No Leaflet
// here, so a page can use the distances without pulling the map library in.

const tiles = (service: string) => `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`;

export type MapBase = "streets" | "aerial";

export const MAP_BASES: Record<MapBase, { layers: string[]; attribution: string }> = {
  streets: { layers: [tiles("World_Street_Map")], attribution: 'Powered by <a href="https://www.esri.com">Esri</a> | Esri, HERE, Garmin, USGS, &copy; OpenStreetMap contributors' },
  aerial: { layers: [tiles("World_Imagery"), tiles("Reference/World_Transportation")], attribution: 'Powered by <a href="https://www.esri.com">Esri</a> | Esri, Vantor, Earthstar Geographics' },
};

export const MAP_COLORS = {
  overdue: "#c62828", due_soon: "#ff9800", current: "#7cb342", none: "#9e9e9e",
  hydrant: "#64b5f6", hydrantOut: "#757575", complaint: "#ffc629", inspection: "#1976d2",
};

/** Straight-line distance in feet. */
export function feetBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 20_902_231 * Math.asin(Math.sqrt(h));
}

/** "180 ft", or "0.4 mi" past a quarter mile. */
export function distanceText(feet: number): string {
  return feet < 1320 ? `${Math.round(feet / 10) * 10} ft` : `${(feet / 5280).toFixed(1)} mi`;
}

/** Turn-by-turn in Google Maps (the app, on a phone or tablet that has it). */
export function directionsUrl(p: { latitude: number | null; longitude: number | null; address: string }): string {
  const to = p.latitude != null && p.longitude != null ? `${p.latitude},${p.longitude}` : p.address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(to)}`;
}
