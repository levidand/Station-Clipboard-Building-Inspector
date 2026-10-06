// Keeps src/shared/ (the title bar) the same in every StationClipboard portal
// on this computer: any folder next to this one that has this script too.
// Edit the shared files in any of them and the next sync carries the edit to
// the rest. It runs before `npm run dev`, `npm run build` and the Start scripts.
//
//   node tools/sync-shared.mjs              sync
//   node tools/sync-shared.mjs --check      only say what would change; exit 1 if anything would
//   node tools/sync-shared.mjs --keep-this  settle conflicts with this folder's copy
//
// tools/shared-sync.json records every file as it was at the last sync, so the
// script can tell which copy was edited. A file edited differently in two
// places is a conflict: it's left alone, named, and the sync exits 1. With no
// other portal next to this one (a server, Replit) there's nothing to do.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHARED = "src/shared";
const SCRIPT = "tools/sync-shared.mjs";
const STATE = "tools/shared-sync.json";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const keepThis = argv.includes("--keep-this");

const parent = path.dirname(here);
const others = fs.readdirSync(parent, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => path.join(parent, d.name))
  .filter(dir => path.relative(dir, here) !== "" && fs.existsSync(path.join(dir, SCRIPT)));

if (!others.length) {
  console.log("sync-shared: no other portal next to this one, nothing to sync.");
  process.exit(0);
}

/** This folder first: --keep-this and the messages count on it. */
const copies = [here, ...others].map(root => ({ root, name: path.basename(root), files: readFiles(root), state: readState(root) }));
for (const c of copies) c.next = { ...c.state };

const paths = [...new Set(copies.flatMap(c => [...c.files.keys(), ...Object.keys(c.state)]))].sort();
const writes = [];
const conflicts = [];

for (const p of paths) {
  const seen = copies.map(c => ({ copy: c, file: c.files.get(p) ?? null, base: c.state[p] ?? null }));
  const hash = s => s.file?.hash ?? null;
  // Edited since the last sync: different from what this copy's own record says.
  const edited = seen.filter(s => hash(s) !== s.base);

  let winner;
  if (new Set(seen.map(hash)).size === 1) winner = seen[0];
  else if (edited.length && new Set(edited.map(hash)).size === 1) winner = edited[0];
  else if (keepThis) winner = seen[0];
  else {
    conflicts.push({ p, names: (edited.length ? edited : seen).map(s => s.copy.name) });
    continue;
  }

  const final = winner.file;
  for (const s of seen) {
    if (hash(s) !== (final?.hash ?? null)) writes.push({ p, from: winner.copy, to: s.copy, file: final });
    if (final) s.copy.next[p] = final.hash;
    else delete s.copy.next[p];
  }
}

for (const w of writes) {
  console.log(`sync-shared: ${w.p}  ${w.file ? `${w.from.name} → ${w.to.name}` : `deleted in ${w.from.name}, deleting in ${w.to.name}`}`);
  if (checkOnly) continue;
  const dest = path.join(w.to.root, w.p);
  if (w.file) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, w.file.bytes);
  } else {
    fs.rmSync(dest, { force: true });
  }
}

if (!checkOnly) {
  for (const c of copies) {
    const sorted = Object.fromEntries(Object.keys(c.next).sort().map(k => [k, c.next[k]]));
    const text = JSON.stringify(sorted, null, 2) + "\n";
    const file = path.join(c.root, STATE);
    const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
    if (old !== text) fs.writeFileSync(file, text);
  }
}

for (const c of conflicts) {
  console.error(`sync-shared: ${c.p} was changed differently in: ${c.names.join(", ")}.`);
}
if (conflicts.length) {
  console.error(
    "sync-shared: make those copies match by hand, or run `node tools/sync-shared.mjs --keep-this`\n" +
    "  in the folder whose copy should win. Nothing else was held up.",
  );
  process.exit(1);
}
if (!writes.length) console.log(`sync-shared: up to date with ${others.map(o => path.basename(o)).join(", ")}.`);
if (checkOnly && writes.length) process.exit(1);

// ---------------------------------------------------------------------------

function readFiles(root) {
  const rels = [SCRIPT];
  const walk = rel => {
    for (const d of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const child = `${rel}/${d.name}`;
      if (d.isDirectory()) walk(child);
      else rels.push(child);
    }
  };
  if (fs.existsSync(path.join(root, SHARED))) walk(SHARED);
  const files = new Map();
  for (const rel of rels) {
    const bytes = fs.readFileSync(path.join(root, rel));
    // Git on Windows may check a file out with CRLF in one folder and LF in the other.
    const hash = crypto.createHash("sha256").update(bytes.toString("utf8").replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
    files.set(rel, { bytes, hash });
  }
  return files;
}

function readState(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, STATE), "utf8"));
  } catch {
    return {};
  }
}
