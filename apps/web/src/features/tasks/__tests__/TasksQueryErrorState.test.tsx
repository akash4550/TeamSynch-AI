import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { TasksPage } from '../TasksPage';
import { api } from '../../../lib/api';

/*
 * Regression tests for the misleading-empty-state fix (Bug #31).
 *
 * The tasks query previously exposed only `isLoading`, so a rejected GET
 * made the kanban view render an EMPTY BOARD and the list view render
 * "No tasks found. Create your first task" — i.e., the UI claimed the
 * user's data was gone when the server had simply failed. These tests pin
 * the honest failure panel (server message + Retry) and recovery.
 */
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TasksPage />
    </QueryClientProvider>,
  );
};

const okProjects = () =>
  Promise.resolve({ data: { data: { projects: [], total: 0 } } });

beforeEach(() => {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/projects') return okProjects();
    if (url === '/tasks') {
      return Promise.reject({
        response: { data: { success: false, error: { message: 'Database error' } } },
      });
    }
    return Promise.reject(new Error(`unmocked GET ${url}`));
  });
});

describe('TasksPage query failure state', () => {
  test('shows an honest failure panel with the server message instead of "No tasks found"', async () => {
    renderPage();

    expect(
      await screen.findByText("We couldn't load your tasks"),
    ).toBeInTheDocument();
    expect(screen.getByText('Database error')).toBeInTheDocument();

    // The misleading branches must NOT render on failure.
    expect(screen.queryByText('No tasks found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('falls back to a safe message when the error has no envelope, and recovers on Retry', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/projects') return okProjects();
      if (url === '/tasks') return Promise.reject(new Error('Network Error'));
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText(
        'Something went wrong while fetching your tasks. Your data is safe — please try again.',
      ),
    ).toBeInTheDocument();

    // Server recovers; Retry refetches and the board populates.
    mockedGet.mockImplementation((url: string) => {
      if (url === '/projects') return okProjects();
      if (url === '/tasks') {
        return Promise.resolve({
          data: {
            data: [
              {
                id: 't1',
                title: 'Recovered task',
                status: 'TODO',
                priority: 'MEDIUM',
                position: 65536,
                project: { key: 'TS' },
                assignee: null,
              },
            ],
            meta: { total: 1 },
          },
        });
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(
        screen.queryByText("We couldn't load your tasks"),
      ).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Recovered task')).toBeInTheDocument();
  });
});
