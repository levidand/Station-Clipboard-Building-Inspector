import { useMemo, useState } from "react";
import { BookOpen, Check } from "lucide-react";
import { addDays, formatDay, todayKey } from "@/lib/format";
import { SEVERITY, useSettings } from "@/lib/inspections";
import type { NewViolation, Severity, ViolationCode } from "@/lib/types";
import { Badge, Button, Field, Input, Modal, Segmented, Textarea, cx } from "./ui";
import { SearchBox } from "./kit";

export interface ViolationDraft extends NewViolation {
  dueOn: string | null;
}

/** The fields a violation starts with when picked from the code library. */
export function draftFromCode(code: ViolationCode, today = todayKey()): ViolationDraft {
  return {
    codeRef: code.code, title: code.title, description: code.description, location: "",
    correctiveAction: code.correctiveAction, severity: code.severity, dueOn: addDays(today, code.complianceDays),
  };
}

/**
 * Writing a violation: pick it from the department's code library (which fills
 * in the code section, what to fix and how long to allow) or write one from
 * scratch. `start` pre-fills it, for a checklist line that just failed.
 */
export function ViolationDialog({ open, onClose, onSave, start, title = "Write a violation" }: {
  open: boolean; onClose: () => void; onSave: (v: ViolationDraft) => Promise<void>; start?: ViolationDraft | null; title?: string;
}) {
  if (!open) return null;
  return <ViolationForm onClose={onClose} onSave={onSave} start={start ?? null} title={title} />;
}

function ViolationForm({ onClose, onSave, start, title }: {
  onClose: () => void; onSave: (v: ViolationDraft) => Promise<void>; start: ViolationDraft | null; title: string;
}) {
  const settings = useSettings();
  const [picking, setPicking] = useState(!start);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<ViolationDraft>(start ?? {
    codeRef: "", title: "", description: "", location: "", correctiveAction: "", severity: "minor", dueOn: addDays(todayKey(), 30),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codes = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (settings.data?.violationCodes ?? []).filter(c => c.active)
      .filter(c => words.every(w => `${c.code} ${c.title} ${c.description}`.toLowerCase().includes(w)))
      .slice(0, 60);
  }, [q, settings.data]);

  const set = <K extends keyof ViolationDraft>(k: K, v: ViolationDraft[K]) => setDraft(d => ({ ...d, [k]: v }));
  const minorDays = settings.data?.defaultComplianceDays ?? 30;
  const severityDays: Record<Severity, number> = { imminent: 0, critical: 1, serious: 14, minor: minorDays };

  async function save() {
    if (!draft.title.trim()) { setError("Give the violation a title, or pick one from the code library."); return; }
    setBusy(true);
    setError(null);
    try { await onSave(draft); onClose(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (picking) {
    return (
      <Modal
        open onClose={onClose} title="Pick from the code library" size="lg"
        description="Type a word or a code section. Picking one fills in what to fix and how long to allow."
        footer={<>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => setPicking(false)}>Write one from scratch instead</Button>
        </>}
      >
        <SearchBox value={q} onChange={setQ} placeholder="e.g. exit, extinguisher, 1032" className="max-w-none" />
        <div className="mt-3 border border-faded">
          {codes.length === 0 ? <p className="px-4 py-4 text-[16px] text-ink-3">Nothing in the library matches.</p> : codes.map(c => (
            <button
              key={c.id} type="button"
              onClick={() => { setDraft(draftFromCode(c)); setPicking(false); }}
              className="block w-full border-b border-divider px-4 py-3 text-left last:border-b-0 hover:bg-hover"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[17px] font-medium">{c.title}</span>
                <Badge tone={SEVERITY[c.severity].tone}>{SEVERITY[c.severity].label}</Badge>
              </span>
              <span className="mt-0.5 block text-[15px] text-ink-3">{c.code} · {c.description}</span>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open onClose={onClose} title={title} size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={save}><Check className="h-5 w-5" />Save the violation</Button>
      </>}
    >
      <div className="space-y-5">
        <Button variant="secondary" onClick={() => setPicking(true)}><BookOpen className="h-5 w-5" />Pick from the code library</Button>
        <Field label="What's wrong (title)" required>
          <Input value={draft.title} onChange={e => set("title", e.target.value)} placeholder="Exit blocked" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code section">
            <Input value={draft.codeRef ?? ""} onChange={e => set("codeRef", e.target.value)} placeholder="IFC 1032.2" />
          </Field>
          <Field label="Where in the building">
            <Input value={draft.location ?? ""} onChange={e => set("location", e.target.value)} placeholder="Rear exit by the kitchen" />
          </Field>
        </div>
        <Field label="What was found">
          <Textarea value={draft.description ?? ""} onChange={e => set("description", e.target.value)} />
        </Field>
        <Field label="What the owner has to do" hint="Printed on the notice.">
          <Textarea value={draft.correctiveAction ?? ""} onChange={e => set("correctiveAction", e.target.value)} />
        </Field>
        <div>
          <span className="mb-1.5 block text-[15px] font-medium">How serious</span>
          <Segmented
            value={draft.severity}
            onChange={s => setDraft(d => ({ ...d, severity: s, dueOn: addDays(todayKey(), severityDays[s]) }))}
            options={(Object.keys(SEVERITY) as Severity[]).map(s => ({ value: s, label: SEVERITY[s].label, tone: SEVERITY[s].tone }))}
          />
          <p className="mt-1.5 text-[14px] text-ink-3">{SEVERITY[draft.severity].help}</p>
        </div>
        <Field label="Fix by" hint={draft.dueOn ? formatDay(draft.dueOn) : undefined}>
          <Input type="date" value={draft.dueOn ?? ""} onChange={e => set("dueOn", e.target.value || null)} className={cx("max-w-xs")} />
        </Field>
        {error && <p role="alert" className="text-[16px] text-lightcoral">{error}</p>}
      </div>
    </Modal>
  );
}
