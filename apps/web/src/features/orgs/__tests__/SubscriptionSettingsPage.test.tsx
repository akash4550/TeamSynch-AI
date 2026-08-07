import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { SubscriptionSettingsPage } from '../SubscriptionSettingsPage';

/*
 * Regression tests for the silent billing-failure fix (Bug #29).
 *
 * Checkout/portal mutations previously had no onError, and the shared hook
 * only redirects when a URL is present — so Stripe failures or empty-URL
 * responses produced a completely dead click on a money surface. These
 * tests mock the shared apiClient and pin the dismissible banner.
 */
vi.mock('../../../core/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { apiClient } from '../../../core/api/client';

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SubscriptionSettingsPage />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mockedGet.mockResolvedValue({
    data: {
      data: {
        plan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        quotas: { maxUsers: 5, maxProjects: 3, maxStorageMb: 100, maxAiRequestsPerMonth: 50 },
        // REPINNED (ledger #11 — 2026-08-05): price ids are server-driven
        // now. The fixture previously had NO `plans` array, which used to be
        // fine when buttons POSTed hardcoded fictional ids — after the fix
        // those ids come from this array and a missing entry honestly
        // disables the button. These test ids stand in for real Stripe
        // price ids (the click flows below exercise them end-to-end).
        plans: [
          { tier: 'STARTER', priceId: 'price_test_starter' },
          { tier: 'PRO', priceId: 'price_test_pro' },
          { tier: 'BUSINESS', priceId: 'price_test_business' },
        ],
        usage: {
          users: { current: 2, max: 5, percentage: 40 },
          projects: { current: 1, max: 3, percentage: 33 },
          aiRequests: { current: 10, max: 50, percentage: 20 },
          storageMb: { current: 10, max: 100, percentage: 10 },
        },
      },
    },
  });
});

describe('SubscriptionSettingsPage billing failure feedback', () => {
  test('shows the server message inline when checkout creation fails', async () => {
    mockedPost.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { message: 'Stripe price is not configured' },
        },
      },
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('FREE Plan');
    await user.click(screen.getByRole('button', { name: /upgrade to pro/i }));

    expect(
      await screen.findByText('Stripe price is not configured'),
    ).toBeInTheDocument();
    // The banner is dismissible.
    await user.click(screen.getByRole('button', { name: /dismiss billing error/i }));
    expect(
      screen.queryByText('Stripe price is not configured'),
    ).not.toBeInTheDocument();
  });

  test('shows the server message when the billing portal fails to open', async () => {
    mockedPost.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { message: 'Billing portal unavailable' },
        },
      },
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('FREE Plan');
    await user.click(screen.getByRole('button', { name: /manage stripe billing/i }));

    expect(
      await screen.findByText('Billing portal unavailable'),
    ).toBeInTheDocument();
  });

  test('flags a missing checkout URL instead of silently doing nothing', async () => {
    mockedPost.mockResolvedValue({ data: { data: { checkoutUrl: '' } } });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('FREE Plan');
    await user.click(screen.getByRole('button', { name: /upgrade to starter/i }));

    expect(
      await screen.findByText('Checkout is temporarily unavailable. Please try again.'),
    ).toBeInTheDocument();
  });

  /*
   * FEATURE (ledger #11): a tier WITHOUT a configured price can never post
   * a checkout — the button disables and explains why. This replaces the
   * fictional hardcoded ids ('price_pro_monthly') that real Stripe
   * accounts reject; only tiers with a server-driven priceId are clickable.
   */
  test('disables tier buttons honestly when their price is not configured', async () => {
    mockedGet.mockResolvedValue({
      data: {
        data: {
          plan: 'FREE',
          subscriptionStatus: 'ACTIVE',
          quotas: { maxUsers: 5, maxProjects: 3, maxStorageMb: 100, maxAiRequestsPerMonth: 50 },
          plans: [
            { tier: 'STARTER', priceId: null },
            { tier: 'PRO', priceId: 'price_test_pro' },
            { tier: 'BUSINESS', priceId: null },
          ],
          usage: {
            users: { current: 2, max: 5, percentage: 40 },
            projects: { current: 1, max: 3, percentage: 33 },
            aiRequests: { current: 10, max: 50, percentage: 20 },
            storageMb: { current: 10, max: 100, percentage: 10 },
          },
        },
      },
    });

    renderPage();
    await screen.findByText('FREE Plan');

    expect(screen.getByRole('button', { name: /upgrade to starter/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /upgrade to business/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /upgrade to pro/i })).toBeEnabled();
    expect(
      screen.getAllByText(/checkout not configured for this tier/i),
    ).toHaveLength(2);
  });
});

/*
 * Regression tests for the subscription read-failure fix (Bug #42): a
 * rejected GET /billing/subscription used to render the page as
 * "FREE Plan • ACTIVE" with live Upgrade checkout buttons — telling a
 * paying org it was unsubscribed and inviting a RE-PURCHASE under false
 * state. The whole page is now replaced by an honest failure panel.
 */
describe('SubscriptionSettingsPage read-failure surface', () => {
  test('a failed subscription GET shows the Retry panel instead of the FREE-plan store', async () => {
    mockedGet.mockRejectedValue({
      response: {
        data: { success: false, error: { message: 'Billing service unavailable' } },
      },
    });

    renderPage();

    expect(
      await screen.findByText("We couldn't load your subscription"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Billing service unavailable')).toBeInTheDocument();

    // The fabricated FREE plan, usage bars and live checkout store must NOT render.
    expect(screen.queryByText('FREE Plan')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upgrade to/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Manage Stripe Billing' }),
    ).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
