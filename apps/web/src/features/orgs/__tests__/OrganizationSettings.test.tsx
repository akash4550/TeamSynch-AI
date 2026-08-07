import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { OrganizationSettings } from '../OrganizationSettings';
import { api } from '../../../lib/api';

/*
 * Regression tests for OrganizationSettings save feedback.
 *
 * The save mutation previously had no onError at all — any server
 * rejection (slug regex, duplicate slug 409, 403) was invisible, and
 * success used a blocking window.alert. These tests pin the inline
 * feedback behavior: server message rendered as text on failure,
 * inline banner on success, and a submit that can't be double-fired.
 */
/*
 * Ledger #8 mock-surface extension: the component now imports
 * `organizationLogoUrl` from lib/api (public logo route helper), so the
 * wholesale module mock must provide it — same base URL shape as the real
 * helper (`/api/v1` default in test env).
 */
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
  apiBaseUrl: '/api/v1',
  organizationLogoUrl: (id: string, seed?: string | null) =>
    `/api/v1/organizations/${id}/logo${seed ? `?v=${encodeURIComponent(seed)}` : ''}`,
}));

const mockedGet = vi.mocked(api.get);
const mockedPatch = vi.mocked(api.patch);
const mockedPost = vi.mocked(api.post);

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationSettings />
    </QueryClientProvider>,
  );
};

const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

beforeEach(() => {
  mockedGet.mockResolvedValue({
    data: { data: { name: 'Acme Inc', slug: 'acme-inc' } },
  });
});

describe('OrganizationSettings save feedback', () => {
  test('renders the server error message as text when the save is rejected', async () => {
    mockedPatch.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: {
            message:
              'Validation failed: Slug can only contain lowercase letters, numbers, and hyphens',
          },
        },
      },
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByDisplayValue('acme-inc');
    await user.clear(screen.getByDisplayValue('acme-inc'));
    await user.type(screen.getByLabelText(/organization slug/i), 'Acme Corp');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(
      await screen.findByText(
        'Validation failed: Slug can only contain lowercase letters, numbers, and hyphens',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Organization updated successfully.'),
    ).not.toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test('shows an inline success banner (no blocking alert) when the save succeeds', async () => {
    mockedPatch.mockResolvedValue({ data: { success: true, data: {} } });

    const user = userEvent.setup();
    renderPage();

    await screen.findByDisplayValue('acme-inc');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(
      await screen.findByText('Organization updated successfully.'),
    ).toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test('disables the submit button while the save is in flight (no double-fire)', async () => {
    let resolvePatch: ((value: unknown) => void) | undefined;
    mockedPatch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePatch = resolve;
        }),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findByDisplayValue('acme-inc');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const savingButton = screen.getByRole('button', { name: /saving/i });
    expect(savingButton).toBeDisabled();
    expect(mockedPatch).toHaveBeenCalledTimes(1);

    // Settle the pending mutation so the test exits cleanly.
    resolvePatch?.({ data: { success: true, data: {} } });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /save changes/i }),
      ).toBeEnabled();
    });
  });
});

describe('OrganizationSettings logo upload', () => {
  const pickLogo = async (user: ReturnType<typeof userEvent.setup>, file: File) => {
    await screen.findByDisplayValue('acme-inc');
    await user.click(screen.getByRole('button', { name: /upload new logo/i }));
    fireEvent.change(screen.getByLabelText(/choose organization logo image/i), {
      target: { files: [file] },
    });
  };

  test('posts the selected image to /organizations/logo and confirms inline', async () => {
    mockedPost.mockResolvedValue({
      data: { success: true, data: { logoUrl: '/uploads/org_1/logo/logo.png' } },
    });

    const user = userEvent.setup();
    renderPage();

    const file = new File(['png-bytes'], 'logo.png', { type: 'image/png' });
    await pickLogo(user, file);

    expect(mockedPost).toHaveBeenCalledWith(
      '/organizations/logo',
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
    const sentForm = mockedPost.mock.calls[0][1] as FormData;
    expect(sentForm.get('logo')).toBeInstanceOf(File);

    expect(
      await screen.findByText('Logo updated successfully.'),
    ).toBeInTheDocument();
  });

  test('renders the server error message as text when the upload is rejected', async () => {
    mockedPost.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { message: 'Logo must be a PNG, JPEG, or WebP image' },
        },
      },
    });

    const user = userEvent.setup();
    renderPage();

    const file = new File(['svg-bytes'], 'logo.svg', { type: 'image/svg+xml' });
    await pickLogo(user, file);

    expect(
      await screen.findByText('Logo must be a PNG, JPEG, or WebP image'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Logo updated successfully.'),
    ).not.toBeInTheDocument();
  });

  /*
   * REPINNED (ledger #8 — 2026-08-05): this test previously asserted
   * `src === the raw stored value` ('https://cdn.example.com/logo.png') —
   * it was locking in a LIE: that URL was never renderable (unsigned local
   * paths die at the HMAC download gate with 403/force-download headers;
   * synthetic S3 virtual-hosted URLs 403 on any non-public bucket). The
   * img now points at the public logo route keyed by org id, so the pin
   * moves to the URL that can actually display bytes. The fixture also
   * gains the org `id` the route needs (previously absent — the dead img
   * never consumed it).
   */
  test('renders the logo via the public route when the organization already has one', async () => {
    mockedGet.mockResolvedValue({
      data: {
        data: {
          id: 'org_1',
          name: 'Acme Inc',
          slug: 'acme-inc',
          logo: 'https://cdn.example.com/logo.png',
        },
      },
    });

    renderPage();

    const logo = await screen.findByAltText('Organization logo');
    expect(logo).toHaveAttribute(
      'src',
      '/api/v1/organizations/org_1/logo?v=https%3A%2F%2Fcdn.example.com%2Flogo.png',
    );
  });

  test('falls back to the placeholder (not a broken-image glyph) when the public logo fails to load', async () => {
    mockedGet.mockResolvedValue({
      data: {
        data: {
          id: 'org_1',
          name: 'Acme Inc',
          slug: 'acme-inc',
          logo: '/api/v1/uploads/org_1/logo/gone.png',
        },
      },
    });

    renderPage();

    const logo = await screen.findByAltText('Organization logo');
    fireEvent.error(logo);

    await waitFor(() => {
      expect(screen.queryByAltText('Organization logo')).not.toBeInTheDocument();
    });
  });
});

/*
 * Regression tests for the organization read-failure fix (Bug #42): a
 * rejected GET /organizations used to render the profile form with BLANK
 * name/slug (identity lie) and a live Save button — inviting an admin to
 * overwrite the org's identity without ever seeing the current values.
 * The form is now replaced by an honest failure panel with Retry.
 */
describe('OrganizationSettings read-failure surface', () => {
  test('a failed organization GET shows the Retry panel instead of the blank identity form, and recovers', async () => {
    mockedGet.mockRejectedValue({
      response: { data: { success: false, error: { message: 'Database error' } } },
    });

    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("We couldn't load your organization"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Database error')).toBeInTheDocument();

    // The fabricated blank-identity form (and its live Save) must NOT render.
    expect(
      screen.queryByRole('textbox', { name: /Organization Name/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();

    // Server recovers — Retry repaints the form prefilled with real values.
    mockedGet.mockResolvedValue({
      data: { data: { name: 'Acme Inc', slug: 'acme-inc' } },
    });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(
        screen.queryByText("We couldn't load your organization"),
      ).not.toBeInTheDocument();
    });
    expect(await screen.findByDisplayValue('Acme Inc')).toBeInTheDocument();
  });
});
