import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle, BadgeCheck, Ban, BellRing, CalendarCog, CheckCircle2, ClipboardCheck, ClipboardPlus, Copy, Cylinder, Droplets,
  ExternalLink, Footprints, Gauge, Gavel, Globe, ImageOff, KeyRound, Mail, Map as MapIcon, Megaphone, Navigation, Pencil, Phone, Plug,
  Printer, RefreshCw, Repeat, Stamp,
} from "lucide-react";
import { api, errorMessage, get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { dayOf, formatDay, plural, relativeDay } from "@/lib/format";
import {
  BASE, CASE_RESOLUTION, CASE_SOURCE, CASE_STATUS, DUE, OCCUPANCY_CLASSES, PERMIT_STATUS, RESULT, RISK, SEVERITY, keys, typeLabel,
  useSettings,
} from "@/lib/inspections";
import { directionsUrl, distanceText, feetBetween } from "@/lib/maps";
import type { Hydrant, InspectionRow, MapData, PropertyDetail, Settings, Violation } from "@/lib/types";
import { Badge, Button, ButtonLink, Spinner, TONE_EDGE, TONE_TEXT, cx, type IconType, type Tone } from "@/components/ui";
import { ActionMenu, Box, Fact, Facts, Group, ListRow, Note, PAGE, PageHead, QueryState } from "@/components/kit";
import { InspectionListRow, PREPLANS_URL, PreplanLink, ScheduleDialog, ViolationLine } from "@/components/records";
import { toast } from "@/components/toast";
import { ProgramDialog } from "./ProgramDialog";
import { BusinessLogo, LOGO_LOOKUP, WebsiteDialog, siteLabel, useFindLogo } from "./BusinessLogo";

const MiniMap = lazy(() => import("./MiniMap"));

const CONSTRUCTION: Record<string, string> = {
  type_i: "Type I (fire resistive)", type_ii: "Type II (non-combustible)", type_iii: "Type III (ordinary)",
  type_iv: "Type IV (heavy timber)", type_v: "Type V (wood frame)", unknown: "",
};

/** Past inspections shown before "Show all". */
const PAST_SHOWN = 5;
/** History lines shown before "Show all". */
const HISTORY_SHOWN = 12;

/**
 * One business, everything the office knows about it on one page: the
 * numbers that matter across the top, the inspection program, open violations
 * and the record of inspections down the middle, and down the side where it
 * is, who to call, its fire protection and the building from the preplan.
 * Everything that can be started from here is in the one Actions menu.
 */
export function BusinessPage({ id }: { id: number }) {
  const perms = usePermissions();
  const settings = useSettings();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: keys.property(id), queryFn: ({ signal }) => get<PropertyDetail>(`${BASE}/properties/${id}`, signal) });
  const d = q.data;
  const located = d?.latitude != null && d.longitude != null;
  // The hydrants come with the map's data, which is usually already loaded.
  const map = useQuery({ queryKey: keys.map, queryFn: ({ signal }) => get<MapData>(`${BASE}/map`, signal), enabled: located, staleTime: 5 * 60_000 });
  const nearby = useMemo(() => nearestHydrants(d, map.data?.hydrants), [d, map.data]);
  // Nearest first: the mini map frames itself on the first three.
  const onMap = useMemo(() => nearby.filter((n, i) => i < 3 || n.feet <= 2000).slice(0, 12).map(n => n.h), [nearby]);
  const [dialog, setDialog] = useState<null | "schedule" | "program" | "website">(null);
  const [showClosed, setShowClosed] = useState(false);
  const [allPast, setAllPast] = useState(false);
  const [allHistory, setAllHistory] = useState(false);
  const findLogo = useFindLogo();
  // Also true when the lookup started from "Add a business", before this page opened.
  const lookingForLogo = useIsMutating({ mutationKey: LOGO_LOOKUP, predicate: m => m.state.variables === id }) > 0;

  if (!d) return <div className={PAGE}><QueryState query={q}>{null}</QueryState></div>;

  const pp = d.preplan;
  const s = settings.data;
  const place = { preplanId: d.preplanId, placeName: d.name, address: d.address, latitude: d.latitude, longitude: d.longitude };
  const occupancy = OCCUPANCY_CLASSES.find(o => o.code === d.occupancyClass);

  const open = d.violations.filter(v => v.status === "open");
  const overdue = open.filter(v => v.overdue);
  const closedViolations = d.violations.filter(v => v.status !== "open");
  const repeats = repeatCounts(d.violations);

  const upcoming = d.inspections.filter(i => i.status === "scheduled" || i.status === "in_progress")
    .sort((a, b) => (a.scheduledOn ?? "9999").localeCompare(b.scheduledOn ?? "9999"));
  const past = d.inspections.filter(i => i.status === "completed" || i.status === "cancelled")
    .sort((a, b) => doneDay(b).localeCompare(doneDay(a)));
  const finished = past.filter(i => i.status === "completed" && i.result);
  const lastDone = finished[0];

  const livePermits = d.permits.filter(p => p.status === "issued");
  const waitingPermits = d.permits.filter(p => ["applied", "in_review", "corrections", "approved"].includes(p.status));
  const nextExpiry = livePermits.map(p => p.expiresOn).filter((x): x is string => !!x).sort()[0];
  const openCases = d.cases.filter(c => c.status !== "closed");
  const history = historyOf(d, s);

  const jump = (target: string) => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const newComplaint = () => navigate(`/complaints?new=1&preplan=${d.preplanId}`);
  const newPermit = () => navigate(`/permits?new=1&preplan=${d.preplanId}`);
  async function copyAddress() {
    try { await navigator.clipboard.writeText(d!.address); toast.success("Address copied"); }
    catch { toast.error("Couldn't copy it here. Press and hold the address to copy it."); }
  }
  async function removeLogo() {
    try {
      await api("DELETE", `${BASE}/properties/${id}/logo`);
      toast.success("Logo removed");
      void qc.invalidateQueries({ queryKey: [BASE] });
    } catch (err) { toast.error(errorMessage(err)); }
  }

  const heads = [
    d.notes ? { label: "Notes for inspectors", body: d.notes } : null,
    pp.specialHazards.length || pp.hazmatNotes ? { label: "Hazards on site", body: [pp.specialHazards.map(h => h.replace(/_/g, " ")).join(", "), pp.hazmatNotes].filter(Boolean).join("\n") } : null,
    pp.accessProblems ? { label: "Access problems", body: pp.accessProblems } : null,
  ].filter((x): x is { label: string; body: string } => !!x);

  return (
    <div className={PAGE}>
      <PageHead
        back={{ href: "/businesses", label: "Businesses" }}
        lead={<BusinessLogo name={d.name} logoUrl={d.logoUrl} size="lg" looking={lookingForLogo} />}
        title={d.name}
        sub={[d.address, d.occupancyType, d.preplanNumber].filter(Boolean).join(" · ")}
        badges={<>
          {d.onProgram && <Badge tone={DUE[d.dueState].tone}>{DUE[d.dueState].label}</Badge>}
          {d.riskClass && <Badge tone={RISK[d.riskClass].tone}>{RISK[d.riskClass].label}</Badge>}
          {open.length > 0 && <Badge tone={overdue.length ? "danger" : "warn"}>{plural(open.length, "open violation")}</Badge>}
        </>}
      >
        <ActionMenu sections={[
          { title: "Start something here", items: [
            perms.inspect && { label: "Schedule an inspection", icon: ClipboardPlus, tone: "brand", hint: "Fire, building or code. Pick the day and the inspector.", onClick: () => setDialog("schedule") },
            perms.cases && { label: "Take a complaint", icon: Megaphone, tone: "warn", hint: "Code enforcement, with this business filled in.", onClick: newComplaint },
            perms.permits && { label: "Start a permit", icon: Stamp, tone: "info", hint: "Operational, construction or event.", onClick: newPermit },
          ] },
          { title: "This business", items: [
            perms.inspect && {
              label: d.hasProgram ? "Change the inspection program" : "Put it on the inspection program", icon: CalendarCog,
              hint: "Risk, how often it's inspected, the owner and where notices go.", onClick: () => setDialog("program"),
            },
            perms.inspect && {
              label: d.website || d.email ? "Change the website or email" : "Add the website or email", icon: Globe,
              hint: "The logo is found on the website, so nobody has to upload one.", onClick: () => setDialog("website"),
            },
            perms.inspect && !!d.logoSite && !lookingForLogo && {
              label: d.logoUrl ? "Look for a newer logo" : "Look for the logo", icon: RefreshCw,
              hint: `Reads ${d.logoSite} again for it.`, onClick: () => findLogo.mutate(id),
            },
            perms.inspect && !!d.logoUrl && { label: "Remove the logo", icon: ImageOff, hint: "Shows the business's initials instead.", onClick: () => void removeLogo() },
            { label: "Print the business record", icon: Printer, hint: "The program, open violations and every inspection, on paper.", onClick: () => navigate(`/businesses/${id}/print`) },
            located && { label: "Show on the map", icon: MapIcon, hint: "With the hydrants and the businesses round it.", onClick: () => navigate(`/map?focus=${id}`) },
            { label: "Get directions", icon: Navigation, hint: "Opens Google Maps.", href: directionsUrl(d) },
            { label: "Copy the address", icon: Copy, onClick: () => void copyAddress() },
            { label: "Edit the preplan", icon: ExternalLink, hint: "In the Command Portal, where crews keep the building's details.", href: PREPLANS_URL, portal: "command-portal" },
          ] },
        ]} />
      </PageHead>

      {/* The numbers that matter. Each one jumps to its part of the page. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Tile
          label="Next inspection due" target="program" onJump={jump} tone={DUE[d.dueState].tone}
          value={d.onProgram ? (d.nextDueOn ? formatDay(d.nextDueOn, { weekday: false }) : "Not set") : "Not on the program"}
          detail={d.onProgram && d.nextDueOn ? `${DUE[d.dueState].label}, ${relativeDay(d.nextDueOn, d.today)}` : d.hasProgram ? "Taken off the program" : "Never comes due"}
        />
        <Tile
          label="Last inspection" target="inspections" onJump={jump} tone={lastDone?.result ? RESULT[lastDone.result].tone : "muted"}
          value={d.lastInspectedOn ? formatDay(d.lastInspectedOn, { weekday: false }) : "Never"}
          detail={lastDone?.result ? `${RESULT[lastDone.result].label}${lastDone.assignedName ? `, ${lastDone.assignedName}` : ""}` : upcoming[0] ? "One is booked" : "Nothing on record"}
        />
        <Tile
          label="Open violations" target="violations" onJump={jump} tone={overdue.length ? "danger" : open.length ? "warn" : "ok"}
          value={String(open.length)}
          detail={overdue.length ? `${overdue.length} past due` : open.length ? "None past due" : "Nothing open"}
        />
        <Tile
          label="Live permits" target="permits" onJump={jump} tone={livePermits.length ? "ok" : "muted"}
          value={String(livePermits.length)}
          detail={waitingPermits.length ? `${waitingPermits.length} waiting on review` : nextExpiry ? `Next expires ${formatDay(nextExpiry, { weekday: false })}` : `${d.permits.length} on record`}
        />
        <Tile
          label="Open complaints" target="complaints" onJump={jump} tone={openCases.length ? "warn" : "muted"}
          value={String(openCases.length)}
          detail={`${d.cases.length} on record`}
        />
      </div>

      {heads.length > 0 && (
        <div className={cx("border border-l-4 border-faded bg-odd", TONE_EDGE.warn)}>
          <div className="flex items-center gap-2 px-4 pt-3 text-[14px] font-medium uppercase tracking-[0.06em] text-orange">
            <AlertTriangle className="h-5 w-5" />Before you go in
          </div>
          <dl className="grid gap-x-8 gap-y-3 px-4 pb-4 pt-2 sm:grid-cols-2 xl:grid-cols-3">
            {heads.map(h => (
              <div key={h.label} className="min-w-0">
                <dt className="text-[14px] text-ink-3">{h.label}</dt>
                <dd className="mt-0.5 whitespace-pre-line break-words text-[17px] leading-6 first-letter:uppercase">{h.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Two columns from a wide screen: the record in the middle, the place down the side. On a
          tablet the side comes after the inspections, before permits and complaints. */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_400px] xl:grid-rows-[auto_1fr]">
        <div className="min-w-0 space-y-8 xl:col-start-1 xl:row-start-1">
          <Group
            id="program" title="Inspection program"
            actions={perms.inspect ? <Button size="sm" variant={d.hasProgram ? "ghost" : "primary"} onClick={() => setDialog("program")}><Pencil className="h-4 w-4" />{d.hasProgram ? "Change" : "Put on the program"}</Button> : undefined}
          >
            <Box>
              {!d.onProgram && (
                <p className="border-b border-divider px-4 py-3 text-[16px] text-ink-2">
                  {d.hasProgram ? "Taken off the inspection program. It no longer comes due." : "Not on the inspection program yet, so it never comes due."}
                </p>
              )}
              <Facts cols={2}>
                <Fact label="Next inspection due">{d.onProgram && d.nextDueOn ? `${formatDay(d.nextDueOn)} (${relativeDay(d.nextDueOn, d.today)})` : null}</Fact>
                <Fact label="Last inspected">{d.lastInspectedOn ? formatDay(d.lastInspectedOn) : "Never"}</Fact>
                <Fact label="Inspected every">{d.onProgram ? `${d.effectiveFrequencyMonths} months${d.frequencyMonths ? " (set for this business)" : ""}` : null}</Fact>
                <Fact label="Risk">{d.riskClass ? RISK[d.riskClass].label : null}</Fact>
                <Fact label="Occupancy class">{occupancy ? `${occupancy.code} · ${occupancy.label}` : d.occupancyClass}</Fact>
                <Fact label="Kind of business">{d.occupancyType}</Fact>
                <Fact label="Business license">{d.businessLicense}</Fact>
                <Fact label="Preplan number">{d.preplanNumber}</Fact>
                <Fact label="First-due station">{d.firstDueStation}</Fact>
                <Fact label="Building status">{d.buildingStatus ? d.buildingStatus.replace(/_/g, " ").replace(/^./, c => c.toUpperCase()) : null}</Fact>
              </Facts>
            </Box>
          </Group>

          <Group id="violations" title={`Open violations (${open.length})`}>
            {open.length === 0 ? <Note>Nothing open.</Note> : (
              <Box>{open.map(v => <ViolationLink key={v.id} v={v} times={repeats.get(repeatKey(v)) ?? 1} />)}</Box>
            )}
            {closedViolations.length > 0 && (
              <>
                <Button variant="ghost" size="sm" className="mt-2 text-sky" aria-expanded={showClosed} onClick={() => setShowClosed(x => !x)}>
                  {showClosed ? "Hide" : "Show"} corrected and closed ({closedViolations.length})
                </Button>
                {showClosed && <Box className="mt-2">{closedViolations.map(v => <ViolationLink key={v.id} v={v} times={repeats.get(repeatKey(v)) ?? 1} />)}</Box>}
              </>
            )}
          </Group>

          <Group
            id="inspections" title={`Inspections (${d.inspections.length})`}
            actions={perms.inspect ? <Button size="sm" onClick={() => setDialog("schedule")}><ClipboardPlus className="h-4 w-4" />Schedule one</Button> : undefined}
          >
            {d.inspections.length === 0 ? <Note>None yet.</Note> : (
              <Box>
                {finished.length > 0 && <TrackRecord finished={finished} />}
                {upcoming.length > 0 && <>
                  <SubHead>Coming up</SubHead>
                  {upcoming.map(i => <InspectionListRow key={i.id} row={i} today={d.today} showPlace={false} />)}
                </>}
                {past.length > 0 && <>
                  <SubHead>Done</SubHead>
                  {(allPast ? past : past.slice(0, PAST_SHOWN)).map(i => <InspectionListRow key={i.id} row={i} today={d.today} showPlace={false} />)}
                </>}
              </Box>
            )}
            {past.length > PAST_SHOWN && (
              <Button variant="ghost" size="sm" className="mt-2 text-sky" aria-expanded={allPast} onClick={() => setAllPast(x => !x)}>
                {allPast ? "Show fewer" : `Show all ${past.length} done`}
              </Button>
            )}
          </Group>
        </div>

        <aside className="min-w-0 space-y-8 xl:col-start-2 xl:row-span-2 xl:row-start-1" aria-label="The place">
          <Group
            id="location" title="Location"
            actions={located ? <Link href={`/map?focus=${id}`} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] text-sky hover:underline"><MapIcon className="h-4 w-4" />Open the big map</Link> : undefined}
          >
            <Box>
              {located ? (
                <Suspense fallback={<div className="flex h-64 items-center justify-center"><Spinner /></div>}>
                  <MiniMap latitude={d.latitude!} longitude={d.longitude!} due={d.dueState} hydrants={onMap} />
                </Suspense>
              ) : <p className="px-4 py-4 text-[15px] text-ink-3">Not on the map yet. Crews can place it on the preplan in the Command Portal.</p>}
              <div className="border-t border-divider px-4 py-3">
                <div className="text-[14px] text-ink-3">Address</div>
                <div className="select-all text-[17px] leading-6">{d.address}</div>
              </div>
              {located && (
                <div className="border-t border-divider px-4 py-3">
                  <div className="text-[14px] text-ink-3">Nearest hydrants</div>
                  {map.isLoading ? <p className="py-1 text-[15px] text-ink-3">Looking…</p>
                    : nearby.length === 0 ? <p className="py-1 text-[15px] text-ink-4">No hydrants recorded.</p> : (
                      <ul className="mt-1 space-y-1.5">
                        {nearby.slice(0, 3).map(({ h, feet }) => (
                          <li key={h.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[16px] leading-6">
                            <span className="font-medium">{h.identifier}</span>
                            <span className="text-ink-2">{[distanceText(feet), h.flowGpm ? `${h.flowGpm.toLocaleString()} GPM` : null, `class ${h.hydrantClass}`].filter(Boolean).join(" · ")}</span>
                            {!h.inService && <Badge tone="danger">Out of service</Badge>}
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              )}
              <div className="border-t border-divider px-4 py-3">
                <ButtonLink href={directionsUrl(d)} target="_blank" rel="noopener" size="lg" className="w-full"><Navigation className="h-5 w-5" />Get directions</ButtonLink>
              </div>
            </Box>
          </Group>

          <Group id="contacts" title="Who to call">
            <Box>
              <Contact name="The business" role={null} phone={pp.phone} email={d.email} website={d.website} />
              <Contact name={d.ownerName ?? "Owner not recorded"} role="Owner" phone={d.ownerPhone} email={d.ownerEmail}
                more={d.ownerMailingAddress ? `Notices go to ${d.ownerMailingAddress}` : d.hasProgram ? "Notices go to the business itself" : null} />
              {pp.emergencyContacts.map((c, i) => (
                <Contact key={i} name={c.name} role={c.role} phone={c.phone} altPhone={c.altPhone} email={c.email}
                  tag={c.keyHolder ? <Badge tone="info"><KeyRound className="h-4 w-4" />Key holder</Badge> : undefined} />
              ))}
            </Box>
          </Group>

          <Group id="protection" title="Fire protection">
            <Box>
              <System icon={Droplets} label="Sprinklers" on={pp.hasSprinklers}
                detail={[pp.sprinklerCoverage === "full" ? "Fully sprinklered" : pp.sprinklerCoverage === "partial" ? "Partly sprinklered" : null, pp.sprinklerSystem, pp.sprinklerRoom ? `Riser: ${pp.sprinklerRoom}` : null].filter(Boolean).join(" · ")} />
              <System icon={BellRing} label="Fire alarm" on={pp.hasFireAlarm} detail={pp.fireAlarmPanel ? `Panel: ${pp.fireAlarmPanel}` : null} />
              <System icon={Cylinder} label="Standpipe" on={pp.hasStandpipe} detail={pp.standpipeClass} />
              <System icon={Gauge} label="Fire pump" on={!!pp.firePump} detail={pp.firePump?.location} />
              <System icon={Plug} label="Fire department connection" on={!!pp.fdcLocation} detail={pp.fdcLocation} />
              <System icon={KeyRound} label="Key box (Knox)" on={!!pp.knoxBoxLocation} detail={pp.knoxBoxLocation} />
            </Box>
          </Group>

          <Group title="The building" actions={<PreplanLink label="Edit the preplan" />} hint="From the preplan, which crews keep in the Command Portal.">
            <Box>
              <Facts cols={2} className="xl:grid-cols-1">
                <Fact label="Construction">{CONSTRUCTION[pp.constructionType] || null}</Fact>
                <Fact label="Size">{[pp.floorsAbove ? plural(pp.floorsAbove, "floor") : null, pp.floorsBelow ? `${pp.floorsBelow} below ground` : null, pp.squareFeet ? `${pp.squareFeet.toLocaleString()} sq ft` : null].filter(Boolean).join(", ")}</Fact>
                <Fact label="Occupant load">{[pp.occupantLoadDay != null ? `${pp.occupantLoadDay} by day` : null, pp.occupantLoadNight != null ? `${pp.occupantLoadNight} at night` : null].filter(Boolean).join(", ")}</Fact>
                <Fact label="Hours">{pp.hoursOccupied}</Fact>
                <Fact label="Shutoffs" wide>{[pp.waterShutoff ? `Water: ${pp.waterShutoff}` : null, pp.gasShutoff ? `Gas: ${pp.gasShutoff}` : null, pp.electricShutoff ? `Electric: ${pp.electricShutoff}` : null].filter(Boolean).join("\n")}</Fact>
                {pp.hazards && <Fact label="Other hazards" wide>{pp.hazards}</Fact>}
                {pp.accessNotes && <Fact label="Getting in" wide>{pp.accessNotes}</Fact>}
                <Fact label="Preplan last updated">{pp.updatedAt ? formatDay(dayOf(pp.updatedAt)) : null}</Fact>
              </Facts>
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
        </aside>

        <div className="min-w-0 space-y-8 xl:col-start-1 xl:row-start-2">
          <Group
            id="permits" title={`Permits (${d.permits.length})`}
            actions={perms.permits ? <Button size="sm" onClick={newPermit}><Stamp className="h-4 w-4" />Start one</Button> : undefined}
          >
            {d.permits.length === 0 ? <Note>None on record.</Note> : (
              <Box>
                {d.permits.map(p => (
                  <ListRow key={p.id} href={`/permits/${p.id}`} title={typeLabel(s?.permitTypes, p.typeKey)}
                    tags={<Badge tone={PERMIT_STATUS[p.status].tone}>{PERMIT_STATUS[p.status].label}</Badge>}
                    detail={[p.number, p.issuedOn ? `issued ${formatDay(p.issuedOn)}` : p.appliedOn ? `applied ${formatDay(p.appliedOn)}` : null, p.expiresOn ? `expires ${formatDay(p.expiresOn)}` : null].filter(Boolean).join(" · ")} />
                ))}
              </Box>
            )}
          </Group>

          <Group
            id="complaints" title={`Complaints (${d.cases.length})`}
            actions={perms.cases ? <Button size="sm" onClick={newComplaint}><Megaphone className="h-4 w-4" />Take one</Button> : undefined}
          >
            {d.cases.length === 0 ? <Note>None on record.</Note> : (
              <Box>
                {d.cases.map(c => (
                  <ListRow key={c.id} href={`/complaints/${c.id}`} title={typeLabel(s?.caseTypes, c.typeKey)}
                    tags={<Badge tone={CASE_STATUS[c.status].tone}>{CASE_STATUS[c.status].label}</Badge>}
                    detail={[c.number, formatDay(dayOf(c.receivedAt)), c.assignedName].filter(Boolean).join(" · ")} />
                ))}
              </Box>
            )}
          </Group>

          <Group id="history" title="History" hint="Inspections, violations, permits, complaints and the visits crews record on the preplan, newest first.">
            {history.length === 0 ? <Note>Nothing yet.</Note> : (
              <Box>
                {(allHistory ? history : history.slice(0, HISTORY_SHOWN)).map((m, i, list) => (
                  <MomentLine key={i} m={m} year={i === 0 || list[i - 1].day.slice(0, 4) !== m.day.slice(0, 4) ? m.day.slice(0, 4) : null} />
                ))}
              </Box>
            )}
            {history.length > HISTORY_SHOWN && (
              <Button variant="ghost" size="sm" className="mt-2 text-sky" aria-expanded={allHistory} onClick={() => setAllHistory(x => !x)}>
                {allHistory ? "Show fewer" : `Show all ${history.length}`}
              </Button>
            )}
          </Group>
        </div>
      </div>

      <ScheduleDialog open={dialog === "schedule"} onClose={() => setDialog(null)} preset={{ place, discipline: "fire", context: d.name }} />
      <ProgramDialog open={dialog === "program"} onClose={() => setDialog(null)} d={d} onSaved={() => { void qc.invalidateQueries({ queryKey: [BASE] }); }} />
      <WebsiteDialog open={dialog === "website"} onClose={() => setDialog(null)} d={d} onSaved={look => {
        void qc.invalidateQueries({ queryKey: [BASE] });
        if (look) findLogo.mutate(id);
      }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Tile({ label, value, detail, tone, target, onJump }: {
  label: string; value: string; detail: string; tone: Tone; target: string; onJump: (target: string) => void;
}) {
  return (
    <button
      type="button" onClick={() => onJump(target)}
      className={cx("flex min-h-[112px] min-w-0 flex-col items-start border border-l-4 border-faded bg-odd px-4 py-3 text-left transition-colors hover:bg-hover", TONE_EDGE[tone])}
    >
      <span className="text-[14px] text-ink-3">{label}</span>
      <span className="mt-0.5 text-[22px] font-medium leading-7 text-ink">{value}</span>
      <span className={cx("mt-auto pt-1 text-[15px] leading-5", tone === "muted" ? "text-ink-3" : TONE_TEXT[tone])}>{detail}</span>
    </button>
  );
}

function SubHead({ children }: { children: ReactNode }) {
  return <div className="border-b border-divider bg-surface px-4 py-2 text-[13px] font-medium uppercase tracking-[0.06em] text-ink-3">{children}</div>;
}

/** How the last few inspections came out, newest first, and the plain sum of it. */
function TrackRecord({ finished }: { finished: InspectionRow[] }) {
  const recent = finished.slice(0, 6);
  const passed = recent.filter(i => i.result === "pass").length;
  const sum = recent.length === 1
    ? `${RESULT[recent[0].result!].label} its only finished inspection.`
    : `Passed ${passed} of the last ${recent.length} finished inspections.`;
  return (
    <div className="border-b border-divider px-4 py-3">
      <div className="text-[16px]">{sum}</div>
      <ol className="mt-2 flex flex-wrap gap-2" aria-label="Results, newest first">
        {recent.map(i => (
          <li key={i.id}>
            <Link href={`/inspections/${i.id}`} className={cx("flex flex-col border border-l-4 border-faded bg-surface px-3 py-1.5 hover:bg-hover", TONE_EDGE[RESULT[i.result!].tone])}>
              <span className={cx("text-[15px] font-medium", TONE_TEXT[RESULT[i.result!].tone])}>{RESULT[i.result!].label}</span>
              <span className="text-[13px] text-ink-3">{formatDay(doneDay(i), { weekday: false })}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ViolationLink({ v, times }: { v: Violation; times: number }) {
  const href = v.inspectionId ? `/inspections/${v.inspectionId}` : v.caseId ? `/complaints/${v.caseId}` : "/violations";
  return (
    <Link href={href} className="block hover:bg-hover">
      <ViolationLine v={v} tags={times > 1 ? <Badge tone="muted"><Repeat className="h-4 w-4" />Written {times} times here</Badge> : undefined} />
    </Link>
  );
}

function Contact({ name, role, phone, altPhone, email, website, more, tag }: {
  name: string; role: string | null; phone?: string | null; altPhone?: string; email?: string | null; website?: string | null;
  more?: string | null; tag?: ReactNode;
}) {
  const link = "inline-flex min-h-11 items-center gap-2 text-[17px] text-sky hover:underline";
  return (
    <div className="border-b border-divider px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[17px] font-medium">{name}</span>
        {role && <span className="text-[15px] text-ink-3">{role}</span>}
        {tag}
      </div>
      {phone || altPhone || email || website ? (
        <div className="flex flex-col items-start">
          {phone && <a href={`tel:${phone}`} className={link}><Phone className="h-5 w-5" />{phone}</a>}
          {altPhone && <a href={`tel:${altPhone}`} className={link}><Phone className="h-5 w-5" />{altPhone}</a>}
          {email && <a href={`mailto:${email}`} className={cx(link, "break-all")}><Mail className="h-5 w-5 shrink-0" />{email}</a>}
          {website && <a href={website} target="_blank" rel="noopener noreferrer" className={cx(link, "break-all")}><Globe className="h-5 w-5 shrink-0" />{siteLabel(website)}</a>}
        </div>
      ) : <div className="py-1 text-[15px] text-ink-4">No phone recorded</div>}
      {more && <div className="text-[15px] leading-6 text-ink-3">{more}</div>}
    </div>
  );
}

function System({ icon: Icon, label, on, detail }: { icon: IconType; label: string; on: boolean; detail?: string | null }) {
  return (
    <div className="flex items-start gap-3 border-b border-divider px-4 py-3 last:border-b-0">
      <Icon className={cx("mt-0.5 h-6 w-6 shrink-0", on ? "text-lightgreen" : "text-ink-4")} />
      <div className="min-w-0 flex-1">
        <div className="text-[17px] leading-6">{label}</div>
        {detail && <div className="text-[15px] leading-6 text-ink-3">{detail}</div>}
      </div>
      <Badge tone={on ? "ok" : "muted"}>{on ? "Yes" : "None recorded"}</Badge>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History: everything that happened here, from every kind of record
// ---------------------------------------------------------------------------

interface Moment { day: string; icon: IconType; tone: Tone; title: string; detail?: string; href?: string }

function MomentLine({ m, year }: { m: Moment; year: string | null }) {
  const Icon = m.icon;
  const body = (
    <>
      <Icon className={cx("mt-0.5 h-5 w-5 shrink-0", TONE_TEXT[m.tone])} />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] leading-6 text-ink">{m.title}</span>
        {m.detail && <span className="block text-[14px] leading-5 text-ink-3">{m.detail}</span>}
      </span>
      <span className="shrink-0 pt-0.5 text-[14px] text-ink-3">{formatDay(m.day, { weekday: false, year: false })}</span>
    </>
  );
  const row = "flex items-start gap-3 border-b border-divider px-4 py-3";
  return (
    <>
      {year && <SubHead>{year}</SubHead>}
      {m.href ? <Link href={m.href} className={cx(row, "hover:bg-hover")}>{body}</Link> : <div className={row}>{body}</div>}
    </>
  );
}

function historyOf(d: PropertyDetail, s: Settings | undefined): Moment[] {
  const out: Moment[] = [];
  const inspectedOn = new Set<string>();
  for (const i of d.inspections) {
    const type = typeLabel(s?.inspectionTypes, i.typeKey);
    const href = `/inspections/${i.id}`;
    if (i.status === "completed") {
      const day = doneDay(i);
      inspectedOn.add(day);
      out.push({ day, icon: ClipboardCheck, tone: i.result ? RESULT[i.result].tone : "muted", title: `${type}: ${i.result ? RESULT[i.result].label : "Finished"}`, detail: [i.number, i.assignedName].filter(Boolean).join(" · "), href });
    } else if (i.status === "cancelled") {
      out.push({ day: doneDay(i), icon: Ban, tone: "muted", title: `${type} cancelled`, detail: i.number, href });
    }
  }
  for (const v of d.violations) {
    if (v.status === "void") continue;
    const href = v.inspectionId ? `/inspections/${v.inspectionId}` : v.caseId ? `/complaints/${v.caseId}` : undefined;
    out.push({ day: dayOf(v.createdAt), icon: AlertTriangle, tone: SEVERITY[v.severity].tone, title: `Violation written: ${v.title}`, detail: [SEVERITY[v.severity].label, v.codeRef, v.inspectionNumber].filter(Boolean).join(" · "), href });
    if (v.resolvedOn && v.status === "corrected") out.push({ day: v.resolvedOn, icon: CheckCircle2, tone: "ok", title: `Corrected: ${v.title}`, detail: v.resolutionNote ?? undefined, href });
    if (v.resolvedOn && v.status === "cited") out.push({ day: v.resolvedOn, icon: Gavel, tone: "danger", title: `Cited: ${v.title}`, detail: v.resolutionNote ?? undefined, href });
  }
  for (const p of d.permits) {
    const type = typeLabel(s?.permitTypes, p.typeKey);
    const href = `/permits/${p.id}`;
    if (p.appliedOn) out.push({ day: p.appliedOn, icon: Stamp, tone: "brand", title: `Permit applied for: ${type}`, detail: [p.number, p.applicantName].filter(Boolean).join(" · "), href });
    if (p.issuedOn) out.push({ day: p.issuedOn, icon: BadgeCheck, tone: "ok", title: `Permit issued: ${type}`, detail: [p.number, p.expiresOn ? `expires ${formatDay(p.expiresOn)}` : null].filter(Boolean).join(" · "), href });
  }
  for (const c of d.cases) {
    const type = typeLabel(s?.caseTypes, c.typeKey);
    const href = `/complaints/${c.id}`;
    out.push({ day: dayOf(c.receivedAt), icon: Megaphone, tone: "warn", title: `Complaint: ${type}`, detail: [c.number, CASE_SOURCE[c.source]].join(" · "), href });
    if (c.closedAt) out.push({ day: dayOf(c.closedAt), icon: CheckCircle2, tone: "muted", title: `Complaint closed: ${type}`, detail: [c.number, c.resolution ? CASE_RESOLUTION[c.resolution] : null].filter(Boolean).join(" · "), href });
  }
  for (const v of d.preplan.visits) {
    // Finishing an inspection writes a visit on the preplan too; that one is already here.
    if (/inspection/i.test(v.kind) && inspectedOn.has(v.date)) continue;
    out.push({ day: v.date, icon: Footprints, tone: "info", title: `${v.kind}, on the preplan`, detail: [v.by, v.notes].filter(Boolean).join(" · ") });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The day an inspection was done, or was to be done. */
function doneDay(i: InspectionRow): string {
  return i.completedAt ? dayOf(i.completedAt) : i.scheduledOn ?? dayOf(i.createdAt);
}

/** The same code (or, without one, the same wording) written up more than once here is a pattern worth seeing. */
const repeatKey = (v: Violation) => (v.codeRef || v.title).trim().toLowerCase();

function repeatCounts(list: Violation[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of list) if (v.status !== "void") counts.set(repeatKey(v), (counts.get(repeatKey(v)) ?? 0) + 1);
  return counts;
}

function nearestHydrants(d: PropertyDetail | undefined, hydrants: Hydrant[] | undefined): { h: Hydrant; feet: number }[] {
  if (!d || d.latitude == null || d.longitude == null || !hydrants) return [];
  const here = { latitude: d.latitude, longitude: d.longitude };
  return hydrants.map(h => ({ h, feet: feetBetween(here, h) })).sort((a, b) => a.feet - b.feet);
}
