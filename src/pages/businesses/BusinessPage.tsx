import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ClipboardPlus, Megaphone, Pencil, Stamp } from "lucide-react";
import { get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { formatDay, instantDay, relativeDay } from "@/lib/format";
import { BASE, CASE_STATUS, DUE, OCCUPANCY_CLASSES, PERMIT_STATUS, RISK, keys, typeLabel, useSettings } from "@/lib/inspections";
import type { PropertyDetail } from "@/lib/types";
import { Badge, Button } from "@/components/ui";
import { Box, Fact, Facts, Group, ListRow, Note, PAGE, PageHead, QueryState } from "@/components/kit";
import { InspectionListRow, PreplanLink, ScheduleDialog, ViolationLine } from "@/components/records";
import { ProgramDialog } from "./ProgramDialog";

const CONSTRUCTION: Record<string, string> = {
  type_i: "Type I (fire resistive)", type_ii: "Type II (non-combustible)", type_iii: "Type III (ordinary)",
  type_iv: "Type IV (heavy timber)", type_v: "Type V (wood frame)", unknown: "",
};

export function BusinessPage({ id }: { id: number }) {
  const perms = usePermissions();
  const settings = useSettings();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: keys.property(id), queryFn: ({ signal }) => get<PropertyDetail>(`${BASE}/properties/${id}`, signal) });
  const [scheduling, setScheduling] = useState(false);
  const [editing, setEditing] = useState(false);
  const d = q.data;

  if (!d) return <div className={PAGE}><QueryState query={q}>{null}</QueryState></div>;

  const pp = d.preplan;
  const place = { preplanId: d.preplanId, placeName: d.name, address: d.address, latitude: d.latitude, longitude: d.longitude };
  const openViolations = d.violations.filter(v => v.status === "open");
  const occupancy = OCCUPANCY_CLASSES.find(o => o.code === d.occupancyClass);

  return (
    <div className={PAGE}>
      <PageHead
        back={{ href: "/businesses", label: "Businesses" }}
        title={d.name}
        sub={d.address}
        badges={<>
          {d.onProgram && <Badge tone={DUE[d.dueState].tone}>{DUE[d.dueState].label}</Badge>}
          {d.riskClass && <Badge tone={RISK[d.riskClass].tone}>{RISK[d.riskClass].label}</Badge>}
        </>}
      >
        {perms.inspect && <Button variant="primary" size="lg" onClick={() => setScheduling(true)}><ClipboardPlus className="h-5 w-5" />Schedule an inspection</Button>}
        {perms.cases && <Button size="lg" onClick={() => navigate(`/complaints?new=1&preplan=${d.preplanId}`)}><Megaphone className="h-5 w-5" />Take a complaint</Button>}
        {perms.permits && <Button size="lg" onClick={() => navigate(`/permits?new=1&preplan=${d.preplanId}`)}><Stamp className="h-5 w-5" />New permit</Button>}
      </PageHead>

      <Group
        title="Inspection program"
        actions={perms.inspect ? <Button size="sm" variant={d.hasProgram ? "ghost" : "primary"} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />{d.hasProgram ? "Change" : "Put on the program"}</Button> : undefined}
      >
        <Box>
          {!d.onProgram && (
            <p className="border-b border-divider px-4 py-3 text-[16px] text-ink-2">
              {d.hasProgram ? "Taken off the inspection program. It no longer comes due." : "Not on the inspection program yet, so it never comes due."}
            </p>
          )}
          <Facts>
            <Fact label="Next inspection due">{d.onProgram && d.nextDueOn ? `${formatDay(d.nextDueOn)} (${relativeDay(d.nextDueOn, d.today)})` : null}</Fact>
            <Fact label="Last inspected">{d.lastInspectedOn ? formatDay(d.lastInspectedOn) : "Never"}</Fact>
            <Fact label="Inspected every">{d.onProgram ? `${d.effectiveFrequencyMonths} months${d.frequencyMonths ? " (set for this business)" : ""}` : null}</Fact>
            <Fact label="Occupancy class">{occupancy ? `${occupancy.code} · ${occupancy.label}` : d.occupancyClass}</Fact>
            <Fact label="Kind of business">{d.occupancyType}</Fact>
            <Fact label="Business license">{d.businessLicense}</Fact>
            <Fact label="Owner">{d.ownerName}</Fact>
            <Fact label="Owner's phone">{d.ownerPhone ? <a href={`tel:${d.ownerPhone}`} className="text-sky hover:underline">{d.ownerPhone}</a> : null}</Fact>
            <Fact label="Owner's email">{d.ownerEmail ? <a href={`mailto:${d.ownerEmail}`} className="text-sky hover:underline">{d.ownerEmail}</a> : null}</Fact>
            <Fact label="Notices mailed to" wide>{d.ownerMailingAddress ?? (d.hasProgram ? "The business itself" : null)}</Fact>
            {d.notes && <Fact label="Notes for inspectors" wide>{d.notes}</Fact>}
          </Facts>
        </Box>
      </Group>

      {openViolations.length > 0 && (
        <Group title={`Open violations (${openViolations.length})`}>
          <Box>
            {openViolations.map(v => (
              <Link key={v.id} href={v.inspectionId ? `/inspections/${v.inspectionId}` : v.caseId ? `/complaints/${v.caseId}` : "/violations"} className="block hover:bg-hover">
                <ViolationLine v={v} />
              </Link>
            ))}
          </Box>
        </Group>
      )}

      <Group title={`Inspections (${d.inspections.length})`}>
        {d.inspections.length === 0 ? <Note>None yet.</Note> : (
          <Box>{d.inspections.map(i => <InspectionListRow key={i.id} row={i} today={d.today} showPlace={false} />)}</Box>
        )}
      </Group>

      <Group title="From the preplan" actions={<PreplanLink />} hint="Crews keep the preplan in the Command Portal; what they record shows here.">
        <Box>
          <Facts>
            <Fact label="Phone">{pp.phone}</Fact>
            <Fact label="Construction">{CONSTRUCTION[pp.constructionType] || null}</Fact>
            <Fact label="Size">{[pp.floorsAbove ? `${pp.floorsAbove} floor${pp.floorsAbove === 1 ? "" : "s"}` : null, pp.floorsBelow ? `${pp.floorsBelow} below ground` : null, pp.squareFeet ? `${pp.squareFeet.toLocaleString()} sq ft` : null].filter(Boolean).join(", ")}</Fact>
            <Fact label="Occupant load">{[pp.occupantLoadDay != null ? `${pp.occupantLoadDay} by day` : null, pp.occupantLoadNight != null ? `${pp.occupantLoadNight} at night` : null].filter(Boolean).join(", ")}</Fact>
            <Fact label="Hours">{pp.hoursOccupied}</Fact>
            <Fact label="Sprinklers">{pp.hasSprinklers ? [pp.sprinklerCoverage === "full" ? "Fully sprinklered" : pp.sprinklerCoverage === "partial" ? "Partly sprinklered" : "Yes", pp.sprinklerSystem, pp.sprinklerRoom ? `riser: ${pp.sprinklerRoom}` : null].filter(Boolean).join(", ") : "None recorded"}</Fact>
            <Fact label="Fire alarm">{pp.hasFireAlarm ? ["Yes", pp.fireAlarmPanel ? `panel: ${pp.fireAlarmPanel}` : null].filter(Boolean).join(", ") : "None recorded"}</Fact>
            <Fact label="Standpipe">{pp.hasStandpipe ? ["Yes", pp.standpipeClass].filter(Boolean).join(", ") : "None recorded"}</Fact>
            <Fact label="Fire department connection">{pp.fdcLocation}</Fact>
            <Fact label="Key box (Knox)">{pp.knoxBoxLocation}</Fact>
            <Fact label="Fire pump">{pp.firePump?.location ?? null}</Fact>
            <Fact label="Shutoffs">{[pp.waterShutoff ? `Water: ${pp.waterShutoff}` : null, pp.gasShutoff ? `Gas: ${pp.gasShutoff}` : null, pp.electricShutoff ? `Electric: ${pp.electricShutoff}` : null].filter(Boolean).join("\n")}</Fact>
            {(pp.specialHazards.length > 0 || pp.hazards) && (
              <Fact label="Hazards" wide>{[pp.specialHazards.map(h => h.replace(/_/g, " ")).join(", "), pp.hazards, pp.hazmatNotes].filter(Boolean).join("\n")}</Fact>
            )}
            {(pp.accessNotes || pp.accessProblems) && <Fact label="Access" wide>{[pp.accessNotes, pp.accessProblems].filter(Boolean).join("\n")}</Fact>}
          </Facts>
          {pp.emergencyContacts.length > 0 && (
            <div className="border-t border-divider px-4 py-4">
              <div className="mb-2 text-[14px] text-ink-3">Emergency contacts</div>
              <ul className="space-y-1.5">
                {pp.emergencyContacts.map((c, i) => (
                  <li key={i} className="text-[17px]">
                    {c.name}{c.role ? `, ${c.role}` : ""}
                    {c.phone && <> · <a href={`tel:${c.phone}`} className="text-sky hover:underline">{c.phone}</a></>}
                    {c.keyHolder && <Badge tone="info" className="ml-2">Key holder</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Box>
      </Group>

      {(d.master || d.tenants.length > 0) && (
        <Group title={d.master ? "Part of" : `Tenants (${d.tenants.length})`}>
          <Box>
            {d.master && <ListRow href={`/businesses/${d.master.id}`} title={d.master.name} detail={d.master.address} />}
            {d.tenants.map(t => <ListRow key={t.id} href={`/businesses/${t.id}`} title={t.name} detail={t.address} />)}
          </Box>
        </Group>
      )}

      {d.permits.length > 0 && (
        <Group title={`Permits (${d.permits.length})`}>
          <Box>
            {d.permits.map(p => (
              <ListRow key={p.id} href={`/permits/${p.id}`} title={typeLabel(settings.data?.permitTypes, p.typeKey)}
                tags={<Badge tone={PERMIT_STATUS[p.status].tone}>{PERMIT_STATUS[p.status].label}</Badge>}
                detail={[p.number, p.expiresOn ? `expires ${formatDay(p.expiresOn)}` : null].filter(Boolean).join(" · ")} />
            ))}
          </Box>
        </Group>
      )}

      {d.cases.length > 0 && (
        <Group title={`Complaints (${d.cases.length})`}>
          <Box>
            {d.cases.map(c => (
              <ListRow key={c.id} href={`/complaints/${c.id}`} title={typeLabel(settings.data?.caseTypes, c.typeKey)}
                tags={<Badge tone={CASE_STATUS[c.status].tone}>{CASE_STATUS[c.status].label}</Badge>}
                detail={[c.number, instantDay(c.receivedAt)].join(" · ")} />
            ))}
          </Box>
        </Group>
      )}

      {pp.visits.length > 0 && (
        <Group title="Visits on the preplan" hint="Walk-throughs, drills and inspections recorded on the preplan, newest first.">
          <Box>
            {[...pp.visits].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15).map((v, i) => (
              <div key={i} className="border-b border-divider px-4 py-3 last:border-b-0">
                <div className="text-[16px]"><b className="font-medium">{v.kind}</b> · {formatDay(v.date)}{v.by ? ` · ${v.by}` : ""}</div>
                {v.notes && <div className="text-[15px] text-ink-3">{v.notes}</div>}
              </div>
            ))}
          </Box>
        </Group>
      )}

      <ScheduleDialog open={scheduling} onClose={() => setScheduling(false)} preset={{ place, discipline: "fire", context: d.name }} />
      <ProgramDialog open={editing} onClose={() => setEditing(false)} d={d} onSaved={() => { void qc.invalidateQueries({ queryKey: [BASE] }); }} />
    </div>
  );
}
