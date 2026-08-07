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

  /*
   * BUG FIX (#73 — unstable page boundaries on tied timestamps): both call
   * sites (audit trail, task list) order by `createdAt desc` ONLY. SQL
   * gives no stable order for rows sharing a createdAt (bulk imports,
   * seeds, bursty writes hit the same millisecond), so between page
   * queries the cursor row's position among its tied siblings shifts and
   * `skip: 1` lands on the wrong row — pages then DUPLICATE some rows and
   * silently DROP others. Prisma cursor pagination is only deterministic
   * with a total ordering, so an `id` tie-breaker is appended to whatever
   * orderBy the caller passes (no-op if the caller already orders by id).
   * Order direction of the tie-breaker is irrelevant to correctness — it
   * only needs to make the sort total — and the row SET returned is
   * unchanged, so this is strictly a determinism fix.
   */
  const orderByArray: any[] = args.orderBy
    ? Array.isArray(args.orderBy)
      ? [...args.orderBy]
      : [args.orderBy]
    : [];
  if (
    !orderByArray.some(
      entry => entry && typeof entry === 'object' && 'id' in entry
    )
  ) {
    orderByArray.push({ id: 'desc' });
  }

  const queryArgs: any = {
    ...args,
    orderBy: orderByArray,
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
