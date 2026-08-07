/*
 * BUG FIX (#101, 2026-08-06) pins — the email processor's honest contract:
 * no transport exists in this deployment, so every job MUST fail visibly
 * (BullMQ retries then records FAILED) instead of completing with the old
 * fabricated `{ success: true, deliveredTo }` receipt and a fake
 * "[EmailWorker] Sent email to ..." log line.
 */
import { emailProcessor, EmailTransportUnavailableError } from '../email.processor';

jest.mock('../../../../core/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const buildJob = (overrides: Record<string, unknown> = {}) => ({
  name: 'TEAM_INVITATION',
  data: {
    organizationId: 'org-1',
    userId: 'user-1',
    to: 'invitee@example.com',
    subject: 'Hello',
    template: 'TEAM_INVITATION',
    context: {},
    ...((overrides.data as object) ?? {}),
  },
  ...overrides,
});

describe('Bug #101 — email processor fails closed, never fabricates delivery', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('rejects with an explicit not-implemented error instead of a fake success receipt', async () => {
    const err = await emailProcessor(buildJob() as any).catch((e) => e);

    expect(err).toBeInstanceOf(EmailTransportUnavailableError);
    expect(err.message).toContain('not implemented');
    expect(err.message).toContain('no delivery was attempted');
  });

  it('masks the recipient local-part in the error (no PII in ops output)', async () => {
    const err = await emailProcessor(buildJob() as any).catch((e) => e);

    expect(err.message).toContain('***@example.com');
    expect(err.message).not.toContain('invitee@example.com');
  });

  it('NEVER logs the fabricated "Sent email" line', async () => {
    await emailProcessor(buildJob() as any).catch(() => undefined);

    const logged = logSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('Sent email');
  });

  it('keeps the tenant-context guard: missing organizationId throws before any transport talk', async () => {
    const err = await emailProcessor(
      buildJob({ data: { organizationId: undefined } }) as any,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('organizationId');
    expect(err).not.toBeInstanceOf(EmailTransportUnavailableError);
  });
});
