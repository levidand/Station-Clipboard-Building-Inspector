import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, ChevronRight, RotateCw, Search, SlidersHorizontal, X } from "lucide-react";
import { errorMessage, ApiError } from "@/lib/api";
import { Button, Count, Field, IconButton, Input, Modal, Select, Spinner, Textarea, cx, useEscape } from "./ui";

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
export function PageHead({ title, sub, children, back, badges }: {
  title: ReactNode; sub?: ReactNode; children?: ReactNode; back?: { href: string; label: string }; badges?: ReactNode;
}) {
  return (
    <header className="z-10 -mx-4 flex min-h-[84px] flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-divider bg-alt px-4 py-3.5 shadow-bar md:sticky md:top-0 sm:-mx-6 sm:px-6">
      <div className="min-w-0 flex-1 basis-72">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex min-h-8 items-center gap-1.5 text-[15px] text-sky hover:underline">
            <ArrowLeft className="h-4 w-4" />{back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-[24px] font-medium leading-8 text-ink">{title}</h1>
          {badges}
        </div>
        {sub && <p className="mt-0.5 text-[15px] leading-6 text-ink-3">{sub}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </header>
  );
}

/** A titled group of rows. `actions` sit on the right of the title. */
export function Group({ title, actions, hint, children, className }: {
  title: ReactNode; actions?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2 flex min-h-10 items-end justify-between gap-3">
        <h2 className={GROUP_TITLE}>{title}</h2>
        {actions && <div className="-mb-1 flex shrink-0 flex-wrap justify-end gap-2">{actions}</div>}
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

/** One row inside a box: rows divide, the last one doesn't. */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("border-b border-divider px-4 py-4 last:border-b-0", className)}>{children}</div>;
}

/** Label over value, in a responsive grid. Empty values say so instead of vanishing. */
export function Facts({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <dl className={cx("grid grid-cols-1 gap-x-8 gap-y-4 px-4 py-4", grid)}>{children}</dl>;
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
  const [draft, setDraft] = useState<string[]>([]);
  useEscape(open, () => setOpen(false));
  const on = filters.filter(f => f.value !== f.empty);
  const labelOf = (f: FilterDef) => f.options.find(o => o.value === f.value)?.label ?? f.value;

  function show() {
    setDraft(filters.map(f => f.value));
    setOpen(true);
  }
  function apply() {
    filters.forEach((f, i) => { if (draft[i] !== f.value) f.onChange(draft[i]); });
    setOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <SearchBox {...search} className="min-w-0 max-w-xl flex-1" />
        <div className="relative ml-auto shrink-0">
          <Button size="lg" aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? setOpen(false) : show())}>
            <SlidersHorizontal className="h-5 w-5" />Filters
            {on.length > 0 && <Count>{on.length}</Count>}
          </Button>
          {open && (
            <>
              <div className="fixed inset-0 z-40 bg-mask/70 sm:bg-transparent" onClick={() => setOpen(false)} />
              {/* A sheet from the bottom on a phone, a panel under the button from a tablet up. */}
              <div role="dialog" aria-label="Filters" className="fixed inset-x-0 bottom-0 z-50 bg-surface shadow-float sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[26rem] sm:rounded-sm sm:border sm:border-divider">
                <div className="space-y-5 px-5 py-5">
                  <h2 className="text-[20px] font-medium leading-7 text-white">Filters</h2>
                  {filters.map((f, i) => (
                    <Field key={f.label} label={f.label}>
                      <Select autoFocus={i === 0} value={draft[i]} onChange={e => setDraft(d => d.map((v, j) => (j === i ? e.target.value : v)))}>
                        {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </Field>
                  ))}
                </div>
                <div className="flex items-center gap-2 border-t border-divider px-5 py-3.5">
                  <Button variant="ghost" onClick={() => setDraft(filters.map(f => f.empty))}>Reset</Button>
                  <Button variant="ghost" className="ml-auto" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button variant="primary" onClick={apply}>Apply filters</Button>
                </div>
              </div>
            </>
          )}
        </div>
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

/** A note box under a record's history: write a line, press Add. */
export function NoteComposer({ onAdd }: { onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-t border-divider px-4 py-3 sm:flex-row sm:items-end">
      <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Add a note to this record" className="min-h-[64px] flex-1" />
      <Button
        variant="primary" disabled={!text.trim()} loading={busy}
        onClick={async () => {
          setBusy(true);
          try { await onAdd(text.trim()); setText(""); } finally { setBusy(false); }
        }}
      >
        Add note
      </Button>
    </div>
  );
}
