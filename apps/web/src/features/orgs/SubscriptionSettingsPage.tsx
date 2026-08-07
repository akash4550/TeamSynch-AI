import { useState } from 'react';
import { useSubscriptionUsage, useCreateCheckoutSession, useCreatePortalSession } from '../../modules/billing/api/useBilling';
import {
  CheckIcon,
  CircleStackIcon,
  CreditCardIcon,
  FolderIcon,
  SparklesIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

/*
 * UI PASS (#UI-subscription-settings, 2026-08-07): visual-only restyle of a
 * money-critical surface — Tremor chrome (Card/Title/Text/Badge/Button/
 * Grid/ProgressBar) swapped for the shared design system. THIS file only;
 * every query, mutation, disable rule, and Bug #29/#42/ledger-#11 truth
 * contract below is preserved verbatim.
 *
 * Locks held (SubscriptionSettingsPage.test.tsx): 'FREE Plan' heading,
 * /upgrade to (starter|pro|business)/i buttons with exact disable logic,
 * 'Manage Stripe Billing', 'Dismiss billing error' banner, missing-URL
 * copy, 2x 'Checkout not configured for this tier on this deployment.',
 * and the Bug #42 whole-page failure panel + Retry.
 *
 * Disclosed visual-only unifications (restrained one-accent system):
 *  - Upgrade CTAs were three different hues (blue starter / purple pro /
 *    emerald business) — now all `primary` (current tier = secondary).
 *  - Current-tier ring and metric-bar hues unified to the primary accent;
 *    rose survives ONLY as the >90% danger threshold (semantic).
 *  - Tremor ProgressBar → accessible bar (role="progressbar" + aria-*);
 *    the dynamic fill width is the one inline style on the page.
 *  - Icons: lucide → heroicons (single icon system across the app).
 */

interface UsageMeterProps {
  icon: React.ReactNode;
  label: string;
  valueText: string;
  percentage: number;
}

/* Usage meter — same data/palette rules as the old tiles; semantic bar. */
const UsageMeter = ({ icon, label, valueText, percentage }: UsageMeterProps) => (
  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        {icon} {label}
      </span>
      <span className="text-xs font-semibold tabular-nums text-gray-500 dark:text-gray-400">{valueText}</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        className={`h-full rounded-full ${percentage > 90 ? 'bg-rose-500' : 'bg-primary-500'}`}
        style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
      />
    </div>
  </div>
);

interface TierCardProps {
  tier: 'STARTER' | 'PRO' | 'BUSINESS';
  name: string;
  price: string;
  features: string[];
  currentPlan: string;
  isPending: boolean;
  priceConfigured: boolean;
  onUpgrade: () => void;
}

/* Tier card — identical visibility/disable/label rules as before. */
const TierCard = ({ tier, name, price, features, currentPlan, isPending, priceConfigured, onUpgrade }: TierCardProps) => {
  const isCurrent = currentPlan === tier;
  return (
    <Card
      className={`p-6 ${isCurrent ? 'border-primary-500 ring-2 ring-primary-500/30 dark:border-primary-400 dark:ring-primary-400/30' : ''}`}
    >
      <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">{name}</h3>
      <p className="mb-4 text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">
        {price} <span className="text-sm font-normal text-gray-500 dark:text-gray-400">/ mo</span>
      </p>
      <ul className="mb-6 space-y-2 text-sm text-gray-600 dark:text-gray-300">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Button
        className="w-full"
        variant={isCurrent ? 'secondary' : 'primary'}
        disabled={isCurrent || isPending || !priceConfigured}
        onClick={onUpgrade}
      >
        {isCurrent ? 'Current Tier' : `Upgrade to ${name.replace(' Tier', '')}`}
      </Button>
      {!priceConfigured && (
        <p className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
          Checkout not configured for this tier on this deployment.
        </p>
      )}
    </Card>
  );
};

const statusPillClass = (active: boolean) =>
  `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
    active
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20'
      : 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20'
  }`;

export const SubscriptionSettingsPage = () => {
  /*
   * BUG FIX (entitlement lie — failed GET claimed "FREE Plan" — Bug #42):
   * this query surfaced only `isLoading`, and the page defaulted
   * `currentPlan` to 'FREE' with badge 'ACTIVE' — so a rejected
   * GET /billing/subscription told a PAYING org it was on the FREE plan,
   * hid its usage bars, and (worst) left the Upgrade-to-paid checkout
   * buttons live under that false state. `isError`/`error`/`refetch` are
   * now exposed and the ENTIRE subscription page (plan card + upgrade
   * store) is replaced by an honest failure panel (server message + Retry)
   * when the read fails. Same truth pattern as Bug #31–#41.
   */
  const {
    data: subData,
    isLoading,
    isError,
    error: subError,
    refetch,
  } = useSubscriptionUsage();

  const subErrorMessage = (() => {
    const m = (subError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();
  const checkoutMutation = useCreateCheckoutSession();
  const portalMutation = useCreatePortalSession();

  /*
   * BUG FIX (silent billing failures): the checkout/portal mutations had no
   * onError, and the shared hook only redirects when the response contains
   * a URL — so a Stripe failure (misconfigured price, 500, network) or an
   * empty `checkoutUrl`/`portalUrl` left the user staring at a button that
   * did NOTHING on a money-critical surface. Failures (and missing-URL
   * responses) now surface in a dismissible banner, extracting the message
   * from the shared `{ error: { message } }` envelope (string-only).
   */
  const [billingError, setBillingError] = useState<string | null>(null);

  const extractBillingError = (error: any, fallback: string) => {
    const apiMessage = error?.response?.data?.error?.message;
    return typeof apiMessage === 'string' && apiMessage.length > 0
      ? apiMessage
      : fallback;
  };

  /*
   * FEATURE (ledger #11): price ids are server-driven (operator-configured
   * STRIPE_PRICE_* env). The buttons previously POSTed hardcoded fictional
   * ids ('price_starter_monthly' etc.) that no real Stripe account could
   * honor — checkout 502'd even on a perfectly configured deployment. A
   * tier with no configured price disables its button and says why.
   */
  const planPriceId = (tier: 'STARTER' | 'PRO' | 'BUSINESS'): string | null =>
    subData?.plans?.find((p) => p.tier === tier)?.priceId ?? null;

  const handleCheckout = (priceId: string) => {
    setBillingError(null);
    checkoutMutation.mutate(
      { priceId },
      {
        onSuccess: (data: any) => {
          if (!data?.checkoutUrl) {
            setBillingError('Checkout is temporarily unavailable. Please try again.');
          }
        },
        onError: (error: any) => {
          setBillingError(
            extractBillingError(error, 'Could not start checkout. Please try again.')
          );
        },
      }
    );
  };

  const handlePortal = () => {
    setBillingError(null);
    portalMutation.mutate(undefined, {
      onSuccess: (data: any) => {
        if (!data?.portalUrl) {
          setBillingError('The billing portal is temporarily unavailable. Please try again.');
        }
      },
      onError: (error: any) => {
        setBillingError(
          extractBillingError(error, 'Could not open the billing portal. Please try again.')
        );
      },
    });
  };

  if (isLoading) {
    return (
      <div role="status" className="p-6 h-full flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <ArrowPathSpinner />
        Loading subscription details...
      </div>
    );
  }

  // Bug #42: honest failure panel replaces the fabricated "FREE Plan" page.
  if (isError) {
    return (
      <div className="p-6 h-full max-w-5xl bg-gray-50 dark:bg-slate-900">
        <div
          role="alert"
          className="flex flex-col items-center rounded-lg border border-red-200 bg-red-50 px-6 py-12 text-center dark:border-red-900/50 dark:bg-red-900/20"
        >
          <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load your subscription</p>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {subErrorMessage ?? 'Something went wrong while fetching your subscription details. Your data is safe — please try again.'}
          </p>
          <Button size="sm" className="mt-4" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const usage = subData?.usage;
  const currentPlan = subData?.plan || 'FREE';

  const meterIconClass = 'h-4 w-4 text-primary-500';

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="max-w-5xl space-y-6">
        {/* Page header — cluster language; Manage Billing is the lone
            action and stays a real button (opens the Stripe portal). */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Subscription & Plan Entitlements</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage plan quotas, usage limits, and billing details.</p>
          </div>
          <Button
            className="shrink-0 gap-2 self-start sm:self-auto"
            isLoading={portalMutation.isPending}
            onClick={handlePortal}
          >
            {!portalMutation.isPending && <CreditCardIcon className="h-4 w-4" aria-hidden="true" />}
            Manage Stripe Billing
          </Button>
        </div>

        {billingError && (
          <div
            role="alert"
            className="flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
          >
            <span>{billingError}</span>
            <button
              type="button"
              aria-label="Dismiss billing error"
              onClick={() => setBillingError(null)}
              className="font-semibold text-red-500 hover:text-red-700 dark:hover:text-red-200"
            >
              &times;
            </button>
          </div>
        )}

        {/* Current plan — ui/Card + top accent (gray for FREE, emerald for
            paid; same rule as the old Tremor decoration). */}
        <Card className="relative overflow-hidden p-5 sm:p-6">
          <span
            aria-hidden="true"
            className={`absolute inset-x-0 top-0 h-1 ${currentPlan === 'FREE' ? 'bg-gray-300 dark:bg-slate-600' : 'bg-emerald-500'}`}
          />
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{currentPlan} Plan</h2>
                <span className={statusPillClass(subData?.subscriptionStatus === 'ACTIVE')}>
                  {subData?.subscriptionStatus || 'ACTIVE'}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Organization plan quota usage for current billing cycle.
              </p>
            </div>
          </div>

          {usage && (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UsageMeter
                icon={<UsersIcon className={meterIconClass} aria-hidden="true" />}
                label="Active Users"
                valueText={`${usage.users.current} / ${usage.users.max} (${usage.users.percentage}%)`}
                percentage={usage.users.percentage}
              />
              <UsageMeter
                icon={<FolderIcon className={meterIconClass} aria-hidden="true" />}
                label="Projects Created"
                valueText={`${usage.projects.current} / ${usage.projects.max} (${usage.projects.percentage}%)`}
                percentage={usage.projects.percentage}
              />
              <UsageMeter
                icon={<SparklesIcon className={meterIconClass} aria-hidden="true" />}
                label="Monthly AI Requests"
                valueText={`${usage.aiRequests.current} / ${usage.aiRequests.max} (${usage.aiRequests.percentage}%)`}
                percentage={usage.aiRequests.percentage}
              />
              <UsageMeter
                icon={<CircleStackIcon className={meterIconClass} aria-hidden="true" />}
                label="Storage Usage"
                valueText={`${usage.storageMb.current} MB / ${usage.storageMb.max} MB (${usage.storageMb.percentage}%)`}
                percentage={usage.storageMb.percentage}
              />
            </div>
          )}
        </Card>

        {/* Available Upgrade Tier Cards */}
        <div className="pt-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Upgrade Subscription Tier</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <TierCard
              tier="STARTER"
              name="Starter Tier"
              price="$29"
              features={['Up to 15 Team Members', '15 Projects', '500 AI Requests / mo', '5 GB Object Storage']}
              currentPlan={currentPlan}
              isPending={checkoutMutation.isPending}
              priceConfigured={!!planPriceId('STARTER')}
              onUpgrade={() => {
                const id = planPriceId('STARTER');
                if (id) handleCheckout(id);
              }}
            />
            <TierCard
              tier="PRO"
              name="Pro Tier"
              price="$79"
              features={['Up to 50 Team Members', '100 Projects', '5,000 AI Requests / mo', '50 GB Object Storage']}
              currentPlan={currentPlan}
              isPending={checkoutMutation.isPending}
              priceConfigured={!!planPriceId('PRO')}
              onUpgrade={() => {
                const id = planPriceId('PRO');
                if (id) handleCheckout(id);
              }}
            />
            <TierCard
              tier="BUSINESS"
              name="Business Tier"
              price="$199"
              features={['Up to 500 Team Members', '1,000 Projects', '50,000 AI Requests / mo', '500 GB Object Storage']}
              currentPlan={currentPlan}
              isPending={checkoutMutation.isPending}
              priceConfigured={!!planPriceId('BUSINESS')}
              onUpgrade={() => {
                const id = planPriceId('BUSINESS');
                if (id) handleCheckout(id);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/* Tiny local spinner for the early-return loading branch (keeps that
 * branch free of page-chrome imports). */
const ArrowPathSpinner = () => (
  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);
