import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

import { CalendarPage } from '../calendar/CalendarPage';
import { GlobalSearchOverlay } from '../search/GlobalSearchOverlay';
import { api } from '../../lib/api';

/*
 * Regression tests for the last two read-lies (Bug #40 class).
 *
 * - CalendarPage: a rejected GET /calendar painted a COMPLETELY EMPTY month
 *   grid — telling the user they had no deadlines this month when the feed
 *   had simply failed. A scheduling surface that lies costs real deadlines.
 * - GlobalSearchOverlay (⌘K): a rejected GET /search fell through to an
 *   EMPTY list pane with zero feedback (its "No results" branch requires
 *   `items.length === 0`, which an undefined payload never satisfies).
 */
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);

const renderPage = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('CalendarPage read-failure surface', () => {
  test('a failed feed shows the honest panel instead of an empty month, and recovers on Retry', async () => {
    mockedGet.mockImplementation((url: string) =>
      url === '/calendar'
        ? Promise.reject({
            response: { data: { success: false, error: { message: 'Calendar service down' } } },
          })
        : Promise.reject(new Error(`unmocked GET ${url}`)),
    );

    const user = userEvent.setup();
    renderPage(<CalendarPage />);

    expect(
      await screen.findByText("We couldn't load your calendar"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Calendar service down')).toBeInTheDocument();

    // The empty-month lie must not render: no day headers at all.
    expect(screen.queryByText('SUN')).not.toBeInTheDocument();

    // Server recovers — Retry repaints the real grid.
    mockedGet.mockImplementation((url: string) =>
      url === '/calendar'
        ? Promise.resolve({ data: { data: { tasks: [], projects: [] } } })
        : Promise.reject(new Error(`unmocked GET ${url}`)),
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(
        screen.queryByText("We couldn't load your calendar"),
      ).not.toBeInTheDocument();
    });
    expect(await screen.findByText('SUN')).toBeInTheDocument();
  });
});

describe('GlobalSearchOverlay read-failure surface', () => {
  test('a failed search shows the failure pane instead of a silent blank list', async () => {
    mockedGet.mockImplementation((url: string) =>
      url.startsWith('/search')
        ? Promise.reject({
            response: { data: { success: false, error: { message: 'Index error' } } },
          })
        : Promise.reject(new Error(`unmocked GET ${url}`)),
    );

    const user = userEvent.setup();
    renderPage(<GlobalSearchOverlay isOpen onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/search/i), 'acme');

    // Debounce is 300ms — allow it within the default find timeout.
    const pane = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(pane).toHaveTextContent('Search failed');
    expect(screen.getByText('Index error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry search' })).toBeInTheDocument();
    expect(screen.queryByText(/No results found for/)).not.toBeInTheDocument();
  });

  test('a real empty result still says "No results found" (failure branch does not swallow the honest empty state)', async () => {
    mockedGet.mockImplementation((url: string) =>
      url.startsWith('/search')
        ? Promise.resolve({ data: { data: { total: 0, items: [] } } })
        : Promise.reject(new Error(`unmocked GET ${url}`)),
    );

    const user = userEvent.setup();
    renderPage(<GlobalSearchOverlay isOpen onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/search/i), 'acme');

    expect(
      await screen.findByText(/No results found for/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
