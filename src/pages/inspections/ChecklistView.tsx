import { useMemo, useState } from "react";
import { CheckCheck, FilePlus2, MessageSquarePlus } from "lucide-react";
import type { ChecklistAnswer, Violation } from "@/lib/types";
import { Badge, Button, Segmented, Textarea, TONE_EDGE, cx } from "@/components/ui";
import { Box, Group, Note } from "@/components/kit";

const ANSWERS = [
  { value: "ok" as const, label: "Pass", tone: "ok" as const },
  { value: "fail" as const, label: "Fail", tone: "danger" as const },
  { value: "na" as const, label: "N/A", tone: "muted" as const },
];

/**
 * The checklist, a section at a time. Each line gets three big buttons, Pass,
 * Fail and N/A, sized for a thumb in a glove. Failing a line offers to write
 * the violation straight away, filled in from the code library. "Mark the rest
 * passed" answers every line left in a section at once, for the building where
 * there is nothing wrong.
 */
export function ChecklistView({ items, onChange, editable, violations, onWriteViolation }: {
  items: ChecklistAnswer[]; onChange: (items: ChecklistAnswer[]) => void; editable: boolean;
  violations: Violation[]; onWriteViolation: (item: ChecklistAnswer) => void;
}) {
  const sections = useMemo(() => {
    const order: string[] = [];
    const by = new Map<string, ChecklistAnswer[]>();
    for (const item of items) {
      const s = item.section || "Checklist";
      if (!by.has(s)) { by.set(s, []); order.push(s); }
      by.get(s)!.push(item);
    }
    return order.map(s => ({ name: s, items: by.get(s)! }));
  }, [items]);
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set());

  const update = (id: string, patch: Partial<ChecklistAnswer>) =>
    onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)));
  const passRest = (section: string) =>
    onChange(items.map(i => ((i.section || "Checklist") === section && i.result === null ? { ...i, result: "ok" } : i)));

  if (!items.length) {
    return <Note>This inspection has no checklist. Write what you found in the notes, and add violations below.</Note>;
  }

  return (
    <div className="space-y-6">
      {sections.map(section => {
        const done = section.items.filter(i => i.result !== null).length;
        const failed = section.items.filter(i => i.result === "fail").length;
        return (
          <Group
            key={section.name}
            title={<span className="flex items-center gap-2">{section.name}<span className="normal-case tracking-normal text-ink-3">· {done} of {section.items.length} done</span></span>}
            actions={editable && done < section.items.length
              ? <Button size="sm" onClick={() => passRest(section.name)}><CheckCheck className="h-4 w-4" />Mark the rest passed</Button>
              : failed > 0 ? <Badge tone="danger">{failed} failed</Badge> : null}
          >
            <Box>
              {section.items.map(item => {
                const written = item.codeRef && violations.some(v => v.codeRef === item.codeRef);
                const showNote = notesOpen.has(item.id) || !!item.note || item.result === "fail";
                return (
                  <div key={item.id} className={cx(
                    "border-b border-l-4 border-b-divider px-4 py-3.5 last:border-b-0",
                    item.result === "fail" ? TONE_EDGE.danger : item.result === "ok" ? TONE_EDGE.ok : item.result === "na" ? TONE_EDGE.muted : "border-l-transparent",
                  )}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="text-[17px] leading-6 text-ink">{item.text}</div>
                        {item.codeRef && <div className="text-[14px] text-ink-3">{item.codeRef}</div>}
                      </div>
                      {editable ? (
                        <Segmented
                          size="lg" value={item.result}
                          onChange={r => {
                            update(item.id, { result: item.result === r ? null : r });
                            if (r === "fail" && item.result !== "fail" && !written) onWriteViolation(item);
                          }}
                          options={ANSWERS}
                          className="shrink-0"
                        />
                      ) : (
                        <Badge tone={item.result === "ok" ? "ok" : item.result === "fail" ? "danger" : "muted"} className="self-start md:self-center">
                          {item.result === "ok" ? "Pass" : item.result === "fail" ? "Fail" : item.result === "na" ? "N/A" : "Not checked"}
                        </Badge>
                      )}
                    </div>
                    {(editable || item.note) && (
                      <div className="mt-2 flex flex-wrap items-start gap-2">
                        {item.result === "fail" && (written
                          ? <Badge tone="warn">Violation written</Badge>
                          : editable && <Button size="sm" variant="warn" onClick={() => onWriteViolation(item)}><FilePlus2 className="h-4 w-4" />Write the violation</Button>)}
                        {editable && !showNote && (
                          <Button size="sm" variant="ghost" onClick={() => setNotesOpen(s => new Set(s).add(item.id))}>
                            <MessageSquarePlus className="h-4 w-4" />Add a note
                          </Button>
                        )}
                      </div>
                    )}
                    {showNote && (editable ? (
                      <Textarea
                        value={item.note} placeholder="What you saw" className="mt-2 min-h-[64px]"
                        onChange={e => update(item.id, { note: e.target.value })}
                      />
                    ) : item.note ? <p className="mt-1.5 whitespace-pre-line text-[15px] text-ink-2">{item.note}</p> : null)}
                  </div>
                );
              })}
            </Box>
          </Group>
        );
      })}
    </div>
  );
}
