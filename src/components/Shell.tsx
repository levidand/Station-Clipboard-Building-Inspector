import { Fragment, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle, Building2, CalendarDays, ChevronDown, ClipboardCheck, ExternalLink, Flame, Home, LogOut, Map as MapIcon,
  Megaphone, Menu as MenuIcon, Search, Settings, Siren, Stamp, X,
} from "lucide-react";
import { get, storageUrl } from "@/lib/api";
import { useAuth, usePermissions } from "@/lib/auth";
import { initials } from "@/lib/format";
import { BASE, keys } from "@/lib/inspections";
import type { SearchResults, Today } from "@/lib/types";
import { Count, IconButton, Input, Menu, MenuItem, MenuLink, cx } from "./ui";
import { Logo } from "./Logo";

export const DEPARTMENT_PORTAL_URL = (import.meta.env.VITE_DEPARTMENT_PORTAL_URL as string | undefined) || "https://go.stationclipboard.com";
export const COMMAND_PORTAL_URL = (import.meta.env.VITE_COMMAND_PORTAL_URL as string | undefined) || "https://cmd.stationclipboard.com";

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
 * The frame every signed-in page sits in: the navy title bar across the top,
 * the rail of sections down the left (a full-screen menu on a phone), and the
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
      <header className="no-print relative z-30 flex min-h-[60px] shrink-0 items-center gap-3 bg-navy px-3 text-white shadow-bar sm:px-4">
        <button
          type="button" onClick={() => setMenuOpen(true)}
          className="flex h-11 items-center gap-2 rounded-sm px-2.5 text-[15px] font-medium uppercase tracking-[0.02em] hover:bg-white/[.075] lg:hidden"
          aria-label="Open the menu"
        >
          <MenuIcon className="h-6 w-6" /><span className="hidden sm:inline">Menu</span>
        </button>
        <Link href="/" className="flex shrink-0 items-center rounded-sm"><Logo compact={false} className="hidden sm:flex" /><Logo compact className="sm:hidden" /></Link>
        <div className="flex min-w-0 flex-1 justify-center px-2"><GlobalSearch /></div>
        <UserMenu />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="no-print hidden w-[250px] shrink-0 flex-col overflow-y-auto border-r border-divider bg-alt lg:flex" aria-label="Sections">
          <NavList items={items} location={location} counts={counts} />
          <PortalLinks />
        </aside>
        <main className="print-root min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {menuOpen && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-alt lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex min-h-[60px] items-center justify-between bg-navy px-3 text-white">
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
      <a href={DEPARTMENT_PORTAL_URL} target="_blank" rel="noopener" className="flex h-12 items-center gap-4 px-5 text-[15px] text-ink-3 hover:bg-white/[.05] hover:text-white">
        <ExternalLink className="h-5 w-5 shrink-0" />Department Portal
      </a>
      <a href={COMMAND_PORTAL_URL} target="_blank" rel="noopener" className="flex h-12 items-center gap-4 px-5 text-[15px] text-ink-3 hover:bg-white/[.05] hover:text-white">
        <Siren className="h-5 w-5 shrink-0" />Command Portal
      </a>
    </div>
  );
}

/** One box that finds a business, an inspection, a permit, a complaint or an event by name, number or address. */
function GlobalSearch() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
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

  const go = (href: string) => { setOpen(false); setQ(""); navigate(href); };

  return (
    <div ref={box} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
      <Input
        value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && groups[0]?.rows[0]) go(groups[0].rows[0].href); }}
        placeholder="Find a business, address or number" aria-label="Search"
        className="h-11 border-white/30 bg-white/10 pl-10 text-[16px]"
      />
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
  );
}

function UserMenu() {
  const { session, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState<string | null>(null);
  if (!session) return null;
  const name = `${session.firstName} ${session.lastName}`;
  const avatar = storageUrl(session.avatarUrl);
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 rounded-sm py-1.5 pl-1.5 pr-2 text-white transition-colors hover:bg-white/[.075]"
        aria-expanded={open} aria-haspopup="menu" aria-label="Your account"
      >
        {avatar && avatarFailed !== avatar
          ? <img src={avatar} alt="" onError={() => setAvatarFailed(avatar)} className="h-10 w-10 rounded-full object-cover" />
          : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue text-[15px] font-medium text-white">{initials(name)}</span>}
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[15px] font-medium">{name}</span>
          <span className="block text-[13px] text-ink-3">{session.orgName}</span>
        </span>
        <ChevronDown className={cx("h-5 w-5 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      <Menu open={open} onClose={() => setOpen(false)}>
        <div className="mb-2 border-b border-divider px-4 pb-3 pt-1">
          <div className="text-[16px] font-medium">{name}</div>
          <div className="text-[14px] text-ink-3">@{session.username} · {session.orgSlug}</div>
        </div>
        <MenuLink icon={ExternalLink} href={DEPARTMENT_PORTAL_URL} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
          Department Portal
        </MenuLink>
        <MenuLink icon={Siren} href={COMMAND_PORTAL_URL} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
          Command Portal
        </MenuLink>
        <MenuItem icon={LogOut} onClick={() => { setOpen(false); void logout(); }}>Sign out</MenuItem>
      </Menu>
    </div>
  );
}
