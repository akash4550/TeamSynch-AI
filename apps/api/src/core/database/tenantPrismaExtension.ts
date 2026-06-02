import { Prisma } from '@prisma/client';

/**
 * Prisma Client Extension that automatically injects `deletedAt: null`
 * on findFirst, findMany, and count operations for soft-deletable models.
 */
export const createTenantSoftDeleteExtension = () => {
  return Prisma.defineExtension({
    name: 'tenantSoftDeleteExtension',
    query: {
      $allModels: {
        async findFirst({ model, operation, args, query }) {
          if ('deletedAt' in (args.where || {})) {
            return query(args);
          }
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findMany({ model, operation, args, query }) {
          if (args.where && 'deletedAt' in args.where) {
            return query(args);
          }
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async count({ model, operation, args, query }) {
          if (args.where && 'deletedAt' in args.where) {
            return query(args);
          }
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
      },
    },
  });
};
