// In-memory stand-in for the Department Portal's /api/auth, /api/terms and
// /api/inspections endpoints. Same request and response shapes as
// routes/inspections*.ts there, no database. For demos, training, and working
// on the UI without a backend.
//
// Sign in with Organization ID "demo", any username, password "demo". The
// username picks the role:
//   viewer     opens the portal, read-only
//   inspector  inspects and writes violations
//   code       code enforcement (complaints), and sees who complained
//   anything else: the fire marshal, with every permission
//
// The businesses, people and places are made up. State resets whenever the
// server restarts. The default checklists and violation codes come from
// demo-catalog.json, generated from the Department Portal's own catalog.

import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = JSON.parse(fs.readFileSync(path.join(here, "demo-catalog.json"), "utf8"));
const TZ = "America/Chicago";
const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Days and helpers (lib/inspectionsLogic.ts in the Department Portal)
// ---------------------------------------------------------------------------

const dayOf = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const today = () => dayOf();
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
function addMonths(day, months) {
  const d = new Date(`${day}T00:00:00Z`);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d.getUTCDate(), last));
  return t.toISOString().slice(0, 10);
}
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const dueState = (next, t) => (!next ? "none" : next < t ? "overdue" : daysBetween(t, next) <= 30 ? "due_soon" : "current");
const counts = (r) => r === "pass" || r === "fail" || r === "partial";
const crowdManagersNeeded = (n) => (!n || n <= 250 ? 0 : Math.max(2, Math.ceil(n / 250)));
const complianceDaysFor = (sev, minor) => (sev === "imminent" ? 0 : sev === "critical" ? 1 : sev === "serious" ? 14 : minor);
const lineId = () => Math.random().toString(36).slice(2, 10);
const iso = (t) => new Date(t).toISOString();
const clean = (v) => (v == null ? null : String(v).trim() || null);
const terms = (q) => (typeof q === "string" ? q.toLowerCase().split(/\s+/).filter(Boolean) : []);
const matches = (ts, ...f) => !ts.length || ts.every(t => f.filter(Boolean).join(" ").toLowerCase().includes(t));
/** At `hours` past midnight, `days` from today, Central time (close enough for a demo: CDT is UTC-5). */
const at = (days, hours) => new Date(Date.parse(`${addDays(today(), days)}T00:00:00-05:00`) + hours * 3_600_000).toISOString();

const ROLES = {
  viewer: { name: "Viewer", permissions: ["view"] },
  inspector: { name: "Inspector", permissions: ["view", "conduct_inspections"] },
  code: { name: "Code Enforcement Officer", permissions: ["view", "manage_cases", "conduct_inspections"] },
};

// Grants in the department's other modules, which decide the apps a demo user
// is offered. Everyone keeps their own time and schedule; the fire marshal (a
// super admin, who holds every grant) also runs personnel and the department.
const DEMO_OTHER_PERMISSIONS = [
  "clock-in:view_own_entries", "scheduling:view", "scheduling:view_own_schedule", "checklists:view", "checklists:perform_checks",
  "training:view_assigned", "policies:view_assigned", "chat:view", "incident-command:view",
];
const DEMO_CHIEF_PERMISSIONS = [
  ...DEMO_OTHER_PERMISSIONS, "assets:view_tables", "neris:view_all_reports", "scheduling:view_all_schedules", "core:users.view",
];

/** [slug, name, enabled], in the Department Portal's registry order. */
const DEMO_MODULES = [
  ["core", "Core", true], ["clock-in", "Time Clock", true], ["credits", "Credits", false], ["integrations", "Integrations", false],
  ["station-board", "Station Board", false], ["scheduling", "Scheduling", true], ["neris", "NERIS Reporting", true],
  ["assets", "Assets", true], ["checklists", "Checklists", true], ["policies", "Resources", true], ["training", "Training", true],
  ["incident-command", "Incident Command", true], ["inspections", "Inspections", true], ["chat", "Chat", true],
];

function demoNotifications() {
  const ago = (mins) => iso(Date.now() - mins * 60_000);
  const note = (id, mins, f) => ({
    id, type: "announcement", title: "", body: "", linkPath: null, priority: "normal", actionRequired: false,
    actorName: null, silenced: false, isRead: false, readAt: null, createdAt: ago(mins), ...f,
  });
  return [
    note(6, 6, {
      type: "inspections", title: "New complaint assigned to you",
      body: "Blocked exit reported at the back of Riverbend Pizza Kitchen. Due for a first visit tomorrow.",
      linkPath: "/modules/inspections/complaints", priority: "important", actionRequired: true, actorName: "Dana Brooks",
    }),
    note(5, 42, {
      type: "inspections", title: "Permit application waiting for review",
      body: "Tent permit for the Fall Festival and Fireworks needs plan review.", linkPath: "/modules/inspections/permits", actorName: "Sam Ortiz",
    }),
    note(4, 95, {
      title: "Hydrant flushing this week",
      body: "Public works is flushing hydrants in District 2 Tuesday through Thursday. Expect low pressure and discolored water on the east side.",
      actorName: "Chief Alex Rivera",
    }),
    note(3, 60 * 5, {
      type: "scheduling", title: "Shift trade approved",
      body: "Your trade with Jordan Lee for Saturday was approved.", linkPath: "/modules/scheduling/my-requests", actorName: "Casey Morgan",
    }),
    note(2, 60 * 26, { type: "policy", title: "New SOP: Fire watch requirements", body: "Read and acknowledge by Friday.", linkPath: "/modules/policies/my", isRead: true, readAt: ago(60 * 20) }),
    note(1, 60 * 72, { type: "chat_mention", title: "Jordan Lee mentioned you in #fire-marshal", body: "@Alex can you cover the re-inspection on Main St?", linkPath: "/modules/chat", isRead: true, readAt: ago(60 * 70) }),
  ];
}

const PEOPLE = [
  { id: 1, firstName: "Alex", lastName: "Rivera", roles: ["inspects", "enforces", "investigates"] },
  { id: 2, firstName: "Dana", lastName: "Brooks", roles: ["inspects"] },
  { id: 3, firstName: "Sam", lastName: "Ortiz", roles: ["enforces", "inspects"] },
  { id: 4, firstName: "Jordan", lastName: "Lee", roles: ["investigates", "inspects"] },
  { id: 5, firstName: "Casey", lastName: "Morgan", roles: [] },
];
const nameOf = (id) => { const p = PEOPLE.find(x => x.id === id); return p ? `${p.firstName} ${p.lastName}` : null; };

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

export function demoRouter() {
  const r = express.Router();
  let db = seed();
  const sessions = new Map();

  r.post("/demo/reset", (_req, res) => { db = seed(); res.json({ ok: true }); });

  // ── Auth ────────────────────────────────────────────────────────────────
  const sid = (req) => (req.headers.cookie ?? "").split(/;\s*/).find(c => c.startsWith("ip_demo="))?.slice(8);
  const auth = (req, res, next) => {
    const s = sessions.get(sid(req));
    if (!s) return res.status(401).json({ error: "Not authenticated" });
    req.user = s;
    next();
  };
  r.post("/auth/login", (req, res) => {
    const { orgSlug, username, password } = req.body ?? {};
    if (!orgSlug || !username || !password) return res.status(400).json({ error: "Missing required fields" });
    if (String(orgSlug).toLowerCase() !== "demo") return res.status(401).json({ error: `No organization found with ID "${orgSlug}". In demo mode, use "demo".` });
    if (password !== "demo") return res.status(401).json({ error: "Incorrect username or password. In demo mode the password is \"demo\"." });
    const token = crypto.randomUUID();
    const role = ROLES[String(username).trim().toLowerCase()];
    const user = {
      id: 1, username: String(username), firstName: "Alex", lastName: "Rivera", email: "demo@example.com", avatarUrl: null,
      isSiteAdmin: false, orgId: 1, orgSlug: "demo", orgName: "Demo Fire Department", timezone: TZ, use24HourTime: false,
      logoUrl: null, roles: [], roleName: role?.name ?? "Fire Marshal", isSuperAdmin: !role,
      permissions: [...(role?.permissions ?? []).map(p => `inspections:${p}`), ...(role ? DEMO_OTHER_PERMISSIONS : DEMO_CHIEF_PERMISSIONS)],
      branding: { moduleColors: {} },
    };
    sessions.set(token, user);
    res.setHeader("Set-Cookie", `ip_demo=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
    res.json(user);
  });
  r.get("/auth/me", auth, (req, res) => res.json(req.user));
  r.post("/auth/logout", (req, res) => { sessions.delete(sid(req)); res.setHeader("Set-Cookie", "ip_demo=; Path=/; Max-Age=0"); res.json({ ok: true }); });
  r.post("/auth/inspection-portal/redeem", (_req, res) => res.status(401).json({ error: "The demo has no Department Portal to sign you in from. Sign in below." }));

  // ── Terms (routes/terms.ts) ─────────────────────────────────────────────
  const TERMS = { version: "2026-10-05", lastUpdated: "October 5, 2026", url: "https://stationclipboard.com/terms-of-service", privacyUrl: "https://stationclipboard.com/privacy-policy" };
  const accepted = new Map();
  const termsStatus = (u) => { const a = accepted.get(u.username.toLowerCase()) ?? null; return { ...TERMS, acceptedAt: a, mustAccept: !a, impersonating: false }; };
  r.get("/terms", auth, (req, res) => res.json(termsStatus(req.user)));
  r.post("/terms/accept", auth, (req, res) => {
    if (req.body?.version !== TERMS.version) return res.status(409).json({ error: "The Terms of Service were updated. Read the current version, then accept it.", code: "TERMS_VERSION_CHANGED", ...TERMS });
    accepted.set(req.user.username.toLowerCase(), iso(Date.now()));
    res.json(termsStatus(req.user));
  });

  // ── The Department Portal's top bar: apps, chat, notifications ───────────
  // Mirrors routes/modules.ts, routes/notifications.ts and GET /chat/unread
  // there. Every demo user shares one feed, kept until the server restarts.
  const org = (req, res, next) => (Number(req.params.orgId) === req.user.orgId ? next() : res.status(403).json({ error: "Access denied" }));
  r.get("/organizations/:orgId/modules", auth, org, (_req, res) => {
    res.json(DEMO_MODULES.map(([slug, name, enabled]) => ({ slug, name, enabled, accessGranted: true, required: slug === "core" })));
  });
  let notes = demoNotifications();
  const feed = () => ({ items: notes.slice(0, 40), unreadCount: notes.filter(n => !n.isRead).length });
  const read = (n) => { if (!n.isRead) Object.assign(n, { isRead: true, readAt: iso(Date.now()) }); };
  const N = "/organizations/:orgId/notifications";
  r.get(N, auth, org, (_req, res) => res.json(feed()));
  r.post(`${N}/read-all`, auth, org, (_req, res) => { notes.forEach(read); res.json(feed()); });
  r.post(`${N}/mark-read`, auth, org, (req, res) => {
    const ids = new Set(Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : []);
    const hit = notes.filter(n => ids.has(n.id) && !n.isRead);
    hit.forEach(read);
    res.json({ updated: hit.length });
  });
  r.post(`${N}/:id/read`, auth, org, (req, res) => { notes.filter(n => n.id === Number(req.params.id)).forEach(read); res.json(feed()); });
  r.delete(N, auth, org, (_req, res) => { notes = []; res.json(feed()); });
  r.delete(`${N}/:id`, auth, org, (req, res) => { notes = notes.filter(n => n.id !== Number(req.params.id)); res.json(feed()); });
  r.get("/chat/unread", auth, (req, res) => {
    if (!req.user.permissions.includes("chat:view")) return res.status(403).json({ error: "Forbidden" });
    res.json({ total: 3, mentions: 1, channels: [] });
  });

  // ── Inspections ─────────────────────────────────────────────────────────
  const ip = express.Router();
  r.use("/inspections", auth, ip);

  const can = (req, action) => req.user.isSuperAdmin || req.user.permissions.includes(`inspections:${action}`);
  const need = (...actions) => (req, res, next) => (actions.some(a => can(req, a)) ? next() : res.status(403).json({ error: "You don't have permission to perform this action." }));
  const WRITE = { inspect: need("conduct_inspections", "manage_settings"), cases: need("manage_cases", "manage_settings"), permits: need("manage_permits", "manage_settings"), events: need("manage_events", "manage_settings"), inv: need("investigations"), settings: need("manage_settings"), violations: need("conduct_inspections", "manage_cases", "manage_settings") };
  const who = (req) => `${req.user.firstName} ${req.user.lastName}`;
  const hist = (req, text, kind = "change") => ({ at: iso(Date.now()), by: who(req), text, kind });
  const num = (kind) => {
    const year = Number(today().slice(0, 4));
    const prefix = { inspection: "INS", permit: "P", case: "CE", event: "EV", investigation: "FI" }[kind];
    db.seq[kind] = (db.seq[kind] ?? 0) + 1;
    return `${prefix}-${year}-${String(db.seq[kind]).padStart(4, "0")}`;
  };
  const nextId = () => ++db.id;
  const byId = (list, id) => list.find(x => x.id === Number(id));

  // Settings ---------------------------------------------------------------
  const settingsDto = () => {
    const s = db.settings;
    const edition = s.codeEdition;
    return {
      officeName: s.officeName, frequencyMonths: s.frequencyMonths, defaultComplianceDays: s.defaultComplianceDays, codeEdition: edition,
      inspectionTypes: s.inspectionTypes ?? CATALOG.inspectionTypes, permitTypes: s.permitTypes ?? CATALOG.permitTypes,
      caseTypes: s.caseTypes ?? CATALOG.caseTypes, violationCodes: s.violationCodes ?? CATALOG.violationCodes[edition],
      fees: s.fees ?? CATALOG.fees, letter: s.letter ?? CATALOG.letter,
      org: { name: "Demo Fire Department", shortName: "DFD", logoUrl: null, address: "3144 Meridiana Pkwy, Iowa Colony, TX 77583", phone: "(281) 555-0142", timezone: TZ },
      updatedAt: s.updatedAt,
    };
  };
  const LIB = new Map(CATALOG.library.map(l => [l.id, l]));
  const remap = (items, from, to, get, set) => items.map(item => {
    const line = LIB.get(item.id);
    if (!line) return item;
    const ref = { "2018": line.ref2018, "2021": line.ref2021 };
    const text = { "2018": line.check2018, "2021": line.check };
    const cur = get(item);
    const moveRef = cur.ref === ref[from] && cur.ref !== ref[to];
    const moveText = cur.text === text[from] && cur.text !== text[to];
    return moveRef || moveText ? set(item, moveRef ? ref[to] : cur.ref, moveText ? text[to] : cur.text) : item;
  });

  ip.get("/settings", (_req, res) => res.json(settingsDto()));
  ip.patch("/settings", WRITE.settings, (req, res) => {
    const b = req.body ?? {};
    const s = db.settings;
    if (b.codeEdition && b.codeEdition !== s.codeEdition) {
      const from = s.codeEdition;
      if (s.violationCodes) s.violationCodes = remap(s.violationCodes, from, b.codeEdition, c => ({ ref: c.code, text: c.description }), (c, ref, text) => ({ ...c, code: ref, description: text }));
      for (const list of db.checklists) list.items = remap(list.items, from, b.codeEdition, i => ({ ref: i.codeRef, text: i.text }), (i, ref, text) => ({ ...i, codeRef: ref, text }));
      s.codeEdition = b.codeEdition;
    }
    for (const k of ["officeName", "frequencyMonths", "defaultComplianceDays", "inspectionTypes", "permitTypes", "caseTypes", "violationCodes", "fees", "letter"]) {
      if (b[k] !== undefined) s[k] = k === "officeName" ? clean(b[k]) : b[k];
    }
    s.updatedAt = iso(Date.now());
    res.json(settingsDto());
  });

  ip.get("/people", (_req, res) => res.json(PEOPLE.map(p => ({
    id: p.id, name: `${p.firstName} ${p.lastName}`, avatarUrl: null,
    inspects: p.roles.includes("inspects"), enforces: p.roles.includes("enforces"), investigates: p.roles.includes("investigates"),
  }))));

  // Businesses -------------------------------------------------------------
  const programOf = (preplanId) => db.programs.find(p => p.preplanId === preplanId);
  const openViolationsAt = (preplanId) => db.violations.filter(v => v.preplanId === preplanId && v.status === "open").length;
  const propertyRow = (p, t) => {
    const prog = programOf(p.id);
    return {
      preplanId: p.id, name: p.name, address: p.address, latitude: p.latitude, longitude: p.longitude, occupancyType: p.occupancyType,
      preplanNumber: p.preplanNumber, firstDueStation: p.firstDueStation, tenancy: p.tenancy, masterPreplanId: p.masterPreplanId,
      targetHazard: null, buildingStatus: "occupied", hasProgram: !!prog, onProgram: prog?.onProgram ?? false,
      occupancyClass: prog?.occupancyClass ?? null, riskClass: prog?.riskClass ?? null, nextDueOn: prog?.nextDueOn ?? null,
      lastInspectedOn: prog?.lastInspectedOn ?? (p.lastInspectedAt ? dayOf(new Date(p.lastInspectedAt)) : null),
      dueState: prog?.onProgram ? dueState(prog.nextDueOn, t) : "none", openViolations: openViolationsAt(p.id),
    };
  };
  const freqFor = (prog) => (prog?.frequencyMonths > 0 ? prog.frequencyMonths : prog?.riskClass ? db.settings.frequencyMonths[prog.riskClass] : 12);

  ip.get("/properties", (req, res) => {
    const t = today();
    const ts = terms(req.query.q);
    const rows = db.preplans.filter(p => p.isActive).sort((a, b) => a.name.localeCompare(b.name)).map(p => propertyRow(p, t));
    res.json({ today: t, rows: rows.filter(r => matches(ts, r.name, r.address, r.occupancyType, r.preplanNumber, r.occupancyClass)) });
  });
  ip.get("/properties/:id", (req, res) => {
    const p = byId(db.preplans, req.params.id);
    if (!p) return res.status(404).json({ error: "Business not found" });
    const t = today();
    const prog = programOf(p.id);
    res.json({
      ...propertyRow(p, t), today: t,
      frequencyMonths: prog?.frequencyMonths ?? null, effectiveFrequencyMonths: freqFor(prog),
      ownerName: prog?.ownerName ?? null, ownerPhone: prog?.ownerPhone ?? null, ownerEmail: prog?.ownerEmail ?? null,
      ownerMailingAddress: prog?.ownerMailingAddress ?? null, businessLicense: prog?.businessLicense ?? null, notes: prog?.notes ?? null,
      preplan: p.detail,
      tenants: db.preplans.filter(x => x.masterPreplanId === p.id).map(x => ({ id: x.id, name: x.name, address: x.address })),
      master: p.masterPreplanId ? (({ id, name, address }) => ({ id, name, address }))(byId(db.preplans, p.masterPreplanId)) : null,
      inspections: db.inspections.filter(i => i.preplanId === p.id).sort(newestInspection).slice(0, 40).map(inspectionRow),
      violations: db.violations.filter(v => v.preplanId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(v => violationRow(v, t)),
      permits: db.permits.filter(x => x.preplanId === p.id).map(permitRow),
      cases: db.cases.filter(c => c.preplanId === p.id).map(caseRow),
    });
  });
  const programFields = ["occupancyClass", "riskClass", "frequencyMonths", "nextDueOn", "onProgram", "ownerName", "ownerPhone", "ownerEmail", "ownerMailingAddress", "businessLicense", "notes"];
  const pickProgram = (b) => Object.fromEntries(programFields.filter(k => b[k] !== undefined).map(k => [k, typeof b[k] === "string" ? clean(b[k]) : b[k]]));
  ip.post("/properties", WRITE.inspect, (req, res) => {
    const b = req.body ?? {};
    if (!clean(b.name) || !clean(b.address)) return res.status(400).json({ error: "Give the business a name and an address." });
    const p = newPreplan(nextId(), { name: clean(b.name), address: clean(b.address), latitude: b.latitude ?? null, longitude: b.longitude ?? null, occupancyType: clean(b.occupancyType), phone: clean(b.phone) });
    db.preplans.push(p);
    const prog = { preplanId: p.id, onProgram: true, ...pickProgram(b) };
    if (prog.onProgram !== false && !prog.nextDueOn) prog.nextDueOn = today();
    db.programs.push(prog);
    res.status(201).json({ preplanId: p.id });
  });
  ip.patch("/properties/:id", WRITE.inspect, (req, res) => {
    const p = byId(db.preplans, req.params.id);
    if (!p) return res.status(404).json({ error: "Business not found" });
    const b = req.body ?? {};
    for (const k of ["name", "address", "latitude", "longitude", "occupancyType", "phone"]) if (b[k] !== undefined) p[k] = b[k];
    const patch = pickProgram(b);
    if (Object.keys(patch).length) {
      let prog = programOf(p.id);
      const wasOn = prog?.onProgram;
      if (!prog) { prog = { preplanId: p.id, onProgram: true }; db.programs.push(prog); }
      Object.assign(prog, patch);
      if (b.nextDueOn === undefined && (patch.riskClass !== undefined || patch.frequencyMonths !== undefined) && prog.lastInspectedOn) prog.nextDueOn = addMonths(prog.lastInspectedOn, freqFor(prog));
      if (!wasOn && prog.onProgram && !prog.nextDueOn && !prog.lastInspectedOn) prog.nextDueOn = today();
    }
    res.json({ ok: true });
  });

  // Rows -------------------------------------------------------------------
  const newestInspection = (a, b) => (b.scheduledOn ?? b.createdAt).localeCompare(a.scheduledOn ?? a.createdAt) || b.id - a.id;
  const inspectionRow = (i) => ({
    id: i.id, number: i.number, discipline: i.discipline, typeKey: i.typeKey, status: i.status, result: i.result,
    scheduledOn: i.scheduledOn, scheduledTime: i.scheduledTime, placeName: i.placeName, address: i.address, preplanId: i.preplanId,
    latitude: i.latitude, longitude: i.longitude, assignedUserId: i.assignedUserId, assignedName: nameOf(i.assignedUserId),
    completedAt: i.completedAt, parentId: i.parentId, permitId: i.permitId, caseId: i.caseId, eventId: i.eventId, createdAt: i.createdAt,
    openViolations: db.violations.filter(v => v.inspectionId === i.id && v.status === "open").length,
  });
  const violationRow = (v, t) => ({ ...v, overdue: v.status === "open" && !!v.dueOn && v.dueOn < t, inspectionNumber: byId(db.inspections, v.inspectionId)?.number ?? null });
  const permitRow = (p) => ({
    id: p.id, number: p.number, typeKey: p.typeKey, category: p.category, status: p.status, placeName: p.placeName, address: p.address,
    preplanId: p.preplanId, applicantName: p.applicantName, applicantCompany: p.applicantCompany, appliedOn: p.appliedOn, issuedOn: p.issuedOn,
    expiresOn: p.expiresOn, feeCents: p.feeCents, feePaid: p.feePaid, reviewerUserId: p.reviewerUserId, reviewerName: nameOf(p.reviewerUserId),
    eventId: p.eventId, createdAt: p.createdAt,
  });
  const caseRow = (c) => ({
    id: c.id, number: c.number, typeKey: c.typeKey, source: c.source, status: c.status, priority: c.priority, resolution: c.resolution,
    placeName: c.placeName, address: c.address, preplanId: c.preplanId, latitude: c.latitude, longitude: c.longitude,
    assignedUserId: c.assignedUserId, assignedName: nameOf(c.assignedUserId), dueOn: c.dueOn, receivedAt: c.receivedAt, closedAt: c.closedAt,
    overdue: c.status !== "closed" && !!c.dueOn && c.dueOn < today(),
  });
  const eventRow = (e) => ({
    id: e.id, number: e.number, title: e.title, kind: e.kind, status: e.status, startsAt: e.startsAt, endsAt: e.endsAt,
    locationName: e.locationName, address: e.address, latitude: e.latitude, longitude: e.longitude, expectedAttendance: e.expectedAttendance,
    tasksDone: e.tasks.filter(t => t.done).length, tasksTotal: e.tasks.length, staffCount: e.staffUserIds.length,
  });

  // Today ------------------------------------------------------------------
  ip.get("/today", (req, res) => {
    const t = today();
    const week = addDays(t, 7);
    const open = (i) => i.status === "scheduled" || i.status === "in_progress";
    const mine = db.inspections.filter(i => i.assignedUserId === req.user.id && open(i) && (!i.scheduledOn || i.scheduledOn <= week))
      .sort((a, b) => (a.scheduledOn ?? "2999").localeCompare(b.scheduledOn ?? "2999") || (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? ""));
    const todays = db.inspections.filter(i => i.scheduledOn === t && i.status !== "cancelled");
    const programs = db.programs.filter(p => p.onProgram);
    const vOpen = db.violations.filter(v => v.status === "open");
    const vOver = vOpen.filter(v => v.dueOn && v.dueOn < t);
    const cOpen = db.cases.filter(c => c.status !== "closed");
    const cDue = cOpen.filter(c => c.dueOn && c.dueOn <= t);
    const waiting = db.permits.filter(p => ["applied", "in_review", "corrections", "approved"].includes(p.status));
    const expiring = db.permits.filter(p => p.status === "issued" && p.expiresOn && p.expiresOn <= addDays(t, 30));
    const now = Date.now();
    const events = db.events.filter(e => !["cancelled", "completed"].includes(e.status) && Date.parse(e.endsAt) >= now && Date.parse(e.startsAt) <= now + 45 * DAY)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    res.json({
      today: t, mine: mine.map(inspectionRow), todays: todays.map(inspectionRow),
      counts: {
        propertiesOverdue: programs.filter(p => dueState(p.nextDueOn, t) === "overdue").length,
        propertiesDueSoon: programs.filter(p => dueState(p.nextDueOn, t) === "due_soon").length,
        violationsOpen: vOpen.length, violationsOverdue: vOver.length, casesOpen: cOpen.length, casesDue: cDue.length,
        permitsWaiting: waiting.length, permitsExpiring: expiring.length, eventsUpcoming: events.length,
        investigationsOpen: can(req, "investigations") ? db.investigations.filter(x => x.status !== "closed").length : 0,
      },
      violationsOverdue: vOver.slice(0, 15).map(v => violationRow(v, t)), casesDue: cDue.slice(0, 15).map(caseRow),
      permitsWaiting: waiting.slice(0, 15).map(permitRow), permitsExpiring: expiring.slice(0, 15).map(permitRow), events: events.map(eventRow),
    });
  });

  ip.get("/map", (_req, res) => {
    const t = today();
    res.json({
      today: t,
      properties: db.preplans.filter(p => p.isActive && p.latitude != null).map(p => propertyRow(p, t)),
      hydrants: db.hydrants,
      inspections: db.inspections.filter(i => (i.status === "scheduled" || i.status === "in_progress") && i.scheduledOn && i.scheduledOn <= addDays(t, 14) && i.latitude != null).map(inspectionRow),
      cases: db.cases.filter(c => c.status !== "closed" && c.latitude != null).map(caseRow),
    });
  });

  // Checklists ---------------------------------------------------------------
  ip.get("/checklists", (_req, res) => res.json(db.checklists));
  ip.post("/checklists", WRITE.settings, (req, res) => {
    const b = req.body ?? {};
    if (!clean(b.name)) return res.status(400).json({ error: "Give the checklist a name" });
    const row = { id: nextId(), name: clean(b.name), discipline: b.discipline ?? "fire", description: clean(b.description), items: b.items ?? [], isActive: b.isActive ?? true, sortOrder: db.checklists.length };
    db.checklists.push(row);
    res.status(201).json(row);
  });
  ip.patch("/checklists/:id", WRITE.settings, (req, res) => {
    const row = byId(db.checklists, req.params.id);
    if (!row) return res.status(404).json({ error: "Checklist not found" });
    for (const k of ["name", "discipline", "description", "items", "isActive", "sortOrder"]) if (req.body?.[k] !== undefined) row[k] = req.body[k];
    res.json(row);
  });
  ip.delete("/checklists/:id", WRITE.settings, (req, res) => { db.checklists = db.checklists.filter(c => c.id !== Number(req.params.id)); res.json({ ok: true }); });

  // Inspections ---------------------------------------------------------------
  const typeOf = (key) => settingsDto().inspectionTypes.find(t => t.key === key);
  const typeLabel = (key) => typeOf(key)?.label ?? key;
  const RESULT = { pass: "Passed", fail: "Failed", partial: "Partly done", no_access: "No access", not_ready: "Not ready" };
  const tally = (items) => ({ ok: items.filter(i => i.result === "ok").length, fail: items.filter(i => i.result === "fail").length, na: items.filter(i => i.result === "na").length, open: items.filter(i => i.result == null).length, total: items.length });
  const inspectionDetail = (i) => {
    const t = today();
    const prog = i.preplanId ? programOf(i.preplanId) : null;
    const permit = i.permitId ? byId(db.permits, i.permitId) : null;
    const kase = i.caseId ? byId(db.cases, i.caseId) : null;
    const event = i.eventId ? byId(db.events, i.eventId) : null;
    const parent = i.parentId ? byId(db.inspections, i.parentId) : null;
    return {
      ...i, ...inspectionRow(i), completedByName: nameOf(i.completedByUserId), today: t, tally: tally(i.checklist),
      violations: db.violations.filter(v => v.inspectionId === i.id).map(v => violationRow(v, t)),
      carriedViolations: i.parentId ? db.violations.filter(v => v.inspectionId === i.parentId).map(v => violationRow(v, t)) : [],
      property: prog ? { occupancyClass: prog.occupancyClass, riskClass: prog.riskClass, ownerName: prog.ownerName, ownerPhone: prog.ownerPhone, ownerMailingAddress: prog.ownerMailingAddress, nextDueOn: prog.nextDueOn, lastInspectedOn: prog.lastInspectedOn } : null,
      reinspections: db.inspections.filter(x => x.parentId === i.id).map(inspectionRow),
      permit: permit ? { id: permit.id, number: permit.number, typeKey: permit.typeKey, status: permit.status } : null,
      case: kase ? { id: kase.id, number: kase.number, typeKey: kase.typeKey, status: kase.status } : null,
      event: event ? { id: event.id, number: event.number, title: event.title, status: event.status } : null,
      parent: parent ? { id: parent.id, number: parent.number, result: parent.result, completedAt: parent.completedAt } : null,
    };
  };
  const checklistFor = (type, picked) => {
    const lists = db.checklists;
    return (picked && lists.find(l => l.id === picked))
      ?? (type.checklistId && lists.find(l => l.id === type.checklistId && l.isActive))
      ?? (CATALOG.typeChecklist[type.key] && lists.find(l => l.isActive && l.name === CATALOG.typeChecklist[type.key]))
      ?? lists.find(l => l.isActive && l.discipline === type.discipline) ?? null;
  };

  ip.get("/inspections", (req, res) => {
    const t = today();
    const status = String(req.query.status ?? "open");
    const ts = terms(req.query.q);
    let rows = db.inspections.filter(i => status === "open" ? i.status === "scheduled" || i.status === "in_progress" : status === "all" ? true : i.status === status);
    if (req.query.scope === "mine") rows = rows.filter(i => i.assignedUserId === req.user.id);
    if (req.query.discipline) rows = rows.filter(i => i.discipline === req.query.discipline);
    if (Number(req.query.preplanId) > 0) rows = rows.filter(i => i.preplanId === Number(req.query.preplanId));
    rows = rows.filter(i => matches(ts, i.number, i.placeName, i.address));
    rows.sort(status === "open"
      ? (a, b) => (a.scheduledOn ?? "2999").localeCompare(b.scheduledOn ?? "2999") || (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? "")
      : (a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
    res.json({ today: t, rows: rows.map(inspectionRow) });
  });
  ip.get("/inspections/:id", (req, res) => {
    const i = byId(db.inspections, req.params.id);
    if (!i) return res.status(404).json({ error: "Inspection not found" });
    res.json(inspectionDetail(i));
  });
  ip.post("/inspections", WRITE.inspect, (req, res) => {
    const b = req.body ?? {};
    const type = typeOf(b.typeKey);
    if (!type) return res.status(400).json({ error: "Pick a type of inspection." });
    let place = { preplanId: b.preplanId ?? null, placeName: clean(b.placeName), address: clean(b.address), latitude: b.latitude ?? null, longitude: b.longitude ?? null };
    if (place.preplanId) {
      const p = byId(db.preplans, place.preplanId);
      if (!p) return res.status(404).json({ error: "Business not found" });
      place = { ...place, placeName: place.placeName ?? p.name, address: place.address ?? p.address, latitude: place.latitude ?? p.latitude, longitude: place.longitude ?? p.longitude };
    }
    const parent = b.parentId ? byId(db.inspections, b.parentId) : null;
    if (parent) place = { preplanId: place.preplanId ?? parent.preplanId, placeName: place.placeName ?? parent.placeName, address: place.address ?? parent.address, latitude: place.latitude ?? parent.latitude, longitude: place.longitude ?? parent.longitude };
    if (!place.address) return res.status(400).json({ error: "Say where the inspection is: pick a business or type an address." });
    const list = parent ? null : checklistFor(type, b.checklistId);
    const when = b.scheduledOn ? ` for ${b.scheduledOn}${b.scheduledTime ? ` at ${b.scheduledTime}` : ""}` : "";
    const row = newInspection({
      id: nextId(), number: num("inspection"), discipline: type.discipline, typeKey: type.key, ...place,
      permitId: b.permitId ?? parent?.permitId ?? null, caseId: b.caseId ?? parent?.caseId ?? null, eventId: b.eventId ?? parent?.eventId ?? null,
      parentId: parent?.id ?? null, scheduledOn: b.scheduledOn ?? null, scheduledTime: b.scheduledTime ?? null, assignedUserId: b.assignedUserId ?? null,
      checklistId: list?.id ?? null, checklist: list ? list.items.map(x => ({ ...x, result: null, note: "" })) : [], notes: clean(b.notes),
      feeCents: b.feeCents ?? null, history: [hist(req, `Scheduled${when}`)],
    });
    db.inspections.push(row);
    res.status(201).json(inspectionDetail(row));
  });
  ip.patch("/inspections/:id", WRITE.inspect, (req, res) => {
    const i = byId(db.inspections, req.params.id);
    if (!i) return res.status(404).json({ error: "Inspection not found" });
    const b = req.body ?? {};
    const done = i.status === "completed" || i.status === "cancelled";
    if (done && Object.keys(b).some(k => !["feeCents", "feePaid", "notes"].includes(k))) return res.status(409).json({ error: "This inspection is finished. Reopen it to change it." });
    if (b.typeKey && b.typeKey !== i.typeKey) {
      const type = typeOf(b.typeKey);
      if (!type) return res.status(400).json({ error: "Pick a type of inspection." });
      i.typeKey = type.key; i.discipline = type.discipline; i.history.push(hist(req, `Type changed to ${type.label}`));
    }
    if (b.scheduledOn !== undefined || b.scheduledTime !== undefined) {
      const on = b.scheduledOn !== undefined ? b.scheduledOn : i.scheduledOn;
      const tm = b.scheduledTime !== undefined ? b.scheduledTime : i.scheduledTime;
      if (on !== i.scheduledOn || tm !== i.scheduledTime) { i.scheduledOn = on; i.scheduledTime = tm; i.history.push(hist(req, on ? `Rescheduled for ${on}${tm ? ` at ${tm}` : ""}` : "Taken off the schedule")); }
    }
    if (b.assignedUserId !== undefined && b.assignedUserId !== i.assignedUserId) { i.assignedUserId = b.assignedUserId; i.history.push(hist(req, b.assignedUserId ? `Assigned to ${nameOf(b.assignedUserId)}` : "Unassigned")); }
    for (const k of ["checklist", "notes", "contactName", "contactTitle", "signedName", "feeCents", "placeName", "address"]) if (b[k] !== undefined) i[k] = b[k];
    if (b.signature !== undefined) { i.signature = b.signature; i.signedAt = b.signature ? iso(Date.now()) : null; }
    if (b.feePaid !== undefined && b.feePaid !== i.feePaid) { i.feePaid = b.feePaid; i.history.push(hist(req, b.feePaid ? "Fee marked paid" : "Fee marked unpaid")); }
    res.json(inspectionDetail(i));
  });
  ip.post("/inspections/:id/start", WRITE.inspect, (req, res) => {
    const i = byId(db.inspections, req.params.id);
    if (!i) return res.status(404).json({ error: "Inspection not found" });
    if (i.status === "scheduled") { i.status = "in_progress"; i.startedAt = iso(Date.now()); i.assignedUserId ??= req.user.id; i.history.push(hist(req, "Started on site")); }
    res.json(inspectionDetail(i));
  });
  ip.post("/inspections/:id/complete", WRITE.inspect, (req, res) => {
    const i = byId(db.inspections, req.params.id);
    if (!i) return res.status(404).json({ error: "Inspection not found" });
    if (i.status === "completed") return res.status(409).json({ error: "This inspection is already finished." });
    const b = req.body ?? {};
    if (!RESULT[b.result]) return res.status(400).json({ error: "Pick a result." });
    const t = today();
    const s = settingsDto();
    for (const v of b.violations ?? []) {
      db.violations.push(newViolation({ id: nextId(), inspectionId: i.id, caseId: i.caseId, preplanId: i.preplanId, placeName: i.placeName, address: i.address, ...v,
        dueOn: v.dueOn ?? addDays(t, v.complianceDays ?? complianceDaysFor(v.severity, s.defaultComplianceDays)) }));
    }
    const cleared = new Set(b.clearedViolationIds ?? []);
    for (const v of db.violations) {
      if (!cleared.has(v.id) || v.status !== "open") continue;
      if (v.preplanId === i.preplanId || v.inspectionId === i.parentId || v.caseId === i.caseId || v.inspectionId === i.id) {
        Object.assign(v, { status: "corrected", resolvedOn: t, resolvedByUserId: req.user.id, clearedByInspectionId: i.id, resolutionNote: `Found corrected on ${i.number}` });
      }
    }
    for (const k of ["checklist", "notes", "contactName", "contactTitle", "signedName", "feeCents"]) if (b[k] !== undefined) i[k] = b[k];
    if (b.signature !== undefined) { i.signature = b.signature; i.signedAt = b.signature ? iso(Date.now()) : null; }
    Object.assign(i, { status: "completed", result: b.result, completedAt: iso(Date.now()), completedByUserId: req.user.id, startedAt: i.startedAt ?? iso(Date.now()) });
    i.assignedUserId ??= req.user.id;
    i.history.push(hist(req, `Finished: ${RESULT[b.result]}`));
    if ((b.violations ?? []).length) i.history.push(hist(req, `${b.violations.length} violation(s) written`));
    if (cleared.size) i.history.push(hist(req, `${cleared.size} violation(s) found corrected`));
    if (i.preplanId && counts(b.result)) {
      let prog = programOf(i.preplanId);
      const routine = typeOf(i.typeKey)?.routine === true;
      if (prog || routine) {
        if (!prog) { prog = { preplanId: i.preplanId, onProgram: true }; db.programs.push(prog); }
        if (!prog.lastInspectedOn || prog.lastInspectedOn < t) prog.lastInspectedOn = t;
        if (routine) prog.nextDueOn = addMonths(t, freqFor(prog));
      }
      if (i.discipline === "fire") {
        const p = byId(db.preplans, i.preplanId);
        if (p) {
          const n = (b.violations ?? []).length;
          p.detail.visits.push({ date: t, kind: "Inspection", by: who(req), notes: `${typeLabel(i.typeKey)} (${i.number}): ${RESULT[b.result]}${n ? `, ${n} violation(s) written` : ""}.` });
          p.lastInspectedAt = iso(Date.now()); p.detail.lastInspectedAt = p.lastInspectedAt;
        }
      }
    }
    if (b.reinspectOn) {
      const reType = i.discipline === "code" ? "ce_recheck" : "reinspection";
      db.inspections.push(newInspection({
        id: nextId(), number: num("inspection"), discipline: i.discipline, typeKey: reType, preplanId: i.preplanId, placeName: i.placeName, address: i.address,
        latitude: i.latitude, longitude: i.longitude, permitId: i.permitId, caseId: i.caseId, eventId: i.eventId, parentId: i.id,
        scheduledOn: b.reinspectOn, assignedUserId: b.reinspectAssignedUserId ?? i.assignedUserId, history: [hist(req, `Booked to re-check ${i.number}, for ${b.reinspectOn}`)],
      }));
    }
    res.json(inspectionDetail(i));
  });
  ip.post("/inspections/:id/cancel", WRITE.inspect, (req, res) => {
    const i = byId(db.inspections, req.params.id);
    if (!i) return res.status(404).json({ error: "Inspection not found" });
    if (i.status === "completed") return res.status(409).json({ error: "A finished inspection can't be cancelled. Reopen it first." });
    i.status = "cancelled"; i.cancelReason = clean(req.body?.reason); i.history.push(hist(req, `Cancelled${i.cancelReason ? `: ${i.cancelReason}` : ""}`));
    res.json(inspectionDetail(i));
  });
  ip.post("/inspections/:id/reopen", WRITE.inspect, (req, res) => {
    const i = byId(db.inspections, req.params.id);
    if (!i) return res.status(404).json({ error: "Inspection not found" });
    i.history.push(hist(req, i.status === "completed" ? `Reopened (it was ${RESULT[i.result] ?? "finished"})` : "Reopened"));
    Object.assign(i, { status: i.status === "completed" ? "in_progress" : "scheduled", result: null, completedAt: null, completedByUserId: null, cancelReason: null });
    res.json(inspectionDetail(i));
  });
  ip.delete("/inspections/:id", WRITE.settings, (req, res) => {
    db.inspections = db.inspections.filter(i => i.id !== Number(req.params.id));
    for (const v of db.violations) if (v.inspectionId === Number(req.params.id)) v.inspectionId = null;
    res.json({ ok: true });
  });

  // Violations ---------------------------------------------------------------
  ip.get("/violations", (req, res) => {
    const t = today();
    const status = String(req.query.status ?? "open");
    const ts = terms(req.query.q);
    let rows = db.violations.filter(v => status === "all" ? true : status === "overdue" ? v.status === "open" && v.dueOn && v.dueOn < t : status === "open" ? v.status === "open" : v.status === status);
    for (const k of ["preplanId", "inspectionId", "caseId"]) if (Number(req.query[k]) > 0) rows = rows.filter(v => v[k] === Number(req.query[k]));
    rows = rows.filter(v => matches(ts, v.title, v.codeRef, v.placeName, v.address, v.description))
      .sort((a, b) => (a.dueOn ?? "2999").localeCompare(b.dueOn ?? "2999"));
    res.json({ today: t, rows: rows.map(v => violationRow(v, t)) });
  });
  ip.post("/violations", WRITE.violations, (req, res) => {
    const b = req.body ?? {};
    let place = null;
    if (b.inspectionId) { const i = byId(db.inspections, b.inspectionId); if (!i) return res.status(404).json({ error: "Inspection not found" }); place = { preplanId: i.preplanId, placeName: i.placeName, address: i.address, caseId: i.caseId }; }
    else if (b.caseId) { const c = byId(db.cases, b.caseId); if (!c) return res.status(404).json({ error: "Complaint not found" }); place = { preplanId: c.preplanId, placeName: c.placeName, address: c.address }; }
    if (!place) return res.status(400).json({ error: "A violation belongs to an inspection or a complaint." });
    if (!clean(b.title)) return res.status(400).json({ error: "Every violation needs a title" });
    const s = settingsDto();
    const v = newViolation({
      id: nextId(), inspectionId: b.inspectionId ?? null, caseId: b.caseId ?? place.caseId ?? null, preplanId: place.preplanId, placeName: place.placeName, address: place.address,
      codeRef: clean(b.codeRef), title: clean(b.title), description: clean(b.description), location: clean(b.location), correctiveAction: clean(b.correctiveAction),
      severity: b.severity ?? "serious", dueOn: b.dueOn ?? addDays(today(), b.complianceDays ?? complianceDaysFor(b.severity, s.defaultComplianceDays)),
    });
    db.violations.push(v);
    res.status(201).json(violationRow(v, today()));
  });
  ip.patch("/violations/:id", WRITE.violations, (req, res) => {
    const v = byId(db.violations, req.params.id);
    if (!v) return res.status(404).json({ error: "Violation not found" });
    const b = req.body ?? {};
    for (const k of ["codeRef", "title", "description", "location", "correctiveAction", "severity", "dueOn", "resolutionNote"]) if (b[k] !== undefined) v[k] = b[k];
    if (b.status && b.status !== v.status) {
      v.status = b.status;
      if (b.status === "open") Object.assign(v, { resolvedOn: null, resolvedByUserId: null, clearedByInspectionId: null });
      else Object.assign(v, { resolvedOn: today(), resolvedByUserId: req.user.id });
    }
    res.json(violationRow(v, today()));
  });
  ip.delete("/violations/:id", WRITE.settings, (req, res) => { db.violations = db.violations.filter(v => v.id !== Number(req.params.id)); res.json({ ok: true }); });

  // Permits ------------------------------------------------------------------
  const permitDetail = (p) => ({
    ...p, ...permitRow(p), createdByName: nameOf(p.createdByUserId), today: today(),
    inspections: db.inspections.filter(i => i.permitId === p.id).sort(newestInspection).map(inspectionRow),
    event: p.eventId ? (({ id, number, title, startsAt }) => ({ id, number, title, startsAt }))(byId(db.events, p.eventId)) : null,
  });
  const resolvePlace = (b, res, required = true) => {
    let place = { preplanId: b.preplanId ?? null, placeName: clean(b.placeName), address: clean(b.address), latitude: b.latitude ?? null, longitude: b.longitude ?? null };
    if (place.preplanId) {
      const p = byId(db.preplans, place.preplanId);
      if (!p) { res.status(404).json({ error: "Business not found" }); return null; }
      place = { ...place, placeName: place.placeName ?? p.name, address: place.address ?? p.address, latitude: place.latitude ?? p.latitude, longitude: place.longitude ?? p.longitude };
    }
    if (required && !place.address) { res.status(400).json({ error: "Pick a business or type an address." }); return null; }
    return place;
  };
  ip.get("/permits", (req, res) => {
    const t = today();
    const status = String(req.query.status ?? "all");
    const ts = terms(req.query.q);
    let rows = db.permits.filter(p => status === "waiting" ? ["applied", "in_review", "corrections", "approved"].includes(p.status)
      : status === "active" ? p.status === "issued" : status === "closed" ? ["finaled", "denied", "expired", "void"].includes(p.status)
      : status === "expiring" ? p.status === "issued" && p.expiresOn && p.expiresOn <= addDays(t, 30) : true);
    if (req.query.category) rows = rows.filter(p => p.category === req.query.category);
    if (Number(req.query.preplanId) > 0) rows = rows.filter(p => p.preplanId === Number(req.query.preplanId));
    rows = rows.filter(p => matches(ts, p.number, p.placeName, p.address, p.applicantName, p.applicantCompany)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ today: t, rows: rows.map(permitRow) });
  });
  ip.get("/permits/:id", (req, res) => { const p = byId(db.permits, req.params.id); if (!p) return res.status(404).json({ error: "Permit not found" }); res.json(permitDetail(p)); });
  const permitFields = ["applicantName", "applicantCompany", "applicantPhone", "applicantEmail", "description", "valuationCents", "feeCents", "feePaid", "appliedOn", "expiresOn", "conditions", "reviewerUserId", "eventId"];
  ip.post("/permits", WRITE.permits, (req, res) => {
    const b = req.body ?? {};
    const type = settingsDto().permitTypes.find(t => t.key === b.typeKey);
    if (!type) return res.status(400).json({ error: "Pick a type of permit." });
    const place = resolvePlace(b, res); if (!place) return;
    const p = newPermit({ id: nextId(), number: num("permit"), typeKey: type.key, category: type.category, status: "applied", ...place,
      ...Object.fromEntries(permitFields.filter(k => b[k] !== undefined).map(k => [k, typeof b[k] === "string" ? clean(b[k]) : b[k]])),
      feeCents: b.feeCents !== undefined ? b.feeCents : type.feeCents, appliedOn: b.appliedOn ?? today(), createdByUserId: req.user.id,
      history: [hist(req, `Application taken: ${type.label}`)] });
    db.permits.push(p);
    res.status(201).json(permitDetail(p));
  });
  ip.patch("/permits/:id", WRITE.permits, (req, res) => {
    const p = byId(db.permits, req.params.id);
    if (!p) return res.status(404).json({ error: "Permit not found" });
    const b = req.body ?? {};
    if (b.typeKey && b.typeKey !== p.typeKey) { const type = settingsDto().permitTypes.find(t => t.key === b.typeKey); if (type) { p.typeKey = type.key; p.category = type.category; p.history.push(hist(req, `Type changed to ${type.label}`)); } }
    if (b.feePaid !== undefined && b.feePaid !== p.feePaid) p.history.push(hist(req, b.feePaid ? "Fee marked paid" : "Fee marked unpaid"));
    for (const k of permitFields) if (b[k] !== undefined) p[k] = typeof b[k] === "string" ? clean(b[k]) : b[k];
    res.json(permitDetail(p));
  });
  ip.post("/permits/:id/review", WRITE.permits, (req, res) => {
    const p = byId(db.permits, req.params.id);
    if (!p) return res.status(404).json({ error: "Permit not found" });
    const { outcome, comments = "" } = req.body ?? {};
    if ((outcome === "corrections" || outcome === "denied") && !String(comments).trim()) return res.status(400).json({ error: "Say what has to change, so the applicant can fix it." });
    p.reviews.push({ id: lineId(), at: iso(Date.now()), by: who(req), outcome, comments: String(comments).trim() });
    p.status = { approved: "approved", corrections: "corrections", denied: "denied" }[outcome] ?? (p.status === "applied" ? "in_review" : p.status);
    p.reviewerUserId ??= req.user.id;
    p.history.push(hist(req, { approved: "Plans approved", corrections: "Corrections required", denied: "Denied", comment: "Review comment" }[outcome]));
    res.json(permitDetail(p));
  });
  ip.post("/permits/:id/status", WRITE.permits, (req, res) => {
    const p = byId(db.permits, req.params.id);
    if (!p) return res.status(404).json({ error: "Permit not found" });
    const { status, note } = req.body ?? {};
    const t = today();
    const label = { applied: "Back to applied", in_review: "Plan review started", corrections: "Corrections required", approved: "Approved", issued: "Permit issued", finaled: "Final approved, permit closed", denied: "Denied", expired: "Expired", void: "Voided" }[status];
    if (!label) return res.status(400).json({ error: "Unknown status" });
    p.status = status;
    if (status === "issued") { p.issuedOn = t; const vd = settingsDto().permitTypes.find(x => x.key === p.typeKey)?.validDays; if (!p.expiresOn) p.expiresOn = vd ? addDays(t, vd) : null; }
    if (status === "finaled") p.finaledOn = t;
    if (["applied", "in_review", "corrections", "approved"].includes(status)) { p.issuedOn = null; p.finaledOn = null; }
    p.history.push(hist(req, `${label}${note ? `: ${note}` : ""}`));
    res.json(permitDetail(p));
  });
  ip.delete("/permits/:id", WRITE.settings, (req, res) => { db.permits = db.permits.filter(p => p.id !== Number(req.params.id)); res.json({ ok: true }); });

  // Complaints -------------------------------------------------------------
  const caseDetail = (req, c) => {
    const see = can(req, "manage_cases") || can(req, "manage_settings");
    const t = today();
    return {
      ...c, ...caseRow(c),
      complainantName: see ? c.complainantName : null, complainantPhone: see ? c.complainantPhone : null, complainantEmail: see ? c.complainantEmail : null,
      complainantHidden: !see && !c.anonymous && !!(c.complainantName || c.complainantPhone || c.complainantEmail),
      violations: db.violations.filter(v => v.caseId === c.id).map(v => violationRow(v, t)),
      inspections: db.inspections.filter(i => i.caseId === c.id).sort(newestInspection).map(inspectionRow), today: t,
    };
  };
  ip.get("/cases", (req, res) => {
    const t = today();
    const status = String(req.query.status ?? "open");
    const ts = terms(req.query.q);
    let rows = db.cases.filter(c => status === "open" ? c.status !== "closed" : status === "closed" ? c.status === "closed" : status === "due" ? c.status !== "closed" && c.dueOn && c.dueOn <= t : true);
    if (req.query.scope === "mine") rows = rows.filter(c => c.assignedUserId === req.user.id);
    if (Number(req.query.preplanId) > 0) rows = rows.filter(c => c.preplanId === Number(req.query.preplanId));
    rows = rows.filter(c => matches(ts, c.number, c.placeName, c.address)).sort((a, b) => (a.dueOn ?? "2999").localeCompare(b.dueOn ?? "2999"));
    res.json({ today: t, rows: rows.map(caseRow) });
  });
  ip.get("/cases/:id", (req, res) => { const c = byId(db.cases, req.params.id); if (!c) return res.status(404).json({ error: "Complaint not found" }); res.json(caseDetail(req, c)); });
  const caseFields = ["source", "priority", "description", "complainantName", "complainantPhone", "complainantEmail", "anonymous", "ownerName", "ownerMailingAddress", "assignedUserId", "dueOn"];
  ip.post("/cases", WRITE.cases, (req, res) => {
    const b = req.body ?? {};
    const type = settingsDto().caseTypes.find(t => t.key === b.typeKey);
    if (!type) return res.status(400).json({ error: "Pick what the complaint is about." });
    const place = resolvePlace(b, res); if (!place) return;
    const anonymous = !!b.anonymous;
    const c = newCase({ id: nextId(), number: num("case"), typeKey: type.key, status: "open", ...place,
      ...Object.fromEntries(caseFields.filter(k => b[k] !== undefined).map(k => [k, typeof b[k] === "string" ? clean(b[k]) : b[k]])),
      ...(anonymous ? { complainantName: null, complainantPhone: null, complainantEmail: null } : {}), anonymous,
      dueOn: b.dueOn ?? addDays(today(), type.complianceDays === 0 ? 0 : 2), receivedAt: b.receivedAt ?? iso(Date.now()),
      history: [hist(req, `Complaint received: ${type.label}`)] });
    db.cases.push(c);
    res.status(201).json(caseDetail(req, c));
  });
  ip.patch("/cases/:id", WRITE.cases, (req, res) => {
    const c = byId(db.cases, req.params.id);
    if (!c) return res.status(404).json({ error: "Complaint not found" });
    const b = req.body ?? {};
    if (b.typeKey) c.typeKey = b.typeKey;
    if (b.assignedUserId !== undefined && b.assignedUserId !== c.assignedUserId) c.history.push(hist(req, b.assignedUserId ? `Assigned to ${nameOf(b.assignedUserId)}` : "Unassigned"));
    if (b.dueOn !== undefined && b.dueOn !== c.dueOn) c.history.push(hist(req, b.dueOn ? `Next date set to ${b.dueOn}` : "Next date cleared"));
    for (const k of caseFields) if (b[k] !== undefined) c[k] = typeof b[k] === "string" ? clean(b[k]) : b[k];
    if (c.anonymous) Object.assign(c, { complainantName: null, complainantPhone: null, complainantEmail: null });
    res.json(caseDetail(req, c));
  });
  ip.post("/cases/:id/notices", WRITE.cases, (req, res) => {
    const c = byId(db.cases, req.params.id);
    if (!c) return res.status(404).json({ error: "Complaint not found" });
    const b = req.body ?? {};
    if (!isDay(b.sentOn) || !b.method) return res.status(400).json({ error: "Say when and how the notice went." });
    c.notices.push({ id: lineId(), sentOn: b.sentOn, method: b.method, dueOn: b.dueOn ?? null, note: b.note ?? "", by: who(req) });
    if (!["cited", "abatement"].includes(c.status)) c.status = "notice";
    if (b.dueOn) c.dueOn = b.dueOn;
    c.history.push(hist(req, `Notice sent (${b.method})${b.dueOn ? `, to comply by ${b.dueOn}` : ""}`));
    res.json(caseDetail(req, c));
  });
  ip.post("/cases/:id/status", WRITE.cases, (req, res) => {
    const c = byId(db.cases, req.params.id);
    if (!c) return res.status(404).json({ error: "Complaint not found" });
    const { status, resolution, note } = req.body ?? {};
    if (status === "closed" && !resolution) return res.status(400).json({ error: "Say how the complaint ended before closing it." });
    c.status = status; c.resolution = status === "closed" ? resolution : null; c.closedAt = status === "closed" ? iso(Date.now()) : null;
    c.history.push(hist(req, status === "closed" ? `Closed: ${resolution}${note ? `. ${note}` : ""}` : `${{ open: "Reopened", investigating: "Being looked into", notice: "Notice stage", cited: "Citation issued", abatement: "Sent for abatement" }[status]}${note ? `: ${note}` : ""}`));
    res.json(caseDetail(req, c));
  });
  ip.delete("/cases/:id", WRITE.settings, (req, res) => { db.cases = db.cases.filter(c => c.id !== Number(req.params.id)); res.json({ ok: true }); });

  // Events -----------------------------------------------------------------
  const eventDetail = (e) => ({
    ...e, staff: e.staffUserIds.map(id => ({ id, name: nameOf(id) ?? "A former member" })), crowdManagersNeeded: crowdManagersNeeded(e.expectedAttendance),
    permits: db.permits.filter(p => p.eventId === e.id).map(permitRow), inspections: db.inspections.filter(i => i.eventId === e.id).map(inspectionRow), today: today(),
  });
  const tasksFor = (kind, features) => {
    const lines = [...(CATALOG.eventTasks[kind] ?? CATALOG.eventTasks.other)];
    for (const f of features) for (const l of CATALOG.eventFeatureTasks[f] ?? []) if (!lines.includes(l)) lines.push(l);
    return lines.map(text => ({ id: lineId(), text, done: false, doneBy: null, doneAt: null }));
  };
  ip.get("/events", (req, res) => {
    const when = String(req.query.when ?? "upcoming");
    const now = Date.now();
    const ts = terms(req.query.q);
    const rows = db.events.filter(e => when === "upcoming" ? Date.parse(e.endsAt) >= now && e.status !== "cancelled" : when === "past" ? Date.parse(e.endsAt) < now : true)
      .filter(e => matches(ts, e.number, e.title, e.locationName, e.address))
      .sort((a, b) => (when === "past" ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)));
    res.json(rows.map(eventRow));
  });
  ip.get("/events/:id", (req, res) => { const e = byId(db.events, req.params.id); if (!e) return res.status(404).json({ error: "Event not found" }); res.json(eventDetail(e)); });
  const eventFields = ["title", "kind", "status", "startsAt", "endsAt", "locationName", "organizerName", "organizerOrg", "organizerPhone", "organizerEmail", "expectedAttendance", "occupantLoad", "crowdManagers", "features", "standby", "staffUserIds", "tasks", "notes", "actualAttendance", "smokeAlarmsInstalled", "report", "showOnCalendar"];
  ip.post("/events", WRITE.events, (req, res) => {
    const b = req.body ?? {};
    if (!clean(b.title)) return res.status(400).json({ error: "Give the event a name" });
    if (!b.startsAt || !b.endsAt || b.endsAt < b.startsAt) return res.status(400).json({ error: "The event has to end after it starts." });
    const place = resolvePlace(b, res, false); if (!place) return;
    const e = newEvent({ id: nextId(), number: num("event"), ...place, ...Object.fromEntries(eventFields.filter(k => b[k] !== undefined).map(k => [k, b[k]])),
      tasks: b.tasks ?? tasksFor(b.kind, b.features ?? []), history: [hist(req, "Event added")] });
    db.events.push(e);
    res.status(201).json(eventDetail(e));
  });
  ip.patch("/events/:id", WRITE.events, (req, res) => {
    const e = byId(db.events, req.params.id);
    if (!e) return res.status(404).json({ error: "Event not found" });
    const b = req.body ?? {};
    if (b.status && b.status !== e.status) e.history.push(hist(req, { planning: "Back to planning", approved: "Approved", completed: "Marked done", cancelled: "Cancelled" }[b.status]));
    for (const k of eventFields) if (b[k] !== undefined) e[k] = b[k];
    res.json(eventDetail(e));
  });
  ip.delete("/events/:id", WRITE.settings, (req, res) => { db.events = db.events.filter(e => e.id !== Number(req.params.id)); res.json({ ok: true }); });

  // Investigations (confidential: every route needs the permission) ----------
  ip.get("/investigations", WRITE.inv, (req, res) => {
    const status = String(req.query.status ?? "open");
    const ts = terms(req.query.q);
    res.json(db.investigations.filter(x => status === "open" ? x.status !== "closed" : status === "closed" ? x.status === "closed" : true)
      .filter(x => matches(ts, x.number, x.title, x.address, x.placeName, x.incidentNumber))
      .map(x => ({ id: x.id, number: x.number, title: x.title, status: x.status, occurredAt: x.occurredAt, address: x.address, placeName: x.placeName, causeClass: x.causeClass, leadUserId: x.leadUserId, leadName: nameOf(x.leadUserId), incidentNumber: x.incidentNumber })));
  });
  ip.get("/investigations/:id", WRITE.inv, (req, res) => { const x = byId(db.investigations, req.params.id); if (!x) return res.status(404).json({ error: "Investigation not found" }); res.json({ ...x, leadName: nameOf(x.leadUserId) }); });
  const invFields = ["title", "status", "occurredAt", "incidentNumber", "commandIncidentId", "propertyType", "areaOfOrigin", "heatSource", "firstItemIgnited", "causeClass", "nerisCause", "causeNotes", "lossCents", "injuries", "fatalities", "leadUserId", "narrative", "evidence", "interviews", "referral", "arrestMade"];
  ip.post("/investigations", WRITE.inv, (req, res) => {
    const b = req.body ?? {};
    if (!clean(b.title)) return res.status(400).json({ error: "Give the investigation a title" });
    const place = resolvePlace(b, res); if (!place) return;
    const x = newInvestigation({ id: nextId(), number: num("investigation"), ...place, ...Object.fromEntries(invFields.filter(k => b[k] !== undefined).map(k => [k, b[k]])),
      leadUserId: b.leadUserId ?? req.user.id, history: [hist(req, "Investigation opened")] });
    db.investigations.push(x);
    res.status(201).json({ ...x, leadName: nameOf(x.leadUserId) });
  });
  ip.patch("/investigations/:id", WRITE.inv, (req, res) => {
    const x = byId(db.investigations, req.params.id);
    if (!x) return res.status(404).json({ error: "Investigation not found" });
    const b = req.body ?? {};
    if (b.status && b.status !== x.status) { x.history.push(hist(req, { open: "Reopened", pending: "Waiting on lab or information", closed: "Closed" }[b.status])); x.closedAt = b.status === "closed" ? iso(Date.now()) : null; }
    if (b.causeClass !== undefined && b.causeClass !== x.causeClass) x.history.push(hist(req, b.causeClass ? `Cause classified ${b.causeClass}` : "Cause classification cleared"));
    for (const k of invFields) if (b[k] !== undefined) x[k] = b[k];
    res.json({ ...x, leadName: nameOf(x.leadUserId) });
  });
  ip.delete("/investigations/:id", WRITE.inv, WRITE.settings, (req, res) => { db.investigations = db.investigations.filter(x => x.id !== Number(req.params.id)); res.json({ ok: true }); });

  ip.get("/command-incidents", WRITE.inv, (_req, res) => res.json(db.commandIncidents));

  // Files and notes ------------------------------------------------------------
  const KINDS = { inspections: ["inspections", WRITE.inspect], violations: ["violations", WRITE.violations], permits: ["permits", WRITE.permits], cases: ["cases", WRITE.cases], events: ["events", WRITE.events], investigations: ["investigations", WRITE.inv] };
  const recordOf = (kind, id) => (KINDS[kind] ? byId(db[KINDS[kind][0]], id) : null);
  ip.post("/files/:kind/:id", express.raw({ type: () => true, limit: "25mb" }), (req, res, next) => (KINDS[req.params.kind] ? KINDS[req.params.kind][1](req, res, next) : res.status(404).json({ error: "Not found" })), (req, res) => {
    const rec = recordOf(req.params.kind, req.params.id);
    if (!rec) return res.status(404).json({ error: "Not found" });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "The file is empty." });
    const key = `/objects/inspections/${crypto.randomUUID()}`;
    const contentType = String(req.headers["content-type"] ?? "application/octet-stream").split(";")[0];
    db.files.set(key, { body: req.body, contentType });
    let name = "File"; try { name = decodeURIComponent(String(req.headers["x-file-name"] ?? "File")); } catch { /* as sent */ }
    rec.attachments.push({ key, name, contentType, size: req.body.length, uploadedAt: iso(Date.now()), uploadedBy: who(req) });
    res.status(201).json(rec.attachments);
  });
  ip.get("/files/:kind/:id", (req, res) => {
    if (req.params.kind === "investigations" && !can(req, "investigations")) return res.status(403).json({ error: "You don't have permission to see this." });
    const rec = recordOf(req.params.kind, req.params.id);
    const f = rec?.attachments.find(a => a.key === req.query.key);
    const blob = f && db.files.get(f.key);
    if (!blob) return res.status(404).json({ error: "File not found" });
    res.setHeader("Content-Type", blob.contentType);
    res.setHeader("Content-Disposition", `${req.query.download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.end(blob.body);
  });
  ip.delete("/files/:kind/:id", (req, res, next) => (KINDS[req.params.kind] ? KINDS[req.params.kind][1](req, res, next) : res.status(404).json({ error: "Not found" })), (req, res) => {
    const rec = recordOf(req.params.kind, req.params.id);
    if (!rec) return res.status(404).json({ error: "Not found" });
    rec.attachments = rec.attachments.filter(a => a.key !== req.query.key);
    db.files.delete(String(req.query.key));
    res.json(rec.attachments);
  });
  ip.post("/notes/:kind/:id", (req, res, next) => (KINDS[req.params.kind] && req.params.kind !== "violations" ? KINDS[req.params.kind][1](req, res, next) : res.status(404).json({ error: "Not found" })), (req, res) => {
    const rec = recordOf(req.params.kind, req.params.id);
    if (!rec) return res.status(404).json({ error: "Not found" });
    if (!clean(req.body?.text)) return res.status(400).json({ error: "Write the note first" });
    rec.history.push(hist(req, clean(req.body.text), "note"));
    res.status(201).json(rec.history);
  });

  ip.get("/search", (req, res) => {
    const ts = terms(req.query.q);
    const empty = { properties: [], inspections: [], permits: [], cases: [], events: [], investigations: [] };
    if (!ts.length) return res.json(empty);
    const top = (list) => list.slice(0, 8);
    res.json({
      properties: top(db.preplans.filter(p => matches(ts, p.name, p.address, p.preplanNumber, p.occupancyType)).map(p => ({ id: p.id, name: p.name, address: p.address }))),
      inspections: top(db.inspections.filter(i => matches(ts, i.number, i.address, i.placeName)).map(i => ({ id: i.id, number: i.number, placeName: i.placeName, address: i.address, status: i.status, scheduledOn: i.scheduledOn }))),
      permits: top(db.permits.filter(p => matches(ts, p.number, p.address, p.placeName, p.applicantName, p.applicantCompany)).map(p => ({ id: p.id, number: p.number, placeName: p.placeName, address: p.address, status: p.status }))),
      cases: top(db.cases.filter(c => matches(ts, c.number, c.address, c.placeName, c.ownerName)).map(c => ({ id: c.id, number: c.number, placeName: c.placeName, address: c.address, status: c.status }))),
      events: top(db.events.filter(e => matches(ts, e.number, e.title, e.address, e.locationName, e.organizerName)).map(e => ({ id: e.id, number: e.number, title: e.title, address: e.address, startsAt: e.startsAt }))),
      investigations: can(req, "investigations") ? top(db.investigations.filter(x => matches(ts, x.number, x.title, x.address, x.incidentNumber)).map(x => ({ id: x.id, number: x.number, title: x.title, address: x.address, status: x.status }))) : [],
    });
  });

  return r;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

function newPreplan(id, f) {
  return {
    id, isActive: true, preplanNumber: null, firstDueStation: "Station 1", tenancy: "standalone", masterPreplanId: null, lastInspectedAt: null,
    occupancyType: null, phone: null, latitude: null, longitude: null, ...f,
    detail: {
      phone: f.phone ?? null, emergencyContacts: f.contacts ?? [], constructionType: f.constructionType ?? "unknown",
      floorsAbove: f.floors ?? 1, floorsBelow: null, squareFeet: f.squareFeet ?? null, occupantLoadDay: f.occupantLoad ?? null, occupantLoadNight: null,
      hoursOccupied: f.hours ?? null, hasSprinklers: !!f.sprinklers, sprinklerCoverage: f.sprinklers ? "full" : null, sprinklerSystem: f.sprinklers ? "Wet pipe" : null,
      sprinklerRoom: f.sprinklers ? "Rear corridor, riser closet" : null, hasStandpipe: false, standpipeClass: null, hasFireAlarm: !!f.alarm,
      fireAlarmPanel: f.alarm ? "Front entry, behind the counter" : null, fdcLocation: f.sprinklers ? "Side A, left of the main door" : null,
      knoxBoxLocation: f.knox ?? null, firePump: null, waterShutoff: "Meter at the street, side A", gasShutoff: f.gas ? "Side C, at the meter" : null,
      electricShutoff: "Side C, main disconnect", hazards: f.hazards ?? null, specialHazards: f.specialHazards ?? [], hazmatNotes: null,
      accessNotes: null, accessProblems: null, visits: f.visits ?? [], lastInspectedAt: null, updatedAt: new Date().toISOString(),
    },
  };
}

function newInspection(f) {
  return {
    discipline: "fire", status: "scheduled", result: null, scheduledOn: null, scheduledTime: null, assignedUserId: null, checklistId: null, checklist: [],
    notes: null, contactName: null, contactTitle: null, signature: null, signedName: null, signedAt: null, feeCents: null, feePaid: false,
    startedAt: null, completedAt: null, completedByUserId: null, cancelReason: null, permitId: null, caseId: null, eventId: null, parentId: null,
    attachments: [], history: [], createdAt: new Date().toISOString(), latitude: null, longitude: null, preplanId: null, placeName: null, ...f,
  };
}

function newViolation(f) {
  return {
    inspectionId: null, caseId: null, preplanId: null, placeName: null, codeRef: null, description: null, location: null, correctiveAction: null,
    severity: "serious", dueOn: null, status: "open", resolvedOn: null, resolvedByUserId: null, clearedByInspectionId: null, resolutionNote: null,
    attachments: [], createdAt: new Date().toISOString(), ...f,
  };
}

function newPermit(f) {
  return {
    preplanId: null, placeName: null, latitude: null, longitude: null, applicantName: null, applicantCompany: null, applicantPhone: null, applicantEmail: null,
    description: null, valuationCents: null, feeCents: null, feePaid: false, appliedOn: null, issuedOn: null, expiresOn: null, finaledOn: null, conditions: null,
    reviews: [], reviewerUserId: null, eventId: null, attachments: [], history: [], createdByUserId: 1, createdAt: new Date().toISOString(), ...f,
  };
}

function newCase(f) {
  return {
    source: "complaint", priority: "normal", resolution: null, preplanId: null, placeName: null, latitude: null, longitude: null, description: null,
    complainantName: null, complainantPhone: null, complainantEmail: null, anonymous: false, ownerName: null, ownerMailingAddress: null,
    assignedUserId: null, dueOn: null, receivedAt: new Date().toISOString(), closedAt: null, notices: [], attachments: [], history: [], ...f,
  };
}

function newEvent(f) {
  return {
    kind: "special_event", status: "planning", locationName: null, address: null, latitude: null, longitude: null, preplanId: null,
    organizerName: null, organizerOrg: null, organizerPhone: null, organizerEmail: null, expectedAttendance: null, occupantLoad: null, crowdManagers: null,
    features: [], standby: null, staffUserIds: [], tasks: [], notes: null, actualAttendance: null, smokeAlarmsInstalled: null, report: null,
    showOnCalendar: true, attachments: [], history: [], ...f,
  };
}

function newInvestigation(f) {
  return {
    status: "open", occurredAt: null, incidentNumber: null, commandIncidentId: null, preplanId: null, placeName: null, latitude: null, longitude: null,
    propertyType: null, areaOfOrigin: null, heatSource: null, firstItemIgnited: null, causeClass: null, nerisCause: null, causeNotes: null,
    lossCents: null, injuries: null, fatalities: null, leadUserId: null, narrative: null, evidence: [], interviews: [], referral: null, arrestMade: false,
    closedAt: null, attachments: [], history: [], createdAt: new Date().toISOString(), ...f,
  };
}

// ---------------------------------------------------------------------------
// The demo department. Every name, business and address is made up.
// ---------------------------------------------------------------------------

function seed() {
  const t = today();
  const db = {
    id: 1000, seq: {}, files: new Map(),
    settings: {
      officeName: "Office of the Fire Marshal", codeEdition: "2018", frequencyMonths: { ...CATALOG.frequencyMonths }, defaultComplianceDays: 30,
      inspectionTypes: null, permitTypes: null, caseTypes: null, violationCodes: null, fees: null, letter: null, updatedAt: null,
    },
    checklists: CATALOG.checklists["2018"].map((c, i) => ({ id: 100 + i, ...c, isActive: true, sortOrder: i })),
    preplans: [], programs: [], hydrants: [], inspections: [], violations: [], permits: [], cases: [], events: [], investigations: [], commandIncidents: [],
  };
  const num = (kind) => {
    db.seq[kind] = (db.seq[kind] ?? 0) + 1;
    return `${{ inspection: "INS", permit: "P", case: "CE", event: "EV", investigation: "FI" }[kind]}-${t.slice(0, 4)}-${String(db.seq[kind]).padStart(4, "0")}`;
  };
  const by = "Alex Rivera";
  const h = (text, daysAgo = 0) => ({ at: at(-daysAgo, 9), by, text, kind: "change" });

  // Businesses, around a made-up town centre.
  const B = [
    { name: "Riverbend Pizza Kitchen", address: "1200 Meridian Pkwy, Demo City, TX 77583", ll: [29.4402, -95.4058], type: "Restaurant", oc: "A-2", risk: "high", due: 349, last: -16, owner: "Riverbend Foods LLC", sprinklers: true, alarm: true, gas: true, knox: "Side A, right of the door", load: 85, contacts: [{ name: "Maria Lopez", role: "Manager", phone: "(281) 555-0110", keyHolder: true }] },
    { name: "Little Oaks Learning Center", address: "455 Oak Hollow Dr, Demo City, TX 77583", ll: [29.4361, -95.4122], type: "Daycare", oc: "E", risk: "high", due: 9, last: -356, owner: "Little Oaks Inc.", sprinklers: false, alarm: true, load: 64, contacts: [{ name: "Janet Wu", role: "Director", phone: "(281) 555-0121" }] },
    { name: "Demo City Feed & Supply", address: "8800 County Road 48, Demo City, TX 77583", ll: [29.4295, -95.3981], type: "Farm and feed store", oc: "M", risk: "low", due: 220, last: -875, owner: "T. Hanley", sprinklers: false, alarm: false, specialHazards: ["propane", "high_piled_storage"] },
    { name: "Sterling Shell Station", address: "3001 Main St, Demo City, TX 77583", ll: [29.4447, -95.4011], type: "Fuel station and store", oc: "M", risk: "moderate", due: -40, last: -770, owner: "Sterling Fuel Co.", sprinklers: false, alarm: true, specialHazards: ["propane"] },
    { name: "Meadow Ridge Assisted Living", address: "77 Meadow Ridge Ln, Demo City, TX 77583", ll: [29.4510, -95.4170], type: "Assisted living", oc: "I-1", risk: "high", due: 21, last: -344, owner: "Meadow Ridge Senior Living", sprinklers: true, alarm: true, knox: "Main entry, left", load: 72, specialHazards: ["medical_oxygen", "limited_mobility"] },
    { name: "Grace Fellowship Church", address: "620 Church St, Demo City, TX 77583", ll: [29.4391, -95.3925], type: "Church", oc: "A-3", risk: "high", due: 160, last: -205, owner: "Grace Fellowship", sprinklers: false, alarm: true, load: 300 },
    { name: "Bayou Auto Repair", address: "1415 Industrial Blvd, Demo City, TX 77583", ll: [29.4250, -95.4090], type: "Auto repair", oc: "S-1", risk: "moderate", due: -5, last: -735, owner: "Bayou Auto LLC", sprinklers: false, alarm: false, specialHazards: ["compressed_gas"] },
    { name: "Lakeside Apartments", address: "2200 Lakeside Dr, Demo City, TX 77583", ll: [29.4555, -95.4005], type: "Apartments (96 units)", oc: "R-2", risk: "high", due: 3, last: -362, owner: "Lakeside Residential Partners", sprinklers: true, alarm: true, knox: "Leasing office, side A" },
    { name: "Coastal Self Storage", address: "9100 Highway 288 Frontage, Demo City, TX 77583", ll: [29.4205, -95.3940], type: "Self storage", oc: "S-1", risk: "low", due: 600, last: -495, owner: "Coastal Storage Co.", sprinklers: false, alarm: false },
    { name: "Demo City Elementary", address: "1 School Way, Demo City, TX 77583", ll: [29.4470, -95.4110], type: "School", oc: "E", risk: "high", due: 45, last: -320, owner: "Demo ISD", sprinklers: true, alarm: true, knox: "Office entrance", load: 650 },
    { name: "Northside Dental", address: "3150 Main St, Suite B, Demo City, TX 77583", ll: [29.4452, -95.4020], type: "Dental office", oc: "B", risk: "low", due: 410, last: -685, owner: "Dr. P. Shah", sprinklers: false, alarm: true },
    { name: "Brazos Valley Water Plant", address: "500 Plant Rd, Demo City, TX 77583", ll: [29.4180, -95.4210], type: "Water treatment plant", oc: "F-2", risk: "critical", due: 130, last: -235, owner: "City of Demo City", sprinklers: false, alarm: true, specialHazards: ["pool_chemicals"] },
    { name: "Main Street Shops", address: "3100-3160 Main St, Demo City, TX 77583", ll: [29.4449, -95.4016], type: "Strip center", tenancy: "master" },
  ];
  B.forEach((b, i) => {
    const id = 10 + i;
    const p = newPreplan(id, {
      name: b.name, address: b.address, latitude: b.ll[0], longitude: b.ll[1], occupancyType: b.type, preplanNumber: `OCC-${String(1040 + i)}`,
      phone: `(281) 555-${String(200 + i * 7).padStart(4, "0")}`, sprinklers: b.sprinklers, alarm: b.alarm, gas: b.gas, knox: b.knox, occupantLoad: b.load,
      contacts: b.contacts, specialHazards: b.specialHazards, tenancy: b.tenancy ?? "standalone", squareFeet: 2400 + i * 1300,
      constructionType: ["type_v", "type_ii", "type_iii"][i % 3], hours: "Mon–Sat, 7 AM – 9 PM",
      visits: b.last ? [{ date: addDays(t, b.last), kind: "Inspection", by: "Dana Brooks", notes: "Annual fire inspection: Passed." }] : [],
    });
    db.preplans.push(p);
    if (b.oc) {
      db.programs.push({
        preplanId: id, onProgram: true, occupancyClass: b.oc, riskClass: b.risk, frequencyMonths: null, nextDueOn: addDays(t, b.due),
        lastInspectedOn: b.last ? addDays(t, b.last) : null, ownerName: b.owner, ownerPhone: "(281) 555-0199", ownerEmail: null,
        ownerMailingAddress: null, businessLicense: `BL-${2400 + i}`, notes: null,
      });
    }
  });
  // Northside Dental is a tenant of Main Street Shops.
  db.preplans.find(p => p.name === "Northside Dental").masterPreplanId = db.preplans.find(p => p.name === "Main Street Shops").id;
  const P = (name) => db.preplans.find(p => p.name === name);

  // Hydrants on a rough grid.
  let hid = 1;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    db.hydrants.push({
      id: hid, identifier: `H-${100 + hid}`, latitude: 29.418 + r * 0.0072, longitude: -95.422 + c * 0.0047,
      hydrantClass: ["AA", "A", "B", "A", "C"][hid % 5], flowGpm: [1600, 1200, 800, 1100, 450][hid % 5], inService: hid % 17 !== 0, isDraftSite: false,
    });
    hid++;
  }

  const lists = db.checklists;
  const full = lists.find(l => l.name === "Fire inspection: full");
  const small = lists.find(l => l.name === "Fire inspection: small business");
  const kitchen = lists.find(l => l.name === "Restaurant and commercial kitchen");
  const daycare = lists.find(l => l.name === "Daycare, foster home and assisted living");
  const answers = (list, fail = []) => list.items.map(x => ({ ...x, result: fail.includes(x.id) ? "fail" : "ok", note: "" }));
  const blank = (list) => list.items.map(x => ({ ...x, result: null, note: "" }));
  const place = (p) => ({ preplanId: p.id, placeName: p.name, address: p.address, latitude: p.latitude, longitude: p.longitude });
  const code = (id) => CATALOG.violationCodes["2018"].find(c => c.id === id);

  // A failed annual at the pizza place, with violations, one now overdue, and its re-inspection today.
  const pizza = P("Riverbend Pizza Kitchen");
  const failed = newInspection({
    id: ++db.id, number: num("inspection"), typeKey: "annual", ...place(pizza), status: "completed", result: "fail",
    scheduledOn: addDays(t, -16), scheduledTime: "10:00", assignedUserId: 2, checklistId: kitchen.id,
    checklist: answers(kitchen, ["hood_service", "exits_clear", "ext_service"]), completedAt: at(-16, 11), completedByUserId: 2, startedAt: at(-16, 10),
    contactName: "Maria Lopez", contactTitle: "Manager", notes: "Back hallway used for storing boxes. Hood tag expired in March.",
    history: [h("Scheduled", 30), { ...h("Finished: Failed", 16), by: "Dana Brooks" }],
  });
  db.inspections.push(failed);
  for (const [id, days, status] of [["hood_service", -2, "open"], ["exits_clear", -16, "corrected"], ["ext_service", 12, "open"]]) {
    const c = code(id);
    db.violations.push(newViolation({
      id: ++db.id, inspectionId: failed.id, ...place(pizza), codeRef: c.code, title: c.title, description: c.description,
      correctiveAction: c.correctiveAction, severity: c.severity, dueOn: addDays(t, days), status,
      location: id === "exits_clear" ? "Back hallway to the rear exit" : id === "hood_service" ? "Kitchen hood over the fryers" : "Dining room",
      resolvedOn: status === "corrected" ? addDays(t, -16) : null, resolutionNote: status === "corrected" ? "Corrected on site" : null, createdAt: at(-16, 11),
    }));
  }
  db.inspections.push(newInspection({
    id: ++db.id, number: num("inspection"), typeKey: "reinspection", ...place(pizza), parentId: failed.id, scheduledOn: t, scheduledTime: "09:30",
    assignedUserId: 1, history: [{ ...h("Booked to re-check the annual", 16), by: "Dana Brooks" }],
  }));

  // Today and this week for the demo user.
  const today1 = newInspection({ id: ++db.id, number: num("inspection"), typeKey: "license", ...place(P("Little Oaks Learning Center")), scheduledOn: t, scheduledTime: "13:00", assignedUserId: 1, checklistId: daycare.id, checklist: blank(daycare), notes: "State license renewal. Ask for Janet at the front office.", history: [h("Scheduled", 5)] });
  db.inspections.push(today1);
  db.inspections.push(newInspection({ id: ++db.id, number: num("inspection"), typeKey: "annual", ...place(P("Bayou Auto Repair")), scheduledOn: addDays(t, -2), assignedUserId: 1, checklistId: small.id, checklist: blank(small), history: [h("Scheduled", 9)] }));
  db.inspections.push(newInspection({ id: ++db.id, number: num("inspection"), typeKey: "annual", ...place(P("Lakeside Apartments")), scheduledOn: addDays(t, 2), scheduledTime: "10:00", assignedUserId: 1, checklistId: full.id, checklist: blank(full), history: [h("Scheduled", 3)] }));
  db.inspections.push(newInspection({ id: ++db.id, number: num("inspection"), typeKey: "annual", ...place(P("Meadow Ridge Assisted Living")), scheduledOn: addDays(t, 4), assignedUserId: 2, checklistId: daycare.id, checklist: blank(daycare), history: [h("Scheduled", 3)] }));
  db.inspections.push(newInspection({ id: ++db.id, number: num("inspection"), typeKey: "annual", ...place(P("Sterling Shell Station")), scheduledOn: null, assignedUserId: 1, checklistId: small.id, checklist: blank(small), history: [h("Added to the list", 2)] }));
  db.inspections.push(newInspection({ id: ++db.id, number: num("inspection"), typeKey: "annual", ...place(P("Grace Fellowship Church")), scheduledOn: addDays(t, -205), status: "completed", result: "pass", assignedUserId: 2, completedByUserId: 2, completedAt: at(-205, 11), checklistId: small.id, checklist: answers(small), history: [] }));

  // Permits.
  const permit = (f) => { const p = newPermit({ id: ++db.id, number: num("permit"), ...f }); db.permits.push(p); return p; };
  permit({ typeKey: "cn_sprinkler", category: "construction", status: "in_review", ...place(P("Lakeside Apartments")), applicantName: "Rick Dalton", applicantCompany: "Gulf Coast Fire Sprinkler", applicantPhone: "(713) 555-0188", description: "Add 14 heads to the clubhouse renovation; relocate 6.", appliedOn: addDays(t, -9), feeCents: 27000, reviewerUserId: 1, reviews: [{ id: lineId(), at: at(-6, 14), by, outcome: "comment", comments: "Hydraulic calcs received. Waiting on the water supply test." }], history: [h("Application taken", 9)] });
  permit({ typeKey: "bd_new_residential", category: "building", status: "corrections", address: "1180 Sandpiper Ct, Demo City, TX 77583", placeName: "Lot 14, Sandpiper Estates", latitude: 29.4590, longitude: -95.4080, applicantName: "J. Patel", applicantCompany: "Hearthstone Homes", description: "New single-family house, 2,450 sq ft.", appliedOn: addDays(t, -34), valuationCents: 31500000, feeCents: 185000, reviews: [{ id: lineId(), at: at(-28, 10), by, outcome: "corrections", comments: "Sheet A-2: show the garage-to-house door as 20-minute rated. Sheet S-1: missing the foundation engineer's seal." }], history: [h("Application taken", 34)] });
  permit({ typeKey: "op_hot_work", category: "operational", status: "issued", ...place(P("Bayou Auto Repair")), applicantName: "Leo Fontaine", applicantCompany: "Bayou Auto LLC", description: "Welding in the rear bay.", appliedOn: addDays(t, -350), issuedOn: addDays(t, -345), expiresOn: addDays(t, 20), feeCents: 10000, feePaid: true, conditions: "Fire watch during and 30 minutes after; extinguisher within 30 ft.", history: [h("Permit issued", 345)] });
  permit({ typeKey: "op_tent", category: "operational", status: "applied", address: "Demo City Park, 100 Park Ln, Demo City, TX 77583", placeName: "Demo City Park", latitude: 29.4420, longitude: -95.3890, applicantName: "Rotary Club of Demo City", description: "Two 40 x 60 ft tents for the fall festival.", appliedOn: addDays(t, -2), feeCents: 15000, history: [h("Application taken", 2)] });

  // Complaints.
  const kase = (f) => { const c = newCase({ id: ++db.id, number: num("case"), ...f }); db.cases.push(c); return c; };
  const grass = kase({ typeKey: "high_grass", status: "notice", address: "214 Willow Bend Dr, Demo City, TX 77583", latitude: 29.4335, longitude: -95.4170, description: "Grass over two feet tall in the back yard; the house looks empty.", complainantName: "A neighbour", complainantPhone: "(281) 555-0144", ownerName: "Willow Holdings LLC", ownerMailingAddress: "PO Box 4410, Houston, TX 77210", assignedUserId: 3, dueOn: addDays(t, -1), receivedAt: at(-12, 8), notices: [{ id: lineId(), sentOn: addDays(t, -8), method: "Certified mail", dueOn: addDays(t, -1), note: "Certified 7019 1120 0000 4455 1234", by: "Sam Ortiz" }], history: [h("Complaint received: High grass or weeds", 12), { ...h("Notice sent (Certified mail)", 8), by: "Sam Ortiz" }] });
  db.violations.push(newViolation({ id: ++db.id, caseId: grass.id, address: grass.address, codeRef: "IPMC 302.4", title: "High grass and weeds", description: "Grass and weeds over 24 inches in the back yard.", correctiveAction: "Mow the property and keep the grass and weeds below the allowed height.", severity: "minor", dueOn: addDays(t, -1), createdAt: at(-8, 10) }));
  kase({ typeKey: "junk_vehicle", status: "investigating", address: "38 Pecan Grove Ln, Demo City, TX 77583", latitude: 29.4480, longitude: -95.3960, description: "Car on blocks in the driveway for months, no plates.", anonymous: true, assignedUserId: 3, dueOn: addDays(t, 3), receivedAt: at(-3, 15), history: [h("Complaint received: Junked or abandoned vehicle", 3)] });
  kase({ typeKey: "blocked_exit", status: "closed", resolution: "complied", priority: "high", ...place(P("Riverbend Pizza Kitchen")), description: "Caller says the back door was chained during Friday dinner.", complainantName: "Former employee", assignedUserId: 1, dueOn: addDays(t, -40), receivedAt: at(-41, 20), closedAt: at(-40, 12), history: [h("Complaint received: Blocked or locked exit", 41), h("Closed: owner complied", 40)] });

  // Events.
  const event = (f) => { const e = newEvent({ id: ++db.id, number: num("event"), ...f }); db.events.push(e); return e; };
  const fw = event({ title: "Fall Festival and Fireworks", kind: "fireworks", status: "planning", startsAt: at(18, 17), endsAt: at(18, 22), locationName: "Demo City Park", address: "100 Park Ln, Demo City, TX 77583", latitude: 29.4420, longitude: -95.3890, organizerName: "Pat Kim", organizerOrg: "Rotary Club of Demo City", organizerPhone: "(281) 555-0177", expectedAttendance: 2500, crowdManagers: 4, features: ["fireworks", "tents", "cooking", "large_crowd", "generators"], standby: { fire: true, ems: true, units: "Engine 1, Medic 2", personnel: 6, notes: "Stage at the north gate" }, staffUserIds: [1, 5], history: [h("Event added", 10)] });
  fw.tasks = [...CATALOG.eventTasks.fireworks, ...["fireworks", "tents", "cooking", "large_crowd", "generators"].flatMap(k => CATALOG.eventFeatureTasks[k])].filter((x, i, a) => a.indexOf(x) === i)
    .map((text, i) => ({ id: lineId(), text, done: i < 3, doneBy: i < 3 ? by : null, doneAt: i < 3 ? at(-4, 10) : null }));
  db.permits.find(p => p.typeKey === "op_tent").eventId = fw.id;
  event({ title: "Station tour: Little Oaks pre-K", kind: "station_tour", status: "approved", startsAt: at(6, 9.5), endsAt: at(6, 10.5), locationName: "Station 1", address: "3144 Meridiana Pkwy, Demo City, TX 77583", expectedAttendance: 18, staffUserIds: [5], tasks: CATALOG.eventTasks.station_tour.map(text => ({ id: lineId(), text, done: false, doneBy: null, doneAt: null })), history: [h("Event added", 4)] });
  event({ title: "Smoke alarm blitz: Willow Bend", kind: "smoke_alarms", status: "completed", startsAt: at(-20, 9), endsAt: at(-20, 13), locationName: "Willow Bend subdivision", address: "Willow Bend Dr, Demo City, TX 77583", expectedAttendance: null, actualAttendance: 41, smokeAlarmsInstalled: 63, staffUserIds: [1, 3, 5], report: "63 alarms in 41 homes. Two homes had no working alarm at all.", tasks: CATALOG.eventTasks.smoke_alarms.map(text => ({ id: lineId(), text, done: true, doneBy: by, doneAt: at(-20, 13) })), history: [h("Marked done", 19)] });

  // An open investigation, and the calls it could have started from.
  db.commandIncidents = [
    { id: 501, title: "Structure fire", commandName: "Willow Command", incidentNumber: "26-00412", cadIncidentNumber: "2610-0412", incidentTypeCode: "structure_fire", address: "230 Willow Bend Dr, Demo City, TX 77583", latitude: 29.4338, longitude: -95.4164, startedAt: at(-6, 22), state: "finalized" },
    { id: 502, title: "Vehicle fire", commandName: null, incidentNumber: "26-00398", cadIncidentNumber: "2609-0398", incidentTypeCode: "vehicle_fire", address: "Highway 288 at County Road 48", latitude: 29.4230, longitude: -95.3960, startedAt: at(-14, 16), state: "finalized" },
  ];
  db.investigations.push(newInvestigation({
    id: ++db.id, number: num("investigation"), title: "Kitchen fire, 230 Willow Bend Dr", status: "pending", occurredAt: at(-6, 22),
    incidentNumber: "2610-0412", commandIncidentId: 501, address: "230 Willow Bend Dr, Demo City, TX 77583", latitude: 29.4338, longitude: -95.4164,
    propertyType: "Structure", areaOfOrigin: "Kitchen, at the range", heatSource: "Cooking burner", firstItemIgnited: "Cooking oil", causeClass: "accidental",
    nerisCause: "COOKING", lossCents: 4500000, injuries: 0, fatalities: 0, leadUserId: 4,
    causeNotes: "Pan of oil left on high heat; occupant fell asleep in the next room.",
    narrative: "Called at 22:04. First-in found fire in the kitchen extending to the cabinets. Burn patterns on the range hood and the upper cabinets lead back to the front left burner, which was on high.",
    evidence: [{ id: lineId(), number: "1", description: "Remains of the frying pan and contents, in a metal can", location: "Front left burner", collectedBy: "Jordan Lee", collectedAt: at(-5, 10), status: "lab", custody: [{ at: at(-4, 9), from: "Jordan Lee", to: "State Fire Marshal's lab", purpose: "Rule out ignitable liquids" }] }],
    interviews: [{ id: lineId(), name: "Occupant", role: "Occupant", phone: "", at: at(-6, 23), summary: "Started cooking fries around 21:30, sat down in the living room and fell asleep. Woke to the smoke alarm." }],
    history: [{ at: at(-5, 9), by: "Jordan Lee", text: "Investigation opened", kind: "change" }],
  }));

  return db;
}
