import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, organizationLogoUrl } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useOptionalAuth } from '../../providers/AuthProvider';

/*
 * UI PASS (#UI-org-settings, 2026-08-07): visual-only alignment of the
 * /organization admin page with the shared design system. The page was
 * light-theme-only (no dark tokens anywhere) with raw blue-* accents and
 * an in-card h2; it now has the page-level cluster header (h1 + muted
 * description), a padded ui/Card shell, shared field chrome (h-10,
 * rounded-lg, primary focus rings) with full dark palettes, ui/Button for
 * Retry/Upload/Save, and AA banner hues. No behavioral change: both
 * mutations, the logo upload/preview flow (ledger #8 public-route img +
 * failedLogoSrc retry memory), all guards, and every string pinned by
 * OrganizationSettings.test.tsx ("Save Changes"/"Saving...", "Upload New
 * Logo"/"Uploading...", "Choose organization logo image", "We couldn't
 * load your organization", "Retry", both success/error banners, alt
 * "Organization logo") are verbatim.
 */

// Shared field chrome (mirrors the UserManagement/CRM filter inputs).
const fieldClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-gray-500';

export const OrganizationSettings = () => {
  const queryClient = useQueryClient();
  const auth = useOptionalAuth();

  /*
   * BUG FIX (silent save failures): the save mutation had NO onError and
   * success used a blocking `alert()`. Any rejection — slug regex
   * (^[a-z0-9-]+$), duplicate slug (409), insufficient role (403) — was
   * completely invisible: admins saw the form just sit there, with no way
   * to know why the save didn't happen. Feedback now renders inline, with
   * the server's message extracted from the shared error envelope
   * `{ success: false, error: { message } }` (string-only, same pattern
   * as the Bug #20 fix), and success shows a transient inline banner
   * instead of a modal alert.
   */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  /*
   * BUG FIX (identity lie — failed GET rendered an EMPTY org form — Bug #42):
   * this query surfaced only `isLoading`, so a rejected GET /organizations
   * (500, network down, expired 401) rendered the Organization Profile form
   * with BLANK name/slug fields — claiming the org's identity was empty, and
   * (because the fields are `required` and Save stays enabled) inviting an
   * admin to overwrite name/slug without ever seeing the current values.
   * `isError`/`error`/`refetch` are now exposed and the whole form is
   * replaced by an honest failure panel (server message + Retry).
   * Same truth pattern as Bug #31–#41.
   */
  const {
    data,
    isLoading,
    isError,
    error: orgError,
    refetch,
  } = useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      const res = await api.get('/organizations');
      return res.data.data;
    },
  });

  const orgErrorMessage = (() => {
    const m = (orgError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  const mutation = useMutation({
    mutationFn: async (updatedData: { name: string; slug: string }) => {
      const res = await api.patch('/organizations', updatedData);
      return res.data;
    },
    onSuccess: (response) => {
      const updated = response?.data?.data;
      if (updated && typeof updated === 'object') {
        queryClient.setQueryData(['organization'], updated);
        auth?.updateOrganization(updated);
      }
      void queryClient.invalidateQueries({ queryKey: ['organization'] });
      setSaveError(null);
      setSaveSuccess(true);
    },
    onError: (error: any) => {
      setSaveSuccess(false);
      const apiMessage = error?.response?.data?.error?.message;
      setSaveError(
        typeof apiMessage === 'string' && apiMessage.length > 0
          ? apiMessage
          : 'Failed to save organization settings. Please try again.'
      );
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mutation.isPending) return;
    // Clear prior feedback so a fresh attempt reports fresh state.
    setSaveError(null);
    setSaveSuccess(false);
    const formData = new FormData(e.currentTarget);
    mutation.mutate({
      name: formData.get('name') as string,
      slug: formData.get('slug') as string,
    });
  };

  /*
   * BUG FIX ("Upload New Logo" button was dead): the button rendered with
   * no onClick and no file input existed at all, so there was no way to set
   * an organization logo even though the org model has a `logo` field and
   * admins see the placeholder box on this page. The button now opens a
   * file picker (PNG/JPEG/WebP), posts the selection to the new
   * POST /organizations/logo endpoint, refreshes the org query so the
   * preview updates, and reports failures inline using the shared
   * `{ error: { message } }` envelope.
   */
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoSuccess, setLogoSuccess] = useState(false);

  // Ledger #8: the renderable URL is the public route derived from the org
  // id, never the stored reference itself (see the img below). `failedLogoSrc`
  // records the last URL that failed to load so we can show the placeholder
  // without burning retries, while a fresh upload (new seed → new URL) gets
  // a brand-new attempt.
  const [failedLogoSrc, setFailedLogoSrc] = useState<string | null>(null);
  const logoSrc =
    data?.id && data?.logo ? organizationLogoUrl(data.id, data.logo) : null;

  useEffect(() => {
    setFailedLogoSrc(null);
  }, [logoSrc]);

  const logoUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('logo', file);
      const res = await api.post('/organizations/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: (response) => {
      const logoUrl = response?.data?.logoUrl;
      if (typeof logoUrl === 'string' && logoUrl.length > 0) {
        queryClient.setQueryData(['organization'], (current: any) =>
          current ? { ...current, logo: logoUrl } : current
        );
        auth?.updateOrganization({ logo: logoUrl });
      }
      void queryClient.invalidateQueries({ queryKey: ['organization'] });
      setLogoError(null);
      setLogoSuccess(true);
    },
    onError: (error: any) => {
      setLogoSuccess(false);
      const apiMessage = error?.response?.data?.error?.message;
      setLogoError(
        typeof apiMessage === 'string' && apiMessage.length > 0
          ? apiMessage
          : 'Failed to upload the logo. Please try again.'
      );
    },
  });

  const handleLogoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = '';
    if (!file || logoUploadMutation.isPending) return;
    setLogoError(null);
    setLogoSuccess(false);
    logoUploadMutation.mutate(file);
  };

  // UI PASS: "Loading..." copy kept verbatim; gains status semantics and a
  // neutral centered treatment (was a bare unstyled div).
  if (isLoading) {
    return (
      <div role="status" className="flex items-center gap-3 px-1 py-10 text-sm text-gray-500 dark:text-gray-400">
        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Loading...
      </div>
    );
  }

  // Bug #42: honest failure panel replaces the fabricated blank-identity form.
  // UI PASS: copy verbatim (`getByRole('alert')` + exact 'Retry' pinned);
  // panel gains the rounded-lg card treatment and dark tokens.
  if (isError) {
    return (
      <Card className="max-w-2xl border-red-200 p-5 sm:p-6 dark:border-red-900/50" role="alert">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">We couldn't load your organization</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {orgErrorMessage ?? 'Something went wrong while fetching your organization settings. Your data is safe — please try again.'}
        </p>
        <Button onClick={() => refetch()} className="mt-4">
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Organization Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your organization's profile and branding.
        </p>
      </div>

      <Card className="max-w-2xl p-5 sm:p-6">
        <h2 className="mb-6 text-lg font-semibold text-gray-900 dark:text-white">Organization Profile</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="org-name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Organization Name</label>
            <input
              id="org-name"
              type="text"
              name="name"
              defaultValue={data?.name}
              className={fieldClass}
              required
            />
          </div>

          <div>
            <label htmlFor="org-slug" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Organization Slug</label>
            <input
              id="org-slug"
              type="text"
              name="slug"
              defaultValue={data?.slug}
              className={fieldClass}
              required
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Must be unique and URL-friendly.</p>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Logo</span>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100 text-sm text-gray-400 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-500">
                {/*
                  FEATURE (ledger #8 — public logo rendering): the stored value
                  was rendered directly (`src={data.logo}`) and could NEVER
                  display — local values are unsigned paths behind the HMAC
                  download gate (403, and force-download even when signed), S3
                  values are synthetic virtual-hosted URLs that 403 on private
                  buckets. Renders now go through the public logo route keyed by
                  org id; if that fails (expired link is impossible — the route
                  is public — but bytes can be missing), we fall back to the
                  placeholder instead of a broken-image glyph, and remember the
                  failed URL so a replaced logo (new seed → new URL) retries.
                */}
                {logoSrc && logoSrc !== failedLogoSrc ? (
                  <img
                    src={logoSrc}
                    alt="Organization logo"
                    className="h-full w-full object-cover"
                    onError={() => setFailedLogoSrc(logoSrc)}
                  />
                ) : (
                  'Logo'
                )}
              </div>
              <div className="space-y-2">
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  aria-label="Choose organization logo image"
                  onChange={handleLogoSelected}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => logoFileInputRef.current?.click()}
                  disabled={logoUploadMutation.isPending}
                >
                  {logoUploadMutation.isPending ? 'Uploading...' : 'Upload New Logo'}
                </Button>
                {logoError && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400">{logoError}</p>
                )}
                {logoSuccess && (
                  <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">Logo updated successfully.</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-slate-700">
            {/* Inline save feedback (was: silent failure + blocking alert) */}
            {saveError && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                {saveError}
              </p>
            )}
            {saveSuccess && (
              <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
                Organization updated successfully.
              </p>
            )}
            <Button
              type="submit"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
