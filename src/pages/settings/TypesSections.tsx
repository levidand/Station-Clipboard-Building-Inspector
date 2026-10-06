import { useState } from "react";
import { Plus } from "lucide-react";
import { DISCIPLINE_LABELS, PERMIT_CATEGORY, useChecklists } from "@/lib/inspections";
import type { CaseTypeDef, Discipline, FeeDef, InspectionTypeDef, PermitCategory, PermitTypeDef } from "@/lib/types";
import { Badge, Button, Field, Input, MoneyInput, NumberInput, Select, Toggle } from "@/components/ui";
import { Box, EmptyBox, FilterBar, Group, PageHead } from "@/components/kit";
import {
  EditDialog, NumberField, OpenRow, Off, grouped, keyFrom, matches, money, plural, rangeError, rowState, showingFilter, shows,
  type SectionProps, type Showing,
} from "./parts";

/*
 * The catalogs: plain rows, grouped by kind, each opening a dialog. An entry
 * is never deleted once saved, because records point at its key; switching it
 * off stops it being offered. One added since the last save can be removed.
 */

const DISCIPLINES = Object.keys(DISCIPLINE_LABELS) as Discipline[];
const CATEGORIES = Object.keys(PERMIT_CATEGORY) as PermitCategory[];

/** Put, remove and tell apart the entries of one catalog, by key. */
function useCatalog<T extends { key: string; label: string }>(rows: T[], savedRows: T[], write: (rows: T[]) => void) {
  const savedByKey = new Map(savedRows.map(r => [r.key, r]));
  return {
    put: (row: T) => {
      const keyed = row.key ? row : { ...row, key: keyFrom(row.label, rows.map(r => r.key)) };
      write(rows.some(r => r.key === keyed.key) ? rows.map(r => (r.key === keyed.key ? keyed : r)) : [...rows, keyed]);
    },
    remove: (key: string) => write(rows.filter(r => r.key !== key)),
    state: (row: T) => rowState(row, savedByKey.get(row.key)),
    /** Not saved yet, so nothing can point at it. */
    unsaved: (row: T | "new" | null): row is T => !!row && row !== "new" && !savedByKey.has(row.key),
  };
}

const AddButton = ({ onClick, children }: { onClick: () => void; children: string }) => (
  <Button variant="primary" size="lg" onClick={onClick}><Plus className="h-5 w-5" />{children}</Button>
);

const Nothing = ({ any }: { any: boolean }) => any
  ? <EmptyBox title="Nothing matches">Try fewer words, or take a filter off.</EmptyBox>
  : <EmptyBox title="None yet">Add the first one with the button at the top.</EmptyBox>;

/** The Name field every catalog dialog starts with. */
function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Field label="Name" required><Input value={value} maxLength={120} onChange={e => onChange(e.target.value)} /></Field>;
}

const InUse = ({ checked, onChange, off }: { checked: boolean; onChange: (v: boolean) => void; off: string }) => (
  <Toggle checked={checked} onChange={onChange} label="In use" description={`Off: kept, but ${off}.`} />
);

// ---------------------------------------------------------------------------
// Inspection types
// ---------------------------------------------------------------------------

export function InspectionTypesSection({ form, saved, set }: SectionProps) {
  const lists = useChecklists();
  const rows = form.inspectionTypes;
  const cat = useCatalog(rows, saved.inspectionTypes, v => set("inspectionTypes", v));
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Discipline | "all">("all");
  const [showing, setShowing] = useState<Showing>("all");
  const [editing, setEditing] = useState<InspectionTypeDef | "new" | null>(null);
  const shown = rows.filter(r => (kind === "all" || r.discipline === kind) && shows(showing, r.active) && matches(q, r.label));
  // Only a checklist picked for the type; the usual one would say the same thing on every row.
  const checklist = (id: number | null) => {
    const name = id ? lists.data?.find(c => c.id === id)?.name : null;
    return name ? `Starts with the checklist ${name}` : null;
  };

  return (
    <>
      <PageHead title="Inspection types" sub="What can be scheduled, and the checklist each one starts with.">
        <AddButton onClick={() => setEditing("new")}>Add a type</AddButton>
      </PageHead>
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: "Find an inspection type" }}
        filters={[
          { label: "Kind", value: kind, empty: "all", onChange: setKind, options: [{ value: "all", label: "Every kind" }, ...DISCIPLINES.map(d => ({ value: d, label: DISCIPLINE_LABELS[d] }))] },
          showingFilter(showing, setShowing),
        ]}
      />
      {shown.length === 0 ? <Nothing any={rows.length > 0} /> : grouped(shown, r => r.discipline, DISCIPLINES).map(g => (
        <Group key={g.key} title={`${DISCIPLINE_LABELS[g.key]} (${g.rows.length})`}>
          <Box>
            {g.rows.map(r => (
              <OpenRow
                key={r.key} title={r.label} muted={!r.active} onOpen={() => setEditing(r)} state={cat.state(r)}
                tags={<>{r.routine && <Badge tone="info">Routine</Badge>}{!r.active && <Off />}</>}
                detail={checklist(r.checklistId)}
              />
            ))}
          </Box>
        </Group>
      ))}
      {editing && (
        <InspectionTypeDialog
          row={editing === "new" ? null : editing} checklists={lists.data ?? []} onClose={() => setEditing(null)}
          onDone={r => { cat.put(r); setEditing(null); }}
          onRemove={cat.unsaved(editing) ? () => { cat.remove(editing.key); setEditing(null); } : undefined}
        />
      )}
    </>
  );
}

function InspectionTypeDialog({ row, checklists, onClose, onDone, onRemove }: {
  row: InspectionTypeDef | null; checklists: { id: number; name: string; isActive: boolean }[];
  onClose: () => void; onDone: (r: InspectionTypeDef) => void; onRemove?: () => void;
}) {
  const [r, setR] = useState<InspectionTypeDef>(row ?? { key: "", label: "", discipline: "fire", checklistId: null, active: true, routine: false });
  const put = (p: Partial<InspectionTypeDef>) => setR(x => ({ ...x, ...p }));
  return (
    <EditDialog title={row ? "Change the inspection type" : "Add an inspection type"} onClose={onClose} onRemove={onRemove}
      canDone={!!r.label.trim()} onDone={() => onDone({ ...r, label: r.label.trim() })}>
      <NameField value={r.label} onChange={label => put({ label })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind">
          <Select value={r.discipline} onChange={e => put({ discipline: e.target.value as Discipline })}>
            {DISCIPLINES.map(d => <option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>)}
          </Select>
        </Field>
        <Field label="Starts with the checklist">
          <Select value={r.checklistId ?? ""} onChange={e => put({ checklistId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">The usual one for this type</option>
            {checklists.filter(c => c.isActive || c.id === r.checklistId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      <Toggle checked={!!r.routine} onChange={routine => put({ routine })} label="Routine"
        description="Finishing one starts the business's next inspection cycle. An annual does; a re-inspection doesn't." />
      <InUse checked={r.active} onChange={active => put({ active })} off="not offered when scheduling" />
    </EditDialog>
  );
}

// ---------------------------------------------------------------------------
// Permit types
// ---------------------------------------------------------------------------

const feeText = (cents: number | null) => (cents == null ? "No set fee" : money(cents));
const validText = (days: number | null) => (days == null ? "Doesn't expire" : `Good for ${plural(days, "day")}`);

export function PermitTypesSection({ form, saved, set }: SectionProps) {
  const rows = form.permitTypes;
  const cat = useCatalog(rows, saved.permitTypes, v => set("permitTypes", v));
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<PermitCategory | "all">("all");
  const [showing, setShowing] = useState<Showing>("all");
  const [editing, setEditing] = useState<PermitTypeDef | "new" | null>(null);
  const shown = rows.filter(r => (kind === "all" || r.category === kind) && shows(showing, r.active) && matches(q, r.label));

  return (
    <>
      <PageHead title="Permit types" sub="The permits the office issues, their fee and how long they last.">
        <AddButton onClick={() => setEditing("new")}>Add a type</AddButton>
      </PageHead>
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: "Find a permit type" }}
        filters={[
          { label: "Kind", value: kind, empty: "all", onChange: setKind, options: [{ value: "all", label: "Every kind" }, ...CATEGORIES.map(c => ({ value: c, label: PERMIT_CATEGORY[c] }))] },
          showingFilter(showing, setShowing),
        ]}
      />
      {shown.length === 0 ? <Nothing any={rows.length > 0} /> : grouped(shown, r => r.category, CATEGORIES).map(g => (
        <Group key={g.key} title={`${PERMIT_CATEGORY[g.key]} (${g.rows.length})`}>
          <Box>
            {g.rows.map(r => (
              <OpenRow
                key={r.key} title={r.label} muted={!r.active} onOpen={() => setEditing(r)} state={cat.state(r)}
                tags={!r.active && <Off />} detail={validText(r.validDays)} aside={feeText(r.feeCents)}
              />
            ))}
          </Box>
        </Group>
      ))}
      {editing && (
        <PermitTypeDialog
          row={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onDone={r => { cat.put(r); setEditing(null); }}
          onRemove={cat.unsaved(editing) ? () => { cat.remove(editing.key); setEditing(null); } : undefined}
        />
      )}
    </>
  );
}

function PermitTypeDialog({ row, onClose, onDone, onRemove }: {
  row: PermitTypeDef | null; onClose: () => void; onDone: (r: PermitTypeDef) => void; onRemove?: () => void;
}) {
  const [r, setR] = useState<PermitTypeDef>(row ?? { key: "", label: "", category: "operational", feeCents: null, validDays: 365, active: true });
  const put = (p: Partial<PermitTypeDef>) => setR(x => ({ ...x, ...p }));
  const daysError = r.validDays == null ? undefined : rangeError(r.validDays, 0, 3650, "days");
  return (
    <EditDialog title={row ? "Change the permit type" : "Add a permit type"} onClose={onClose} onRemove={onRemove}
      canDone={!!r.label.trim() && !daysError} onDone={() => onDone({ ...r, label: r.label.trim() })}>
      <NameField value={r.label} onChange={label => put({ label })} />
      <Field label="Kind">
        <Select value={r.category} onChange={e => put({ category: e.target.value as PermitCategory })} className="max-w-xs">
          {CATEGORIES.map(c => <option key={c} value={c}>{PERMIT_CATEGORY[c]}</option>)}
        </Select>
      </Field>
      <Field label="Fee" hint="Fills in on a new application. Leave it empty for no set fee.">
        <MoneyInput cents={r.feeCents} onChange={feeCents => put({ feeCents })} />
      </Field>
      <Field label="Days valid" hint={daysError ? <span className="text-lightcoral">{daysError}</span> : "Sets the expiry date when the permit is issued. Leave it empty for one that doesn't expire."}>
        <NumberInput value={r.validDays} onChange={validDays => put({ validDays })} unit="days" min={0} max={3650} placeholder="None" />
      </Field>
      <InUse checked={r.active} onChange={active => put({ active })} off="not offered on a new application" />
    </EditDialog>
  );
}

// ---------------------------------------------------------------------------
// Complaint types
// ---------------------------------------------------------------------------

const complyText = (days: number) => (days === 0 ? "Fixed the same day" : `${plural(days, "day")} to comply`);

export function CaseTypesSection({ form, saved, set }: SectionProps) {
  const rows = form.caseTypes;
  const cat = useCatalog(rows, saved.caseTypes, v => set("caseTypes", v));
  const [editing, setEditing] = useState<CaseTypeDef | "new" | null>(null);
  return (
    <>
      <PageHead title="Complaint types" sub="What complaints are about, and how long an owner usually gets to comply.">
        <AddButton onClick={() => setEditing("new")}>Add a type</AddButton>
      </PageHead>
      <Group title={`Complaint types (${rows.length})`} hint="Days to comply is offered when a notice is sent. Texas allows 7 days for weeds after notice, and 10 for a junked vehicle.">
        {rows.length === 0 ? <Nothing any={false} /> : (
          <Box>
            {rows.map(r => (
              <OpenRow key={r.key} title={r.label} muted={!r.active} onOpen={() => setEditing(r)} state={cat.state(r)}
                tags={!r.active && <Off />} detail={complyText(r.complianceDays)} />
            ))}
          </Box>
        )}
      </Group>
      {editing && (
        <CaseTypeDialog
          row={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onDone={r => { cat.put(r); setEditing(null); }}
          onRemove={cat.unsaved(editing) ? () => { cat.remove(editing.key); setEditing(null); } : undefined}
        />
      )}
    </>
  );
}

function CaseTypeDialog({ row, onClose, onDone, onRemove }: {
  row: CaseTypeDef | null; onClose: () => void; onDone: (r: CaseTypeDef) => void; onRemove?: () => void;
}) {
  const [r, setR] = useState<CaseTypeDef>(row ?? { key: "", label: "", complianceDays: 14, active: true });
  const put = (p: Partial<CaseTypeDef>) => setR(x => ({ ...x, ...p }));
  const daysError = rangeError(r.complianceDays, 0, 365, "days");
  return (
    <EditDialog title={row ? "Change the complaint type" : "Add a complaint type"} onClose={onClose} onRemove={onRemove}
      canDone={!!r.label.trim() && !daysError} onDone={() => onDone({ ...r, label: r.label.trim() })}>
      <NameField value={r.label} onChange={label => put({ label })} />
      <NumberField label="Days to comply" unit="days" min={0} max={365} error={daysError} hint="Offered when a notice is sent. 0 means the same day."
        value={r.complianceDays} onChange={complianceDays => put({ complianceDays })} />
      <InUse checked={r.active} onChange={active => put({ active })} off="not offered for a new complaint" />
    </EditDialog>
  );
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

export function FeesSection({ form, saved, set }: SectionProps) {
  const rows = form.fees;
  const cat = useCatalog(rows, saved.fees, v => set("fees", v));
  const [editing, setEditing] = useState<FeeDef | "new" | null>(null);
  return (
    <>
      <PageHead title="Fees" sub="The fee schedule inspectors pick from.">
        <AddButton onClick={() => setEditing("new")}>Add a fee</AddButton>
      </PageHead>
      <Group title={`Fees (${rows.length})`} hint="Starting amounts only. Set each to what your city's fee ordinance says.">
        {rows.length === 0 ? <Nothing any={false} /> : (
          <Box>
            {rows.map(r => (
              <OpenRow key={r.key} title={r.label} onOpen={() => setEditing(r)} state={cat.state(r)} aside={money(r.amountCents)} />
            ))}
          </Box>
        )}
      </Group>
      {editing && (
        <FeeDialog
          row={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onDone={r => { cat.put(r); setEditing(null); }}
          onRemove={editing !== "new" ? () => { cat.remove(editing.key); setEditing(null); } : undefined}
        />
      )}
    </>
  );
}

function FeeDialog({ row, onClose, onDone, onRemove }: {
  row: FeeDef | null; onClose: () => void; onDone: (r: FeeDef) => void; onRemove?: () => void;
}) {
  const [r, setR] = useState<FeeDef>(row ?? { key: "", label: "", amountCents: 0 });
  return (
    <EditDialog title={row ? "Change the fee" : "Add a fee"} onClose={onClose} onRemove={onRemove} removeLabel="Remove the fee"
      canDone={!!r.label.trim()} onDone={() => onDone({ ...r, label: r.label.trim() })}>
      <NameField value={r.label} onChange={label => setR(x => ({ ...x, label }))} />
      <Field label="Amount"><MoneyInput cents={r.amountCents} onChange={v => setR(x => ({ ...x, amountCents: v ?? 0 }))} /></Field>
    </EditDialog>
  );
}
