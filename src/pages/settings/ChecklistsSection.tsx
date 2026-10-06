import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { BASE, DISCIPLINE_LABELS, keys, useChecklists } from "@/lib/inspections";
import type { Checklist, ChecklistItem, Discipline } from "@/lib/types";
import { Badge, Button, Field, IconButton, Input, Modal, Select, Textarea, Toggle } from "@/components/ui";
import { Box, Confirm, EmptyBox, Group, QueryState } from "@/components/kit";
import { toast } from "@/components/toast";
import type { SectionProps } from "./SettingsPage";

const newId = () => Math.random().toString(36).slice(2, 10);

export function ChecklistsSection(_: SectionProps) {
  const lists = useChecklists();
  const [editing, setEditing] = useState<Checklist | "new" | null>(null);
  return (
    <Group title={`${lists.data?.length ?? 0} checklists`} actions={<Button variant="primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />New checklist</Button>}>
      <QueryState query={lists}>
        {(lists.data ?? []).length === 0 ? <EmptyBox title="No checklists" /> : (
          <Box>
            {lists.data!.map(c => (
              <button key={c.id} type="button" onClick={() => setEditing(c)}
                className="flex min-h-16 w-full items-center gap-3 border-b border-divider px-4 py-3 text-left last:border-b-0 hover:bg-hover">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={c.isActive ? "text-[17px] font-medium" : "text-[17px] font-medium text-ink-3"}>{c.name}</span>
                    <Badge tone="muted">{DISCIPLINE_LABELS[c.discipline]}</Badge>
                    {!c.isActive && <Badge tone="muted">Retired</Badge>}
                  </span>
                  <span className="block text-[15px] text-ink-3">{c.items.length} lines{c.description ? ` · ${c.description}` : ""}</span>
                </span>
              </button>
            ))}
          </Box>
        )}
      </QueryState>
      {editing && <ChecklistEditor list={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Group>
  );
}

function ChecklistEditor({ list, onClose }: { list: Checklist | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(list?.name ?? "");
  const [discipline, setDiscipline] = useState<Discipline>(list?.discipline ?? "fire");
  const [description, setDescription] = useState(list?.description ?? "");
  const [active, setActive] = useState(list?.isActive ?? true);
  const [items, setItems] = useState<ChecklistItem[]>(list?.items ?? [{ id: newId(), section: "General", text: "", codeRef: "" }]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sections: string[] = [];
  for (const i of items) if (!sections.includes(i.section)) sections.push(i.section);

  const update = (id: string, patch: Partial<ChecklistItem>) => setItems(xs => xs.map(x => (x.id === id ? { ...x, ...patch } : x)));
  const move = (id: string, by: -1 | 1) => setItems(xs => {
    const i = xs.findIndex(x => x.id === id);
    const j = i + by;
    if (j < 0 || j >= xs.length || xs[j].section !== xs[i].section) return xs;
    const next = [...xs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const addLine = (section: string) => setItems(xs => {
    const last = xs.map(x => x.section).lastIndexOf(section);
    const next = [...xs];
    next.splice(last + 1, 0, { id: newId(), section, text: "", codeRef: "" });
    return next;
  });
  const renameSection = (from: string, to: string) => setItems(xs => xs.map(x => (x.section === from ? { ...x, section: to } : x)));

  async function save() {
    const clean = items.filter(i => i.text.trim()).map(i => ({ ...i, text: i.text.trim(), section: i.section.trim() || "General", codeRef: i.codeRef.trim() }));
    if (!name.trim()) { toast.error("Give the checklist a name."); return; }
    setBusy(true);
    try {
      const body = { name: name.trim(), discipline, description: description || null, isActive: active, items: clean };
      if (list) await api("PATCH", `${BASE}/checklists/${list.id}`, body);
      else await api("POST", `${BASE}/checklists`, body);
      await qc.invalidateQueries({ queryKey: keys.checklists });
      toast.success("Checklist saved");
      onClose();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={list ? `Edit: ${list.name}` : "New checklist"} size="xl"
      footer={<>
        {list && <Button variant="decline" className="mr-auto" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" />Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={save}><Save className="h-5 w-5" />Save the checklist</Button>
      </>}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required><Input value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Used for">
            <Select value={discipline} onChange={e => setDiscipline(e.target.value as Discipline)}>
              {(Object.keys(DISCIPLINE_LABELS) as Discipline[]).map(d => <option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="What it's for"><Textarea value={description} onChange={e => setDescription(e.target.value)} className="min-h-[64px]" /></Field>
        <Toggle checked={active} onChange={setActive} label="In use" description="Off: kept, but not offered for new inspections." />

        {sections.map((section, si) => (
          <div key={si} className="border border-faded">
            <div className="flex items-center gap-2 bg-header px-3 py-2">
              <Input value={section} onChange={e => renameSection(section, e.target.value)} className="h-11 max-w-sm bg-black/20 font-medium" aria-label="Section name" />
              <span className="text-[14px] text-ink-3">{items.filter(i => i.section === section).length} lines</span>
            </div>
            {items.filter(i => i.section === section).map((item, idx, arr) => (
              <div key={item.id} className="flex flex-wrap items-center gap-2 border-t border-divider px-3 py-2">
                <Input value={item.text} onChange={e => update(item.id, { text: e.target.value })} placeholder="What's checked" className="min-w-64 flex-1" />
                <Input value={item.codeRef} onChange={e => update(item.id, { codeRef: e.target.value })} placeholder="Code section" className="w-40" />
                <IconButton label="Move up" disabled={idx === 0} onClick={() => move(item.id, -1)}><ArrowUp className="h-5 w-5" /></IconButton>
                <IconButton label="Move down" disabled={idx === arr.length - 1} onClick={() => move(item.id, 1)}><ArrowDown className="h-5 w-5" /></IconButton>
                <IconButton label="Remove the line" onClick={() => setItems(xs => xs.filter(x => x.id !== item.id))} className="hover:text-lightcoral"><X className="h-5 w-5" /></IconButton>
              </div>
            ))}
            <div className="border-t border-divider px-3 py-2">
              <Button size="sm" onClick={() => addLine(section)}><Plus className="h-4 w-4" />Add a line here</Button>
            </div>
          </div>
        ))}
        <Button onClick={() => setItems(xs => [...xs, { id: newId(), section: `New section ${sections.length + 1}`, text: "", codeRef: "" }])}>
          <Plus className="h-4 w-4" />Add a section
        </Button>
      </div>
      <Confirm open={deleting} danger title="Delete this checklist?" confirmLabel="Delete it" busy={busy}
        body="Inspections already done keep their copy of it. To stop offering it but keep it, switch off In use instead."
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          if (!list) return;
          setBusy(true);
          try { await api("DELETE", `${BASE}/checklists/${list.id}`); await qc.invalidateQueries({ queryKey: keys.checklists }); toast.success("Deleted"); onClose(); }
          catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }} />
    </Modal>
  );
}
