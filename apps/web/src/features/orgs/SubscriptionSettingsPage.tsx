import { useSubscriptionUsage, useCreateCheckoutSession, useCreatePortalSession } from '../../modules/billing/api/useBilling';
import { Card, Title, Text, Badge, Button, Grid, ProgressBar } from '@tremor/react';
import { CreditCard, Sparkles, FolderKanban, Users, Database } from 'lucide-react';

export const SubscriptionSettingsPage = () => {
  const { data: subData, isLoading } = useSubscriptionUsage();
  const checkoutMutation = useCreateCheckoutSession();
  const portalMutation = useCreatePortalSession();

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading subscription details...</div>;
  }

  const usage = subData?.usage;
  const currentPlan = subData?.plan || 'FREE';

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex justify-between items-center">
        <div>
          <Title className="text-2xl dark:text-white">Subscription & Plan Entitlements</Title>
          <Text className="dark:text-gray-400">Manage plan quotas, usage limits, and billing details.</Text>
        </div>
        <Button
          icon={CreditCard}
          color="blue"
          loading={portalMutation.isPending}
          onClick={() => portalMutation.mutate()}
        >
          Manage Stripe Billing
        </Button>
      </div>

      <Card decoration="top" decorationColor={currentPlan === 'FREE' ? 'gray' : 'emerald'}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{currentPlan} Plan</h2>
              <Badge color={subData?.subscriptionStatus === 'ACTIVE' ? 'emerald' : 'amber'}>
                {subData?.subscriptionStatus || 'ACTIVE'}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Organization plan quota usage for current billing cycle.
            </p>
          </div>
        </div>

        {usage && (
          <Grid numItemsSm={1} numItemsLg={2} className="gap-6 mt-6">
            <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
              <div className="flex justify-between items-center mb-2">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Users className="w-4 h-4 text-blue-500" /> Active Users
                </span>
                <span className="text-xs font-semibold text-gray-500">
                  {usage.users.current} / {usage.users.max} ({usage.users.percentage}%)
                </span>
              </div>
              <ProgressBar value={usage.users.percentage} color={usage.users.percentage > 90 ? 'rose' : 'blue'} />
            </div>

            <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
              <div className="flex justify-between items-center mb-2">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <FolderKanban className="w-4 h-4 text-emerald-500" /> Projects Created
                </span>
                <span className="text-xs font-semibold text-gray-500">
                  {usage.projects.current} / {usage.projects.max} ({usage.projects.percentage}%)
                </span>
              </div>
              <ProgressBar value={usage.projects.percentage} color={usage.projects.percentage > 90 ? 'rose' : 'emerald'} />
            </div>

            <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
              <div className="flex justify-between items-center mb-2">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Sparkles className="w-4 h-4 text-purple-500" /> Monthly AI Requests
                </span>
                <span className="text-xs font-semibold text-gray-500">
                  {usage.aiRequests.current} / {usage.aiRequests.max} ({usage.aiRequests.percentage}%)
                </span>
              </div>
              <ProgressBar value={usage.aiRequests.percentage} color={usage.aiRequests.percentage > 90 ? 'rose' : 'purple'} />
            </div>

            <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
              <div className="flex justify-between items-center mb-2">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Database className="w-4 h-4 text-amber-500" /> Storage Usage
                </span>
                <span className="text-xs font-semibold text-gray-500">
                  {usage.storageMb.current} MB / {usage.storageMb.max} MB ({usage.storageMb.percentage}%)
                </span>
              </div>
              <ProgressBar value={usage.storageMb.percentage} color={usage.storageMb.percentage > 90 ? 'rose' : 'amber'} />
            </div>
          </Grid>
        )}
      </Card>

      {/* Available Upgrade Tier Cards */}
      <div className="pt-4">
        <Title className="text-lg mb-4 dark:text-white">Upgrade Subscription Tier</Title>
        <Grid numItemsSm={1} numItemsLg={3} className="gap-6">
          <Card className={`p-6 border ${currentPlan === 'STARTER' ? 'border-blue-500 ring-2 ring-blue-500' : ''}`}>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">Starter Tier</h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-4">$29 <span className="text-sm font-normal text-gray-500">/ mo</span></p>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2 mb-6">
              <li>• Up to 15 Team Members</li>
              <li>• 15 Projects</li>
              <li>• 500 AI Requests / mo</li>
              <li>• 5 GB Object Storage</li>
            </ul>
            <Button
              className="w-full"
              variant={currentPlan === 'STARTER' ? 'secondary' : 'primary'}
              disabled={currentPlan === 'STARTER' || checkoutMutation.isPending}
              onClick={() => checkoutMutation.mutate({ priceId: 'price_starter_monthly' })}
            >
              {currentPlan === 'STARTER' ? 'Current Tier' : 'Upgrade to Starter'}
            </Button>
          </Card>

          <Card className={`p-6 border ${currentPlan === 'PRO' ? 'border-purple-500 ring-2 ring-purple-500' : ''}`}>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">Pro Tier</h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-4">$79 <span className="text-sm font-normal text-gray-500">/ mo</span></p>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2 mb-6">
              <li>• Up to 50 Team Members</li>
              <li>• 100 Projects</li>
              <li>• 5,000 AI Requests / mo</li>
              <li>• 50 GB Object Storage</li>
            </ul>
            <Button
              className="w-full"
              color="purple"
              disabled={currentPlan === 'PRO' || checkoutMutation.isPending}
              onClick={() => checkoutMutation.mutate({ priceId: 'price_pro_monthly' })}
            >
              {currentPlan === 'PRO' ? 'Current Tier' : 'Upgrade to Pro'}
            </Button>
          </Card>

          <Card className={`p-6 border ${currentPlan === 'BUSINESS' ? 'border-emerald-500 ring-2 ring-emerald-500' : ''}`}>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">Business Tier</h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-4">$199 <span className="text-sm font-normal text-gray-500">/ mo</span></p>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2 mb-6">
              <li>• Up to 500 Team Members</li>
              <li>• 1,000 Projects</li>
              <li>• 50,000 AI Requests / mo</li>
              <li>• 500 GB Object Storage</li>
            </ul>
            <Button
              className="w-full"
              color="emerald"
              disabled={currentPlan === 'BUSINESS' || checkoutMutation.isPending}
              onClick={() => checkoutMutation.mutate({ priceId: 'price_business_monthly' })}
            >
              {currentPlan === 'BUSINESS' ? 'Current Tier' : 'Upgrade to Business'}
            </Button>
          </Card>
        </Grid>
      </div>
    </div>
  );
};
