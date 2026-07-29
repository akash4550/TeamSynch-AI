import { useSubscriptionUsage, useCreatePortalSession } from '../api/useBilling';
import { AlertCircle, CreditCard } from 'lucide-react';

export const BillingAlertBanner = () => {
  const { data: subData } = useSubscriptionUsage();
  const portalMutation = useCreatePortalSession();

  const status = subData?.subscriptionStatus?.toUpperCase();

  if (!status || status === 'ACTIVE' || status === 'TRIALING') {
    return null;
  }

  const isPastDue = status === 'PAST_DUE';

  return (
    <div className="bg-rose-600 text-white px-4 py-3 shadow-md flex flex-col sm:flex-row items-center justify-between gap-3 text-sm z-50">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span className="font-medium">
          {isPastDue
            ? 'Payment Required: Your last billing payment failed and your account is past due. Resource creation is restricted.'
            : 'Subscription Canceled: Your organization subscription is currently inactive. Upgrade to resume full workspace capabilities.'}
        </span>
      </div>

      <button
        onClick={() => portalMutation.mutate()}
        disabled={portalMutation.isPending}
        className="px-3 py-1.5 bg-white text-rose-700 hover:bg-rose-50 font-semibold rounded-md shadow-sm transition-colors flex items-center gap-1.5 shrink-0"
      >
        <CreditCard className="w-4 h-4" />
        {portalMutation.isPending ? 'Opening Portal...' : 'Update Payment Method'}
      </button>
    </div>
  );
};
