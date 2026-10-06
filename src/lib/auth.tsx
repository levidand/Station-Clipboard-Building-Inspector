import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage, isTransient } from "./api";

/** The subset of GET /api/auth/me this app reads (the same session the Command Portal reads). */
export interface Session {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  orgId: number | null;
  orgSlug: string | null;
  orgName: string | null;
  timezone: string | null;
  use24HourTime?: boolean;
  logoUrl: string | null;
  isSuperAdmin: boolean;
  isSiteAdmin: boolean;
  permissions: string[];
}

export type LoginResult =
  | { kind: "ok"; session: Session }
  | { kind: "2fa"; method: string; maskedEmail?: string };

interface AuthValue {
  session: Session | null;
  loading: boolean;
  login: (orgSlug: string, username: string, password: string) => Promise<LoginResult>;
  verify2fa: (code: string) => Promise<Session>;
  resend2fa: () => Promise<void>;
  logout: () => Promise<void>;
  /** Why a sign-on handed over by the Department Portal didn't work, for the sign-in form. */
  handoffError: string | null;
}

const AuthContext = createContext<AuthValue | null>(null);
export const ME_KEY = ["/api/auth/me"];

/**
 * A sign-on handed over by the Department Portal, which opens this app at
 * /path#sso=<token> (GET /api/auth/inspection-portal there). Read once as the
 * app loads and taken out of the address bar straight away, so it isn't
 * bookmarked or left in history. Single-use, and lives a minute.
 */
let handoffToken = takeHandoffToken();
let handoffError: string | null = null;

function takeHandoffToken(): string | null {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#sso=")) return null;
  const token = new URLSearchParams(window.location.hash.slice(1)).get("sso");
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  return token || null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const lastUser = useRef<number | null>(null);

  /** A different member on this device: nothing of the last one's stays loaded. */
  const adopt = useCallback(<S extends Session | null>(next: S): S => {
    const prev = lastUser.current ?? qc.getQueryData<Session | null>(ME_KEY)?.id ?? null;
    if (next && prev != null && prev !== next.id) qc.removeQueries({ predicate: q => q.queryKey[0] !== ME_KEY[0] });
    if (next) lastUser.current = next.id;
    return next;
  }, [qc]);

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      if (handoffToken) {
        const token = handoffToken;
        handoffToken = null;
        try {
          return adopt(await api<Session>("POST", "/api/auth/inspection-portal/redeem", { token }));
        } catch (err) {
          handoffError = errorMessage(err);
        }
      }
      try {
        return adopt(await api<Session>("GET", "/api/auth/me"));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    // Re-checked now and then, so a session ended in the Department Portal ends here too.
    refetchInterval: 5 * 60_000,
    retry: (n, err) => isTransient(err) && n < 2,
  });
  const session = me.data ?? null;

  const login = useCallback(async (orgSlug: string, username: string, password: string): Promise<LoginResult> => {
    const res = await api<Session & { twoFactorRequired?: boolean; method?: string; maskedEmail?: string }>(
      "POST", "/api/auth/login", { orgSlug, username, password },
    );
    if (res.twoFactorRequired) return { kind: "2fa", method: res.method ?? "app", maskedEmail: res.maskedEmail };
    qc.setQueryData(ME_KEY, adopt(res));
    return { kind: "ok", session: res };
  }, [qc, adopt]);

  const verify2fa = useCallback(async (code: string) => {
    const res = await api<Session>("POST", "/api/auth/login/2fa/verify", { code });
    qc.setQueryData(ME_KEY, adopt(res));
    return res;
  }, [qc, adopt]);

  const resend2fa = useCallback(async () => {
    await api("POST", "/api/auth/login/2fa/resend", {});
  }, []);

  const logout = useCallback(async () => {
    try { await api("POST", "/api/auth/logout", {}); } catch { /* signing out locally regardless */ }
    handoffError = null;
    qc.clear();
    qc.setQueryData(ME_KEY, null);
  }, [qc]);

  return (
    <AuthContext.Provider value={{ session, loading: me.isLoading, login, verify2fa, resend2fa, logout, handoffError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Permissions — the Department Portal's INSPECTIONS_PERMISSION_GROUPS
// (api-server/src/lib/modules.ts). The API checks each one; this app hides
// what a member's role doesn't include, so nobody presses a button only to be
// refused.
// ---------------------------------------------------------------------------

export const MODULE_SLUG = "inspections";

export type InspectionsPermission =
  | "view" | "conduct_inspections" | "manage_cases" | "manage_permits" | "manage_events" | "investigations" | "manage_settings";

export const PERMISSION_LABELS: Record<InspectionsPermission, string> = {
  view: "Open the Inspection Portal",
  conduct_inspections: "Inspect and write violations",
  manage_cases: "Code enforcement",
  manage_permits: "Permits and plan review",
  manage_events: "Plan events",
  investigations: "Fire investigations",
  manage_settings: "Manage settings",
};

export function can(session: Session | null, action: InspectionsPermission): boolean {
  if (!session) return false;
  if (session.isSuperAdmin || session.isSiteAdmin) return true;
  return session.permissions.includes(`${MODULE_SLUG}:${action}`);
}

export type Permissions = ReturnType<typeof permissionsFor>;

/** What the member may do, in the app's terms. Manage settings covers all but investigations, as the API does. */
export function permissionsFor(session: Session | null) {
  const has = (p: InspectionsPermission) => can(session, p);
  const settings = has("manage_settings");
  return {
    view: has("view"),
    inspect: settings || has("conduct_inspections"),
    cases: settings || has("manage_cases"),
    permits: settings || has("manage_permits"),
    events: settings || has("manage_events"),
    investigations: has("investigations"),
    settings,
  };
}

export function usePermissions(): Permissions {
  const { session } = useAuth();
  return permissionsFor(session);
}
