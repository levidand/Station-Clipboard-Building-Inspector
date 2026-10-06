import { Field, Input, Textarea } from "@/components/ui";
import { Box, Group, PageHead, Row } from "@/components/kit";
import type { SectionProps } from "./parts";

export function LetterSection({ form, set }: SectionProps) {
  const l = form.letter;
  const put = (patch: Partial<typeof l>) => set("letter", { ...l, ...patch });
  return (
    <>
      <PageHead title="Notice wording" sub="The words printed around the list of violations on a Notice of Violation." />
      <Group title="The notice" hint="The list of violations, the dates to correct them and the re-inspection date are filled in between the opening and the closing.">
        <Box>
          <Row><Field label="Heading"><Input value={l.heading} maxLength={120} onChange={e => put({ heading: e.target.value })} className="max-w-xl" /></Field></Row>
          <Row><Field label="Opening paragraph"><Textarea value={l.intro} maxLength={3000} onChange={e => put({ intro: e.target.value })} className="min-h-[120px]" /></Field></Row>
          <Row><Field label="Closing paragraph"><Textarea value={l.closing} maxLength={3000} onChange={e => put({ closing: e.target.value })} className="min-h-[120px]" /></Field></Row>
          <Row><Field label="Signed as" hint="The title under the signature line."><Input value={l.signatureTitle} maxLength={120} onChange={e => put({ signatureTitle: e.target.value })} className="max-w-xl" /></Field></Row>
        </Box>
      </Group>
    </>
  );
}
