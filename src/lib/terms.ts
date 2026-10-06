import { api, ApiError, isTransient } from "./api";

/** GET /api/terms — the published Station Clipboard Terms and whether this member has accepted them. */
export interface TermsStatus {
  /** The Terms' "Last Updated" date, YYYY-MM-DD. */
  version: string;
  lastUpdated: string;
  url: string;
  privacyUrl: string;
  acceptedAt: string | null;
  /** False while someone is viewing the portal as this member: they can't accept for them. */
  mustAccept: boolean;
  impersonating: boolean;
}

export const TERMS_KEY = ["/api/terms"];

/** Members who have accepted the Terms on this device, so a reload with no signal doesn't stop at a screen it can't get past. */
const ACCEPTED_KEY = "ip.terms.accepted";

function acceptedHere(userId: number): boolean {
  try { return (JSON.parse(localStorage.getItem(ACCEPTED_KEY) ?? "[]") as number[]).includes(userId); } catch { return false; }
}

function rememberAccepted(userId: number) {
  try {
    const ids = JSON.parse(localStorage.getItem(ACCEPTED_KEY) ?? "[]") as number[];
    if (!ids.includes(userId)) localStorage.setItem(ACCEPTED_KEY, JSON.stringify([...ids, userId]));
  } catch { /* storage off: asked online as usual */ }
}

/**
 * Null when the API can't ask: an older Department Portal without /terms, or
 * one whose migration 0134 hasn't been run. The member is let in rather than
 * locked out of their work over a missing table.
 *
 * Null too when there's no connection at all and this member has accepted on
 * this device before: the Terms are checked again the next time the app opens
 * with a signal.
 */
export async function fetchTerms(userId?: number): Promise<TermsStatus | null> {
  try {
    // Someone who has accepted here goes in after a short wait on a dead signal, not the full timeout.
    const quick = userId != null && acceptedHere(userId);
    const status = await api<TermsStatus>("GET", "/api/terms", undefined, quick ? { timeoutMs: 5_000 } : {});
    if (typeof status?.mustAccept !== "boolean") return null;
    if (status.acceptedAt && !status.mustAccept && userId != null) rememberAccepted(userId);
    return status;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.body.code === "TERMS_UNAVAILABLE")) return null;
    if (isTransient(err) && userId != null && acceptedHere(userId)) return null;
    throw err;
  }
}

export async function acceptTerms(version: string, userId?: number): Promise<TermsStatus> {
  const status = await api<TermsStatus>("POST", "/api/terms/accept", { version, product: "inspection-portal" });
  if (userId != null) rememberAccepted(userId);
  return status;
}
