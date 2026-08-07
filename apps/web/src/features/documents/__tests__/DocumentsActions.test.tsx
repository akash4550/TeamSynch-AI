import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { DocumentsPage } from '../DocumentsPage';
import { api } from '../../../lib/api';

/*
 * Regression tests for the DocumentsPage action surface (Bug #39).
 *
 * 1. Upload failures used to show a blocking `alert('Upload failed')`,
 *    discarding the server envelope message — now the dismissible banner
 *    carries the real reason and no native alert fires.
 * 2. The kebab (MoreVertical) buttons in both grid and list views had no
 *    onClick and no menu at all — 100% dead controls; document deletion was
 *    impossible from the UI despite DELETE /documents/:id existing. The
 *    kebab now opens a menu with a confirm dialog, and the control is
 *    admin-gated (server grants document:delete to ADMIN/SUPER_ADMIN only).
 */
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const authState = vi.hoisted(() => ({ role: 'ADMIN' }));
vi.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', role: authState.role } }),
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);
const mockedDelete = vi.mocked(api.delete);

const DOC = {
  id: 'd1',
  fileName: 'contract.pdf',
  fileSize: 2048,
  version: 1,
  createdAt: '2026-07-15T00:00:00Z',
  url: '/uploads/doc_d1.pdf',
};

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

beforeEach(() => {
  authState.role = 'ADMIN';
  mockedGet.mockResolvedValue({ data: { data: [DOC], total: 1 } });
});

describe('DocumentsPage upload feedback', () => {
  test('a failed upload shows the server message in a banner and never calls window.alert', async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);

    mockedPost.mockRejectedValue({
      response: {
        data: { success: false, error: { message: 'File exceeds the 25MB limit' } },
      },
    });

    const user = userEvent.setup();
    const { container } = renderPage();
    await screen.findByText('contract.pdf');

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'huge.zip', { type: 'application/zip' }));

    // Server reason reaches the user via the banner...
    expect(await screen.findByText('File exceeds the 25MB limit')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // ...and NO native blocking dialog fires. Also no console.error dump.
    expect(alertSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe('DocumentsPage kebab menu and delete flow', () => {
  test('the kebab opens a menu, and confirming the dialog issues DELETE /documents/:id', async () => {
    mockedDelete.mockResolvedValue({ data: { success: true } });

    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Actions for contract.pdf' }),
    );
    await user.click(screen.getByRole('button', { name: /Delete/ }));

    // The irreversible-action dialog asks first...
    expect(await screen.findByText('Delete Document')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Permanently' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Permanently' }));

    // ...then issues the real DELETE and closes.
    await waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith('/documents/d1');
    });
    await waitFor(() => {
      expect(screen.queryByText('Delete Document')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a failed delete closes the dialog and shows the server reason in the banner', async () => {
    mockedDelete.mockRejectedValue({
      response: {
        data: { success: false, error: { message: 'Document is locked by another user' } },
      },
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Actions for contract.pdf' }),
    );
    await user.click(screen.getByRole('button', { name: /Delete/ }));
    await user.click(screen.getByRole('button', { name: 'Delete Permanently' }));

    expect(
      await screen.findByText('Document is locked by another user'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Delete Document')).not.toBeInTheDocument();
    });

    // The banner is dismissible.
    await user.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('non-admins never see the (server-rejected) delete affordance', async () => {
    authState.role = 'EMPLOYEE';

    renderPage();
    await screen.findByText('contract.pdf');

    expect(
      screen.queryByRole('button', { name: 'Actions for contract.pdf' }),
    ).not.toBeInTheDocument();
  });
});
