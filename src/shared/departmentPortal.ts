import {
  Award, Banknote, Boxes, Briefcase, Calendar, ClipboardCheck, Clock, FileWarning, Flame, GraduationCap, HardDrive,
  LibraryBig, ListChecks, MessagesSquare, Monitor, Plug, Radio, Rocket, SearchCheck, Shirt, Siren, Ticket, Truck, Users,
  Video, Vote, Wallet, Workflow, type LucideIcon,
} from "lucide-react";
import type { Session } from "@/lib/auth";
import { PORTAL } from "@/portal";

/*
 * The way back to the rest of StationClipboard: the Department Portal's apps,
 * chat and notifications, as its own top bar shows them. Labels, icons,
 * colours and landing pages mirror the Department Portal (lib/moduleLaunch.tsx,
 * lib/moduleColors.ts and lib/moduleLanding.tsx there), so a tile reads and
 * lands the same in every app.
 */

/** What each app tells the shared title bar about itself, in its own src/portal.ts. */
export interface PortalApp {
  /** The Department Portal module this app is. Its tile under Apps is "you're here". */
  slug: string;
  /** "Command Portal": the logo's wordmark. */
  name: string;
  /** This app's own pages, listed first in the menu under the member's name. */
  userMenu: { label: string; icon: LucideIcon; path: string }[];
  /**
   * The module's Department Portal addresses, which its notifications carry,
   * and the page each became here. Keep in step with the redirect page there.
   */
  notificationPaths: [RegExp, (m: RegExpMatchArray) => string][];
}

export const DEPARTMENT_PORTAL_URL = (import.meta.env.VITE_DEPARTMENT_PORTAL_URL as string | undefined) || "https://go.stationclipboard.com";

/**
 * Department Portal pages open in one tab of their own, reused on every click,
 * so going back and forth doesn't pile up tabs. (The Department Portal opens
 * this app the same way, in a window it names.)
 */
export const DEPARTMENT_PORTAL_WINDOW = "stationclipboard-department-portal";

export function departmentPortalHref(path = "/dashboard"): string {
  return DEPARTMENT_PORTAL_URL + path;
}

/** Same check as the Department Portal's can(): no super-admin shortcut, the server already lists every grant. */
function holds(session: Session, module: string, actions: readonly string[]): boolean {
  return actions.some(a => session.permissions.includes(`${module}:${a}`));
}

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------

/** One module as GET /api/organizations/:orgId/modules lists it. */
export interface OrgModule {
  slug: string;
  name: string;
  enabled: boolean;
  /** False when a site admin hasn't given the department this module. */
  accessGranted?: boolean;
}

export interface App {
  slug: string;
  label: string;
  Icon: LucideIcon;
  /** The first page in the module this member may open, on the Department Portal. */
  href: string;
}

const LAUNCH: Record<string, { label: string; Icon: LucideIcon }> = {
  "clock-in": { label: "Time Clock", Icon: Clock },
  "credits": { label: "Credits", Icon: Award },
  "scheduling": { label: "Scheduling", Icon: Calendar },
  "neris": { label: "Incident Reporting", Icon: Flame },
  "assets": { label: "Assets", Icon: Boxes },
  "checklists": { label: "Checklists", Icon: ClipboardCheck },
  "meet": { label: "Meet", Icon: Video },
  "chat": { label: "Chat", Icon: MessagesSquare },
  "community-alerts": { label: "Community Alerts", Icon: Radio },
  "policies": { label: "Resources", Icon: LibraryBig },
  "training": { label: "Training", Icon: GraduationCap },
  "station-board": { label: "Station Board", Icon: Monitor },
  "integrations": { label: "Integrations", Icon: Plug },
  "officer-hub": { label: "HR Info", Icon: Briefcase },
  "applications": { label: "Recruiting", Icon: Rocket },
  "onboarding": { label: "Onboarding", Icon: ClipboardCheck },
  "quartermaster": { label: "QM", Icon: Shirt },
  "tickets": { label: "Tickets", Icon: Ticket },
  "incident-command": { label: "Incident Command", Icon: Siren },
  "inspections": { label: "Inspections", Icon: SearchCheck },
  "workflows": { label: "Workflows", Icon: Workflow },
  "payroll": { label: "Payroll", Icon: Banknote },
  "corrections": { label: "Corrections", Icon: FileWarning },
  "surveys": { label: "Surveys", Icon: ListChecks },
  "courses": { label: "Courses", Icon: GraduationCap },
  "elections": { label: "Elections", Icon: Vote },
  "budget": { label: "Budget", Icon: Wallet },
  "drive": { label: "Drive", Icon: HardDrive },
  "tifmas": { label: "TIFMAS", Icon: Truck },
  "personnel": { label: "PM", Icon: Users },
};

/** Any of these actions in the module opens the page; `true` is open to everyone in the module. */
type Gate = readonly string[] | true;

const SCHEDULE_MANAGE = ["view_all_schedules", "create_shifts", "edit_shifts", "assign_users", "publish_schedule"];
const SCHEDULE_WORKSPACE = [...SCHEDULE_MANAGE, "create_schedule_periods", "review_availability", "manage_availability"];
const CHECKLISTS_ANY = ["view", "perform_checks", "view_history", "manage_alerts", "manage_templates", "manage_settings"];

/**
 * Each module's pages in the Department Portal's sidebar order, with the
 * permission each page checks. A module's tile opens the first one the member
 * holds; with none, there's no tile. Keep in step with moduleLandingHref there.
 * Time off is taken as switched on, the Department Portal's default.
 */
const LANDING: Record<string, [Gate, string][]> = {
  "clock-in": [
    [["view_own_entries"], "/modules/clock-in/my-entries"],
    [["view_all_entries"], "/modules/clock-in/records"],
    [["export_reports"], "/modules/clock-in/reports"],
    [["train_own_face", "manage_face_training"], "/modules/clock-in/face-training"],
    [["manage_settings"], "/modules/clock-in/settings"],
    [["manage_kiosk"], "/modules/clock-in/kiosk"],
  ],
  "credits": [
    [["view_own"], "/modules/credits/my-credits"],
    [["view_leaderboard"], "/modules/credits/leaderboard"],
    [["view_all"], "/modules/credits/management"],
    [["view_reports"], "/modules/credits/reports"],
    [["view"], "/modules/credits/prizes"],
    [["manage_settings", "manage_categories", "manage_activity_types", "manage_periods", "manage_automation"], "/modules/credits/settings"],
  ],
  "scheduling": [
    [SCHEDULE_WORKSPACE, "/modules/scheduling/workspace"],
    [["view"], "/modules/scheduling/schedule"],
    [["view_open_shifts"], "/modules/scheduling/open-shifts"],
    [["view_own_schedule"], "/modules/scheduling/schedule?scope=mine"],
    [["set_own_availability"], "/modules/scheduling/availability"],
    [["request_shift_trade", "request_shift_pickup", "request_time_off"], "/modules/scheduling/my-requests"],
    [["approve_shift_trades", "approve_pickups", "manage_callouts", "manage_time_off"], "/modules/scheduling/requests-queue"],
    [["export_reports"], "/modules/scheduling/reports"],
    [["manage_settings", "manage_hour_caps", "manage_staffing_rules", "manage_timeclock_integration", "manage_schedule_templates"], "/modules/scheduling/settings"],
  ],
  "neris": [
    [["view_own_reports", "view_all_reports"], "/modules/neris/reports"],
    [["auditor_view"], "/modules/neris/auditor"],
    [["manage_submission_settings"], "/modules/neris/transmissions"],
    [["manage_custom_fields"], "/modules/neris/manage"],
    [["manage_settings"], "/modules/neris/settings"],
  ],
  "assets": [
    [["view_tables"], "/modules/assets/tables"],
    [["manage_settings"], "/modules/assets/settings"],
  ],
  "checklists": [
    [["view", "perform_checks"], "/modules/checklists/home"],
    [["manage_alerts", "view_history", "manage_templates"], "/modules/checklists/alerts"],
    [CHECKLISTS_ANY, "/modules/checklists/help"],
  ],
  "chat": [[["view"], "/modules/chat"]],
  "community-alerts": [
    [["view"], "/modules/community-alerts/alerts"],
    [["view_subscribers"], "/modules/community-alerts/subscribers"],
    [["manage_settings"], "/modules/community-alerts/settings"],
  ],
  "meet": [
    [["view", "join", "create"], "/modules/meet/meetings"],
    [["view_attendance"], "/modules/meet/attendance"],
    [["manage_settings"], "/modules/meet/settings"],
    [["export", "manage_all", "host_any"], "/modules/meet/help"],
  ],
  "policies": [
    [["view_assigned"], "/modules/policies/my"],
    [["view_all"], "/modules/policies/library"],
    [["manage_categories"], "/modules/policies/categories"],
    [["manage_settings"], "/modules/policies/settings"],
  ],
  "station-board": [[["view"], "/settings/station-board"]],
  "integrations": [
    [["view"], "/settings/integrations"],
    [["manage_settings"], "/settings/integrations/preferences"],
  ],
  "training": [
    [["view_assigned", "view_own_history", "upload_own_certificate", "log_own_training", "download_own_record"], "/modules/training/my"],
    [["view"], "/modules/training/calendar"],
    [["view_all_training", "view_compliance", "create_training", "publish_training", "edit_training", "delete_training",
      "complete_training", "manage_attendees", "mark_attendance", "upload_files", "edit_records"], "/modules/training/events"],
    [["approve_certificates", "approve_self_logged"], "/modules/training/compliance"],
    [["export_reports"], "/modules/training/reports"],
    [["manage_categories"], "/modules/training/categories"],
    [["manage_ce_types"], "/modules/training/ce-types"],
    [["manage_requirements"], "/modules/training/requirements"],
    [["manage_settings"], "/modules/training/settings"],
  ],
  "officer-hub": [
    [["view_assigned_cases", "view_all_standard_cases", "view_restricted_cases", "view_highly_restricted_cases", "create_cases"], "/officer-hub/records"],
    [["approve_performance_plans", "approve_discipline", "approve_leave"], "/officer-hub/approvals"],
    [["manage_templates"], "/officer-hub/templates"],
    [["view_reports"], "/officer-hub/reports"],
    [["manage_settings", "manage_categories"], "/officer-hub/settings"],
  ],
  "applications": [
    [["view_assigned_submissions", "view_all_submissions"], "/officer-hub/applications/submissions"],
    [["complete_reviews"], "/officer-hub/applications/review-queue"],
    [["view_interviews"], "/officer-hub/applications/interviews"],
    [["view_hubs"], "/officer-hub/applications/hubs"],
    [["view_templates"], "/officer-hub/applications/templates"],
    [["view_reports"], "/officer-hub/applications/reports"],
    [["manage_settings"], "/officer-hub/applications/settings"],
  ],
  "onboarding": [
    [["view_overview"], "/onboarding"],
    [["manage_programs"], "/onboarding/programs"],
    [["view_assigned_people", "view_all_people"], "/onboarding/people"],
    [["view_reports"], "/onboarding/reports"],
  ],
  "quartermaster": [
    [["browse_items"], "/modules/quartermaster/browse"],
    [["view_own"], "/modules/quartermaster/my-inventory"],
    [["view_all"], "/modules/quartermaster/inventory"],
    [["view_requests"], "/modules/quartermaster/requests"],
    [["view_member_inventory"], "/modules/quartermaster/members"],
    [["manage_settings"], "/modules/quartermaster/settings"],
  ],
  "tickets": [
    [["view_own"], "/modules/tickets/my"],
    [["create"], "/modules/tickets/new"],
    [["view_queue"], "/modules/tickets/queue"],
    [["manage_categories"], "/modules/tickets/categories"],
    // Anyone can be handed a ticket, so the module is open to everyone who has it.
    [true, "/modules/tickets/assigned"],
  ],
  // The Department Portal sends these on to their own apps, signed in.
  "incident-command": [[["view"], "/modules/incident-command"]],
  "inspections": [[["view"], "/modules/inspections"]],
  "payroll": [
    [["view"], "/modules/payroll/overview"],
    [["view_runs"], "/modules/payroll/runs"],
    [["view_time"], "/modules/payroll/time"],
    [["preview_gross"], "/modules/payroll/gross"],
    [["preview_net"], "/modules/payroll/net"],
    [["view_employees"], "/modules/payroll/employees"],
    [["view_own_pay"], "/modules/payroll/my-pay"],
    [["manage_settings", "manage_pay_groups", "manage_pay_codes"], "/modules/payroll/settings"],
  ],
  "elections": [
    [["manage_elections"], "/modules/elections"],
    [["vote"], "/modules/elections/my"],
    [["view_results"], "/modules/elections/elections"],
    [["manage_positions"], "/modules/elections/positions"],
    [["manage_disqualifiers"], "/modules/elections/disqualifiers"],
    [["view_audit"], "/modules/elections/audit"],
    [["manage_settings"], "/modules/elections/settings"],
  ],
  "budget": [
    [["view"], "/modules/budget"],
    [["manage_categories"], "/modules/budget/gl-codes"],
    [["manage_settings"], "/modules/budget/settings"],
  ],
  "corrections": [
    [["view_all"], "/officer-hub/corrections/cases"],
    [["view_own"], "/officer-hub/corrections/my"],
    [["manage_types"], "/officer-hub/corrections/types"],
    [["manage_settings"], "/officer-hub/corrections/settings"],
  ],
  "surveys": [
    [["view", "create", "manage_all", "view_results"], "/officer-hub/surveys"],
    [["take"], "/officer-hub/surveys/my"],
  ],
  "courses": [
    [["take"], "/modules/courses/my"],
    [["view", "create", "manage_all", "view_progress"], "/modules/courses"],
    [["manage_settings"], "/modules/courses/settings"],
  ],
  "drive": [
    [["view"], "/modules/drive"],
    [["manage_settings"], "/modules/drive/settings"],
  ],
  "tifmas": [[["view"], "/modules/tifmas"]],
};

/**
 * Every app this member can get into, in the order the Department Portal's
 * launcher shows them: the department has the module on, the member's access
 * to it hasn't been revoked, and there's a page behind the tap. Personnel
 * isn't a module, but rides along last, as it does there.
 */
export function availableApps(session: Session, modules: OrgModule[] | undefined): App[] {
  const apps: App[] = [];
  for (const m of modules ?? []) {
    if (!m.enabled || m.accessGranted === false || m.slug === "core") continue;
    // This app's own module: being here means the member holds its view.
    const href = m.slug === PORTAL.slug ? "/"
      : LANDING[m.slug]?.find(([gate]) => gate === true || holds(session, m.slug, gate))?.[1];
    if (!href) continue;
    apps.push({ slug: m.slug, label: LAUNCH[m.slug]?.label ?? m.name, Icon: LAUNCH[m.slug]?.Icon ?? Plug, href });
  }
  if (holds(session, "core", ["users.view"])) apps.push({ slug: "personnel", ...LAUNCH.personnel, href: "/settings/users" });
  return apps;
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/** The Department Portal's module palettes, as the two ends of each tile's gradient. */
const PALETTES: Record<string, [string, string]> = {
  slate: ["#64748b", "#334155"], gray: ["#6b7280", "#374151"], zinc: ["#71717a", "#3f3f46"], stone: ["#78716c", "#44403c"],
  red: ["#ef4444", "#ea580c"], rose: ["#f43f5e", "#dc2626"], pink: ["#ec4899", "#e11d48"], orange: ["#f97316", "#d97706"],
  amber: ["#fbbf24", "#eab308"], yellow: ["#facc15", "#84cc16"], lime: ["#a3e635", "#22c55e"], green: ["#22c55e", "#059669"],
  emerald: ["#10b981", "#0d9488"], teal: ["#14b8a6", "#0891b2"], cyan: ["#06b6d4", "#0284c7"], sky: ["#0ea5e9", "#2563eb"],
  blue: ["#3b82f6", "#4f46e5"], indigo: ["#6366f1", "#7c3aed"], violet: ["#8b5cf6", "#9333ea"], purple: ["#a855f7", "#c026d3"],
  fuchsia: ["#d946ef", "#db2777"],
  maroon: ["#b91c1c", "#7f1d1d"], burgundy: ["#be123c", "#881337"], raspberry: ["#be185d", "#831843"], rust: ["#c2410c", "#7c2d12"],
  gold: ["#eab308", "#a16207"], bronze: ["#d97706", "#92400e"], brown: ["#92400e", "#451a03"], olive: ["#4d7c0f", "#365314"],
  forest: ["#15803d", "#14532d"], pine: ["#047857", "#064e3b"], spruce: ["#0f766e", "#134e4a"], ocean: ["#0e7490", "#164e63"],
  steel: ["#0369a1", "#0c4a6e"], navy: ["#1e40af", "#172554"], midnight: ["#3730a3", "#1e1b4b"], grape: ["#6d28d9", "#4c1d95"],
  plum: ["#7e22ce", "#581c87"], berry: ["#a21caf", "#701a75"], charcoal: ["#374151", "#111827"], espresso: ["#44403c", "#1c1917"],
  black: ["#262626", "#0a0a0a"],
};

const DEFAULT_PALETTE: Record<string, string> = {
  "core": "blue", "personnel": "navy", "assets": "indigo", "training": "sky", "chat": "steel", "station-board": "cyan",
  "policies": "teal", "checklists": "spruce", "clock-in": "emerald", "onboarding": "green", "budget": "forest",
  "corrections": "lime", "elections": "yellow", "credits": "gold", "quartermaster": "brown", "neris": "orange",
  "community-alerts": "maroon", "incident-command": "red", "inspections": "bronze", "scheduling": "rose", "surveys": "pink",
  "payroll": "fuchsia", "applications": "purple", "meet": "berry", "integrations": "plum", "courses": "violet",
  "officer-hub": "slate", "tickets": "charcoal", "drive": "ocean", "tifmas": "rust",
};

/** A tile's background: the department's own colour for the module (Branding in the Department Portal), else the default. */
export function appGradient(session: Session, slug: string): string {
  const chosen = session.branding?.moduleColors?.[slug];
  const [from, to] = PALETTES[chosen && PALETTES[chosen] ? chosen : DEFAULT_PALETTE[slug]] ?? PALETTES.slate;
  return `linear-gradient(135deg, ${from}, ${to})`;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** One row of GET /api/organizations/:orgId/notifications. */
export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  linkPath?: string | null;
  priority: "normal" | "important" | "critical";
  actionRequired: boolean;
  actorName?: string | null;
  /** Delivered while Do Not Disturb was on. */
  silenced?: boolean;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationList { items: Notification[]; unreadCount: number }

export type Destination = { kind: "here"; path: string } | { kind: "portal"; href: string } | { kind: "web"; href: string };

/** Where tapping a notification goes, or null when it has nowhere to go but its own text. */
export function notificationDestination(n: Notification): Destination | null {
  const link = n.linkPath?.trim();
  if (!link) return null;
  if (link.startsWith("/") && !link.startsWith("//")) {
    const path = link.split(/[?#]/)[0];
    for (const [pattern, to] of PORTAL.notificationPaths) {
      const m = path.match(pattern);
      if (m) return { kind: "here", path: to(m) };
    }
    // The Department Portal marks it read and opens it in context.
    const href = new URL(link, DEPARTMENT_PORTAL_URL);
    href.searchParams.set("notificationId", String(n.id));
    return { kind: "portal", href: href.toString() };
  }
  if (/^https?:\/\//i.test(link)) return { kind: "web", href: link };
  return null;
}
