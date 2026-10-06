import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { clockTime, dateTime, dayOf, formatDay } from "@/lib/format";
import { BASE, EVENT_KIND, EVENT_STATUS, keys } from "@/lib/inspections";
import type { EventRow } from "@/lib/types";
import { Badge, Button, Segmented } from "@/components/ui";
import { Box, EmptyBox, Group, ListRow, PAGE, PageHead, QueryState, SearchBox, Toolbar } from "@/components/kit";
import { NewEventDialog } from "./EventForm";

/** "Sat, Jul 4, 2026, 6:00 PM – 10:00 PM", or both days when it runs over. */
export function eventWhen(e: { startsAt: string; endsAt: string }): string {
  return dayOf(e.startsAt) === dayOf(e.endsAt)
    ? `${formatDay(dayOf(e.startsAt))}, ${clockTime(e.startsAt)} – ${clockTime(e.endsAt)}`
    : `${dateTime(e.startsAt)} – ${dateTime(e.endsAt)}`;
}

export function EventsPage() {
  const perms = usePermissions();
  const [when, setWhen] = useState<"upcoming" | "past" | "all">("upcoming");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const params = new URLSearchParams({ when, ...(q.trim() ? { q: q.trim() } : {}) });
  const list = useQuery({
    queryKey: [...keys.events, params.toString()],
    queryFn: ({ signal }) => get<EventRow[]>(`${BASE}/events?${params}`, signal),
    placeholderData: prev => prev,
  });
  const rows = list.data ?? [];

  // Grouped by month, the way people plan them.
  const months = new Map<string, EventRow[]>();
  for (const e of rows) {
    const m = new Date(`${dayOf(e.startsAt)}T12:00:00Z`).toLocaleDateString([], { month: "long", year: "numeric", timeZone: "UTC" });
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(e);
  }

  return (
    <div className={PAGE}>
      <PageHead title="Events" sub="Special events, fireworks, public education and standby. They show on the department calendar too.">
        {perms.events && <Button variant="primary" size="lg" onClick={() => setAdding(true)}><CalendarPlus className="h-5 w-5" />Plan an event</Button>}
      </PageHead>
      <Toolbar>
        <Segmented value={when} onChange={setWhen} options={[{ value: "upcoming", label: "Coming up" }, { value: "past", label: "Past" }, { value: "all", label: "All" }]} />
        <SearchBox value={q} onChange={setQ} placeholder="Name or place" />
      </Toolbar>
      <QueryState query={list}>
        {rows.length === 0 ? (
          <EmptyBox title={when === "upcoming" ? "Nothing planned" : "No events"}>{perms.events && when === "upcoming" ? "Plan one with the button at the top." : null}</EmptyBox>
        ) : [...months.entries()].map(([month, list]) => (
          <Group key={month} title={month}>
            <Box>
              {list.map(e => (
                <ListRow
                  key={e.id} href={`/events/${e.id}`}
                  title={e.title}
                  muted={e.status === "cancelled"}
                  tags={<><Badge tone="info">{EVENT_KIND[e.kind]}</Badge><Badge tone={EVENT_STATUS[e.status].tone}>{EVENT_STATUS[e.status].label}</Badge></>}
                  detail={[eventWhen(e), e.locationName ?? e.address, e.expectedAttendance ? `${e.expectedAttendance.toLocaleString()} expected` : null,
                    e.tasksTotal ? `${e.tasksDone} of ${e.tasksTotal} planning steps done` : null].filter(Boolean).join(" · ")}
                />
              ))}
            </Box>
          </Group>
        ))}
      </QueryState>
      <NewEventDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
