/*
 * BUG FIX (#114, 2026-08-06) pins — GET /users mounted
 * validateRequest(listUsersSchema) but the controller discarded the
 * validated output and passed RAW req.query downstream. The live
 * UserManagement page sends `?page=<n>&limit=10` on every render, so
 * Prisma received the STRINGS "10"/"1" on its Int-typed `take`/`skip`
 * (client-side argument validation error → 500), and `pagination.page`
 * echoed the string "1" where the envelope promises a number. The
 * controller now reads getValidatedRequest<ListUsersRequest>(req).query
 * (same armored pattern as BUG FIX #113's projects controller). These
 * pins exercise the REAL middleware, the controller boundary, and the
 * service's numeric contract — all without a database.
 */
import { Role } from '@prisma/client';

import { validateRequest } from '../../../core/middlewares/validateRequest';
import { listUsersSchema } from '../user.validator';
import { UserController } from '../user.controller';
import { UserService } from '../user.service';

// NOTE: the service-level pins live in user-list-pagination.test.ts —
// jest.mock is file-scoped, and mocking UserService here would strip the
// real constructor those pins depend on (self-catch, same split as #104).
jest.mock('../user.service');

describe('validateRequest(listUsersSchema) on GET /users (BUG FIX #114)', () => {
  const runMiddleware = (query: Record<string, unknown>) => {
    // Express 5 leaves req.body undefined on body-less GETs; the schema
    // declares no `body`/`params` keys, so only `query` is kept.
    const req: any = { body: undefined, query, params: {} };
    const next = jest.fn();
    return { req, next, done: validateRequest(listUsersSchema)(req, {} as any, next) };
  };

  it('rejects a non-numeric page with a 400 AppError via next() (was: string flowed into Prisma)', async () => {
    const { req, next, done } = runMiddleware({ page: 'abc' });
    await done;
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err?.statusCode).toBe(400);
    expect(err?.message).toMatch(/Validation failed/);
    expect(req.validated).toBeUndefined();
  });

  it('enforces the advertised ≤100 limit cap (the live page sends 10)', async () => {
    const { next, done } = runMiddleware({ limit: '999' });
    await done;
    expect(next.mock.calls[0][0]?.statusCode).toBe(400);
  });

  it('rejects an off-enum role (SUPER_ADMIN is the real value; SUPERADMIN is not)', async () => {
    const { next, done } = runMiddleware({ role: 'SUPERADMIN' });
    await done;
    expect(next.mock.calls[0][0]?.statusCode).toBe(400);

    const good = runMiddleware({ role: Role.ADMIN });
    await good.done;
    expect(good.next).toHaveBeenCalledWith();
    expect(good.req.validated.query.role).toBe(Role.ADMIN);
  });

  it('applies defaults on a bare request and strips unknown keys from the validated copy', async () => {
    const { req, next, done } = runMiddleware({ evilParam: '1' });
    await done;
    expect(next).toHaveBeenCalledWith();
    expect(req.validated.query).toEqual({ page: 1, limit: 20 });
    expect((req.validated.query as any).evilParam).toBeUndefined();
  });

  it('accepts the exact live web payload and coerces strings to numbers', async () => {
    // UserManagement.tsx sends { page, limit: 10, search?, role? } — on
    // the wire those are always strings.
    const { req, next, done } = runMiddleware({ page: '2', limit: '10' });
    await done;
    expect(next).toHaveBeenCalledWith();
    expect(req.validated.query).toEqual({ page: 2, limit: 10 });
    expect(typeof req.validated.query.page).toBe('number');
    expect(typeof req.validated.query.limit).toBe('number');

    const withFilters = runMiddleware({ search: 'ada', role: Role.MANAGER });
    await withFilters.done;
    expect(withFilters.next).toHaveBeenCalledWith();
    expect(withFilters.req.validated.query).toMatchObject({
      page: 1,
      limit: 20,
      search: 'ada',
      role: Role.MANAGER,
    });
  });
});
describe('UserController.getUsers (BUG FIX #114)', () => {
  it('passes the VALIDATED query to the service — not raw req.query — and keeps the envelope', async () => {
    const controller = new UserController();
    const inner = (controller as any).service as jest.Mocked<UserService>;
    inner.getUsers = jest.fn().mockResolvedValue({
      users: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    const parsedQuery = { page: 1, limit: 10, search: 'ada' };
    const req: any = {
      user: { organizationId: 'org-1' },
      // Raw wire values stay UNCOERCED strings — if the controller ever
      // regresses to req.query the numbers arrive as strings (Prisma
      // 500, the original bug) and this pin fails.
      query: { page: '1', limit: '10', search: 'ada' },
      validated: { query: parsedQuery },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await controller.getUsers(req, res, jest.fn());

    expect(inner.getUsers).toHaveBeenCalledWith('org-1', parsedQuery);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        users: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      },
    });
  });
});
