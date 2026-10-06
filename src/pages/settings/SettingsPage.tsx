import { Fragment, useEffect, useMemo, useState, type ComponentType } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  BookOpen, ClipboardCheck, ExternalLink, FileText, ListChecks, Megaphone, Receipt, RotateCcw, Save, Settings2, ShieldOff, Stamp,
} from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { usePermissions, PERMISSION_LABELS } from "@/lib/auth";
import { BASE, keys, useSettings } from "@/lib/inspections";
import type { Settings } from "@/lib/types";
import { departmentPortalHref, portalTarget } from "@/shared/departmentPortal";
import { Button, Select, cx, type IconType } from "@/components/ui";
import { Confirm, PAGE, QueryState } from "@/components/kit";
import { toast } from "@/components/toast";
import { validate, type SectionProps, type SettingsForm } from "./parts";
import { GeneralSection } from "./GeneralSection";
import { LetterSection } from "./LetterSection";
import { ChecklistsSection } from "./ChecklistsSection";
import { CodesSection } from "./CodesSection";
import { CaseTypesSection, FeesSection, InspectionTypesSection, PermitTypesSection } from "./TypesSections";

interface SectionDef {
  id: string;
  label: string;
  icon: IconType;
  render: ComponentType<SectionProps>;
  /** The settings it edits, saved from the bar at the foot. None: its records save on their own. */
  fields?: (keyof SettingsForm)[];
  /** Starts a new cluster in the sidebar. */
  gap?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: "general", label: "General", icon: Settings2, render: GeneralSection, fields: ["codeEdition", "frequencyMonths", "defaultComplianceDays", "officeName"] },
  { id: "notice", label: "Notice wording", icon: FileText, render: LetterSection, fields: ["letter"] },

  { id: "checklists", label: "Checklists", icon: ListChecks, render: ChecklistsSection, gap: true },
  { id: "codes", label: "Violation codes", icon: BookOpen, render: CodesSection, fields: ["violationCodes"] },

  { id: "inspection-types", label: "Inspection types", icon: ClipboardCheck, render: InspectionTypesSection, fields: ["inspectionTypes"], gap: true },
  { id: "permit-types", label: "Permit types", icon: Stamp, render: PermitTypesSection, fields: ["permitTypes"] },
  { id: "complaint-types", label: "Complaint types", icon: Megaphone, render: CaseTypesSection, fields: ["caseTypes"] },
  { id: "fees", label: "Fees", icon: Receipt, render: FeesSection, fields: ["fees"] },
];

export function SettingsPage({ section }: { section?: string }) {
  const perms = usePermissions();
  if (!perms.settings) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
        <ShieldOff className="h-12 w-12 text-ink-3" />
        <h1 className="text-[22px] font-medium">No access to settings</h1>
        <p className="max-w-md text-[17px] text-ink-2">Ask an administrator to give your role <b>{PERMISSION_LABELS.manage_settings}</b> in the Department Portal.</p>
      </div>
    );
  }
  return <Workspace section={section} />;
}

function toForm({ updatedAt: _u, org: _o, ...rest }: Settings): SettingsForm {
  return rest;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** "General", "General and Fees", "General, Fees and Checklists". */
function list(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The sections down the side, the one open on the right, and the bar that
 * saves them all. Unsaved edits sit on top of the saved settings, so moving
 * between sections keeps them, and a refetch (another admin saving) updates
 * every field this admin hasn't touched.
 */
function Workspace({ section }: { section?: string }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const q = useSettings();
  const current = SECTIONS.find(s => s.id === section) ?? SECTIONS[0];

  const [edits, setEdits] = useState<Partial<SettingsForm>>({});
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const base = useMemo(() => (q.data ? toForm(q.data) : null), [q.data]);
  const form: SettingsForm | null = base ? { ...base, ...edits } : null;
  const changed = base ? (Object.keys(edits) as (keyof SettingsForm)[]).filter(k => !same(edits[k], base[k])) : [];
  const dirty = changed.length > 0;
  const errors = form ? validate(form) : {};
  const invalid = Object.values(errors).some(Boolean);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set: SectionProps["set"] = (key, value) => setEdits(e => ({ ...e, [key]: value }));
  const sectionDirty = (s: SectionDef) => !!s.fields?.some(f => changed.includes(f));
  const go = (id: string) => navigate(`/settings/${id}`);

  async function save() {
    if (!form || invalid) return;
    const patch: Partial<SettingsForm> = Object.fromEntries(changed.map(k => [k, form[k]]));
    if (patch.officeName !== undefined) patch.officeName = patch.officeName?.trim() || null;
    setSaving(true);
    try {
      const next = await api<Settings>("PATCH", `${BASE}/settings`, patch);
      qc.setQueryData(keys.settings, next);
      setEdits({});
      // A new code edition renumbers the checklists too, and every page reads the catalogs.
      void qc.invalidateQueries({ queryKey: [BASE] });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally { setSaving(false); }
  }

  const Section = current.render;

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-[240px] shrink-0 flex-col overflow-y-auto border-r border-divider bg-alt md:flex" aria-label="Settings sections">
        <nav className="py-2">
          {SECTIONS.map((s, i) => {
            const on = s.id === current.id;
            return (
              <Fragment key={s.id}>
                {s.gap && i > 0 && <div className="mx-4 my-2 border-t border-divider" />}
                <button
                  type="button" onClick={() => go(s.id)} aria-current={on ? "page" : undefined}
                  className={cx(
                    "relative flex h-[52px] w-full items-center gap-3.5 px-4 text-left text-[16px] transition-colors",
                    on ? "bg-hover text-white" : "text-ink-2 hover:bg-white/[.05] hover:text-white",
                  )}
                >
                  <s.icon className={cx("h-5 w-5 shrink-0", on ? "text-orange" : "text-ink-3")} />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  {sectionDirty(s) && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange" title="Unsaved changes" />}
                  {on && <span className="absolute inset-y-0 left-0 w-1 bg-orange-light" />}
                </button>
              </Fragment>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-divider py-2">
          <a
            href={departmentPortalHref("/settings/roles")} target={portalTarget("department-portal")}
            className="flex h-12 items-center gap-3.5 px-4 text-[15px] text-ink-3 transition-colors hover:bg-white/[.05] hover:text-white"
          >
            <ExternalLink className="h-5 w-5 shrink-0" />Roles &amp; permissions
          </a>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-divider bg-alt px-4 py-2.5 md:hidden">
            <Select value={current.id} onChange={e => go(e.target.value)} aria-label="Settings section">
              {SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}{sectionDirty(s) ? " (not saved)" : ""}</option>)}
            </Select>
          </div>
          <div className={PAGE}>
            <QueryState query={q}>
              {form && q.data && <Section key={current.id} form={form} saved={q.data} set={set} errors={errors} />}
            </QueryState>
          </div>
        </div>

        {dirty && (
          <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 bg-alt px-4 py-3 shadow-[0_-2px_5px_rgb(0_0_0/0.25)] sm:px-6">
            <span className="flex items-center gap-2.5 text-[16px] text-orange">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange" />
              Unsaved changes in {list(SECTIONS.filter(sectionDirty).map(s => s.label))}
            </span>
            {invalid && (current.id === "general"
              ? <span className="text-[15px] text-lightcoral">Fix the number in red first.</span>
              : (
                <button type="button" onClick={() => go("general")} className="text-left text-[15px] text-lightcoral underline underline-offset-2">
                  Fix a number under General first
                </button>
              ))}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" disabled={saving} onClick={() => setDiscarding(true)}><RotateCcw className="h-4 w-4" />Discard</Button>
              <Button variant="primary" size="lg" loading={saving} disabled={invalid} onClick={save}><Save className="h-5 w-5" />Save</Button>
            </div>
          </div>
        )}
      </div>

      <Confirm
        open={discarding} danger title="Throw away your changes?" confirmLabel="Throw them away"
        body={<>Everything changed since the last save goes back the way it was, in {list(SECTIONS.filter(sectionDirty).map(s => s.label))}.</>}
        onClose={() => setDiscarding(false)}
        onConfirm={() => { setEdits({}); setDiscarding(false); }}
      />
    </div>
  );
}
