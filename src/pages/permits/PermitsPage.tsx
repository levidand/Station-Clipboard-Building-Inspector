import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Plus } from "lucide-react";
import { get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { daysBetween, formatDay } from "@/lib/format";
import { BASE, PERMIT_CATEGORY, PERMIT_STATUS, keys, typeLabel, useSettings } from "@/lib/inspections";
import type { Listed, PermitCategory, PermitRow } from "@/lib/types";
import { Badge, Button, TONE_EDGE } from "@/components/ui";
import { Box, EmptyBox, FilterBar, Group, ListRow, PAGE, PageHead, QueryState } from "@/components/kit";
import { usePlaceOf } from "@/components/records";
import { NewPermitDialog } from "./PermitDialogs";

type Filter = "waiting" | "active" | "expiring" | "closed" | "all";
const STATUS_OPTIONS: { value: Filter; label: string }[] = [
  { value: "waiting", label: "Waiting on us" }, { value: "active", label: "Issued" }, { value: "expiring", label: "Expiring soon" },
  { value: "closed", label: "Closed" }, { value: "all", label: "All" },
];
const GROUP_TITLE: Record<Filter, string> = {
  waiting: "Waiting on us", active: "Issued", expiring: "Expiring soon", closed: "Closed permits", all: "All permits",
};

export function PermitsPage() {
  const perms = usePermissions();
  const settings = useSettings();
  const [location, navigate] = useLocation();
  const search = new URLSearchParams(useSearch());
  const initial = search.get("status");
  const [filter, setFilter] = useState<Filter>((["waiting", "active", "expiring", "closed", "all"].includes(initial ?? "") ? initial : "waiting") as Filter);
  const [category, setCategory] = useState<PermitCategory | "">("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(search.get("new") === "1");
  const preplanId = Number(search.get("preplan")) || null;
  const place = usePlaceOf(preplanId);
  // Opened from a business with ?new=1: the address goes back to plain /permits once the form is closed.
  useEffect(() => { if (!adding && search.get("new")) navigate(location, { replace: true }); }, [adding]); // eslint-disable-line

  const params = new URLSearchParams({ status: filter, ...(category ? { category } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
  const list = useQuery({
    queryKey: [...keys.permits, params.toString()],
    queryFn: ({ signal }) => get<Listed<PermitRow>>(`${BASE}/permits?${params}`, signal),
    placeholderData: prev => prev,
  });
  const rows = list.data?.rows ?? [];
  const today = list.data?.today ?? "";

  return (
    <div className={PAGE}>
      <PageHead title="Permits" sub="Applications, plan review, and the permits the office has issued.">
        {perms.permits && <Button variant="primary" size="lg" onClick={() => setAdding(true)}><Plus className="h-5 w-5" />Take an application</Button>}
      </PageHead>

      <FilterBar search={{ value: q, onChange: setQ, placeholder: "Number, address, applicant" }} filters={[
        { label: "Status", value: filter, empty: "waiting", onChange: setFilter, options: STATUS_OPTIONS },
        { label: "Kind", value: category, empty: "", onChange: setCategory, options: [
          { value: "", label: "All kinds" },
          ...(Object.keys(PERMIT_CATEGORY) as PermitCategory[]).map(c => ({ value: c, label: PERMIT_CATEGORY[c] })),
        ] },
      ]} />

      <QueryState query={list}>
        {rows.length === 0 ? (
          <EmptyBox title="No permits here">{filter === "waiting" && perms.permits ? "New applications go in with the button at the top." : null}</EmptyBox>
        ) : (
          <Group title={`${GROUP_TITLE[filter]} (${rows.length})`}>
            <Box>
              {rows.map(p => {
                const waiting = ["applied", "in_review", "corrections", "approved"].includes(p.status);
                const age = waiting && p.appliedOn ? daysBetween(p.appliedOn, today) : null;
                const expiring = p.status === "issued" && p.expiresOn && daysBetween(today, p.expiresOn) <= 30;
                return (
                  <ListRow
                    key={p.id} href={`/permits/${p.id}`}
                    edge={expiring ? TONE_EDGE.warn : age != null && age > 30 ? TONE_EDGE.danger : undefined}
                    title={`${typeLabel(settings.data?.permitTypes, p.typeKey)}: ${p.placeName ?? p.address}`}
                    tags={<>
                      <Badge tone={PERMIT_STATUS[p.status].tone}>{PERMIT_STATUS[p.status].label}</Badge>
                      {age != null && <Badge tone={age > 30 ? "danger" : "muted"}>Waiting {age} day{age === 1 ? "" : "s"}</Badge>}
                      {expiring && <Badge tone="warn">Expires {formatDay(p.expiresOn, { weekday: false })}</Badge>}
                    </>}
                    detail={[p.number, p.applicantCompany ?? p.applicantName, p.reviewerName ? `review: ${p.reviewerName}` : null, p.issuedOn ? `issued ${formatDay(p.issuedOn, { weekday: false })}` : null].filter(Boolean).join(" · ")}
                  />
                );
              })}
            </Box>
          </Group>
        )}
      </QueryState>

      <NewPermitDialog open={adding && (!preplanId || !!place)} onClose={() => setAdding(false)} place={place} />
    </div>
  );
}
