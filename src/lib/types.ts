// What /api/inspections answers with. Hand-kept in step with the Department
// Portal's routes/inspections*.ts and lib/db/src/schema/inspections.ts, the
// way the Command Portal's lib/ic.ts mirrors Incident Command. A field added
// there is optional here until both sides ship it.

export type Discipline = "fire" | "building" | "code" | "event";
export type InspectionStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type InspectionResult = "pass" | "fail" | "partial" | "no_access" | "not_ready";
export type RiskClass = "high" | "moderate" | "low" | "critical";
export type Severity = "imminent" | "critical" | "serious" | "minor";
export type ViolationStatus = "open" | "corrected" | "cited" | "void";
export type PermitCategory = "operational" | "construction" | "building" | "event";
export type PermitStatus = "applied" | "in_review" | "corrections" | "approved" | "issued" | "finaled" | "denied" | "expired" | "void";
export type CaseStatus = "open" | "investigating" | "notice" | "cited" | "abatement" | "closed";
export type CaseResolution = "complied" | "abated" | "unfounded" | "duplicate" | "referred" | "other";
export type CaseSource = "complaint" | "observed" | "referral";
export type CasePriority = "high" | "normal" | "low";
export type EventKind = "special_event" | "fireworks" | "public_education" | "station_tour" | "smoke_alarms" | "standby" | "other";
export type EventStatus = "planning" | "approved" | "completed" | "cancelled";
export type InvestigationStatus = "open" | "pending" | "closed";
export type CauseClass = "accidental" | "natural" | "incendiary" | "undetermined";
export type CodeEdition = "2018" | "2021";
export type DueState = "overdue" | "due_soon" | "current" | "none";

export interface FileRef { key: string; name: string; contentType: string; size: number; uploadedAt: string; uploadedBy: string | null }
export interface HistoryLine { at: string; by: string | null; text: string; kind: "change" | "note" }

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface InspectionTypeDef { key: string; label: string; discipline: Discipline; checklistId: number | null; active: boolean; routine?: boolean }
export interface PermitTypeDef { key: string; label: string; category: PermitCategory; feeCents: number | null; validDays: number | null; active: boolean }
export interface CaseTypeDef { key: string; label: string; complianceDays: number; active: boolean }
export interface ViolationCode {
  id: string; code: string; title: string; description: string; correctiveAction: string;
  severity: Severity; complianceDays: number; active: boolean;
}
export interface FeeDef { key: string; label: string; amountCents: number }
export interface NoticeLetter { heading: string; intro: string; closing: string; signatureTitle: string }

export interface Settings {
  officeName: string | null;
  frequencyMonths: Record<RiskClass, number>;
  defaultComplianceDays: number;
  codeEdition: CodeEdition;
  inspectionTypes: InspectionTypeDef[];
  permitTypes: PermitTypeDef[];
  caseTypes: CaseTypeDef[];
  violationCodes: ViolationCode[];
  fees: FeeDef[];
  letter: NoticeLetter;
  org: { name: string; shortName: string | null; logoUrl: string | null; address: string | null; phone: string | null; timezone: string };
  updatedAt: string | null;
}

export interface ChecklistItem { id: string; section: string; text: string; codeRef: string }
export interface ChecklistAnswer extends ChecklistItem { result: "ok" | "fail" | "na" | null; note: string }
export interface Checklist {
  id: number; name: string; discipline: Discipline; description: string | null; items: ChecklistItem[];
  isActive: boolean; sortOrder: number;
}

export interface Person { id: number; name: string; avatarUrl: string | null; inspects: boolean; enforces: boolean; investigates: boolean }

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------

export interface PropertyRow {
  preplanId: number; name: string; address: string; latitude: number | null; longitude: number | null;
  occupancyType: string | null; preplanNumber: string | null; firstDueStation: string | null;
  tenancy: string | null; masterPreplanId: number | null; targetHazard: string | null; buildingStatus: string | null;
  hasProgram: boolean; onProgram: boolean; occupancyClass: string | null; riskClass: RiskClass | null;
  nextDueOn: string | null; lastInspectedOn: string | null; dueState: DueState; openViolations: number;
}

export interface PreplanContact { name: string; role: string; phone: string; altPhone?: string; email?: string; keyHolder?: boolean }
export interface PreplanVisit { date: string; kind: string; by: string; notes: string }

export interface PropertyDetail extends PropertyRow {
  today: string;
  frequencyMonths: number | null;
  effectiveFrequencyMonths: number;
  ownerName: string | null; ownerPhone: string | null; ownerEmail: string | null; ownerMailingAddress: string | null;
  businessLicense: string | null; notes: string | null;
  preplan: {
    phone: string | null; emergencyContacts: PreplanContact[]; constructionType: string;
    floorsAbove: number | null; floorsBelow: number | null; squareFeet: number | null;
    occupantLoadDay: number | null; occupantLoadNight: number | null; hoursOccupied: string | null;
    hasSprinklers: boolean; sprinklerCoverage: string | null; sprinklerSystem: string | null; sprinklerRoom: string | null;
    hasStandpipe: boolean; standpipeClass: string | null; hasFireAlarm: boolean; fireAlarmPanel: string | null;
    fdcLocation: string | null; knoxBoxLocation: string | null; firePump: { location: string } | null;
    waterShutoff: string | null; gasShutoff: string | null; electricShutoff: string | null;
    hazards: string | null; specialHazards: string[]; hazmatNotes: string | null;
    accessNotes: string | null; accessProblems: string | null; visits: PreplanVisit[];
    lastInspectedAt: string | null; updatedAt: string;
  };
  tenants: { id: number; name: string; address: string }[];
  master: { id: number; name: string; address: string } | null;
  inspections: InspectionRow[];
  violations: Violation[];
  permits: PermitRow[];
  cases: CaseRow[];
}

// ---------------------------------------------------------------------------
// Inspections and violations
// ---------------------------------------------------------------------------

export interface InspectionRow {
  id: number; number: string; discipline: Discipline; typeKey: string; status: InspectionStatus; result: InspectionResult | null;
  scheduledOn: string | null; scheduledTime: string | null; placeName: string | null; address: string; preplanId: number | null;
  latitude: number | null; longitude: number | null;
  assignedUserId: number | null; assignedName?: string | null; completedAt: string | null;
  parentId: number | null; permitId: number | null; caseId: number | null; eventId: number | null; createdAt: string;
  openViolations?: number;
}

export interface Violation {
  id: number; inspectionId: number | null; caseId: number | null; preplanId: number | null; placeName: string | null; address: string;
  codeRef: string | null; title: string; description: string | null; location: string | null; correctiveAction: string | null;
  severity: Severity; dueOn: string | null; status: ViolationStatus; resolvedOn: string | null; resolvedByUserId: number | null;
  clearedByInspectionId: number | null; resolutionNote: string | null; attachments: FileRef[]; createdAt: string; overdue: boolean;
  inspectionNumber?: string | null;
}

export interface InspectionDetail extends InspectionRow {
  checklistId: number | null;
  checklist: ChecklistAnswer[];
  notes: string | null;
  contactName: string | null; contactTitle: string | null;
  signature: string | null; signedName: string | null; signedAt: string | null;
  feeCents: number | null; feePaid: boolean;
  startedAt: string | null; completedByName: string | null; cancelReason: string | null;
  attachments: FileRef[]; history: HistoryLine[];
  today: string;
  tally: { ok: number; fail: number; na: number; open: number; total: number };
  violations: Violation[];
  carriedViolations: Violation[];
  property: {
    occupancyClass: string | null; riskClass: RiskClass | null; ownerName: string | null; ownerPhone: string | null;
    ownerMailingAddress: string | null; nextDueOn: string | null; lastInspectedOn: string | null;
  } | null;
  reinspections: InspectionRow[];
  permit: { id: number; number: string; typeKey: string; status: PermitStatus } | null;
  case: { id: number; number: string; typeKey: string; status: CaseStatus } | null;
  event: { id: number; number: string; title: string; status: EventStatus } | null;
  parent: { id: number; number: string; result: InspectionResult | null; completedAt: string | null } | null;
}

export interface NewViolation {
  codeRef?: string | null; title: string; description?: string | null; location?: string | null;
  correctiveAction?: string | null; severity: Severity; dueOn?: string | null; complianceDays?: number | null;
}

// ---------------------------------------------------------------------------
// Permits, complaints, events, investigations
// ---------------------------------------------------------------------------

export interface PermitRow {
  id: number; number: string; typeKey: string; category: PermitCategory; status: PermitStatus; placeName: string | null;
  address: string; preplanId: number | null; applicantName: string | null; applicantCompany: string | null;
  appliedOn: string | null; issuedOn: string | null; expiresOn: string | null; feeCents: number | null; feePaid: boolean;
  reviewerUserId: number | null; reviewerName?: string | null; eventId: number | null; createdAt: string;
}

export interface PermitReview { id: string; at: string; by: string | null; outcome: "approved" | "corrections" | "denied" | "comment"; comments: string }

export interface PermitDetail extends PermitRow {
  latitude: number | null; longitude: number | null;
  applicantPhone: string | null; applicantEmail: string | null; description: string | null; valuationCents: number | null;
  finaledOn: string | null; conditions: string | null; reviews: PermitReview[];
  attachments: FileRef[]; history: HistoryLine[]; createdByName: string | null;
  inspections: InspectionRow[];
  event: { id: number; number: string; title: string; startsAt: string } | null;
  today: string;
}

export interface CaseRow {
  id: number; number: string; typeKey: string; source: CaseSource; status: CaseStatus; priority: CasePriority;
  resolution: CaseResolution | null; placeName: string | null; address: string; preplanId: number | null;
  latitude: number | null; longitude: number | null;
  assignedUserId: number | null; assignedName?: string | null; dueOn: string | null; receivedAt: string; closedAt: string | null;
  overdue?: boolean;
}

export interface CaseNotice { id: string; sentOn: string; method: string; dueOn: string | null; note: string; by: string | null }

export interface CaseDetail extends CaseRow {
  description: string | null;
  complainantName: string | null; complainantPhone: string | null; complainantEmail: string | null;
  anonymous: boolean; complainantHidden: boolean;
  ownerName: string | null; ownerMailingAddress: string | null;
  notices: CaseNotice[]; attachments: FileRef[]; history: HistoryLine[];
  violations: Violation[]; inspections: InspectionRow[];
  today: string;
}

export interface EventTask { id: string; text: string; done: boolean; doneBy: string | null; doneAt: string | null }
export interface EventStandby { fire: boolean; ems: boolean; units: string; personnel: number | null; notes: string }

export interface EventRow {
  id: number; number: string; title: string; kind: EventKind; status: EventStatus; startsAt: string; endsAt: string;
  locationName: string | null; address: string | null; latitude: number | null; longitude: number | null;
  expectedAttendance: number | null; tasksDone: number; tasksTotal: number; staffCount: number;
}

export interface EventDetail extends Omit<EventRow, "tasksDone" | "tasksTotal" | "staffCount"> {
  preplanId: number | null;
  organizerName: string | null; organizerOrg: string | null; organizerPhone: string | null; organizerEmail: string | null;
  occupantLoad: number | null; crowdManagers: number | null; crowdManagersNeeded: number;
  features: string[]; standby: EventStandby | null; staffUserIds: number[]; staff: { id: number; name: string }[];
  tasks: EventTask[]; notes: string | null; actualAttendance: number | null; smokeAlarmsInstalled: number | null;
  report: string | null; showOnCalendar: boolean;
  attachments: FileRef[]; history: HistoryLine[];
  permits: PermitRow[]; inspections: InspectionRow[];
  today: string;
}

export interface EvidenceCustody { at: string; from: string; to: string; purpose: string }
export interface EvidenceItem {
  id: string; number: string; description: string; location: string; collectedBy: string; collectedAt: string | null;
  status: "held" | "lab" | "released" | "destroyed"; custody: EvidenceCustody[];
}
export interface Interview { id: string; name: string; role: string; phone: string; at: string | null; summary: string }

export interface InvestigationRow {
  id: number; number: string; title: string; status: InvestigationStatus; occurredAt: string | null; address: string;
  placeName: string | null; causeClass: CauseClass | null; leadUserId: number | null; leadName: string | null; incidentNumber: string | null;
}

export interface InvestigationDetail extends InvestigationRow {
  commandIncidentId: number | null; preplanId: number | null; latitude: number | null; longitude: number | null;
  propertyType: string | null; areaOfOrigin: string | null; heatSource: string | null; firstItemIgnited: string | null;
  nerisCause: string | null; causeNotes: string | null; lossCents: number | null; injuries: number | null; fatalities: number | null;
  narrative: string | null; evidence: EvidenceItem[]; interviews: Interview[]; referral: string | null; arrestMade: boolean;
  closedAt: string | null; attachments: FileRef[]; history: HistoryLine[]; createdAt: string;
}

export interface CommandIncident {
  id: number; title: string; commandName: string | null; incidentNumber: string | null; cadIncidentNumber: string | null;
  incidentTypeCode: string; address: string | null; latitude: number | null; longitude: number | null; startedAt: string; state: string;
}

// ---------------------------------------------------------------------------
// Today, the map, search
// ---------------------------------------------------------------------------

export interface Today {
  today: string;
  mine: InspectionRow[];
  todays: InspectionRow[];
  counts: {
    propertiesOverdue: number; propertiesDueSoon: number; violationsOpen: number; violationsOverdue: number;
    casesOpen: number; casesDue: number; permitsWaiting: number; permitsExpiring: number;
    eventsUpcoming: number; investigationsOpen: number;
  };
  violationsOverdue: Violation[];
  casesDue: CaseRow[];
  permitsWaiting: PermitRow[];
  permitsExpiring: PermitRow[];
  events: EventRow[];
}

export interface Hydrant {
  id: number; identifier: string; latitude: number; longitude: number; hydrantClass: string;
  flowGpm: number | null; inService: boolean; isDraftSite: boolean;
}

export interface MapData { today: string; properties: PropertyRow[]; hydrants: Hydrant[]; inspections: InspectionRow[]; cases: CaseRow[] }

export interface SearchResults {
  properties: { id: number; name: string; address: string }[];
  inspections: { id: number; number: string; placeName: string | null; address: string; status: InspectionStatus; scheduledOn: string | null }[];
  permits: { id: number; number: string; placeName: string | null; address: string; status: PermitStatus }[];
  cases: { id: number; number: string; placeName: string | null; address: string; status: CaseStatus }[];
  events: { id: number; number: string; title: string; address: string | null; startsAt: string }[];
  investigations: { id: number; number: string; title: string; address: string; status: InvestigationStatus }[];
}

export interface Listed<T> { today: string; rows: T[] }
