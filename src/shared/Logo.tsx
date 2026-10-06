import { cx } from "@/components/ui";
import { PORTAL } from "@/portal";

/** `wordmark="sm"` drops the name on phones, where the title bar needs the room. */
export function Logo({ compact, wordmark, className }: { compact?: boolean; wordmark?: "sm"; className?: string }) {
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <img src="/logo-mark.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
      {!compact && (
        <div className={cx("leading-tight", wordmark === "sm" && "hidden sm:block")}>
          <div className="text-[18px] font-medium text-white">{PORTAL.name}</div>
          <div className="text-[12px] text-ink-3">StationClipboard</div>
        </div>
      )}
    </div>
  );
}
