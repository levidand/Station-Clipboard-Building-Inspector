import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Plus } from "lucide-react";
import { get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { formatDay, instantDay, relativeDay } from "@/lib/format";
import { BASE, CASE_PRIORITY, CASE_RESOLUTION, CASE_STATUS, keys, typeLabel, useSettings } from "@/lib/inspections";
import type { CaseRow, Listed } from "@/lib/types";
import { Badge, Button, TONE_EDGE } from "@/components/ui";
import { EmptyBox, FilterBar, Group, ListRow, PAGE, PageHead, PagedBox, QueryState } from "@/components/kit";
import { usePlaceOf } from "@/components/records";
import { NewComplaintDialog } from "./ComplaintDialogs";

type Filter = "open" | "due" | "closed" | "all";
const STATUS_OPTIONS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" }, { value: "due", label: "Due now" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" },
];
const GROUP_TITLE: Record<Filter, string> = { open: "Open complaints", due: "Due now", closed: "Closed complaints", all: "All complaints" };

export function ComplaintsPage() {
  const perms = usePermissions();
  const settings = useSettings();
  const [location, navigate] = useLocation();
  const search = new URLSearchParams(useSearch());
  const initial = search.get("status");
  const [filter, setFilter] = useState<Filter>((["open", "due", "closed", "all"].includes(initial ?? "") ? initial : "open") as Filter);
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(search.get("new") === "1");
  const preplanId = Number(search.get("preplan")) || null;
  const place = usePlaceOf(preplanId);
  useEffect(() => { if (!adding && search.get("new")) navigate(location, { replace: true }); }, [adding]); // eslint-disable-line

  const params = new URLSearchParams({ status: filter, ...(scope === "mine" ? { scope } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
  const list = useQuery({
    queryKey: [...keys.cases, params.toString()],
    queryFn: ({ signal }) => get<Listed<CaseRow>>(`${BASE}/cases?${params}`, signal),
    placeholderData: prev => prev,
  });
  const rows = list.data?.rows ?? [];
  const today = list.data?.today ?? "";

  return (
    <div className={PAGE}>
      <PageHead title="Complaints" sub="Code enforcement: from the first call to the property being brought into line.">
        {perms.cases && <Button variant="primary" size="lg" onClick={() => setAdding(true)}><Plus className="h-5 w-5" />Take a complaint</Button>}
      </PageHead>

      <FilterBar search={{ value: q, onChange: setQ, placeholder: "Number, address or owner" }} filters={[
        { label: "Status", value: filter, empty: "open", onChange: setFilter, options: STATUS_OPTIONS },
        { label: "Assigned to", value: scope, empty: "all", onChange: setScope, options: [{ value: "all", label: "Anyone" }, { value: "mine", label: "Me" }] },
      ]} />

      <QueryState query={list}>
        {rows.length === 0 ? <EmptyBox title={filter === "due" ? "Nothing due" : "No complaints here"} /> : (
          <Group title={`${GROUP_TITLE[filter]} (${rows.length})`}>
            <PagedBox rows={rows} resetKey={params.toString()} render={c => (
                <ListRow
                  key={c.id} href={`/complaints/${c.id}`}
                  edge={c.overdue ? TONE_EDGE.danger : c.priority === "high" && c.status !== "closed" ? TONE_EDGE.warn : undefined}
                  title={`${typeLabel(settings.data?.caseTypes, c.typeKey)}: ${c.placeName ?? c.address}`}
                  tags={<>
                    <Badge tone={CASE_STATUS[c.status].tone}>{CASE_STATUS[c.status].label}</Badge>
                    {c.priority === "high" && c.status !== "closed" && <Badge tone={CASE_PRIORITY.high.tone}>{CASE_PRIORITY.high.label}</Badge>}
                    {c.status !== "closed" && c.dueOn && <Badge tone={c.overdue ? "danger" : "muted"}>{c.overdue ? relativeDay(c.dueOn, today) : `Next: ${formatDay(c.dueOn, { weekday: false })}`}</Badge>}
                  </>}
                  detail={[c.number, c.placeName ? c.address : null, `received ${instantDay(c.receivedAt)}`, c.assignedName ?? (c.status === "closed" ? null : "Not assigned"), c.resolution ? CASE_RESOLUTION[c.resolution] : null].filter(Boolean).join(" · ")}
                />
              )} />
          </Group>
        )}
      </QueryState>

      <NewComplaintDialog open={adding && (!preplanId || !!place)} onClose={() => setAdding(false)} place={place} />
    </div>
  );
}
