/*
 * BUG FIX (#112, 2026-08-06) pins — GET /documents query validation:
 * garbage sort/page params now answer an honest 400-class ZodError
 * (errorMiddleware maps it — its own comment cites this module's
 * self-validation pattern), the limit is capped against unbounded takes,
 * and the live web client's EXACT request (search='' on first render,
 * page/limit numbers serialized by axios as strings) must keep passing.
 */
import { ZodError } from 'zod';
import { listDocumentsQuerySchema } from '../document.validator';

describe('listDocumentsQuerySchema (BUG FIX #112)', () => {
  it('fills all defaults for a bare request ({} → page 1, limit 10, createdAt desc)', () => {
    expect(listDocumentsQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('preserves the live DocumentsPage contract: search="" + axios-serialized numbers', () => {
    // The page renders its first load with an empty search box; axios
    // serializes page/limit as strings. This exact payload must NOT 400.
    const parsed = listDocumentsQuerySchema.parse({
      search: '',
      page: '1',
      limit: '12',
    });
    expect(parsed).toEqual({
      page: 1,
      limit: 12,
      search: '',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    // '' stays falsy for the repository's `search ? {...} : {}` guard.
    expect(Boolean(parsed.search)).toBe(false);
  });

  it('coerces string numerics and accepts the full valid domain', () => {
    const parsed = listDocumentsQuerySchema.parse({
      page: '3',
      limit: '50',
      search: '  contract  ',
      projectId: '11111111-1111-4111-8111-111111111111',
      taskId: '22222222-2222-4222-8222-222222222222',
      sortBy: 'fileSize',
      sortOrder: 'asc',
    });
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(50);
    expect(parsed.search).toBe('contract');
    expect(parsed.sortBy).toBe('fileSize');
    expect(parsed.sortOrder).toBe('asc');
  });

  it('rejects a garbage sortBy (was: PrismaClientValidationError → opaque 500)', () => {
    expect(() =>
      listDocumentsQuerySchema.parse({ sortBy: 'not_a_column' }),
    ).toThrow(ZodError);
  });

  it('rejects a garbage sortOrder', () => {
    expect(() =>
      listDocumentsQuerySchema.parse({ sortOrder: 'sideways' }),
    ).toThrow(ZodError);
  });

  it('rejects non-numeric page/limit (was: NaN skip/take → opaque 500)', () => {
    expect(() => listDocumentsQuerySchema.parse({ page: 'abc' })).toThrow(
      ZodError,
    );
    expect(() => listDocumentsQuerySchema.parse({ limit: 'abc' })).toThrow(
      ZodError,
    );
  });

  it('caps the limit at 100 (was: unbounded take = read-amplification lever)', () => {
    expect(() =>
      listDocumentsQuerySchema.parse({ limit: '99999999' }),
    ).toThrow(ZodError);
    expect(listDocumentsQuerySchema.parse({ limit: '100' }).limit).toBe(100);
  });

  it('rejects non-positive page/limit', () => {
    expect(() => listDocumentsQuerySchema.parse({ page: '0' })).toThrow(
      ZodError,
    );
    expect(() => listDocumentsQuerySchema.parse({ limit: '-5' })).toThrow(
      ZodError,
    );
  });

  it('rejects non-uuid projectId/taskId instead of letting Prisma 500', () => {
    expect(() =>
      listDocumentsQuerySchema.parse({ projectId: 'not-a-uuid' }),
    ).toThrow(ZodError);
    expect(() =>
      listDocumentsQuerySchema.parse({ taskId: 'not-a-uuid' }),
    ).toThrow(ZodError);
  });
});
