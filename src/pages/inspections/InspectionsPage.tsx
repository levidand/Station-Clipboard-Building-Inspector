import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardPlus } from "lucide-react";
import { get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { addDays } from "@/lib/format";
import { BASE, DISCIPLINE_LABELS, keys } from "@/lib/inspections";
import type { Discipline, InspectionRow, Listed } from "@/lib/types";
import { Button, Segmented, Select } from "@/components/ui";
import { Box, EmptyBox, Group, PAGE, PageHead, QueryState, SearchBox, Toolbar } from "@/components/kit";
import { InspectionListRow, ScheduleDialog } from "@/components/records";

type Status = "open" | "completed" | "cancelled";

export function InspectionsPage() {
  const perms = usePermissions();
  const [status, setStatus] = useState<Status>("open");
  const [scope, setScope] = useState<"mine" | "all">("all");
  const [discipline, setDiscipline] = useState<Discipline | "">("");
  const [q, setQ] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const params = new URLSearchParams({ status, ...(scope === "mine" ? { scope } : {}), ...(discipline ? { discipline } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
  const list = useQuery({
    queryKey: [...keys.inspections, params.toString()],
    queryFn: ({ signal }) => get<Listed<InspectionRow>>(`${BASE}/inspections?${params}`, signal),
    placeholderData: prev => prev,
  });
  const rows = list.data?.rows ?? [];
  const today = list.data?.today ?? "";

  return (
    <div className={PAGE}>
      <PageHead title="Inspections" sub="Every inspection: fire, building, code enforcement and events.">
        {perms.inspect && <Button variant="primary" size="lg" onClick={() => setScheduling(true)}><ClipboardPlus className="h-5 w-5" />Schedule an inspection</Button>}
      </PageHead>

      <Toolbar>
        <Segmented value={status} onChange={setStatus} options={[
          { value: "open", label: "To do" }, { value: "completed", label: "Finished" }, { value: "cancelled", label: "Cancelled" },
        ]} />
        <Segmented value={scope} onChange={setScope} options={[{ value: "all", label: "Everyone's" }, { value: "mine", label: "Mine" }]} />
        <Select value={discipline} onChange={e => setDiscipline(e.target.value as Discipline | "")} className="w-auto min-w-48" aria-label="Kind of inspection">
          <option value="">All kinds</option>
          {(Object.keys(DISCIPLINE_LABELS) as Discipline[]).map(d => <option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>)}
        </Select>
        <SearchBox value={q} onChange={setQ} placeholder="Business, address or number" />
      </Toolbar>

      <QueryState query={list}>
        {rows.length === 0 ? (
          <EmptyBox title={status === "open" ? "Nothing to do" : status === "completed" ? "No finished inspections" : "No cancelled inspections"}>
            {status === "open" && perms.inspect ? "Schedule one from the button at the top, or from a business." : null}
          </EmptyBox>
        ) : status === "open" ? (
          <OpenGroups rows={rows} today={today} />
        ) : (
          <Group title={`${rows.length} inspection${rows.length === 1 ? "" : "s"}`}>
            <Box>{rows.map(r => <InspectionListRow key={r.id} row={r} today={today} />)}</Box>
          </Group>
        )}
      </QueryState>

      <ScheduleDialog open={scheduling} onClose={() => setScheduling(false)} preset={{}} />
    </div>
  );
}

function OpenGroups({ rows, today }: { rows: InspectionRow[]; today: string }) {
  const weekEnd = addDays(today, 7);
  const groups: [string, InspectionRow[]][] = [
    ["Late", rows.filter(r => r.scheduledOn && r.scheduledOn < today)],
    ["Today", rows.filter(r => r.scheduledOn === today)],
    ["This week", rows.filter(r => r.scheduledOn && r.scheduledOn > today && r.scheduledOn <= weekEnd)],
    ["Later", rows.filter(r => r.scheduledOn && r.scheduledOn > weekEnd)],
    ["No day set yet", rows.filter(r => !r.scheduledOn)],
  ];
  return (
    <>
      {groups.filter(([, list]) => list.length).map(([title, list]) => (
        <Group key={title} title={`${title} (${list.length})`}>
          <Box>{list.map(r => <InspectionListRow key={r.id} row={r} today={today} />)}</Box>
        </Group>
      ))}
    </>
  );
}
