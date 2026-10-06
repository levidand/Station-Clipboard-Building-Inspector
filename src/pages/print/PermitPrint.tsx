import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { formatDay, money } from "@/lib/format";
import { BASE, PERMIT_CATEGORY, PERMIT_STATUS, keys, typeLabel, useSettings } from "@/lib/inspections";
import type { PermitDetail } from "@/lib/types";
import { PAGE, QueryState } from "@/components/kit";
import { InfoTable, Paper, SignatureLines } from "./Paper";

/** The permit itself, to post on the job or at the event. */
export function PermitPrint({ id }: { id: number }) {
  const settings = useSettings();
  const q = useQuery({ queryKey: keys.permit(id), queryFn: ({ signal }) => get<PermitDetail>(`${BASE}/permits/${id}`, signal) });
  const d = q.data;
  const s = settings.data;
  if (!d || !s) return <div className={PAGE}><QueryState query={q.data ? settings : q}>{null}</QueryState></div>;
  const live = d.status === "issued";
  return (
    <Paper settings={s} back={{ href: `/permits/${id}`, label: "Back to the permit" }} title={`Permit ${d.number}`}>
      <div className="mb-6 border-4 border-double border-black px-6 py-5 text-center">
        <div className="text-[13px] uppercase tracking-widest">{PERMIT_CATEGORY[d.category]} permit</div>
        <h1 className="my-1 text-[28px] font-bold">{typeLabel(s.permitTypes, d.typeKey)}</h1>
        <div className="text-[16px] font-semibold">No. {d.number}</div>
        {!live && <div className="mt-2 text-[16px] font-bold uppercase">Not valid: {PERMIT_STATUS[d.status].label}</div>}
      </div>
      <InfoTable rows={[
        ["Location", [d.placeName, d.address].filter(Boolean).join(", ")],
        ["Issued to", [d.applicantName, d.applicantCompany].filter(Boolean).join(", ")],
        ["Issued on", d.issuedOn ? formatDay(d.issuedOn) : "—"],
        ["Expires on", d.expiresOn ? formatDay(d.expiresOn) : "Does not expire"],
        ["Fee", d.feeCents != null ? `${money(d.feeCents)} (${d.feePaid ? "paid" : "due"})` : "—"],
        ["Contact", [d.applicantPhone, d.applicantEmail].filter(Boolean).join(" · ")],
      ]} />
      {d.description && <><h2 className="mb-1 text-[16px] font-bold">This permit allows</h2><p className="mb-4 whitespace-pre-line text-[13px]">{d.description}</p></>}
      {d.conditions && <><h2 className="mb-1 text-[16px] font-bold">Conditions</h2><p className="mb-4 whitespace-pre-line text-[13px]">{d.conditions}</p></>}
      <p className="mt-6 text-[12px]">This permit must be kept on the premises and shown on request. It may be revoked if its conditions are not met.</p>
      <SignatureLines left={{ label: s.letter.signatureTitle, name: d.reviewerName }} right={{ label: "Permit holder", name: d.applicantName }} />
    </Paper>
  );
}
