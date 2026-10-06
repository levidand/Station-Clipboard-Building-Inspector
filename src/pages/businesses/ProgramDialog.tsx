import { useState } from "react";
import { Save } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { formatDay, todayKey } from "@/lib/format";
import { BASE, OCCUPANCY_CLASSES, RISK, useRefreshAll, useSettings } from "@/lib/inspections";
import type { PropertyDetail, RiskClass } from "@/lib/types";
import { Button, Field, Input, Modal, Select, Textarea, Toggle } from "@/components/ui";
import { NO_PLACE, PlacePicker, type Place } from "@/components/records";
import { Note } from "@/components/kit";
import { toast } from "@/components/toast";
import { useFindLogo } from "./BusinessLogo";

/** The fields of a business's inspection program, shared by Add and Change. */
interface Program {
  occupancyClass: string;
  riskClass: RiskClass | "";
  frequencyMonths: string;
  nextDueOn: string;
  onProgram: boolean;
  ownerName: string; ownerPhone: string; ownerEmail: string; ownerMailingAddress: string;
  businessLicense: string; notes: string;
}

function programBody(p: Program) {
  return {
    occupancyClass: p.occupancyClass || null,
    riskClass: p.riskClass || null,
    frequencyMonths: p.frequencyMonths ? Number(p.frequencyMonths) : null,
    nextDueOn: p.nextDueOn || null,
    onProgram: p.onProgram,
    ownerName: p.ownerName || null, ownerPhone: p.ownerPhone || null, ownerEmail: p.ownerEmail || null,
    ownerMailingAddress: p.ownerMailingAddress || null, businessLicense: p.businessLicense || null, notes: p.notes || null,
  };
}

function ProgramFields({ p, set, showDue = true }: { p: Program; set: (patch: Partial<Program>) => void; showDue?: boolean }) {
  const settings = useSettings();
  const freq = p.riskClass ? settings.data?.frequencyMonths[p.riskClass] : null;
  return (
    <div className="space-y-5">
      <Toggle checked={p.onProgram} onChange={v => set({ onProgram: v })} label="On the inspection program"
        description="On: it comes due for inspection on a schedule. Off: kept for its history only." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Occupancy class" hint="The building code use group.">
          <Select value={p.occupancyClass} onChange={e => set({ occupancyClass: e.target.value })}>
            <option value="">Not set</option>
            {OCCUPANCY_CLASSES.map(o => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
          </Select>
        </Field>
        <Field label="Risk" hint={p.riskClass ? RISK[p.riskClass].help : "Sets how often it's inspected."}>
          <Select value={p.riskClass} onChange={e => set({ riskClass: e.target.value as RiskClass | "" })}>
            <option value="">Not set (every year)</option>
            {(Object.keys(RISK) as RiskClass[]).map(r => <option key={r} value={r}>{RISK[r].label}</option>)}
          </Select>
        </Field>
        <Field label="Inspect every (months)" hint={`Leave empty to use the risk class${freq ? `: every ${freq} months` : ""}.`}>
          <Input type="number" inputMode="numeric" min={1} max={120} value={p.frequencyMonths} onChange={e => set({ frequencyMonths: e.target.value })} className="max-w-40" />
        </Field>
        {showDue && (
          <Field label="Next inspection due" hint={p.nextDueOn ? formatDay(p.nextDueOn) : "Set from the last inspection when there is one."}>
            <Input type="date" value={p.nextDueOn} onChange={e => set({ nextDueOn: e.target.value })} />
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Owner or responsible party"><Input value={p.ownerName} onChange={e => set({ ownerName: e.target.value })} /></Field>
        <Field label="Owner's phone"><Input type="tel" value={p.ownerPhone} onChange={e => set({ ownerPhone: e.target.value })} /></Field>
        <Field label="Owner's email"><Input type="email" value={p.ownerEmail} onChange={e => set({ ownerEmail: e.target.value })} /></Field>
        <Field label="Business license or permit number"><Input value={p.businessLicense} onChange={e => set({ businessLicense: e.target.value })} /></Field>
      </div>
      <Field label="Where to mail notices" hint="Leave empty to mail them to the business itself.">
        <Input value={p.ownerMailingAddress} onChange={e => set({ ownerMailingAddress: e.target.value })} />
      </Field>
      <Field label="Notes for inspectors"><Textarea value={p.notes} onChange={e => set({ notes: e.target.value })} /></Field>
    </div>
  );
}

/** "Add a business": makes the preplan and puts it on the program. */
export function AddBusinessDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (preplanId: number) => void }) {
  if (!open) return null;
  return <AddForm onClose={onClose} onAdded={onAdded} />;
}

function AddForm({ onClose, onAdded }: { onClose: () => void; onAdded: (preplanId: number) => void }) {
  const refresh = useRefreshAll();
  const [name, setName] = useState("");
  const [place, setPlace] = useState<Place>(NO_PLACE);
  const [occupancyType, setOccupancyType] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [p, setP] = useState<Program>({
    occupancyClass: "", riskClass: "", frequencyMonths: "", nextDueOn: todayKey(), onProgram: true,
    ownerName: "", ownerPhone: "", ownerEmail: "", ownerMailingAddress: "", businessLicense: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const findLogo = useFindLogo();

  async function save() {
    if (!name.trim()) { setError("Give the business a name."); return; }
    if (!place.address?.trim()) { setError("Type the business's address."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ preplanId: number; lookForLogo?: boolean }>("POST", `${BASE}/properties`, {
        name: name.trim(), address: place.address.trim(), latitude: place.latitude, longitude: place.longitude,
        occupancyType: occupancyType || null, phone: phone || null, website: website.trim() || null, email: email.trim() || null,
        ...programBody(p),
      });
      void refresh();
      toast.success(`${name.trim()} added`);
      // Its logo is looked for while its page opens.
      if (res.lookForLogo) findLogo.mutate(res.preplanId);
      onClose();
      onAdded(res.preplanId);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Add a business" size="lg"
      description="It's added to the department's preplans too, so crews see it in the Command Portal."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={save}><Save className="h-5 w-5" />Add the business</Button>
      </>}
    >
      <div className="space-y-5">
        <Field label="Business name" required><Input value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
        <PlacePicker value={place} onChange={pl => setPlace({ ...pl, placeName: null })} addressOnly label="Address" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What kind of business" hint="Restaurant, daycare, warehouse…"><Input value={occupancyType} onChange={e => setOccupancyType(e.target.value)} /></Field>
          <Field label="Business phone"><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
          <Field label="Website" hint="Its logo is found here, so nobody has to upload one.">
            <Input value={website} onChange={e => setWebsite(e.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="acmeplumbing.com" />
          </Field>
          <Field label="Business email" hint="One at its own domain finds the logo too. Gmail, Outlook and the like can't.">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoCapitalize="none" spellCheck={false} />
          </Field>
        </div>
        <ProgramFields p={p} set={patch => setP(cur => ({ ...cur, ...patch }))} />
        {error && <p role="alert" className="text-[16px] text-lightcoral">{error}</p>}
      </div>
    </Modal>
  );
}

/** "Change" on a business's program. */
export function ProgramDialog({ open, onClose, d, onSaved }: { open: boolean; onClose: () => void; d: PropertyDetail; onSaved: () => void }) {
  if (!open) return null;
  return <ProgramForm onClose={onClose} d={d} onSaved={onSaved} />;
}

function ProgramForm({ onClose, d, onSaved }: { onClose: () => void; d: PropertyDetail; onSaved: () => void }) {
  const [p, setP] = useState<Program>({
    occupancyClass: d.occupancyClass ?? "", riskClass: d.riskClass ?? "", frequencyMonths: d.frequencyMonths ? String(d.frequencyMonths) : "",
    nextDueOn: d.nextDueOn ?? "", onProgram: d.hasProgram ? d.onProgram : true,
    ownerName: d.ownerName ?? "", ownerPhone: d.ownerPhone ?? "", ownerEmail: d.ownerEmail ?? "",
    ownerMailingAddress: d.ownerMailingAddress ?? "", businessLicense: d.businessLicense ?? "", notes: d.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const body = programBody(p);
      // Leave the due date to the server when only the risk or frequency changed, so it's worked out from the last inspection.
      const dueTouched = (p.nextDueOn || null) !== d.nextDueOn;
      await api("PATCH", `${BASE}/properties/${d.preplanId}`, dueTouched ? body : { ...body, nextDueOn: undefined });
      toast.success("Saved");
      onSaved();
      onClose();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={d.hasProgram ? "Change the inspection program" : "Put on the inspection program"} size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={save}><Save className="h-5 w-5" />Save</Button>
      </>}
    >
      <ProgramFields p={p} set={patch => setP(cur => ({ ...cur, ...patch }))} />
      {!d.hasProgram && <Note className="mt-4">With no inspection on record, a business put on the program is due right away.</Note>}
    </Modal>
  );
}
