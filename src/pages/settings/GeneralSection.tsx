import { RISK } from "@/lib/inspections";
import type { CodeEdition, RiskClass } from "@/lib/types";
import { Field, Input, Segmented } from "@/components/ui";
import { Box, Group, Note, PageHead, Row } from "@/components/kit";
import { NumberBox, NumberField, type SectionProps } from "./parts";

export function GeneralSection({ form, saved, set, errors }: SectionProps) {
  const editionChanged = form.codeEdition !== saved.codeEdition;
  return (
    <>
      <PageHead title="General" sub="Your fire code edition, how often buildings are inspected, and the letterhead." />

      <Group title="Fire code">
        <Box>
          <Row>
            <span className="mb-2 block text-[15px] font-medium">Which International Fire Code your city adopted</span>
            <Segmented value={form.codeEdition} onChange={(v: CodeEdition) => set("codeEdition", v)}
              options={[{ value: "2018", label: "2018 edition" }, { value: "2021", label: "2021 edition" }]} />
            <Note className="mt-2">
              Section numbers moved between the two (exits are 1031 in 2018 and 1032 in 2021). Switching changes the code sections
              on your checklists and violation codes to match. Any section you typed in yourself is left alone.
            </Note>
            {editionChanged && <p className="mt-2 text-[15px] text-orange">Saving will renumber your checklists and violation codes to the {form.codeEdition} edition.</p>}
          </Row>
        </Box>
      </Group>

      <Group title="How often buildings are inspected" hint="By the risk class set on each business (NFPA 1730). A business can have its own frequency instead.">
        <Box>
          {(Object.keys(RISK) as RiskClass[]).map(r => {
            const error = errors[`frequencyMonths.${r}`];
            return (
              <Row key={r} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="text-[17px] font-medium">{RISK[r].label}</div>
                  <div className="text-[14px] text-ink-3">{RISK[r].help.replace(/ Inspected every.*$/, "")}</div>
                </div>
                <div>
                  <NumberBox label={`${RISK[r].label}: months between inspections`} unit="months" min={1} max={120} error={error}
                    value={form.frequencyMonths[r]} onChange={v => set("frequencyMonths", { ...form.frequencyMonths, [r]: v })} />
                  {error && <p className="mt-1 text-[14px] text-lightcoral">{error}</p>}
                </div>
              </Row>
            );
          })}
        </Box>
      </Group>

      <Group title="Violations">
        <Box>
          <Row>
            <NumberField
              label="Days to fix a minor violation" unit="days" min={0} max={365} error={errors.defaultComplianceDays}
              hint="When the violation code doesn't say. Immediate dangers are due the same day, critical ones in a day, serious ones in two weeks."
              value={form.defaultComplianceDays} onChange={v => set("defaultComplianceDays", v)}
            />
          </Row>
        </Box>
      </Group>

      <Group title="Letterhead" hint={`Printed under ${saved.org.name} on reports, notices and permits. The department's name, logo, address and phone come from the Department Portal.`}>
        <Box>
          <Row>
            <Field label="Office name">
              <Input value={form.officeName ?? ""} maxLength={120} placeholder="Office of the Fire Marshal" onChange={e => set("officeName", e.target.value || null)} className="max-w-xl" />
            </Field>
          </Row>
        </Box>
      </Group>
    </>
  );
}
