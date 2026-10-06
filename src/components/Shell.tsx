import { Fragment, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle, Building2, CalendarDays, ClipboardCheck, ExternalLink, Flame, Home, Map as MapIcon,
  Megaphone, Menu as MenuIcon, Search, Settings, Siren, Stamp, X,
} from "lucide-react";
import { get } from "@/lib/api";
import { usePermissions } from "@/lib/auth";
import { BASE, keys } from "@/lib/inspections";
import type { SearchResults, Today } from "@/lib/types";
import { AppHeader } from "@/shared/AppHeader";
import { departmentPortalHref, portalTarget, signedInHref } from "@/shared/departmentPortal";
import { Logo } from "@/shared/Logo";
import { Count, IconButton, Input, cx } from "./ui";

interface NavDef {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Starts a new cluster in the rail. */
  gap?: boolean;
  /** Something waiting, from the Today counts. */
  count?: (t: Today["counts"]) => number;
  show?: (p: ReturnType<typeof usePermissions>) => boolean;
  /** Paths that also light this item up. */
  match?: RegExp;
}

const NAV: NavDef[] = [
  { href: "/", label: "Today", icon: Home, match: /^\/$/ },
  { href: "/inspections", label: "Inspections", icon: ClipboardCheck, gap: true, match: /^\/inspections/ },
  { href: "/businesses", label: "Businesses", icon: Building2, count: c => c.propertiesOverdue, match: /^\/businesses/ },
  { href: "/violations", label: "Violations", icon: AlertTriangle, count: c => c.violationsOverdue, match: /^\/violations/ },
  { href: "/permits", label: "Permits", icon: Stamp, count: c => c.permitsWaiting, match: /^\/permits/ },
  { href: "/complaints", label: "Complaints", icon: Megaphone, count: c => c.casesDue, match: /^\/complaints/ },
  { href: "/events", label: "Events", icon: CalendarDays, match: /^\/events/ },
  { href: "/investigations", label: "Investigations", icon: Flame, show: p => p.investigations, match: /^\/investigations/ },
  { href: "/map", label: "Map", icon: MapIcon, gap: true, match: /^\/map/ },
  { href: "/settings", label: "Settings", icon: Settings, show: p => p.settings, match: /^\/settings/ },
];

/**
 * The frame every signed-in page sits in: the navy title bar across the top
 * (the Command Portal's too, from src/shared), the rail of sections down the left (a full-screen menu on a phone), and the
 * page itself. A page that prints (a report, a notice) passes `bare` and gets
 * the paper with nothing round it.
 */
export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const perms = usePermissions();
  const today = useQuery({ queryKey: keys.today, queryFn: ({ signal }) => get<Today>(`${BASE}/today`, signal), refetchInterval: 5 * 60_000 });
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [location]);

  const items = NAV.filter(n => !n.show || n.show(perms));
  const counts = today.data?.counts;

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        lead={(
          <button
            type="button" onClick={() => setMenuOpen(true)}
            className="flex h-11 shrink-0 items-center gap-2 rounded-sm px-2 text-[15px] font-medium uppercase tracking-[0.02em] hover:bg-white/[.075] lg:hidden"
            aria-label="Open the menu"
          >
            <MenuIcon className="h-6 w-6" /><span className="hidden md:inline">Menu</span>
          </button>
        )}
      >
        <div className="flex min-w-0 flex-1 justify-center lg:px-2"><GlobalSearch /></div>
      </AppHeader>

      <div className="flex min-h-0 flex-1">
        <aside className="no-print hidden w-[250px] shrink-0 flex-col overflow-y-auto border-r border-divider bg-alt lg:flex" aria-label="Sections">
          <NavList items={items} location={location} counts={counts} />
          <PortalLinks />
        </aside>
        <main className="print-root min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {menuOpen && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-alt lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex min-h-14 items-center justify-between bg-navy px-2 text-white sm:px-4">
            <Logo />
            <IconButton label="Close the menu" onClick={() => setMenuOpen(false)} className="text-white hover:text-white">
              <X className="h-7 w-7" />
            </IconButton>
          </div>
          <div className="flex-1 overflow-y-auto">
            <NavList items={items} location={location} counts={counts} big />
            <PortalLinks />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function NavList({ items, location, counts, big }: {
  items: NavDef[]; location: string; counts: Today["counts"] | undefined; big?: boolean;
}) {
  return (
    <nav className="py-2">
      {items.map((n, i) => {
        const on = n.match ? n.match.test(location) : location === n.href;
        const count = counts && n.count ? n.count(counts) : 0;
        return (
          <Fragment key={n.href}>
            {n.gap && i > 0 && <div className="mx-4 my-2 border-t border-divider" />}
            <Link
              href={n.href} aria-current={on ? "page" : undefined}
              className={cx(
                "relative flex w-full items-center gap-4 px-5 text-left transition-colors",
                big ? "h-[60px] text-[19px]" : "h-[52px] text-[17px]",
                on ? "bg-hover text-white" : "text-ink-2 hover:bg-white/[.05] hover:text-white",
              )}
            >
              <n.icon className={cx("h-6 w-6 shrink-0", on ? "text-orange" : "text-ink-3")} />
              <span className="min-w-0 flex-1 truncate">{n.label}</span>
              {count > 0 && <Count>{count}</Count>}
              {on && <span className="absolute inset-y-0 left-0 w-1 bg-orange-light" />}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}

function PortalLinks() {
  return (
    <div className="mt-auto border-t border-divider py-2">
      <a href={departmentPortalHref()} target={portalTarget("department-portal")} className="flex h-12 items-center gap-4 px-5 text-[15px] text-ink-3 hover:bg-white/[.05] hover:text-white">
        <ExternalLink className="h-5 w-5 shrink-0" />Department Portal
      </a>
      <a href={signedInHref("command-portal")} target={portalTarget("command-portal")} className="flex h-12 items-center gap-4 px-5 text-[15px] text-ink-3 hover:bg-white/[.05] hover:text-white">
        <Siren className="h-5 w-5 shrink-0" />Command Portal
      </a>
    </div>
  );
}

/**
 * One box that finds a business, an inspection, a permit, a complaint or an
 * event by name, number or address. Below a laptop's width there's no room
 * for a box worth typing in beside the title bar's buttons, so there it's a
 * button that opens the box across the whole bar.
 */
function GlobalSearch() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  /** On a phone: the box has taken over the title bar. */
  const [wide, setWide] = useState(false);
  const [debounced, setDebounced] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const close = () => { setOpen(false); setWide(false); };
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (wide) input.current?.focus(); }, [wide]);
  useEffect(() => {
    if (!open && !wide) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close(); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open, wide]);
  const search = useQuery({
    queryKey: [BASE, "search", debounced],
    queryFn: ({ signal }) => get<SearchResults>(`${BASE}/search?q=${encodeURIComponent(debounced)}`, signal),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
  const r = search.data;
  const groups: { title: string; rows: { href: string; title: string; detail: string }[] }[] = r ? [
    { title: "Businesses", rows: r.properties.map(p => ({ href: `/businesses/${p.id}`, title: p.name, detail: p.address })) },
    { title: "Inspections", rows: r.inspections.map(i => ({ href: `/inspections/${i.id}`, title: `${i.number} · ${i.placeName ?? i.address}`, detail: i.address })) },
    { title: "Permits", rows: r.permits.map(p => ({ href: `/permits/${p.id}`, title: `${p.number} · ${p.placeName ?? p.address}`, detail: p.address })) },
    { title: "Complaints", rows: r.cases.map(c => ({ href: `/complaints/${c.id}`, title: `${c.number} · ${c.placeName ?? c.address}`, detail: c.address })) },
    { title: "Events", rows: r.events.map(e => ({ href: `/events/${e.id}`, title: e.title, detail: e.address ?? e.number })) },
    { title: "Investigations", rows: r.investigations.map(v => ({ href: `/investigations/${v.id}`, title: `${v.number} · ${v.title}`, detail: v.address })) },
  ].filter(g => g.rows.length) : [];

  const go = (href: string) => { close(); setQ(""); navigate(href); };

  return (
    <>
      <IconButton label="Search" onClick={() => setWide(true)} className="ml-auto text-ink-2 hover:text-white lg:hidden">
        <Search className="h-6 w-6" />
      </IconButton>
      <div
        ref={box}
        className={cx(
          "relative w-full max-w-xl",
          wide ? "fixed inset-x-0 top-0 z-40 flex h-14 max-w-none items-center gap-1 bg-navy px-2 shadow-bar" : "hidden lg:block",
        )}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
          <Input
            ref={input}
            value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
            onKeyDown={e => { if (e.key === "Escape") close(); if (e.key === "Enter" && groups[0]?.rows[0]) go(groups[0].rows[0].href); }}
            placeholder="Find a business, address or number" aria-label="Search"
            className="h-11 border-white/30 bg-white/10 pl-10 text-[16px]"
          />
        </div>
        {wide && (
          <IconButton label="Close search" onClick={close} className="text-white hover:text-white">
            <X className="h-6 w-6" />
          </IconButton>
        )}
        {open && debounced.length >= 2 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-sm border border-divider bg-surface py-1 text-ink shadow-float">
            {search.isLoading ? <p className="px-4 py-3 text-[15px] text-ink-3">Searching…</p>
              : groups.length === 0 ? <p className="px-4 py-3 text-[15px] text-ink-3">Nothing matches “{debounced}”.</p>
              : groups.map(g => (
                <div key={g.title}>
                  <div className="px-4 pb-1 pt-2.5 text-[13px] font-medium uppercase tracking-[0.06em] text-ink-3">{g.title}</div>
                  {g.rows.map(row => (
                    <button key={row.href} type="button" onClick={() => go(row.href)} className="block w-full px-4 py-2.5 text-left hover:bg-hover">
                      <span className="block text-[16px] text-ink">{row.title}</span>
                      <span className="block text-[14px] text-ink-3">{row.detail}</span>
                    </button>
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
}
