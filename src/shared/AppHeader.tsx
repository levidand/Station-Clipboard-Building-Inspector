import { useState, type ReactNode } from "react";
import { LogOut, ExternalLink, ChevronDown, UserRound } from "lucide-react";
import { Link, useLocation } from "wouter";
import { storageUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { Menu, MenuItem, MenuLink, MenuSeparator, cx } from "@/components/ui";
import { PORTAL } from "@/portal";
import { departmentPortalHref, portalTarget } from "./departmentPortal";
import { HeaderActions } from "./HeaderActions";
import { Logo } from "./Logo";

export { DEPARTMENT_PORTAL_URL } from "./departmentPortal";

/**
 * The navy title bar, with an optional tab bar under it. Both are navy, so
 * they read as one block of chrome with the active-tab indicator at the foot.
 * The Department Portal's apps, chat and notifications sit at the right, by
 * the member's name, where they are in the Department Portal. `lead` goes
 * before the logo (a menu button), `children` between it and the right.
 */
export function AppHeader({ tabs, lead, children }: { tabs?: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 shrink-0 bg-navy text-white shadow-bar print:hidden">
      <div className="flex min-h-14 items-center gap-2 px-2 sm:gap-3 sm:px-4">
        {lead}
        <Link href="/" className="flex shrink-0 items-center rounded-sm" aria-label={`${PORTAL.name} home`}><Logo wordmark="sm" /></Link>
        <div className="flex min-w-0 flex-1 items-center">{children}</div>
        <HeaderActions />
        <UserMenu />
      </div>
      {tabs && <nav className="flex h-12 items-stretch overflow-x-auto px-1 sm:px-2">{tabs}</nav>}
    </header>
  );
}

export function UserMenu() {
  const { session, logout } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState<string | null>(null);
  if (!session) return null;
  const name = `${session.firstName} ${session.lastName}`;
  const avatar = storageUrl(session.avatarUrl);
  const close = () => setOpen(false);
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 rounded-sm py-1.5 pl-1.5 pr-2 text-white transition-colors hover:bg-white/[.075]"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Your account"
      >
        {avatar && avatarFailed !== avatar
          ? <img src={avatar} alt="" onError={() => setAvatarFailed(avatar)} className="h-9 w-9 rounded-full object-cover" />
          : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue text-[14px] font-medium text-white">{initials(name)}</span>}
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[14px] font-medium">{name}</span>
          <span className="block text-[12px] text-ink-3">{session.orgName}</span>
        </span>
        <ChevronDown className={cx("h-4 w-4 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      <Menu open={open} onClose={close}>
        <div className="mb-2 border-b border-divider px-4 pb-3 pt-1">
          <div className="text-[15px] font-medium">{name}</div>
          <div className="text-[13px] text-ink-3">@{session.username} · {session.orgSlug}</div>
        </div>
        {PORTAL.userMenu.length > 0 && (
          <>
            {PORTAL.userMenu.map(item => (
              <MenuItem key={item.path} icon={item.icon} onClick={() => { close(); navigate(item.path); }}>{item.label}</MenuItem>
            ))}
            <MenuSeparator />
          </>
        )}
        <MenuLink icon={ExternalLink} href={departmentPortalHref()} target={portalTarget("department-portal")} onClick={close}>
          Department Portal
        </MenuLink>
        <MenuLink icon={UserRound} href={departmentPortalHref("/profile")} target={portalTarget("department-portal")} onClick={close}>
          Your profile
        </MenuLink>
        <MenuSeparator />
        <MenuItem icon={LogOut} onClick={() => { close(); void logout(); }}>Sign out</MenuItem>
      </Menu>
    </div>
  );
}
