import { useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AlertTriangle, Building2, CalendarDays, ChevronRight, ClipboardPlus, Flame, Megaphone, Stamp } from "lucide-react";
import { get } from "@/lib/api";
import { useAuth, usePermissions } from "@/lib/auth";
import { addDays, dateTime, formatDay, relativeDay } from "@/lib/format";
import { BASE, CASE_STATUS, EVENT_KIND, PERMIT_STATUS, keys, typeLabel, useSettings } from "@/lib/inspections";
import type { InspectionRow, Today } from "@/lib/types";
import { Badge, Button, TONE_EDGE, TONE_TEXT, cx, type Tone } from "@/components/ui";
import { Box, EmptyBox, Group, ListRow, PAGE, PageHead, QueryState } from "@/components/kit";
import { InspectionListRow, ScheduleDialog, ViolationLine } from "@/components/records";

export function TodayPage() {
  const { session } = useAuth();
  const perms = usePermissions();
  const settings = useSettings();
  const q = useQuery({ queryKey: keys.today, queryFn: ({ signal }) => get<Today>(`${BASE}/today`, signal), refetchInterval: 60_000 });
  const [scheduling, setScheduling] = useState(false);
  const [, navigate] = useLocation();
  const t = q.data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className={PAGE}>
      <PageHead
        title={`${greeting}, ${session?.firstName ?? ""}`}
        sub={t ? `${formatDay(t.today)}. Here is what needs you.` : "Here is what needs you."}
      >
        {perms.inspect && <Button variant="primary" size="lg" onClick={() => setScheduling(true)}><ClipboardPlus className="h-5 w-5" />Schedule an inspection</Button>}
      </PageHead>

      <QueryState query={q}>
        {t && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <Tile href="/businesses?due=overdue" icon={Building2} count={t.counts.propertiesOverdue} tone="danger"
                label="Businesses overdue" detail={`${t.counts.propertiesDueSoon} more due in 30 days`} />
              <Tile href="/violations?status=overdue" icon={AlertTriangle} count={t.counts.violationsOverdue} tone="danger"
                label="Violations past due" detail={`${t.counts.violationsOpen} open in all`} />
              <Tile href="/complaints?status=due" icon={Megaphone} count={t.counts.casesDue} tone="warn"
                label="Complaints due" detail={`${t.counts.casesOpen} open in all`} />
              <Tile href="/permits?status=waiting" icon={Stamp} count={t.counts.permitsWaiting} tone="brand"
                label="Permits waiting" detail={`${t.counts.permitsExpiring} expiring within 30 days`} />
              <Tile href="/events" icon={CalendarDays} count={t.counts.eventsUpcoming} tone="info" className="col-span-2 sm:col-span-1"
                label="Events coming up" detail="In the next six weeks" />
            </div>
            {perms.investigations && t.counts.investigationsOpen > 0 && (
              <Link href="/investigations" className={cx("flex min-h-14 items-center gap-3 border border-l-4 border-faded bg-odd px-4 py-3 text-[17px] transition-colors hover:bg-hover", TONE_EDGE.warn)}>
                <Flame className="h-6 w-6 shrink-0 text-orange" />
                <span className="min-w-0 flex-1">{t.counts.investigationsOpen} fire investigation{t.counts.investigationsOpen === 1 ? "" : "s"} still open</span>
                <ChevronRight className="h-6 w-6 shrink-0 text-ink-4" />
              </Link>
            )}

            <MyInspections rows={t.mine} today={t.today} />

            {t.todays.some(i => i.assignedUserId !== session?.id) && (
              <Group title="Everyone's inspections today">
                <Box>{t.todays.map(i => <InspectionListRow key={i.id} row={i} today={t.today} />)}</Box>
              </Group>
            )}

            {t.casesDue.length > 0 && (
              <Group title="Complaints that need a visit or a re-check" actions={<Button size="sm" variant="ghost" onClick={() => navigate("/complaints")}>All complaints</Button>}>
                <Box>
                  {t.casesDue.map(c => (
                    <ListRow
                      key={c.id} href={`/complaints/${c.id}`} edge={TONE_EDGE.warn}
                      title={c.placeName ?? c.address}
                      tags={<><Badge tone={CASE_STATUS[c.status].tone}>{CASE_STATUS[c.status].label}</Badge><Badge tone="danger">{relativeDay(c.dueOn, t.today)}</Badge></>}
                      detail={[typeLabel(settings.data?.caseTypes, c.typeKey), c.assignedName ?? "Not assigned", c.number].join(" · ")}
                    />
                  ))}
                </Box>
              </Group>
            )}

            {t.violationsOverdue.length > 0 && (
              <Group title="Violations past their date" hint="Book a re-inspection from the inspection that found them.">
                <Box>
                  {t.violationsOverdue.map(v => (
                    <Link key={v.id} href={v.inspectionId ? `/inspections/${v.inspectionId}` : v.caseId ? `/complaints/${v.caseId}` : "/violations"} className="block hover:bg-hover">
                      <div className="px-4 pt-3 text-[15px] font-medium text-sky">{v.placeName ?? v.address}</div>
                      <ViolationLine v={v} />
                    </Link>
                  ))}
                </Box>
              </Group>
            )}

            {t.permitsWaiting.length > 0 && (
              <Group title="Permits waiting on the office">
                <Box>
                  {t.permitsWaiting.map(p => (
                    <ListRow
                      key={p.id} href={`/permits/${p.id}`}
                      title={p.placeName ?? p.address}
                      tags={<Badge tone={PERMIT_STATUS[p.status].tone}>{PERMIT_STATUS[p.status].label}</Badge>}
                      detail={[typeLabel(settings.data?.permitTypes, p.typeKey), p.applicantCompany ?? p.applicantName, p.appliedOn ? `applied ${formatDay(p.appliedOn)}` : null, p.number].filter(Boolean).join(" · ")}
                    />
                  ))}
                </Box>
              </Group>
            )}

            {t.events.length > 0 && (
              <Group title="Events coming up">
                <Box>
                  {t.events.map(e => (
                    <ListRow
                      key={e.id} href={`/events/${e.id}`}
                      title={e.title}
                      tags={<Badge tone="info">{EVENT_KIND[e.kind]}</Badge>}
                      detail={[dateTime(e.startsAt), e.locationName ?? e.address, e.tasksTotal ? `${e.tasksDone} of ${e.tasksTotal} planning steps done` : null].filter(Boolean).join(" · ")}
                    />
                  ))}
                </Box>
              </Group>
            )}
          </>
        )}
      </QueryState>

      <ScheduleDialog open={scheduling} onClose={() => setScheduling(false)} preset={{}} />
    </div>
  );
}

/** A count that opens its list: what it counts on top, the number, then one line of context. Laid out like a business's tiles. */
function Tile({ href, icon: Icon, count, label, detail, tone, className }: {
  href: string; icon: ComponentType<{ className?: string }>; count: number; label: string; detail: string; tone: Tone; className?: string;
}) {
  const zero = count === 0;
  return (
    <Link
      href={href}
      className={cx("flex min-h-[124px] min-w-0 flex-col border border-l-4 border-faded bg-odd px-4 py-3 transition-colors hover:bg-hover", zero ? "border-l-faded" : TONE_EDGE[tone], className)}
    >
      <span className="flex items-start gap-2 text-[15px] font-medium leading-5 text-ink-2">
        <Icon className={cx("mt-px h-5 w-5 shrink-0", zero ? "text-ink-4" : TONE_TEXT[tone])} />{label}
      </span>
      <span className={cx("mt-2 text-[36px] font-medium leading-none tabular-nums", zero ? "text-ink-3" : "text-ink")}>{count}</span>
      <span className="mt-auto pt-2 text-[14px] leading-5 text-ink-3">{detail}</span>
    </Link>
  );
}

/** The member's own inspections: late, today, the rest of the week, and ones with no day yet. */
function MyInspections({ rows, today }: { rows: InspectionRow[]; today: string }) {
  const weekEnd = addDays(today, 7);
  const late = rows.filter(r => r.scheduledOn && r.scheduledOn < today);
  const now = rows.filter(r => r.scheduledOn === today);
  const week = rows.filter(r => r.scheduledOn && r.scheduledOn > today && r.scheduledOn <= weekEnd);
  const unscheduled = rows.filter(r => !r.scheduledOn);
  if (!rows.length) {
    return (
      <Group title="Your inspections">
        <EmptyBox title="Nothing scheduled for you this week">
          Overdue businesses are on the Businesses page; schedule them from there, or from the button at the top.
        </EmptyBox>
      </Group>
    );
  }
  return (
    <>
      {late.length > 0 && <Group title={`Late (${late.length})`}><Box>{late.map(r => <InspectionListRow key={r.id} row={r} today={today} />)}</Box></Group>}
      <Group title={`Today (${now.length})`}>
        {now.length ? <Box>{now.map(r => <InspectionListRow key={r.id} row={r} today={today} />)}</Box> : <EmptyBox title="Nothing scheduled for today" />}
      </Group>
      {week.length > 0 && <Group title={`The rest of the week (${week.length})`}><Box>{week.map(r => <InspectionListRow key={r.id} row={r} today={today} />)}</Box></Group>}
      {unscheduled.length > 0 && <Group title={`Assigned to you, no day yet (${unscheduled.length})`}><Box>{unscheduled.map(r => <InspectionListRow key={r.id} row={r} today={today} />)}</Box></Group>}
    </>
  );
}
