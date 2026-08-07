import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

import { AuditLogViewerPage } from '../system/AuditLogViewerPage';
import { JobsDashboard } from '../system/JobsDashboard';
import { SearchResultsPage } from '../search/SearchResultsPage';
import { api } from '../../lib/api';

/*
 * Regression tests for the final read-lie surfaces (Bug #37 class).
 *
 * - AuditLogViewerPage: a rejected GET /audit/logs claimed "No security
 *   activity records found." — the gravest fabrication a compliance
 *   surface can make.
 * - JobsDashboard: a rejected GET /jobs/status rendered a totally BLANK
 *   grid (a monitoring screen with zero signal), and a rejected
 *   GET /jobs/failed/:queue claimed "No failed jobs found." — the jobs
 *   controller also answers its own 404s with plain `{ message }` instead
 *   of the shared envelope, so the reader must accept both shapes.
 * - SearchResultsPage: a rejected GET /search claimed "No results found —
 *   Try adjusting your search term", i.e. the workspace appears empty when
 *   the search call simply failed.
 */
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// AuditLogViewerPage subscribes to socket events for async exports.
vi.mock('../../providers/SocketProvider', () => ({
  useSocket: () => ({ socket: null }),
}));

const mockedGet = vi.mocked(api.get);

const renderPage = (ui: React.ReactElement, route = '/') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('System & search surfaces — honest read-failure states (Bug #37)', () => {
  test('AuditLogViewerPage: a failed audit read shows the alert row instead of "No security activity records found."', async () => {
    mockedGet.mockImplementation((url: string) =>
      url === '/audit/logs'
        ? Promise.reject({
            response: { data: { success: false, error: { message: 'Audit service unavailable' } } },
          })
        : Promise.reject(new Error(`unmocked GET ${url}`)),
    );

    renderPage(<AuditLogViewerPage />);

    expect(
      await screen.findByText("We couldn't load the audit trail"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Audit service unavailable')).toBeInTheDocument();
    expect(
      screen.queryByText('No security activity records found.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('JobsDashboard: a failed queue-status read shows the failure panel instead of a blank grid', async () => {
    mockedGet.mockImplementation((url: string) =>
      url === '/jobs/status'
        ? Promise.reject({
            response: { data: { success: false, error: { message: 'Redis connection lost' } } },
          })
        : Promise.reject(new Error(`unmocked GET ${url}`)),
    );

    renderPage(<JobsDashboard />);

    expect(
      await screen.findByText("We couldn't load the job queues"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Redis connection lost')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('JobsDashboard failed-jobs: the deviant plain { message } 404 shape is surfaced (dual-shape reader), never "No failed jobs found."', async () => {
    const user = userEvent.setup();

    mockedGet.mockImplementation((url: string) => {
      if (url === '/jobs/status') {
        return Promise.resolve({
          data: {
            data: [
              { name: 'main', counts: { waiting: 0, active: 1, completed: 5, failed: 2 } },
            ],
          },
        });
      }
      if (url === '/jobs/failed/main') {
        // The jobs controller replies to unknown/missing queues with the
        // PLAIN `{ message }` shape — not the shared envelope.
        return Promise.reject({
          response: { status: 404, data: { message: 'Queue not found' } },
        });
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    renderPage(<JobsDashboard />);

    await user.click(await screen.findByRole('button', { name: 'View Failed' }));

    expect(
      await screen.findByText("We couldn't load the failed jobs"),
    ).toBeInTheDocument();
    expect(screen.getByText('Queue not found')).toBeInTheDocument();
    expect(screen.queryByText('No failed jobs found.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('SearchResultsPage: a failed search shows "Search failed" with the server message instead of "No results found"', async () => {
    mockedGet.mockImplementation((url: string) =>
      url.startsWith('/search')
        ? Promise.reject({
            response: { data: { success: false, error: { message: 'Index error' } } },
          })
        : Promise.reject(new Error(`unmocked GET ${url}`)),
    );

    renderPage(<SearchResultsPage />, '/search?q=acme');

    expect(await screen.findByText('Search failed')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Index error')).toBeInTheDocument();
    expect(screen.queryByText('No results found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry search' })).toBeInTheDocument();
  });
});

/*
 * BUG FIX (#100, 2026-08-06): the audit viewer's IP column rendered the
 * hardcoded string '127.0.0.1' for every row whose ActivityLog.ipAddress
 * is null — and no producer writes that field today, so effectively EVERY
 * row displayed a fabricated localhost origin while the CSV export of the
 * same rows printed an honest empty cell. These pins hold the new
 * contract: null ip → '—' (with no '127.0.0.1' anywhere), real ip →
 * rendered verbatim.
 */
describe('AuditLogViewerPage — IP cell honesty (Bug #100)', () => {
  const auditRow = (overrides: Record<string, unknown>) => ({
    id: 'log-1',
    organizationId: 'org-1',
    userId: 'user-1',
    type: 'UPDATE',
    entityType: 'TASK',
    entityId: 'abcd1234-task-id',
    createdAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-08-06T10:00:00.000Z',
    user: { id: 'user-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
    ...overrides,
  });

  const mockAuditLogsSuccess = (rows: unknown[]) => {
    mockedGet.mockImplementation((url: string) =>
      url === '/audit/logs'
        ? Promise.resolve({
            data: { data: { data: rows, nextCursor: null, hasMore: false } },
          })
        : Promise.reject(new Error(`unmocked GET ${url}`)),
    );
  };

  test('a row with no recorded IP renders an em-dash and NEVER the fabricated 127.0.0.1', async () => {
    mockAuditLogsSuccess([auditRow({ ipAddress: null })]);

    renderPage(<AuditLogViewerPage />);

    expect(await screen.findByText('—')).toBeInTheDocument();
    expect(screen.queryByText('127.0.0.1')).not.toBeInTheDocument();
  });

  test('a row WITH a recorded IP still renders it verbatim', async () => {
    mockAuditLogsSuccess([auditRow({ ipAddress: '203.0.113.7' })]);

    renderPage(<AuditLogViewerPage />);

    expect(await screen.findByText('203.0.113.7')).toBeInTheDocument();
    expect(screen.queryByText('127.0.0.1')).not.toBeInTheDocument();
  });
});
