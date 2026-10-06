import {
  Children, Fragment, forwardRef, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState,
  type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ComponentType, type CSSProperties, type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import clsx, { type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { Check, ChevronDown, Loader2, X } from "lucide-react";

/*
 * The portal's component set: the Command Portal's Material dark components
 * (src/components/ui.tsx there), sized up. Controls are 44px or taller and
 * labels are 15–17px, because the people using this are on their feet with a
 * tablet in one hand, and many of them wear reading glasses.
 */

const twMerge = extendTailwindMerge({
  extend: { theme: { shadow: ["bar", "float", "raised"] } },
});

/** clsx + tailwind-merge: a class passed in overrides the component default it conflicts with. */
export const cx = (...v: ClassValue[]) => twMerge(clsx(v));

export type IconType = ComponentType<{ className?: string }>;

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ok" | "warn" | "decline" | "go";
type Size = "sm" | "md" | "lg";

const FILLED_DISABLED = "disabled:border-transparent disabled:bg-black/[.12] disabled:text-ink-4 disabled:shadow-none";
const FLAT_DISABLED = "disabled:bg-transparent disabled:text-ink-4";

const VARIANT: Record<Variant, string> = {
  /* navy, blue on hover, near-black while pressed */
  primary: cx("border-navy-line bg-navy text-white shadow-raised hover:border-blue-line hover:bg-blue active:bg-navy-pressed", FILLED_DISABLED),
  /* outlined */
  secondary: cx("border-faded bg-transparent text-ink hover:bg-white/[.075] active:bg-navy-pressed", FLAT_DISABLED),
  /* flat, white text */
  ghost: cx("border-transparent text-ink hover:bg-white/[.075] active:bg-navy-pressed", FLAT_DISABLED),
  danger: cx("border-red-line bg-red text-white shadow-raised hover:bg-red-pressed", FILLED_DISABLED),
  ok: cx("border-green-line bg-green text-white shadow-raised hover:bg-green-pressed", FILLED_DISABLED),
  warn: cx("border-orange-dark bg-orange text-dark shadow-raised hover:bg-orange-dark active:bg-orange-pressed", FILLED_DISABLED),
  /* red text, fills on hover */
  decline: cx("border-transparent text-lightcoral hover:bg-red-pressed hover:text-white active:bg-red", FLAT_DISABLED),
  /* the sign-in button */
  go: "border-field-line bg-go text-white hover:brightness-110 disabled:bg-field disabled:text-ink-4",
};
const SIZE: Record<Size, string> = {
  sm: "h-10 px-3 text-[14px] gap-1.5",
  md: "h-11 px-4 text-[15px] gap-2",
  lg: "h-12 px-5 text-[16px] gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-sm border font-medium uppercase tracking-[0.02em] transition-colors",
        "disabled:pointer-events-none",
        VARIANT[variant], SIZE[size], className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

/** A link that looks like a button. */
export function ButtonLink({ variant = "secondary", size = "md", className, children, ...rest }:
  AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return (
    <a
      className={cx(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-sm border font-medium uppercase tracking-[0.02em] transition-colors",
        VARIANT[variant], SIZE[size], className,
      )}
      {...rest}
    >
      {children}
    </a>
  );
}

/** A bare icon that dims on hover. Always labelled, for screen readers and the hover tip. */
export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-white/[.075] hover:text-ink disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form controls — #999 border, translucent fill, yellow focus
// ---------------------------------------------------------------------------

const control =
  "w-full rounded-none border border-field-line bg-field px-3 text-[17px] font-medium text-ink " +
  "placeholder:font-normal placeholder:text-ink-4 transition-[border-color,box-shadow] " +
  "focus:border-yellow focus:shadow-[inset_0_-2px_0_var(--color-yellow)] focus:outline-none focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:border-faded disabled:text-ink-4";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(control, "h-12", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(control, "min-h-[104px] py-2.5 leading-snug", className)} {...rest} />;
});

/**
 * Where a floating panel goes, in screen coordinates: under its button if it
 * fits, over it if that fits, otherwise slid up the screen until it does. It
 * only scrolls when it's taller than the screen itself.
 */
export function floatPlace(r: DOMRect, w: number, h: number, align: "start" | "end" = "start"): { top: number; left: number; maxHeight?: number } {
  const gap = 4, edge = 8, vw = window.innerWidth, vh = window.innerHeight;
  const left = Math.max(edge, Math.min(align === "end" ? r.right - w : r.left, vw - w - edge));
  if (h <= vh - r.bottom - gap - edge) return { top: r.bottom + gap, left };
  if (h <= r.top - gap - edge) return { top: r.top - gap - h, left };
  if (h <= vh - 2 * edge) return { top: vh - edge - h, left };
  return { top: edge, left, maxHeight: vh - 2 * edge };
}

interface SelectOption { value: string; label: string; disabled: boolean; group: string | null }

const textOf = (n: ReactNode): string =>
  typeof n === "string" || typeof n === "number" ? String(n)
    : Array.isArray(n) ? n.map(textOf).join("")
      : isValidElement<{ children?: ReactNode }>(n) ? textOf(n.props.children) : "";

/** The <option>s and <optgroup>s written inside a Select, flattened. */
function readOptions(children: ReactNode, group: string | null = null, out: SelectOption[] = []): SelectOption[] {
  Children.forEach(children, child => {
    if (!isValidElement<{ value?: unknown; label?: string; disabled?: boolean; children?: ReactNode }>(child)) return;
    const p = child.props;
    if (child.type === "option") out.push({ value: String(p.value ?? textOf(p.children)), label: textOf(p.children), disabled: !!p.disabled, group });
    else if (child.type === "optgroup") readOptions(p.children, p.label ?? null, out);
    else if (child.type === Fragment) readOptions(p.children, group, out);
  });
  return out;
}

export interface SelectProps {
  value: string | number | null | undefined;
  /** Shaped like a native select's change event, so `e.target.value` works as it always did. */
  onChange?: (e: { target: { value: string } }) => void;
  /** <option> and <optgroup> elements, as in a native select. */
  children?: ReactNode;
  /** Shown, dimmed, while nothing in the list is chosen. */
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
}

/**
 * A drop-down in the portal's own look. The browser's native list ignores the
 * theme (small type, the system's colours, its own scroll box), so this draws
 * the list itself: 48px rows in 17px type, the chosen one filled blue with a
 * tick, groups under small-caps titles. It opens under the box, or over it near
 * the bottom of the screen, and is never cut off by a dialog. On a phone it's a
 * sheet from the bottom. Arrow keys, Home/End, Enter, Escape and typing the
 * first letters all work.
 */
export function Select({ value, onChange, children, placeholder = "Pick one…", className, id, disabled, autoFocus, "aria-label": ariaLabel }: SelectProps) {
  const options = readOptions(children);
  const current = String(value ?? "");
  const chosen = options.find(o => o.value === current);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();

  function close() { setOpen(false); button.current?.focus({ preventScroll: true }); }
  function pick(v: string) {
    close();
    if (v !== current) onChange?.({ target: { value: v } });
  }

  return (
    <>
      <button
        ref={button} type="button" id={id} disabled={disabled} autoFocus={autoFocus} aria-label={ariaLabel}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}
        className={cx(control, "flex h-12 cursor-pointer items-center gap-2 pr-2 text-left", open && "border-yellow shadow-[inset_0_-2px_0_var(--color-yellow)]", className)}
      >
        {/* Every option sits invisibly in the same grid cell, so a box that
            isn't full width is as wide as its longest choice, like a native one. */}
        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden">
          <span className={cx("truncate [grid-area:1/1]", !chosen && "font-normal text-ink-4")}>{chosen?.label ?? placeholder}</span>
          {options.map(o => <span key={o.value} aria-hidden className="invisible h-0 overflow-hidden whitespace-nowrap [grid-area:1/1]">{o.label}</span>)}
        </span>
        <ChevronDown className={cx("h-5 w-5 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && button.current && (
        <SelectList id={listId} anchor={button.current} options={options} current={current} onPick={pick} onClose={close} />
      )}
    </>
  );
}

function SelectList({ id, anchor, options, current, onPick, onClose }: {
  id: string; anchor: HTMLElement; options: SelectOption[]; current: string; onPick: (v: string) => void; onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [phone] = useState(() => window.innerWidth < 640);
  // A long list (forty inspection types) runs down two or three columns
  // instead of off the bottom of the screen.
  const [cols] = useState(() => (phone ? 1 : Math.max(1, Math.min(3, Math.ceil(options.length / 12), Math.floor((window.innerWidth - 16) / 240)))));
  const [colWidth] = useState(() => Math.min(window.innerWidth - 16, Math.max(anchor.offsetWidth, cols * 256)));
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const [active, setActive] = useState(() => {
    const at = options.findIndex(o => o.value === current);
    return at >= 0 ? at : options.findIndex(o => !o.disabled);
  });
  const typed = useRef({ text: "", at: 0 });
  /** Outline the highlighted row only once the keys are in use; for a finger or a mouse the fill says enough. */
  const [keyed, setKeyed] = useState(false);
  // The sheet's title: the words of the Field this sits in.
  const [title] = useState(() => anchor.closest("label")?.firstElementChild?.firstChild?.textContent?.trim() || anchor.getAttribute("aria-label") || "Choose one");

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (!phone) setPlace(floatPlace(anchor.getBoundingClientRect(), el.offsetWidth, el.offsetHeight));
  }, [anchor, phone]);

  // Focus once it's placed: while it's being measured it's hidden, and a hidden element can't take focus.
  const shown = phone || place != null;
  useEffect(() => {
    if (shown) panel.current?.focus({ preventScroll: true });
  }, [shown]);

  // Keep the highlighted choice in view, moving only the list (scrollIntoView
  // would move the page under it too).
  useEffect(() => {
    const box = panel.current;
    const row = box?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (!box || !row) return;
    const top = row.offsetTop, bottom = top + row.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }, [active, place]);

  // Under a button, the list would be left behind if the page moved: close it instead.
  useEffect(() => {
    if (phone) return;
    const onScroll = (e: Event) => { if (!panel.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => { window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onClose); };
  }, [phone, onClose]);

  function step(from: number, by: number) {
    for (let i = 1; i <= options.length; i++) {
      const j = (from + by * i + options.length * i) % options.length;
      if (!options[j].disabled) return j;
    }
    return from;
  }

  function keys(e: ReactKeyboardEvent) {
    setKeyed(true);
    const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter(i => i >= 0);
    if (e.key === "ArrowDown") setActive(a => step(a, 1));
    else if (e.key === "ArrowUp") setActive(a => step(a, -1));
    else if (e.key === "Home") setActive(enabled[0] ?? 0);
    else if (e.key === "End") setActive(enabled[enabled.length - 1] ?? 0);
    else if (e.key === "Enter" || e.key === " ") { if (options[active] && !options[active].disabled) onPick(options[active].value); }
    else if (e.key === "Escape" || e.key === "Tab") onClose();
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Typing jumps to the first choice that starts with what was typed.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const hit = enabled.find(i => options[i].label.toLowerCase().startsWith(typed.current.text));
      if (hit !== undefined) setActive(hit);
    } else return;
    e.preventDefault();
    // Keeps Escape from also closing the dialog or panel this list sits in.
    e.stopPropagation();
  }

  let lastGroup: string | null = null;
  const rows = options.map((o, i) => {
    const header = o.group !== lastGroup && o.group != null;
    const divide = i > 0 && o.group !== lastGroup;
    lastGroup = o.group;
    const on = o.value === current;
    return (
      <div key={`${o.group}:${o.value}`} className={cx("break-inside-avoid", divide && "mt-1.5 border-t border-divider pt-1.5")}>
        {header && <div role="presentation" className="px-4 pb-1 pt-1.5 text-[13px] font-medium uppercase tracking-[0.06em] text-ink-3">{o.group}</div>}
        <div
          id={`${id}-${i}`} data-i={i} role="option" aria-selected={on} aria-disabled={o.disabled || undefined}
          onMouseMove={() => { if (!o.disabled && active !== i) setActive(i); }}
          onClick={() => { if (!o.disabled) onPick(o.value); }}
          className={cx(
            "flex cursor-pointer items-center gap-3 px-4 py-2.5 text-[17px] leading-6",
            phone ? "min-h-14" : "min-h-12",
            on ? "bg-blue text-white" : i === active ? "bg-hover text-ink" : "text-ink",
            on && keyed && i === active && "shadow-[inset_0_0_0_2px_rgb(255_255_255/0.55)]",
            o.disabled && "cursor-default opacity-45",
          )}
        >
          <Check className={cx("h-5 w-5 shrink-0", on ? "text-white" : "invisible")} strokeWidth={3} />
          <span className="min-w-0 flex-1">{o.label}</span>
        </div>
      </div>
    );
  });

  return createPortal(
    <>
      <div className={cx("fixed inset-0 z-[60]", phone && "bg-mask/70")} onClick={onClose} />
      <div
        ref={panel} id={id} role="listbox" tabIndex={-1} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        onKeyDown={keys}
        style={phone ? undefined : {
          position: "fixed", minWidth: anchor.offsetWidth,
          ...(cols > 1 ? { columnCount: cols, columnGap: 0, width: colWidth } : {}),
          ...(place ?? { top: 0, left: 0, visibility: "hidden" }),
        }}
        className={cx(
          "z-[61] overflow-y-auto bg-surface text-ink shadow-float outline-none",
          phone
            ? "fixed inset-x-0 bottom-0 max-h-[85dvh] pb-3"
            : cx("rounded-sm border border-divider py-1.5", cols > 1 ? "[column-rule:1px_solid_var(--color-divider)]" : "w-max max-w-[min(32rem,calc(100vw-16px))]"),
        )}
      >
        {phone && (
          <div className="flex items-center justify-between py-1 pl-5 pr-2">
            <h2 className="text-[20px] font-medium">{title.replace(/\s*\(required\)$/, "")}</h2>
            <IconButton label="Close" onClick={onClose}><X className="h-6 w-6" /></IconButton>
          </div>
        )}
        {options.length === 0 ? <p className="px-4 py-3 text-[16px] text-ink-3">Nothing to choose from.</p> : rows}
      </div>
    </>,
    document.body,
  );
}

/** A label above its control. `required` adds a quiet "required" after the label. */
export function Field({ label, hint, children, className, required }: {
  label: string; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[15px] font-medium leading-5 text-ink">
        {label}{required && <span className="ml-1.5 text-[13px] font-normal text-ink-3">(required)</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[14px] leading-5 text-ink-3">{hint}</span>}
    </label>
  );
}

/** Lightcoral track off, lightgreen on, white thumb. */
export function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-4 py-1.5">
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className={cx(
        "relative ml-1 h-5 w-12 shrink-0 rounded-full transition-colors",
        "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-yellow",
        checked ? "bg-lightgreen" : "bg-lightcoral",
      )}>
        <span className={cx(
          "absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.55)] transition-[left]",
          checked ? "left-[calc(100%-26px)]" : "-left-0.5",
        )} />
      </span>
      <span className="min-w-0">
        <span className="block text-[17px] leading-6 text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[14px] leading-5 text-ink-3">{description}</span>}
      </span>
    </label>
  );
}

/** The toggle's switch on its own, for a row that turns on and off in place. Says On or Off beside it. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex h-11 shrink-0 items-center gap-2.5 rounded-sm px-2 focus-visible:outline-3 focus-visible:outline-yellow disabled:opacity-45"
    >
      <span className={cx("relative h-5 w-12 rounded-full transition-colors", checked ? "bg-lightgreen" : "bg-lightcoral")}>
        <span className={cx(
          "absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.55)] transition-[left]",
          checked ? "left-[calc(100%-26px)]" : "-left-0.5",
        )} />
      </span>
      <span className="w-8 text-left text-[15px] text-ink-2">{checked ? "On" : "Off"}</span>
    </button>
  );
}

/** Material check box, lightgreen when checked. */
export function Checkbox({ checked, onChange, children, className, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; className?: string; disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx("flex min-h-11 cursor-pointer items-center gap-3", disabled && "cursor-not-allowed opacity-50", className)}>
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className={cx(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border-2 transition-colors",
        "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-yellow",
        checked ? "border-lightgreen bg-lightgreen text-surface" : "border-ink-3",
      )}>
        {checked && <Check className="h-5 w-5" strokeWidth={3.5} />}
      </span>
      {children != null && <span className="min-w-0 flex-1 text-[16px]">{children}</span>}
    </label>
  );
}

/** A whole row that ticks on and off: a big box, the words, and who ticked it. */
export function CheckGlyphButton({ checked, onClick, label, detail, disabled }: {
  checked: boolean; onClick: () => void; label: string; detail?: string; disabled?: boolean;
}) {
  return (
    <button
      type="button" role="checkbox" aria-checked={checked} disabled={disabled} onClick={onClick}
      className="flex min-h-14 min-w-0 flex-1 items-center gap-4 px-4 py-2.5 text-left transition-colors hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent"
    >
      <span className={cx(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] border-2 transition-colors",
        checked ? "border-lightgreen bg-lightgreen text-surface" : "border-ink-3",
      )}>
        {checked && <Check className="h-5 w-5" strokeWidth={3.5} />}
      </span>
      <span className="min-w-0">
        <span className={cx("block text-[17px] leading-6", checked ? "text-ink-3 line-through" : "text-ink")}>{label}</span>
        {detail && <span className="block text-[14px] text-ink-3">{detail}</span>}
      </span>
    </button>
  );
}

/**
 * Big navy choices. The chosen one fills with its tone (blue unless the choice
 * carries a meaning of its own: green for Pass, red for Fail).
 */
export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: {
  value: T | null; onChange: (v: T) => void; options: { value: T; label: ReactNode; tone?: Tone }[];
  className?: string; size?: "md" | "lg";
}) {
  return (
    <div className={cx("flex flex-wrap gap-1.5", className)} role="radiogroup">
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex items-center justify-center gap-1.5 rounded-sm border px-4 font-medium uppercase tracking-[0.02em] transition-colors",
              size === "lg" ? "h-12 min-w-20 text-[15px]" : "h-11 text-[14px]",
              on ? cx(TONE_SOLID[o.tone ?? "brand"], "border-transparent shadow-raised")
                : "border-navy-line bg-navy text-ink-2 hover:border-blue-line hover:bg-blue hover:text-white",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type Tone = "brand" | "ok" | "warn" | "danger" | "info" | "muted";

/** Solid fills — status pills and chosen options. Dark text on the light fills, #222 on orange. */
export const TONE_SOLID: Record<Tone, string> = {
  brand: "bg-blue text-white",
  ok: "bg-green text-dark",
  warn: "bg-orange text-dark",
  danger: "bg-red text-white",
  info: "bg-sky text-dark",
  muted: "bg-hover text-ink",
};

/** Text and icon colour that reads on the dark surfaces. */
export const TONE_TEXT: Record<Tone, string> = {
  brand: "text-sky-light", ok: "text-lightgreen", warn: "text-orange", danger: "text-lightcoral", info: "text-sky", muted: "text-ink-3",
};

/** Left edge colour for a row keyed to its state. */
export const TONE_EDGE: Record<Tone, string> = {
  brand: "border-l-blue", ok: "border-l-green", warn: "border-l-orange", danger: "border-l-red", info: "border-l-sky", muted: "border-l-faded",
};

/** Status pill. Colour always rides with a word, never alone. */
export function Badge({ tone = "muted", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx(
      "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium leading-none",
      TONE_SOLID[tone], className,
    )}>
      {children}
    </span>
  );
}

/** The orange count bubble. `neutral` for plain tallies. */
export function Count({ children, tone = "accent", className }: { children: ReactNode; tone?: "accent" | "neutral" | "alert"; className?: string }) {
  return (
    <span className={cx(
      "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[13px] font-medium leading-none tabular-nums",
      tone === "accent" ? "bg-orange text-dark" : tone === "alert" ? "bg-red text-white" : "bg-black/35 text-ink-2",
      className,
    )}>
      {children}
    </span>
  );
}

/** Light grey pill, blue when selected. */
export function Chip({ on, onClick, children, className }: { on?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  const cls = cx(
    "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[20px] px-4 text-[15px] transition-colors",
    on ? "bg-chip-on text-white" : "bg-chip text-dark",
    onClick && !on && "hover:bg-chip-hover",
    className,
  );
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={!!on} className={cls}>{children}</button>
    : <span className={cls}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-6 w-6 animate-spin text-ink-3", className)} />;
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

/** The orange-underlined tab used across the top of a record. */
export function ChromeTab({ on, onClick, children, className }: {
  on: boolean; onClick: () => void; children: ReactNode; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        "relative flex h-12 items-center justify-center gap-2 px-4 text-[15px] font-medium uppercase tracking-[0.02em] transition-colors",
        on ? "text-white" : "text-ink-2 hover:text-white",
        className,
      )}
    >
      {children}
      {on && <span className="absolute inset-x-0 bottom-0 h-1 bg-orange-light" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Panels and overlays
// ---------------------------------------------------------------------------

/*
 * Layers, bottom to top. One scale for the whole app, so a menu can never open
 * under something it should cover:
 *   z-10  a page's sticky head          z-20  a bar docked at the foot (settings Save)
 *   z-30  the title bar                 z-50  dialogs
 *   z-[60] menus, filter panels and drop-down lists (portaled to <body>, so they
 *          also work inside a dialog and are never cut off by a scroll box)
 *   z-[100] toasts
 * Maps get their own stacking context (index.css), so Leaflet's z-indexes in the
 * hundreds stay inside the map.
 */

/** What Escape closes: only the layer opened last, so Escape in a Confirm over a dialog leaves the dialog open. */
const escapeLayers: { current: () => void }[] = [];

function onEscapeKey(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented || escapeLayers.length === 0) return;
  e.preventDefault();
  escapeLayers[escapeLayers.length - 1].current();
}

export function useEscape(open: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return;
    if (escapeLayers.length === 0) window.addEventListener("keydown", onEscapeKey);
    escapeLayers.push(ref);
    return () => {
      const at = escapeLayers.lastIndexOf(ref);
      if (at >= 0) escapeLayers.splice(at, 1);
      if (escapeLayers.length === 0) window.removeEventListener("keydown", onEscapeKey);
    };
  }, [open]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps the keyboard inside a dialog while it's open: focus goes in when it
 * opens (to a field marked autoFocus, else the dialog itself), Tab wraps round
 * inside it, and focus goes back to whatever opened it when it closes.
 */
function useFocusTrap(open: boolean, box: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const el = box.current;
    if (el && !el.contains(document.activeElement)) {
      (el.querySelector<HTMLElement>("[autofocus], [data-autofocus]") ?? el).focus({ preventScroll: true });
    }
    function tab(e: KeyboardEvent) {
      if (e.key !== "Tab" || !el) return;
      // A drop-down list or menu open over the dialog looks after its own keys.
      if (!el.contains(document.activeElement) && document.activeElement !== document.body) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(n => n.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); el.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", tab);
    return () => {
      document.removeEventListener("keydown", tab);
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [open, box]);
}

/**
 * #303030 throughout, the title in white and the body text in the highlight
 * colour, over a #111 mask. A danger dialog gets a red header.
 */
export function Modal({ open, onClose, title, description, children, footer, size = "md", tone }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode;
  children?: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl"; tone?: "danger";
}) {
  useEscape(open, onClose);
  if (!open) return null;
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  const danger = tone === "danger";
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-mask/70" onClick={onClose} />
      <div className={cx("relative flex max-h-[94dvh] w-full flex-col overflow-hidden bg-surface shadow-float sm:rounded-sm", width)}>
        <div className={cx("flex shrink-0 items-start gap-3 px-5 pb-4 pt-5 sm:px-6", danger ? "bg-red" : "bg-surface")}>
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-medium leading-7 text-white">{title}</h2>
            {description && <p className={cx("mt-1 text-[15px] leading-6", danger ? "text-white/85" : "text-ink-3")}>{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className={cx("-mr-2 -mt-1", danger && "text-white hover:bg-white/10")}>
            <X className="h-6 w-6" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto border-t border-divider px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-divider px-5 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** A plain bordered box. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("border border-faded bg-surface", className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

export function Menu({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div role="menu" className={cx(
        "absolute right-0 top-full z-50 mt-1 min-w-72 overflow-hidden rounded-sm border border-divider bg-surface py-2 text-ink shadow-float",
        className,
      )}>
        {children}
      </div>
    </>
  );
}

const MENU_ITEM = "flex h-[52px] w-full items-center gap-4 px-4 text-left text-[16px] transition-colors hover:bg-hover";

export function MenuItem({ icon: Icon, danger, children, onClick }: { icon?: IconType; danger?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cx(MENU_ITEM, danger ? "text-lightcoral" : "text-ink")}>
      {Icon && <Icon className={cx("h-5 w-5 shrink-0", danger ? "text-lightcoral" : "text-[#9a9a9a]")} />}
      {children}
    </button>
  );
}

export function MenuLink({ icon: Icon, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { icon?: IconType }) {
  return (
    <a role="menuitem" className={cx(MENU_ITEM, "text-ink")} {...rest}>
      {Icon && <Icon className="h-5 w-5 shrink-0 text-[#9a9a9a]" />}
      {children}
    </a>
  );
}

export function MenuSeparator() {
  return <div className="my-2 border-t border-divider" />;
}

// ---------------------------------------------------------------------------
// Inputs that share a shape
// ---------------------------------------------------------------------------

/** A number box with its unit beside it. Empty means null. */
export function NumberInput({ value, onChange, unit, min, max, className, placeholder }: {
  value: number | null; onChange: (v: number | null) => void; unit?: string; min?: number; max?: number;
  className?: string; placeholder?: string;
}) {
  return (
    <span className="flex items-center gap-3">
      <Input
        type="number" inputMode="numeric" min={min} max={max} placeholder={placeholder}
        value={value ?? ""}
        onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={cx("w-36 tabular-nums", className)}
      />
      {unit && <span className="text-[16px] text-ink-2">{unit}</span>}
    </span>
  );
}

const moneyText = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));
/** "$1,250.5" → 125050; blank → null; anything else → undefined (not a number yet). */
function parseMoney(text: string): number | null | undefined {
  if (!text.trim()) return null;
  const n = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

/** Dollars typed as dollars, kept as cents. */
export function MoneyInput({ cents, onChange, className }: { cents: number | null; onChange: (v: number | null) => void; className?: string }) {
  const [text, setText] = useState(() => moneyText(cents));
  const [seen, setSeen] = useState(cents);
  // Follow a change from outside (a reset, a refetch) without fighting the typing.
  if (seen !== cents) {
    setSeen(cents);
    if (parseMoney(text) !== cents) setText(moneyText(cents));
  }
  return (
    <span className="flex items-center gap-2">
      <span className="text-[17px] text-ink-2">$</span>
      <Input
        inputMode="decimal" value={text} placeholder="0.00"
        onChange={e => {
          setText(e.target.value);
          const parsed = parseMoney(e.target.value);
          if (parsed !== undefined) onChange(parsed);
        }}
        // "75" becomes "75.00" on the way out; something that isn't money goes back to the last amount.
        onBlur={() => { const parsed = parseMoney(text); setText(moneyText(parsed === undefined ? cents : parsed)); }}
        className={cx("w-36 tabular-nums", className)}
      />
    </span>
  );
}
