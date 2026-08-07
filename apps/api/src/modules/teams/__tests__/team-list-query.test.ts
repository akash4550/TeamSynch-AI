/*
 * BUG FIX (#115, 2026-08-06) pins — GET /teams mounts
 * validateRequest(listTeamsSchema) (page/limit coerce + defaults, ≤100
 * cap, sortBy/sortOrder enums) but the controller discarded the validated
 * output and passed RAW req.query downstream — the same
 * discarded-validation root as #114 (users). Latent today (TeamDashboard
 * calls bare, TeamsPage sends only `search`), but the first caller to
 * pass `?limit=10` would hit Prisma's Int-typed `take` with the string
 * "10" (client-side argument validation error → 500). The controller now
 * reads getValidatedRequest<ListTeamsRequest>(req).query. These pins
 * exercise the REAL middleware and the controller boundary — no
 * database. Service-level pins live in team-list-pagination.test.ts
 * (jest.mock is file-scoped; split precedent from #104/#114).
 */
import { validateRequest } from '../../../core/middlewares/validateRequest';
import { listTeamsSchema } from '../team.validator';
import { TeamController } from '../team.controller';
import { TeamService } from '../team.service';

jest.mock('../team.service');
// TeamService's real module graph pulls ../jobs/queues (BullMQ → Redis).
// Even automocked-service suites resolve that graph (users/projects
// suites don't have it and exit clean — suites before #115 never hung).
// Mock the queue module so no Redis handle keeps the jest worker alive.
jest.mock('../../jobs/queues', () => ({
  emailQueue: { add: jest.fn() },
}));

describe('validateRequest(listTeamsSchema) on GET /teams (BUG FIX #115)', () => {
  const runMiddleware = (query: Record<string, unknown>) => {
    // Express 5 leaves req.body undefined on body-less GETs; the schema
    // declares no `body`/`params` keys, so only `query` is kept.
    const req: any = { body: undefined, query, params: {} };
    const next = jest.fn();
    return { req, next, done: validateRequest(listTeamsSchema)(req, {} as any, next) };
  };

  it('rejects a non-numeric page with a 400 AppError via next()', async () => {
    const { req, next, done } = runMiddleware({ page: 'abc' });
    await done;
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err?.statusCode).toBe(400);
    expect(err?.message).toMatch(/Validation failed/);
    expect(req.validated).toBeUndefined();
  });

  it('enforces the advertised ≤100 limit cap', async () => {
    const { next, done } = runMiddleware({ limit: '999' });
    await done;
    expect(next.mock.calls[0][0]?.statusCode).toBe(400);
  });

  it('rejects garbage sortBy BEFORE Prisma (allowlist: name/createdAt/updatedAt)', async () => {
    const { next, done } = runMiddleware({ sortBy: 'not_a_column' });
    await done;
    expect(next.mock.calls[0][0]?.statusCode).toBe(400);
  });

  it('rejects an off-enum sortOrder and a non-uuid ownerId', async () => {
    const badOrder = runMiddleware({ sortOrder: 'sideways' });
    await badOrder.done;
    expect(badOrder.next.mock.calls[0][0]?.statusCode).toBe(400);

    const badOwner = runMiddleware({ ownerId: 'not-a-uuid' });
    await badOwner.done;
    expect(badOwner.next.mock.calls[0][0]?.statusCode).toBe(400);
  });

  it('accepts BOTH live payloads exactly and coerces the rest', async () => {
    // TeamDashboard.tsx sends a bare GET (no params) — page/limit
    // defaults apply; sortBy/sortOrder are .optional() with NO schema
    // default (the repository destructuring owns those fallbacks).
    const bare = runMiddleware({});
    await bare.done;
    expect(bare.next).toHaveBeenCalledWith();
    expect(bare.req.validated.query).toEqual({ page: 1, limit: 20 });

    // TeamsPage.tsx sends only { search } (undefined keys dropped by axios).
    const searched = runMiddleware({ search: 'acme' });
    await searched.done;
    expect(searched.next).toHaveBeenCalledWith();
    expect(searched.req.validated.query.search).toBe('acme');

    // Any future paginating caller: strings coerce to numbers.
    const paged = runMiddleware({ page: '2', limit: '10', sortBy: 'name', sortOrder: 'asc' });
    await paged.done;
    expect(paged.next).toHaveBeenCalledWith();
    expect(paged.req.validated.query).toMatchObject({ page: 2, limit: 10, sortBy: 'name', sortOrder: 'asc' });
    expect(typeof paged.req.validated.query.page).toBe('number');
    expect(typeof paged.req.validated.query.limit).toBe('number');
  });
});

describe('TeamController.getTeams (BUG FIX #115)', () => {
  it('passes the VALIDATED query to the service — not raw req.query — and keeps the envelope', async () => {
    const controller = new TeamController();
    const inner = (controller as any).service as jest.Mocked<TeamService>;
    inner.getTeams = jest.fn().mockResolvedValue({ teams: [], total: 0 });

    const parsedQuery = { page: 1, limit: 20, search: 'acme' };
    const req: any = {
      user: { organizationId: 'org-1' },
      // Raw wire values stay UNCOERCED strings — if the controller ever
      // regresses to req.query the numbers arrive as strings (Prisma 500,
      // the original bug) and this pin fails.
      query: { limit: '20', search: 'acme' },
      validated: { query: parsedQuery },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await controller.getTeams(req, res, jest.fn());

    expect(inner.getTeams).toHaveBeenCalledWith('org-1', parsedQuery);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { teams: [], total: 0 },
    });
  });
});
