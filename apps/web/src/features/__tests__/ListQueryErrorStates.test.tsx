import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

import { ClientsPage } from '../crm/ClientsPage';
import { ProjectsList } from '../projects/ProjectsList';
import { TeamsPage } from '../teams/TeamsPage';
import { UserManagement } from '../users/UserManagement';
import { DocumentsPage } from '../documents/DocumentsPage';
import { api } from '../../lib/api';

/*
 * Regression tests for the read-side fake-empty-state class (Bug #32,
 * extending the Bug #31 tasks-page reference to every remaining list page).
 *
 * These list queries used to surface only `isLoading`, so a rejected GET
 * (500 / network down / expired 401) fell through to the `.length === 0`
 * branch and the UI claimed the user's records were WIPED — "No clients
 * found. Click 'Add Client'", "No projects found", "No users found.", etc.
 * — even nudging users to create duplicates. Every page now renders an
 * honest `role="alert"` failure surface (server message + Retry) BEFORE the
 * empty branch, and the CRM paginators hide while the query is in the
 * failure state.
 */
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Pages with role-gated toolbars read the signed-in user.
vi.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'ADMIN' } }),
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

const rejectWith = (url: string, body: unknown) =>
  mockedGet.mockImplementation((u: string) =>
    u === url
      ? Promise.reject(body)
      : Promise.reject(new Error(`unmocked GET ${u}`)),
  );

describe('List pages — honest read-failure states (Bug #32 class)', () => {
  test('ClientsPage: failed GET shows the server message + Retry, never the "No clients found" lie, and recovers on Retry', async () => {
    rejectWith('/crm/clients', {
      response: { data: { success: false, error: { message: 'Database error' } } },
    });

    const user = userEvent.setup();
    renderPage(<ClientsPage />);

    expect(
      await screen.findByText("We couldn't load your clients"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Database error')).toBeInTheDocument();

    // The misleading branches must NOT render on failure.
    expect(screen.queryByText(/No clients found/)).not.toBeInTheDocument();
    // The paginator must not claim "(0 clients)" while the GET failed.
    expect(screen.queryByText(/Showing page/)).not.toBeInTheDocument();

    // Server recovers — Retry refetches and the table populates.
    mockedGet.mockImplementation((u: string) =>
      u === '/crm/clients'
        ? Promise.resolve({
            data: {
              data: [{ id: 'c1', name: 'Acme Corp', industry: 'Software', email: null, phone: null, status: 'ACTIVE' }],
              total: 1,
            },
          })
        : Promise.reject(new Error(`unmocked GET ${u}`)),
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(
        screen.queryByText("We couldn't load your clients"),
      ).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText(/Showing page/)).toBeInTheDocument();
  });

  test('ProjectsList: failed GET renders the failure panel instead of "No projects found"', async () => {
    rejectWith('/projects', {
      response: { data: { success: false, error: { message: 'Service unavailable' } } },
    });

    renderPage(<ProjectsList />);

    expect(
      await screen.findByText("We couldn't load your projects"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No projects found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('TeamsPage: failed GET renders the failure panel instead of "No teams found"', async () => {
    rejectWith('/teams', {
      response: { data: { success: false, error: { message: 'Database error' } } },
    });

    renderPage(<TeamsPage />);

    expect(
      await screen.findByText("We couldn't load your teams"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('No teams found')).not.toBeInTheDocument();
  });

  test('UserManagement: failed GET renders the failure row instead of "No users found."', async () => {
    rejectWith('/users', {
      response: { data: { success: false, error: { message: 'Forbidden: insufficient permissions' } } },
    });

    renderPage(<UserManagement />);

    expect(
      await screen.findByText("We couldn't load your users"),
    ).toBeInTheDocument();
    expect(screen.getByText('Forbidden: insufficient permissions')).toBeInTheDocument();
    expect(screen.queryByText('No users found.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('DocumentsPage: a bare network error falls back to a safe message instead of "No documents found"', async () => {
    rejectWith('/documents', new Error('Network Error'));

    renderPage(<DocumentsPage />);

    expect(
      await screen.findByText("We couldn't load your documents"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Something went wrong while fetching your documents. Your data is safe — please try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('No documents found')).not.toBeInTheDocument();
  });
});
