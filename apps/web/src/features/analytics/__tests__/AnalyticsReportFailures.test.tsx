import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

import { ExecutiveDashboard } from '../ExecutiveDashboard';
import { ProjectDashboard } from '../ProjectDashboard';
import { AnalyticsCRMOverview } from '../AnalyticsCRMOverview';
import { api } from '../../../lib/api';

/*
 * Regression tests for the /analytics report-fabrication cluster (Bug #41).
 *
 * All three analytics tabs queried their report bundles with only
 * `isLoading`, and `getMetricValue` defaulted to 0 on a missing payload —
 * so a rejected GET /analytics/reports/* painted authoritative all-zero
 * boards: "Active Users: 0", "Pipeline Value: $0", "Win Rate: 0%",
 * "0 tasks are currently overdue", and a chart claiming "No data
 * available." — when the server had simply failed. These tests pin the
 * honest surfaces: "—" unknown markers, one `role="alert"` strip per tab
 * (server message + Retry), the gated chart/overdue section, and recovery.
 */
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// tremor date/select widgets are unrelated to this bug (same stub as the
// Bug #34 dashboard tests).
vi.mock('../../../components/analytics/FilterPanel', () => ({
  FilterPanel: () => null,
}));

const mockedGet = vi.mocked(api.get);

const renderPage = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

const rejectReport = (type: string, message: string) =>
  mockedGet.mockImplementation((url: string) =>
    url === `/analytics/reports/${type}`
      ? Promise.reject({
          response: { data: { success: false, error: { message } } },
        })
      : Promise.reject(new Error(`unmocked GET ${url}`)),
  );

describe('/analytics report-failure surfaces (Bug #41)', () => {
  test('ExecutiveDashboard: a failed report shows the strip and "—" cards instead of fabricated zeros', async () => {
    rejectReport('EXECUTIVE_SUMMARY', 'Report engine unavailable');

    renderPage(<ExecutiveDashboard />);

    expect(
      await screen.findByText("We couldn't load this report"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Report engine unavailable')).toBeInTheDocument();

    // All four cards read "—" (unknown); no fabricated zero can render.
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.queryByText('0')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('ProjectDashboard: a failed report hides the chart/overdue fabrications and shows "—" cards', async () => {
    rejectReport('PROJECT_HEALTH', 'Project metrics failed');

    renderPage(<ProjectDashboard />);

    expect(
      await screen.findByText("We couldn't load this report"),
    ).toBeInTheDocument();
    expect(screen.getByText('Project metrics failed')).toBeInTheDocument();

    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();

    // The gated lower section must not paint its lies.
    expect(screen.queryByText('No data available.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('tasks are currently overdue'),
    ).not.toBeInTheDocument();
  });

  test('AnalyticsCRMOverview: a failed report shows "—", never "$0"/"0%", and recovers on Retry', async () => {
    rejectReport('CRM_OVERVIEW', 'CRM report engine down');

    const user = userEvent.setup();
    renderPage(<AnalyticsCRMOverview />);

    expect(
      await screen.findByText("We couldn't load this report"),
    ).toBeInTheDocument();
    expect(screen.getByText('CRM report engine down')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();

    // The report service recovers — Retry repaints real numbers.
    mockedGet.mockImplementation((url: string) =>
      url === '/analytics/reports/CRM_OVERVIEW'
        ? Promise.resolve({
            data: {
              data: {
                results: [
                  { name: 'Leads Created', value: 7 },
                  { name: 'Pipeline Value', value: 42000 },
                  { name: 'Win Rate', value: 33 },
                ],
                generatedAt: '2026-08-04T10:00:00Z',
              },
            },
          })
        : Promise.reject(new Error(`unmocked GET ${url}`)),
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(
        screen.queryByText("We couldn't load this report"),
      ).not.toBeInTheDocument();
    });
    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(screen.getByText('$42,000')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
  });
});
