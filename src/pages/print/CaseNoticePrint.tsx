import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { formatDay, todayKey } from "@/lib/format";
import { BASE, keys, typeLabel, useSettings } from "@/lib/inspections";
import type { CaseDetail } from "@/lib/types";
import { PAGE, QueryState } from "@/components/kit";
import { Paper, SignatureLines } from "./Paper";

/**
 * The notice to a property owner on a code enforcement complaint: the latest
 * notice's date to comply by, and the violations written on it. Who complained
 * is never on it.
 */
export function CaseNoticePrint({ id }: { id: number }) {
  const settings = useSettings();
  const q = useQuery({ queryKey: keys.case(id), queryFn: ({ signal }) => get<CaseDetail>(`${BASE}/cases/${id}`, signal) });
  const d = q.data;
  const s = settings.data;
  if (!d || !s) return <div className={PAGE}><QueryState query={q.data ? settings : q}>{null}</QueryState></div>;
  const notice = d.notices[d.notices.length - 1];
  const open = d.violations.filter(v => v.status === "open");
  const dueOn = notice?.dueOn ?? d.dueOn;
  return (
    <Paper settings={s} back={{ href: `/complaints/${id}`, label: "Back to the complaint" }} title={`Notice for ${d.number}`}>
      <div className="mb-6 text-[13px]">
        <div>{formatDay(notice?.sentOn ?? todayKey(), { weekday: false })}</div>
        <div className="mt-3">{d.ownerName ?? "Owner or occupant"}</div>
        <div className="whitespace-pre-line">{d.ownerMailingAddress ?? d.address}</div>
      </div>
      <h1 className="mb-1 text-[22px] font-bold uppercase">Notice of Violation</h1>
      <p className="mb-4 text-[13px]"><b>Property:</b> {d.placeName ? `${d.placeName}, ` : ""}{d.address} · <b>Case:</b> {d.number} · <b>Concerning:</b> {typeLabel(s.caseTypes, d.typeKey)}</p>
      <p className="mb-5 text-[13px] leading-relaxed">
        The property named above was found in violation of the codes adopted by this jurisdiction, as listed below.
        Each condition must be corrected{dueOn ? <> by <b>{formatDay(dueOn)}</b></> : ""}. The property will be checked again after that date.
      </p>
      {open.length > 0 ? (
        <table className="mb-5">
          <thead><tr><th>#</th><th>Condition and how to correct it</th><th>Code</th></tr></thead>
          <tbody>
            {open.map((v, i) => (
              <tr key={v.id}>
                <td>{i + 1}</td>
                <td><b>{v.title}</b>{v.location ? ` (${v.location})` : ""}{v.description && <div>{v.description}</div>}{v.correctiveAction && <div><i>To correct:</i> {v.correctiveAction}</div>}</td>
                <td className="whitespace-nowrap">{v.codeRef}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="mb-5 text-[13px]">{d.description}</p>}
      <p className="mb-6 text-[13px] leading-relaxed">{s.letter.closing}</p>
      <p className="text-[13px]">{[s.org.phone, s.org.address].filter(Boolean).join(" · ")}</p>
      {notice && <p className="mt-2 text-[11px] text-[#555]">Delivered: {notice.method}, {formatDay(notice.sentOn)}{notice.note ? ` (${notice.note})` : ""}</p>}
      <SignatureLines left={{ label: "Code Enforcement", name: d.assignedName }} right={{ label: "Received by" }} />
    </Paper>
  );
}
