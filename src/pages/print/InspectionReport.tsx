import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { dateTime, formatDay, money, timeOfDay } from "@/lib/format";
import { BASE, RESULT, SEVERITY, keys, typeLabel, useSettings } from "@/lib/inspections";
import type { InspectionDetail } from "@/lib/types";
import { PAGE, QueryState } from "@/components/kit";
import { InfoTable, Paper, SignatureLines } from "./Paper";

/** The inspection report left with the business: what was checked, what was found, what has to be fixed. */
export function InspectionReport({ id }: { id: number }) {
  const settings = useSettings();
  const q = useQuery({ queryKey: keys.inspection(id), queryFn: ({ signal }) => get<InspectionDetail>(`${BASE}/inspections/${id}`, signal) });
  const d = q.data;
  const s = settings.data;
  if (!d || !s) return <div className={PAGE}><QueryState query={q.data ? settings : q}>{null}</QueryState></div>;

  const sections = new Map<string, InspectionDetail["checklist"]>();
  for (const item of d.checklist) {
    const key = item.section || "Checklist";
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(item);
  }
  const mark = (r: string | null) => (r === "ok" ? "Pass" : r === "fail" ? "FAIL" : r === "na" ? "N/A" : "Not checked");

  return (
    <Paper settings={s} back={{ href: `/inspections/${id}`, label: "Back to the inspection" }} title={`Inspection report ${d.number}`}>
      <h1 className="mb-1 text-[22px] font-bold">Fire Inspection Report</h1>
      <p className="mb-5 text-[13px]">{typeLabel(s.inspectionTypes, d.typeKey)} · {d.number}</p>
      <InfoTable rows={[
        ["Business", d.placeName ?? d.address],
        ["Address", d.address],
        ["Result", d.result ? RESULT[d.result].label : "Not finished"],
        ["Date", d.completedAt ? dateTime(d.completedAt, true) : d.scheduledOn ? `${formatDay(d.scheduledOn)}${d.scheduledTime ? `, ${timeOfDay(d.scheduledTime)}` : ""}` : "—"],
        ["Inspector", d.completedByName ?? d.assignedName],
        ["Occupancy class", d.property?.occupancyClass],
        ["Person met", [d.contactName, d.contactTitle].filter(Boolean).join(", ")],
        ["Owner", d.property?.ownerName],
        ...(d.feeCents != null ? [["Fee", `${money(d.feeCents)} (${d.feePaid ? "paid" : "due"})`] as [string, string]] : []),
      ]} />

      {d.violations.length > 0 && (
        <>
          <h2 className="mb-2 mt-4 text-[16px] font-bold">Violations to correct</h2>
          <table className="mb-5">
            <thead><tr><th>#</th><th>Violation</th><th>Code</th><th>Correct by</th></tr></thead>
            <tbody>
              {d.violations.map((v, i) => (
                <tr key={v.id}>
                  <td>{i + 1}</td>
                  <td>
                    <b>{v.title}</b>{v.location ? ` (${v.location})` : ""} · {SEVERITY[v.severity].label}
                    {v.description && <div>{v.description}</div>}
                    {v.correctiveAction && <div><i>To correct:</i> {v.correctiveAction}</div>}
                    {v.status !== "open" && <div><i>{v.status === "corrected" ? "Corrected" : v.status}</i></div>}
                  </td>
                  <td className="whitespace-nowrap">{v.codeRef}</td>
                  <td className="whitespace-nowrap">{v.status === "open" ? (v.dueOn ? formatDay(v.dueOn) : "—") : "Done"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {d.reinspections.length > 0 && (
        <p className="mb-4 text-[13px]"><b>Re-inspection:</b> {d.reinspections.map(r => (r.scheduledOn ? formatDay(r.scheduledOn) : "to be scheduled")).join(", ")}</p>
      )}

      {d.notes && (
        <>
          <h2 className="mb-1 mt-4 text-[16px] font-bold">Inspector's notes</h2>
          <p className="mb-5 whitespace-pre-line text-[13px]">{d.notes}</p>
        </>
      )}

      {d.checklist.length > 0 && (
        <>
          <h2 className="mb-2 mt-4 text-[16px] font-bold">What was checked</h2>
          {[...sections.entries()].map(([name, items]) => (
            <table key={name} className="mb-3">
              <thead><tr><th colSpan={3}>{name}</th></tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id}>
                    <td className="w-16 whitespace-nowrap font-semibold">{mark(i.result)}</td>
                    <td>{i.text}{i.note ? <div className="text-[#444]">Note: {i.note}</div> : null}</td>
                    <td className="w-28 whitespace-nowrap text-[#444]">{i.codeRef}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </>
      )}

      <SignatureLines
        left={{ label: "Received by", image: d.signature, name: d.signedName ?? d.contactName }}
        right={{ label: "Inspector", name: d.completedByName ?? d.assignedName }}
      />
      <p className="mt-6 text-[11px] text-[#555]">The signature above means this report was received, not that the findings are agreed with.</p>
    </Paper>
  );
}
