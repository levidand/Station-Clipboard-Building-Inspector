import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, CloudUpload, X } from "lucide-react";
import { cx } from "./ui";

/** waiting: saved on the device, not on the server yet. */
type Tone = "success" | "error" | "waiting";
interface Toast { id: number; tone: Tone; message: string }

let listeners: ((t: Toast[]) => void)[] = [];
let toasts: Toast[] = [];
let seq = 0;

function push(tone: Tone, message: string) {
  const t = { id: ++seq, tone, message };
  toasts = [...toasts.slice(-3), t];
  listeners.forEach(l => l(toasts));
  setTimeout(() => dismiss(t.id), tone === "success" ? 4000 : 9000);
}

function dismiss(id: number) {
  toasts = toasts.filter(t => t.id !== id);
  listeners.forEach(l => l(toasts));
}

export const toast = {
  success: (m: string) => push("success", m),
  error: (m: string) => push("error", m),
  waiting: (m: string) => push("waiting", m),
};

/** Messages at the top, under the title bar, clear of dialog buttons: grey for confirmations, alert red for errors. */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.push(setItems);
    return () => { listeners = listeners.filter(l => l !== setItems); };
  }, []);
  return (
    <div className="pointer-events-none fixed top-[68px] left-1/2 z-[100] flex w-[min(92vw,480px)] -translate-x-1/2 flex-col gap-2">
      {items.map(t => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cx(
            "pointer-events-auto flex items-center gap-3 rounded-md px-4 py-3.5 text-[16px] shadow-float",
            t.tone === "error" ? "bg-red text-white" : "border border-faded bg-surface text-ink",
          )}
        >
          {t.tone === "error" ? <AlertTriangle className="h-5 w-5 shrink-0 text-white" />
            : t.tone === "waiting" ? <CloudUpload className="h-5 w-5 shrink-0 text-orange" />
            : <CheckCircle2 className="h-5 w-5 shrink-0 text-lightgreen" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className={t.tone === "error" ? "text-white/80 hover:text-white" : "text-ink-3 hover:text-ink"} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
