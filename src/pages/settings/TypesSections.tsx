import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { DISCIPLINE_LABELS, PERMIT_CATEGORY, useChecklists } from "@/lib/inspections";
import type { Discipline, PermitCategory } from "@/lib/types";
import { Button, Checkbox, IconButton, Input, MoneyInput, Select, Switch } from "@/components/ui";
import { Box, Group } from "@/components/kit";
import { SaveBar, keyFrom, useSettingsDraft, type SectionProps } from "./SettingsPage";

/*
 * The catalogs, edited in place as plain rows: the label first, then what
 * matters about it, then an on/off switch. A row is never deleted once used,
 * because records point at its key; switching it off stops it being offered.
 */

function RowShell({ children, active, onActive }: { children: ReactNode; active: boolean; onActive: (v: boolean) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0">
      {children}
      <Switch checked={active} onChange={onActive} label="In use" />
    </div>
  );
}

export function InspectionTypesSection({ settings }: SectionProps) {
  const d = useSettingsDraft(settings, ["inspectionTypes"]);
  const lists = useChecklists();
  const rows = d.draft.inspectionTypes;
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => d.set("inspectionTypes", rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-5">
      <Group title={`${rows.length} inspection types`} hint="Counts as routine: finishing one starts the business's next inspection cycle (an annual does, a re-inspection doesn't)."
        actions={<Button variant="primary" onClick={() => d.set("inspectionTypes", [...rows, { key: keyFrom("New inspection type", rows.map(r => r.key)), label: "New inspection type", discipline: "fire", checklistId: null, active: true }])}><Plus className="h-4 w-4" />Add a type</Button>}>
        <Box>
          {rows.map((r, i) => (
            <RowShell key={r.key} active={r.active} onActive={v => set(i, { active: v })}>
              <Input value={r.label} onChange={e => set(i, { label: e.target.value })} className="min-w-64 flex-1" aria-label="Name" />
              <Select value={r.discipline} onChange={e => set(i, { discipline: e.target.value as Discipline })} className="w-48" aria-label="Kind">
                {(Object.keys(DISCIPLINE_LABELS) as Discipline[]).map(k => <option key={k} value={k}>{DISCIPLINE_LABELS[k]}</option>)}
              </Select>
              <Select value={r.checklistId ?? ""} onChange={e => set(i, { checklistId: e.target.value ? Number(e.target.value) : null })} className="w-64" aria-label="Checklist">
                <option value="">Default checklist</option>
                {(lists.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Checkbox checked={!!r.routine} onChange={v => set(i, { routine: v })}>Routine</Checkbox>
            </RowShell>
          ))}
        </Box>
      </Group>
      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onReset={d.reset} />
    </div>
  );
}

export function PermitTypesSection({ settings }: SectionProps) {
  const d = useSettingsDraft(settings, ["permitTypes"]);
  const rows = d.draft.permitTypes;
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => d.set("permitTypes", rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-5">
      <Group title={`${rows.length} permit types`} hint="The fee fills in on a new application. Days valid sets the expiry when the permit is issued; leave it empty for one that doesn't expire."
        actions={<Button variant="primary" onClick={() => d.set("permitTypes", [...rows, { key: keyFrom("New permit", rows.map(r => r.key)), label: "New permit", category: "operational", feeCents: null, validDays: 365, active: true }])}><Plus className="h-4 w-4" />Add a type</Button>}>
        <Box>
          {rows.map((r, i) => (
            <RowShell key={r.key} active={r.active} onActive={v => set(i, { active: v })}>
              <Input value={r.label} onChange={e => set(i, { label: e.target.value })} className="min-w-64 flex-1" aria-label="Name" />
              <Select value={r.category} onChange={e => set(i, { category: e.target.value as PermitCategory })} className="w-44" aria-label="Kind">
                {(Object.keys(PERMIT_CATEGORY) as PermitCategory[]).map(k => <option key={k} value={k}>{PERMIT_CATEGORY[k]}</option>)}
              </Select>
              <MoneyInput cents={r.feeCents} onChange={v => set(i, { feeCents: v })} />
              <span className="flex items-center gap-2">
                <Input type="number" min={0} max={3650} value={r.validDays ?? ""} placeholder="—" className="w-24"
                  onChange={e => set(i, { validDays: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })} aria-label="Days valid" />
                <span className="text-[15px] text-ink-3">days</span>
              </span>
            </RowShell>
          ))}
        </Box>
      </Group>
      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onReset={d.reset} />
    </div>
  );
}

export function CaseTypesSection({ settings }: SectionProps) {
  const d = useSettingsDraft(settings, ["caseTypes"]);
  const rows = d.draft.caseTypes;
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => d.set("caseTypes", rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-5">
      <Group title={`${rows.length} complaint types`} hint="Days to comply is offered when a notice is sent. Texas allows 7 days for weeds after notice, and 10 for a junked vehicle."
        actions={<Button variant="primary" onClick={() => d.set("caseTypes", [...rows, { key: keyFrom("New complaint type", rows.map(r => r.key)), label: "New complaint type", complianceDays: 14, active: true }])}><Plus className="h-4 w-4" />Add a type</Button>}>
        <Box>
          {rows.map((r, i) => (
            <RowShell key={r.key} active={r.active} onActive={v => set(i, { active: v })}>
              <Input value={r.label} onChange={e => set(i, { label: e.target.value })} className="min-w-64 flex-1" aria-label="Name" />
              <span className="flex items-center gap-2">
                <Input type="number" min={0} max={365} value={r.complianceDays} className="w-24"
                  onChange={e => set(i, { complianceDays: Math.max(0, Number(e.target.value) || 0) })} aria-label="Days to comply" />
                <span className="text-[15px] text-ink-3">days to comply</span>
              </span>
            </RowShell>
          ))}
        </Box>
      </Group>
      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onReset={d.reset} />
    </div>
  );
}

export function FeesSection({ settings }: SectionProps) {
  const d = useSettingsDraft(settings, ["fees"]);
  const rows = d.draft.fees;
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => d.set("fees", rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-5">
      <Group title={`${rows.length} fees`} hint="Starting amounts only. Set each to what your city's fee ordinance says."
        actions={<Button variant="primary" onClick={() => d.set("fees", [...rows, { key: keyFrom("New fee", rows.map(r => r.key)), label: "New fee", amountCents: 0 }])}><Plus className="h-4 w-4" />Add a fee</Button>}>
        <Box>
          {rows.map((r, i) => (
            <div key={r.key} className="flex flex-wrap items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0">
              <Input value={r.label} onChange={e => set(i, { label: e.target.value })} className="min-w-64 flex-1" aria-label="Name" />
              <MoneyInput cents={r.amountCents} onChange={v => set(i, { amountCents: v ?? 0 })} />
              <IconButton label={`Remove ${r.label}`} onClick={() => d.set("fees", rows.filter((_, j) => j !== i))} className="hover:text-lightcoral"><X className="h-5 w-5" /></IconButton>
            </div>
          ))}
        </Box>
      </Group>
      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onReset={d.reset} />
    </div>
  );
}
