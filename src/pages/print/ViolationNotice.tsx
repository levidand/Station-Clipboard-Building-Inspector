import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { formatDay, todayKey } from "@/lib/format";
import { BASE, keys, useSettings } from "@/lib/inspections";
import type { InspectionDetail } from "@/lib/types";
import { PAGE, QueryState } from "@/components/kit";
import { Paper, SignatureLines } from "./Paper";

/**
 * The Notice of Violation (IFC 2021 §112.3, §109.3 in 2018): a written notice
 * of each condition, what to do about it, and when it will be re-inspected.
 * The wording around the list is the department's, from Settings.
 */
export function ViolationNotice({ id }: { id: number }) {
  const settings = useSettings();
  const q = useQuery({ queryKey: keys.inspection(id), queryFn: ({ signal }) => get<InspectionDetail>(`${BASE}/inspections/${id}`, signal) });
  const d = q.data;
  const s = settings.data;
  if (!d || !s) return <div className={PAGE}><QueryState query={q.data ? settings : q}>{null}</QueryState></div>;

  const open = d.violations.filter(v => v.status === "open");
  const list = open.length ? open : d.violations;
  const reinspect = d.reinspections.find(r => r.scheduledOn)?.scheduledOn
    ?? list.map(v => v.dueOn).filter((x): x is string => !!x).sort().pop() ?? null;
  const to = d.property?.ownerName ?? d.placeName ?? "Owner or occupant";
  const mailTo = d.property?.ownerMailingAddress ?? d.address;

  return (
    <Paper settings={s} back={{ href: `/inspections/${id}`, label: "Back to the inspection" }} title={`Notice of violation for ${d.number}`}>
      <div className="mb-6 text-[13px]">
        <div>{formatDay(todayKey(), { weekday: false })}</div>
        <div className="mt-3">{to}</div>
        {d.property?.ownerName && d.placeName && <div>{d.placeName}</div>}
        <div className="whitespace-pre-line">{mailTo}</div>
      </div>
      <h1 className="mb-1 text-[22px] font-bold uppercase">{s.letter.heading}</h1>
      <p className="mb-4 text-[13px]"><b>Property:</b> {d.placeName ? `${d.placeName}, ` : ""}{d.address} · <b>Inspection:</b> {d.number}</p>
      <p className="mb-5 text-[13px] leading-relaxed">{s.letter.intro}</p>

      <table className="mb-5">
        <thead><tr><th>#</th><th>Condition found and how to correct it</th><th>Code</th><th>Correct by</th></tr></thead>
        <tbody>
          {list.map((v, i) => (
            <tr key={v.id}>
              <td>{i + 1}</td>
              <td>
                <b>{v.title}</b>{v.location ? ` (${v.location})` : ""}
                {v.description && <div>{v.description}</div>}
                {v.correctiveAction && <div><i>To correct:</i> {v.correctiveAction}</div>}
              </td>
              <td className="whitespace-nowrap">{v.codeRef}</td>
              <td className="whitespace-nowrap">{v.dueOn ? (v.dueOn <= todayKey() ? "Immediately" : formatDay(v.dueOn, { weekday: false })) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {reinspect && <p className="mb-4 text-[13px]"><b>Re-inspection on or after:</b> {formatDay(reinspect)}</p>}
      <p className="mb-6 text-[13px] leading-relaxed">{s.letter.closing}</p>
      <p className="text-[13px]">{[s.org.phone, s.org.address].filter(Boolean).join(" · ")}</p>

      <SignatureLines
        left={{ label: s.letter.signatureTitle, name: d.completedByName ?? d.assignedName }}
        right={{ label: "Received by", name: d.contactName }}
      />
    </Paper>
  );
}
