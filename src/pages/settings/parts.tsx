import type { ReactNode } from "react";
import { Check, ChevronRight, Trash2 } from "lucide-react";
import type { RiskClass, Settings } from "@/lib/types";
import { Badge, Button, Field, Input, Modal, cx } from "@/components/ui";

/*
 * Settings building blocks, laid out like the Command Portal's settings
 * (src/pages/settings/fields.tsx there): every section's edits sit in one
 * draft, saved together from the bar at the foot of the page. A list is plain
 * rows; tapping one opens it in a dialog, and Done puts the change in the draft.
 */

/** What the settings page edits. The department's name, logo and address come from the Department Portal. */
export type SettingsForm = Omit<Settings, "updatedAt" | "org">;

/** Errors by field: "defaultComplianceDays", or "frequencyMonths.high" for one risk class. */
export type SettingsErrors = Partial<Record<string, string>>;

export interface SectionProps {
  /** The saved settings with this admin's unsaved edits on top. */
  form: SettingsForm;
  /** The settings as saved, to tell what's new or changed. */
  saved: Settings;
  set: <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => void;
  errors: SettingsErrors;
}

/** A whole-number range check, worded for the field it sits under. */
export function rangeError(value: number, min: number, max: number, unit: string): string | undefined {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return "Enter a whole number.";
  if (value < min || value > max) return `Between ${min} and ${max} ${unit}.`;
  return undefined;
}

export function validate(f: SettingsForm): SettingsErrors {
  const errors: SettingsErrors = { defaultComplianceDays: rangeError(f.defaultComplianceDays, 0, 365, "days") };
  for (const r of Object.keys(f.frequencyMonths) as RiskClass[]) errors[`frequencyMonths.${r}`] = rangeError(f.frequencyMonths[r], 1, 120, "months");
  return errors;
}

/** A number box with its unit, kept as NaN while it's empty so the page can say what's wrong. */
export function NumberBox({ value, onChange, unit, min, max, error, label }: {
  value: number; onChange: (v: number) => void; unit: string; min: number; max: number; error?: string; label?: string;
}) {
  return (
    <span className="flex items-center gap-3">
      <Input
        type="number" inputMode="numeric" min={min} max={max} step={1} aria-label={label} aria-invalid={!!error}
        value={Number.isFinite(value) ? value : ""}
        onChange={e => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
        className={cx("w-28 tabular-nums", error && "border-lightcoral")}
      />
      <span className="text-[16px] text-ink-2">{unit}</span>
    </span>
  );
}

/** A labelled number box, with its hint or, in its place, what's wrong. */
export function NumberField({ label, hint, error, ...box }: Parameters<typeof NumberBox>[0] & { label: string; hint?: ReactNode }) {
  return (
    <Field label={label} hint={error ? <span className="text-lightcoral">{error}</span> : hint}>
      <NumberBox {...box} error={error} />
    </Field>
  );
}

/**
 * A row in a settings list. The whole row is the button that opens it. A row
 * changed since the last save says so, so it's plain what Save will send.
 */
export function OpenRow({ title, tags, detail, aside, muted, state, onOpen }: {
  title: ReactNode; tags?: ReactNode; detail?: ReactNode; aside?: ReactNode; muted?: boolean;
  state?: "new" | "changed" | null; onOpen: () => void;
}) {
  return (
    <button
      type="button" onClick={onOpen}
      className="flex min-h-[68px] w-full items-center gap-4 border-b border-divider px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-hover"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={cx("text-[17px] font-medium leading-6", muted ? "text-ink-3" : "text-ink")}>{title}</span>
          {tags}
          {state && <Badge tone="warn">{state === "new" ? "New, not saved" : "Changed, not saved"}</Badge>}
        </span>
        {detail && <span className="mt-0.5 block text-[15px] leading-5 text-ink-3">{detail}</span>}
      </span>
      {aside && <span className="shrink-0 text-right text-[16px] text-ink-2 tabular-nums">{aside}</span>}
      <ChevronRight className="h-6 w-6 shrink-0 text-ink-4" />
    </button>
  );
}

/** "new" when the row isn't in the saved list, "changed" when it differs from it. */
export function rowState<T>(row: T, saved: T | undefined): "new" | "changed" | null {
  if (!saved) return "new";
  return JSON.stringify(row) === JSON.stringify(saved) ? null : "changed";
}

/** A tag for an entry that's switched off. */
export const Off = () => <Badge tone="muted">Switched off</Badge>;

/**
 * The dialog a list row opens. Done puts the change on the page; the bar at
 * the foot saves it with everything else. `onRemove` only for something that
 * nothing can point at yet.
 */
export function EditDialog({ title, onClose, onDone, canDone, onRemove, removeLabel = "Remove", children }: {
  title: string; onClose: () => void; onDone: () => void; canDone: boolean;
  onRemove?: () => void; removeLabel?: string; children: ReactNode;
}) {
  return (
    <Modal
      open onClose={onClose} title={title} size="md"
      description="Saved with the rest of the page when you press Save."
      footer={<>
        {onRemove && <Button variant="decline" className="mr-auto" onClick={onRemove}><Trash2 className="h-4 w-4" />{removeLabel}</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" disabled={!canDone} onClick={onDone}><Check className="h-5 w-5" />Done</Button>
      </>}
    >
      <div className="space-y-5">{children}</div>
    </Modal>
  );
}

/** Rows in groups, in the order the groups are listed; groups with nothing in them are left out. */
export function grouped<T, K extends string>(rows: T[], keyOf: (r: T) => K, order: K[]): { key: K; rows: T[] }[] {
  return order.map(key => ({ key, rows: rows.filter(r => keyOf(r) === key) })).filter(g => g.rows.length > 0);
}

/** Every word typed appears somewhere in the text. */
export function matches(q: string, ...text: (string | null | undefined)[]): boolean {
  const hay = text.join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

export type Showing = "all" | "on" | "off";

/** The "Showing" filter on a list of things that switch on and off. */
export function showingFilter(value: Showing, onChange: (v: Showing) => void) {
  return {
    label: "Showing", value, empty: "all" as Showing, onChange,
    options: [{ value: "all" as Showing, label: "Everything" }, { value: "on" as Showing, label: "Only in use" }, { value: "off" as Showing, label: "Only switched off" }],
  };
}

export const shows = (showing: Showing, active: boolean) => showing === "all" || (showing === "on") === active;

/** A short key from a label, for a new catalog entry: "Hot work permit" → "hot_work_permit". */
export function keyFrom(label: string, taken: string[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "item";
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
}

export const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
