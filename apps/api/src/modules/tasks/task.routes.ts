import { Router } from 'express';

import { TaskController } from './task.controller';
import { canUpdateTask } from './task.permissions';
import {
  assignTaskSchema,
  createTaskSchema,
  listTasksQuerySchema,
  moveTaskSchema,
  taskIdSchema,
  updateTaskSchema,
} from './task.validator';

import { requireAuth } from '../../core/middlewares/authMiddleware';
import { authorize } from '../../core/middlewares/authorize';
import { requireOwnership } from '../../core/middlewares/ownership';
import { validateRequest } from '../../core/middlewares/validateRequest';
import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { PERMISSIONS } from '../../core/auth/permissions';

const router = Router();
const controller = new TaskController();

router.use(requireAuth);

router.get(
  '/',
  authorize(PERMISSIONS.TASK.READ),
  // FEATURE (ledger #6): was the only list route with no validateRequest
  // — unbounded `take`, unvalidated enums/sortBy. Bounded at the 500
  // aggregate-exception ceiling (see listTasksQuerySchema).
  validateRequest(listTasksQuerySchema),
  asyncWrapper(controller.getTasks)
);

router.get(
  '/:id',
  authorize(PERMISSIONS.TASK.READ),
  validateRequest(taskIdSchema),
  asyncWrapper(controller.getTaskById)
);

router.post(
  '/',
  authorize(PERMISSIONS.TASK.CREATE),
  validateRequest(createTaskSchema),
  asyncWrapper(controller.createTask)
);

router.patch(
  '/:id',
  authorize(PERMISSIONS.TASK.UPDATE),
  validateRequest(updateTaskSchema),
  requireOwnership(canUpdateTask),
  asyncWrapper(controller.updateTask)
);

/*
 * BUG FIX (#69 — the task-ownership rule was contradicted one route over):
 * PATCH /:id enforces requireOwnership(canUpdateTask) — only the task's
 * assignee/reporter (or a full ADMIN/SUPER_ADMIN) may mutate it, and that
 * mutation INCLUDES `status` (updateTaskSchema allows it). But this /move
 * sibling only checked the coarse TASK.UPDATE permission, so the exact
 * same privilege could be exercised on ANY task in the organization: an
 * EMPLOYEE (TASK.UPDATE yes, ASSIGN/ARCHIVE no) blocked from editing a
 * colleague's task could still drag it across the board — changing its
 * status through the back door, silently and event-broadcast. The route
 * now applies the identical ownership layer: same actor-allow-list as the
 * authored policy (assignee/reporter; admins unrestricted), same 403
 * message clients already handle, and the Kanban's onError rollback (#30)
 * already covers the visual revert if a drag is politely refused. Note:
 * MANAGERs also lose unowned /move — identical to their existing block on
 * unowned PATCH /:id, so the module is now internally consistent (and a
 * MANAGER retains TASK.ASSIGN to route work through participants).
 */
router.patch(
  '/:id/move',
  authorize(PERMISSIONS.TASK.UPDATE),
  validateRequest(moveTaskSchema),
  requireOwnership(canUpdateTask),
  asyncWrapper(controller.moveTask)
);

router.patch(
  '/:id/assign',
  authorize(PERMISSIONS.TASK.ASSIGN),
  validateRequest(assignTaskSchema),
  asyncWrapper(controller.assignTask)
);

router.patch(
  '/:id/archive',
  authorize(PERMISSIONS.TASK.ARCHIVE),
  validateRequest(taskIdSchema),
  asyncWrapper(controller.archiveTask)
);

router.patch(
  '/:id/restore',
  authorize(PERMISSIONS.TASK.ARCHIVE),
  validateRequest(taskIdSchema),
  asyncWrapper(controller.restoreTask)
);

router.delete(
  '/:id',
  authorize(PERMISSIONS.TASK.DELETE),
  validateRequest(taskIdSchema),
  asyncWrapper(controller.deleteTask)
);

export default router;