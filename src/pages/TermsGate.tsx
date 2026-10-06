import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, ExternalLink, FileText, RotateCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError, errorMessage } from "@/lib/api";
import { TERMS_KEY, acceptTerms, fetchTerms, type TermsStatus } from "@/lib/terms";
import { Button, Checkbox, Spinner } from "@/components/ui";

/**
 * The Inspection Portal is its own web address, so the first time a member opens
 * it they accept the Station Clipboard Terms of Service before anything else,
 * and again whenever a new version is published. The API records each
 * acceptance (terms_acceptances in the Department Portal).
 *
 * Only asked at load. The status is never refetched mid-session, so a form
 * being filled in is never replaced by this screen.
 */
export function TermsGate({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const terms = useQuery({
    queryKey: [...TERMS_KEY, session?.id],
    queryFn: () => fetchTerms(session?.id),
    staleTime: Infinity,
    // Asked fresh at every load, never from the copy kept on the device.
    meta: { persist: false },
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (terms.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }
  if (terms.isError) return <TermsScreen error={errorMessage(terms.error)} onRetry={() => terms.refetch()} />;
  if (!terms.data?.mustAccept) return <>{children}</>;
  return <TermsScreen status={terms.data} />;
}

const POINTS = [
  "The Inspection Portal helps you keep inspection, permit and code enforcement records. It doesn't replace the codes and ordinances your jurisdiction adopted, or your own judgment.",
  "Checklists, code references and fees are starting points. Check them against the codes and fee schedule your jurisdiction actually adopted.",
  "Records about people (complaints, investigations, evidence) can be sensitive or confidential. Share them only as your department and the law allow.",
  "Use only your own account, and only as your department allows. Your department owns its records.",
];

function TermsScreen({ status, error, onRetry }: { status?: TermsStatus; error?: string; onRetry?: () => void }) {
  const { session, logout } = useAuth();
  const qc = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function accept() {
    if (!status || !agreed) return;
    setBusy(true);
    setProblem(null);
    try {
      qc.setQueryData([...TERMS_KEY, session?.id], await acceptTerms(status.version, session?.id));
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "TERMS_VERSION_CHANGED") {
        // Published while this page was open: show the new date and ask again.
        setAgreed(false);
        await qc.invalidateQueries({ queryKey: TERMS_KEY });
      }
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const termsUrl = status?.url ?? "https://stationclipboard.com/terms-of-service";
  const privacyUrl = status?.privacyUrl ?? "https://stationclipboard.com/privacy-policy";

  return (
    <div className="flex min-h-full flex-col bg-navy">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[560px]">
          <div className="mb-6 flex items-center gap-4">
            <img src="/logo-mark.png" alt="" className="h-14 w-14 shrink-0 object-contain" />
            <div className="min-w-0">
              <h1 className="text-[24px] font-medium leading-tight text-white">Terms of Service</h1>
              <p className="mt-0.5 text-[15px] text-ink-3">Station Clipboard · Inspection Portal</p>
            </div>
          </div>

          {error ? (
            <>
              <p role="alert" className="flex items-start gap-2 text-[15px] text-lightcoral">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Couldn't check whether you've accepted the Terms of Service. {error}</span>
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={logout}>Sign out</Button>
                <Button variant="primary" onClick={onRetry}><RotateCw className="h-4 w-4" />Try again</Button>
              </div>
            </>
          ) : status && (
            <>
              <p className="text-[15px] text-ink-2">
                Before you open the Inspection Portal{session?.orgName ? <> for <b className="font-medium text-ink">{session.orgName}</b></> : null},
                read and accept the Station Clipboard Terms of Service. You're asked once, and again only if the Terms change.
              </p>
              <p className="mt-3 text-[14px] text-ink-3">
                Station Clipboard, including the Department Portal and the Inspection Portal, is owned and operated by
                Station Automation Solutions LLC. You sign in here with your Department Portal account, and the same Terms cover both.
              </p>

              <section className="mt-6 border border-faded bg-surface">
                <h2 className="border-b border-divider bg-alt px-4 py-2.5 text-[13px] font-medium uppercase tracking-[0.04em] text-ink-2">
                  In short
                </h2>
                <ul className="space-y-2.5 px-4 py-3.5 text-[14px] text-ink-2">
                  {POINTS.map(p => (
                    <li key={p} className="flex gap-2.5">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-divider px-4 py-3 text-[14px]">
                  <a href={termsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-sky hover:underline">
                    <FileText className="h-4 w-4" />Read the full Terms of Service<ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <a href={privacyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sky hover:underline">
                    Privacy Policy<ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </section>
              <p className="mt-2 text-[12px] text-ink-3">This is a summary. The full Terms are what you agree to.</p>

              <Checkbox checked={agreed} onChange={setAgreed} className="mt-6 items-start text-[15px] text-ink">
                I have read and agree to the Station Clipboard Terms of Service, last updated {status.lastUpdated},
                and I acknowledge the Privacy Policy.
              </Checkbox>

              {problem && (
                <p role="alert" className="mt-4 flex items-start gap-2 text-[14px] text-lightcoral">
                  <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
                  <span>{problem}</span>
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                <Button variant="ghost" onClick={logout}>Decline and sign out</Button>
                <Button variant="go" size="lg" loading={busy} disabled={!agreed} onClick={accept} className="min-w-[220px]">
                  Accept and continue<ArrowRight className="h-5 w-5" />
                </Button>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/10 px-4 py-3 text-[12px] text-ink-3">
        <span>Signed in as <span className="text-ink-2">{session?.firstName} {session?.lastName}</span></span>
        <span className="sm:ml-auto">Your acceptance is recorded with the date and time. © {new Date().getFullYear()} Station Automation Solutions LLC</span>
      </footer>
    </div>
  );
}
