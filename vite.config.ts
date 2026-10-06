import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { geocodeMiddleware } from "./server/geocode.mjs";

// The browser only ever talks to /api on its own origin. In dev, Vite forwards
// that to the Department Portal API (or the local demo API), so the session
// cookie is first-party and no CORS or third-party-cookie rules apply.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = mode === "demo"
    ? `http://localhost:${env.DEMO_API_PORT || 4711}`
    : env.API_TARGET || "https://go.stationclipboard.com";
  const geocode = geocodeMiddleware({ authCheckUrl: `${target}/api/auth/me`, arcgisKey: env.ARCGIS_API_KEY ?? "" });

  return {
    plugins: [
      react(),
      tailwindcss(),
      // /ip/geocode, the same route server/index.mjs serves in production.
      {
        name: "inspection-portal-geocode",
        configureServer(server) { server.middlewares.use("/ip/geocode", geocode); },
        configurePreviewServer(server) { server.middlewares.use("/ip/geocode", geocode); },
      },
    ],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
    server: {
      host: true,
      allowedHosts: true,
      port: Number(env.PORT || 4710),
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          secure: true,
          // Drop the API host's Domain so the browser files the cookie under
          // this origin.
          cookieDomainRewrite: "",
          // Over plain HTTP (e.g. a tablet on the LAN) a Secure cookie is
          // dropped by the browser. See server/index.mjs for the same rule.
          configure(proxy) {
            proxy.on("proxyRes", (res, req) => {
              const https = req.headers["x-forwarded-proto"] === "https";
              const cookies = res.headers["set-cookie"];
              if (!cookies || https) return;
              res.headers["set-cookie"] = cookies.map(c => c
                .replace(/;\s*Secure/gi, "")
                .replace(/;\s*SameSite=None/gi, "; SameSite=Lax"));
            });
          },
        },
      },
    },
    preview: { port: Number(env.PORT || 4710) },
    build: { outDir: "dist", sourcemap: false },
  };
});
