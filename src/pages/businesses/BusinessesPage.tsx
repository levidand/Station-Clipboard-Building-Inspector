import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Plus } from "lucide-react";
import { get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { formatDay, relativeDay } from "@/lib/format";
import { BASE, DUE, RISK, keys } from "@/lib/inspections";
import type { DueState, Listed, PropertyRow } from "@/lib/types";
import { Badge, Button, TONE_EDGE } from "@/components/ui";
import { Box, EmptyBox, FilterBar, Group, ListRow, PAGE, PageHead, QueryState } from "@/components/kit";
import { AddBusinessDialog } from "./ProgramDialog";

type Filter = "all" | "overdue" | "due_soon" | "program" | "none";
const ORDER: Record<DueState, number> = { overdue: 0, due_soon: 1, current: 2, none: 3 };
const PAGE_SIZE = 150;

export function BusinessesPage() {
  const perms = usePermissions();
  const [, navigate] = useLocation();
  const search = new URLSearchParams(useSearch());
  const [filter, setFilter] = useState<Filter>((["overdue", "due_soon", "program", "none"].includes(search.get("due") ?? "") ? search.get("due") : "all") as Filter);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const list = useQuery({ queryKey: keys.properties, queryFn: ({ signal }) => get<Listed<PropertyRow>>(`${BASE}/properties`, signal) });

  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (list.data?.rows ?? [])
      .filter(r => filter === "all" ? true
        : filter === "overdue" ? r.dueState === "overdue"
        : filter === "due_soon" ? r.dueState === "due_soon"
        : filter === "program" ? r.onProgram
        : !r.onProgram)
      .filter(r => words.every(w => `${r.name} ${r.address} ${r.occupancyType ?? ""} ${r.occupancyClass ?? ""} ${r.preplanNumber ?? ""}`.toLowerCase().includes(w)))
      .sort((a, b) => ORDER[a.dueState] - ORDER[b.dueState] || (a.nextDueOn ?? "9").localeCompare(b.nextDueOn ?? "9") || a.name.localeCompare(b.name));
  }, [list.data, filter, q]);
  const all = list.data?.rows ?? [];
  const count = (f: (r: PropertyRow) => boolean) => all.filter(f).length;

  return (
    <div className={PAGE}>
      <PageHead title="Businesses" sub="Every building the department has a preplan for, and when each one is due for inspection.">
        {perms.inspect && <Button variant="primary" size="lg" onClick={() => setAdding(true)}><Plus className="h-5 w-5" />Add a business</Button>}
      </PageHead>

      <FilterBar search={{ value: q, onChange: v => { setQ(v); setShown(PAGE_SIZE); }, placeholder: "Name, address or kind of business" }} filters={[
        { label: "Show", value: filter, empty: "all", onChange: (f: Filter) => { setFilter(f); setShown(PAGE_SIZE); }, options: [
          { value: "all", label: `All (${all.length})` },
          { value: "overdue", label: `Overdue (${count(r => r.dueState === "overdue")})` },
          { value: "due_soon", label: `Due soon (${count(r => r.dueState === "due_soon")})` },
          { value: "program", label: `On the program (${count(r => r.onProgram)})` },
          { value: "none", label: `Not on the program (${count(r => !r.onProgram)})` },
        ] },
      ]} />

      <QueryState query={list}>
        {rows.length === 0 ? (
          <EmptyBox title={all.length === 0 ? "No businesses yet" : "Nothing matches"}>
            {all.length === 0 ? "Businesses are the department's preplans. Add one here, or preplan buildings in the Command Portal." : "Try another word, or a different filter."}
          </EmptyBox>
        ) : (
          <Group title={`${rows.length} business${rows.length === 1 ? "" : "es"}`}>
            <Box>
              {rows.slice(0, shown).map(r => (
                <ListRow
                  key={r.preplanId} href={`/businesses/${r.preplanId}`}
                  edge={r.dueState === "overdue" ? TONE_EDGE.danger : r.dueState === "due_soon" ? TONE_EDGE.warn : undefined}
                  title={r.name}
                  tags={<>
                    {r.onProgram && <Badge tone={DUE[r.dueState].tone}>{r.dueState === "overdue" ? `Overdue ${relativeDay(r.nextDueOn, list.data!.today).replace(" late", "")}` : DUE[r.dueState].label}</Badge>}
                    {r.riskClass && <Badge tone={RISK[r.riskClass].tone}>{RISK[r.riskClass].label}</Badge>}
                    {r.openViolations > 0 && <Badge tone="warn">{r.openViolations} open violation{r.openViolations === 1 ? "" : "s"}</Badge>}
                  </>}
                  detail={[
                    r.address,
                    r.occupancyClass ?? r.occupancyType,
                    r.lastInspectedOn ? `last inspected ${formatDay(r.lastInspectedOn, { weekday: false })}` : "never inspected",
                    r.onProgram && r.nextDueOn ? `due ${formatDay(r.nextDueOn, { weekday: false })}` : null,
                  ].filter(Boolean).join(" · ")}
                />
              ))}
            </Box>
            {rows.length > shown && (
              <Button className="mt-3" onClick={() => setShown(s => s + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, rows.length - shown)} more</Button>
            )}
          </Group>
        )}
      </QueryState>

      <AddBusinessDialog open={adding} onClose={() => setAdding(false)} onAdded={id => navigate(`/businesses/${id}`)} />
    </div>
  );
}
