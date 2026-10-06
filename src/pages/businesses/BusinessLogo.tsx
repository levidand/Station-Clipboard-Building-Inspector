import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { api, errorMessage, storageUrl } from "@/lib/api";
import { initials } from "@/lib/format";
import { BASE, useRefreshAll } from "@/lib/inspections";
import type { PropertyDetail } from "@/lib/types";
import { Button, Field, Input, Modal, Spinner, cx } from "@/components/ui";
import { toast } from "@/components/toast";

// A business's logo. Nobody uploads one: the Department Portal finds it on
// the business's website (or the domain of its work email) and keeps a copy.

const SIZE = {
  sm: "h-11 w-11 text-[15px]",
  lg: "h-16 w-16 text-[22px]",
};

/**
 * The logo on a white tile (most are drawn for a light page), or the
 * business's initials when it has none or the picture won't load.
 */
export function BusinessLogo({ name, logoUrl, size = "sm", looking = false }: {
  name: string; logoUrl?: string | null; size?: keyof typeof SIZE; looking?: boolean;
}) {
  const src = storageUrl(logoUrl);
  const [failed, setFailed] = useState<string | null>(null);
  const shown = src && failed !== src;
  return (
    <span className={cx("relative flex shrink-0 items-center justify-center overflow-hidden rounded-sm", SIZE[size],
      shown ? "bg-white p-1" : "border border-faded bg-surface font-medium text-ink-3")}>
      {shown
        ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className="h-full w-full object-contain" />
        : <span aria-hidden>{initials(name)}</span>}
      {looking && (
        <span className="absolute inset-0 flex items-center justify-center bg-surface/80" role="status" aria-label="Looking for the logo">
          <Spinner />
        </span>
      )}
    </span>
  );
}

/** "acme.com/about" from "https://www.acme.com/about": a website as people say it. */
export function siteLabel(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

interface LogoResult { found: boolean; domain: string; logoUrl: string | null }

/**
 * Looks for a business's logo on its website, in the background: the toast
 * says how it went, and the pages refresh. `mutate(preplanId)`; a page can
 * show it's looking with useIsMutating({ mutationKey: LOGO_LOOKUP }).
 */
export const LOGO_LOOKUP = ["inspections", "logo-lookup"] as const;

export function useFindLogo() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationKey: LOGO_LOOKUP,
    // Reading another site takes a few seconds, longer than a save.
    mutationFn: (preplanId: number) => api<LogoResult>("POST", `${BASE}/properties/${preplanId}/logo`, undefined, { timeoutMs: 45_000 }),
    onSuccess: r => toast.success(
      r.found ? `Found the logo on ${r.domain}.`
        : r.logoUrl ? `No new logo on ${r.domain}. It keeps the one it had.`
        : `No logo found on ${r.domain}. The business shows its initials instead.`,
    ),
    onError: err => toast.error(errorMessage(err)),
    onSettled: () => void refresh(),
  });
}

/** "Website and email" on a business. */
export function WebsiteDialog({ open, onClose, d, onSaved }: {
  open: boolean; onClose: () => void; d: PropertyDetail; onSaved: (lookForLogo: boolean) => void;
}) {
  if (!open) return null;
  return <WebsiteForm onClose={onClose} d={d} onSaved={onSaved} />;
}

function WebsiteForm({ onClose, d, onSaved }: { onClose: () => void; d: PropertyDetail; onSaved: (lookForLogo: boolean) => void }) {
  const [website, setWebsite] = useState(d.website ? siteLabel(d.website) : "");
  const [email, setEmail] = useState(d.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok: true; lookForLogo?: boolean }>("PATCH", `${BASE}/properties/${d.preplanId}`, {
        website: website.trim() || null, email: email.trim() || null,
      });
      toast.success("Saved");
      onSaved(!!res.lookForLogo);
      onClose();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Website and email"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" loading={busy} onClick={save}><Save className="h-5 w-5" />Save</Button>
      </>}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <BusinessLogo name={d.name} logoUrl={d.logoUrl} size="lg" />
          <p className="text-[16px] leading-6 text-ink-2">
            {d.logoUrl && d.logoDomain ? `The logo came from ${d.logoDomain}.` : "No logo yet."} The logo is found on the
            business's website, so nobody has to upload one.
          </p>
        </div>
        <Field label="Website" hint="Like acmeplumbing.com">
          <Input value={website} onChange={e => setWebsite(e.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
        </Field>
        <Field label="Business email" hint="With no website, an email at the business's own domain finds the logo too. Gmail, Outlook and the like can't.">
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoCapitalize="none" spellCheck={false} />
        </Field>
        {error && <p role="alert" className="text-[16px] text-lightcoral">{error}</p>}
      </div>
    </Modal>
  );
}
