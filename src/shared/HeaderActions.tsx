import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AtSign, Award, Bell, BellOff, Calendar, CalendarClock, CheckCheck, ClipboardCheck, ExternalLink, Flag, Handshake,
  LayoutGrid, LibraryBig, Megaphone, MessageCircle, MessageSquareText, ScanFace, SearchCheck, Settings, ShieldCheck, ToggleRight,
  Trash2, UserCog, X, type LucideIcon,
} from "lucide-react";
import { api, errorMessage, get } from "@/lib/api";
import { useAuth, type Session } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import {
  DEPARTMENT_PORTAL_WINDOW, appGradient, availableApps, departmentPortalHref, notificationDestination,
  type Notification, type NotificationList, type OrgModule,
} from "./departmentPortal";
import { Count, Spinner, cx } from "@/components/ui";
import { PORTAL } from "@/portal";

/**
 * The Department Portal's corner of the title bar: its apps, chat and
 * notifications, so a member can get back to the rest of StationClipboard
 * without hunting for the tab they came from. Each shows only when the member
 * can use it, as it does there.
 */
export function HeaderActions({ className }: { className?: string }) {
  const { session } = useAuth();
  if (!session?.orgId) return null;
  return (
    <div className={cx("flex shrink-0 items-center gap-0.5 sm:gap-1", className)}>
      <AppsButton session={session} />
      {session.permissions.includes("chat:view") && <ChatButton />}
      <NotificationsButton orgId={session.orgId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const BAR_BUTTON =
  "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-ink-2 transition-colors hover:bg-white/[.075] hover:text-white";

function BarBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <Count className="pointer-events-none absolute -right-0.5 -top-0.5 h-[18px] min-w-[18px] px-1 text-[11px] font-medium shadow-raised">
      {n > 99 ? "99+" : n}
    </Count>
  );
}

const PANEL_W = 400;
const EDGE = 8;

/**
 * A panel hung under its button. Fixed rather than absolute, so on a phone it
 * stays on screen whichever button opened it.
 */
function HeaderPanel({ anchor, open, onClose, label, children }: {
  anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; label: string; children: ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; right: number; width: number } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const vw = document.documentElement.clientWidth;
      const width = Math.min(PANEL_W, vw - EDGE * 2);
      // Right-aligned with the button, nudged in so it never runs off the left.
      const right = Math.min(Math.max(EDGE, vw - r.right), vw - width - EDGE);
      setPos({ top: r.bottom + 6, right, width });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!open || !pos) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        role="dialog" aria-label={label}
        className="fixed z-50 flex flex-col overflow-hidden rounded-sm border border-divider bg-surface text-ink shadow-float"
        style={{ top: pos.top, right: pos.right, width: pos.width, maxHeight: `calc(100dvh - ${pos.top + EDGE}px)` }}
      >
        {children}
      </div>
    </>
  );
}

function PanelTop({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-divider bg-alt px-4 py-2">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[16px] font-medium text-white">{title}</h2>
        {subtitle && <div className="truncate text-[13px] text-ink-3">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function PortalFooter({ onClick }: { onClick: () => void }) {
  return (
    <a
      href={departmentPortalHref()} target={DEPARTMENT_PORTAL_WINDOW} onClick={onClick}
      className="flex h-12 shrink-0 items-center gap-3 border-t border-divider px-4 text-[14px] text-ink-3 transition-colors hover:bg-white/[.05] hover:text-white"
    >
      <ExternalLink className="h-4 w-4 shrink-0" />Open the Department Portal
    </a>
  );
}

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------

function AppsButton({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const btn = useRef<HTMLButtonElement>(null);
  const modules = useQuery({
    queryKey: [`/api/organizations/${session.orgId}/modules`],
    queryFn: ({ signal }) => get<OrgModule[]>(`/api/organizations/${session.orgId}/modules`, signal),
    staleTime: 5 * 60_000,
  });
  const apps = availableApps(session, modules.data);
  const close = () => setOpen(false);

  return (
    <div className="relative">
      <button
        ref={btn} type="button" onClick={() => setOpen(o => !o)} className={cx(BAR_BUTTON, open && "bg-white/[.075] text-white")}
        aria-label="Apps" title="Apps: jump to any module your department has turned on for you" aria-expanded={open} aria-haspopup="dialog"
      >
        <LayoutGrid className="h-5 w-5" />
      </button>
      <HeaderPanel anchor={btn} open={open} onClose={close} label="Your apps">
        <PanelTop
          title="Your apps"
          subtitle={modules.isLoading ? "Finding what's available…" : `${apps.length} ${apps.length === 1 ? "app" : "apps"} available`}
        />
        <div className="min-h-0 overflow-y-auto p-2">
          {modules.isLoading ? (
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[92px] animate-pulse rounded-sm bg-white/[.04]" />)}
            </div>
          ) : modules.isError && !modules.data ? (
            <p className="px-3 py-6 text-center text-[14px] text-ink-3">Couldn't load your apps. {errorMessage(modules.error)}</p>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {apps.map(app => {
                const here = app.slug === PORTAL.slug;
                const tile = (
                  <>
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg text-white shadow-raised transition-transform group-hover:-translate-y-0.5"
                      style={{ background: appGradient(session, app.slug) }}>
                      <app.Icon className="h-5 w-5" strokeWidth={2.15} />
                    </span>
                    <span className={cx("w-full truncate text-[12px] font-medium", here ? "text-white" : "text-ink-2 group-hover:text-white")}>{app.label}</span>
                    {here && <span className="absolute inset-x-3 bottom-0 h-[3px] bg-orange-light" />}
                  </>
                );
                const cls = cx(
                  "group relative flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-sm px-1.5 py-3 text-center transition-colors hover:bg-white/[.06]",
                  here && "bg-white/[.06]",
                );
                return here ? (
                  <button key={app.slug} type="button" className={cls} aria-current="page" title="You're here"
                    onClick={() => { close(); navigate("/"); }}>{tile}</button>
                ) : (
                  <a key={app.slug} className={cls} href={departmentPortalHref(app.href)} target={DEPARTMENT_PORTAL_WINDOW} onClick={close}>{tile}</a>
                );
              })}
            </div>
          )}
        </div>
        <PortalFooter onClick={close} />
      </HeaderPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

interface ChatUnread { total: number; mentions: number }

function ChatButton() {
  const unread = useQuery({
    queryKey: ["/api/chat/unread"],
    queryFn: ({ signal }) => get<ChatUnread>("/api/chat/unread", signal),
    refetchInterval: 30_000,
    meta: { persist: false },
  });
  const n = unread.data?.total ?? 0;
  return (
    <a
      href={departmentPortalHref("/modules/chat")} target={DEPARTMENT_PORTAL_WINDOW} className={BAR_BUTTON}
      aria-label={n ? `Chat, ${n} unread` : "Chat"} title={n ? `Chat: ${n} unread` : "Chat"}
    >
      <MessageCircle className="h-5 w-5" />
      <BarBadge n={n} />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const TYPE_ICON: [RegExp, LucideIcon][] = [
  [/^announcement/, Megaphone],
  [/^credit_request$/, ClipboardCheck],
  [/^credit_(approved|denied)$/, ShieldCheck],
  [/^credit_/, Award],
  [/^time_entry_flagged$/, Flag],
  [/^face_/, ScanFace],
  [/^permissions_changed$/, ShieldCheck],
  [/^(role|account)/, UserCog],
  [/^module_toggled$/, ToggleRight],
  [/^org_settings$/, Settings],
  [/^scheduling/, Calendar],
  [/^policy/, LibraryBig],
  [/^ticket_/, MessageSquareText],
  [/^chat_mention$/, AtSign],
  [/^(application|interview)/, CalendarClock],
  [/^incident-command/, Handshake],
  [/^inspections/, SearchCheck],
];
const iconFor = (type: string) => TYPE_ICON.find(([re]) => re.test(type))?.[1] ?? Bell;

const PRIORITY = {
  normal: { edge: "border-l-sky", icon: "text-ink-2" },
  important: { edge: "border-l-orange", icon: "text-orange" },
  critical: { edge: "border-l-red", icon: "text-lightcoral" },
} as const;

function timeAgo(iso: string, now: number): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 7 * 24 * 60) return `${Math.floor(mins / (24 * 60))}d ago`;
  return dateTime(iso);
}

function NotificationsButton({ orgId }: { orgId: number }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  /** Unread when the panel opened: they keep looking new until it closes, even once marked read. */
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<number | null>(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const base = `/api/organizations/${orgId}/notifications`;
  const key = [base];

  const feed = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => get<NotificationList>(base, signal),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    meta: { persist: false },
  });
  const items = feed.data?.items ?? [];
  const unread = feed.data?.unreadCount ?? 0;

  // "Sure? Clear all" stands down on its own after a few seconds.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const send = async (method: string, path: string, body?: unknown) => {
    setBusy(true);
    try {
      const res = await api<NotificationList | { updated: number }>(method, base + path, body);
      if ("items" in res) qc.setQueryData(key, res);
      else void qc.invalidateQueries({ queryKey: key });
    } catch {
      void qc.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  };

  const show = () => {
    setOpen(true);
    setExpanded(null);
    setArmed(false);
    setFresh(new Set(items.filter(n => !n.isRead).map(n => n.id)));
    // As in the Department Portal: opening the feed reads the everyday ones.
    // Important ones and ones that need doing stay unread until opened.
    const seen = items.filter(n => !n.isRead && n.priority === "normal" && !n.actionRequired).map(n => n.id);
    if (seen.length) void send("POST", "/mark-read", { ids: seen });
  };
  const hide = () => { setOpen(false); setFresh(new Set()); };

  const pick = (n: Notification) => {
    if (!n.isRead) void send("POST", `/${n.id}/read`);
    const to = notificationDestination(n);
    if (!to) { setExpanded(e => (e === n.id ? null : n.id)); return; }
    hide();
    if (to.kind === "here") navigate(to.path);
    else window.open(to.href, to.kind === "portal" ? DEPARTMENT_PORTAL_WINDOW : "_blank", to.kind === "web" ? "noopener" : undefined);
  };

  const now = Date.now();
  return (
    <div className="relative">
      <button
        ref={btn} type="button" onClick={() => (open ? hide() : show())} className={cx(BAR_BUTTON, open && "bg-white/[.075] text-white")}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} title="Notifications" aria-expanded={open} aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        <BarBadge n={unread} />
      </button>
      <HeaderPanel anchor={btn} open={open} onClose={hide} label="Notifications">
        <PanelTop title="Notifications" subtitle={unread ? `${unread} unread` : items.length ? "All caught up" : undefined}>
          {unread > 0 ? (
            <PanelAction onClick={() => void send("POST", "/read-all")} disabled={busy} icon={CheckCheck}>Mark all read</PanelAction>
          ) : items.length > 0 && (
            <PanelAction
              onClick={() => { if (armed) { setArmed(false); void send("DELETE", ""); } else setArmed(true); }}
              disabled={busy} icon={Trash2} danger={armed}
            >
              {armed ? "Sure? Clear all" : "Clear all"}
            </PanelAction>
          )}
        </PanelTop>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {feed.isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : feed.isError && !feed.data ? (
            <p className="px-4 py-8 text-center text-[14px] text-ink-3">Couldn't load notifications. {errorMessage(feed.error)}</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/[.06] text-ink-3"><Bell className="h-5 w-5" /></span>
              <p className="text-[15px] font-medium text-ink-2">You're all caught up</p>
              <p className="mt-1 text-[13px] text-ink-3">New notifications will show up here.</p>
            </div>
          ) : (
            <ul>
              {items.map(n => {
                const Icon = iconFor(n.type);
                const isNew = !n.isRead || fresh.has(n.id);
                const tone = PRIORITY[n.priority] ?? PRIORITY.normal;
                const isOpen = expanded === n.id;
                return (
                  <li key={n.id} className="group relative border-b border-divider last:border-b-0">
                    <button
                      type="button" onClick={() => pick(n)} aria-expanded={notificationDestination(n) ? undefined : isOpen}
                      className={cx(
                        "flex w-full gap-3 border-l-4 py-3 pl-3 pr-10 text-left transition-colors hover:bg-white/[.05]",
                        isNew ? cx(tone.edge, "bg-white/[.03]") : "border-l-transparent",
                      )}
                    >
                      <span className={cx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/25", tone.icon)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx("block text-[14px] leading-snug", isNew ? "font-medium text-white" : "text-ink-2")}>{n.title}</span>
                        {n.body && <span className={cx("mt-0.5 block whitespace-pre-line text-[13px] text-ink-3", !isOpen && "line-clamp-2")}>{n.body}</span>}
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-4">
                          <span>{timeAgo(n.createdAt, now)}</span>
                          {n.actorName && <span className="truncate">· {n.actorName}</span>}
                          {n.actionRequired && <span className="font-medium uppercase tracking-[0.04em] text-orange">Action needed</span>}
                          {n.silenced && <span className="flex items-center gap-1 uppercase tracking-[0.04em]"><BellOff className="h-3 w-3" />Silenced</span>}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button" onClick={() => void send("DELETE", `/${n.id}`)} aria-label="Dismiss" title="Dismiss"
                      className="absolute right-1.5 top-2 flex h-8 w-8 items-center justify-center rounded-sm text-ink-4 transition-colors hover:bg-white/[.075] hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 pointer-coarse:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <PortalFooter onClick={hide} />
      </HeaderPanel>
    </div>
  );
}

function PanelAction({ icon: Icon, danger, children, ...rest }: {
  icon: LucideIcon; danger?: boolean; children: ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button" {...rest}
      className={cx(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-[12px] font-medium uppercase tracking-[0.02em] transition-colors disabled:opacity-50",
        danger ? "bg-red text-white hover:bg-red-pressed" : "text-sky hover:bg-white/[.075]",
      )}
    >
      <Icon className="h-4 w-4" />{children}
    </button>
  );
}
