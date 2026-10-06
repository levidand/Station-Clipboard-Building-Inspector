import { useState } from "react";
import { useLocation } from "wouter";
import { Save, Send } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { addDays, formatDay, todayKey } from "@/lib/format";
import { BASE, CASE_PRIORITY, CASE_RESOLUTION, CASE_SOURCE, NOTICE_METHODS, useRefreshAll, useSettings } from "@/lib/inspections";
import type { CaseDetail, CasePriority, CaseResolution, CaseSource } from "@/lib/types";
import { Button, Field, Input, Modal, Segmented, Select, Textarea, Toggle } from "@/components/ui";
import { NO_PLACE, PersonSelect, PlacePicker, type Place } from "@/components/records";
import { toast } from "@/components/toast";

interface Form {
  typeKey: string; source: CaseSource; priority: CasePriority; place: Place; description: string;
  anonymous: boolean; complainantName: string; complainantPhone: string; complainantEmail: string;
  ownerName: string; ownerMailingAddress: string; assignedUserId: number | null; dueOn: string;
}

function Fields({ f, set, isNew }: { f: Form; set: (p: Partial<Form>) => void; isNew: boolean }) {
  const settings = useSettings();
  const types = (settings.data?.caseTypes ?? []).filter(t => t.active || t.key === f.typeKey);
  return (
    <div className="space-y-5">
      <Field label="What it's about" required>
        <Select value={f.typeKey} onChange={e => set({ typeKey: e.target.value })}>
          <option value="">Pick one…</option>
          {types.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </Select>
      </Field>
      {isNew && <PlacePicker value={f.place} onChange={place => set({ place })} />}
      <Field label="What was reported">
        <Textarea value={f.description} onChange={e => set({ description: e.target.value })} className="min-h-[120px]" placeholder="In the caller's words: what, where on the property, since when" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-[15px] font-medium">How it came in</span>
          <Segmented value={f.source} onChange={source => set({ source })}
            options={(Object.keys(CASE_SOURCE) as CaseSource[]).map(s => ({ value: s, label: CASE_SOURCE[s] }))} />
        </div>
        <div>
          <span className="mb-1.5 block text-[15px] font-medium">Priority</span>
          <Segmented value={f.priority} onChange={priority => set({ priority })}
            options={(Object.keys(CASE_PRIORITY) as CasePriority[]).map(p => ({ value: p, label: CASE_PRIORITY[p].label, tone: CASE_PRIORITY[p].tone === "danger" ? "danger" as const : undefined }))} />
        </div>
      </div>
      {f.source === "complaint" && (
        <div className="space-y-4 border border-faded bg-odd px-4 py-4">
          <Toggle checked={f.anonymous} onChange={anonymous => set({ anonymous })} label="The caller wants to stay anonymous"
            description="Nothing about who called is kept." />
          {!f.anonymous && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Caller's name"><Input value={f.complainantName} onChange={e => set({ complainantName: e.target.value })} /></Field>
              <Field label="Caller's phone"><Input type="tel" value={f.complainantPhone} onChange={e => set({ complainantPhone: e.target.value })} /></Field>
              <Field label="Caller's email"><Input type="email" value={f.complainantEmail} onChange={e => set({ complainantEmail: e.target.value })} /></Field>
            </div>
          )}
          <p className="text-[14px] text-ink-3">Only people who work complaints can see who called. It's never printed on a notice.</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property owner" hint="From the appraisal district, if known."><Input value={f.ownerName} onChange={e => set({ ownerName: e.target.value })} /></Field>
        <Field label="Owner's mailing address"><Input value={f.ownerMailingAddress} onChange={e => set({ ownerMailingAddress: e.target.value })} /></Field>
        <Field label="Who's handling it"><PersonSelect value={f.assignedUserId} onChange={assignedUserId => set({ assignedUserId })} prefer="enforces" /></Field>
        <Field label="Look into it by" hint={f.dueOn ? formatDay(f.dueOn) : undefined}><Input type="date" value={f.dueOn} onChange={e => set({ dueOn: e.target.value })} /></Field>
      </div>
    </div>
  );
}

function body(f: Form) {
  return {
    typeKey: f.typeKey, source: f.source, priority: f.priority, description: f.description || null, anonymous: f.anonymous,
    complainantName: f.anonymous ? null : f.complainantName || null, complainantPhone: f.anonymous ? null : f.complainantPhone || null,
    complainantEmail: f.anonymous ? null : f.complainantEmail || null, ownerName: f.ownerName || null,
    ownerMailingAddress: f.ownerMailingAddress || null, assignedUserId: f.assignedUserId, dueOn: f.dueOn || null,
  };
}

export function NewComplaintDialog({ open, onClose, place }: { open: boolean; onClose: () => void; place?: Place }) {
  if (!open) return null;
  return <NewComplaint onClose={onClose} place={place} />;
}

function NewComplaint({ onClose, place }: { onClose: () => void; place?: Place }) {
  const { session } = useAuth();
  const [, navigate] = useLocation();
  const refresh = useRefreshAll();
  const [f, setF] = useState<Form>({
    typeKey: "", source: "complaint", priority: "normal", place: place ?? NO_PLACE, description: "", anonymous: false,
    complainantName: "", complainantPhone: "", complainantEmail: "", ownerName: "", ownerMailingAddress: "",
    assignedUserId: session?.id ?? null, dueOn: addDays(todayKey(), 2),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!f.typeKey) { setError("Pick what the complaint is about."); return; }
    if (!f.place.preplanId && !f.place.address?.trim()) { setError("Pick a business or type the address."); return; }
    setBusy(true);
    setError(null);
    try {
      const row = await api<CaseDetail>("POST", `${BASE}/cases`, {
        ...body(f), preplanId: f.place.preplanId, placeName: f.place.placeName, address: f.place.address,
        latitude: f.place.latitude, longitude: f.place.longitude,
      });
      void refresh();
      toast.success(`Complaint ${row.number} opened`);
      onClose();
      navigate(`/complaints/${row.id}`);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Take a complaint" size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={save}><Save className="h-5 w-5" />Save the complaint</Button>
      </>}
    >
      <Fields f={f} set={p => setF(cur => ({ ...cur, ...p }))} isNew />
      {error && <p role="alert" className="mt-4 text-[16px] text-lightcoral">{error}</p>}
    </Modal>
  );
}

export function EditComplaintDialog({ open, onClose, d, onSaved }: { open: boolean; onClose: () => void; d: CaseDetail; onSaved: (d: CaseDetail) => void }) {
  if (!open) return null;
  return <EditComplaint onClose={onClose} d={d} onSaved={onSaved} />;
}

function EditComplaint({ onClose, d, onSaved }: { onClose: () => void; d: CaseDetail; onSaved: (d: CaseDetail) => void }) {
  const [f, setF] = useState<Form>({
    typeKey: d.typeKey, source: d.source, priority: d.priority, place: NO_PLACE, description: d.description ?? "",
    anonymous: d.anonymous, complainantName: d.complainantName ?? "", complainantPhone: d.complainantPhone ?? "",
    complainantEmail: d.complainantEmail ?? "", ownerName: d.ownerName ?? "", ownerMailingAddress: d.ownerMailingAddress ?? "",
    assignedUserId: d.assignedUserId, dueOn: d.dueOn ?? "",
  });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Change the complaint" size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={async () => {
          setBusy(true);
          const b = body(f);
          // Without the right to see who complained, those fields were never sent; don't send them back blank.
          const send = d.complainantHidden ? { ...b, complainantName: undefined, complainantPhone: undefined, complainantEmail: undefined } : b;
          try { onSaved(await api<CaseDetail>("PATCH", `${BASE}/cases/${d.id}`, send)); toast.success("Saved"); onClose(); }
          catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}><Save className="h-5 w-5" />Save</Button>
      </>}
    >
      <Fields f={f} set={p => setF(cur => ({ ...cur, ...p }))} isNew={false} />
    </Modal>
  );
}

/** A notice sent to the owner: how it went, and the date to comply by. */
export function NoticeDialog({ open, onClose, d, onSaved }: { open: boolean; onClose: () => void; d: CaseDetail; onSaved: (d: CaseDetail) => void }) {
  const settings = useSettings();
  const days = settings.data?.caseTypes.find(t => t.key === d.typeKey)?.complianceDays ?? 10;
  const [sentOn, setSentOn] = useState(todayKey());
  const [method, setMethod] = useState(NOTICE_METHODS[1]);
  const [dueOn, setDueOn] = useState(addDays(todayKey(), Math.max(days, 1)));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="Record a notice to the owner" size="md"
      description="Print it from the complaint's page. The complaint's next date becomes the date to comply by."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={async () => {
          setBusy(true);
          try { onSaved(await api<CaseDetail>("POST", `${BASE}/cases/${d.id}/notices`, { sentOn, method, dueOn: dueOn || null, note })); toast.success("Notice recorded"); onClose(); }
          catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}><Send className="h-5 w-5" />Save the notice</Button>
      </>}
    >
      <div className="space-y-5">
        <Field label="Sent or delivered on"><Input type="date" value={sentOn} onChange={e => setSentOn(e.target.value)} /></Field>
        <Field label="How">
          <Select value={method} onChange={e => setMethod(e.target.value)}>{NOTICE_METHODS.map(m => <option key={m}>{m}</option>)}</Select>
        </Field>
        <Field label="Comply by" hint={`${days} days is usual for this kind of complaint.`}>
          <Input type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} />
        </Field>
        <Field label="Note (optional)" hint="A certified mail number, or where it was posted.">
          <Textarea value={note} onChange={e => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Closing a complaint, with how it ended. */
export function CloseDialog({ open, onClose, d, onSaved }: { open: boolean; onClose: () => void; d: CaseDetail; onSaved: (d: CaseDetail) => void }) {
  const [resolution, setResolution] = useState<CaseResolution>("complied");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const openViolations = d.violations.filter(v => v.status === "open").length;
  return (
    <Modal open onClose={onClose} title="Close the complaint" size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="ok" size="lg" loading={busy} onClick={async () => {
          setBusy(true);
          try { onSaved(await api<CaseDetail>("POST", `${BASE}/cases/${d.id}/status`, { status: "closed", resolution, note: note.trim() || undefined })); toast.success("Closed"); onClose(); }
          catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}>Close it</Button>
      </>}
    >
      <div className="space-y-5">
        {openViolations > 0 && <p className="text-[16px] text-orange">{openViolations} violation{openViolations === 1 ? " is" : "s are"} still open on this complaint.</p>}
        <Field label="How it ended">
          <Select value={resolution} onChange={e => setResolution(e.target.value as CaseResolution)}>
            {(Object.keys(CASE_RESOLUTION) as CaseResolution[]).map(r => <option key={r} value={r}>{CASE_RESOLUTION[r]}</option>)}
          </Select>
        </Field>
        <Field label="Note (optional)"><Textarea value={note} onChange={e => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
