import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Ban, CheckCircle2, ClipboardPlus, Pencil, Plus, RotateCcw, Save, Stamp, ThumbsUp, Trash2, UserPlus, X } from "lucide-react";
import { api, errorMessage, get } from "@/lib/api";
import { useAuth, usePermissions } from "@/lib/auth";
import { BASE, EVENT_FEATURES, EVENT_KIND, EVENT_STATUS, PERMIT_STATUS, keys, typeLabel, useRefreshAll, useSettings } from "@/lib/inspections";
import type { EventDetail, EventStatus, EventTask } from "@/lib/types";
import { Badge, Button, CheckGlyphButton, Field, IconButton, Input, Textarea, cx } from "@/components/ui";
import { ActionMenu, Box, Confirm, Fact, Facts, Group, ListRow, Note, PAGE, PageHead, QueryState } from "@/components/kit";
import { FilesPanel, HistoryPanel, InspectionListRow, PersonSelect, ScheduleDialog } from "@/components/records";
import { toast } from "@/components/toast";
import { NewPermitDialog } from "../permits/PermitDialogs";
import { EditEventDialog } from "./EventForm";
import { eventWhen } from "./EventsPage";

export function EventPage({ id }: { id: number }) {
  const perms = usePermissions();
  const { session } = useAuth();
  const settings = useSettings();
  const qc = useQueryClient();
  const refresh = useRefreshAll();
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: keys.event(id), queryFn: ({ signal }) => get<EventDetail>(`${BASE}/events/${id}`, signal) });
  const [dialog, setDialog] = useState<null | "edit" | "walk" | "permit" | "delete" | "cancel">(null);
  const [newTask, setNewTask] = useState("");
  const [adding, setAdding] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const can = perms.events;
  const saved = (next: EventDetail) => { qc.setQueryData(keys.event(id), next); void refresh(); };

  async function patch(body: Partial<EventDetail> & Record<string, unknown>, done?: string) {
    try { saved(await api<EventDetail>("PATCH", `${BASE}/events/${id}`, body)); if (done) toast.success(done); }
    catch (err) { toast.error(errorMessage(err)); }
  }

  if (!d) return <div className={PAGE}><QueryState query={q}>{null}</QueryState></div>;

  const me = session ? `${session.firstName} ${session.lastName}` : null;
  const toggleTask = (t: EventTask) => patch({
    tasks: d.tasks.map(x => (x.id === t.id ? { ...x, done: !x.done, doneBy: !x.done ? me : null, doneAt: !x.done ? new Date().toISOString() : null } : x)),
  });
  const addTask = async () => {
    if (!newTask.trim()) return;
    await patch({ tasks: [...d.tasks, { id: Math.random().toString(36).slice(2, 10), text: newTask.trim(), done: false, doneBy: null, doneAt: null }] });
    setNewTask("");
  };
  const setStatus = (status: EventStatus, done: string) => patch({ status }, done);
  const ended = new Date(d.endsAt).getTime() < Date.now();
  // Walk-throughs and permits are booked while it's still ahead.
  const planning = (d.status === "planning" || d.status === "approved") && !ended;
  const short = d.crowdManagersNeeded > 0 && (d.crowdManagers ?? 0) < d.crowdManagersNeeded;
  const tasksDone = d.tasks.filter(t => t.done).length;

  return (
    <div className={PAGE}>
      <PageHead
        back={{ href: "/events", label: "Events" }}
        title={d.title}
        sub={`${EVENT_KIND[d.kind]} · ${eventWhen(d)}${d.locationName || d.address ? ` · ${d.locationName ?? d.address}` : ""}`}
        badges={<Badge tone={EVENT_STATUS[d.status].tone}>{EVENT_STATUS[d.status].label}</Badge>}
      >
        <ActionMenu sections={[
          { title: "Next step", items: [
            can && d.status === "planning" && { label: "Approve", icon: ThumbsUp, tone: "ok", hint: "The plan is good to go.", onClick: () => void setStatus("approved", "Approved") },
            can && (d.status === "approved" || d.status === "planning") && ended && {
              label: "Mark done", icon: CheckCircle2, tone: "ok", hint: "Then write the after-event report below.", onClick: () => void setStatus("completed", "Marked done"),
            },
            perms.inspect && planning && { label: "Schedule a walk-through", icon: ClipboardPlus, tone: "brand", hint: "An inspection of the site before it opens.", onClick: () => setDialog("walk") },
            perms.permits && d.permits.length === 0 && planning && { label: "Start the event permit", icon: Stamp, tone: "info", onClick: () => setDialog("permit") },
          ] },
          { items: [
            can && { label: "Change the details", icon: Pencil, onClick: () => setDialog("edit") },
            can && d.status !== "planning" && { label: "Back to planning", icon: RotateCcw, onClick: () => void setStatus("planning", "Back to planning") },
            can && d.status !== "cancelled" && { label: "Cancel the event", icon: Ban, danger: true, onClick: () => setDialog("cancel") },
            can && perms.settings && { label: "Delete the event", icon: Trash2, danger: true, onClick: () => setDialog("delete") },
          ] },
        ]} />
      </PageHead>

      <Group title={`Planning list (${tasksDone} of ${d.tasks.length} done)`}>
        <Box>
          {d.tasks.length === 0 && <p className="px-4 py-4 text-[15px] text-ink-3">Nothing on the list.</p>}
          {d.tasks.map(t => (
            <div key={t.id} className="flex items-center gap-2 border-b border-divider pr-2 last:border-b-0">
              <CheckGlyphButton checked={t.done} disabled={!can} onClick={() => toggleTask(t)}
                label={t.text} detail={t.done && t.doneBy ? `Done by ${t.doneBy}` : undefined} />
              {can && (
                <IconButton label={`Remove "${t.text}"`} onClick={() => patch({ tasks: d.tasks.filter(x => x.id !== t.id) })}>
                  <X className="h-5 w-5" />
                </IconButton>
              )}
            </div>
          ))}
          {can && (
            <div className="flex gap-2 border-t border-divider px-4 py-3">
              <Input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add a step"
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void addTask(); } }} />
              <Button onClick={addTask} disabled={!newTask.trim()}><Plus className="h-4 w-4" />Add</Button>
            </div>
          )}
        </Box>
      </Group>

      <Group title="At the event" actions={can ? <Button size="sm" variant="ghost" onClick={() => setDialog("edit")}><Pencil className="h-4 w-4" />Change</Button> : undefined}>
        <Box>
          <Facts>
            <Fact label="People expected">{d.expectedAttendance?.toLocaleString()}</Fact>
            <Fact label="Approved occupant load">{d.occupantLoad?.toLocaleString()}</Fact>
            <Fact label="Crowd managers">
              {d.crowdManagersNeeded > 0 || d.crowdManagers
                ? <span className={cx(short && "text-orange")}>{d.crowdManagers ?? 0} assigned{d.crowdManagersNeeded > 0 ? `, ${d.crowdManagersNeeded} needed` : ""}</span>
                : null}
            </Fact>
            <Fact label="What will be there" wide>{d.features.map(f => EVENT_FEATURES.find(x => x.key === f)?.label ?? f).join(", ")}</Fact>
            <Fact label="Standing by">{d.standby && (d.standby.fire || d.standby.ems)
              ? [[d.standby.fire ? "Fire" : null, d.standby.ems ? "EMS" : null].filter(Boolean).join(" and "), d.standby.units, d.standby.personnel ? `${d.standby.personnel} people` : null, d.standby.notes].filter(Boolean).join(" · ")
              : "No standby"}</Fact>
            <Fact label="Organizer">{[d.organizerName, d.organizerOrg].filter(Boolean).join(", ")}</Fact>
            <Fact label="Organizer's contact">{[d.organizerPhone, d.organizerEmail].filter(Boolean).join(" · ")}</Fact>
            <Fact label="Address">{d.preplanId ? <Link href={`/businesses/${d.preplanId}`} className="text-sky hover:underline">{d.address}</Link> : d.address}</Fact>
            <Fact label="On the department calendar">{d.showOnCalendar ? "Yes, for everyone" : "Only in the Inspection Portal"}</Fact>
            {d.notes && <Fact label="Notes" wide>{d.notes}</Fact>}
          </Facts>
          {short && <p className="border-t border-divider px-4 py-3 text-[15px] text-orange">At least two crowd managers, and one for every 250 people, are needed for a crowd this size.</p>}
        </Box>
      </Group>

      <Group title={`Working it (${d.staff.length})`}>
        <Box>
          {d.staff.length === 0 && <p className="px-4 py-4 text-[15px] text-ink-3">No one assigned yet.</p>}
          {d.staff.map(s => (
            <div key={s.id} className="flex min-h-14 items-center gap-3 border-b border-divider px-4 last:border-b-0">
              <span className="flex-1 text-[17px]">{s.name}</span>
              {can && <IconButton label={`Take ${s.name} off`} onClick={() => patch({ staffUserIds: d.staffUserIds.filter(x => x !== s.id) })}><X className="h-5 w-5" /></IconButton>}
            </div>
          ))}
          {can && (
            <div className="flex flex-wrap gap-2 border-t border-divider px-4 py-3">
              <div className="min-w-64 flex-1"><PersonSelect value={adding} onChange={setAdding} noneLabel="Pick someone to add…" /></div>
              <Button disabled={!adding || d.staffUserIds.includes(adding)} onClick={async () => {
                if (!adding) return;
                await patch({ staffUserIds: [...d.staffUserIds, adding] }, "Added");
                setAdding(null);
              }}><UserPlus className="h-4 w-4" />Add</Button>
            </div>
          )}
        </Box>
      </Group>

      {(d.permits.length > 0 || d.inspections.length > 0) && (
        <Group title="Permits and walk-throughs">
          <Box>
            {d.permits.map(p => (
              <ListRow key={`p${p.id}`} href={`/permits/${p.id}`} title={typeLabel(settings.data?.permitTypes, p.typeKey)}
                tags={<Badge tone={PERMIT_STATUS[p.status].tone}>{PERMIT_STATUS[p.status].label}</Badge>} detail={p.number} />
            ))}
            {d.inspections.map(i => <InspectionListRow key={`i${i.id}`} row={i} today={d.today} showPlace={false} />)}
          </Box>
        </Group>
      )}

      {(ended || d.status === "completed") && <AfterReport d={d} canEdit={can} onSave={patch} />}

      <Group title="Site plans, photos and files">
        <FilesPanel kind="events" id={id} files={d.attachments} canEdit={can}
          onChange={files => qc.setQueryData<EventDetail>(keys.event(id), cur => (cur ? { ...cur, attachments: files } : cur))} />
      </Group>

      <Group title="History">
        <HistoryPanel history={d.history} kind="events" id={id} canWrite={can}
          onChange={h => qc.setQueryData<EventDetail>(keys.event(id), cur => (cur ? { ...cur, history: h } : cur))} />
      </Group>

      <EditEventDialog open={dialog === "edit"} onClose={() => setDialog(null)} d={d} onSaved={saved} />
      <ScheduleDialog open={dialog === "walk"} onClose={() => setDialog(null)} preset={{
        eventId: d.id, discipline: "event", typeKey: d.features.includes("tents") ? "tent" : d.kind === "fireworks" ? "fireworks_display" : "special_event",
        place: { preplanId: d.preplanId, placeName: d.locationName ?? d.title, address: d.address, latitude: d.latitude, longitude: d.longitude },
        context: `For ${d.title}`,
      }} />
      <NewPermitDialog open={dialog === "permit"} onClose={() => setDialog(null)} eventId={d.id}
        place={{ preplanId: d.preplanId, placeName: d.locationName ?? d.title, address: d.address, latitude: d.latitude, longitude: d.longitude }} />
      <Confirm open={dialog === "cancel"} danger title="Cancel the event?" confirmLabel="Cancel it" busy={busy}
        body="It stays on the calendar struck through, so nobody turns up for it." onClose={() => setDialog(null)}
        onConfirm={async () => { setBusy(true); await setStatus("cancelled", "Cancelled"); setBusy(false); setDialog(null); }} />
      <Confirm open={dialog === "delete"} danger title="Delete this event?" confirmLabel="Delete it" busy={busy}
        body="It's removed from the calendar and its planning list is lost. This can't be undone." onClose={() => setDialog(null)}
        onConfirm={async () => {
          setBusy(true);
          try { await api("DELETE", `${BASE}/events/${id}`); void refresh(); toast.success("Deleted"); navigate("/events"); }
          catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }} />
    </div>
  );
}

function AfterReport({ d, canEdit, onSave }: { d: EventDetail; canEdit: boolean; onSave: (b: Record<string, unknown>, done?: string) => Promise<void> }) {
  const [attendance, setAttendance] = useState(d.actualAttendance == null ? "" : String(d.actualAttendance));
  const [alarms, setAlarms] = useState(d.smokeAlarmsInstalled == null ? "" : String(d.smokeAlarmsInstalled));
  const [report, setReport] = useState(d.report ?? "");
  const [busy, setBusy] = useState(false);
  const n = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s))) || 0);
  if (!canEdit) {
    return (
      <Group title="After the event">
        <Box><Facts>
          <Fact label="People who came">{d.actualAttendance?.toLocaleString()}</Fact>
          {d.kind === "smoke_alarms" && <Fact label="Smoke alarms installed">{d.smokeAlarmsInstalled}</Fact>}
          <Fact label="Report" wide>{d.report}</Fact>
        </Facts></Box>
      </Group>
    );
  }
  return (
    <Group title="After the event">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="People who came"><Input type="number" min={0} value={attendance} onChange={e => setAttendance(e.target.value)} /></Field>
          {(d.kind === "smoke_alarms" || d.kind === "public_education") && (
            <Field label="Smoke alarms installed"><Input type="number" min={0} value={alarms} onChange={e => setAlarms(e.target.value)} /></Field>
          )}
        </div>
        <Field label="What happened" hint="Calls or transports, violations fixed on the day, anything to do differently next time.">
          <Textarea value={report} onChange={e => setReport(e.target.value)} className="min-h-[140px]" />
        </Field>
        <Button variant="primary" loading={busy} onClick={async () => {
          setBusy(true);
          await onSave({ actualAttendance: n(attendance), smokeAlarmsInstalled: n(alarms), report: report || null }, "Report saved");
          setBusy(false);
        }}><Save className="h-4 w-4" />Save the report</Button>
        <Note>Marking the event done keeps this report with it.</Note>
      </div>
    </Group>
  );
}
