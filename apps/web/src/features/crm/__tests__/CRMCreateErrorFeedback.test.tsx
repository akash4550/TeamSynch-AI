import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ClientsPage } from '../ClientsPage';
import { ClientDetailPage } from '../ClientDetailPage';
import { api } from '../../../lib/api';

/*
 * Regression tests for the CRM silent-create-failure class (Bug #27).
 *
 * All CRM create mutations (clients/contacts/leads/opportunities + client
 * activity log) used to pass only onSuccess, so any server rejection left
 * the form frozen with zero feedback. These tests pin the inline error
 * behavior on two representative form shapes (modal + inline form).
 */
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
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
const mockedPost = vi.mocked(api.post);

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

beforeEach(() => {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/crm/clients/client-1') {
      return Promise.resolve({
        data: {
          data: { id: 'client-1', name: 'Acme Corp', status: 'ACTIVE', industry: 'Software' },
        },
      });
    }
    // list endpoints: clients + activities
    return Promise.resolve({ data: { data: [], total: 0 } });
  });
});

describe('ClientsPage create form error feedback', () => {
  test('renders the server error message as text when the create is rejected', async () => {
    mockedPost.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { message: 'Duplicate record' },
        },
      },
    });

    const user = userEvent.setup();
    renderPage(<ClientsPage />);

    await screen.findByText('Clients');
    await user.click(screen.getByRole('button', { name: /add client/i }));
    await user.type(screen.getByPlaceholderText('Acme Corp'), 'Acme Corp');
    await user.click(screen.getByRole('button', { name: /save client/i }));

    expect(await screen.findByText('Duplicate record')).toBeInTheDocument();
    // The modal stays open so the admin sees the failure.
    expect(screen.getByPlaceholderText('Acme Corp')).toBeInTheDocument();
  });

  test('posts the payload and closes the modal on success', async () => {
    mockedPost.mockResolvedValue({ data: { data: { id: 'new-1' } } });

    const user = userEvent.setup();
    renderPage(<ClientsPage />);

    await screen.findByText('Clients');
    await user.click(screen.getByRole('button', { name: /add client/i }));
    await user.type(screen.getByPlaceholderText('Acme Corp'), 'Beta LLC');
    await user.click(screen.getByRole('button', { name: /save client/i }));

    expect(mockedPost).toHaveBeenCalledWith(
      '/crm/clients',
      expect.objectContaining({ name: 'Beta LLC' }),
    );
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Acme Corp')).not.toBeInTheDocument();
    });
  });
});

describe('ClientDetailPage activity form error feedback', () => {
  test('renders the server error message as text when logging an activity fails', async () => {
    mockedPost.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { message: 'Activity content is required' },
        },
      },
    });

    const user = userEvent.setup();
    renderPage(<ClientDetailPage />);

    await screen.findByText('Acme Corp');
    await user.type(
      screen.getByPlaceholderText('Log activity details or notes...'),
      'Kickoff call notes',
    );
    await user.click(screen.getByRole('button', { name: /save activity/i }));

    expect(
      await screen.findByText('Activity content is required'),
    ).toBeInTheDocument();
  });
});
