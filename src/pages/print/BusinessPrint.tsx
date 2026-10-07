import { useQuery } from "@tanstack/react-query";
import { get, storageUrl } from "@/lib/api";
import { dayOf, formatDay } from "@/lib/format";
import { BASE, CASE_STATUS, OCCUPANCY_CLASSES, PERMIT_STATUS, RESULT, RISK, SEVERITY, VIOLATION_STATUS, keys, typeLabel, useSettings } from "@/lib/inspections";
import type { PropertyDetail } from "@/lib/types";
import { PAGE, QueryState } from "@/components/kit";
import { siteLabel } from "@/pages/businesses/BusinessLogo";
import { InfoTable, Paper } from "./Paper";

/**
 * A business's record on paper: the program, what's open, and every
 * inspection, permit and complaint. For a meeting with the owner, the file
 * drawer, or a hearing.
 */
export function BusinessPrint({ id }: { id: number }) {
  const settings = useSettings();
  const q = useQuery({ queryKey: keys.property(id), queryFn: ({ signal }) => get<PropertyDetail>(`${BASE}/properties/${id}`, signal) });
  const d = q.data;
  const s = settings.data;
  if (!d || !s) return <div className={PAGE}><QueryState query={q.data ? settings : q}>{null}</QueryState></div>;

  const pp = d.preplan;
  const logo = storageUrl(d.logoUrl);
  const occupancy = OCCUPANCY_CLASSES.find(o => o.code === d.occupancyClass);
  const open = d.violations.filter(v => v.status === "open");
  const done = d.inspections.filter(i => i.status === "completed" || i.status === "cancelled");
  const booked = d.inspections.filter(i => i.status === "scheduled" || i.status === "in_progress");
  const yesNo = (on: boolean, detail?: string | null) => (on ? ["Yes", detail].filter(Boolean).join(": ") : "None recorded");

  return (
    <Paper settings={s} back={{ href: `/businesses/${id}`, label: "Back to the business" }} title={`Business record: ${d.name}`}>
      <div className="mb-5 flex items-center gap-4">
        {logo && <img src={logo} alt="" className="h-14 w-14 shrink-0 object-contain" onError={e => { e.currentTarget.style.display = "none"; }} />}
        <div className="min-w-0">
          <h1 className="mb-1 text-[22px] font-bold">Business Inspection Record</h1>
          <p className="text-[13px]">{d.name} · {d.address}</p>
        </div>
      </div>

      <InfoTable rows={[
        ["Business", d.name],
        ["Address", d.address],
        ["Business phone", pp.phone],
        ["Email and website", [d.email, d.website ? siteLabel(d.website) : null].filter(Boolean).join(" · ")],
        ["Kind of business", d.occupancyType],
        ["Occupancy class", occupancy ? `${occupancy.code} · ${occupancy.label}` : d.occupancyClass],
        ["Risk", d.riskClass ? RISK[d.riskClass].label : null],
        ["Inspected every", d.onProgram ? `${d.effectiveFrequencyMonths} months` : "Not on the inspection program"],
        ["Last inspected", d.lastInspectedOn ? formatDay(d.lastInspectedOn) : "Never"],
        ["Next inspection due", d.onProgram && d.nextDueOn ? formatDay(d.nextDueOn) : null],
        ["Owner", [d.ownerName, d.ownerPhone].filter(Boolean).join(" · ")],
        ["Notices mailed to", d.ownerMailingAddress ?? (d.hasProgram ? "The business" : null)],
        ["Business license", d.businessLicense],
        ["Preplan", d.preplanNumber],
      ]} />

      <h2 className="mb-2 mt-4 text-[16px] font-bold">Open violations ({open.length})</h2>
      {open.length === 0 ? <p className="mb-5 text-[13px]">None open.</p> : (
        <table className="mb-5">
          <thead><tr><th>#</th><th>Violation</th><th>Code</th><th>Written</th><th>Correct by</th></tr></thead>
          <tbody>
            {open.map((v, i) => (
              <tr key={v.id}>
                <td>{i + 1}</td>
                <td>
                  <b>{v.title}</b>{v.location ? ` (${v.location})` : ""} · {SEVERITY[v.severity].label}
                  {v.correctiveAction && <div><i>To correct:</i> {v.correctiveAction}</div>}
                  {v.overdue && <div><b>Past due</b></div>}
                </td>
                <td className="whitespace-nowrap">{v.codeRef}</td>
                <td className="whitespace-nowrap">{formatDay(dayOf(v.createdAt), { weekday: false })}</td>
                <td className="whitespace-nowrap">{v.dueOn ? formatDay(v.dueOn, { weekday: false }) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mb-2 mt-4 text-[16px] font-bold">Inspections ({d.inspections.length})</h2>
      {d.inspections.length === 0 ? <p className="mb-5 text-[13px]">None on record.</p> : (
        <table className="mb-5">
          <thead><tr><th>Date</th><th>Inspection</th><th>Number</th><th>Result</th><th>Inspector</th></tr></thead>
          <tbody>
            {[...booked, ...done].map(i => (
              <tr key={i.id}>
                <td className="whitespace-nowrap">{i.completedAt ? formatDay(dayOf(i.completedAt), { weekday: false }) : i.scheduledOn ? formatDay(i.scheduledOn, { weekday: false }) : "—"}</td>
                <td>{typeLabel(s.inspectionTypes, i.typeKey)}</td>
                <td className="whitespace-nowrap">{i.number}</td>
                <td>{i.status === "completed" ? (i.result ? RESULT[i.result].label : "Finished") : i.status === "cancelled" ? "Cancelled" : "Booked"}</td>
                <td>{i.assignedName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {d.permits.length > 0 && (
        <>
          <h2 className="mb-2 mt-4 text-[16px] font-bold">Permits ({d.permits.length})</h2>
          <table className="mb-5">
            <thead><tr><th>Permit</th><th>Number</th><th>Status</th><th>Issued</th><th>Expires</th></tr></thead>
            <tbody>
              {d.permits.map(p => (
                <tr key={p.id}>
                  <td>{typeLabel(s.permitTypes, p.typeKey)}</td>
                  <td className="whitespace-nowrap">{p.number}</td>
                  <td>{PERMIT_STATUS[p.status].label}</td>
                  <td className="whitespace-nowrap">{p.issuedOn ? formatDay(p.issuedOn, { weekday: false }) : "—"}</td>
                  <td className="whitespace-nowrap">{p.expiresOn ? formatDay(p.expiresOn, { weekday: false }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {d.cases.length > 0 && (
        <>
          <h2 className="mb-2 mt-4 text-[16px] font-bold">Complaints ({d.cases.length})</h2>
          <table className="mb-5">
            <thead><tr><th>Complaint</th><th>Number</th><th>Received</th><th>Status</th></tr></thead>
            <tbody>
              {d.cases.map(c => (
                <tr key={c.id}>
                  <td>{typeLabel(s.caseTypes, c.typeKey)}</td>
                  <td className="whitespace-nowrap">{c.number}</td>
                  <td className="whitespace-nowrap">{formatDay(dayOf(c.receivedAt), { weekday: false })}</td>
                  <td>{CASE_STATUS[c.status].label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {d.violations.length > open.length && (
        <>
          <h2 className="mb-2 mt-4 text-[16px] font-bold">Earlier violations ({d.violations.length - open.length})</h2>
          <table className="mb-5">
            <thead><tr><th>Violation</th><th>Code</th><th>Written</th><th>Outcome</th></tr></thead>
            <tbody>
              {d.violations.filter(v => v.status !== "open").map(v => (
                <tr key={v.id}>
                  <td>{v.title}</td>
                  <td className="whitespace-nowrap">{v.codeRef}</td>
                  <td className="whitespace-nowrap">{formatDay(dayOf(v.createdAt), { weekday: false })}</td>
                  <td>{VIOLATION_STATUS[v.status].label}{v.resolvedOn ? ` ${formatDay(v.resolvedOn, { weekday: false })}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 className="mb-2 mt-4 text-[16px] font-bold">Fire protection (from the preplan)</h2>
      <InfoTable rows={[
        ["Sprinklers", yesNo(pp.hasSprinklers, pp.sprinklerCoverage === "full" ? "full coverage" : pp.sprinklerCoverage === "partial" ? "partial" : null)],
        ["Fire alarm", yesNo(pp.hasFireAlarm, pp.fireAlarmPanel ? `panel ${pp.fireAlarmPanel}` : null)],
        ["Standpipe", yesNo(pp.hasStandpipe, pp.standpipeClass)],
        ["Fire pump", yesNo(!!pp.firePump, pp.firePump?.location)],
        ["Fire department connection", pp.fdcLocation],
        ["Key box (Knox)", pp.knoxBoxLocation],
      ]} />
    </Paper>
  );
}
