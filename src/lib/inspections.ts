import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, get } from "./api";
import type {
  CaseResolution, CaseSource, CaseStatus, CasePriority, CauseClass, Checklist, Discipline, DueState, EventKind, EventStatus,
  FileRef, InspectionResult, InspectionStatus, InvestigationStatus, PermitCategory, PermitStatus, Person, RiskClass,
  Settings, Severity, ViolationStatus,
} from "./types";
import type { Tone } from "@/components/ui";

export const BASE = "/api/inspections";

/** React Query keys. Lists share a prefix with their records, so an edit refreshes both. */
export const keys = {
  settings: [BASE, "settings"] as const,
  people: [BASE, "people"] as const,
  checklists: [BASE, "checklists"] as const,
  today: [BASE, "today"] as const,
  map: [BASE, "map"] as const,
  properties: [BASE, "properties"] as const,
  property: (id: number) => [BASE, "properties", id] as const,
  inspections: [BASE, "inspections"] as const,
  inspection: (id: number) => [BASE, "inspections", id] as const,
  violations: [BASE, "violations"] as const,
  permits: [BASE, "permits"] as const,
  permit: (id: number) => [BASE, "permits", id] as const,
  cases: [BASE, "cases"] as const,
  case: (id: number) => [BASE, "cases", id] as const,
  events: [BASE, "events"] as const,
  event: (id: number) => [BASE, "events", id] as const,
  investigations: [BASE, "investigations"] as const,
  investigation: (id: number) => [BASE, "investigations", id] as const,
};

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: ({ signal }) => get<Settings>(`${BASE}/settings`, signal), staleTime: 5 * 60_000 });
}

export function usePeople() {
  return useQuery({ queryKey: keys.people, queryFn: ({ signal }) => get<Person[]>(`${BASE}/people`, signal), staleTime: 5 * 60_000 });
}

export function useChecklists() {
  return useQuery({ queryKey: keys.checklists, queryFn: ({ signal }) => get<Checklist[]>(`${BASE}/checklists`, signal), staleTime: 60_000 });
}

/** After any change: everything under /api/inspections reloads when next shown. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [BASE] });
}

// ---------------------------------------------------------------------------
// Words and colours. Colour always rides with a word, never alone.
// ---------------------------------------------------------------------------

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  fire: "Fire", building: "Building", code: "Code enforcement", event: "Event",
};

export const INSPECTION_STATUS: Record<InspectionStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Scheduled", tone: "brand" },
  in_progress: { label: "In progress", tone: "warn" },
  completed: { label: "Finished", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export const RESULT: Record<InspectionResult, { label: string; tone: Tone; help: string }> = {
  pass: { label: "Passed", tone: "ok", help: "Nothing wrong, or everything was fixed on the spot." },
  fail: { label: "Failed", tone: "danger", help: "Violations were written. A re-inspection is usually needed." },
  partial: { label: "Partly done", tone: "warn", help: "Some of the building was inspected; the rest needs another visit." },
  no_access: { label: "No access", tone: "muted", help: "Nobody let you in. Nothing was inspected; the due date doesn't move." },
  not_ready: { label: "Not ready", tone: "muted", help: "The work wasn't ready to inspect. The due date doesn't move." },
};

export const RISK: Record<RiskClass, { label: string; tone: Tone; help: string }> = {
  high: { label: "High risk", tone: "danger", help: "Assembly, schools, daycare, health care, apartments, hotels, industry. Inspected every year." },
  moderate: { label: "Moderate risk", tone: "warn", help: "Ambulatory health care, light industry. Inspected every two years." },
  low: { label: "Low risk", tone: "ok", help: "Offices, shops and storage. Inspected every three years." },
  critical: { label: "Critical infrastructure", tone: "info", help: "Water treatment, power, public safety buildings. Inspected every year." },
};

export const SEVERITY: Record<Severity, { label: string; tone: Tone; help: string }> = {
  imminent: { label: "Immediate danger", tone: "danger", help: "A danger to life right now, like a chained exit. Fixed on the spot, or the use stops." },
  critical: { label: "Critical", tone: "danger", help: "A fire protection system out of service. 24 hours, with a fire watch." },
  serious: { label: "Serious", tone: "warn", help: "Expired service, missing extinguishers, exit lights out. About two weeks." },
  minor: { label: "Minor", tone: "info", help: "Storage, labels, address numbers, housekeeping. About 30 days." },
};

export const VIOLATION_STATUS: Record<ViolationStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "warn" },
  corrected: { label: "Corrected", tone: "ok" },
  cited: { label: "Cited", tone: "danger" },
  void: { label: "Void", tone: "muted" },
};

export const DUE: Record<DueState, { label: string; tone: Tone }> = {
  overdue: { label: "Overdue", tone: "danger" },
  due_soon: { label: "Due soon", tone: "warn" },
  current: { label: "Up to date", tone: "ok" },
  none: { label: "Not on the program", tone: "muted" },
};

export const PERMIT_CATEGORY: Record<PermitCategory, string> = {
  operational: "Operational", construction: "Construction", building: "Building", event: "Event",
};

export const PERMIT_STATUS: Record<PermitStatus, { label: string; tone: Tone }> = {
  applied: { label: "Applied", tone: "brand" },
  in_review: { label: "In review", tone: "info" },
  corrections: { label: "Corrections needed", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  issued: { label: "Issued", tone: "ok" },
  finaled: { label: "Finaled", tone: "muted" },
  denied: { label: "Denied", tone: "danger" },
  expired: { label: "Expired", tone: "muted" },
  void: { label: "Void", tone: "muted" },
};

export const CASE_STATUS: Record<CaseStatus, { label: string; tone: Tone }> = {
  open: { label: "New", tone: "brand" },
  investigating: { label: "Looking into it", tone: "info" },
  notice: { label: "Notice sent", tone: "warn" },
  cited: { label: "Cited", tone: "danger" },
  abatement: { label: "Abatement", tone: "danger" },
  closed: { label: "Closed", tone: "muted" },
};

export const CASE_RESOLUTION: Record<CaseResolution, string> = {
  complied: "Owner fixed it", abated: "City fixed it (abatement)", unfounded: "Nothing wrong found",
  duplicate: "Duplicate complaint", referred: "Sent to another agency", other: "Other",
};

export const CASE_SOURCE: Record<CaseSource, string> = {
  complaint: "A complaint", observed: "Seen by staff", referral: "Referred by another agency",
};

export const CASE_PRIORITY: Record<CasePriority, { label: string; tone: Tone }> = {
  high: { label: "High priority", tone: "danger" }, normal: { label: "Normal", tone: "muted" }, low: { label: "Low", tone: "muted" },
};

export const NOTICE_METHODS = [
  "Handed to the owner", "First-class mail", "Certified mail", "Posted on the property", "Email", "Published in the newspaper",
];

export const EVENT_KIND: Record<EventKind, string> = {
  special_event: "Special event", fireworks: "Fireworks show", public_education: "Public education",
  station_tour: "Station tour", smoke_alarms: "Smoke alarm install", standby: "Standby", other: "Other",
};

export const EVENT_STATUS: Record<EventStatus, { label: string; tone: Tone }> = {
  planning: { label: "Planning", tone: "brand" },
  approved: { label: "Approved", tone: "ok" },
  completed: { label: "Done", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

/** What can be at an event. Keys match the Department Portal's EVENT_FEATURE_TASKS. */
export const EVENT_FEATURES: { key: string; label: string }[] = [
  { key: "large_crowd", label: "A large crowd" },
  { key: "tents", label: "Tents or canopies" },
  { key: "cooking", label: "Cooking or food trucks" },
  { key: "fireworks", label: "Fireworks" },
  { key: "generators", label: "Generators" },
  { key: "stage", label: "A stage or rigging" },
  { key: "alcohol", label: "Alcohol" },
  { key: "road_closure", label: "Road closures" },
  { key: "open_burning", label: "A bonfire or open burning" },
  { key: "amusement_rides", label: "Amusement rides" },
];

export const INVESTIGATION_STATUS: Record<InvestigationStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "brand" },
  pending: { label: "Waiting on lab or information", tone: "warn" },
  closed: { label: "Closed", tone: "muted" },
};

export const CAUSE_CLASS: Record<CauseClass, { label: string; help: string }> = {
  accidental: { label: "Accidental", help: "No deliberate act to start the fire." },
  natural: { label: "Natural", help: "Lightning, earthquake, wind, without human involvement." },
  incendiary: { label: "Incendiary", help: "Set on purpose where it shouldn't have been." },
  undetermined: { label: "Undetermined", help: "The cause can't be proven to the needed level of certainty." },
};

/** NERIS fire cause values (structure_fire_cause and outside_fire_cause), github.com/ulfsri/neris-framework. */
export const NERIS_CAUSES: { value: string; label: string }[] = [
  { value: "COOKING", label: "Cooking" },
  { value: "ELECTRICAL", label: "Electrical" },
  { value: "OPERATING_EQUIPMENT", label: "Operating equipment" },
  { value: "BATTERY_POWER_STORAGE", label: "Battery / power storage" },
  { value: "HEAT_FROM_ANOTHER_OBJECT", label: "Heat from another object" },
  { value: "OPEN_FLAME", label: "Open flame" },
  { value: "SMOKING_MATERIALS_ILLICIT_DRUGS", label: "Smoking materials / illicit drugs" },
  { value: "CHEMICAL", label: "Chemical" },
  { value: "EXPLOSIVES_FIREWORKS", label: "Explosives / fireworks" },
  { value: "ACT_OF_NATURE", label: "Act of nature" },
  { value: "INCENDIARY", label: "Incendiary" },
  { value: "DEBRIS_OPEN_BURNING", label: "Debris or open burning (outside)" },
  { value: "EQUIPMENT_VEHICLE_USE", label: "Equipment or vehicle use (outside)" },
  { value: "RECREATION_CEREMONY", label: "Recreation or ceremony (outside)" },
  { value: "POWER_GEN_TRANS_DIST", label: "Power lines (outside)" },
  { value: "OTHER_HEAT_SOURCE", label: "Other heat source" },
  { value: "UNABLE_TO_BE_DETERMINED", label: "Unable to be determined" },
];

/** IBC/IFC use groups, in plain English. */
export const OCCUPANCY_CLASSES: { code: string; label: string }[] = [
  { code: "A-1", label: "Assembly: theaters, concert halls (fixed seats)" },
  { code: "A-2", label: "Assembly: restaurants, bars, banquet halls" },
  { code: "A-3", label: "Assembly: churches, gyms, libraries, community halls" },
  { code: "A-4", label: "Assembly: indoor arenas and rinks" },
  { code: "A-5", label: "Assembly: stadiums and bleachers" },
  { code: "B", label: "Business: offices, banks, clinics, salons" },
  { code: "E", label: "Educational: schools, daycare over 2½ years" },
  { code: "F-1", label: "Factory: moderate hazard" },
  { code: "F-2", label: "Factory: low hazard" },
  { code: "H-1", label: "Hazardous: explosives" },
  { code: "H-2", label: "Hazardous: flammable liquids, dust" },
  { code: "H-3", label: "Hazardous: readily combustible materials" },
  { code: "H-4", label: "Hazardous: corrosives, toxics" },
  { code: "H-5", label: "Hazardous: semiconductor fabrication" },
  { code: "I-1", label: "Institutional: assisted living over 16 people" },
  { code: "I-2", label: "Institutional: hospitals, nursing homes" },
  { code: "I-3", label: "Institutional: jails" },
  { code: "I-4", label: "Institutional: adult day care, infant care" },
  { code: "M", label: "Mercantile: stores, markets, fuel stations" },
  { code: "R-1", label: "Residential: hotels and motels" },
  { code: "R-2", label: "Residential: apartments, dorms" },
  { code: "R-3", label: "Residential: houses, small group homes" },
  { code: "R-4", label: "Residential: care homes for 6 to 16" },
  { code: "S-1", label: "Storage: moderate hazard, repair garages" },
  { code: "S-2", label: "Storage: low hazard, parking garages" },
  { code: "U", label: "Utility: sheds, barns, towers" },
];

export function typeLabel(list: { key: string; label: string }[] | undefined, key: string): string {
  return list?.find(t => t.key === key)?.label ?? key.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export type RecordKind = "inspections" | "violations" | "permits" | "cases" | "events" | "investigations";

export function fileUrl(kind: RecordKind, id: number, file: FileRef, download = false): string {
  return `${BASE}/files/${kind}/${id}?key=${encodeURIComponent(file.key)}${download ? "&download=1" : ""}`;
}

/**
 * Sends one photo or PDF. Phone photos are big; anything over 2,000 px is
 * scaled down first, which keeps an upload on a weak signal to a few hundred KB.
 */
export async function uploadFile(kind: RecordKind, id: number, file: File): Promise<FileRef[]> {
  const body = file.type.startsWith("image/") && file.type !== "image/gif" ? await shrinkImage(file) : file;
  return api<FileRef[]>("POST", `${BASE}/files/${kind}/${id}`, undefined, {
    raw: body, headers: { "x-file-name": encodeURIComponent(file.name) }, timeoutMs: 120_000,
  });
}

export async function deleteFile(kind: RecordKind, id: number, key: string): Promise<FileRef[]> {
  return api<FileRef[]>("DELETE", `${BASE}/files/${kind}/${id}?key=${encodeURIComponent(key)}`);
}

async function shrinkImage(file: File, max = 2000): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) { bitmap.close(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file;
  }
}
