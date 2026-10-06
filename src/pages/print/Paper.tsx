import type { ReactNode } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Link } from "wouter";
import { storageUrl } from "@/lib/api";
import { formatDay, todayKey } from "@/lib/format";
import type { Settings } from "@/lib/types";
import { Button } from "@/components/ui";

/**
 * A printed page: white, black type, the department's letterhead. On screen
 * it sits on the dark surface like a sheet on a desk, with a bar to print it
 * or go back; printed, only the sheet comes out.
 */
export function Paper({ settings, back, title, children }: { settings: Settings; back: { href: string; label: string }; title: string; children: ReactNode }) {
  const logo = storageUrl(settings.org.logoUrl);
  return (
    <div className="min-h-full bg-[#262626] pb-16 print:bg-white print:pb-0">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-alt px-4 py-3 shadow-bar sm:px-6">
        <Link href={back.href} className="inline-flex min-h-11 items-center gap-2 text-[16px] text-sky hover:underline"><ArrowLeft className="h-5 w-5" />{back.label}</Link>
        <span className="flex-1 text-[17px] text-ink-2">{title}</span>
        <Button variant="primary" size="lg" onClick={() => window.print()}><Printer className="h-5 w-5" />Print</Button>
      </div>
      <article className="paper mx-auto mt-6 w-full max-w-[8.5in] px-10 py-10 shadow-float">
        <header className="mb-6 flex items-center gap-4 border-b-2 border-black pb-4">
          {logo && <img src={logo} alt="" className="h-16 w-16 object-contain" />}
          <div className="min-w-0 flex-1">
            <div className="text-[20px] font-bold leading-tight">{settings.org.name}</div>
            <div className="text-[15px]">{settings.officeName ?? "Office of the Fire Marshal"}</div>
            <div className="text-[12px] text-[#444]">{[settings.org.address, settings.org.phone].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="text-right text-[12px] text-[#444]">Printed {formatDay(todayKey())}</div>
        </header>
        {children}
      </article>
    </div>
  );
}

/** A label-and-value table row pair, for the top of a document. */
export function InfoTable({ rows }: { rows: [string, ReactNode][] }) {
  const pairs: [string, ReactNode][][] = [];
  for (let i = 0; i < rows.length; i += 2) pairs.push(rows.slice(i, i + 2));
  return (
    <table className="mb-5">
      <tbody>
        {pairs.map((p, i) => (
          <tr key={i}>
            {p.map(([label, value]) => (
              <td key={label} className="w-1/2"><div className="text-[11px] uppercase text-[#555]">{label}</div><div className="text-[13px]">{value || "—"}</div></td>
            ))}
            {p.length === 1 && <td />}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Signature lines at the foot of a document. */
export function SignatureLines({ left, right }: { left: { label: string; image?: string | null; name?: string | null }; right: { label: string; name?: string | null } }) {
  return (
    <div className="mt-10 grid grid-cols-2 gap-10 text-[12px]">
      <div>
        <div className="flex h-16 items-end border-b border-black">{left.image && <img src={left.image} alt="" className="max-h-16" />}</div>
        <div className="mt-1">{left.label}{left.name ? `: ${left.name}` : ""}</div>
      </div>
      <div>
        <div className="h-16 border-b border-black" />
        <div className="mt-1">{right.label}{right.name ? `: ${right.name}` : ""}</div>
      </div>
    </div>
  );
}
