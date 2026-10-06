// Makes sure node_modules/ and dist/ match the source before the start scripts
// launch the server. Without this, a dist/ built before later edits keeps being
// served and the app looks unchanged.
//
//   node server/ensure-build.mjs     exit 0 when up to date (or rebuilt), 1 on failure
//
// Rollup is pinned to 4.63.6 in package.json "overrides": 4.64.0's
// call-argument tree-shaking never finishes on react-dom's beginWork.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Bring in title-bar edits made in the other portal first (src/shared).
run("node tools/sync-shared.mjs");

// npm rewrites node_modules/.package-lock.json on every install.
const installed = mtime(path.join(root, "node_modules", ".package-lock.json"));
if (installed < newest(["package.json", "package-lock.json"])) {
  console.log(installed ? "package.json changed since the last install. Installing..." : "Installing dependencies...");
  run("npm install --no-audit --no-fund");
}

const built = mtime(path.join(root, "dist", "index.html"));
const sources = ["src", "public", "index.html", "vite.config.ts", "tsconfig.json", "package.json", "package-lock.json", ".env"];
if (built < newest(sources)) {
  console.log(built ? "Source changed since the last build. Rebuilding..." : "Building...");
  run("npm run build");
}

function run(command) {
  const { status } = spawnSync(command, { cwd: root, stdio: "inherit", shell: true });
  if (status !== 0) process.exit(1);
}

function newest(entries) {
  return Math.max(0, ...entries.map(entry => newestIn(path.join(root, entry))));
}

function newestIn(file) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.mtimeMs;
  return Math.max(stat.mtimeMs, ...fs.readdirSync(file).map(name => newestIn(path.join(file, name))));
}

function mtime(file) {
  return fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0;
}
