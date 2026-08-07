/*
 * BUG FIX (#115, 2026-08-06) service-level pins — split out of
 * team-list-query.test.ts because jest.mock is file-scoped: the
 * controller pin mocks TeamService, while THESE pins need the REAL
 * TeamService constructor (automock strips it — self-catch precedent
 * from #104/#114). They pin the boundary chain downstream of the fixed
 * controller: the validated/coerced query passes through the service to
 * the repository VERBATIM, and (canary) raw strings would too — the
 * service has no defensive coercion, which is why the controller
 * boundary is load-bearing.
 */
import { TeamService } from '../team.service';
import { TeamRepository } from '../team.repository';

jest.mock('../team.repository');
// BullMQ Queue construction (Redis side effect) runs on module import;
// the getTeams path never enqueues — mock the module like audit's suite.
jest.mock('../../jobs/queues', () => ({
  emailQueue: { add: jest.fn() },
}));

describe('TeamService.getTeams boundary chain (BUG FIX #115 characterization)', () => {
  it('passes the validated query to the repository verbatim (numbers stay numbers)', async () => {
    const service = new TeamService();
    const repo = (service as any).repository as jest.Mocked<TeamRepository>;
    repo.findMany = jest.fn().mockResolvedValue({ teams: [], total: 0 });

    const parsedQuery = { page: 2, limit: 10, search: 'acme', sortBy: 'name' as const };
    await service.getTeams('org-1', parsedQuery);

    expect(repo.findMany).toHaveBeenCalledWith('org-1', parsedQuery);
    const passed = (repo.findMany as jest.Mock).mock.calls[0][1];
    expect(typeof passed.page).toBe('number');
    expect(typeof passed.limit).toBe('number');
  });

  it('CANARY: has NO defensive coercion of its own — raw strings would reach the repository as strings', async () => {
    const service = new TeamService();
    const repo = (service as any).repository as jest.Mocked<TeamRepository>;
    repo.findMany = jest.fn().mockResolvedValue({ teams: [], total: 0 });

    await service.getTeams('org-1', { limit: '10' } as any);

    const passed = (repo.findMany as jest.Mock).mock.calls[0][1];
    expect(passed.limit).toBe('10');
    expect(typeof passed.limit).toBe('string');
  });
});
