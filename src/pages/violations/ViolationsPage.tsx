import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { CheckCircle2, Gavel, MoreHorizontal } from "lucide-react";
import { api, errorMessage, get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { BASE, keys, useRefreshAll } from "@/lib/inspections";
import type { Listed, Violation, ViolationStatus } from "@/lib/types";
import { Button, Field, Menu, MenuItem, Textarea } from "@/components/ui";
import { Box, Confirm, EmptyBox, FilterBar, Group, PAGE, PageHead, QueryState } from "@/components/kit";
import { ViolationLine } from "@/components/records";
import { toast } from "@/components/toast";

type Filter = "open" | "overdue" | "corrected" | "cited" | "void" | "all";

export function ViolationsPage() {
  const perms = usePermissions();
  const canAct = perms.inspect || perms.cases;
  const initial = new URLSearchParams(useSearch()).get("status");
  const [filter, setFilter] = useState<Filter>((["open", "overdue", "corrected", "cited", "void", "all"].includes(initial ?? "") ? initial : "open") as Filter);
  const [q, setQ] = useState("");
  const params = new URLSearchParams({ status: filter, ...(q.trim() ? { q: q.trim() } : {}) });
  const list = useQuery({
    queryKey: [...keys.violations, params.toString()],
    queryFn: ({ signal }) => get<Listed<Violation>>(`${BASE}/violations?${params}`, signal),
    placeholderData: prev => prev,
  });
  const rows = list.data?.rows ?? [];

  // Grouped by place, so a business with five violations reads as one stop.
  const byPlace = new Map<string, Violation[]>();
  for (const v of rows) {
    const key = `${v.preplanId ?? ""}|${v.address}`;
    if (!byPlace.has(key)) byPlace.set(key, []);
    byPlace.get(key)!.push(v);
  }

  return (
    <div className={PAGE}>
      <PageHead title="Violations" sub="Everything written up on inspections and complaints, and whether it's been fixed." />
      <FilterBar search={{ value: q, onChange: setQ, placeholder: "Business, address, code or words" }} filters={[
        { label: "Status", value: filter, empty: "open", onChange: setFilter, options: [
          { value: "open", label: "Open" }, { value: "overdue", label: "Past due" }, { value: "corrected", label: "Corrected" },
          { value: "cited", label: "Cited" }, { value: "void", label: "Void" }, { value: "all", label: "All" },
        ] },
      ]} />
      <QueryState query={list}>
        {rows.length === 0 ? (
          <EmptyBox title={filter === "overdue" ? "Nothing past due" : "Nothing here"}>
            {filter === "open" ? "No open violations. Violations are written from an inspection or a complaint." : null}
          </EmptyBox>
        ) : (
          [...byPlace.values()].map(group => (
            <Group key={`${group[0].preplanId}|${group[0].address}`} title={`${group[0].placeName ?? group[0].address} (${group.length})`}
              actions={group[0].preplanId ? <Link href={`/businesses/${group[0].preplanId}`} className="text-[15px] text-sky hover:underline">Open the business</Link> : undefined}>
              <Box>
                {group.map(v => <ViolationLine key={v.id} v={v} action={<RowActions v={v} canAct={canAct} />} />)}
              </Box>
            </Group>
          ))
        )}
      </QueryState>
    </div>
  );
}

function RowActions({ v, canAct }: { v: Violation; canAct: boolean }) {
  const refresh = useRefreshAll();
  const [menu, setMenu] = useState(false);
  const [asking, setAsking] = useState<null | "corrected" | "cited" | "void" | "open">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const source = v.inspectionId ? `/inspections/${v.inspectionId}` : v.caseId ? `/complaints/${v.caseId}` : null;

  async function set(status: ViolationStatus) {
    setBusy(true);
    try {
      await api("PATCH", `${BASE}/violations/${v.id}`, { status, resolutionNote: note.trim() || null });
      toast.success({ open: "Reopened", corrected: "Marked corrected", cited: "Marked cited", void: "Voided" }[status]);
      setAsking(null);
      setNote("");
      void refresh();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }

  const labels = {
    corrected: { title: "Mark this violation corrected?", button: "Mark corrected", body: "Use this when you've seen it fixed. A re-inspection does it for you." },
    cited: { title: "Mark this violation cited?", button: "Mark cited", body: "A citation was written, or it went to court. Note the citation or case number." },
    void: { title: "Void this violation?", button: "Void it", body: "It was written in error. It stays on record, marked void." },
    open: { title: "Reopen this violation?", button: "Reopen", body: "It goes back on the open list." },
  };

  return (
    <div className="flex gap-2">
      {source && <Link href={source} className="inline-flex h-10 items-center rounded-sm border border-faded px-3 text-[14px] font-medium uppercase tracking-[0.02em] hover:bg-white/[.075]">Open</Link>}
      {canAct && v.status === "open" && <Button size="sm" variant="ok" onClick={() => setAsking("corrected")}><CheckCircle2 className="h-4 w-4" />Fixed</Button>}
      {canAct && (
        <div className="relative">
          <Button size="sm" variant="ghost" onClick={() => setMenu(m => !m)} aria-label="More"><MoreHorizontal className="h-5 w-5" /></Button>
          <Menu open={menu} onClose={() => setMenu(false)}>
            {v.status === "open" && <MenuItem icon={Gavel} onClick={() => { setMenu(false); setAsking("cited"); }}>Mark cited</MenuItem>}
            {v.status !== "void" && <MenuItem danger onClick={() => { setMenu(false); setAsking("void"); }}>Void (written in error)</MenuItem>}
            {v.status !== "open" && <MenuItem onClick={() => { setMenu(false); setAsking("open"); }}>Reopen</MenuItem>}
          </Menu>
        </div>
      )}
      {asking && (
        <Confirm open title={labels[asking].title} confirmLabel={labels[asking].button} danger={asking === "void"} busy={busy}
          body={labels[asking].body} onClose={() => setAsking(null)} onConfirm={() => set(asking)}>
          <Field label="Note (optional)" className="mt-4">
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder={asking === "cited" ? "Citation number, court date" : "What was done"} />
          </Field>
        </Confirm>
      )}
    </div>
  );
}
