import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { addDays, formatDay, todayKey } from "@/lib/format";
import { RESULT } from "@/lib/inspections";
import type { ChecklistAnswer, InspectionResult, Violation } from "@/lib/types";
import { Button, Checkbox, Field, Input, Modal, cx, TONE_TEXT } from "@/components/ui";
import { PersonSelect } from "@/components/records";

export interface FinishChoice {
  result: InspectionResult;
  reinspectOn: string | null;
  reinspectAssignedUserId: number | null;
}

/** What the result most likely is: anything failed or written is a fail, gaps make it partial. */
export function suggestResult(items: ChecklistAnswer[], openViolations: number): InspectionResult {
  const failed = items.some(i => i.result === "fail");
  const open = items.some(i => i.result === null);
  const answered = items.some(i => i.result !== null);
  if (failed || openViolations > 0) return "fail";
  if (open && answered) return "partial";
  return "pass";
}

/**
 * The last step. Says what was found in plain numbers, offers the result that
 * fits (it can be changed), and books the re-inspection on the day the first
 * violation is due, so nobody has to remember to.
 */
export function FinishDialog({ open, onClose, onFinish, items, openViolations, assignedUserId, busy }: {
  open: boolean; onClose: () => void; onFinish: (c: FinishChoice) => void; items: ChecklistAnswer[];
  openViolations: Violation[]; assignedUserId: number | null; busy: boolean;
}) {
  if (!open) return null;
  return <FinishForm onClose={onClose} onFinish={onFinish} items={items} openViolations={openViolations} assignedUserId={assignedUserId} busy={busy} />;
}

function FinishForm({ onClose, onFinish, items, openViolations, assignedUserId, busy }: {
  onClose: () => void; onFinish: (c: FinishChoice) => void; items: ChecklistAnswer[];
  openViolations: Violation[]; assignedUserId: number | null; busy: boolean;
}) {
  const today = todayKey();
  const tally = {
    ok: items.filter(i => i.result === "ok").length,
    fail: items.filter(i => i.result === "fail").length,
    na: items.filter(i => i.result === "na").length,
    open: items.filter(i => i.result === null).length,
  };
  const [result, setResult] = useState<InspectionResult>(suggestResult(items, openViolations.length));
  // The re-check goes on the day the first violation is due (never today itself).
  const firstDue = openViolations.map(v => v.dueOn).filter((d): d is string => !!d).sort()[0];
  const defaultDay = firstDue && firstDue > today ? firstDue : addDays(today, firstDue ? 1 : 30);
  const [book, setBook] = useState(openViolations.length > 0 || result === "partial" || result === "no_access" || result === "not_ready");
  const [day, setDay] = useState(defaultDay);
  const [who, setWho] = useState<number | null>(assignedUserId);

  return (
    <Modal
      open onClose={onClose} title="Finish the inspection" size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Not yet</Button>
        <Button variant="ok" size="lg" loading={busy} onClick={() => onFinish({ result, reinspectOn: book ? day : null, reinspectAssignedUserId: book ? who : null })}>
          <CheckCircle2 className="h-5 w-5" />Finish inspection
        </Button>
      </>}
    >
      <div className="space-y-6">
        {items.length > 0 && (
          <p className="text-[17px] leading-7">
            <span className={TONE_TEXT.ok}>{tally.ok} passed</span>, <span className={TONE_TEXT.danger}>{tally.fail} failed</span>,{" "}
            {tally.na} not applicable
            {tally.open > 0 && <>, and <b className="text-orange">{tally.open} not checked</b> (they print as not checked)</>}.
            {" "}{openViolations.length > 0 ? `${openViolations.length} violation${openViolations.length === 1 ? " is" : "s are"} open.` : "No violations open."}
          </p>
        )}

        <div>
          <span className="mb-2 block text-[15px] font-medium">How did it come out?</span>
          <div className="space-y-2">
            {(Object.keys(RESULT) as InspectionResult[]).map(r => (
              <button
                key={r} type="button" onClick={() => setResult(r)} aria-pressed={result === r}
                className={cx(
                  "flex w-full items-start gap-3 border px-4 py-3 text-left transition-colors",
                  result === r ? "border-blue bg-blue/20" : "border-faded bg-odd hover:bg-hover",
                )}
              >
                <span className={cx("mt-1 h-5 w-5 shrink-0 rounded-full border-2", result === r ? "border-sky bg-sky" : "border-ink-3")} />
                <span>
                  <span className={cx("block text-[17px] font-medium", TONE_TEXT[RESULT[r].tone])}>{RESULT[r].label}</span>
                  <span className="block text-[15px] text-ink-3">{RESULT[r].help}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-divider pt-5">
          <Checkbox checked={book} onChange={setBook}>
            <span className="text-[17px]">Book the re-inspection now</span>
          </Checkbox>
          {book && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Re-inspect on" hint={day ? formatDay(day) : undefined}>
                <Input type="date" value={day} onChange={e => setDay(e.target.value)} />
              </Field>
              <Field label="Re-inspected by">
                <PersonSelect value={who} onChange={setWho} />
              </Field>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
