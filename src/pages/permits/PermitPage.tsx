import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  BadgeCheck, Ban, CalendarX2, ClipboardCheck, ClipboardPlus, FileCheck2, FileSearch, Pencil, Printer, RotateCcw, Trash2, XCircle,
} from "lucide-react";
import { api, errorMessage, get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { dateTime, daysBetween, formatDay, money } from "@/lib/format";
import { BASE, PERMIT_CATEGORY, PERMIT_STATUS, keys, typeLabel, useRefreshAll, useSettings } from "@/lib/inspections";
import type { PermitDetail, PermitReview, PermitStatus } from "@/lib/types";
import { Badge, Button, Field, Textarea, TONE_EDGE, cx } from "@/components/ui";
import { ActionMenu, Box, Confirm, Fact, Facts, Group, Note, PAGE, PageHead, QueryState } from "@/components/kit";
import { FilesPanel, HistoryPanel, InspectionListRow, ScheduleDialog } from "@/components/records";
import { toast } from "@/components/toast";
import { EditPermitDialog, ReviewDialog } from "./PermitDialogs";

const REVIEW: Record<PermitReview["outcome"], { label: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  approved: { label: "Approved", tone: "ok" }, corrections: { label: "Corrections needed", tone: "warn" },
  denied: { label: "Denied", tone: "danger" }, comment: { label: "Comment", tone: "muted" },
};

export function PermitPage({ id }: { id: number }) {
  const perms = usePermissions();
  const settings = useSettings();
  const qc = useQueryClient();
  const refresh = useRefreshAll();
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: keys.permit(id), queryFn: ({ signal }) => get<PermitDetail>(`${BASE}/permits/${id}`, signal) });
  const [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [asking, setAsking] = useState<PermitStatus | "delete" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const saved = (next: PermitDetail) => { qc.setQueryData(keys.permit(id), next); void refresh(); };

  if (!d) return <div className={PAGE}><QueryState query={q}>{null}</QueryState></div>;

  const type = typeLabel(settings.data?.permitTypes, d.typeKey);
  const waiting = ["applied", "in_review", "corrections"].includes(d.status);
  const closed = ["finaled", "denied", "expired", "void"].includes(d.status);
  const age = d.appliedOn && !d.issuedOn && !closed ? daysBetween(d.appliedOn, d.today) : null;

  async function setStatus(status: PermitStatus) {
    setBusy(true);
    try {
      saved(await api<PermitDetail>("POST", `${BASE}/permits/${id}/status`, { status, note: note.trim() || undefined }));
      toast.success(PERMIT_STATUS[status].label);
      setAsking(null);
      setNote("");
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }

  const statusQuestions: Partial<Record<PermitStatus, { title: string; body: string; button: string; danger?: boolean }>> = {
    issued: { title: "Issue the permit?", body: "It becomes a live permit today, and expires on the date its type sets.", button: "Issue it" },
    finaled: { title: "Give final approval?", body: "The work passed its final inspection. The permit is closed.", button: "Final approval" },
    denied: { title: "Deny the application?", body: "Say why. The applicant can apply again.", button: "Deny it", danger: true },
    void: { title: "Void the permit?", body: "It was taken in error or withdrawn. It stays on record, marked void.", button: "Void it", danger: true },
    expired: { title: "Mark the permit expired?", body: "It's no longer valid.", button: "Mark expired", danger: true },
    in_review: { title: "Start plan review?", body: "Shows the application as being reviewed.", button: "Start review" },
    applied: { title: "Put the permit back to applied?", body: "Undoes the issue or the final approval. The dates are cleared.", button: "Put it back" },
  };
  const question = asking && asking !== "delete" ? statusQuestions[asking] : null;

  return (
    <div className={PAGE}>
      <PageHead
        back={{ href: "/permits", label: "Permits" }}
        title={`${type}`}
        sub={`${d.number} · ${d.placeName ? `${d.placeName}, ` : ""}${d.address}`}
        badges={<>
          <Badge tone={PERMIT_STATUS[d.status].tone}>{PERMIT_STATUS[d.status].label}</Badge>
          <Badge tone="muted">{PERMIT_CATEGORY[d.category]}</Badge>
        </>}
      >
        <ActionMenu sections={[
          { title: "Next step", items: [
            perms.permits && waiting && { label: "Record a plan review", icon: FileCheck2, tone: "brand", hint: "Approved, corrections needed, or denied, with comments.", onClick: () => setReviewing(true) },
            perms.permits && (d.status === "approved" || d.status === "in_review" || d.status === "applied") && {
              label: "Issue the permit", icon: BadgeCheck, tone: "ok", hint: "It becomes live today.", onClick: () => setAsking("issued"),
            },
            perms.permits && d.status === "issued" && { label: "Final approval", icon: ClipboardCheck, tone: "ok", hint: "The work passed its final inspection.", onClick: () => setAsking("finaled") },
            perms.inspect && d.status === "issued" && { label: "Schedule an inspection", icon: ClipboardPlus, tone: "brand", onClick: () => setScheduling(true) },
          ] },
          { title: "Print", items: [
            d.status === "issued" && { label: "Print the permit", icon: Printer, hint: "To post on the job or at the event.", onClick: () => navigate(`/permits/${id}/print`) },
          ] },
          { title: "Status", items: perms.permits ? [
            d.status === "applied" && { label: "Start plan review", icon: FileSearch, onClick: () => setAsking("in_review") },
            (d.status === "issued" || d.status === "finaled") && { label: "Put back to applied", icon: RotateCcw, hint: "Undoes the issue or the final approval.", onClick: () => setAsking("applied") },
            d.status === "issued" && { label: "Mark expired", icon: CalendarX2, onClick: () => setAsking("expired") },
            !closed && { label: "Deny", icon: XCircle, danger: true, onClick: () => setAsking("denied") },
            d.status !== "void" && { label: "Void", icon: Ban, danger: true, hint: "Taken in error or withdrawn.", onClick: () => setAsking("void") },
          ] : [] },
          { items: [
            perms.permits && { label: "Change the details", icon: Pencil, onClick: () => setEditing(true) },
            perms.permits && perms.settings && { label: "Delete the permit", icon: Trash2, danger: true, onClick: () => setAsking("delete") },
          ] },
        ]} />
      </PageHead>

      {age != null && d.category === "building" && (
        <div className={cx("border border-l-4 px-4 py-3 text-[16px] leading-6", age > 30 ? "border-red/60 bg-red/15" + " " + TONE_EDGE.danger : "border-faded bg-odd")}>
          Applied {age} day{age === 1 ? "" : "s"} ago. Texas law asks for a building permit to be granted or denied within 45 days of the application (Local Government Code 214.904).
        </div>
      )}

      <Group title="The permit">
        <Box>
          <Facts>
            <Fact label="Where">{d.preplanId ? <Link href={`/businesses/${d.preplanId}`} className="text-sky hover:underline">{d.placeName ?? d.address}</Link> : [d.placeName, d.address].filter(Boolean).join(", ")}</Fact>
            <Fact label="Applicant">{[d.applicantName, d.applicantCompany].filter(Boolean).join(", ")}</Fact>
            <Fact label="Contact">{[d.applicantPhone, d.applicantEmail].filter(Boolean).join(" · ")}</Fact>
            <Fact label="Applied">{d.appliedOn ? formatDay(d.appliedOn) : null}</Fact>
            <Fact label="Issued">{d.issuedOn ? formatDay(d.issuedOn) : null}</Fact>
            <Fact label="Expires">{d.expiresOn ? formatDay(d.expiresOn) : null}</Fact>
            {d.finaledOn && <Fact label="Final approval">{formatDay(d.finaledOn)}</Fact>}
            <Fact label="Fee">{d.feeCents != null ? <FeeLine d={d} canEdit={perms.permits} onSaved={saved} /> : null}</Fact>
            {d.valuationCents != null && <Fact label="Value of the work">{money(d.valuationCents)}</Fact>}
            <Fact label="Plan reviewer">{d.reviewerName}</Fact>
            {d.event && <Fact label="Event"><Link href={`/events/${d.event.id}`} className="text-sky hover:underline">{d.event.title}</Link></Fact>}
            <Fact label="The work or activity" wide>{d.description}</Fact>
            <Fact label="Conditions" wide>{d.conditions}</Fact>
          </Facts>
        </Box>
      </Group>

      <Group title={`Plan review (${d.reviews.length})`} actions={perms.permits && !closed ? <Button size="sm" onClick={() => setReviewing(true)}>Add a review</Button> : undefined}>
        {d.reviews.length === 0 ? <Note>No review recorded yet.</Note> : (
          <Box>
            {[...d.reviews].reverse().map(r => (
              <div key={r.id} className="border-b border-divider px-4 py-3.5 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={REVIEW[r.outcome].tone}>{REVIEW[r.outcome].label}</Badge>
                  <span className="text-[15px] text-ink-3">{[r.by, dateTime(r.at, true)].filter(Boolean).join(" · ")}</span>
                </div>
                {r.comments && <p className="mt-1.5 whitespace-pre-line text-[16px] leading-6">{r.comments}</p>}
              </div>
            ))}
          </Box>
        )}
      </Group>

      <Group title={`Inspections (${d.inspections.length})`} actions={perms.inspect && !closed ? <Button size="sm" onClick={() => setScheduling(true)}><ClipboardPlus className="h-4 w-4" />Schedule one</Button> : undefined}>
        {d.inspections.length === 0 ? <Note>None yet.</Note> : <Box>{d.inspections.map(i => <InspectionListRow key={i.id} row={i} today={d.today} showPlace={false} />)}</Box>}
      </Group>

      <Group title="Plans and files">
        <FilesPanel kind="permits" id={id} files={d.attachments} canEdit={perms.permits}
          onChange={files => qc.setQueryData<PermitDetail>(keys.permit(id), cur => (cur ? { ...cur, attachments: files } : cur))} />
      </Group>

      <Group title="History">
        <HistoryPanel history={d.history} kind="permits" id={id} canWrite={perms.permits}
          onChange={h => qc.setQueryData<PermitDetail>(keys.permit(id), cur => (cur ? { ...cur, history: h } : cur))} />
      </Group>

      <ReviewDialog open={reviewing} onClose={() => setReviewing(false)} permitId={id} onSaved={saved} />
      <EditPermitDialog open={editing} onClose={() => setEditing(false)} d={d} onSaved={saved} />
      <ScheduleDialog open={scheduling} onClose={() => setScheduling(false)} preset={{
        permitId: d.id, discipline: d.category === "building" ? "building" : d.category === "event" ? "event" : "fire",
        place: { preplanId: d.preplanId, placeName: d.placeName, address: d.address, latitude: d.latitude, longitude: d.longitude },
        context: `For permit ${d.number}`,
      }} />
      {question && asking && asking !== "delete" && (
        <Confirm open title={question.title} body={question.body} confirmLabel={question.button} danger={question.danger} busy={busy}
          onClose={() => setAsking(null)} onConfirm={() => setStatus(asking)}>
          <Field label="Note (optional)" className="mt-4"><Textarea value={note} onChange={e => setNote(e.target.value)} /></Field>
        </Confirm>
      )}
      <Confirm open={asking === "delete"} danger title="Delete this permit?" confirmLabel="Delete it" busy={busy}
        body="The permit and its review history are removed. Inspections booked against it stay. This can't be undone."
        onClose={() => setAsking(null)}
        onConfirm={async () => {
          setBusy(true);
          try { await api("DELETE", `${BASE}/permits/${id}`); void refresh(); toast.success("Deleted"); navigate("/permits"); }
          catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }} />
    </div>
  );
}

/** The fee and whether it's paid, with the one-press change beside it. */
function FeeLine({ d, canEdit, onSaved }: { d: PermitDetail; canEdit: boolean; onSaved: (d: PermitDetail) => void }) {
  const [busy, setBusy] = useState(false);
  async function mark(feePaid: boolean) {
    setBusy(true);
    try {
      onSaved(await api<PermitDetail>("PATCH", `${BASE}/permits/${d.id}`, { feePaid }));
      toast.success(feePaid ? "Fee marked paid" : "Fee marked not paid");
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {money(d.feeCents)}
      <Badge tone={d.feePaid ? "ok" : "warn"}>{d.feePaid ? "Paid" : "Not paid"}</Badge>
      {canEdit && (d.feePaid
        ? <Button size="sm" variant="ghost" loading={busy} onClick={() => void mark(false)}>Undo paid</Button>
        : <Button size="sm" variant="ok" loading={busy} onClick={() => void mark(true)}><BadgeCheck className="h-4 w-4" />Mark paid</Button>)}
    </span>
  );
}
