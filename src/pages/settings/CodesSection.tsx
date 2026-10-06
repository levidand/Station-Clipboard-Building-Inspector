import { useMemo, useState } from "react";
import { Plus, Save } from "lucide-react";
import { SEVERITY } from "@/lib/inspections";
import type { Severity, ViolationCode } from "@/lib/types";
import { Badge, Button, Field, Input, Modal, Segmented, Textarea, Toggle } from "@/components/ui";
import { Box, EmptyBox, Group, SearchBox } from "@/components/kit";
import { SaveBar, useSettingsDraft, type SectionProps } from "./SettingsPage";

export function CodesSection({ settings }: SectionProps) {
  const d = useSettingsDraft(settings, ["violationCodes"]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ViolationCode | "new" | null>(null);
  const codes = d.draft.violationCodes;
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return codes.filter(c => words.every(w => `${c.code} ${c.title} ${c.description}`.toLowerCase().includes(w)));
  }, [codes, q]);

  const put = (c: ViolationCode) => d.set("violationCodes", codes.some(x => x.id === c.id) ? codes.map(x => (x.id === c.id ? c : x)) : [...codes, c]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Find a code: a word or a section" />
        <Button variant="primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add a code</Button>
        <span className="text-[15px] text-ink-3">{codes.filter(c => c.active).length} in use, written for the {settings.codeEdition} fire code</span>
      </div>
      <Group title={`${shown.length} code${shown.length === 1 ? "" : "s"}`}>
        {shown.length === 0 ? <EmptyBox title="Nothing matches" /> : (
          <Box>
            {shown.map(c => (
              <button key={c.id} type="button" onClick={() => setEditing(c)}
                className="block w-full border-b border-divider px-4 py-3 text-left last:border-b-0 hover:bg-hover">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={c.active ? "text-[17px] font-medium" : "text-[17px] font-medium text-ink-3 line-through"}>{c.title}</span>
                  <Badge tone={SEVERITY[c.severity].tone}>{SEVERITY[c.severity].label}</Badge>
                  <Badge tone="muted">{c.complianceDays === 0 ? "Same day" : `${c.complianceDays} days`}</Badge>
                </span>
                <span className="block text-[15px] text-ink-3">{c.code} · {c.description}</span>
              </button>
            ))}
          </Box>
        )}
      </Group>
      {editing && <CodeDialog code={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDone={c => { put(c); setEditing(null); }} />}
      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onReset={d.reset} />
    </div>
  );
}

function CodeDialog({ code, onClose, onDone }: { code: ViolationCode | null; onClose: () => void; onDone: (c: ViolationCode) => void }) {
  const [c, setC] = useState<ViolationCode>(code ?? {
    id: `custom_${Math.random().toString(36).slice(2, 8)}`, code: "", title: "", description: "", correctiveAction: "",
    severity: "minor", complianceDays: 30, active: true,
  });
  const set = (p: Partial<ViolationCode>) => setC(x => ({ ...x, ...p }));
  return (
    <Modal open onClose={onClose} title={code ? "Edit the code" : "Add a code"} size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" disabled={!c.title.trim()} onClick={() => onDone({ ...c, title: c.title.trim() })}><Save className="h-5 w-5" />Done</Button>
      </>}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <Field label="Code section"><Input value={c.code} onChange={e => set({ code: e.target.value })} placeholder="IFC 1031.2" /></Field>
          <Field label="Title (the violation)" required><Input value={c.title} onChange={e => set({ title: e.target.value })} /></Field>
        </div>
        <Field label="What the code requires"><Textarea value={c.description} onChange={e => set({ description: e.target.value })} /></Field>
        <Field label="How to correct it" hint="Printed on the notice."><Textarea value={c.correctiveAction} onChange={e => set({ correctiveAction: e.target.value })} /></Field>
        <div>
          <span className="mb-1.5 block text-[15px] font-medium">How serious</span>
          <Segmented value={c.severity} onChange={(s: Severity) => set({ severity: s })}
            options={(Object.keys(SEVERITY) as Severity[]).map(s => ({ value: s, label: SEVERITY[s].label, tone: SEVERITY[s].tone }))} />
        </div>
        <Field label="Days to fix" hint="0 means the same day.">
          <Input type="number" min={0} max={365} className="w-28" value={c.complianceDays} onChange={e => set({ complianceDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })} />
        </Field>
        <Toggle checked={c.active} onChange={active => set({ active })} label="In use" description="Off: kept, but not offered when writing a violation." />
      </div>
    </Modal>
  );
}
