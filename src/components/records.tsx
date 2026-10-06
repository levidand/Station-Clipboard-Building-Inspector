import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Building2, Camera, CheckCircle2, ExternalLink, FileText, Loader2, MapPin, Trash2, Upload } from "lucide-react";
import { api, errorMessage, get } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { portalTarget, signedInHref } from "@/shared/departmentPortal";
import { dateTime, formatDay, plural, relativeDay, timeOfDay, todayKey } from "@/lib/format";
import {
  BASE, DISCIPLINE_LABELS, INSPECTION_STATUS, RESULT, SEVERITY, VIOLATION_STATUS, deleteFile, fileUrl, keys, typeLabel,
  uploadFile, useChecklists, usePeople, useRefreshAll, useSettings, type RecordKind,
} from "@/lib/inspections";
import type {
  Discipline, FileRef, HistoryLine, InspectionDetail, InspectionRow, Listed, Person, PropertyRow, Violation,
} from "@/lib/types";
import { Badge, Button, Field, IconButton, Input, Modal, Segmented, Select, Textarea, TONE_EDGE, cx } from "./ui";
import { ActionMenu, Box, EmptyBox, ListRow, Note, NoteComposer } from "./kit";
import { toast } from "./toast";

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/**
 * Who something is assigned to. Inspectors (or code officers, or
 * investigators) are listed first; anyone else who can open the portal
 * follows, because in a small department the chief does inspections too.
 */
export function PersonSelect({ value, onChange, prefer = "inspects", allowNone = true, noneLabel = "Not assigned yet", id }: {
  value: number | null; onChange: (id: number | null) => void; prefer?: keyof Pick<Person, "inspects" | "enforces" | "investigates">;
  allowNone?: boolean; noneLabel?: string; id?: string;
}) {
  const people = usePeople();
  const { session } = useAuth();
  const list = people.data ?? [];
  const first = list.filter(p => p[prefer]);
  const rest = list.filter(p => !p[prefer]);
  return (
    <Select id={id} value={value ?? ""} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
      {allowNone && <option value="">{noneLabel}</option>}
      {session && <option value={session.id}>Me ({session.firstName} {session.lastName})</option>}
      {first.filter(p => p.id !== session?.id).length > 0 && (
        <optgroup label={prefer === "investigates" ? "Investigators" : prefer === "enforces" ? "Code officers" : "Inspectors"}>
          {first.filter(p => p.id !== session?.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </optgroup>
      )}
      {rest.filter(p => p.id !== session?.id).length > 0 && (
        <optgroup label="Others">
          {rest.filter(p => p.id !== session?.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </optgroup>
      )}
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Where: a business, or an address
// ---------------------------------------------------------------------------

export interface Place {
  preplanId: number | null; placeName: string | null; address: string | null; latitude: number | null; longitude: number | null;
}

export const NO_PLACE: Place = { preplanId: null, placeName: null, address: null, latitude: null, longitude: null };

/**
 * Picks where something is. Most of the time it's a business the department
 * already has (a preplan), picked by typing part of its name or address; a
 * house, a lot or a construction site isn't one, so an address can be typed
 * instead, and looked up on the map.
 */
export function PlacePicker({ value, onChange, allowAddress = true, addressOnly = false, label = "Where" }: {
  value: Place; onChange: (p: Place) => void; allowAddress?: boolean; addressOnly?: boolean; label?: string;
}) {
  const [mode, setMode] = useState<"business" | "address">(
    addressOnly ? "address" : value.preplanId || !allowAddress ? "business" : value.address ? "address" : "business",
  );
  const [q, setQ] = useState("");
  const props = useQuery({
    queryKey: keys.properties,
    queryFn: ({ signal }) => get<Listed<PropertyRow>>(`${BASE}/properties`, signal),
    staleTime: 60_000,
  });
  const matches = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return (props.data?.rows ?? []).filter(p => words.every(w => `${p.name} ${p.address}`.toLowerCase().includes(w)));
  }, [q, props.data]);
  // The best few, shown whole: a little scroll box inside a dialog is hard to work on a tablet.
  const shown = matches.slice(0, 6);
  const [looking, setLooking] = useState(false);

  async function lookUp() {
    if (!value.address?.trim()) return;
    setLooking(true);
    try {
      const res = await get<{ results: { latitude: number; longitude: number; label: string; precision: string }[] }>(
        `/ip/geocode?q=${encodeURIComponent(value.address)}&limit=1`,
      );
      const hit = res.results[0];
      if (hit) {
        onChange({ ...value, latitude: hit.latitude, longitude: hit.longitude });
        toast.success(`Found on the map: ${hit.label}`);
      } else toast.error("That address wasn't found on the map. It's saved as typed.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally { setLooking(false); }
  }

  return (
    <div className="space-y-3">
      <span className="block text-[15px] font-medium text-ink">{label}</span>
      {allowAddress && !addressOnly && (
        <Segmented
          value={mode}
          onChange={m => { setMode(m); onChange(NO_PLACE); }}
          options={[{ value: "business", label: "A business" }, { value: "address", label: "An address" }]}
        />
      )}
      {mode === "business" ? (
        value.preplanId ? (
          <div className="flex items-center gap-3 border border-faded bg-odd px-4 py-3">
            <Building2 className="h-6 w-6 shrink-0 text-orange" />
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-medium">{value.placeName}</div>
              <div className="text-[15px] text-ink-3">{value.address}</div>
            </div>
            <Button variant="ghost" onClick={() => onChange(NO_PLACE)}>Change</Button>
          </div>
        ) : (
          <div>
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Type part of the business name or address" autoFocus />
            {q.trim() && (
              <Box className="mt-1">
                {matches.length === 0 ? (
                  <p className="px-4 py-3 text-[15px] text-ink-3">
                    No business matches.{allowAddress ? " Choose “An address” to type it in, or add the business on the Businesses page." : ""}
                  </p>
                ) : shown.map(p => (
                  <button
                    key={p.preplanId} type="button"
                    onClick={() => { onChange({ preplanId: p.preplanId, placeName: p.name, address: p.address, latitude: p.latitude, longitude: p.longitude }); setQ(""); }}
                    className="block w-full border-b border-divider px-4 py-3 text-left last:border-b-0 hover:bg-hover"
                  >
                    <span className="block text-[17px] text-ink">{p.name}</span>
                    <span className="block text-[15px] text-ink-3">{p.address}</span>
                  </button>
                ))}
                {matches.length > shown.length && (
                  <p className="border-t border-divider px-4 py-2.5 text-[15px] text-ink-3">
                    {matches.length - shown.length} more {matches.length - shown.length === 1 ? "business matches" : "businesses match"}. Keep typing to narrow it down.
                  </p>
                )}
              </Box>
            )}
          </div>
        )
      ) : (
        <div className="space-y-3">
          <Field label="Street address">
            <div className="flex gap-2">
              <Input
                value={value.address ?? ""} placeholder="123 Main St, Iowa Colony, TX"
                onChange={e => onChange({ ...value, preplanId: null, address: e.target.value, latitude: null, longitude: null })}
              />
              <Button onClick={lookUp} loading={looking} disabled={!value.address?.trim()} className="shrink-0">
                <MapPin className="h-4 w-4" />Find
              </Button>
            </div>
          </Field>
          {value.latitude != null && <Note>On the map at {value.latitude.toFixed(5)}, {value.longitude?.toFixed(5)}.</Note>}
          {!addressOnly && (
            <Field label="Name of the place (optional)" hint="A business name, a subdivision and lot, or a landmark.">
              <Input value={value.placeName ?? ""} onChange={e => onChange({ ...value, placeName: e.target.value })} />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** An inspection in a list: what, where, when, who, and how it came out. */
export function InspectionListRow({ row, today, showPlace = true }: { row: InspectionRow; today: string; showPlace?: boolean }) {
  const settings = useSettings();
  const late = row.status !== "completed" && row.status !== "cancelled" && !!row.scheduledOn && row.scheduledOn < today;
  const state = row.status === "completed" && row.result ? RESULT[row.result] : INSPECTION_STATUS[row.status];
  const when = row.status === "completed"
    ? `Done ${dateTime(row.completedAt)}`
    : row.scheduledOn ? `${formatDay(row.scheduledOn)}${row.scheduledTime ? `, ${timeOfDay(row.scheduledTime)}` : ""}` : "Not scheduled yet";
  return (
    <ListRow
      href={`/inspections/${row.id}`}
      edge={late ? TONE_EDGE.danger : row.status === "in_progress" ? TONE_EDGE.warn : undefined}
      title={showPlace ? row.placeName ?? row.address : typeLabel(settings.data?.inspectionTypes, row.typeKey)}
      tags={<>
        <Badge tone={late ? "danger" : state.tone}>{late ? relativeDay(row.scheduledOn, today) : state.label}</Badge>
        {(row.openViolations ?? 0) > 0 && <Badge tone="warn">{row.openViolations} open</Badge>}
      </>}
      detail={[
        showPlace ? typeLabel(settings.data?.inspectionTypes, row.typeKey) : null,
        when,
        row.assignedName ?? (row.status === "completed" ? null : "Not assigned"),
        row.number,
      ].filter(Boolean).join(" · ")}
    />
  );
}

/** A violation, as a line in a list. */
export function ViolationLine({ v, action, tags }: { v: Violation; action?: ReactNode; tags?: ReactNode }) {
  const status = VIOLATION_STATUS[v.status];
  return (
    <div className={cx("flex flex-col gap-2 border-b border-l-4 border-b-divider px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-start", v.overdue ? TONE_EDGE.danger : v.status === "open" ? TONE_EDGE.warn : "border-l-transparent")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[17px] font-medium">{v.title}</span>
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone={SEVERITY[v.severity].tone}>{SEVERITY[v.severity].label}</Badge>
          {v.overdue && <Badge tone="danger">Past due</Badge>}
          {tags}
        </div>
        <div className="mt-1 text-[15px] leading-6 text-ink-2">
          {[v.codeRef, v.location].filter(Boolean).join(" · ")}
          {v.description && <span className="block text-ink-3">{v.description}</span>}
          {v.correctiveAction && <span className="block"><span className="text-ink-3">To fix: </span>{v.correctiveAction}</span>}
        </div>
        <div className="mt-1 text-[14px] text-ink-3">
          {v.status === "open"
            ? v.dueOn ? `Fix by ${formatDay(v.dueOn)}` : "No date to fix by"
            : v.resolvedOn ? `${status.label} ${formatDay(v.resolvedOn)}` : status.label}
          {v.resolutionNote ? ` · ${v.resolutionNote}` : ""}
        </div>
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/**
 * Photos and documents on a record. On a phone or tablet, "Take a photo"
 * opens the camera; each photo is sent as soon as it's taken.
 */
export function FilesPanel({ kind, id, files, canEdit, onChange }: {
  kind: RecordKind; id: number; files: FileRef[]; canEdit: boolean; onChange: (files: FileRef[]) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);

  async function send(list: FileList | null) {
    if (!list?.length) return;
    let latest = files;
    for (const file of Array.from(list)) {
      setBusy(n => n + 1);
      try {
        latest = await uploadFile(kind, id, file);
        onChange(latest);
      } catch (err) {
        toast.error(`${file.name}: ${errorMessage(err)}`);
      } finally { setBusy(n => n - 1); }
    }
  }

  async function remove(f: FileRef) {
    if (!window.confirm(`Remove ${f.name}? It can't be brought back.`)) return;
    setRemoving(f.key);
    try { onChange(await deleteFile(kind, id, f.key)); } catch (err) { toast.error(errorMessage(err)); } finally { setRemoving(null); }
  }

  return (
    <div>
      {canEdit && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <ActionMenu label="Add photos or files" size="md" sections={[{ items: [
            { label: "Take a photo", icon: Camera, tone: "brand", hint: "Opens the camera. Each one is sent as soon as it's taken.", onClick: () => camera.current?.click() },
            { label: "Choose photos or files", icon: Upload, hint: "From this device: pictures, or a PDF.", onClick: () => picker.current?.click() },
          ] }]} />
          {busy > 0 && <span className="inline-flex items-center gap-2 text-[15px] text-ink-2"><Loader2 className="h-5 w-5 animate-spin" />Sending {plural(busy, "file")}…</span>}
          <input ref={camera} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => { void send(e.target.files); e.target.value = ""; }} />
          <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={e => { void send(e.target.files); e.target.value = ""; }} />
        </div>
      )}
      {files.length === 0 ? (
        <Note>No photos or files yet.</Note>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map(f => (
            <div key={f.key} className="group relative overflow-hidden border border-faded bg-odd">
              <a href={fileUrl(kind, id, f)} target="_blank" rel="noreferrer" className="block">
                {f.contentType.startsWith("image/")
                  ? <img src={fileUrl(kind, id, f)} alt={f.name} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  : <span className="flex aspect-[4/3] w-full items-center justify-center"><FileText className="h-12 w-12 text-ink-3" /></span>}
                <span className="block truncate px-2.5 py-2 text-[14px] text-ink-2">{f.name}</span>
              </a>
              {canEdit && (
                <IconButton label={`Remove ${f.name}`} disabled={removing === f.key} onClick={() => remove(f)}
                  className="absolute right-1 top-1 bg-black/60 text-white hover:bg-red hover:text-white">
                  <Trash2 className="h-5 w-5" />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** What happened to a record, newest first, and a box to add a note. */
export function HistoryPanel({ history, kind, id, canWrite, onChange }: {
  history: HistoryLine[]; kind: Exclude<RecordKind, "violations">; id: number; canWrite: boolean; onChange: (h: HistoryLine[]) => void;
}) {
  const lines = [...history].reverse();
  return (
    <Box>
      {lines.length === 0 ? <p className="px-4 py-4 text-[15px] text-ink-3">Nothing yet.</p> : (
        <ol>
          {lines.map((h, i) => (
            <li key={`${h.at}-${i}`} className="flex gap-3 border-b border-divider px-4 py-3 last:border-b-0">
              <span className={cx("mt-2 h-2.5 w-2.5 shrink-0 rounded-full", h.kind === "note" ? "bg-sky" : "bg-ink-4")} />
              <div className="min-w-0 flex-1">
                <div className={cx("whitespace-pre-line text-[16px] leading-6", h.kind === "note" ? "text-ink" : "text-ink-2")}>{h.text}</div>
                <div className="text-[14px] text-ink-3">{[h.by, dateTime(h.at, true)].filter(Boolean).join(" · ")}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {canWrite && (
        <NoteComposer onAdd={async text => {
          try { onChange(await api<HistoryLine[]>("POST", `${BASE}/notes/${kind}/${id}`, { text })); }
          catch (err) { toast.error(errorMessage(err)); throw err; }
        }} />
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Scheduling an inspection, from anywhere
// ---------------------------------------------------------------------------

export interface ScheduleFor {
  place?: Place;
  permitId?: number;
  caseId?: number;
  eventId?: number;
  parentId?: number;
  discipline?: Discipline;
  typeKey?: string;
  /** Shown under the title: "For permit P-2026-0007". */
  context?: string;
}

/** The "Schedule an inspection" dialog. Opens the new inspection when done. */
export function ScheduleDialog({ open, onClose, preset }: { open: boolean; onClose: () => void; preset: ScheduleFor }) {
  if (!open) return null;
  return <ScheduleForm onClose={onClose} preset={preset} />;
}

function ScheduleForm({ onClose, preset }: { onClose: () => void; preset: ScheduleFor }) {
  const settings = useSettings();
  const checklists = useChecklists();
  const { session } = useAuth();
  const refresh = useRefreshAll();
  const [, navigate] = useLocation();
  const types = (settings.data?.inspectionTypes ?? []).filter(t => t.active);
  const firstType = preset.typeKey ?? types.find(t => !preset.discipline || t.discipline === preset.discipline)?.key ?? "";
  const [typeKey, setTypeKey] = useState(firstType);
  const [place, setPlace] = useState<Place>(preset.place ?? NO_PLACE);
  const [day, setDay] = useState(todayKey());
  const [time, setTime] = useState("");
  const [assigned, setAssigned] = useState<number | null>(session?.id ?? null);
  const [checklistId, setChecklistId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const type = types.find(t => t.key === (typeKey || firstType));
  const fixedPlace = !!preset.place?.address;
  const lists = (checklists.data ?? []).filter(c => c.isActive);

  async function save() {
    const key = typeKey || firstType;
    if (!key) { setError("Pick a type of inspection."); return; }
    if (!place.preplanId && !place.address?.trim()) { setError("Pick a business or type the address."); return; }
    setBusy(true);
    setError(null);
    try {
      const row = await api<InspectionDetail>("POST", `${BASE}/inspections`, {
        typeKey: key, preplanId: place.preplanId, placeName: place.placeName, address: place.address,
        latitude: place.latitude, longitude: place.longitude, scheduledOn: day || null, scheduledTime: time || null,
        assignedUserId: assigned, checklistId: checklistId || null, notes: notes || null,
        permitId: preset.permitId ?? null, caseId: preset.caseId ?? null, eventId: preset.eventId ?? null, parentId: preset.parentId ?? null,
      });
      void refresh();
      toast.success(`Scheduled ${row.number}`);
      onClose();
      navigate(`/inspections/${row.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally { setBusy(false); }
  }

  const grouped = (["fire", "building", "code", "event"] as Discipline[])
    .map(d => ({ d, list: types.filter(t => t.discipline === d) }))
    .filter(g => g.list.length && (!preset.discipline || g.d === preset.discipline || preset.discipline === "fire"));

  return (
    <Modal
      open onClose={onClose} title="Schedule an inspection" description={preset.context} size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={save}><CheckCircle2 className="h-5 w-5" />Schedule it</Button>
      </>}
    >
      <div className="space-y-5">
        <Field label="Type of inspection" required>
          <Select value={typeKey || firstType} onChange={e => setTypeKey(e.target.value)}>
            {grouped.map(g => (
              <optgroup key={g.d} label={DISCIPLINE_LABELS[g.d]}>
                {g.list.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        {fixedPlace ? (
          <div>
            <span className="block text-[15px] font-medium">Where</span>
            <p className="mt-1 text-[17px]">{place.placeName ?? place.address}</p>
            {place.placeName && <p className="text-[15px] text-ink-3">{place.address}</p>}
          </div>
        ) : <PlacePicker value={place} onChange={setPlace} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Day" hint={day ? relativeDay(day, todayKey(), "ago") : "Leave empty to schedule it later."}>
            <Input type="date" value={day} onChange={e => setDay(e.target.value)} />
          </Field>
          <Field label="Time (optional)" hint="Leave empty for any time that day.">
            <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Inspector">
          <PersonSelect value={assigned} onChange={setAssigned} />
        </Field>
        {!preset.parentId && (
          <Field label="Checklist" hint="Left on the default, the inspection uses the checklist set for its type.">
            <Select value={checklistId} onChange={e => setChecklistId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">The default for {type?.label ?? "this type"}</option>
              {lists.map(c => <option key={c.id} value={c.id}>{c.name} ({c.items.length} lines)</option>)}
            </Select>
          </Field>
        )}
        <Field label="Notes for the inspector (optional)">
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Who to ask for, gate codes, what to look at" />
        </Field>
        {error && <p role="alert" className="text-[16px] text-lightcoral">{error}</p>}
      </div>
    </Modal>
  );
}

/**
 * The preplan is edited in the Command Portal (Settings → Preplans), where
 * crews keep it. The Command Portal has no address for one preplan, so this
 * opens the list; the business is found there by name.
 */
export const PREPLANS_URL = signedInHref("command-portal", "/settings/preplans");

export function PreplanLink({ label = "Edit the preplan in the Command Portal" }: { label?: string }) {
  return (
    <a href={PREPLANS_URL} target={portalTarget("command-portal")} className="inline-flex min-h-11 items-center gap-2 text-[16px] text-sky hover:underline">
      <ExternalLink className="h-4 w-4" />{label}
    </a>
  );
}

/** Day field with its relative words beside it. */
export function DayInput({ value, onChange, label, hint }: { value: string | null; onChange: (v: string | null) => void; label: string; hint?: ReactNode }) {
  return (
    <Field label={label} hint={hint ?? (value ? relativeDay(value, todayKey(), "ago") : undefined)}>
      <Input type="date" value={value ?? ""} onChange={e => onChange(e.target.value || null)} />
    </Field>
  );
}

/** The people list's names, for showing who something is assigned to. */
export function usePersonName() {
  const people = usePeople();
  return (id: number | null | undefined) => (id ? people.data?.find(p => p.id === id)?.name ?? null : null);
}

export function EmptyList({ title, children }: { title: string; children?: ReactNode }) {
  return <EmptyBox title={title}>{children}</EmptyBox>;
}

/**
 * A business as a Place, from the businesses list, for pages opened with
 * ?preplan=<id> ("Take a complaint" or "New permit" from a business's page).
 */
export function usePlaceOf(preplanId: number | null): Place | undefined {
  const props = useQuery({
    queryKey: keys.properties,
    queryFn: ({ signal }) => get<Listed<PropertyRow>>(`${BASE}/properties`, signal),
    enabled: !!preplanId,
    staleTime: 60_000,
  });
  const p = preplanId ? props.data?.rows.find(r => r.preplanId === preplanId) : undefined;
  return p ? { preplanId: p.preplanId, placeName: p.name, address: p.address, latitude: p.latitude, longitude: p.longitude } : undefined;
}
