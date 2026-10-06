# src/shared

The title bar every StationClipboard portal shares: the logo, the Department
Portal's apps, chat and notifications, and the menu under the member's name.
The Command Portal and the Inspection Portal each have this folder, and the
copies are kept the same.

**Edit it in either app.** `tools/sync-shared.mjs` copies the edit to the
other the next time either one runs `npm run dev`, `npm run build` or a Start
script, or straight away with `npm run sync-shared`. If the same file was
changed differently in both, it stops and names the file instead of
overwriting either one.

What differs between the apps lives outside this folder, in each app's
`src/portal.ts` (its module slug, its name, its own items in the name menu,
and where its notifications open).

The files here import only what both apps have, with the same shape:

| Import | Used for |
| --- | --- |
| `@/portal` | `PORTAL`, this app's `PortalApp` |
| `@/lib/api` | `api`, `get`, `errorMessage`, `storageUrl` |
| `@/lib/auth` | `useAuth`, `Session` (`permissions`, `orgId`, `branding`, the name fields) |
| `@/lib/format` | `dateTime`, `initials` |
| `@/components/ui` | `Count`, `Spinner`, `Menu`, `MenuItem`, `MenuLink`, `MenuSeparator`, `cx` |

Change one of those in one app and the other app's typecheck will say so.
