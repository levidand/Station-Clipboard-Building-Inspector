import { RISK } from "@/lib/inspections";
import type { CodeEdition, RiskClass } from "@/lib/types";
import { Field, Input, Segmented } from "@/components/ui";
import { Box, Group, Note, Row } from "@/components/kit";
import { SaveBar, useSettingsDraft, type SectionProps } from "./SettingsPage";

export function GeneralSection({ settings }: SectionProps) {
  const d = useSettingsDraft(settings, ["officeName", "codeEdition", "frequencyMonths", "defaultComplianceDays"]);
  const editionChanged = d.draft.codeEdition !== settings.codeEdition;
  return (
    <div className="space-y-8">
      <Group title="Fire code">
        <Box>
          <Row>
            <span className="mb-2 block text-[15px] font-medium">Which International Fire Code your city adopted</span>
            <Segmented value={d.draft.codeEdition} onChange={(v: CodeEdition) => d.set("codeEdition", v)}
              options={[{ value: "2018", label: "2018 edition" }, { value: "2021", label: "2021 edition" }]} />
            <Note className="mt-2">
              Section numbers moved between the two (exits are 1031 in 2018 and 1032 in 2021). Switching changes the code sections
              on your checklists and violation codes to match. Any section you typed in yourself is left alone.
            </Note>
            {editionChanged && <p className="mt-2 text-[15px] text-orange">Saving will renumber your checklists and violation codes to the {d.draft.codeEdition} edition.</p>}
          </Row>
        </Box>
      </Group>

      <Group title="How often buildings are inspected" hint="By the risk class set on each business (NFPA 1730). A business can have its own frequency instead.">
        <Box>
          {(Object.keys(RISK) as RiskClass[]).map(r => (
            <Row key={r} className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1 basis-64">
                <div className="text-[17px] font-medium">{RISK[r].label}</div>
                <div className="text-[14px] text-ink-3">{RISK[r].help.replace(/ Inspected every.*$/, "")}</div>
              </div>
              <span className="flex items-center gap-3">
                <Input type="number" inputMode="numeric" min={1} max={120} className="w-28 tabular-nums"
                  value={d.draft.frequencyMonths[r]}
                  onChange={e => d.set("frequencyMonths", { ...d.draft.frequencyMonths, [r]: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })} />
                <span className="text-[16px] text-ink-2">months</span>
              </span>
            </Row>
          ))}
        </Box>
      </Group>

      <Group title="Violations">
        <Box>
          <Row>
            <Field label="Days to fix a minor violation" hint="When the violation code doesn't say. Immediate dangers are due the same day, critical ones in a day, serious ones in two weeks.">
              <span className="flex items-center gap-3">
                <Input type="number" inputMode="numeric" min={0} max={365} className="w-28 tabular-nums" value={d.draft.defaultComplianceDays}
                  onChange={e => d.set("defaultComplianceDays", Math.max(0, Math.min(365, Number(e.target.value) || 0)))} />
                <span className="text-[16px] text-ink-2">days</span>
              </span>
            </Field>
          </Row>
        </Box>
      </Group>

      <Group title="Letterhead" hint={`Printed under ${settings.org.name} on reports, notices and permits. The department's name, logo, address and phone come from the Department Portal.`}>
        <Box>
          <Row>
            <Field label="Office name">
              <Input value={d.draft.officeName ?? ""} placeholder="Office of the Fire Marshal" onChange={e => d.set("officeName", e.target.value || null)} />
            </Field>
          </Row>
        </Box>
      </Group>

      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onReset={d.reset} />
    </div>
  );
}
