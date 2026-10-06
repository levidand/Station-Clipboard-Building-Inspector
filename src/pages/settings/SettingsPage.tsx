import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { RotateCcw, Save, ShieldOff } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { usePermissions, PERMISSION_LABELS } from "@/lib/auth";
import { BASE, keys, useSettings } from "@/lib/inspections";
import type { Settings } from "@/lib/types";
import { Button, Select, cx } from "@/components/ui";
import { PAGE, PageHead, QueryState } from "@/components/kit";
import { toast } from "@/components/toast";
import { GeneralSection } from "./GeneralSection";
import { ChecklistsSection } from "./ChecklistsSection";
import { CodesSection } from "./CodesSection";
import { CaseTypesSection, FeesSection, InspectionTypesSection, PermitTypesSection } from "./TypesSections";
import { LetterSection } from "./LetterSection";

export interface SectionProps { settings: Settings }

const SECTIONS: { id: string; label: string; sub: string; render: ComponentType<SectionProps> }[] = [
  { id: "general", label: "General", sub: "Your fire code edition, how often buildings are inspected, and the letterhead.", render: GeneralSection },
  { id: "checklists", label: "Checklists", sub: "The lines an inspector works down. Each inspection keeps its own copy, so editing one never changes an inspection already done.", render: ChecklistsSection },
  { id: "codes", label: "Violation codes", sub: "The library violations are picked from: the code section, what to fix, and how long to allow.", render: CodesSection },
  { id: "inspection-types", label: "Inspection types", sub: "What can be scheduled, and the checklist each one starts with.", render: InspectionTypesSection },
  { id: "permit-types", label: "Permit types", sub: "The permits the office issues, their fee and how long they last.", render: PermitTypesSection },
  { id: "complaint-types", label: "Complaint types", sub: "What complaints are about, and how long an owner usually gets to comply.", render: CaseTypesSection },
  { id: "fees", label: "Fees", sub: "The fee schedule inspectors pick from. Set it to match your ordinance.", render: FeesSection },
  { id: "notice", label: "Notice wording", sub: "The words printed around the list of violations on a Notice of Violation.", render: LetterSection },
];

export function SettingsPage({ section }: { section?: string }) {
  const perms = usePermissions();
  const settings = useSettings();
  const [, navigate] = useLocation();
  const current = SECTIONS.find(s => s.id === section) ?? SECTIONS[0];

  if (!perms.settings) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
        <ShieldOff className="h-12 w-12 text-ink-3" />
        <h1 className="text-[22px] font-medium">No access to settings</h1>
        <p className="max-w-md text-[17px] text-ink-2">Ask an administrator to give your role <b>{PERMISSION_LABELS.manage_settings}</b> in the Department Portal.</p>
      </div>
    );
  }

  return (
    <div className={PAGE}>
      <PageHead title={`Settings: ${current.label}`} sub={current.sub} />
      <div className="md:hidden">
        <Select value={current.id} onChange={e => navigate(`/settings/${e.target.value}`)} aria-label="Settings section">
          {SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
      </div>
      <nav className="hidden flex-wrap gap-2 md:flex" aria-label="Settings sections">
        {SECTIONS.map(s => (
          <button key={s.id} type="button" onClick={() => navigate(`/settings/${s.id}`)} aria-current={s.id === current.id ? "page" : undefined}
            className={cx(
              "h-11 rounded-sm border px-4 text-[15px] font-medium transition-colors",
              s.id === current.id ? "border-blue bg-blue text-white" : "border-faded text-ink-2 hover:bg-white/[.075] hover:text-white",
            )}>
            {s.label}
          </button>
        ))}
      </nav>
      <QueryState query={settings}>
        {settings.data && <current.render key={current.id} settings={settings.data} />}
      </QueryState>
    </div>
  );
}

/**
 * A section's own copy of part of the settings, and the bar to save it. The
 * bar shows only when something changed, and leaving the page with changes
 * asks first.
 */
export function useSettingsDraft<K extends keyof Settings>(settings: Settings, fields: K[]) {
  const pick = () => Object.fromEntries(fields.map(f => [f, settings[f]])) as Pick<Settings, K>;
  const [draft, setDraft] = useState<Pick<Settings, K>>(pick);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick());
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(extra?: Record<string, unknown>) {
    setSaving(true);
    try {
      const next = await api<Settings>("PATCH", `${BASE}/settings`, { ...draft, ...extra });
      qc.setQueryData(keys.settings, next);
      setDraft(Object.fromEntries(fields.map(f => [f, next[f]])) as Pick<Settings, K>);
      void qc.invalidateQueries({ queryKey: [BASE] });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally { setSaving(false); }
  }
  return {
    draft, dirty, saving, save,
    set: <F extends K>(f: F, v: Pick<Settings, K>[F]) => setDraft(d => ({ ...d, [f]: v })),
    reset: () => setDraft(pick()),
  };
}

/** The bar along the bottom while a section has unsaved changes. */
export function SaveBar({ dirty, saving, onSave, onReset, children }: {
  dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void; children?: ReactNode;
}) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 bg-alt px-4 py-3 shadow-[0_-2px_5px_rgb(0_0_0/0.25)] sm:-mx-6 sm:px-6">
      <span className="flex items-center gap-2 text-[16px] text-orange"><span className="h-2.5 w-2.5 rounded-full bg-orange" />Unsaved changes</span>
      {children}
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" disabled={saving} onClick={onReset}><RotateCcw className="h-4 w-4" />Undo changes</Button>
        <Button variant="primary" size="lg" loading={saving} onClick={onSave}><Save className="h-5 w-5" />Save</Button>
      </div>
    </div>
  );
}

/** A short key from a label, for a new catalog entry: "Hot work permit" → "hot_work_permit". */
export function keyFrom(label: string, taken: string[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "item";
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
}
