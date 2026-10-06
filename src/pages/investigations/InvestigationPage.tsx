import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowRightLeft, CheckCircle2, Hourglass, Lock, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { api, errorMessage, get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { dateTime, fromLocalInput, money, toLocalInput } from "@/lib/format";
import { BASE, CAUSE_CLASS, INVESTIGATION_STATUS, NERIS_CAUSES, keys, useRefreshAll } from "@/lib/inspections";
import type { CauseClass, EvidenceItem, Interview, InvestigationDetail, InvestigationStatus } from "@/lib/types";
import { Badge, Button, Checkbox, Field, Input, Modal, MoneyInput, Select, Textarea } from "@/components/ui";
import { ActionMenu, Box, Confirm, Fact, Facts, Group, Note, PAGE, PageHead, QueryState } from "@/components/kit";
import { FilesPanel, HistoryPanel, PersonSelect } from "@/components/records";
import { toast } from "@/components/toast";
import { PROPERTY_TYPES } from "./InvestigationsPage";

const EVIDENCE_STATUS: Record<EvidenceItem["status"], string> = {
  held: "Held in evidence", lab: "Sent to the lab", released: "Released", destroyed: "Destroyed",
};
const ROLES = ["Witness", "Occupant", "Owner", "First-in crew", "Neighbor", "Suspect", "Other"];
const lineId = () => Math.random().toString(36).slice(2, 10);

export function InvestigationPage({ id }: { id: number }) {
  const perms = usePermissions();
  const qc = useQueryClient();
  const refresh = useRefreshAll();
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: keys.investigation(id), queryFn: ({ signal }) => get<InvestigationDetail>(`${BASE}/investigations/${id}`, signal) });
  const [dialog, setDialog] = useState<null | "cause" | "details" | "evidence" | "interview" | "delete">(null);
  const [custodyFor, setCustodyFor] = useState<EvidenceItem | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const saved = (next: InvestigationDetail) => { qc.setQueryData(keys.investigation(id), next); void refresh(); };

  async function patch(body: Record<string, unknown>, done?: string) {
    try { saved(await api<InvestigationDetail>("PATCH", `${BASE}/investigations/${id}`, body)); if (done) toast.success(done); }
    catch (err) { toast.error(errorMessage(err)); throw err; }
  }

  if (!d) return <div className={PAGE}><QueryState query={q}>{null}</QueryState></div>;

  const setStatus = (status: InvestigationStatus, done: string) => patch({ status }, done).catch(() => undefined);
  const neris = NERIS_CAUSES.find(c => c.value === d.nerisCause);

  return (
    <div className={PAGE}>
      <PageHead
        back={{ href: "/investigations", label: "Fire investigations" }}
        title={d.title}
        sub={[d.number, d.address, d.occurredAt ? dateTime(d.occurredAt, true) : null].filter(Boolean).join(" · ")}
        badges={<>
          <Badge tone={INVESTIGATION_STATUS[d.status].tone}>{INVESTIGATION_STATUS[d.status].label}</Badge>
          <Badge tone="warn"><Lock className="h-4 w-4" />Confidential</Badge>
        </>}
      >
        <ActionMenu sections={[
          { title: "Next step", items: d.status === "closed" ? [] : [
            { label: "Origin and cause", icon: Pencil, tone: "brand", hint: "Where it started, what lit it, and the cause.", onClick: () => setDialog("cause") },
            { label: "Log evidence", icon: Plus, onClick: () => setDialog("evidence") },
            { label: "Add an interview", icon: Plus, onClick: () => setDialog("interview") },
          ] },
          { title: "Status", items: [
            d.status === "open" && { label: "Waiting on lab or information", icon: Hourglass, onClick: () => void setStatus("pending", "Marked waiting") },
            d.status === "pending" && { label: "Back to open", icon: RotateCcw, onClick: () => void setStatus("open", "Back to open") },
            d.status !== "closed" && { label: "Close it", icon: CheckCircle2, tone: "ok", onClick: () => void setStatus("closed", "Closed") },
            d.status === "closed" && { label: "Reopen", icon: RotateCcw, onClick: () => void setStatus("open", "Reopened") },
          ] },
          { items: [
            { label: "Change the details of the fire", icon: Pencil, onClick: () => setDialog("details") },
            perms.settings && { label: "Delete the investigation", icon: Trash2, danger: true, onClick: () => setDialog("delete") },
          ] },
        ]} />
      </PageHead>

      <Group title="The fire" actions={<Button size="sm" variant="ghost" onClick={() => setDialog("details")}><Pencil className="h-4 w-4" />Change</Button>}>
        <Box>
          <Facts>
            <Fact label="When">{d.occurredAt ? dateTime(d.occurredAt, true) : null}</Fact>
            <Fact label="Where">{d.preplanId ? <Link href={`/businesses/${d.preplanId}`} className="text-sky hover:underline">{d.placeName ?? d.address}</Link> : [d.placeName, d.address].filter(Boolean).join(", ")}</Fact>
            <Fact label="What burned">{d.propertyType}</Fact>
            <Fact label="Incident number">{d.incidentNumber}</Fact>
            <Fact label="Lead investigator">{d.leadName}</Fact>
            <Fact label="Losses">{[d.lossCents != null ? `${money(d.lossCents)} estimated` : null, d.injuries ? `${d.injuries} injured` : null, d.fatalities ? `${d.fatalities} killed` : null].filter(Boolean).join(" · ") || null}</Fact>
          </Facts>
        </Box>
      </Group>

      <Group title="Origin and cause" actions={<Button size="sm" variant="ghost" onClick={() => setDialog("cause")}><Pencil className="h-4 w-4" />Change</Button>}>
        <Box>
          <Facts>
            <Fact label="Area of origin">{d.areaOfOrigin}</Fact>
            <Fact label="Heat source">{d.heatSource}</Fact>
            <Fact label="First item ignited">{d.firstItemIgnited}</Fact>
            <Fact label="Cause (NFPA 921)">{d.causeClass ? CAUSE_CLASS[d.causeClass].label : "Not decided yet"}</Fact>
            <Fact label="Cause (NERIS)">{neris?.label ?? d.nerisCause}</Fact>
            <Fact label="How it started" wide>{d.causeNotes}</Fact>
          </Facts>
        </Box>
      </Group>

      <Group title="Narrative" hint="The full write-up, in your own words.">
        <Textarea value={narrative ?? d.narrative ?? ""} onChange={e => setNarrative(e.target.value)} className="min-h-[200px]" />
        {narrative != null && narrative !== (d.narrative ?? "") && (
          <Button variant="primary" className="mt-2" loading={busy} onClick={async () => {
            setBusy(true);
            try { await patch({ narrative }, "Narrative saved"); setNarrative(null); } catch { /* shown */ } finally { setBusy(false); }
          }}><Save className="h-4 w-4" />Save the narrative</Button>
        )}
      </Group>

      <Group title={`Evidence (${d.evidence.length})`} actions={<Button size="sm" onClick={() => setDialog("evidence")}><Plus className="h-4 w-4" />Log evidence</Button>}>
        {d.evidence.length === 0 ? <Note>Nothing logged.</Note> : (
          <Box>
            {d.evidence.map(e => (
              <div key={e.id} className="border-b border-divider px-4 py-3.5 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[17px] font-medium">#{e.number || "?"} · {e.description}</span>
                  <Badge tone={e.status === "lab" ? "info" : e.status === "held" ? "brand" : "muted"}>{EVIDENCE_STATUS[e.status]}</Badge>
                </div>
                <div className="mt-0.5 text-[15px] text-ink-3">
                  {[e.location ? `found: ${e.location}` : null, e.collectedBy ? `collected by ${e.collectedBy}` : null, e.collectedAt ? dateTime(e.collectedAt, true) : null].filter(Boolean).join(" · ")}
                </div>
                {e.custody.length > 0 && (
                  <ol className="mt-2 space-y-1 border-l-2 border-divider pl-3">
                    {e.custody.map((c, i) => (
                      <li key={i} className="text-[15px] text-ink-2">{dateTime(c.at, true)}: {c.from} → {c.to}{c.purpose ? ` (${c.purpose})` : ""}</li>
                    ))}
                  </ol>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setCustodyFor(e)}><ArrowRightLeft className="h-4 w-4" />Hand it over</Button>
                  <Select value={e.status} className="h-10 w-auto min-w-52 text-[15px]" aria-label="Where it is now"
                    onChange={ev => patch({ evidence: d.evidence.map(x => (x.id === e.id ? { ...x, status: ev.target.value as EvidenceItem["status"] } : x)) }, "Updated").catch(() => undefined)}>
                    {(Object.keys(EVIDENCE_STATUS) as EvidenceItem["status"][]).map(s => <option key={s} value={s}>{EVIDENCE_STATUS[s]}</option>)}
                  </Select>
                </div>
              </div>
            ))}
          </Box>
        )}
      </Group>

      <Group title={`Interviews (${d.interviews.length})`} actions={<Button size="sm" onClick={() => setDialog("interview")}><Plus className="h-4 w-4" />Add an interview</Button>}>
        {d.interviews.length === 0 ? <Note>None recorded.</Note> : (
          <Box>
            {d.interviews.map(iv => (
              <div key={iv.id} className="border-b border-divider px-4 py-3.5 last:border-b-0">
                <div className="text-[17px] font-medium">{iv.name}{iv.role ? `, ${iv.role}` : ""}</div>
                <div className="text-[15px] text-ink-3">{[iv.phone, iv.at ? dateTime(iv.at, true) : null].filter(Boolean).join(" · ")}</div>
                {iv.summary && <p className="mt-1 whitespace-pre-line text-[16px] leading-6">{iv.summary}</p>}
              </div>
            ))}
          </Box>
        )}
      </Group>

      <Group title="Referral">
        <ReferralBox d={d} onSave={patch} />
      </Group>

      <Group title="Photos, sketches and files">
        <FilesPanel kind="investigations" id={id} files={d.attachments} canEdit
          onChange={files => qc.setQueryData<InvestigationDetail>(keys.investigation(id), cur => (cur ? { ...cur, attachments: files } : cur))} />
      </Group>

      <Group title="History">
        <HistoryPanel history={d.history} kind="investigations" id={id} canWrite
          onChange={h => qc.setQueryData<InvestigationDetail>(keys.investigation(id), cur => (cur ? { ...cur, history: h } : cur))} />
      </Group>

      {dialog === "cause" && <CauseDialog d={d} onClose={() => setDialog(null)} onSave={patch} />}
      {dialog === "details" && <DetailsDialog d={d} onClose={() => setDialog(null)} onSave={patch} />}
      {dialog === "evidence" && <EvidenceDialog onClose={() => setDialog(null)} next={d.evidence.length + 1}
        onSave={item => patch({ evidence: [...d.evidence, item] }, "Evidence logged")} />}
      {custodyFor && <CustodyDialog item={custodyFor} onClose={() => setCustodyFor(null)}
        onSave={entry => patch({ evidence: d.evidence.map(x => (x.id === custodyFor.id ? { ...x, custody: [...x.custody, entry] } : x)) }, "Hand-over recorded")} />}
      {dialog === "interview" && <InterviewDialog onClose={() => setDialog(null)}
        onSave={iv => patch({ interviews: [...d.interviews, iv] }, "Interview added")} />}
      <Confirm open={dialog === "delete"} danger title="Delete this investigation?" confirmLabel="Delete it" busy={busy}
        body="The whole record goes: evidence log, interviews, narrative and files. This can't be undone." onClose={() => setDialog(null)}
        onConfirm={async () => {
          setBusy(true);
          try { await api("DELETE", `${BASE}/investigations/${id}`); void refresh(); toast.success("Deleted"); navigate("/investigations"); }
          catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }} />
    </div>
  );
}

type Saver = (body: Record<string, unknown>, done?: string) => Promise<void>;

function Footer({ onClose, busy, onSave }: { onClose: () => void; busy: boolean; onSave: () => void }) {
  return <>
    <Button variant="ghost" onClick={onClose}>Cancel</Button>
    <Button variant="primary" size="lg" loading={busy} onClick={onSave}><Save className="h-5 w-5" />Save</Button>
  </>;
}

function useSaver(onSave: Saver, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (body: Record<string, unknown>, done: string) => {
      setBusy(true);
      try { await onSave(body, done); onClose(); } catch { /* shown */ } finally { setBusy(false); }
    },
  };
}

function CauseDialog({ d, onClose, onSave }: { d: InvestigationDetail; onClose: () => void; onSave: Saver }) {
  const [area, setArea] = useState(d.areaOfOrigin ?? "");
  const [heat, setHeat] = useState(d.heatSource ?? "");
  const [item, setItem] = useState(d.firstItemIgnited ?? "");
  const [cause, setCause] = useState<CauseClass | "">(d.causeClass ?? "");
  const [neris, setNeris] = useState(d.nerisCause ?? "");
  const [notes, setNotes] = useState(d.causeNotes ?? "");
  const s = useSaver(onSave, onClose);
  return (
    <Modal open onClose={onClose} title="Origin and cause" size="lg"
      footer={<Footer onClose={onClose} busy={s.busy} onSave={() => s.run({
        areaOfOrigin: area || null, heatSource: heat || null, firstItemIgnited: item || null,
        causeClass: cause || null, nerisCause: neris || null, causeNotes: notes || null,
      }, "Saved")} />}
    >
      <div className="space-y-5">
        <Field label="Area of origin" hint="The room or area, and where in it."><Input value={area} onChange={e => setArea(e.target.value)} placeholder="Kitchen, at the stove" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Heat source"><Input value={heat} onChange={e => setHeat(e.target.value)} placeholder="Cooking burner" /></Field>
          <Field label="First item ignited"><Input value={item} onChange={e => setItem(e.target.value)} placeholder="Cooking oil" /></Field>
        </div>
        <Field label="Cause classification (NFPA 921)" hint={cause ? CAUSE_CLASS[cause].help : "Leave undecided until the evidence supports one."}>
          <Select value={cause} onChange={e => setCause(e.target.value as CauseClass | "")}>
            <option value="">Not decided yet</option>
            {(Object.keys(CAUSE_CLASS) as CauseClass[]).map(c => <option key={c} value={c}>{CAUSE_CLASS[c].label}</option>)}
          </Select>
        </Field>
        <Field label="Cause for the NERIS report" hint="So the incident report and this record agree.">
          <Select value={neris} onChange={e => setNeris(e.target.value)}>
            <option value="">Not set</option>
            {NERIS_CAUSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="How it started" hint="The ignition sequence: what happened, in order."><Textarea value={notes} onChange={e => setNotes(e.target.value)} className="min-h-[140px]" /></Field>
      </div>
    </Modal>
  );
}

function DetailsDialog({ d, onClose, onSave }: { d: InvestigationDetail; onClose: () => void; onSave: Saver }) {
  const [title, setTitle] = useState(d.title);
  const [occurred, setOccurred] = useState(toLocalInput(d.occurredAt));
  const [incident, setIncident] = useState(d.incidentNumber ?? "");
  const [propertyType, setPropertyType] = useState(d.propertyType ?? PROPERTY_TYPES[0]);
  const [lead, setLead] = useState<number | null>(d.leadUserId);
  const [loss, setLoss] = useState<number | null>(d.lossCents);
  const [injuries, setInjuries] = useState(d.injuries == null ? "" : String(d.injuries));
  const [fatalities, setFatalities] = useState(d.fatalities == null ? "" : String(d.fatalities));
  const s = useSaver(onSave, onClose);
  const n = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v))) || 0);
  return (
    <Modal open onClose={onClose} title="The fire" size="lg"
      footer={<Footer onClose={onClose} busy={s.busy} onSave={() => s.run({
        title: title.trim() || d.title, occurredAt: occurred ? fromLocalInput(occurred) : null, incidentNumber: incident || null,
        propertyType, leadUserId: lead, lossCents: loss, injuries: n(injuries), fatalities: n(fatalities),
      }, "Saved")} />}
    >
      <div className="space-y-5">
        <Field label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When the fire happened"><Input type="datetime-local" value={occurred} onChange={e => setOccurred(e.target.value)} /></Field>
          <Field label="Incident number"><Input value={incident} onChange={e => setIncident(e.target.value)} /></Field>
          <Field label="What burned"><Select value={propertyType} onChange={e => setPropertyType(e.target.value)}>{PROPERTY_TYPES.map(p => <option key={p}>{p}</option>)}</Select></Field>
          <Field label="Lead investigator"><PersonSelect value={lead} onChange={setLead} prefer="investigates" /></Field>
          <Field label="Estimated loss"><MoneyInput cents={loss} onChange={setLoss} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Injured"><Input type="number" min={0} value={injuries} onChange={e => setInjuries(e.target.value)} /></Field>
            <Field label="Killed"><Input type="number" min={0} value={fatalities} onChange={e => setFatalities(e.target.value)} /></Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function EvidenceDialog({ onClose, onSave, next }: { onClose: () => void; onSave: (item: EvidenceItem) => Promise<void>; next: number }) {
  const [number, setNumber] = useState(String(next));
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [collectedBy, setCollectedBy] = useState("");
  const [collectedAt, setCollectedAt] = useState(toLocalInput(new Date().toISOString()));
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Log a piece of evidence" size="lg"
      footer={<Footer onClose={onClose} busy={busy} onSave={async () => {
        if (!description.trim()) { toast.error("Describe the evidence."); return; }
        setBusy(true);
        try {
          await onSave({ id: lineId(), number, description: description.trim(), location, collectedBy, collectedAt: collectedAt ? fromLocalInput(collectedAt) : null, status: "held", custody: [] });
          onClose();
        } catch { /* shown */ } finally { setBusy(false); }
      }} />}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Item number"><Input value={number} onChange={e => setNumber(e.target.value)} /></Field>
          <Field label="Collected by"><Input value={collectedBy} onChange={e => setCollectedBy(e.target.value)} /></Field>
          <Field label="When"><Input type="datetime-local" value={collectedAt} onChange={e => setCollectedAt(e.target.value)} /></Field>
        </div>
        <Field label="What it is" required><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Debris sample from the floor at the area of origin, in a sealed metal can" /></Field>
        <Field label="Where it was found"><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Grid B-3, 2 ft from the east wall" /></Field>
      </div>
    </Modal>
  );
}

function CustodyDialog({ item, onClose, onSave }: { item: EvidenceItem; onClose: () => void; onSave: (e: EvidenceItem["custody"][number]) => Promise<void> }) {
  const last = item.custody[item.custody.length - 1];
  const [from, setFrom] = useState(last?.to ?? item.collectedBy);
  const [to, setTo] = useState("");
  const [purpose, setPurpose] = useState("");
  const [at, setAt] = useState(toLocalInput(new Date().toISOString()));
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Hand over item #${item.number}`} size="md"
      description="Every hand-off is a line in the chain of custody."
      footer={<Footer onClose={onClose} busy={busy} onSave={async () => {
        if (!from.trim() || !to.trim()) { toast.error("Say who handed it over and who received it."); return; }
        setBusy(true);
        try { await onSave({ at: fromLocalInput(at) ?? new Date().toISOString(), from: from.trim(), to: to.trim(), purpose }); onClose(); }
        catch { /* shown */ } finally { setBusy(false); }
      }} />}
    >
      <div className="space-y-5">
        <Field label="Released by"><Input value={from} onChange={e => setFrom(e.target.value)} /></Field>
        <Field label="Received by"><Input value={to} onChange={e => setTo(e.target.value)} placeholder="State Fire Marshal's lab" /></Field>
        <Field label="Why"><Input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Lab analysis for ignitable liquids" /></Field>
        <Field label="When"><Input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function InterviewDialog({ onClose, onSave }: { onClose: () => void; onSave: (iv: Interview) => Promise<void> }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [phone, setPhone] = useState("");
  const [at, setAt] = useState(toLocalInput(new Date().toISOString()));
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Add an interview" size="lg"
      footer={<Footer onClose={onClose} busy={busy} onSave={async () => {
        if (!name.trim()) { toast.error("Who was interviewed?"); return; }
        setBusy(true);
        try { await onSave({ id: lineId(), name: name.trim(), role, phone, at: at ? fromLocalInput(at) : null, summary }); onClose(); }
        catch { /* shown */ } finally { setBusy(false); }
      }} />}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required><Input value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Who they are"><Select value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(r => <option key={r}>{r}</option>)}</Select></Field>
          <Field label="Phone"><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
          <Field label="When"><Input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} /></Field>
        </div>
        <Field label="What they said"><Textarea value={summary} onChange={e => setSummary(e.target.value)} className="min-h-[160px]" /></Field>
      </div>
    </Modal>
  );
}

function ReferralBox({ d, onSave }: { d: InvestigationDetail; onSave: Saver }) {
  const [referral, setReferral] = useState(d.referral ?? "");
  const [arrest, setArrest] = useState(d.arrestMade);
  const [busy, setBusy] = useState(false);
  const changed = referral !== (d.referral ?? "") || arrest !== d.arrestMade;
  return (
    <div className="space-y-3">
      <Field label="Referred to" hint="Police, the district attorney, ATF, the State Fire Marshal, an insurer, a youth firesetter program.">
        <Textarea value={referral} onChange={e => setReferral(e.target.value)} className="min-h-[80px]" />
      </Field>
      <Checkbox checked={arrest} onChange={setArrest}>An arrest was made</Checkbox>
      {changed && (
        <Button variant="primary" loading={busy} onClick={async () => {
          setBusy(true);
          try { await onSave({ referral: referral || null, arrestMade: arrest }, "Saved"); } catch { /* shown */ } finally { setBusy(false); }
        }}><Save className="h-4 w-4" />Save</Button>
      )}
    </div>
  );
}
