import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

import { PipelineBoard } from '../PipelineBoard';
import { api } from '../../../lib/api';

/*
 * Regression tests for the PipelineBoard failure-deception fixes (Bug #35).
 *
 * 1. Read-side: both board queries surfaced only `isLoading`, so a rejected
 *    GET /crm/pipeline-stages painted "No pipeline stages defined." and a
 *    rejected GET /crm/opportunities painted an empty pipeline (0-deal
 *    columns, "$0" totals, "Drop deal here") — the org's entire sales
 *    process apparently gone when the server had simply failed.
 * 2. Write-side: the drop handler fired PATCH /crm/opportunities/:id with
 *    no onError — a rejected stage move was completely silent, looking like
 *    a frozen app while the board quietly reverted.
 */
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);
const mockedPatch = vi.mocked(api.patch);

const STAGES = [
  { id: 's1', name: 'Prospecting', probability: 10 },
  { id: 's2', name: 'Negotiation', probability: 70 },
];

const OPP = {
  id: 'o1',
  stageId: 's1',
  expectedRevenue: 5000,
  createdAt: '2026-07-01T00:00:00Z',
  lead: { title: 'Acme Deal' },
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PipelineBoard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('PipelineBoard read-failure surfaces', () => {
  test('a failed stages fetch shows the honest panel instead of the "No pipeline stages defined." lie', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/crm/pipeline-stages') {
        return Promise.reject({
          response: { data: { success: false, error: { message: 'Stages service down' } } },
        });
      }
      if (url === '/crm/opportunities') {
        return Promise.resolve({ data: { data: [OPP], total: 1 } });
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    renderPage();

    expect(
      await screen.findByText("We couldn't load your pipeline"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Stages service down')).toBeInTheDocument();
    expect(screen.queryByText('No pipeline stages defined.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('a failed opportunities fetch never paints an empty pipeline, and Retry repaints the real board', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/crm/pipeline-stages') {
        return Promise.resolve({ data: { data: STAGES } });
      }
      if (url === '/crm/opportunities') {
        return Promise.reject(new Error('Network Error'));
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("We couldn't load your pipeline"),
    ).toBeInTheDocument();
    // Bare network error → safe fallback message.
    expect(
      screen.getByText(
        'Something went wrong while fetching your pipeline. Your data is safe — please try again.',
      ),
    ).toBeInTheDocument();

    // No fabricated columns can render while the deals read failed.
    expect(screen.queryByText('Prospecting')).not.toBeInTheDocument();
    expect(screen.queryByText('Drop deal here')).not.toBeInTheDocument();

    // Server recovers — Retry repaints the real columns and the deal card.
    mockedGet.mockImplementation((url: string) => {
      if (url === '/crm/pipeline-stages') {
        return Promise.resolve({ data: { data: STAGES } });
      }
      if (url === '/crm/opportunities') {
        return Promise.resolve({ data: { data: [OPP], total: 1 } });
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(
        screen.queryByText("We couldn't load your pipeline"),
      ).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Acme Deal')).toBeInTheDocument();
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
  });
});

describe('PipelineBoard stage-move failure', () => {
  test('a rejected stage move shows a dismissible banner with the server message and the card stays in place', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/crm/pipeline-stages') {
        return Promise.resolve({ data: { data: STAGES } });
      }
      if (url === '/crm/opportunities') {
        return Promise.resolve({ data: { data: [OPP], total: 1 } });
      }
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });
    mockedPatch.mockRejectedValue({
      response: {
        data: { success: false, error: { message: 'Insufficient permissions for this stage' } },
      },
    });

    const user = userEvent.setup();
    renderPage();

    // Drag the deal from Prospecting onto the Negotiation column.
    const card = await screen.findByText('Acme Deal');
    fireEvent.dragStart(card);
    fireEvent.drop(screen.getByText('Negotiation'));

    // The PATCH went out with the right payload...
    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith(`/crm/opportunities/${OPP.id}`, { stageId: 's2' });
    });

    // ...and its rejection is now SURFACED instead of swallowed.
    expect(
      await screen.findByText('Insufficient permissions for this stage'),
    ).toBeInTheDocument();
    const banner = screen.getByRole('alert');
    expect(banner).toBeInTheDocument();

    // No optimistic phantom: the only card copy is still the server truth.
    expect(screen.getAllByText('Acme Deal')).toHaveLength(1);

    // The banner is dismissible.
    await user.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
