import { useState } from "react";
import { useLocation } from "wouter";
import { Save } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { todayKey } from "@/lib/format";
import { BASE, PERMIT_CATEGORY, useRefreshAll, useSettings } from "@/lib/inspections";
import type { PermitCategory, PermitDetail, PermitReview } from "@/lib/types";
import { Button, Field, Input, Modal, MoneyInput, Segmented, Select, Textarea, Checkbox } from "@/components/ui";
import { NO_PLACE, PersonSelect, PlacePicker, type Place } from "@/components/records";
import { toast } from "@/components/toast";

interface PermitForm {
  typeKey: string;
  place: Place;
  applicantName: string; applicantCompany: string; applicantPhone: string; applicantEmail: string;
  description: string; valuationCents: number | null; feeCents: number | null; feePaid: boolean;
  appliedOn: string; expiresOn: string; conditions: string; reviewerUserId: number | null;
}

function Fields({ f, set, isNew }: { f: PermitForm; set: (p: Partial<PermitForm>) => void; isNew: boolean }) {
  const settings = useSettings();
  const types = (settings.data?.permitTypes ?? []).filter(t => t.active || t.key === f.typeKey);
  const type = types.find(t => t.key === f.typeKey);
  return (
    <div className="space-y-5">
      <Field label="Type of permit" required>
        <Select value={f.typeKey} onChange={e => {
          const next = types.find(t => t.key === e.target.value);
          set({ typeKey: e.target.value, ...(isNew && next?.feeCents != null ? { feeCents: next.feeCents } : {}) });
        }}>
          <option value="">Pick one…</option>
          {(Object.keys(PERMIT_CATEGORY) as PermitCategory[]).map(c => (
            <optgroup key={c} label={`${PERMIT_CATEGORY[c]} permits`}>
              {types.filter(t => t.category === c).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </optgroup>
          ))}
        </Select>
      </Field>
      {isNew && <PlacePicker value={f.place} onChange={place => set({ place })} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Applicant's name"><Input value={f.applicantName} onChange={e => set({ applicantName: e.target.value })} /></Field>
        <Field label="Company or contractor"><Input value={f.applicantCompany} onChange={e => set({ applicantCompany: e.target.value })} /></Field>
        <Field label="Phone"><Input type="tel" value={f.applicantPhone} onChange={e => set({ applicantPhone: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={f.applicantEmail} onChange={e => set({ applicantEmail: e.target.value })} /></Field>
      </div>
      <Field label="What the work or activity is" hint="The scope of work, or what the permit allows.">
        <Textarea value={f.description} onChange={e => set({ description: e.target.value })} />
      </Field>
      <div className="flex flex-wrap items-end gap-5">
        <Field label="Fee"><MoneyInput cents={f.feeCents} onChange={feeCents => set({ feeCents })} /></Field>
        <Checkbox checked={f.feePaid} onChange={feePaid => set({ feePaid })}>Fee paid</Checkbox>
        {type?.category === "building" && <Field label="Value of the work"><MoneyInput cents={f.valuationCents} onChange={valuationCents => set({ valuationCents })} /></Field>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Applied on"><Input type="date" value={f.appliedOn} onChange={e => set({ appliedOn: e.target.value })} /></Field>
        {!isNew && <Field label="Expires on" hint="Set when the permit is issued, from its type."><Input type="date" value={f.expiresOn} onChange={e => set({ expiresOn: e.target.value })} /></Field>}
        <Field label="Plan reviewer"><PersonSelect value={f.reviewerUserId} onChange={reviewerUserId => set({ reviewerUserId })} noneLabel="No one yet" /></Field>
      </div>
      <Field label="Conditions printed on the permit (optional)">
        <Textarea value={f.conditions} onChange={e => set({ conditions: e.target.value })} placeholder="Fire watch required during hot work; no open flame within 35 ft of combustibles" />
      </Field>
    </div>
  );
}

function body(f: PermitForm) {
  return {
    typeKey: f.typeKey, applicantName: f.applicantName || null, applicantCompany: f.applicantCompany || null,
    applicantPhone: f.applicantPhone || null, applicantEmail: f.applicantEmail || null, description: f.description || null,
    valuationCents: f.valuationCents, feeCents: f.feeCents, feePaid: f.feePaid, appliedOn: f.appliedOn || null,
    conditions: f.conditions || null, reviewerUserId: f.reviewerUserId,
  };
}

export function NewPermitDialog({ open, onClose, place, eventId }: { open: boolean; onClose: () => void; place?: Place; eventId?: number }) {
  if (!open) return null;
  return <NewPermit onClose={onClose} place={place} eventId={eventId} />;
}

function NewPermit({ onClose, place, eventId }: { onClose: () => void; place?: Place; eventId?: number }) {
  const [, navigate] = useLocation();
  const refresh = useRefreshAll();
  const [f, setF] = useState<PermitForm>({
    typeKey: eventId ? "ev_special_event" : "", place: place ?? NO_PLACE,
    applicantName: "", applicantCompany: "", applicantPhone: "", applicantEmail: "", description: "",
    valuationCents: null, feeCents: null, feePaid: false, appliedOn: todayKey(), expiresOn: "", conditions: "", reviewerUserId: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!f.typeKey) { setError("Pick the type of permit."); return; }
    if (!f.place.preplanId && !f.place.address?.trim()) { setError("Pick a business or type the address."); return; }
    setBusy(true);
    setError(null);
    try {
      const row = await api<PermitDetail>("POST", `${BASE}/permits`, {
        ...body(f), preplanId: f.place.preplanId, placeName: f.place.placeName, address: f.place.address,
        latitude: f.place.latitude, longitude: f.place.longitude, eventId: eventId ?? null,
      });
      void refresh();
      toast.success(`Application ${row.number} taken`);
      onClose();
      navigate(`/permits/${row.id}`);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Take a permit application" size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={save}><Save className="h-5 w-5" />Save the application</Button>
      </>}
    >
      <Fields f={f} set={p => setF(cur => ({ ...cur, ...p }))} isNew />
      {error && <p role="alert" className="mt-4 text-[16px] text-lightcoral">{error}</p>}
    </Modal>
  );
}

export function EditPermitDialog({ open, onClose, d, onSaved }: { open: boolean; onClose: () => void; d: PermitDetail; onSaved: (d: PermitDetail) => void }) {
  if (!open) return null;
  return <EditPermit onClose={onClose} d={d} onSaved={onSaved} />;
}

function EditPermit({ onClose, d, onSaved }: { onClose: () => void; d: PermitDetail; onSaved: (d: PermitDetail) => void }) {
  const [f, setF] = useState<PermitForm>({
    typeKey: d.typeKey, place: { preplanId: d.preplanId, placeName: d.placeName, address: d.address, latitude: d.latitude, longitude: d.longitude },
    applicantName: d.applicantName ?? "", applicantCompany: d.applicantCompany ?? "", applicantPhone: d.applicantPhone ?? "",
    applicantEmail: d.applicantEmail ?? "", description: d.description ?? "", valuationCents: d.valuationCents, feeCents: d.feeCents,
    feePaid: d.feePaid, appliedOn: d.appliedOn ?? "", expiresOn: d.expiresOn ?? "", conditions: d.conditions ?? "", reviewerUserId: d.reviewerUserId,
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      onSaved(await api<PermitDetail>("PATCH", `${BASE}/permits/${d.id}`, { ...body(f), expiresOn: f.expiresOn || null }));
      toast.success("Saved");
      onClose();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Change the permit" size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={save}><Save className="h-5 w-5" />Save</Button>
      </>}
    >
      <Fields f={f} set={p => setF(cur => ({ ...cur, ...p }))} isNew={false} />
    </Modal>
  );
}

const OUTCOMES: { value: PermitReview["outcome"]; label: string; tone: "ok" | "warn" | "danger" | "muted"; help: string }[] = [
  { value: "approved", label: "Approve the plans", tone: "ok", help: "The plans meet the code. The permit can be issued." },
  { value: "corrections", label: "Corrections needed", tone: "warn", help: "List what has to change. The applicant sends revised plans." },
  { value: "comment", label: "Just a comment", tone: "muted", help: "A note on the review, without a decision." },
  { value: "denied", label: "Deny", tone: "danger", help: "The application can't be approved. Say why." },
];

export function ReviewDialog({ open, onClose, permitId, onSaved }: { open: boolean; onClose: () => void; permitId: number; onSaved: (d: PermitDetail) => void }) {
  const [outcome, setOutcome] = useState<PermitReview["outcome"]>("approved");
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const help = OUTCOMES.find(o => o.value === outcome)!.help;
  return (
    <Modal open onClose={onClose} title="Record a plan review" size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={async () => {
          setBusy(true);
          try {
            onSaved(await api<PermitDetail>("POST", `${BASE}/permits/${permitId}/review`, { outcome, comments: comments.trim() }));
            toast.success("Review recorded");
            setComments("");
            onClose();
          } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}><Save className="h-5 w-5" />Save the review</Button>
      </>}
    >
      <div className="space-y-4">
        <Segmented value={outcome} onChange={setOutcome} options={OUTCOMES.map(o => ({ value: o.value, label: o.label, tone: o.tone }))} />
        <p className="text-[15px] text-ink-3">{help}</p>
        <Field label={outcome === "corrections" ? "What has to change" : "Comments"}>
          <Textarea value={comments} onChange={e => setComments(e.target.value)} className="min-h-[160px]"
            placeholder={outcome === "corrections" ? "Sheet FP-1: show the fire lane at 26 ft where it passes the hydrant…" : ""} />
        </Field>
      </div>
    </Modal>
  );
}
