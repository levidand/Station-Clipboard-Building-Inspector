import { Field, Input, Textarea } from "@/components/ui";
import { Box, Group, Row } from "@/components/kit";
import { SaveBar, useSettingsDraft, type SectionProps } from "./SettingsPage";

export function LetterSection({ settings }: SectionProps) {
  const d = useSettingsDraft(settings, ["letter"]);
  const l = d.draft.letter;
  const set = (patch: Partial<typeof l>) => d.set("letter", { ...l, ...patch });
  return (
    <div className="space-y-5">
      <Group title="The notice" hint="The list of violations, the dates to correct them and the re-inspection date are filled in between the opening and the closing.">
        <Box>
          <Row><Field label="Heading"><Input value={l.heading} onChange={e => set({ heading: e.target.value })} /></Field></Row>
          <Row><Field label="Opening paragraph"><Textarea value={l.intro} onChange={e => set({ intro: e.target.value })} className="min-h-[120px]" /></Field></Row>
          <Row><Field label="Closing paragraph"><Textarea value={l.closing} onChange={e => set({ closing: e.target.value })} className="min-h-[120px]" /></Field></Row>
          <Row><Field label="Signed as" hint="The title under the signature line."><Input value={l.signatureTitle} onChange={e => set({ signatureTitle: e.target.value })} /></Field></Row>
        </Box>
      </Group>
      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onReset={d.reset} />
    </div>
  );
}
