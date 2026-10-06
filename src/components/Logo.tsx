import { cx } from "./ui";

export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <img src="/logo-mark.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
      {!compact && (
        <div className="leading-tight">
          <div className="text-[19px] font-medium text-white">Inspection Portal</div>
          <div className="text-[13px] text-ink-3">StationClipboard</div>
        </div>
      )}
    </div>
  );
}
