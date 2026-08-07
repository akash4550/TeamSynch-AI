import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { KanbanBoard } from '../KanbanBoard';
import { api } from '../../../../lib/api';

/*
 * Regression tests for the KanbanBoard rollback fix.
 *
 * The board writes moves optimistically via setTasks, and the persist
 * mutation previously had no onError — a rejected PATCH left the card in
 * its new column forever even though the server never saved the move
 * (phantom state; other users never got a socket event). These tests
 * capture the DndContext handlers, drive drags programmatically, and pin
 * the rollback + honest failure notification.
 *
 * dnd-kit is mocked: DndContext renders children directly and records its
 * props; the droppable/draggable/sortable hooks return inert stubs.
 */
let capturedDndProps: any = null;

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: any) => {
      capturedDndProps = props;
      return <>{props.children}</>;
    },
    DragOverlay: ({ children }: any) => <>{children}</>,
    useDroppable: () => ({
      setNodeRef: () => {},
      isOver: false,
      over: null,
      node: { current: null },
      rect: { current: null },
    }),
    useDraggable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      isDragging: false,
    }),
  };
});

vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>();
  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: null,
      isDragging: false,
    }),
  };
});

vi.mock('../../../../lib/api', () => ({
  api: {
    patch: vi.fn(),
  },
}));

const mockedPatch = vi.mocked(api.patch);

const TASK = {
  id: 'task-1',
  title: 'Alpha task',
  status: 'TODO',
  priority: 'MEDIUM',
  position: 65536,
  project: { key: 'TS' },
  assignee: null,
};

const renderBoard = (tasks: any[] = [TASK]) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <KanbanBoard tasks={tasks} />
    </QueryClientProvider>,
  );
};

const columnRoot = (label: string) =>
  screen.getByText(label).closest('[class*="w-72"]') as HTMLElement;

const dragTaskEnd = (taskId: string, overColumn: string) => {
  act(() => {
    capturedDndProps?.onDragStart({
      active: { id: taskId, data: { current: { type: 'Task' } } },
    });
  });
  act(() => {
    capturedDndProps?.onDragEnd({
      active: { id: taskId, data: { current: { type: 'Task' } } },
      over: { id: overColumn, data: { current: { type: 'Column', status: overColumn } } },
    });
  });
};

beforeEach(() => {
  capturedDndProps = null;
});

describe('KanbanBoard failed-move rollback', () => {
  test('rolls the card back to its original column and shows the server reason', async () => {
    mockedPatch.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { message: 'Insufficient permissions' },
        },
      },
    });

    renderBoard();
    dragTaskEnd('task-1', 'DONE');

    expect(
      await screen.findByText('Move failed: Insufficient permissions'),
    ).toBeInTheDocument();

    // Rolled back: the card is back in To Do, not Done.
    expect(within(columnRoot('To Do')).getByText('Alpha task')).toBeInTheDocument();
    expect(within(columnRoot('Done')).queryByText('Alpha task')).not.toBeInTheDocument();
  });

  test('shows a safe fallback message and dismisses it when the error has no envelope', async () => {
    mockedPatch.mockRejectedValue(new Error('Network Error'));

    renderBoard();
    dragTaskEnd('task-1', 'DONE');

    const banner = await screen.findByText(
      'Could not move this task. The board has been restored.',
    );
    expect(banner).toBeInTheDocument();
    expect(within(columnRoot('To Do')).getByText('Alpha task')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /dismiss move failure/i }));
    expect(
      screen.queryByText('Could not move this task. The board has been restored.'),
    ).not.toBeInTheDocument();
  });

  test('keeps the optimistic move without a failure banner when the PATCH succeeds', async () => {
    mockedPatch.mockResolvedValue({ data: { success: true, data: {} } });

    renderBoard();
    dragTaskEnd('task-1', 'DONE');

    // The mutation dispatches on a microtask after handleDragEnd returns.
    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith('/tasks/task-1/move', {
        status: 'DONE',
        position: 65536,
      });
    });
    expect(within(columnRoot('Done')).getByText('Alpha task')).toBeInTheDocument();
    expect(
      screen.queryByText(/move failed|has been restored/i),
    ).not.toBeInTheDocument();
  });
});
