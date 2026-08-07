/*
 * Shared BullMQ job-payload contracts (tenant context enforced by workers).
 * The former `JobService` enqueue-helper class was removed in the Bug #59
 * dead-code sweep: it had zero instantiations/call sites anywhere in the
 * repo (verified by census) — every live producer enqueues directly via
 * the queue objects (ai.controller, audit.service, calendar.service,
 * stripe.service, scheduler). Only these live type contracts remain.
 */
export interface BaseJobData {
  organizationId: string;
  userId?: string; // Who triggered this job, if applicable
  [key: string]: any;
}

export interface EmailJobData extends BaseJobData {
  to: string;
  subject: string;
  template: string;
  context: any;
}
