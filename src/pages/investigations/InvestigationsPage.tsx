import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FilePlus2, Lock, Siren } from "lucide-react";
import { api, errorMessage, get } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, fromLocalInput, toLocalInput } from "@/lib/format";
import { BASE, CAUSE_CLASS, INVESTIGATION_STATUS, keys, useRefreshAll } from "@/lib/inspections";
import type { CommandIncident, InvestigationDetail, InvestigationRow } from "@/lib/types";
import { Badge, Button, Field, Input, Modal, Select } from "@/components/ui";
import { EmptyBox, FilterBar, Group, ListRow, PAGE, PageHead, PagedBox, QueryState } from "@/components/kit";
import { NO_PLACE, PersonSelect, PlacePicker, type Place } from "@/components/records";
import { toast } from "@/components/toast";

export const PROPERTY_TYPES = ["Structure", "Vehicle", "Outside / vegetation", "Trash or rubbish", "Other"];

export function InvestigationsPage() {
  const [status, setStatus] = useState<"open" | "closed" | "all">("open");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const params = new URLSearchParams({ status, ...(q.trim() ? { q: q.trim() } : {}) });
  const list = useQuery({
    queryKey: [...keys.investigations, params.toString()],
    queryFn: ({ signal }) => get<InvestigationRow[]>(`${BASE}/investigations?${params}`, signal),
    placeholderData: prev => prev,
  });
  const rows = list.data ?? [];
  return (
    <div className={PAGE}>
      <PageHead title="Fire investigations" sub="Origin and cause, evidence and interviews. Only members with the investigations permission can see these.">
        <Button variant="primary" size="lg" onClick={() => setAdding(true)}><FilePlus2 className="h-5 w-5" />Open an investigation</Button>
      </PageHead>
      <div className="flex items-center gap-3 border border-faded bg-odd px-4 py-3 text-[16px]">
        <Lock className="h-5 w-5 shrink-0 text-orange" />
        Confidential. Witnesses, suspects and evidence are recorded here; don't share what's on these pages outside the investigation.
      </div>
      <FilterBar search={{ value: q, onChange: setQ, placeholder: "Number, title, address or incident number" }} filters={[
        { label: "Status", value: status, empty: "open", onChange: setStatus, options: [
          { value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" },
        ] },
      ]} />
      <QueryState query={list}>
        {rows.length === 0 ? <EmptyBox title={status === "open" ? "No open investigations" : "Nothing here"} /> : (
          <Group title={`${status === "open" ? "Open" : status === "closed" ? "Closed" : "All"} investigations (${rows.length})`}>
            <PagedBox rows={rows} resetKey={params.toString()} render={r => (
                <ListRow key={r.id} href={`/investigations/${r.id}`} title={r.title}
                  tags={<>
                    <Badge tone={INVESTIGATION_STATUS[r.status].tone}>{INVESTIGATION_STATUS[r.status].label}</Badge>
                    {r.causeClass && <Badge tone={r.causeClass === "incendiary" ? "danger" : "muted"}>{CAUSE_CLASS[r.causeClass].label}</Badge>}
                  </>}
                  detail={[r.number, r.address, r.occurredAt ? dateTime(r.occurredAt, true) : null, r.incidentNumber ? `incident ${r.incidentNumber}` : null, r.leadName].filter(Boolean).join(" · ")} />
            )} />
          </Group>
        )}
      </QueryState>
      <NewInvestigation open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function NewInvestigation({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <NewForm onClose={onClose} />;
}

function NewForm({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const refresh = useRefreshAll();
  const [, navigate] = useLocation();
  const calls = useQuery({
    queryKey: [BASE, "command-incidents"],
    queryFn: ({ signal }) => get<CommandIncident[]>(`${BASE}/command-incidents?days=120`, signal),
  });
  const [title, setTitle] = useState("");
  const [occurred, setOccurred] = useState("");
  const [incidentNumber, setIncidentNumber] = useState("");
  const [commandIncidentId, setCommandIncidentId] = useState<number | null>(null);
  const [place, setPlace] = useState<Place>(NO_PLACE);
  const [propertyType, setPropertyType] = useState(PROPERTY_TYPES[0]);
  const [lead, setLead] = useState<number | null>(session?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fromCall(c: CommandIncident) {
    setCommandIncidentId(c.id);
    setTitle(c.title);
    setOccurred(toLocalInput(c.startedAt));
    setIncidentNumber(c.cadIncidentNumber ?? c.incidentNumber ?? "");
    if (c.address) setPlace({ preplanId: null, placeName: null, address: c.address, latitude: c.latitude, longitude: c.longitude });
  }

  async function save() {
    if (!title.trim()) { setError("Give the investigation a title."); return; }
    if (!place.preplanId && !place.address?.trim()) { setError("Say where the fire was."); return; }
    setBusy(true);
    setError(null);
    try {
      const row = await api<InvestigationDetail>("POST", `${BASE}/investigations`, {
        title: title.trim(), occurredAt: occurred ? fromLocalInput(occurred) : null, incidentNumber: incidentNumber || null,
        commandIncidentId, preplanId: place.preplanId, placeName: place.placeName, address: place.address,
        latitude: place.latitude, longitude: place.longitude, propertyType, leadUserId: lead,
      });
      void refresh();
      toast.success(`Investigation ${row.number} opened`);
      onClose();
      navigate(`/investigations/${row.id}`);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }

  const fires = (calls.data ?? []).filter(c => /fire|alarm|smoke/i.test(`${c.incidentTypeCode} ${c.title}`));
  return (
    <Modal open onClose={onClose} title="Open an investigation" size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={save}>Open the investigation</Button>
      </>}
    >
      <div className="space-y-5">
        {fires.length > 0 && (
          <Field label="Start from a call in the Command Portal (optional)" hint="Fills in the title, time, address and incident number.">
            <Select value={commandIncidentId ?? ""} onChange={e => { const c = fires.find(x => x.id === Number(e.target.value)); if (c) fromCall(c); else setCommandIncidentId(null); }}>
              <option value="">No, start blank</option>
              {fires.map(c => <option key={c.id} value={c.id}>{dateTime(c.startedAt)} · {c.title}{c.address ? ` · ${c.address}` : ""}</option>)}
            </Select>
          </Field>
        )}
        {commandIncidentId && <p className="flex items-center gap-2 text-[15px] text-ink-3"><Siren className="h-4 w-4" />Linked to the Command Portal incident.</p>}
        <Field label="Title" required><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Kitchen fire, 412 Oak St" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When the fire happened"><Input type="datetime-local" value={occurred} onChange={e => setOccurred(e.target.value)} /></Field>
          <Field label="Incident number (CAD or NERIS)"><Input value={incidentNumber} onChange={e => setIncidentNumber(e.target.value)} /></Field>
          <Field label="What burned">
            <Select value={propertyType} onChange={e => setPropertyType(e.target.value)}>{PROPERTY_TYPES.map(p => <option key={p}>{p}</option>)}</Select>
          </Field>
          <Field label="Lead investigator"><PersonSelect value={lead} onChange={setLead} prefer="investigates" /></Field>
        </div>
        <PlacePicker value={place} onChange={setPlace} />
        {error && <p role="alert" className="text-[16px] text-lightcoral">{error}</p>}
      </div>
    </Modal>
  );
}
