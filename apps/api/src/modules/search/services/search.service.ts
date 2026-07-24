import { PERMISSIONS, Permission } from '../../../core/auth/permissions';
import { ROLE_PERMISSIONS } from '../../../core/auth/rolePermissions';
import { AppError } from '../../../core/errors/AppError';
import { PostgresSearchProvider } from '../providers/postgres.provider';
import {
  SearchModule,
  SearchProvider,
  SearchQuery,
  SearchResult,
} from '../providers/search-provider.interface';

const MODULE_PERMISSIONS: Record<
  SearchModule,
  Permission
> = {
  projects: PERMISSIONS.PROJECT.READ,
  tasks: PERMISSIONS.TASK.READ,
  crm: PERMISSIONS.CRM.READ,
  documents: PERMISSIONS.DOCUMENT.READ,
};

const ALL_SEARCH_MODULES = Object.keys(
  MODULE_PERMISSIONS,
) as SearchModule[];

export class SearchService {
  private readonly provider: SearchProvider;

  constructor(
    provider: SearchProvider =
      new PostgresSearchProvider(),
  ) {
    this.provider = provider;
  }

  async performGlobalSearch(
    query: SearchQuery,
  ): Promise<SearchResult> {
    if (!query.organizationId) {
      throw new AppError(
        'Organization context is required for search',
        400,
      );
    }

    if (!query.userId) {
      throw new AppError(
        'User context is required for search',
        400,
      );
    }

    const term = query.term.trim();

    if (term.length < 2 || term.length > 100) {
      throw new AppError(
        'Search term must contain between 2 and 100 characters',
        400,
      );
    }

    if (
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 50
    ) {
      throw new AppError(
        'Search limit must be an integer between 1 and 50',
        400,
      );
    }

    if (
      !Number.isInteger(query.offset) ||
      query.offset < 0 ||
      query.offset > 1000
    ) {
      throw new AppError(
        'Search offset must be an integer between 0 and 1000',
        400,
      );
    }

    const permissions =
      ROLE_PERMISSIONS[query.role] || [];

    const allowedModules =
      ALL_SEARCH_MODULES.filter((module) =>
        permissions.includes(
          MODULE_PERMISSIONS[module],
        ),
      );

    const requestedModules =
      query.modules ?? allowedModules;

    const forbiddenModule =
      requestedModules.find(
        (module) =>
          !allowedModules.includes(module),
      );

    if (forbiddenModule) {
      throw new AppError(
        `Forbidden - Missing permission to search ${forbiddenModule}`,
        403,
      );
    }

    return this.provider.search({
      ...query,
      term,
      modules: requestedModules,
    });
  }
}
