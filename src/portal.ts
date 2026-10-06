import type { PortalApp } from "@/shared/departmentPortal";

/** This app, as the shared title bar (src/shared) needs to know it. */
export const PORTAL: PortalApp = {
  slug: "inspections",
  name: "Inspection Portal",
  userMenu: [],
  // The Department Portal's /modules/inspections addresses, which its
  // notifications carry (pages/inspection-portal-redirect.tsx there).
  notificationPaths: [
    [/^\/modules\/inspections\/inspections\/(\d+)\/?$/, m => `/inspections/${m[1]}`],
    [/^\/modules\/inspections\/businesses\/(\d+)\/?$/, m => `/businesses/${m[1]}`],
    [/^\/modules\/inspections\/permits\/(\d+)\/?$/, m => `/permits/${m[1]}`],
    [/^\/modules\/inspections\/complaints\/(\d+)\/?$/, m => `/complaints/${m[1]}`],
    [/^\/modules\/inspections\/events\/(\d+)\/?$/, m => `/events/${m[1]}`],
    [/^\/modules\/inspections\/investigations\/(\d+)\/?$/, m => `/investigations/${m[1]}`],
    [/^\/modules\/inspections\/(inspections|businesses|violations|permits|complaints|events|investigations|map|settings)\/?$/, m => `/${m[1]}`],
    [/^\/modules\/inspections(\/.*)?$/, () => "/"],
  ],
};
