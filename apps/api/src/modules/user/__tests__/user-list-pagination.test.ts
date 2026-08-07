/*
 * BUG FIX (#114, 2026-08-06) service-level pins — split out of
 * user-list-query.test.ts because jest.mock is file-scoped: the
 * controller pin mocks UserService, while THESE pins need the REAL
 * UserService constructor (automock strips it, leaving `repository`
 * undefined — self-catch, same split precedent as #104). They pin the
 * numeric contract downstream of the fixed controller boundary: the
 * validated/coerced query must reach Prisma's Int-typed skip/take as
 * numbers, and the pagination echo must stay numeric.
 */
import { UserService } from '../user.service';
import { UserRepository } from '../user.repository';

jest.mock('../user.repository');

describe('UserService pagination contract (BUG FIX #114 characterization)', () => {
  it('forwards numbers through to Prisma skip/take and echoes a numeric page', async () => {
    const service = new UserService();
    const repo = (service as any).repository as jest.Mocked<UserRepository>;
    repo.findMany = jest.fn().mockResolvedValue({ users: [], total: 25 });

    const result = await service.getUsers('org-1', { page: 2, limit: 10 });

    expect(repo.findMany).toHaveBeenCalledWith('org-1', {
      skip: 10,
      take: 10,
      search: undefined,
      role: undefined,
    });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    expect(typeof result.pagination.page).toBe('number');
  });

  it('CANARY: has NO defensive coercion of its own — raw strings would reach Prisma as strings', async () => {
    // This pins WHY the controller boundary is load-bearing: the service
    // trusts its input. With the pre-#114 controller this is exactly
    // what happened at runtime (`"10"` → Prisma Int-typed `take` → 500).
    const service = new UserService();
    const repo = (service as any).repository as jest.Mocked<UserRepository>;
    repo.findMany = jest.fn().mockResolvedValue({ users: [], total: 0 });

    await service.getUsers('org-1', { page: '1', limit: '10' } as any);

    const options = (repo.findMany as jest.Mock).mock.calls[0][1] as any;
    expect(options.take).toBe('10');
    expect(typeof options.take).toBe('string');
  });
});
