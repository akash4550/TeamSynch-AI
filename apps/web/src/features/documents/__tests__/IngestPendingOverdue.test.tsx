import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

import { DocumentsPage } from '../DocumentsPage';
import { api } from '../../../lib/api';
import { INGEST_PENDING_LIMIT_MS } from '../ingestPolling';

/*
 * BUG FIX (#94 — 2026-08-06): DocumentsPage-level pin for the bounded
 * pending claim. Before the fix, an eligible row whose ingestion job
 * could never land (queue down / attempts exhausted) rendered
 * "Indexing…" forever; the page also polled every 5s forever. Now the
 * badge flips to the honest "Indexing overdue" once the row's
 * server-side pending window (updatedAt) outlives the limit, while a
 * fresh pending row in the SAME list keeps its ledger #15 claim.
 */
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'ADMIN' } }),
}));

const mockedGet = vi.mocked(api.get);

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentsPage />
    </QueryClientProvider>,
  );
};

const pendingRow = (id: string, fileName: string, updatedAt: string) => ({
  id,
  fileName,
  originalName: fileName,
  fileSize: 2048,
  version: 1,
  createdAt: updatedAt,
  updatedAt,
  url: `/uploads/${id}.pdf`,
  ingestStatus: null,
  ingestReason: null,
  ingestedAt: null,
  ingestEligible: true,
});

describe('DocumentsPage — bounded pending claim (BUG FIX #94)', () => {
  test('a stale pending row shows "Indexing overdue"; a fresh one keeps "Indexing…"', async () => {
    const now = Date.now();
    const staleIso = new Date(now - INGEST_PENDING_LIMIT_MS - 60_000).toISOString();
    const freshIso = new Date(now - 5_000).toISOString();

    mockedGet.mockImplementation((url: string) =>
      url === '/documents'
        ? Promise.resolve({
            data: {
              data: [
                pendingRow('d-stale', 'stuck-upload.pdf', staleIso),
                pendingRow('d-fresh', 'just-uploaded.pdf', freshIso),
              ],
              total: 2,
            },
          })
        : Promise.reject(new Error(`unmocked GET ${url}`)),
    );

    renderPage();

    // Both badges render: the stale row admits overdue, the fresh one
    // keeps its honest short-window claim. This pair IS the regression
    // pin — pre-#94 both would have said "Indexing…".
    expect(await screen.findByText('Indexing overdue')).toBeInTheDocument();
    expect(screen.getByText('Indexing…')).toBeInTheDocument();
  });

  test('an aged but TERMINAL row never flips to overdue (terminal truth stands)', async () => {
    const oldIso = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

    mockedGet.mockImplementation((url: string) =>
      url === '/documents'
        ? Promise.resolve({
            data: {
              data: [
                {
                  ...pendingRow('d-old', 'indexed-yesterday.pdf', oldIso),
                  ingestStatus: 'ingested',
                  ingestedAt: oldIso,
                },
              ],
              total: 1,
            },
          })
        : Promise.reject(new Error(`unmocked GET ${url}`)),
    );

    renderPage();

    expect(await screen.findByText('Indexed')).toBeInTheDocument();
    expect(screen.queryByText('Indexing overdue')).not.toBeInTheDocument();
  });
});
