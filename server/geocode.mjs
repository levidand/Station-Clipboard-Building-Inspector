// Address → map position, for placing businesses, complaints and events.
//
//   GET /ip/geocode?q=412 S Main St, Georgetown&near=30.64,-97.68&limit=5
//   → { results: [{ latitude, longitude, label, precision, source }] }
//
// Copied from the Command Portal (server/geocode.mjs there). A new business,
// complaint or event is saved with its map position, so it shows on the map
// and the Command Portal can match it to a call.
//
// Sources:
//   1. Esri's ArcGIS World Geocoder. It knows far more US addresses than
//      OpenStreetMap or the Census (new subdivisions, rural roads), and for
//      many it has the rooftop or parcel rather than a point interpolated
//      along the block. With ARCGIS_API_KEY set, lookups use the keyed
//      endpoint with forStorage=true. The position is saved on the record,
//      and Esri's terms only allow keeping results requested that way.
//      Without a key, the anonymous endpoint answers, which is fine for
//      trying it out.
//   2. The US Census geocoder, free and keyless, only when Esri can't be
//      reached or finds nothing. It knows US street addresses and
//      intersections ("Hwy 29 & Rock St"), interpolated along the block.
// The Census sends no CORS headers and the key must stay out of the browser,
// which is why this runs on the server.
//
// Mounted by server/index.mjs (production and `npm run demo`) and by
// vite.config.ts (`npm run dev`, which is what Replit runs). Each request is
// checked against the Department Portal session first, so this server isn't an
// open geocoding relay.

const ESRI_KEYED = "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";
const ESRI_ANONYMOUS = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";
const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const USER_AGENT = "StationClipboard-Inspection-Portal/1.0 (+https://go.stationclipboard.com)";
const TIMEOUT_MS = 7000;

/** "address" is a door, "street" a road, "area" a town or region. Only "address" is placed automatically. */
const PRECISION_RANK = { address: 0, street: 1, area: 2 };

export function geocodeMiddleware({ authCheckUrl, arcgisKey = "" }) {
  return async (req, res) => {
    if (req.method !== "GET") return send(res, 405, { error: "GET only" });
    const url = new URL(req.url ?? "/", "http://local");
    const q = (url.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
    if (!q) return send(res, 400, { error: "Enter an address to look up." });
    if (q.length > 300) return send(res, 400, { error: "That address is too long." });
    const near = parseNear(url.searchParams.get("near"));
    const limit = Math.min(5, Math.max(1, Number(url.searchParams.get("limit")) || 5));

    if (!rateOk(clientIp(req))) return send(res, 429, { error: "Too many address lookups. Wait a minute and try again." });
    if (authCheckUrl && !(await signedIn(authCheckUrl, String(req.headers.cookie ?? "")))) {
      return send(res, 401, { error: "Sign in to look up addresses." });
    }

    try {
      const results = await geocode(q, { near, limit, arcgisKey });
      send(res, 200, { results }, results.length ? "private, max-age=3600" : "no-store");
    } catch (err) {
      send(res, 502, { error: `Address lookup is unavailable right now (${err?.message ?? "error"}).` });
    }
  };
}

export async function geocode(query, { near = null, limit = 5, arcgisKey = "" } = {}) {
  const key = `${query.toLowerCase()}|${near ? `${near.latitude.toFixed(1)},${near.longitude.toFixed(1)}` : ""}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.results.slice(0, limit);

  let results = [], esriError = null;
  try { results = await esriLookup(query, near, arcgisKey); } catch (err) { esriError = err; }
  // The Census only knows street addresses and intersections, so a landmark
  // name has nowhere else to go.
  if (!results.length && looksLikeStreetAddress(query)) {
    results = await censusLookup(query, near).catch(err => {
      if (esriError) throw new Error(`${esriError.message}; ${err.message}`);
      return [];
    });
  }
  if (esriError && !results.length) throw esriError;

  results = results.map(r => ({ ...r, latitude: round6(r.latitude), longitude: round6(r.longitude) }));
  // An Esri outage shouldn't leave a fallback answer cached all day.
  if (!esriError) remember(key, results);
  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------

/** Esri's match types, by how exactly they pin a door. Anything else (a town, a ZIP code) is an "area". */
const ESRI_PRECISION = {
  PointAddress: "address", Subaddress: "address", StreetAddress: "address", StreetAddressExt: "address",
  StreetInt: "address", POI: "address",
  StreetName: "street", StreetMidBlock: "street", StreetBetween: "street", DistanceMarker: "street",
};

async function esriLookup(query, near, arcgisKey) {
  const params = new URLSearchParams({
    SingleLine: query,
    f: "json",
    maxLocations: "6",
    outFields: "Addr_type,ShortLabel,StAddr,AddNum,City,RegionAbbr,Postal",
  });
  // Lean toward the department's own area, without excluding the rest of the world.
  if (near) params.set("location", `${near.longitude},${near.latitude}`);
  if (arcgisKey) { params.set("token", arcgisKey); params.set("forStorage", "true"); }
  const r = await fetch(`${arcgisKey ? ESRI_KEYED : ESRI_ANONYMOUS}?${params}`, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`esri ${r.status}`);
  const data = await r.json();
  // A bad key or a spent quota comes back as HTTP 200 with an error body.
  if (data?.error) throw new Error(`esri ${data.error.code ?? ""} ${data.error.message ?? ""}`.trim());

  const out = [];
  for (const c of data?.candidates ?? []) {
    const a = c.attributes ?? {};
    const p = { latitude: c.location?.y, longitude: c.location?.x };
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
    const label = esriLabel(a) || String(c.address ?? "");
    // Esri can return the same town or address once per data source.
    if (out.some(o => o.label === label && distanceMeters(o, p) < 1500)) continue;
    out.push({ ...p, label, precision: esriPrecision(query, c.score, a), source: "esri" });
  }
  // Esri has already ranked by match and closeness to `near`; doors go first.
  return out.sort((x, y) => PRECISION_RANK[x.precision] - PRECISION_RANK[y.precision]);
}

/**
 * Esri's score alone can't tell a typo it fixed from a guess. The real
 * "800 Quail Valley" scores 97.5, while the made-up "125 Escondido Pass" comes
 * back as 125 Escondido Dr at 97.8. So a door-level match must also keep the
 * house number and the street type that were typed. Otherwise it's offered to
 * the officer rather than placed.
 */
function esriPrecision(query, score, a) {
  const kind = ESRI_PRECISION[a.Addr_type] ?? "area";
  if (kind !== "address") return kind;
  if (!(score >= 95)) return "street";
  const typed = query.split(",")[0];
  const number = typed.match(/^\s*(\d+)\b/)?.[1];
  if (number && a.AddNum && String(a.AddNum) !== number) return "street";
  const typedTypes = streetTypes(typed);
  if (typedTypes.size && a.StAddr && ![...streetTypes(a.StAddr)].some(t => typedTypes.has(t))) return "street";
  return "address";
}

const STREET_TYPES = {
  st: "st", street: "st", ave: "ave", av: "ave", avenue: "ave", rd: "rd", road: "rd", dr: "dr", drive: "dr",
  ln: "ln", lane: "ln", ct: "ct", court: "ct", cir: "cir", circle: "cir", blvd: "blvd", boulevard: "blvd",
  way: "way", pl: "pl", place: "pl", ter: "ter", terrace: "ter", trl: "trl", trail: "trl", pkwy: "pkwy",
  parkway: "pkwy", hwy: "hwy", highway: "hwy", cv: "cv", cove: "cv", loop: "loop", pass: "pass", path: "path",
  run: "run", xing: "xing", crossing: "xing", sq: "sq", square: "sq", bnd: "bnd", bend: "bnd",
  holw: "holw", hollow: "holw", rdg: "rdg", ridge: "rdg", pt: "pt", point: "pt",
};

/** "125 Escondido Pass" → {"pass"}; "412 South Main Street" → {"st"}. */
function streetTypes(s) {
  return new Set(String(s).toLowerCase().split(/[^a-z]+/).map(w => STREET_TYPES[w]).filter(Boolean));
}

/** "412 S Main St, Georgetown, TX 78626". A place also gets its street address. */
function esriLabel(a) {
  const parts = [a.ShortLabel, a.Addr_type === "POI" ? a.StAddr : "", a.City, [a.RegionAbbr, a.Postal].filter(Boolean).join(" ")];
  return parts.filter((p, i) => p && parts.indexOf(p) === i).join(", ");
}

async function censusLookup(query, near) {
  const url = `${CENSUS}?address=${encodeURIComponent(query)}&benchmark=Public_AR_Current&format=json`;
  const r = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`census ${r.status}`);
  const data = await r.json();
  return (data?.result?.addressMatches ?? [])
    .filter(m => Number.isFinite(m?.coordinates?.y) && Number.isFinite(m?.coordinates?.x))
    .map(m => ({
      latitude: m.coordinates.y,
      longitude: m.coordinates.x,
      label: titleCase(m.matchedAddress),
      precision: "address",
      source: "census",
    }))
    .sort((x, y) => (near ? distanceMeters(near, x) - distanceMeters(near, y) : 0));
}

/** A house number or an intersection. "Georgetown High School" is not one. */
function looksLikeStreetAddress(q) {
  return /\d/.test(q) || /\s(&|and|at|\/)\s/i.test(q);
}

/** "412 S MAIN ST, GEORGETOWN, TX, 78626" → "412 S Main St, Georgetown, TX, 78626". */
function titleCase(s) {
  return String(s ?? "").toLowerCase()
    .replace(/\b([a-z])/g, c => c.toUpperCase())
    .replace(/\b(Ne|Nw|Se|Sw|Fm|Cr|Us|Sh)\b/g, m => m.toUpperCase())
    .replace(/\b([A-Z][a-z])(?=,?\s*\d{5}\b)/g, m => m.toUpperCase());
}

// ---------------------------------------------------------------------------

const cache = new Map();
function remember(key, results) {
  // Misses are kept for half an hour only, so a typo fixed upstream or a new street shows up soon.
  cache.set(key, { results, expires: Date.now() + (results.length ? 24 * 3600_000 : 30 * 60_000) });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
}

const sessions = new Map();
export async function signedIn(authCheckUrl, cookie) {
  if (!cookie) return false;
  const known = sessions.get(cookie);
  if (known && known.expires > Date.now()) return known.ok;
  let ok = false;
  try {
    const r = await fetch(authCheckUrl, { headers: { cookie, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    ok = r.ok;
  } catch { /* API unreachable: refuse rather than relay for anyone */ }
  sessions.set(cookie, { ok, expires: Date.now() + (ok ? 5 * 60_000 : 15_000) });
  if (sessions.size > 1000) sessions.delete(sessions.keys().next().value);
  return ok;
}

const hits = new Map();
/** 40 lookups a minute per address — plenty for a board, little use to a scraper. */
function rateOk(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < 60_000);
  if (recent.length >= 40) { hits.set(ip, recent); return false; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return true;
}

export function clientIp(req) {
  return String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "?";
}

function parseNear(raw) {
  const m = String(raw ?? "").match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const latitude = Number(m[1]), longitude = Number(m[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) return null;
  return { latitude, longitude };
}

export function send(res, status, body, cacheControl = "no-store") {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", cacheControl);
  res.end(JSON.stringify(body));
}

const round6 = n => Math.round(n * 1e6) / 1e6;
const toRad = d => (d * Math.PI) / 180;
function distanceMeters(a, b) {
  const dLat = toRad(b.latitude - a.latitude), dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
