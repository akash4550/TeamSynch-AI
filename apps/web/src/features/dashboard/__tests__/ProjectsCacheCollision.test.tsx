import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { Dashboard } from '../Dashboard';
import { TasksPage } from '../../tasks/TasksPage';
import { api } from '../../../lib/api';

/*
 * Regression tests for the React Query cache-poisoning bug (Bug #30).
 *
 * Dashboard and TasksPage used to share the bare ['projects'] key with
 * different queryFns and different stored shapes, so mount order decided
 * whether the OTHER page saw malformed data: Dashboard-first emptied
 * TasksPage's project select (task creation became impossible), and
 * TasksPage-first emptied Dashboard's tiles. Both now share the param-aware
 * key ['projects', { limit: 100 }] and one unwrapped `{ projects, total }`
 * shape. These tests seed the shared cache in each shape/order and assert
 * the other consumer still renders correctly.
 *
 * (FEATURE — ledger #6, 2026-08-05: the shared key's limit param moved
 * 100→500 when the aggregate-cap exception list raised both the API
 * ceiling and the consumer fetch; BOTH pages moved in lockstep, so this
 * suite re-pins the shared key to 500 and keeps guarding the
 * one-key/one-shape invariant it was built for.)
 */
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', firstName: 'Jane', role: 'ADMIN' } }),
}));

const mockedGet = vi.mocked(api.get);

// Ledger #6: the shared key mirrors the raised fetch limit (see header).
const SHARED_KEY = ['projects', { limit: 500 }];
const SHARED_PROJECTS = {
  projects: [
    { id: 'proj-1', name: 'Apollo', key: 'AP', status: 'ACTIVE', color: '#3b82f6' },
    { id: 'proj-2', name: 'Zephyr', key: 'ZE', status: 'PLANNING', color: '#10b981' },
  ],
  total: 2,
};

const makeClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

beforeEach(() => {
  mockedGet.mockImplementation((url: string) => {
    switch (true) {
      case url === '/tasks':
        return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
      case url === '/projects':
        return Promise.resolve({ data: { data: SHARED_PROJECTS } });
      case url === '/crm/activities':
        return Promise.resolve({ data: { data: [], total: 0 } });
      default:
        return Promise.resolve({ data: { data: [] } });
    }
  });
});

describe('projects cache sharing between Dashboard and TasksPage', () => {
  test('Dashboard populated the cache first → TasksPage project select still fills', async () => {
    const queryClient = makeClient();
    // Simulate Dashboard having written the key with the shared unwrapped shape.
    queryClient.setQueryData(SHARED_KEY, SHARED_PROJECTS);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TasksPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText('Tasks');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /create task/i }));

    const projectSelect = screen.getByLabelText(/project/i);
    expect(within(projectSelect).getByText('Apollo (AP)')).toBeInTheDocument();
    expect(within(projectSelect).getByText('Zephyr (ZE)')).toBeInTheDocument();
  });

  test('TasksPage populated the cache first → Dashboard tiles still read projects + total', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(SHARED_KEY, SHARED_PROJECTS);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 'Total Projects' reads the shared `total`; 'Active Projects' counts the
    // shared array. The label <p> and value <span> are siblings inside the
    // same wrapper div, so the label's parentElement holds both.
    const totalWrapper = (await screen.findByText('Total Projects'))
      .parentElement as HTMLElement;
    expect(within(totalWrapper).getByText('2')).toBeInTheDocument();

    const activeWrapper = screen.getByText('Active Projects')
      .parentElement as HTMLElement;
    expect(within(activeWrapper).getByText('2')).toBeInTheDocument();
  });
});
