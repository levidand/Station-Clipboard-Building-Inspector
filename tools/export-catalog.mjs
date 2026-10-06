// Regenerates server/demo-catalog.json from the Department Portal's default
// catalog (artifacts/api-server/src/lib/inspectionsCatalog.ts), so the demo
// starts departments with exactly the lists the real API does.
//
//   node tools/export-catalog.mjs [path to the Department-Portal repo]
//
// Needs Node 22.6 or newer (it loads the TypeScript files with type stripping).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = process.argv[2] ?? "C:/Users/levid/Desktop/Department-Portal-main/Department-Portal";
const lib = path.join(repo, "artifacts/api-server/src/lib");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ip-catalog-"));

// Their only runtime import of each other needs a .ts extension to load directly.
fs.copyFileSync(path.join(lib, "inspectionsLogic.ts"), path.join(tmp, "inspectionsLogic.ts"));
fs.writeFileSync(path.join(tmp, "inspectionsCatalog.ts"),
  fs.readFileSync(path.join(lib, "inspectionsCatalog.ts"), "utf8").replace('from "./inspectionsLogic";', 'from "./inspectionsLogic.ts";'));

const cat = await import(pathToFileURL(path.join(tmp, "inspectionsCatalog.ts")).href);
const { DEFAULT_FREQUENCY_MONTHS } = await import(pathToFileURL(path.join(tmp, "inspectionsLogic.ts")).href);

const kinds = ["special_event", "fireworks", "public_education", "station_tour", "smoke_alarms", "standby", "other"];
const out = {
  note: "Generated from Department-Portal artifacts/api-server/src/lib/inspectionsCatalog.ts by tools/export-catalog.mjs. Regenerate after changing it.",
  frequencyMonths: DEFAULT_FREQUENCY_MONTHS,
  inspectionTypes: cat.DEFAULT_INSPECTION_TYPES,
  permitTypes: cat.DEFAULT_PERMIT_TYPES,
  caseTypes: cat.DEFAULT_CASE_TYPES,
  fees: cat.DEFAULT_FEES,
  letter: cat.DEFAULT_LETTER,
  violationCodes: { "2018": cat.defaultViolationCodes("2018"), "2021": cat.defaultViolationCodes("2021") },
  checklists: { "2018": cat.defaultChecklists("2018"), "2021": cat.defaultChecklists("2021") },
  typeChecklist: cat.DEFAULT_TYPE_CHECKLIST,
  eventTasks: Object.fromEntries(kinds.map(k => [k, cat.eventTasksFor(k, [])])),
  eventFeatureTasks: cat.EVENT_FEATURE_TASKS,
  library: cat.LIBRARY.map(l => ({ id: l.id, ref2018: l.ref2018, ref2021: l.ref2021, check: l.check, check2018: l.check2018 ?? l.check })),
};
const target = path.join(here, "../server/demo-catalog.json");
fs.writeFileSync(target, JSON.stringify(out, null, 1));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Wrote ${target}: ${out.violationCodes["2021"].length} violation codes, ${out.checklists["2021"].length} checklists.`);
