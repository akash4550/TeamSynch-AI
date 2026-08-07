/*
 * BUG FIX (#113, 2026-08-06) pins — the projects list route now actually
 * runs projectListSchema (the schema existed, ledger #6's 500-cap
 * comment and all, but was never mounted) and the controller reads the
 * validated query instead of raw req.query. Middleware pins exercise the
 * REAL validateRequest; the controller pin proves the service receives
 * the parsed (coerced) query, not the raw string map.
 */
import { validateRequest } from '../../../core/middlewares/validateRequest';
import { projectListSchema } from '../project.validator';
import { ProjectController } from '../project.controller';
import { ProjectService } from '../project.service';

jest.mock('../project.service');

describe('validateRequest(projectListSchema) on GET /projects (BUG FIX #113)', () => {
  const runMiddleware = (query: Record<string, unknown>) => {
    // Express 5 leaves req.body undefined on body-less GETs, exactly what
    // projectListSchema's `body: z.undefined().optional()` demands.
    const req: any = { body: undefined, query, params: {} };
    const next = jest.fn();
    return { req, next, done: validateRequest(projectListSchema)(req, {} as any, next) };
  };

  it('rejects a garbage sortBy with a 400 AppError via next() (was: opaque 500 from Prisma)', async () => {
    const { req, next, done } = runMiddleware({ sortBy: 'not_a_column' });
    await done;
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err?.statusCode).toBe(400);
    expect(err?.message).toMatch(/Validation failed/);
    expect(req.validated).toBeUndefined();
  });

  it('rejects an off-enum status', async () => {
    const { next, done } = runMiddleware({ status: 'NOT_A_STATUS' });
    await done;
    expect(next.mock.calls[0][0]?.statusCode).toBe(400);
  });

  it('enforces the advertised ≤500 limit cap (was: bypassed, unbounded take)', async () => {
    const { next, done } = runMiddleware({ limit: '99999999' });
    await done;
    expect(next.mock.calls[0][0]?.statusCode).toBe(400);
  });

  it('strict-rejects unknown query params (schema topology guard)', async () => {
    const { next, done } = runMiddleware({ evilParam: '1' });
    await done;
    expect(next.mock.calls[0][0]?.statusCode).toBe(400);
  });

  it('accepts the live web payloads and coerces values', async () => {
    // Dashboard.tsx / TasksPage.tsx send { limit: 500 }; ProjectsList
    // sends { search?, status? } with undefineds omitted by axios.
    const { req, next, done } = runMiddleware({ limit: '500' });
    await done;
    expect(next).toHaveBeenCalledWith();
    expect(req.validated.query).toMatchObject({ page: 1, limit: 500 });

    const second = runMiddleware({ search: 'website', status: 'ACTIVE', page: '2' });
    await second.done;
    expect(second.next).toHaveBeenCalledWith();
    expect(second.req.validated.query).toMatchObject({
      page: 2,
      search: 'website',
      status: 'ACTIVE',
    });
  });
});

describe('ProjectController.getProjects (BUG FIX #113)', () => {
  it('passes the VALIDATED query to the service — not raw req.query — and keeps the envelope', async () => {
    const controller = new ProjectController();
    const inner = (controller as any).service as jest.Mocked<ProjectService>;
    inner.getProjects = jest.fn().mockResolvedValue({ data: [], total: 0 });

    const parsedQuery = { page: 1, limit: 500, status: 'ACTIVE' };
    const req: any = {
      user: { organizationId: 'org-1' },
      // Raw wire values stay UNCOERCED strings — if the controller ever
      // regresses to req.query the numbers arrive as strings and this
      // pin fails.
      query: { limit: '500', status: 'ACTIVE' },
      validated: { body: {}, query: parsedQuery, params: {} },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await controller.getProjects(req, res, jest.fn());

    expect(inner.getProjects).toHaveBeenCalledWith('org-1', parsedQuery);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { data: [], total: 0 },
    });
  });
});
