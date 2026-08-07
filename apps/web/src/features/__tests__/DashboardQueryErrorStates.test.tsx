import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

import { Dashboard } from '../dashboard/Dashboard';
import { CRMDashboard } from '../crm/CRMDashboard';
import { TeamDashboard } from '../analytics/TeamDashboard';
import { api } from '../../lib/api';

/*
 * Regression tests for the fabricated-zero-metrics class (Bug #34).
 *
 * The three dashboards surfaced only `isLoading`, so rejected widget queries
 * (500 / network down / expired 401) painted authoritative-looking LIES on
 * the most-viewed screens in the app: "Active Projects: 0", "Pipeline
 * Value: $0", "Avg. Win Probability: 0%", "Team Tasks Completed: 0", and
 * "No recent activities found." These tests pin the honest surfaces:
 * "—" unknown markers (never a fabricated 0), `role="alert"` strips with
 * the server's message, and Retry-driven recovery.
 */
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', firstName: 'Riya', role: 'ADMIN' } }),
}));

// The filter widgets (tremor Select/DateRangePicker) are unrelated to this
// bug — stub them out of the TeamDashboard render.
vi.mock('../../components/analytics/FilterPanel', () => ({
  FilterPanel: () => null,
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

describe('Dashboards — honest widget-failure states (Bug #34 class)', () => {
  test('Dashboard: failing tasks/activities widgets show "—" + alert strips instead of fabricated zeros, and stats recover on Retry', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/projects') {
        return Promise.resolve({ data: { data: { projects: [], total: 0 } } });
      }
      if (url === '/tasks') {
        return Promise.reject({
          response: { data: { success: false, error: { message: 'Task service unavailable' } } },
        });
      }
      if (url === '/crm/activities') {
        return Promise.reject(new Error('Network Error'));
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    const user = userEvent.setup();
    renderPage(<Dashboard />);

    // Stat strip with the server's message...
    expect(
      await screen.findByText("We couldn't load your dashboard stats"),
    ).toBeInTheDocument();
    expect(screen.getByText('Task service unavailable')).toBeInTheDocument();

    // ...the two task tiles read "—" (unknown), the two project tiles are
    // allowed to show their REAL zeros.
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getAllByText('0')).toHaveLength(2);

    // The activity feed must not claim "no activity" on failure.
    expect(screen.getByText("We couldn't load recent activity")).toBeInTheDocument();
    expect(
      screen.queryByText('No recent workspace activities logged yet.'),
    ).not.toBeInTheDocument();

    expect(screen.getAllByRole('alert')).toHaveLength(2);

    // The tasks service recovers — Retry on the stat strip repaints real numbers.
    mockedGet.mockImplementation((url: string) => {
      if (url === '/projects') {
        return Promise.resolve({ data: { data: { projects: [], total: 0 } } });
      }
      if (url === '/tasks') {
        return Promise.resolve({
          data: {
            data: [
              { id: 't1', title: 'Done one', status: 'DONE' },
              { id: 't2', title: 'Pending one', status: 'TODO' },
            ],
            meta: { total: 2 },
          },
        });
      }
      return Promise.reject(new Error('Network Error'));
    });

    // The first Retry on screen is the stat strip's (activity block comes later).
    await user.click(screen.getAllByRole('button', { name: 'Retry' })[0]);

    await waitFor(() => {
      expect(
        screen.queryByText("We couldn't load your dashboard stats"),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryAllByText('—')).toHaveLength(0);
    // Real values now: 1 completed, 1 pending (plus 0 active + 0 total projects).
    expect(screen.getAllByText('1')).toHaveLength(2);
    // Activity block is still honestly failing (its own surface, untouched).
    expect(screen.getByText("We couldn't load recent activity")).toBeInTheDocument();
  });

  test('CRMDashboard: a failing opportunities widget shows "—" and never "$0" or "0%", with the server message + Retry', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/crm/clients') {
        return Promise.resolve({ data: { data: [], total: 3 } });
      }
      if (url === '/crm/opportunities') {
        return Promise.reject({
          response: { data: { success: false, error: { message: 'Opportunities service down' } } },
        });
      }
      if (url === '/crm/activities') {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    renderPage(<CRMDashboard />);

    expect(
      await screen.findByText("We couldn't load your CRM stats"),
    ).toBeInTheDocument();
    expect(screen.getByText('Opportunities service down')).toBeInTheDocument();

    // The three opportunity-derived metrics read "—"; Total Clients is a REAL 3.
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.getByText('3')).toBeInTheDocument();

    // The authoritative-looking lies must never render.
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('TeamDashboard: a failing metric query shows "—" + failure strip instead of a fabricated 0', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/analytics/metrics/TASKS_COMPLETED') {
        return Promise.reject({
          response: { data: { success: false, error: { message: 'Analytics error' } } },
        });
      }
      if (url === '/teams') {
        return Promise.resolve({ data: { data: { teams: [] } } });
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    renderPage(<TeamDashboard />);

    expect(
      await screen.findByText("We couldn't load this metric"),
    ).toBeInTheDocument();
    expect(screen.getByText('Analytics error')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
