# StationClipboard Inspection Portal

The fire marshal's office, code enforcement and building inspection, in one app for StationClipboard
departments. It is a separate app, like the Command Portal, but it has **no database or accounts of its
own**. It signs in with Department Portal accounts and reads and writes the Department Portal's Inspections
data through its API (`/api/auth/*`, `/api/terms`, `/api/inspections/*`). A department turns it on as the
**Inspections** module in the Department Portal.

## Run it

| What | Command | Then open |
| --- | --- | --- |
| **Demo** (no backend, a made-up department) | `npm install`, `npm run build`, then `npm run demo`, or double-click `Start Demo.cmd` | http://localhost:4710, sign in as `demo` / any username / `demo` |
| **Live** (your department's real data) | `npm install` then `npm run build` and `npm start`, or double-click `Start Inspection Portal.cmd` | http://localhost:4710 |
| Development, live API | `npm run dev` | http://localhost:4710 |
| Development, demo API | `npm run dev:demo` | http://localhost:4710 |

In the demo the username picks the role: `viewer` (read-only), `inspector` (inspections and violations),
`code` (code enforcement, and sees who complained), and anything else is the fire marshal with every
permission. The demo department is on the 2018 fire code, as Iowa Colony is. `POST /api/demo/reset` puts the
demo back to where it started.

Settings go in `.env` (copy `.env.example`): `API_TARGET` (the Department Portal API, default
`https://go.stationclipboard.com`), `PORT` (default 4710), `VITE_DEPARTMENT_PORTAL_URL`,
`VITE_COMMAND_PORTAL_URL` and `ARCGIS_API_KEY` (address lookup; works without one).

## How it connects

```
Browser ──/api──▶ Inspection Portal server (server/index.mjs) ──▶ Department Portal API ──▶ Postgres
```

The same arrangement as the Command Portal: the browser only talks to `/api` on its own origin, the server
forwards it, so the session cookie is first-party. The one route this server answers itself is
`GET /ip/geocode`, the address lookup used when adding a business, a complaint or an event (copied from the
Command Portal's `server/geocode.mjs`).

**Opening it from the Department Portal, signed in.** Inspections in the Department Portal's sidebar opens
`GET /api/auth/inspection-portal?path=…` there, which redirects here to `<path>#sso=<token>`; `src/lib/auth.tsx`
redeems the token at `POST /api/auth/inspection-portal/redeem`. The token is signed, single-use and lives 60
seconds (`lib/inspectionPortalSso.ts` in the Department Portal, the twin of the Command Portal's handoff with its
own key). Set `INSPECTION_PORTAL_URL` on the Department Portal API to where this app is hosted
(default `https://inspect.stationclipboard.com`). Any `/modules/inspections/...` address in the Department
Portal opens the matching page here (`pages/inspection-portal-redirect.tsx` there).

## The data, and where it lives

Everything is in the Department Portal repo:

- Schema: `lib/db/src/schema/inspections.ts`. Migration: `lib/db/migrations/0136_inspections.sql`, **run by hand**
  (`cd lib/db && DATABASE_URL=... node run-sql.mjs migrations/0136_inspections.sql`). Until it runs, the
  `/inspections` routes answer "Inspections isn't set up on the server yet"; nothing else is affected.
- Routes: `artifacts/api-server/src/routes/inspections.ts` (settings, people, Today, businesses, map,
  checklists, files, notes, search), `inspectionsWork.ts` (inspections and violations),
  `inspectionsCases.ts` (permits, complaints, events, investigations), `inspectionPortalAuth.ts` (sign-on).
- Rules: `lib/inspectionsLogic.ts` (due dates, frequencies, crowd managers; tested). Defaults:
  `lib/inspectionsCatalog.ts` (inspection, permit and complaint types, fees, the notice, 147 violation codes and
  11 checklists in both the 2018 and 2021 fire code editions; tested).
- `server/demo-catalog.json` here is generated from that catalog, so the demo starts with the same lists.
  After changing the catalog, run `node tools/export-catalog.mjs` to regenerate it.

**A business is a preplan.** The buildings the bureau inspects are the department's Incident Command preplans;
`inspection_properties` adds the inspection program (occupancy class, risk class, how often, owner). Adding a
business here adds a preplan, so crews see it in the Command Portal. Finishing a fire inspection writes a visit
onto the preplan and updates its "last inspected" date, which the Command Portal shows on a call. Hydrants on
the map are the Command Portal's.

**The department calendar** shows inspections (My Inspections, on by default; All Scheduled Inspections, off by
default) and events (Fire Marshal Events, on for everyone unless an event is unticked "Show on the department
calendar"). `lib/calendar/sources/inspections.ts` in the Department Portal.

## Permissions

Granted under Settings → Roles in the Department Portal (`inspections:<key>`). The API checks each one; this
app hides what a role doesn't include.

| Permission | Key | What it allows |
| --- | --- | --- |
| Open the Inspection Portal | `view` | Everything read-only, except fire investigations |
| Inspect and write violations | `conduct_inspections` | Schedule and do inspections, write and clear violations, add businesses and set their program |
| Code enforcement | `manage_cases` | Complaints, notices to owners, violations on complaints; sees who complained |
| Permits and plan review | `manage_permits` | Applications, plan review, issuing and closing permits, fees |
| Plan events | `manage_events` | Events, their planning lists, staffing and after-event reports |
| Fire investigations | `investigations` | Investigations, reading included: nobody else can see one exists |
| Manage settings | `manage_settings` | Settings, deleting records, and everything except investigations |

## What it does

- **Today**: what needs the member: overdue businesses, violations past due, complaints due, permits waiting,
  events coming up, and their own inspections (late, today, this week).
- **Inspections**: schedule from anywhere (a business, a permit, a complaint, an event). On site: **Start
  inspection**, then Pass / Fail / N/A on each checklist line in big buttons; failing a line opens "Write a
  violation" filled in from the code library. Photos (the camera opens on a tablet), notes, the person met and
  their signature. Everything saves as it's typed. **Finish** suggests the result and books the re-inspection on
  the day the first violation is due. A re-inspection lists what's still open to mark fixed.
- **Printing**: the inspection report, the Notice of Violation (IFC 112.3; 109.3 in 2018), the permit, and the
  code enforcement notice, on the department's letterhead.
- **Businesses**: every preplanned building, by when it's due (NFPA 1730 frequencies by risk class: high every
  year, moderate every two, low every three, critical infrastructure every year).
- **Violations**: everything open across the department, grouped by place; mark fixed, cited or void.
- **Permits**: operational, construction, building and event permits; plan review passes (approved,
  corrections, denied, comment); issue (expiry from the type), final approval. Building permits show how long
  they've waited (Texas LGC 214.904: 45 days).
- **Complaints**: code enforcement from the call to compliance: anonymous or not, notices with compliance dates
  (7 days for weeds, 10 for junked vehicles by default), violations, citation, abatement, close with how it ended.
- **Events**: special events, fireworks, station tours, smoke alarm installs, standby. The planning list fills
  itself from what's at the event; crowd managers needed (at least two, one per 250 people); staffing, standby,
  permits and walk-throughs, an after-event report.
- **Investigations**: start from a Command Portal call; origin and cause (NFPA 921 class and NERIS cause),
  losses, narrative, evidence log with chain of custody, interviews, referral.
- **Map**: businesses coloured by due state, the next two weeks of inspections, open complaints and hydrants.
- **Settings**: the fire code edition (switching renumbers the default references on checklists and codes,
  leaving ones the department typed alone), frequencies, checklists, the violation code library, inspection /
  permit / complaint types, fees, and the notice wording.

## Design

The Command Portal's Material dark theme and components (`src/components/ui.tsx`), sized up for people who
read a tablet on their feet: 16px base type (the Command Portal's is 14px), brighter secondary text, controls
44px or taller, a left rail of plainly named sections (a full-screen menu on a phone), one strip across the top
of each page with its main buttons, and records that read as facts, label over value. Colour always comes with
a word.
