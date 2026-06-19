export interface CursorPaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CursorPaginationOptions {
  cursor?: string;
  limit?: number;
}

export async function executeCursorQuery<T extends { id: string }>(
  delegate: {
    findMany: (args: any) => Promise<T[]>;
  },
  args: {
    where: any;
    orderBy?: any;
    include?: any;
    select?: any;
  },
  options: CursorPaginationOptions
): Promise<CursorPaginatedResult<T>> {
  const limit = Math.min(Math.max(options.limit || 20, 1), 100);
  const cursor = options.cursor;

  const queryArgs: any = {
    ...args,
    take: limit + 1,
  };

  if (cursor) {
    queryArgs.cursor = { id: cursor };
    queryArgs.skip = 1; // Skip the cursor element itself
  }

  const results = await delegate.findMany(queryArgs);
  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

  return {
    data,
    nextCursor,
    hasMore,
  };
}
