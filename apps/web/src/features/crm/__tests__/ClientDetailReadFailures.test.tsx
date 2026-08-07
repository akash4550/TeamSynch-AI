import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

import { ClientDetailPage } from '../ClientDetailPage';
import { api } from '../../../lib/api';

/*
 * Regression tests for the ClientDetailPage read-failure fixes (Bug #36).
 *
 * The page gated on `isLoading` + `if (!client)` only, so EVERY failure
 * shape (500 / network down / expired 401) fell into "Client not found." —
 * claiming the record was deleted when the server had simply erred. The
 * activity query likewise collapsed failure into "No activity logged yet."
 * These tests pin the status-aware surfaces: legacy not-found UI ONLY for
 * real 404s, an honest full-width panel (server message + Retry) otherwise,
 * and the Activity History failure block.
 */
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ id: 'client-1' }),
  };
});

const mockedGet = vi.mocked(api.get);

const CLIENT = {
  id: 'client-1',
  name: 'Acme Corp',
  status: 'ACTIVE',
  industry: 'Software',
  email: null,
  phone: null,
};

const okClient = () =>
  Promise.resolve({ data: { data: CLIENT } });

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClientDetailPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('ClientDetailPage read-failure surfaces', () => {
  test('a 500 on the client fetch shows the honest panel, never "Client not found.", and recovers on Retry', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/crm/clients/client-1') {
        return Promise.reject({
          response: { data: { success: false, error: { message: 'Database error' } } },
        });
      }
      if (url === '/crm/activities') {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("We couldn't load this client"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Database error')).toBeInTheDocument();

    // The record-deletion lie must not render on a mere server failure.
    expect(screen.queryByText('Client not found.')).not.toBeInTheDocument();

    // Server recovers — Retry repaints the real record.
    mockedGet.mockImplementation((url: string) => {
      if (url === '/crm/clients/client-1') return okClient();
      if (url === '/crm/activities') {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(
        screen.queryByText("We couldn't load this client"),
      ).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
  });

  test('a real 404 keeps the legacy "Client not found." UI (no false alert panel)', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/crm/clients/client-1') {
        return Promise.reject({
          response: {
            status: 404,
            data: { success: false, error: { message: 'Client not found' } },
          },
        });
      }
      if (url === '/crm/activities') {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    renderPage();

    expect(await screen.findByText('Client not found.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Back to Clients' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByText("We couldn't load this client"),
    ).not.toBeInTheDocument();
  });

  test('a failed activities fetch shows the card-level failure block instead of "No activity logged yet."', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/crm/clients/client-1') return okClient();
      if (url === '/crm/activities') {
        return Promise.reject({
          response: {
            data: { success: false, error: { message: 'Activity service down' } },
          },
        });
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    renderPage();

    expect(
      await screen.findByText("We couldn't load the activity history"),
    ).toBeInTheDocument();
    expect(screen.getByText('Activity service down')).toBeInTheDocument();
    expect(screen.queryByText('No activity logged yet.')).not.toBeInTheDocument();

    // The client record itself still renders — only the card failed.
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });
});
