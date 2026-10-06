import { useState } from "react";
import { Plus } from "lucide-react";
import { SEVERITY } from "@/lib/inspections";
import type { Severity, ViolationCode } from "@/lib/types";
import { Badge, Button, Field, Input, Segmented, Textarea, Toggle } from "@/components/ui";
import { Box, EmptyBox, FilterBar, Group, PageHead } from "@/components/kit";
import {
  EditDialog, NumberField, OpenRow, Off, matches, plural, rangeError, rowState, showingFilter, shows,
  type SectionProps, type Showing,
} from "./parts";

const SEVERITIES = Object.keys(SEVERITY) as Severity[];
const dueText = (days: number) => (days === 0 ? "Same day" : plural(days, "day"));

export function CodesSection({ form, saved, set }: SectionProps) {
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [showing, setShowing] = useState<Showing>("all");
  const [editing, setEditing] = useState<ViolationCode | "new" | null>(null);
  const codes = form.violationCodes;
  const shown = codes.filter(c =>
    (severity === "all" || c.severity === severity) && shows(showing, c.active) && matches(q, c.code, c.title, c.description));
  const savedById = new Map(saved.violationCodes.map(c => [c.id, c]));

  const put = (c: ViolationCode) => set("violationCodes", codes.some(x => x.id === c.id) ? codes.map(x => (x.id === c.id ? c : x)) : [...codes, c]);

  return (
    <>
      <PageHead title="Violation codes" sub="The library violations are picked from: the code section, what to fix, and how long to allow.">
        <Button variant="primary" size="lg" onClick={() => setEditing("new")}><Plus className="h-5 w-5" />Add a code</Button>
      </PageHead>

      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: "Find a code: a word or a section" }}
        filters={[
          { label: "How serious", value: severity, empty: "all", onChange: setSeverity,
            options: [{ value: "all", label: "Any" }, ...SEVERITIES.map(s => ({ value: s, label: SEVERITY[s].label }))] },
          showingFilter(showing, setShowing),
        ]}
      />

      <Group
        title={`${shown.length === codes.length ? "All codes" : "Matching"} (${shown.length})`}
        hint={`${codes.filter(c => c.active).length} in use, written for the ${form.codeEdition} fire code. A code that's switched off stays on violations already written with it.`}
      >
        {shown.length === 0 ? <EmptyBox title="Nothing matches">Try fewer words, or take a filter off.</EmptyBox> : (
          <Box>
            {shown.map(c => (
              <OpenRow
                key={c.id} title={c.title} muted={!c.active} onOpen={() => setEditing(c)} state={rowState(c, savedById.get(c.id))}
                tags={<><Badge tone={SEVERITY[c.severity].tone}>{SEVERITY[c.severity].label}</Badge>{!c.active && <Off />}</>}
                detail={[c.code, c.description].filter(Boolean).join(" · ")}
                aside={dueText(c.complianceDays)}
              />
            ))}
          </Box>
        )}
      </Group>

      {editing && (
        <CodeDialog
          code={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onDone={c => { put(c); setEditing(null); }}
          onRemove={editing !== "new" && !savedById.has(editing.id)
            ? () => { set("violationCodes", codes.filter(x => x.id !== editing.id)); setEditing(null); }
            : undefined}
        />
      )}
    </>
  );
}

function CodeDialog({ code, onClose, onDone, onRemove }: {
  code: ViolationCode | null; onClose: () => void; onDone: (c: ViolationCode) => void; onRemove?: () => void;
}) {
  const [c, setC] = useState<ViolationCode>(code ?? {
    id: `custom_${Math.random().toString(36).slice(2, 8)}`, code: "", title: "", description: "", correctiveAction: "",
    severity: "minor", complianceDays: 30, active: true,
  });
  const put = (p: Partial<ViolationCode>) => setC(x => ({ ...x, ...p }));
  const daysError = rangeError(c.complianceDays, 0, 365, "days");
  return (
    <EditDialog
      title={code ? "Change the code" : "Add a code"} onClose={onClose} onRemove={onRemove}
      canDone={!!c.title.trim() && !daysError}
      onDone={() => onDone({ ...c, title: c.title.trim(), code: c.code.trim() })}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Field label="Code section"><Input value={c.code} maxLength={60} onChange={e => put({ code: e.target.value })} placeholder="IFC 1031.2" /></Field>
        <Field label="The violation" required><Input value={c.title} maxLength={200} onChange={e => put({ title: e.target.value })} placeholder="Exit blocked" /></Field>
      </div>
      <Field label="What the code requires"><Textarea value={c.description} maxLength={2000} onChange={e => put({ description: e.target.value })} /></Field>
      <Field label="How to correct it" hint="Printed on the notice."><Textarea value={c.correctiveAction} maxLength={2000} onChange={e => put({ correctiveAction: e.target.value })} /></Field>
      <div>
        <span className="mb-1.5 block text-[15px] font-medium">How serious</span>
        <Segmented value={c.severity} onChange={(s: Severity) => put({ severity: s })}
          options={SEVERITIES.map(s => ({ value: s, label: SEVERITY[s].label, tone: SEVERITY[s].tone }))} />
        <p className="mt-1.5 text-[14px] leading-5 text-ink-3">{SEVERITY[c.severity].help}</p>
      </div>
      <NumberField label="Days to fix" unit="days" min={0} max={365} hint="0 means the same day." error={daysError}
        value={c.complianceDays} onChange={v => put({ complianceDays: v })} />
      <Toggle checked={c.active} onChange={active => put({ active })} label="In use" description="Off: kept, but not offered when writing a violation." />
    </EditDialog>
  );
}
