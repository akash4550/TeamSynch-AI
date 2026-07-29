import { Role } from '@prisma/client';

import { SearchProvider } from '../providers/search-provider.interface';
import { SearchService } from '../services/search.service';

describe('SearchService', () => {
  let providerMock: jest.Mocked<SearchProvider>;
  let service: SearchService;

  beforeEach(() => {
    providerMock = {
      name: 'test-provider',
      search: jest.fn(),
    };

    service = new SearchService(providerMock);
  });

  it('normalizes the search term and forwards validated context', async () => {
    providerMock.search.mockResolvedValue({
      total: 1,
      items: [],
    });

    const result = await service.performGlobalSearch({
      organizationId: 'organization-1',
      userId: 'user-1',
      role: Role.ADMIN,
      term: '  customer  ',
      modules: ['crm'],
      limit: 20,
      offset: 0,
    });

    expect(providerMock.search).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      userId: 'user-1',
      role: Role.ADMIN,
      term: 'customer',
      modules: ['crm'],
      limit: 20,
      offset: 0,
    });

    expect(result).toEqual({
      total: 1,
      items: [],
    });
  });

  it('defaults to every module permitted for the caller role', async () => {
    providerMock.search.mockResolvedValue({
      total: 0,
      items: [],
    });

    await service.performGlobalSearch({
      organizationId: 'organization-1',
      userId: 'user-1',
      role: Role.EMPLOYEE,
      term: 'task',
      limit: 10,
      offset: 0,
    });

    expect(providerMock.search).toHaveBeenCalledWith(
      expect.objectContaining({
        modules: [
          'projects',
          'tasks',
          'crm',
          'documents',
        ],
      }),
    );
  });

  it('rejects a missing organization context', async () => {
    await expect(
      service.performGlobalSearch({
        organizationId: '',
        userId: 'user-1',
        role: Role.ADMIN,
        term: 'client',
        limit: 20,
        offset: 0,
      }),
    ).rejects.toMatchObject({
      message:
        'Organization context is required for search',
      statusCode: 400,
    });

    expect(providerMock.search).not.toHaveBeenCalled();
  });

  it('rejects a missing user context', async () => {
    await expect(
      service.performGlobalSearch({
        organizationId: 'organization-1',
        userId: '',
        role: Role.ADMIN,
        term: 'client',
        limit: 20,
        offset: 0,
      }),
    ).rejects.toMatchObject({
      message:
        'User context is required for search',
      statusCode: 400,
    });

    expect(providerMock.search).not.toHaveBeenCalled();
  });

  it.each([
    '',
    'a',
    'x'.repeat(101),
  ])(
    'rejects invalid search term %p',
    async (term) => {
      await expect(
        service.performGlobalSearch({
          organizationId: 'organization-1',
          userId: 'user-1',
          role: Role.ADMIN,
          term,
          limit: 20,
          offset: 0,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(
        providerMock.search,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    0,
    51,
    1.5,
  ])(
    'rejects invalid search limit %p',
    async (limit) => {
      await expect(
        service.performGlobalSearch({
          organizationId: 'organization-1',
          userId: 'user-1',
          role: Role.ADMIN,
          term: 'client',
          limit,
          offset: 0,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(
        providerMock.search,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    -1,
    1001,
    1.5,
  ])(
    'rejects invalid search offset %p',
    async (offset) => {
      await expect(
        service.performGlobalSearch({
          organizationId: 'organization-1',
          userId: 'user-1',
          role: Role.ADMIN,
          term: 'client',
          limit: 20,
          offset,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(
        providerMock.search,
      ).not.toHaveBeenCalled();
    },
  );
});
