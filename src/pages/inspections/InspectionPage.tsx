import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Ban, CalendarClock, CheckCircle2, ClipboardPlus, CloudOff, FilePlus2, Loader2, Pencil, Play, Printer, RotateCcw, Save, Trash2,
} from "lucide-react";
import { api, errorMessage, get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { dateTime, formatDay, money, relativeDay, timeOfDay } from "@/lib/format";
import {
  BASE, DISCIPLINE_LABELS, INSPECTION_STATUS, RESULT, RISK, keys, typeLabel, useRefreshAll, useSettings,
} from "@/lib/inspections";
import type { ChecklistAnswer, InspectionDetail, Listed, Violation } from "@/lib/types";
import {
  Badge, Button, Checkbox, Field, Input, Modal, MoneyInput, Segmented, Select, Textarea,
} from "@/components/ui";
import { ActionMenu, Box, Confirm, Fact, Facts, Group, Note, PAGE, PageHead, QueryState } from "@/components/kit";
import {
  FilesPanel, HistoryPanel, InspectionListRow, PersonSelect, ScheduleDialog, ViolationLine,
} from "@/components/records";
import { ViolationDialog, draftFromCode, type ViolationDraft } from "@/components/ViolationDialog";
import { SignaturePad } from "@/components/SignaturePad";
import { toast } from "@/components/toast";
import { ChecklistView } from "./ChecklistView";
import { FinishDialog, type FinishChoice } from "./FinishDialog";

/** What the inspector types on site. Saved as they go, so a dead tablet loses nothing. */
interface Draft {
  checklist: ChecklistAnswer[];
  notes: string;
  contactName: string;
  contactTitle: string;
  signature: string | null;
  signedName: string;
}

const fromDetail = (d: InspectionDetail): Draft => ({
  checklist: d.checklist, notes: d.notes ?? "", contactName: d.contactName ?? "", contactTitle: d.contactTitle ?? "",
  signature: d.signature, signedName: d.signedName ?? "",
});

/** Violations ticked "fixed" on a re-check, kept on the device until the inspection is finished. */
function clearedKey(id: number) { return `ip.cleared.${id}`; }
function readCleared(id: number): number[] {
  try { return JSON.parse(localStorage.getItem(clearedKey(id)) ?? "[]") as number[]; } catch { return []; }
}

export function InspectionPage({ id }: { id: number }) {
  const perms = usePermissions();
  const settings = useSettings();
  const qc = useQueryClient();
  const refresh = useRefreshAll();
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: keys.inspection(id), queryFn: ({ signal }) => get<InspectionDetail>(`${BASE}/inspections/${id}`, signal) });
  const d = q.data;
  const active = d?.status === "in_progress";
  const editable = perms.inspect && active;

  // The local copy of what's being typed. Taken from the server when the page
  // opens and whenever the inspection changes state (started, finished,
  // reopened); never overwritten by a refetch in between.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const stamp = d ? `${d.id}:${d.status}` : null;
  if (d && stamp !== seen) { setSeen(stamp); setDraft(fromDetail(d)); }

  const dirty = useRef(false);
  const [saveState, setSaveState] = useState<"saved" | "waiting" | "saving" | "error">("saved");
  const edit = (patch: Partial<Draft>) => { dirty.current = true; setDraft(cur => (cur ? { ...cur, ...patch } : cur)); };

  useEffect(() => {
    if (!editable || !draft || !dirty.current) return;
    setSaveState("waiting");
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        const next = await api<InspectionDetail>("PATCH", `${BASE}/inspections/${id}`, {
          checklist: draft.checklist, notes: draft.notes || null, contactName: draft.contactName || null,
          contactTitle: draft.contactTitle || null, signature: draft.signature, signedName: draft.signedName || null,
        });
        dirty.current = false;
        qc.setQueryData(keys.inspection(id), next);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => clearTimeout(t);
  }, [draft, editable, id, qc]);

  const [cleared, setCleared] = useState<number[]>(() => readCleared(id));
  const markCleared = (vid: number, fixed: boolean) => {
    const next = fixed ? [...new Set([...cleared, vid])] : cleared.filter(x => x !== vid);
    setCleared(next);
    try { localStorage.setItem(clearedKey(id), JSON.stringify(next)); } catch { /* storage off */ }
  };

  // Violations still open at this business from earlier visits: a re-check of
  // any kind can find them fixed.
  const earlier = useQuery({
    queryKey: [...keys.violations, "open", d?.preplanId],
    queryFn: ({ signal }) => get<Listed<Violation>>(`${BASE}/violations?status=open&preplanId=${d!.preplanId}`, signal),
    enabled: !!d?.preplanId && d.status !== "completed" && d.status !== "cancelled",
  });
  const carried = mergeCarried(d, earlier.data?.rows ?? []);

  const [violationFor, setViolationFor] = useState<{ start: ViolationDraft | null; editing?: Violation } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishBusy, setFinishBusy] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rebooking, setRebooking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(name: string, run: () => Promise<InspectionDetail | void>, done?: string) {
    setBusy(name);
    try {
      const next = await run();
      if (next) qc.setQueryData(keys.inspection(id), next);
      void refresh();
      if (done) toast.success(done);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally { setBusy(null); }
  }

  async function saveViolation(v: ViolationDraft, editing?: Violation) {
    if (editing) await api("PATCH", `${BASE}/violations/${editing.id}`, v);
    else await api("POST", `${BASE}/violations`, { ...v, inspectionId: id });
    await qc.invalidateQueries({ queryKey: keys.inspection(id) });
    toast.success(editing ? "Violation updated" : "Violation written");
  }

  function writeFor(item: ChecklistAnswer) {
    const code = settings.data?.violationCodes.find(c => c.id === item.id) ?? settings.data?.violationCodes.find(c => c.code === item.codeRef);
    setViolationFor({
      start: code ? { ...draftFromCode(code), description: item.note || code.description }
        : { codeRef: item.codeRef, title: item.text, description: item.note, location: "", correctiveAction: "", severity: "minor", dueOn: null },
    });
  }

  async function finish(choice: FinishChoice) {
    if (!draft) return;
    setFinishBusy(true);
    try {
      const next = await api<InspectionDetail>("POST", `${BASE}/inspections/${id}/complete`, {
        result: choice.result, checklist: draft.checklist, notes: draft.notes || null,
        contactName: draft.contactName || null, contactTitle: draft.contactTitle || null,
        signature: draft.signature, signedName: draft.signedName || null,
        clearedViolationIds: cleared.filter(c => carried.some(v => v.id === c)),
        reinspectOn: choice.reinspectOn, reinspectAssignedUserId: choice.reinspectAssignedUserId,
      });
      dirty.current = false;
      try { localStorage.removeItem(clearedKey(id)); } catch { /* storage off */ }
      setCleared([]);
      qc.setQueryData(keys.inspection(id), next);
      void refresh();
      setFinishing(false);
      toast.success(`Finished: ${RESULT[choice.result].label}${choice.reinspectOn ? `. Re-inspection booked for ${formatDay(choice.reinspectOn)}` : ""}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally { setFinishBusy(false); }
  }

  if (!d || !draft) return <div className={PAGE}><QueryState query={q}>{null}</QueryState></div>;

  const type = typeLabel(settings.data?.inspectionTypes, d.typeKey);
  const done = d.status === "completed";
  const status = done && d.result ? RESULT[d.result] : INSPECTION_STATUS[d.status];
  const late = !done && d.status !== "cancelled" && !!d.scheduledOn && d.scheduledOn < d.today;
  const openWritten = d.violations.filter(v => v.status === "open");
  const stillOpenCarried = carried.filter(v => !cleared.includes(v.id));
  const start = () => void act("start", () => api("POST", `${BASE}/inspections/${id}/start`), "Started. Work down the checklist.");
  const reopen = () => {
    if (window.confirm("Reopen this inspection so it can be changed? Violations it wrote stay as they are.")) {
      void act("reopen", () => api("POST", `${BASE}/inspections/${id}/reopen`), "Reopened");
    }
  };
  const markFixed = (v: Violation) => act(`fix-${v.id}`, async () => {
    await api("PATCH", `${BASE}/violations/${v.id}`, { status: "corrected", resolutionNote: active ? "Corrected on site" : "Corrected" });
    await qc.invalidateQueries({ queryKey: keys.inspection(id) });
  }, "Marked corrected");

  return (
    <div className={PAGE}>
      <PageHead
        back={{ href: "/inspections", label: "Inspections" }}
        title={d.placeName ?? d.address}
        sub={`${type} · ${d.number}${d.placeName ? ` · ${d.address}` : ""}`}
        badges={<>
          <Badge tone={late ? "danger" : status.tone}>{late ? `Late: ${relativeDay(d.scheduledOn, d.today)}` : status.label}</Badge>
          {active && <SaveState state={saveState} />}
        </>}
      >
        <ActionMenu sections={[
          { title: "Next step", items: [
            perms.inspect && d.status === "scheduled" && { label: "Start inspection", icon: Play, tone: "ok", hint: "Opens the checklist. Everything is saved as you go.", onClick: start },
            editable && { label: "Finish inspection", icon: CheckCircle2, tone: "ok", hint: "Pick the result, and book a re-inspection if it needs one.", onClick: () => setFinishing(true) },
            editable && { label: "Write a violation", icon: FilePlus2, tone: "warn", hint: "One that isn't on the checklist.", onClick: () => setViolationFor({ start: null }) },
            done && perms.inspect && { label: "Book a re-inspection", icon: ClipboardPlus, tone: "brand", hint: "Comes back to check the violations are fixed.", onClick: () => setRebooking(true) },
          ] },
          { title: "Print", items: [
            done && { label: "Print the report", icon: Printer, hint: "What was checked and found, to leave with the business.", onClick: () => navigate(`/inspections/${id}/report`) },
            done && d.violations.length > 0 && { label: "Print the notice", icon: Printer, hint: "The violation notice, with the dates to fix them by.", onClick: () => navigate(`/inspections/${id}/notice`) },
          ] },
          { items: [
            perms.inspect && d.status === "scheduled" && { label: "Change the day or inspector", icon: CalendarClock, onClick: () => setEditingDetails(true) },
            perms.inspect && (done || d.status === "cancelled") && { label: "Reopen", icon: RotateCcw, hint: "So it can be changed. Violations it wrote stay as they are.", onClick: reopen },
            perms.inspect && d.status === "scheduled" && { label: "Cancel the inspection", icon: Ban, danger: true, onClick: () => setCancelling(true) },
            perms.settings && { label: "Delete the inspection", icon: Trash2, danger: true, onClick: () => setDeleting(true) },
          ] },
        ]} />
      </PageHead>

      {d.status === "scheduled" && (
        <div className="flex flex-col gap-3 border border-sky/40 bg-sky/10 px-4 py-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-[16px] leading-6">
            When you get there, start the inspection. The checklist below opens up, and everything you enter is saved as you go.
          </p>
          {perms.inspect && <Button variant="ok" size="lg" loading={busy === "start"} onClick={start}><Play className="h-5 w-5" />Start inspection</Button>}
        </div>
      )}

      <Group title="Details" actions={perms.inspect && active ? <Button size="sm" variant="ghost" onClick={() => setEditingDetails(true)}><Pencil className="h-4 w-4" />Change</Button> : undefined}>
        <Box>
          <Facts>
            <Fact label="Type">{type}</Fact>
            <Fact label="Kind">{DISCIPLINE_LABELS[d.discipline]}</Fact>
            <Fact label="Scheduled">{d.scheduledOn ? `${formatDay(d.scheduledOn)}${d.scheduledTime ? `, ${timeOfDay(d.scheduledTime)}` : ""}` : null}</Fact>
            <Fact label="Inspector">{d.assignedName}</Fact>
            {done && <Fact label="Finished">{`${dateTime(d.completedAt, true)}${d.completedByName ? ` by ${d.completedByName}` : ""}`}</Fact>}
            {d.status === "cancelled" && <Fact label="Cancelled">{d.cancelReason ?? "No reason given"}</Fact>}
            <Fact label="Business">
              {d.preplanId ? <Link href={`/businesses/${d.preplanId}`} className="text-sky hover:underline">{d.placeName ?? d.address}</Link> : null}
            </Fact>
            {d.property && <>
              <Fact label="Occupancy class">{d.property.occupancyClass}</Fact>
              <Fact label="Risk">{d.property.riskClass ? RISK[d.property.riskClass].label : null}</Fact>
              <Fact label="Owner">{[d.property.ownerName, d.property.ownerPhone].filter(Boolean).join(" · ")}</Fact>
            </>}
            {d.parent && <Fact label="Re-checks"><Link href={`/inspections/${d.parent.id}`} className="text-sky hover:underline">{d.parent.number}</Link></Fact>}
            {d.permit && <Fact label="Permit"><Link href={`/permits/${d.permit.id}`} className="text-sky hover:underline">{d.permit.number}</Link></Fact>}
            {d.case && <Fact label="Complaint"><Link href={`/complaints/${d.case.id}`} className="text-sky hover:underline">{d.case.number}</Link></Fact>}
            {d.event && <Fact label="Event"><Link href={`/events/${d.event.id}`} className="text-sky hover:underline">{d.event.title}</Link></Fact>}
          </Facts>
        </Box>
      </Group>

      {carried.length > 0 && (
        <Group title="Still open from earlier visits" hint={active ? "Mark each one fixed or still open. They're cleared when you finish." : undefined}>
          <Box>
            {carried.map(v => (
              <ViolationLine key={v.id} v={v} action={editable ? (
                <Segmented
                  value={cleared.includes(v.id) ? "fixed" : "open"}
                  onChange={c => markCleared(v.id, c === "fixed")}
                  options={[{ value: "fixed", label: "Fixed", tone: "ok" }, { value: "open", label: "Still open", tone: "danger" }]}
                />
              ) : undefined} />
            ))}
          </Box>
        </Group>
      )}

      {(d.checklist.length > 0 || active) && (
        <section>
          <ChecklistView
            items={active ? draft.checklist : d.checklist}
            onChange={items => edit({ checklist: items })}
            editable={editable}
            violations={d.violations}
            onWriteViolation={writeFor}
          />
        </section>
      )}

      <Group
        title={`Violations written on this visit (${d.violations.length})`}
        actions={editable ? <Button size="sm" variant="warn" onClick={() => setViolationFor({ start: null })}><FilePlus2 className="h-4 w-4" />Write a violation</Button> : undefined}
      >
        {d.violations.length === 0 ? <Note>None.</Note> : (
          <Box>
            {d.violations.map(v => (
              <ViolationLine key={v.id} v={v} action={perms.inspect && v.status === "open" ? (
                <ActionMenu size="sm" variant="secondary" sections={[{ items: [
                  { label: "It's fixed", icon: CheckCircle2, tone: "ok", hint: active ? "Corrected on site, while you're here." : "Marks it corrected.", onClick: () => void markFixed(v) },
                  { label: "Edit the violation", icon: Pencil, onClick: () => setViolationFor({ start: violationDraft(v), editing: v }) },
                ] }]} />
              ) : undefined} />
            ))}
          </Box>
        )}
      </Group>

      <Group title="What you found">
        {editable ? (
          <Textarea value={draft.notes} onChange={e => edit({ notes: e.target.value })} className="min-h-[140px]"
            placeholder="Anything worth writing down: who you met, what you saw, what you told them." />
        ) : <Box><p className="whitespace-pre-line px-4 py-4 text-[17px] leading-7">{d.notes || <span className="text-ink-4">Nothing written.</span>}</p></Box>}
      </Group>

      <Group title="Photos and files">
        <FilesPanel kind="inspections" id={id} files={d.attachments} canEdit={perms.inspect && d.status !== "cancelled"}
          onChange={files => qc.setQueryData<InspectionDetail>(keys.inspection(id), cur => (cur ? { ...cur, attachments: files } : cur))} />
      </Group>

      <Group title="The person you met" hint={editable ? "They sign to say they received the results, not that they agree with them." : undefined}>
        {editable ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><Input value={draft.contactName} onChange={e => edit({ contactName: e.target.value })} /></Field>
              <Field label="Title or role"><Input value={draft.contactTitle} onChange={e => edit({ contactTitle: e.target.value })} placeholder="Manager, owner" /></Field>
            </div>
            {/* Not a <Field>: that's a <label>, and a click anywhere in a label
                presses its first button, which here is "Clear the signature". */}
            <div>
              <span className="mb-1.5 block text-[15px] font-medium text-ink">Signature</span>
              <SignaturePad value={draft.signature} onChange={sig => edit({ signature: sig, signedName: draft.signedName || draft.contactName })} />
            </div>
          </div>
        ) : (
          <Box>
            <Facts cols={2}>
              <Fact label="Name">{[d.contactName, d.contactTitle].filter(Boolean).join(", ")}</Fact>
              <Fact label="Signed">{d.signature ? <img src={d.signature} alt="Signature" className="mt-1 h-20 rounded-sm bg-white p-1" /> : null}</Fact>
            </Facts>
          </Box>
        )}
      </Group>

      {editable && (
        <div className="flex flex-col gap-3 border border-green/50 bg-green/10 px-4 py-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-[16px] leading-6">
            Walked the whole building? Finish the inspection to pick the result, close out what was fixed, and book a re-inspection if it needs one.
          </p>
          <Button variant="ok" size="lg" onClick={() => setFinishing(true)}><CheckCircle2 className="h-5 w-5" />Finish inspection</Button>
        </div>
      )}

      <FeeBox d={d} canEdit={perms.inspect} onSaved={next => qc.setQueryData(keys.inspection(id), next)} />

      {d.reinspections.length > 0 && (
        <Group title="Re-inspections">
          <Box>{d.reinspections.map(r => <InspectionListRow key={r.id} row={r} today={d.today} showPlace={false} />)}</Box>
        </Group>
      )}

      <Group title="History">
        <HistoryPanel history={d.history} kind="inspections" id={id} canWrite={perms.inspect}
          onChange={h => qc.setQueryData<InspectionDetail>(keys.inspection(id), cur => (cur ? { ...cur, history: h } : cur))} />
      </Group>

      <ViolationDialog
        open={!!violationFor} onClose={() => setViolationFor(null)}
        start={violationFor?.start} title={violationFor?.editing ? "Edit the violation" : "Write a violation"}
        onSave={v => saveViolation(v, violationFor?.editing)}
      />
      <FinishDialog
        open={finishing} onClose={() => setFinishing(false)} onFinish={finish} busy={finishBusy}
        items={draft.checklist} openViolations={[...openWritten, ...stillOpenCarried]} assignedUserId={d.assignedUserId}
      />
      <DetailsDialog open={editingDetails} onClose={() => setEditingDetails(false)} d={d}
        onSaved={next => { qc.setQueryData(keys.inspection(id), next); void refresh(); }} />
      <CancelDialog open={cancelling} onClose={() => setCancelling(false)}
        onCancel={reason => act("cancel", () => api("POST", `${BASE}/inspections/${id}/cancel`, { reason }), "Cancelled").then(() => setCancelling(false))} />
      <ScheduleDialog open={rebooking} onClose={() => setRebooking(false)}
        preset={{
          parentId: d.id, typeKey: d.discipline === "code" ? "ce_recheck" : "reinspection",
          place: { preplanId: d.preplanId, placeName: d.placeName, address: d.address, latitude: d.latitude, longitude: d.longitude },
          context: `Re-checks ${d.number}`,
        }} />
      <Confirm
        open={deleting} danger title="Delete this inspection?" confirmLabel="Delete it" busy={busy === "delete"}
        body="It disappears from the schedule and the business's history. Violations it wrote stay, as their own records. This can't be undone."
        onClose={() => setDeleting(false)}
        onConfirm={() => act("delete", async () => { await api("DELETE", `${BASE}/inspections/${id}`); navigate("/inspections"); }, "Deleted")}
      />
    </div>
  );
}

/** The re-inspection's own carried list and any other open violations at the business, once each. */
function mergeCarried(d: InspectionDetail | undefined, atBusiness: Violation[]): Violation[] {
  if (!d) return [];
  const mine = new Set(d.violations.map(v => v.id));
  const seen = new Set<number>();
  return [...d.carriedViolations.filter(v => v.status === "open"), ...atBusiness]
    .filter(v => !mine.has(v.id) && !seen.has(v.id) && (seen.add(v.id), true));
}

function violationDraft(v: Violation): ViolationDraft {
  return {
    codeRef: v.codeRef, title: v.title, description: v.description, location: v.location,
    correctiveAction: v.correctiveAction, severity: v.severity, dueOn: v.dueOn,
  };
}

function SaveState({ state }: { state: "saved" | "waiting" | "saving" | "error" }) {
  if (state === "error") return <Badge tone="danger"><CloudOff className="h-4 w-4" />Not saved, check the connection</Badge>;
  if (state === "saving" || state === "waiting") return <Badge tone="muted"><Loader2 className="h-4 w-4 animate-spin" />Saving…</Badge>;
  return <Badge tone="muted"><CheckCircle2 className="h-4 w-4" />All changes saved</Badge>;
}

function FeeBox({ d, canEdit, onSaved }: { d: InspectionDetail; canEdit: boolean; onSaved: (d: InspectionDetail) => void }) {
  const settings = useSettings();
  const schedule = settings.data?.fees ?? [];
  const [fee, setFee] = useState<number | null>(d.feeCents);
  const [paid, setPaid] = useState(d.feePaid);
  // Which line of the fee schedule the amount came from. Not stored on the
  // inspection, so it's worked out from the amount when the page opens.
  const [feeKey, setFeeKey] = useState("");
  const [busy, setBusy] = useState(false);
  // Follow the saved fee when it changes underneath (saved here, or by someone else).
  const [seen, setSeen] = useState<string | null>(null);
  const stamp = `${d.feeCents}:${d.feePaid}:${schedule.length}`;
  if (stamp !== seen) {
    setSeen(stamp);
    setFee(d.feeCents);
    setPaid(d.feePaid);
    setFeeKey(schedule.find(f => f.amountCents === d.feeCents)?.key ?? "");
  }
  // Nothing to pay without an amount.
  const noFee = !fee;
  const paidNow = paid && !noFee;
  const changed = fee !== d.feeCents || paidNow !== d.feePaid;
  function amount(cents: number | null) {
    setFee(cents);
    if (schedule.find(f => f.key === feeKey)?.amountCents !== cents) setFeeKey("");
    if (!cents) setPaid(false);
  }
  if (!canEdit && d.feeCents == null) return null;
  return (
    <Group title="Fee">
      <Box>
        <Row>
          {canEdit ? (
            <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
              {schedule.length > 0 && (
                <Field label="Fee schedule">
                  <Select
                    value={feeKey} placeholder="Pick a fee…" className="w-auto min-w-64"
                    onChange={e => {
                      const f = schedule.find(x => x.key === e.target.value);
                      if (f) { setFeeKey(f.key); setFee(f.amountCents); }
                    }}
                  >
                    {schedule.map(f => <option key={f.key} value={f.key}>{f.label} ({money(f.amountCents)})</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Amount">
                <MoneyInput cents={fee} onChange={amount} />
              </Field>
              <Checkbox checked={paidNow} onChange={setPaid} disabled={noFee} className="h-12">Paid</Checkbox>
              <Button variant="primary" disabled={!changed} loading={busy} onClick={async () => {
                setBusy(true);
                try { onSaved(await api<InspectionDetail>("PATCH", `${BASE}/inspections/${d.id}`, { feeCents: fee, feePaid: paidNow })); toast.success(paidNow ? "Fee saved, marked paid" : "Fee saved"); }
                catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
              }}><Save className="h-4 w-4" />Save fee</Button>
            </div>
          ) : (
            <p className="flex items-center gap-3 text-[17px]">
              {money(d.feeCents)}<Badge tone={d.feePaid ? "ok" : "warn"}>{d.feePaid ? "Paid" : "Not paid"}</Badge>
            </p>
          )}
        </Row>
      </Box>
    </Group>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="px-4 py-4">{children}</div>;
}

function DetailsDialog({ open, onClose, d, onSaved }: { open: boolean; onClose: () => void; d: InspectionDetail; onSaved: (d: InspectionDetail) => void }) {
  if (!open) return null;
  return <DetailsForm onClose={onClose} d={d} onSaved={onSaved} />;
}

function DetailsForm({ onClose, d, onSaved }: { onClose: () => void; d: InspectionDetail; onSaved: (d: InspectionDetail) => void }) {
  const settings = useSettings();
  const [typeKey, setTypeKey] = useState(d.typeKey);
  const [day, setDay] = useState(d.scheduledOn ?? "");
  const [time, setTime] = useState(d.scheduledTime ?? "");
  const [who, setWho] = useState<number | null>(d.assignedUserId);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Change the inspection" size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={async () => {
          setBusy(true);
          try {
            onSaved(await api<InspectionDetail>("PATCH", `${BASE}/inspections/${d.id}`, {
              typeKey, scheduledOn: day || null, scheduledTime: time || null, assignedUserId: who,
            }));
            toast.success("Saved");
            onClose();
          } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}><Save className="h-5 w-5" />Save</Button>
      </>}
    >
      <div className="space-y-5">
        <Field label="Type of inspection">
          <Select value={typeKey} onChange={e => setTypeKey(e.target.value)}>
            {(settings.data?.inspectionTypes ?? []).filter(t => t.active || t.key === d.typeKey).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Day"><Input type="date" value={day} onChange={e => setDay(e.target.value)} /></Field>
          <Field label="Time (optional)"><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
        </div>
        <Field label="Inspector"><PersonSelect value={who} onChange={setWho} /></Field>
      </div>
    </Modal>
  );
}

function CancelDialog({ open, onClose, onCancel }: { open: boolean; onClose: () => void; onCancel: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Confirm open={open} title="Cancel this inspection?" confirmLabel="Cancel the inspection" busy={busy} danger
      body="It stays on record as cancelled. It can be reopened later."
      onClose={onClose}
      onConfirm={async () => { setBusy(true); try { await onCancel(reason.trim()); } finally { setBusy(false); } }}
    >
      <Field label="Why (optional)" className="mt-4">
        <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Business closed, owner asked to move it" />
      </Field>
    </Confirm>
  );
}

