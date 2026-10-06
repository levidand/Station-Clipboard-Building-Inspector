import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { CheckCircle2, ClipboardPlus, FilePlus2, Gavel, Hammer, Pencil, Printer, RotateCcw, Search, Send, Trash2 } from "lucide-react";
import { api, errorMessage, get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { dateTime, formatDay, relativeDay } from "@/lib/format";
import { BASE, CASE_PRIORITY, CASE_RESOLUTION, CASE_SOURCE, CASE_STATUS, keys, typeLabel, useRefreshAll, useSettings } from "@/lib/inspections";
import type { CaseDetail, CaseStatus } from "@/lib/types";
import { Badge, Button } from "@/components/ui";
import { ActionMenu, Box, Confirm, Fact, Facts, Group, Note, PAGE, PageHead, QueryState } from "@/components/kit";
import { FilesPanel, HistoryPanel, InspectionListRow, ScheduleDialog, ViolationLine } from "@/components/records";
import { ViolationDialog, type ViolationDraft } from "@/components/ViolationDialog";
import { toast } from "@/components/toast";
import { CloseDialog, EditComplaintDialog, NoticeDialog } from "./ComplaintDialogs";

export function ComplaintPage({ id }: { id: number }) {
  const perms = usePermissions();
  const settings = useSettings();
  const qc = useQueryClient();
  const refresh = useRefreshAll();
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: keys.case(id), queryFn: ({ signal }) => get<CaseDetail>(`${BASE}/cases/${id}`, signal) });
  const [dialog, setDialog] = useState<null | "notice" | "close" | "edit" | "visit" | "violation" | "delete">(null);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const saved = (next: CaseDetail) => { qc.setQueryData(keys.case(id), next); void refresh(); };

  if (!d) return <div className={PAGE}><QueryState query={q}>{null}</QueryState></div>;

  const closed = d.status === "closed";
  const type = typeLabel(settings.data?.caseTypes, d.typeKey);

  async function setStatus(status: CaseStatus) {
    setBusy(true);
    try { saved(await api<CaseDetail>("POST", `${BASE}/cases/${id}/status`, { status })); toast.success(CASE_STATUS[status].label); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }

  async function writeViolation(v: ViolationDraft) {
    await api("POST", `${BASE}/violations`, { ...v, caseId: id });
    await qc.invalidateQueries({ queryKey: keys.case(id) });
    void refresh();
    toast.success("Violation written");
  }

  return (
    <div className={PAGE}>
      <PageHead
        back={{ href: "/complaints", label: "Complaints" }}
        title={`${type}: ${d.placeName ?? d.address}`}
        sub={`${d.number}${d.placeName ? ` · ${d.address}` : ""}`}
        badges={<>
          <Badge tone={CASE_STATUS[d.status].tone}>{CASE_STATUS[d.status].label}</Badge>
          {d.priority === "high" && !closed && <Badge tone="danger">{CASE_PRIORITY.high.label}</Badge>}
          {d.overdue && <Badge tone="danger">Past its date</Badge>}
        </>}
      >
        <ActionMenu sections={[
          { title: "Next step", items: perms.cases && !closed ? [
            { label: "Schedule a visit", icon: ClipboardPlus, tone: "brand", hint: "A site visit or a re-check, on the calendar.", onClick: () => setDialog("visit") },
            { label: "Write a violation", icon: FilePlus2, tone: "warn", hint: "What's wrong, the code, and the date to fix it by.", onClick: () => setDialog("violation") },
            { label: "Record a notice", icon: Send, hint: "Write down that the owner was told, and how.", onClick: () => setDialog("notice") },
            { label: "Close it", icon: CheckCircle2, tone: "ok", hint: "Fixed, unfounded, or sent to someone else.", onClick: () => setDialog("close") },
          ] : [] },
          { title: "Print", items: [
            d.notices.length > 0 && { label: "Print the notice", icon: Printer, hint: "The letter to the owner, with the violations.", onClick: () => navigate(`/complaints/${id}/notice`) },
          ] },
          { title: "Status", items: !perms.cases ? [] : closed ? [
            { label: "Reopen", icon: RotateCcw, hint: "It goes back on the open list.", onClick: () => void setStatus("open") },
          ] : [
            d.status !== "investigating" && { label: "Mark \"Looking into it\"", icon: Search, onClick: () => void setStatus("investigating") },
            d.status !== "cited" && { label: "Mark cited", icon: Gavel, onClick: () => void setStatus("cited") },
            d.status !== "abatement" && { label: "Send for abatement", icon: Hammer, hint: "The city fixes it and bills the owner.", onClick: () => void setStatus("abatement") },
          ] },
          { items: [
            perms.cases && { label: "Change the details", icon: Pencil, onClick: () => setDialog("edit") },
            perms.settings && { label: "Delete the complaint", icon: Trash2, danger: true, onClick: () => setDialog("delete") },
          ] },
        ]} />
      </PageHead>

      <Group title="The complaint">
        <Box>
          <Facts>
            <Fact label="Received">{dateTime(d.receivedAt, true)}</Fact>
            <Fact label="How it came in">{CASE_SOURCE[d.source]}</Fact>
            <Fact label="Who's handling it">{d.assignedName}</Fact>
            <Fact label={closed ? "Closed" : "Next date"}>
              {closed ? `${dateTime(d.closedAt, true)}${d.resolution ? `: ${CASE_RESOLUTION[d.resolution]}` : ""}` : d.dueOn ? `${formatDay(d.dueOn)} (${relativeDay(d.dueOn, d.today)})` : null}
            </Fact>
            <Fact label="Where">{d.preplanId ? <Link href={`/businesses/${d.preplanId}`} className="text-sky hover:underline">{d.placeName ?? d.address}</Link> : [d.placeName, d.address].filter(Boolean).join(", ")}</Fact>
            <Fact label="Property owner">{[d.ownerName, d.ownerMailingAddress].filter(Boolean).join("\n")}</Fact>
            <Fact label="Who complained">
              {d.anonymous ? "Anonymous" : d.complainantHidden ? "On file (only people who work complaints can see it)"
                : [d.complainantName, d.complainantPhone, d.complainantEmail].filter(Boolean).join("\n") || null}
            </Fact>
            <Fact label="What was reported" wide>{d.description}</Fact>
          </Facts>
        </Box>
      </Group>

      <Group title={`Notices sent (${d.notices.length})`} actions={perms.cases && !closed ? <Button size="sm" onClick={() => setDialog("notice")}>Record a notice</Button> : undefined}>
        {d.notices.length === 0 ? <Note>No notice sent yet. Write the violations first, then record the notice and print it.</Note> : (
          <Box>
            {[...d.notices].reverse().map(n => (
              <div key={n.id} className="border-b border-divider px-4 py-3 last:border-b-0">
                <div className="text-[17px]">{formatDay(n.sentOn)} · {n.method}</div>
                <div className="text-[15px] text-ink-3">{[n.dueOn ? `comply by ${formatDay(n.dueOn)}` : null, n.by, n.note].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </Box>
        )}
      </Group>

      <Group title={`Violations (${d.violations.length})`} actions={perms.cases && !closed ? <Button size="sm" variant="warn" onClick={() => setDialog("violation")}><FilePlus2 className="h-4 w-4" />Write a violation</Button> : undefined}>
        {d.violations.length === 0 ? <Note>None written.</Note> : <Box>{d.violations.map(v => <ViolationLine key={v.id} v={v} />)}</Box>}
      </Group>

      <Group title={`Visits (${d.inspections.length})`} actions={perms.cases && !closed ? <Button size="sm" onClick={() => setDialog("visit")}><ClipboardPlus className="h-4 w-4" />Schedule a visit</Button> : undefined}>
        {d.inspections.length === 0 ? <Note>No visit yet.</Note> : <Box>{d.inspections.map(i => <InspectionListRow key={i.id} row={i} today={d.today} showPlace={false} />)}</Box>}
      </Group>

      <Group title="Photos" hint="Take photos from the street or another place you're allowed to be, at the first visit, every re-check, and after it's fixed.">
        <FilesPanel kind="cases" id={id} files={d.attachments} canEdit={perms.cases}
          onChange={files => qc.setQueryData<CaseDetail>(keys.case(id), cur => (cur ? { ...cur, attachments: files } : cur))} />
      </Group>

      <Group title="History">
        <HistoryPanel history={d.history} kind="cases" id={id} canWrite={perms.cases}
          onChange={h => qc.setQueryData<CaseDetail>(keys.case(id), cur => (cur ? { ...cur, history: h } : cur))} />
      </Group>

      <NoticeDialog open={dialog === "notice"} onClose={() => setDialog(null)} d={d} onSaved={saved} />
      <CloseDialog open={dialog === "close"} onClose={() => setDialog(null)} d={d} onSaved={saved} />
      <EditComplaintDialog open={dialog === "edit"} onClose={() => setDialog(null)} d={d} onSaved={saved} />
      <ViolationDialog open={dialog === "violation"} onClose={() => setDialog(null)} onSave={writeViolation} />
      <ScheduleDialog open={dialog === "visit"} onClose={() => setDialog(null)} preset={{
        caseId: d.id, discipline: d.typeKey === "blocked_exit" || d.typeKey === "overcrowding" || d.typeKey === "fire_hazard" ? "fire" : "code",
        typeKey: d.inspections.length ? "ce_recheck" : "ce_site_visit",
        place: { preplanId: d.preplanId, placeName: d.placeName, address: d.address, latitude: d.latitude, longitude: d.longitude },
        context: `For complaint ${d.number}`,
      }} />
      <Confirm open={dialog === "delete"} danger title="Delete this complaint?" confirmLabel="Delete it" busy={busy}
        body="The complaint, its notices and history are removed. Violations written on it stay. This can't be undone."
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          setBusy(true);
          try { await api("DELETE", `${BASE}/cases/${id}`); void refresh(); toast.success("Deleted"); navigate("/complaints"); }
          catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }} />
    </div>
  );
}
