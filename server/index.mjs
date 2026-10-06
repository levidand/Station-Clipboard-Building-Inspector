// StationClipboard Inspection Portal — production server.
//
// Serves the built app from dist/ and forwards /api to the Department Portal
// API, so the browser only ever talks to one origin and the session cookie is
// first-party. Same arrangement as the Command Portal.
//
//   node server/index.mjs                     proxy to API_TARGET (default production)
//   node server/index.mjs --demo              use the in-memory demo API instead
//   node server/index.mjs --demo --api-only   demo API only (for `npm run dev:demo`)

import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createProxyMiddleware } from "http-proxy-middleware";
import { geocodeMiddleware } from "./geocode.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
loadDotEnv(path.join(root, ".env"));

const args = new Set(process.argv.slice(2));
const DEMO = args.has("--demo") || process.env.DEMO === "1";
const API_ONLY = args.has("--api-only");
const API_TARGET = process.env.API_TARGET || "https://go.stationclipboard.com";
const PORT = Number(API_ONLY ? process.env.DEMO_API_PORT || 4711 : process.env.PORT || 4710);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Address lookup when adding a business, a complaint or an event. The only
// route this server answers itself; everything under /api belongs to the
// Department Portal.
const authCheckUrl = DEMO ? `http://127.0.0.1:${PORT}/api/auth/me` : `${API_TARGET}/api/auth/me`;
app.use("/ip/geocode", geocodeMiddleware({ authCheckUrl, arcgisKey: process.env.ARCGIS_API_KEY ?? "" }));

if (DEMO) {
  const { demoRouter } = await import("./demo.mjs");
  app.use("/api", express.json({ limit: "8mb" }), demoRouter());
} else {
  app.use("/api", createProxyMiddleware({
    target: API_TARGET + "/api",
    changeOrigin: true,
    cookieDomainRewrite: "",
    xfwd: true,
    on: {
      proxyRes(proxyRes, req) {
        proxyRes.headers["set-cookie"] = adaptCookies(proxyRes.headers["set-cookie"], isHttps(req));
      },
      error(err, _req, res) {
        if (res && "writeHead" in res && !res.headersSent) {
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: `Can't reach the Department Portal API (${err.code ?? err.message}).` }));
        }
      },
    },
  }));
}

if (!API_ONLY) {
  const dist = path.join(root, "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    console.error("dist/ is missing — run `npm run build` first.");
    process.exit(1);
  }
  app.use(express.static(dist, {
    index: false,
    maxAge: "1h",
    // The page is checked every time so a deploy shows up at once; the hashed
    // files under assets/ never change under the same name.
    setHeaders(res, file) {
      if (path.basename(file) === "index.html") res.setHeader("Cache-Control", "no-cache");
      else if (path.relative(dist, file).startsWith(`assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }));
  // Client-side routes all resolve to the app shell.
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, "index.html"), { headers: { "Cache-Control": "no-cache" } }));
}

app.listen(PORT, (err) => {
  if (err) {
    console.error(`Couldn't listen on port ${PORT}: ${err.code ?? err.message}. Set PORT to another value.`);
    process.exit(1);
  }
  const mode = DEMO ? "DEMO data (in memory)" : `API → ${API_TARGET}`;
  console.log(`Inspection Portal ${API_ONLY ? "demo API" : "server"} on http://localhost:${PORT}  [${mode}]`);
});

// The API marks its cookie Secure + SameSite=None. That is right behind HTTPS
// but a browser silently drops a Secure cookie on plain HTTP from anything but
// localhost — e.g. a tablet hitting this server by LAN IP — which looks like a
// login that "doesn't stick". Over plain HTTP, downgrade to a first-party Lax
// cookie instead; over HTTPS, pass it through untouched.
function adaptCookies(cookies, https) {
  if (!cookies || https) return cookies;
  return cookies.map(c => c
    .replace(/;\s*Secure/gi, "")
    .replace(/;\s*SameSite=None/gi, "; SameSite=Lax"));
}

function isHttps(req) {
  return req.socket?.encrypted || String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() === "https";
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
