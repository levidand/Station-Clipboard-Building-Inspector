import { useState } from "react";
import { useLocation } from "wouter";
import { Save } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { addDays, fromLocalInput, toLocalInput, todayKey } from "@/lib/format";
import { BASE, EVENT_FEATURES, EVENT_KIND, useRefreshAll } from "@/lib/inspections";
import type { EventDetail, EventKind, EventStandby } from "@/lib/types";
import { Button, Checkbox, Field, Input, Modal, Select, Textarea, Toggle } from "@/components/ui";
import { NO_PLACE, PlacePicker, type Place } from "@/components/records";
import { toast } from "@/components/toast";

interface Form {
  title: string; kind: EventKind; starts: string; ends: string; locationName: string; place: Place;
  organizerName: string; organizerOrg: string; organizerPhone: string; organizerEmail: string;
  expectedAttendance: string; occupantLoad: string; crowdManagers: string; features: string[];
  standby: EventStandby; notes: string; showOnCalendar: boolean;
}

const num = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s))) || 0);

function Fields({ f, set, isNew }: { f: Form; set: (p: Partial<Form>) => void; isNew: boolean }) {
  return (
    <div className="space-y-5">
      <Field label="Name of the event" required><Input value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Fourth of July fireworks at the park" /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Kind of event">
          <Select value={f.kind} onChange={e => set({ kind: e.target.value as EventKind })}>
            {(Object.keys(EVENT_KIND) as EventKind[]).map(k => <option key={k} value={k}>{EVENT_KIND[k]}</option>)}
          </Select>
        </Field>
        <Field label="Starts" required><Input type="datetime-local" value={f.starts} onChange={e => set({ starts: e.target.value })} /></Field>
        <Field label="Ends" required><Input type="datetime-local" value={f.ends} onChange={e => set({ ends: e.target.value })} /></Field>
      </div>
      <Field label="Where it is (a name)" hint="The park, the church parking lot, the station."><Input value={f.locationName} onChange={e => set({ locationName: e.target.value })} /></Field>
      {isNew && <PlacePicker value={f.place} onChange={place => set({ place })} label="Address" />}
      <div>
        <span className="mb-1.5 block text-[15px] font-medium">What will be there</span>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {EVENT_FEATURES.map(x => (
            <Checkbox key={x.key} checked={f.features.includes(x.key)}
              onChange={on => set({ features: on ? [...f.features, x.key] : f.features.filter(k => k !== x.key) })}>
              {x.label}
            </Checkbox>
          ))}
        </div>
        {isNew && <p className="mt-1 text-[14px] text-ink-3">Each one adds its own steps to the planning list.</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="People expected"><Input type="number" inputMode="numeric" min={0} value={f.expectedAttendance} onChange={e => set({ expectedAttendance: e.target.value })} /></Field>
        <Field label="Approved occupant load" hint="For a tent or a hall."><Input type="number" inputMode="numeric" min={0} value={f.occupantLoad} onChange={e => set({ occupantLoad: e.target.value })} /></Field>
        <Field label="Crowd managers assigned"><Input type="number" inputMode="numeric" min={0} value={f.crowdManagers} onChange={e => set({ crowdManagers: e.target.value })} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organizer"><Input value={f.organizerName} onChange={e => set({ organizerName: e.target.value })} /></Field>
        <Field label="Organization"><Input value={f.organizerOrg} onChange={e => set({ organizerOrg: e.target.value })} /></Field>
        <Field label="Organizer's phone"><Input type="tel" value={f.organizerPhone} onChange={e => set({ organizerPhone: e.target.value })} /></Field>
        <Field label="Organizer's email"><Input type="email" value={f.organizerEmail} onChange={e => set({ organizerEmail: e.target.value })} /></Field>
      </div>
      <div className="space-y-3 border border-faded bg-odd px-4 py-4">
        <span className="block text-[15px] font-medium">Standing by at the event</span>
        <div className="flex flex-wrap gap-x-6">
          <Checkbox checked={f.standby.fire} onChange={fire => set({ standby: { ...f.standby, fire } })}>Fire</Checkbox>
          <Checkbox checked={f.standby.ems} onChange={ems => set({ standby: { ...f.standby, ems } })}>EMS</Checkbox>
        </div>
        {(f.standby.fire || f.standby.ems) && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Units"><Input value={f.standby.units} onChange={e => set({ standby: { ...f.standby, units: e.target.value } })} placeholder="Engine 1, Medic 2" /></Field>
            <Field label="Personnel"><Input type="number" min={0} value={f.standby.personnel ?? ""} onChange={e => set({ standby: { ...f.standby, personnel: num(e.target.value) } })} /></Field>
            <Field label="Notes"><Input value={f.standby.notes} onChange={e => set({ standby: { ...f.standby, notes: e.target.value } })} placeholder="Staging spot, radio channel" /></Field>
          </div>
        )}
      </div>
      <Field label="Notes"><Textarea value={f.notes} onChange={e => set({ notes: e.target.value })} /></Field>
      <Toggle checked={f.showOnCalendar} onChange={showOnCalendar => set({ showOnCalendar })} label="Show on the department calendar"
        description="Everyone in the department sees it. Off: only people who can open the Inspection Portal." />
    </div>
  );
}

function body(f: Form) {
  return {
    title: f.title.trim(), kind: f.kind, startsAt: fromLocalInput(f.starts), endsAt: fromLocalInput(f.ends),
    locationName: f.locationName || null, organizerName: f.organizerName || null, organizerOrg: f.organizerOrg || null,
    organizerPhone: f.organizerPhone || null, organizerEmail: f.organizerEmail || null,
    expectedAttendance: num(f.expectedAttendance), occupantLoad: num(f.occupantLoad), crowdManagers: num(f.crowdManagers),
    features: f.features, standby: f.standby.fire || f.standby.ems ? f.standby : null, notes: f.notes || null, showOnCalendar: f.showOnCalendar,
  };
}

function check(f: Form): string | null {
  if (!f.title.trim()) return "Give the event a name.";
  if (!fromLocalInput(f.starts) || !fromLocalInput(f.ends)) return "Say when it starts and ends.";
  if (f.ends < f.starts) return "The event has to end after it starts.";
  return null;
}

export function NewEventDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <NewEvent onClose={onClose} />;
}

function NewEvent({ onClose }: { onClose: () => void }) {
  const [, navigate] = useLocation();
  const refresh = useRefreshAll();
  const day = addDays(todayKey(), 14);
  const [f, setF] = useState<Form>({
    title: "", kind: "special_event", starts: `${day}T10:00`, ends: `${day}T14:00`, locationName: "", place: NO_PLACE,
    organizerName: "", organizerOrg: "", organizerPhone: "", organizerEmail: "", expectedAttendance: "", occupantLoad: "",
    crowdManagers: "", features: [], standby: { fire: false, ems: false, units: "", personnel: null, notes: "" }, notes: "", showOnCalendar: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const problem = check(f);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const row = await api<EventDetail>("POST", `${BASE}/events`, {
        ...body(f), preplanId: f.place.preplanId, placeName: f.place.placeName, address: f.place.address,
        latitude: f.place.latitude, longitude: f.place.longitude,
      });
      void refresh();
      toast.success(`${row.title} added`);
      onClose();
      navigate(`/events/${row.id}`);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Plan an event" size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={save}><Save className="h-5 w-5" />Add the event</Button>
      </>}
    >
      <Fields f={f} set={p => setF(cur => ({ ...cur, ...p }))} isNew />
      {error && <p role="alert" className="mt-4 text-[16px] text-lightcoral">{error}</p>}
    </Modal>
  );
}

export function EditEventDialog({ open, onClose, d, onSaved }: { open: boolean; onClose: () => void; d: EventDetail; onSaved: (d: EventDetail) => void }) {
  if (!open) return null;
  return <EditEvent onClose={onClose} d={d} onSaved={onSaved} />;
}

function EditEvent({ onClose, d, onSaved }: { onClose: () => void; d: EventDetail; onSaved: (d: EventDetail) => void }) {
  const s = (n: number | null) => (n == null ? "" : String(n));
  const [f, setF] = useState<Form>({
    title: d.title, kind: d.kind, starts: toLocalInput(d.startsAt), ends: toLocalInput(d.endsAt), locationName: d.locationName ?? "",
    place: NO_PLACE, organizerName: d.organizerName ?? "", organizerOrg: d.organizerOrg ?? "", organizerPhone: d.organizerPhone ?? "",
    organizerEmail: d.organizerEmail ?? "", expectedAttendance: s(d.expectedAttendance), occupantLoad: s(d.occupantLoad),
    crowdManagers: s(d.crowdManagers), features: d.features,
    standby: d.standby ?? { fire: false, ems: false, units: "", personnel: null, notes: "" }, notes: d.notes ?? "", showOnCalendar: d.showOnCalendar,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Change the event" size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={async () => {
          const problem = check(f);
          if (problem) { setError(problem); return; }
          setBusy(true);
          try { onSaved(await api<EventDetail>("PATCH", `${BASE}/events/${d.id}`, body(f))); toast.success("Saved"); onClose(); }
          catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
        }}><Save className="h-5 w-5" />Save</Button>
      </>}
    >
      <Fields f={f} set={p => setF(cur => ({ ...cur, ...p }))} isNew={false} />
      {error && <p role="alert" className="mt-4 text-[16px] text-lightcoral">{error}</p>}
    </Modal>
  );
}
