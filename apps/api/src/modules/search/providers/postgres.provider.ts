import { Prisma } from '@prisma/client';
import { PERMISSIONS } from '../../../core/auth/permissions';
import { ROLE_PERMISSIONS } from '../../../core/auth/rolePermissions';
import { prisma } from '../../../config/prisma';
import {
  SearchModule,
  SearchProvider,
  SearchQuery,
  SearchResult,
  SearchResultItem,
} from './search-provider.interface';

const ALL_SEARCH_MODULES: SearchModule[] = [
  'projects',
  'tasks',
  'crm',
  'documents',
];

export class PostgresSearchProvider implements SearchProvider {
  readonly name = 'postgres';

  async search(query: SearchQuery): Promise<SearchResult> {
    const { organizationId, role, term, modules, limit, offset } = query;

    if (!organizationId) {
      throw new Error('Search requires tenant isolation');
    }

    const permissions = ROLE_PERMISSIONS[role] || [];

    const allowedModules = ALL_SEARCH_MODULES.filter((module) => {
      switch (module) {
        case 'projects':
          return permissions.includes(PERMISSIONS.PROJECT.READ);
        case 'tasks':
          return permissions.includes(PERMISSIONS.TASK.READ);
        case 'crm':
          return permissions.includes(PERMISSIONS.CRM.READ);
        case 'documents':
          return permissions.includes(PERMISSIONS.DOCUMENT.READ);
        default:
          return false;
      }
    });

    const requestedModules = modules ?? allowedModules;
    const searchableModules = requestedModules.filter((m) => allowedModules.includes(m));
    const queryLimit = offset + limit;
    const searches: Promise<SearchResultItem[]>[] = [];

    const formattedTerm = term.trim().replace(/'/g, "''");

    // Native PostgreSQL Full-Text Search using websearch_to_tsquery
    if (searchableModules.includes('projects')) {
      searches.push(
        prisma.$queryRaw<any[]>`
          SELECT id, name AS title, COALESCE(description, '') AS description,
                 ts_rank(to_tsvector('english', name || ' ' || COALESCE(description, '')), websearch_to_tsquery('english', ${formattedTerm})) AS score
          FROM "Project"
          WHERE "organizationId" = ${organizationId}
            AND "deletedAt" IS NULL
            AND (
              to_tsvector('english', name || ' ' || COALESCE(description, '')) @@ websearch_to_tsquery('english', ${formattedTerm})
              OR name ILIKE ${'%' + formattedTerm + '%'}
            )
          ORDER BY score DESC
          LIMIT ${queryLimit}
        `.then((results) =>
          results.map((r) => ({
            id: r.id,
            module: 'projects',
            title: r.title,
            description: r.description.substring(0, 100),
            url: `/projects`,
            score: Number(r.score) || 0.5,
          }))
        )
      );
    }

    if (searchableModules.includes('tasks')) {
      searches.push(
        prisma.$queryRaw<any[]>`
          SELECT id, title, COALESCE(description, '') AS description,
                 ts_rank(to_tsvector('english', title || ' ' || COALESCE(description, '')), websearch_to_tsquery('english', ${formattedTerm})) AS score
          FROM "Task"
          WHERE "organizationId" = ${organizationId}
            AND "deletedAt" IS NULL
            AND (
              to_tsvector('english', title || ' ' || COALESCE(description, '')) @@ websearch_to_tsquery('english', ${formattedTerm})
              OR title ILIKE ${'%' + formattedTerm + '%'}
            )
          ORDER BY score DESC
          LIMIT ${queryLimit}
        `.then((results) =>
          results.map((r) => ({
            id: r.id,
            module: 'tasks',
            title: r.title,
            description: r.description.substring(0, 100),
            url: `/tasks`,
            score: Number(r.score) || 0.5,
          }))
        )
      );
    }

    if (searchableModules.includes('crm')) {
      searches.push(
        prisma.$queryRaw<any[]>`
          SELECT id, name AS title, COALESCE(industry, 'Client') AS description,
                 ts_rank(to_tsvector('english', name || ' ' || COALESCE(industry, '')), websearch_to_tsquery('english', ${formattedTerm})) AS score
          FROM "Client"
          WHERE "organizationId" = ${organizationId}
            AND "deletedAt" IS NULL
            AND (
              to_tsvector('english', name || ' ' || COALESCE(industry, '')) @@ websearch_to_tsquery('english', ${formattedTerm})
              OR name ILIKE ${'%' + formattedTerm + '%'}
            )
          ORDER BY score DESC
          LIMIT ${queryLimit}
        `.then((results) =>
          results.map((r) => ({
            id: r.id,
            module: 'crm',
            title: r.title,
            description: `Client in ${r.description}`,
            url: `/crm/clients/${r.id}`,
            score: Number(r.score) || 0.5,
          }))
        )
      );
    }

    if (searchableModules.includes('documents')) {
      searches.push(
        prisma.$queryRaw<any[]>`
          SELECT id, "fileName" AS title, "storageProvider" AS description,
                 ts_rank(to_tsvector('english', "fileName" || ' ' || "originalName"), websearch_to_tsquery('english', ${formattedTerm})) AS score
          FROM "Document"
          WHERE "organizationId" = ${organizationId}
            AND "deletedAt" IS NULL
            AND (
              to_tsvector('english', "fileName" || ' ' || "originalName") @@ websearch_to_tsquery('english', ${formattedTerm})
              OR "fileName" ILIKE ${'%' + formattedTerm + '%'}
            )
          ORDER BY score DESC
          LIMIT ${queryLimit}
        `.then((results) =>
          results.map((r) => ({
            id: r.id,
            module: 'documents',
            title: r.title,
            description: `Document file (${r.description})`,
            url: `/documents`,
            score: Number(r.score) || 0.5,
          }))
        )
      );
    }

    const resultGroups = await Promise.all(searches);
    const items = resultGroups.flat();

    const sortedItems = items
      .sort((left, right) => right.score - left.score)
      .slice(offset, offset + limit);

    return {
      total: items.length,
      items: sortedItems,
    };
  }
}
