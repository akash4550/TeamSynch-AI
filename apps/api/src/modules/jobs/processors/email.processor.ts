import { Job } from 'bullmq';
import { EmailJobData } from '../services/job.service';
import { logger } from '../../../core/utils/logger';

/*
 * BUG FIX (#101, 2026-08-06 — fabricated email delivery): the previous
 * processor held a code comment admitting "Placeholder for actual email
 * sending logic", then slept 500ms, logged `[EmailWorker] Sent email to
 * <to>`, and returned `{ success: true, deliveredTo: to }`. BullMQ books a
 * processor's return value as the job's completed result — so every
 * producer of this queue completed with a forged delivery receipt:
 *   - TEAM_INVITATION (teams/team.service.ts) — invitees never received
 *     their accept link while the jobs ledger claimed the email landed;
 *   - SEND_BILLING_RECEIPT (billing/stripe.service.ts) — no receipt was
 *     ever sent for a real card charge;
 *   - WEEKLY_ANALYTICS_DIGEST (weekly-analytics.processor.ts, ledger #5).
 * This deployment ships NO mail transport (no dependency, no credentials —
 * deliberately: inventing an SMTP_URL env contract here would just be a
 * second lie, since nothing would read it). The honest contract is
 * fail-closed: throw, let BullMQ's attempts:3 retry and then record the
 * job FAILED, so the Jobs dashboard and queue-failure metrics report the
 * truth (deliberate parity with #91: never fabricate a checkout URL).
 * The single seam for a real provider is `deliverEmail` below — wire it
 * and this processor becomes a thin truthful wrapper.
 */
export class EmailTransportUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `Email transport is not implemented in this deployment — no delivery was attempted (${detail}). ` +
        `Wire a real provider in deliverEmail() (apps/api/src/modules/jobs/processors/email.processor.ts) to enable delivery.`,
    );
    this.name = 'EmailTransportUnavailableError';
  }
}

const maskRecipient = (to: string): string => {
  const at = to.indexOf('@');
  return at > 0 ? `***${to.slice(at)}` : '***';
};

/*
 * THE seam: implement real delivery here (SES/SendGrid/SMTP), returning the
 * provider's acceptance identity (message id). Until then it throws the
 * explicit configuration error — never a simulated success.
 */
const deliverEmail = async (job: Job<EmailJobData>): Promise<{ providerMessageId: string }> => {
  throw new EmailTransportUnavailableError(
    `job "${job.name}" to ${maskRecipient(job.data.to)}`,
  );
};

/**
 * Processor for handling background email sending.
 * Receives tenant + recipient context strictly via the job payload.
 */
export const emailProcessor = async (job: Job<EmailJobData>) => {
  const { organizationId, to } = job.data;

  if (!organizationId) {
    throw new Error('Tenant context (organizationId) missing in job payload');
  }

  const receipt = await deliverEmail(job);

  // Reached only when a real provider accepted the message — the receipt is
  // genuine: BullMQ stores it as the job result, never a fabricated claim.
  logger.info('[EmailWorker] Email accepted by provider', {
    jobName: job.name,
    providerMessageId: receipt.providerMessageId,
  });

  return { success: true, deliveredTo: to, providerMessageId: receipt.providerMessageId };
};
