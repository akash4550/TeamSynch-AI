import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { TasksPage } from '../TasksPage';
import { JobsDashboard } from '../../system/JobsDashboard';
import { api } from '../../../lib/api';

/*
 * Regression tests for the remaining silent-create-failure class (Bug #28):
 * task creation and the JobsDashboard retry both used to swallow server
 * rejections entirely. These tests pin the inline/banner feedback and the
 * dual error-shape reader on the jobs controller (`{ message }` 404s vs the
 * shared `{ error: { message } }` envelope).
 */
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

const renderPage = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

beforeEach(() => {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/tasks') {
      return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
    }
    if (url === '/projects') {
      return Promise.resolve({
        data: {
          data: {
            projects: [{ id: 'proj-1', name: 'Apollo', key: 'AP' }],
            total: 1,
          },
        },
      });
    }
    if (url === '/jobs/status') {
      return Promise.resolve({
        data: {
          data: [
            { name: 'ai-jobs', counts: { waiting: 0, active: 0, completed: 4, failed: 2 } },
          ],
        },
      });
    }
    if (url.startsWith('/jobs/failed/')) {
      return Promise.resolve({ data: { data: [] } });
    }
    return Promise.reject(new Error(`unmocked GET ${url}`));
  });
});

describe('TasksPage create-task error feedback', () => {
  const openAndSubmit = async () => {
    const user = userEvent.setup();
    await screen.findByText('Tasks');
    await user.click(screen.getByRole('button', { name: /create task/i }));
    await user.selectOptions(screen.getByLabelText(/project/i), 'proj-1');
    await user.type(screen.getByLabelText(/task title/i), 'Fix landing page');
    // With the modal open both the header CTA and the form submit read
    // "Create Task" — the submit is the last one in DOM order.
    const createButtons = screen.getAllByRole('button', { name: /^create task$/i });
    await user.click(createButtons[createButtons.length - 1]);
    return user;
  };

  test('renders the server error message as text when creation is rejected', async () => {
    mockedPost.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { message: 'Invalid project ID' },
        },
      },
    });

    renderPage(<TasksPage />);
    await openAndSubmit();

    expect(await screen.findByText('Invalid project ID')).toBeInTheDocument();
    // Modal stays open so the user sees the failure.
    expect(screen.getByText('Create New Task')).toBeInTheDocument();
  });

  test('posts the payload and closes the modal on success', async () => {
    mockedPost.mockResolvedValue({ data: { data: { id: 'task-9' } } });

    renderPage(<TasksPage />);
    await openAndSubmit();

    expect(mockedPost).toHaveBeenCalledWith(
      '/tasks',
      expect.objectContaining({ projectId: 'proj-1', title: 'Fix landing page' }),
    );
    await waitFor(() => {
      expect(screen.queryByText('Create New Task')).not.toBeInTheDocument();
    });
  });
});

describe('JobsDashboard retry error feedback', () => {
  test("reads the controller's plain `{ message }` shape and shows a dismissible banner", async () => {
    mockedPost.mockRejectedValue({
      response: {
        status: 404,
        data: { message: 'Queue not found' },
      },
    });

    const user = userEvent.setup();
    renderPage(<JobsDashboard />);

    await screen.findByText('ai-jobs');
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByText('Queue not found')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /dismiss retry failure/i }));
    expect(screen.queryByText('Queue not found')).not.toBeInTheDocument();
  });
});
