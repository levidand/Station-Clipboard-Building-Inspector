import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { BadgeCheck, ClipboardCheck, ClipboardPlus, FileCheck2, MoreHorizontal, Pencil, Printer, Trash2 } from "lucide-react";
import { api, errorMessage, get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { dateTime, daysBetween, formatDay, money } from "@/lib/format";
import { BASE, PERMIT_CATEGORY, PERMIT_STATUS, keys, typeLabel, useRefreshAll, useSettings } from "@/lib/inspections";
import type { PermitDetail, PermitReview, PermitStatus } from "@/lib/types";
import { Badge, Button, Field, Menu, MenuItem, Textarea, TONE_EDGE, cx } from "@/components/ui";
import { Box, Confirm, Fact, Facts, Group, Note, PAGE, PageHead, QueryState } from "@/components/kit";
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
  const [menu, setMenu] = useState(false);
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
        {perms.permits && waiting && <Button variant="primary" size="lg" onClick={() => setReviewing(true)}><FileCheck2 className="h-5 w-5" />Record a plan review</Button>}
        {perms.permits && (d.status === "approved" || d.status === "in_review" || d.status === "applied") && (
          <Button variant="ok" size="lg" onClick={() => setAsking("issued")}><BadgeCheck className="h-5 w-5" />Issue the permit</Button>
        )}
        {d.status === "issued" && <>
          <Button variant="primary" size="lg" onClick={() => navigate(`/permits/${id}/print`)}><Printer className="h-5 w-5" />Print the permit</Button>
          {perms.inspect && <Button size="lg" onClick={() => setScheduling(true)}><ClipboardPlus className="h-5 w-5" />Schedule an inspection</Button>}
          {perms.permits && <Button variant="ok" size="lg" onClick={() => setAsking("finaled")}><ClipboardCheck className="h-5 w-5" />Final approval</Button>}
        </>}
        {perms.permits && (
          <div className="relative">
            <Button size="lg" variant="ghost" onClick={() => setMenu(m => !m)} aria-label="More"><MoreHorizontal className="h-6 w-6" /></Button>
            <Menu open={menu} onClose={() => setMenu(false)}>
              <MenuItem icon={Pencil} onClick={() => { setMenu(false); setEditing(true); }}>Change the details</MenuItem>
              {d.status === "applied" && <MenuItem onClick={() => { setMenu(false); setAsking("in_review"); }}>Start plan review</MenuItem>}
              {(d.status === "issued" || d.status === "finaled") && <MenuItem onClick={() => { setMenu(false); setAsking("applied"); }}>Put back to applied</MenuItem>}
              {d.status === "issued" && <MenuItem onClick={() => { setMenu(false); setAsking("expired"); }}>Mark expired</MenuItem>}
              {!closed && <MenuItem danger onClick={() => { setMenu(false); setAsking("denied"); }}>Deny</MenuItem>}
              {d.status !== "void" && <MenuItem danger onClick={() => { setMenu(false); setAsking("void"); }}>Void</MenuItem>}
              {perms.settings && <MenuItem icon={Trash2} danger onClick={() => { setMenu(false); setAsking("delete"); }}>Delete</MenuItem>}
            </Menu>
          </div>
        )}
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
            <Fact label="Fee">{d.feeCents != null ? `${money(d.feeCents)} · ${d.feePaid ? "paid" : "not paid"}` : null}</Fact>
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
