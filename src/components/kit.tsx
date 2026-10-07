import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import {
  AlertTriangle, ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, RotateCw, Search,
  SlidersHorizontal, X,
} from "lucide-react";
import { errorMessage, ApiError } from "@/lib/api";
import { portalTarget, type PortalName } from "@/shared/departmentPortal";
import {
  Button, Count, Field, IconButton, Input, Modal, Select, Spinner, TONE_TEXT, Textarea, cx, floatPlace, useEscape, useFocusTrap,
  type IconType, type Tone,
} from "./ui";

/*
 * Page building blocks, laid out the way the Command Portal's Settings and its
 * preplan editor are (src/pages/settings/fields.tsx there): one strip across
 * the top with the page's name and its main buttons, then small-caps groups of
 * plain rows in boxes. A record page reads as facts, label over value. No
 * tabs hiding half a record, no fine print.
 */

/** The small-caps title over a group. */
export const GROUP_TITLE = "text-[14px] font-medium uppercase tracking-[0.06em] text-ink-3";

/** The page body: full width, the same padding everywhere. */
export const PAGE = "w-full space-y-8 px-4 pb-20 sm:px-6";

/**
 * The strip across the top of every page: its name, one short line, and its
 * main buttons. It stays put while the page scrolls (on a tablet or bigger).
 */
export function PageHead({ title, sub, children, back, badges, lead }: {
  title: ReactNode; sub?: ReactNode; children?: ReactNode; back?: { href: string; label: string }; badges?: ReactNode;
  /** A picture before the name: a business's logo. */
  lead?: ReactNode;
}) {
  const text = (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h1 className="text-[24px] font-medium leading-8 text-ink">{title}</h1>
        {badges}
      </div>
      {sub && <p className="mt-0.5 text-[15px] leading-6 text-ink-3">{sub}</p>}
    </>
  );
  return (
    <header className="z-10 -mx-4 flex min-h-[84px] flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-divider bg-alt px-4 py-3.5 shadow-bar md:sticky md:top-0 sm:-mx-6 sm:px-6">
      <div className="min-w-0 flex-1 basis-72">
        {back && (
          <Link href={back.href} className="-my-1.5 inline-flex min-h-11 items-center gap-1.5 pr-2 text-[15px] text-sky hover:underline">
            <ArrowLeft className="h-4 w-4" />{back.label}
          </Link>
        )}
        {lead ? <div className="flex items-center gap-4">{lead}<div className="min-w-0 flex-1">{text}</div></div> : text}
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </header>
  );
}

/** One thing an ActionMenu can do. */
export interface ActionItem {
  label: string;
  icon?: IconType;
  /** One plain line under the label saying what happens. */
  hint?: string;
  onClick?: () => void;
  /** Opens another site, in a new tab. */
  href?: string;
  /** `href` is another StationClipboard portal, so it opens as they all do (portalTarget): in this tab, except on a phone. */
  portal?: PortalName;
  /** Colours the icon: green for the step the record is waiting on, and so on. */
  tone?: Tone;
  danger?: boolean;
}

/** A titled run of items. `false`/`null` items are skipped, so a permission check can sit inline. */
export interface ActionSection { title?: string; items: (ActionItem | false | null | undefined)[] }

/**
 * Everything that can be done to a record, behind one button. Buttons are
 * never lined up side by side: a row of them reads as noise, and on a tablet
 * held in one hand the wrong one gets pressed. Each item says in a line what
 * it does. A panel under the button from a tablet up, a sheet from the bottom
 * on a phone; it opens upward when the button is low on the screen.
 */
export function ActionMenu({ sections, label = "Actions", size = "lg", variant = "primary" }: {
  sections: ActionSection[]; label?: string; size?: "sm" | "md" | "lg"; variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  /** A sheet from the bottom on a phone; a panel by the button from a tablet up. */
  const [sheet, setSheet] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = (refocus = false) => { setOpen(false); if (refocus) button.current?.focus(); };
  useEscape(open, () => close(true));
  const place = useFloating(open && !sheet, button, panel, "end", () => close());

  // Focus the first item once the panel is placed (a hidden element can't take focus).
  const shown = open && (sheet || place != null);
  useEffect(() => {
    if (shown) panel.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
  }, [shown]);

  const groups = sections
    .map(s => ({ title: s.title, items: s.items.filter((a): a is ActionItem => !!a) }))
    .filter(s => s.items.length > 0);
  if (groups.length === 0) return null;

  function toggle() {
    if (open) { setOpen(false); return; }
    setSheet(window.innerWidth < 640);
    setOpen(true);
  }

  function keys(e: KeyboardEvent<HTMLDivElement>) {
    // Tab leaves the menu the way it came in: back to the button, then on to whatever's next.
    if (e.key === "Tab") { close(true); return; }
    const items = [...(panel.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = e.key === "ArrowDown" ? (at + 1) % items.length
      : e.key === "ArrowUp" ? (at + items.length - 1) % items.length
        : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    items[to]?.focus();
  }

  return (
    <>
      <Button ref={button} variant={variant} size={size} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        {label}<ChevronDown className={cx(size === "sm" ? "h-4 w-4" : "h-5 w-5", "transition-transform", open && "rotate-180")} />
      </Button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[60] bg-mask/70 sm:bg-transparent" onClick={() => close()} />
          <div
            ref={panel} role="menu" aria-label={label} onKeyDown={keys}
            style={sheet ? undefined : place ?? { top: 0, left: 0, visibility: "hidden" }}
            className={cx(
              "fixed z-[60] overflow-y-auto bg-surface text-ink shadow-float",
              sheet
                ? "inset-x-0 bottom-0 max-h-[85dvh] pb-2"
                // As wide as its longest line, within reason: two short items don't get a 26rem slab.
                : "w-max min-w-64 max-w-[min(26rem,calc(100vw-16px))] rounded-sm border border-divider",
            )}
          >
            {sheet && (
              <div className="flex items-center justify-between py-1 pl-5 pr-2">
                <h2 className="text-[20px] font-medium">{label}</h2>
                <IconButton label="Close" onClick={() => close(true)}><X className="h-6 w-6" /></IconButton>
              </div>
            )}
            {groups.map((s, i) => (
              <div key={s.title ?? i} className={cx("py-1", i > 0 && "border-t border-divider")}>
                {s.title && <div className="px-4 pb-0.5 pt-2 text-[13px] font-medium uppercase tracking-[0.06em] text-ink-3">{s.title}</div>}
                {s.items.map(a => <ActionRow key={a.label} a={a} onDone={() => close()} />)}
              </div>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/**
 * Places a floating panel by its button, in screen coordinates (see
 * floatPlace): under it if it fits, over it if that fits, otherwise slid up
 * the screen. The panel lives on <body>, so if the page scrolls or the window
 * changes size it would be left behind: it closes instead.
 */
function useFloating(
  open: boolean, anchor: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>, align: "start" | "end", onLost: () => void,
) {
  const [place, setPlace] = useState<{ top: number; left: number; maxHeight?: number } | null>(null);
  const lost = useRef(onLost);
  lost.current = onLost;
  useLayoutEffect(() => {
    const el = panel.current, b = anchor.current;
    if (!open || !el || !b) { setPlace(null); return; }
    setPlace(floatPlace(b.getBoundingClientRect(), el.offsetWidth, el.offsetHeight, align));
  }, [open, anchor, panel, align]);
  useEffect(() => {
    if (!open) return;
    // Only a scroll that moves the button counts: not one inside the panel, or in a drop-down list opened from it.
    const onScroll = (e: Event) => {
      const t = e.target as Node;
      if (anchor.current && (t === document || t.contains?.(anchor.current))) lost.current();
    };
    const onResize = () => lost.current();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onResize); };
  }, [open, anchor]);
  return place;
}

function ActionRow({ a, onDone }: { a: ActionItem; onDone: () => void }) {
  const Icon = a.icon;
  const cls = "flex min-h-[52px] w-full items-center gap-4 px-4 py-2 text-left transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none";
  const body = (
    <>
      {Icon && <Icon className={cx("h-6 w-6 shrink-0", a.danger ? "text-lightcoral" : a.tone ? TONE_TEXT[a.tone] : "text-ink-3")} />}
      <span className="min-w-0 flex-1">
        <span className={cx("block text-[17px] leading-6", a.danger ? "text-lightcoral" : "text-ink")}>{a.label}</span>
        {a.hint && <span className="block text-[14px] leading-5 text-ink-3">{a.hint}</span>}
      </span>
      {a.href && <ExternalLink className="h-4 w-4 shrink-0 text-ink-4" />}
    </>
  );
  return a.href
    ? a.portal
      ? <a role="menuitem" href={a.href} target={portalTarget(a.portal)} onClick={onDone} className={cls}>{body}</a>
      : <a role="menuitem" href={a.href} target="_blank" rel="noopener" onClick={onDone} className={cls}>{body}</a>
    : <button role="menuitem" type="button" onClick={() => { onDone(); a.onClick?.(); }} className={cls}>{body}</button>;
}

/**
 * A titled group of rows. `actions` sit on the right of the title, centred on
 * it. An `id` lets something higher up the page jump to it; the margin keeps
 * its title clear of the sticky PageHead (which sticks from a tablet up).
 */
export function Group({ title, actions, hint, children, className, id }: {
  title: ReactNode; actions?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return (
    <section id={id} className={cx("scroll-mt-4 md:scroll-mt-40", className)}>
      <div className={cx("mb-2.5 flex items-center justify-between gap-3", actions && "min-h-11")}>
        <h2 className={GROUP_TITLE}>{title}</h2>
        {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
      {children}
      {hint && <p className="mt-2 text-[14px] leading-5 text-ink-3">{hint}</p>}
    </section>
  );
}

/** The bordered box rows sit in. */
export function Box({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("border border-faded bg-odd", className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

/** Rows on one page of a list. Long enough to scan, short enough to reach the arrows. */
export const PAGE_SIZE = 25;

export interface Paged<T> {
  /** This page's rows. */
  rows: T[];
  /** From 0. */
  page: number;
  pages: number;
  total: number;
  size: number;
  setPage: (page: number) => void;
}

/**
 * One page of a list. A new `resetKey` (the search and filters, joined into a
 * string) goes back to the first page, so a narrower list never opens on an
 * empty page 4. If rows go away and the page runs off the end, it shows the
 * last page instead.
 */
export function usePaged<T>(rows: T[], size: number = PAGE_SIZE, resetKey?: string | number): Paged<T> {
  const [page, setPage] = useState(0);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) { setKey(resetKey); setPage(0); }
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(page, pages - 1);
  return { rows: rows.slice(at * size, (at + 1) * size), page: at, pages, total: rows.length, size, setPage };
}

/**
 * The arrows under a list that runs to more than one page: first, previous,
 * next and last, the page it's on, and which rows are showing. A long list
 * gets a box to jump straight to a page. `attached` draws it as the foot of
 * the Box above it. Nothing shows when everything fits on one page.
 */
export function Pager({ page, pages, total, size, setPage, attached }: Omit<Paged<unknown>, "rows"> & { attached?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  if (pages <= 1) return null;
  const from = page * size + 1, to = Math.min(total, (page + 1) * size);

  function go(p: number) {
    setPage(Math.max(0, Math.min(pages - 1, p)));
    // Back up to the top of the list when it has scrolled away, so the new page reads from its first row.
    const list = root.current?.closest("section") ?? root.current?.parentElement;
    requestAnimationFrame(() => { if (list && list.getBoundingClientRect().top < 140) list.scrollIntoView({ block: "start" }); });
  }

  const arrow = "h-11 w-11 shrink-0 px-0";
  return (
    <nav
      ref={root} aria-label="Pages"
      className={cx(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border border-faded bg-alt px-3 py-2 sm:px-4",
        attached ? "border-t-0" : "mt-3",
      )}
    >
      <p className="text-[15px] text-ink-2" aria-live="polite">
        Showing <span className="font-medium text-ink">{from}–{to}</span> of <span className="font-medium text-ink">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" className={arrow} aria-label="First page" title="First page" disabled={page === 0} onClick={() => go(0)}>
          <ChevronsLeft className="h-6 w-6" />
        </Button>
        <Button variant="secondary" className="h-11 px-2.5 sm:px-3" aria-label="Previous page" title="Previous page" disabled={page === 0} onClick={() => go(page - 1)}>
          <ChevronLeft className="h-6 w-6" /><span className="hidden sm:inline">Previous</span>
        </Button>
        {pages > 4 ? (
          <span className="flex items-center gap-2 px-1 text-[15px] text-ink-2">
            <span className="hidden sm:inline">Page</span>
            <Select value={page} onChange={e => go(Number(e.target.value))} aria-label="Go to page" className="h-11 w-auto min-w-[4.5rem] text-[16px]">
              {Array.from({ length: pages }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
            </Select>
            of {pages}
          </span>
        ) : (
          <span className="whitespace-nowrap px-2 text-[15px] text-ink-2">
            <span className="hidden sm:inline">Page </span><span className="font-medium text-ink">{page + 1}</span> of {pages}
          </span>
        )}
        <Button variant="secondary" className="h-11 px-2.5 sm:px-3" aria-label="Next page" title="Next page" disabled={page >= pages - 1} onClick={() => go(page + 1)}>
          <span className="hidden sm:inline">Next</span><ChevronRight className="h-6 w-6" />
        </Button>
        <Button variant="ghost" className={arrow} aria-label="Last page" title="Last page" disabled={page >= pages - 1} onClick={() => go(pages - 1)}>
          <ChevronsRight className="h-6 w-6" />
        </Button>
      </div>
    </nav>
  );
}

/** A Box of rows with the Pager at its foot: the usual list. */
export function PagedBox<T>({ rows, render, size, resetKey, className }: {
  rows: T[]; render: (row: T, index: number) => ReactNode; size?: number; resetKey?: string | number; className?: string;
}) {
  const p = usePaged(rows, size, resetKey);
  return (
    <>
      <Box className={className}>{p.rows.map(render)}</Box>
      <Pager {...p} attached />
    </>
  );
}

/** One row inside a box: rows divide, the last one doesn't. */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("border-b border-divider px-4 py-4 last:border-b-0", className)}>{children}</div>;
}

/** Label over value, in a responsive grid. Empty values say so instead of vanishing. */
export function Facts({ children, cols = 3, className }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <dl className={cx("grid grid-cols-1 gap-x-8 gap-y-4 px-4 py-4", grid, className)}>{children}</dl>;
}

export function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  const empty = children == null || children === "" || children === false;
  return (
    <div className={cx("min-w-0", wide && "sm:col-span-full")}>
      <dt className="text-[14px] text-ink-3">{label}</dt>
      <dd className={cx("mt-0.5 whitespace-pre-line break-words text-[17px] leading-6", empty ? "text-ink-4" : "text-ink")}>
        {empty ? "Not recorded" : children}
      </dd>
    </div>
  );
}

/** Supporting text. */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-[14px] leading-5 text-ink-3", className)}>{children}</p>;
}

export function Loading() {
  return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;
}

/** What went wrong loading a page, in a sentence, with a button to try again. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const notReady = error instanceof ApiError && error.body.code === "INSPECTIONS_NOT_READY";
  const off = error instanceof ApiError && error.body.code === "MODULE_DISABLED";
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-orange" />
      <h2 className="mt-3 text-[20px] font-medium">
        {notReady ? "Not set up yet" : off ? "Inspections is switched off" : "This page didn't load"}
      </h2>
      <p className="mt-1 text-[16px] text-ink-2">
        {off ? "An administrator can switch Inspections on in the Department Portal, under Settings → Modules." : errorMessage(error)}
      </p>
      {onRetry && !off && <Button className="mt-5" onClick={onRetry}><RotateCw className="h-4 w-4" />Try again</Button>}
    </div>
  );
}

/** Spinner while loading, the error with a retry if it failed, otherwise the content. */
export function QueryState({ query, children }: {
  query: { isLoading: boolean; error: unknown; data: unknown; refetch: () => unknown }; children: ReactNode;
}) {
  if (query.isLoading) return <Loading />;
  if (query.error && !query.data) return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  return <>{children}</>;
}

/** An empty list: what goes here, and the button that adds the first one. */
export function EmptyBox({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed border-faded px-6 py-12 text-center">
      <p className="text-[18px] font-medium text-ink-2">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-lg text-[15px] leading-6 text-ink-3">{children}</div>}
    </div>
  );
}

/**
 * A row in a list. The whole row is the button: a big target, the title on
 * top, one line of detail under it, badges beside it, and an arrow on the
 * right so it's plain that it opens.
 */
export function ListRow({ href, title, detail, tags, aside, lead, edge, muted }: {
  href: string; title: ReactNode; detail?: ReactNode; tags?: ReactNode; aside?: ReactNode; lead?: ReactNode;
  edge?: string; muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "flex min-h-[68px] w-full items-center gap-4 border-b border-l-4 border-b-divider px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-hover",
        edge ?? "border-l-transparent",
      )}
    >
      {lead}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={cx("text-[17px] font-medium leading-6", muted ? "text-ink-3" : "text-ink")}>{title}</span>
          {tags}
        </span>
        {detail && <span className="mt-0.5 block text-[15px] leading-5 text-ink-3">{detail}</span>}
      </span>
      {aside && <span className="shrink-0 text-right">{aside}</span>}
      <ChevronRight className="h-6 w-6 shrink-0 text-ink-4" />
    </Link>
  );
}

/** A search box with a clear button, for the top of a list. */
export function SearchBox({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder: string; className?: string;
}) {
  return (
    <div className={cx("relative w-full max-w-md", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="pl-10 pr-11" type="search" />
      {value && (
        <IconButton label="Clear the search" onClick={() => onChange("")} className="absolute right-0.5 top-1/2 -translate-y-1/2">
          <X className="h-5 w-5" />
        </IconButton>
      )}
    </div>
  );
}

/**
 * One filter in a FilterBar's panel. `empty` is the page's usual view: Reset
 * goes back to it, and only a value other than it shows as a chip.
 */
export interface FilterDef<T extends string = string> {
  label: string;
  value: T;
  empty: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/**
 * The bar over every list, the platform's filtering standard (FilterToolbar in
 * the Department Portal): the search box on the left, a Filters button on the
 * right that opens the choices, and every filter that's on shown underneath as
 * a chip you can take off. Nothing narrows a list where you can't see it.
 */
export function FilterBar({ search, filters }: {
  search: { value: string; onChange: (v: string) => void; placeholder: string };
  // Each filter has its own set of values, so a page can pass its state setters straight in.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filters: FilterDef<any>[];
}) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = (refocus = false) => { setOpen(false); if (refocus) button.current?.focus(); };
  useEscape(open, () => close(true));
  useFocusTrap(open, panel);
  const place = useFloating(open && !sheet, button, panel, "end", () => close());
  const on = filters.filter(f => f.value !== f.empty);
  const labelOf = (f: FilterDef) => f.options.find(o => o.value === f.value)?.label ?? f.value;

  // The first choice takes the keyboard once the panel is placed (it's hidden while it's measured).
  const shown = open && (sheet || place != null);
  useEffect(() => {
    if (shown) panel.current?.querySelector<HTMLElement>("[aria-haspopup=listbox]")?.focus({ preventScroll: true });
  }, [shown]);

  function show() {
    setDraft(filters.map(f => f.value));
    setSheet(window.innerWidth < 640);
    setOpen(true);
  }
  function apply() {
    filters.forEach((f, i) => { if (draft[i] !== f.value) f.onChange(draft[i]); });
    close(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <SearchBox {...search} className="min-w-0 max-w-xl flex-1" />
        <Button
          ref={button} size="lg" aria-haspopup="dialog" aria-expanded={open} aria-label={on.length ? `Filters, ${on.length} on` : "Filters"}
          onClick={() => (open ? close() : show())} className="ml-auto shrink-0 px-3 sm:px-5"
        >
          <SlidersHorizontal className="h-5 w-5" /><span className="hidden sm:inline">Filters</span>
          {on.length > 0 && <Count>{on.length}</Count>}
        </Button>
        {open && createPortal(
          <>
            <div className="fixed inset-0 z-[60] bg-mask/70 sm:bg-transparent" onClick={() => close()} />
            {/* A sheet from the bottom on a phone, a panel under the button from a tablet up. */}
            <div
              ref={panel} role="dialog" aria-label="Filters"
              style={sheet ? undefined : place ?? { top: 0, left: 0, visibility: "hidden" }}
              className={cx(
                "fixed z-[60] overflow-y-auto bg-surface text-ink shadow-float",
                sheet ? "inset-x-0 bottom-0 max-h-[90dvh]" : "w-[min(26rem,calc(100vw-16px))] rounded-sm border border-divider",
              )}
            >
              <div className="space-y-5 px-5 py-5">
                <h2 className="text-[20px] font-medium leading-7 text-white">Filters</h2>
                {filters.map((f, i) => (
                  <Field key={f.label} label={f.label}>
                    <Select value={draft[i]} onChange={e => setDraft(d => d.map((v, j) => (j === i ? e.target.value : v)))}>
                      {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </Field>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-divider px-5 py-3.5">
                <Button variant="ghost" onClick={() => setDraft(filters.map(f => f.empty))}>Reset</Button>
                <Button variant="ghost" className="ml-auto" onClick={() => close(true)}>Cancel</Button>
                <Button variant="primary" onClick={apply}>Apply filters</Button>
              </div>
            </div>
          </>,
          document.body,
        )}
      </div>
      {on.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {on.map(f => (
            <button
              key={f.label} type="button" onClick={() => f.onChange(f.empty)} aria-label={`Take off the filter ${f.label}: ${labelOf(f)}`}
              className="inline-flex h-10 items-center gap-2 rounded-[20px] bg-chip pl-4 pr-3 text-[15px] text-dark transition-colors hover:bg-chip-hover"
            >
              {f.label}: {labelOf(f)}<X className="h-4 w-4" />
            </button>
          ))}
          {on.length > 1 && <Button variant="ghost" size="sm" className="text-sky" onClick={() => on.forEach(f => f.onChange(f.empty))}>Clear all</Button>}
        </div>
      )}
    </div>
  );
}

/** Asks before something that can't be undone, in plain words. */
export function Confirm({ open, title, body, confirmLabel, danger, busy, onConfirm, onClose, children }: {
  open: boolean; title: string; body?: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onClose: () => void; children?: ReactNode;
}) {
  return (
    <Modal
      open={open} onClose={onClose} title={title} size="sm" tone={danger ? "danger" : undefined}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Go back</Button>
        <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </>}
    >
      {body && <div className="text-[16px] leading-6 text-ink-2">{body}</div>}
      {children}
    </Modal>
  );
}

/**
 * The box at the top of a record's history: write a line, press Add. If it
 * doesn't save, the words stay in the box (onAdd says why) to try again.
 */
export function NoteComposer({ onAdd }: { onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-b border-divider bg-surface px-4 py-3 sm:flex-row sm:items-end">
      <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Add a note to this record" aria-label="A note to add" className="min-h-[64px] flex-1" />
      <Button
        variant="primary" disabled={!text.trim()} loading={busy}
        onClick={async () => {
          setBusy(true);
          try { await onAdd(text.trim()); setText(""); } catch { /* onAdd has said what went wrong */ } finally { setBusy(false); }
        }}
      >
        Add note
      </Button>
    </div>
  );
}
