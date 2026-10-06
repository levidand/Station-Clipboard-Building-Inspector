import { useState, type FormEvent } from "react";
import { AlertTriangle, ArrowLeft, KeyRound, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/api";
import { useNow } from "@/lib/format";
import { Button, Field, Input } from "@/components/ui";

const ORG_KEY = "ip.orgSlug";

function readOrg(): string {
  try { return localStorage.getItem(ORG_KEY) ?? ""; } catch { return ""; }
}

/**
 * Sign-in: a navy form panel with the logo on
 * top, translucent fields, and the green sign-in button that stays greyed out
 * until there's something to send.
 */
export function LoginPage() {
  const { login, verify2fa, resend2fa, handoffError } = useAuth();
  const [orgSlug, setOrgSlug] = useState(readOrg);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{ method: string; maskedEmail?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(handoffError);

  const ready = challenge ? !!code.trim() : !!(orgSlug.trim() && username.trim() && password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      if (challenge) {
        await verify2fa(code.trim());
      } else {
        const res = await login(orgSlug.trim().toLowerCase(), username.trim(), password);
        try { localStorage.setItem(ORG_KEY, orgSlug.trim().toLowerCase()); } catch { /* private mode */ }
        if (res.kind === "2fa") setChallenge({ method: res.method, maskedEmail: res.maskedEmail });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-navy">
      <header className="flex h-14 shrink-0 items-center justify-end px-4">
        <StationClock />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-10">
        <form onSubmit={submit} className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <img src="/logo-mark.png" alt="" className="h-[72px] w-[72px] object-contain" />
            <h1 className="mt-4 text-[28px] font-medium leading-tight text-white">Inspection Portal</h1>
            <p className="mt-1 text-[16px] text-ink-3">StationClipboard Fire Prevention</p>
          </div>

          <p className="mb-5 text-[17px] text-ink-2">
            {challenge
              ? challenge.method === "email"
                ? `Enter the code we emailed to ${challenge.maskedEmail ?? "you"}.`
                : "Enter the code from your authenticator app."
              : "Sign in with your Department Portal account."}
          </p>

          <div className="space-y-4">
            {challenge ? (
              <Field label="Verification code">
                <Input
                  autoFocus inputMode="numeric" autoComplete="one-time-code" value={code}
                  onChange={e => setCode(e.target.value)} placeholder="123456"
                  className="h-16 text-center text-[28px] tracking-[0.4em]"
                />
              </Field>
            ) : (
              <>
                <Field label="Organization ID" hint="The part of your portal address after the slash.">
                  <Input
                    autoFocus={!orgSlug} value={orgSlug} onChange={e => setOrgSlug(e.target.value)} className="h-14 text-[18px]"
                    autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="your-department" required
                  />
                </Field>
                <Field label="Username">
                  <Input
                    autoFocus={!!orgSlug} value={username} onChange={e => setUsername(e.target.value)} className="h-14 text-[18px]"
                    autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required
                  />
                </Field>
                <Field label="Password">
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="h-14 text-[18px]" autoComplete="current-password" required />
                </Field>
              </>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-4 flex items-start gap-2 text-[14px] text-lightcoral">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <Button type="submit" variant="go" size="lg" loading={busy} disabled={!ready} className="mt-6 h-[56px] w-full text-[19px]">
            {challenge ? <><KeyRound className="h-5 w-5" />Verify</> : <><LogIn className="h-5 w-5" />Sign in</>}
          </Button>

          {challenge && (
            <div className="mt-4 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => { setChallenge(null); setCode(""); }}>
                <ArrowLeft className="h-4 w-4" />Back
              </Button>
              {challenge.method === "email" && (
                <Button variant="ghost" size="sm" className="text-sky"
                  onClick={() => resend2fa().catch(err => setError(errorMessage(err)))}>
                  Resend code
                </Button>
              )}
            </div>
          )}
        </form>
      </main>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/10 px-4 py-3 text-[14px] text-ink-3">
        <span>Station: <span className="text-ink-2">{window.location.host}</span></span>
        <span className="sm:ml-auto">Sign-in activity is recorded in your department's activity log.</span>
        <span>
          <a href="https://stationclipboard.com/terms-of-service" target="_blank" rel="noreferrer" className="text-sky hover:underline">Terms</a>
          {" · "}
          <a href="https://stationclipboard.com/privacy-policy" target="_blank" rel="noreferrer" className="text-sky hover:underline">Privacy</a>
        </span>
      </footer>
    </div>
  );
}

/** Local wall clock — before sign-in there's no department timezone yet. */
function StationClock() {
  const now = new Date(useNow(1000));
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const date = now.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  return (
    <div className="flex items-baseline gap-3 text-white">
      <span className="hidden text-[13px] text-ink-3 sm:block">{date}</span>
      <span className="text-[20px] font-medium tabular-nums">{time}</span>
    </div>
  );
}
