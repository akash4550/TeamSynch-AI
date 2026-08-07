import { Request, Response, NextFunction } from 'express';
import { allQueues } from './queues';

export class JobsController {
  
  async getQueueStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const statuses = await Promise.all(
        allQueues.map(async (queue) => {
          const [waiting, active, completed, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
          ]);

          return {
            name: queue.name,
            counts: {
              waiting,
              active,
              completed,
              failed,
            },
          };
        })
      );

      res.status(200).json({ data: statuses });
    } catch (error) {
      next(error);
    }
  }

  async retryFailedJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const { queueName } = req.body;
      const targetQueue = allQueues.find(q => q.name === queueName);

      if (!targetQueue) {
        return res.status(404).json({ message: 'Queue not found' });
      }

      const failedJobs = await targetQueue.getFailed();
      let retriedCount = 0;

      for (const job of failedJobs) {
        await job.retry();
        retriedCount++;
      }

      res.status(200).json({ message: `Retried ${retriedCount} jobs`, retriedCount });
    } catch (error) {
      next(error);
    }
  }

  async getFailedJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const { queueName } = req.params;
      const targetQueue = allQueues.find(q => q.name === queueName);

      if (!targetQueue) {
        return res.status(404).json({ message: 'Queue not found' });
      }

      // Limit to last 50 for performance
      const failedJobs = await targetQueue.getFailed(0, 50);
      
      const formattedJobs = failedJobs.map(job => ({
        id: job.id,
        name: job.name,
        data: job.data,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        timestamp: job.timestamp,
      }));

      res.status(200).json({ data: formattedJobs });
    } catch (error) {
      next(error);
    }
  }

  /*
   * BUG FIX (#57 — checkStatusUrl was a dead pointer): four async-job
   * producers hand the caller `checkStatusUrl: /api/v1/jobs/${job.id}` in
   * their 202 responses (AI task-summary + assistant, audit-log export,
   * calendar two-way sync), but no GET /jobs/:id route ever existed —
   * following the URL always returned 404, even while the referenced job
   * was queued or running. BullMQ job ids are unique PER QUEUE, not
   * globally, so a status lookup must probe every registered queue for
   * the id. Response keeps the module's `{ data: ... }` convention and
   * mirrors the field set of GET /failed/:queueName, plus live status,
   * attempts and lifecycle timestamps; unknown ids return the module's
   * existing `{ message }` 404 shape (dual-shape readers, pinned by the
   * #37 error-state tests).
   */
  async getJobById(req: Request, res: Response, next: NextFunction) {
    try {
      // Express 5 types params as string | string[]; for a single-segment
      // ':id' route it is always a string at runtime.
      const id = req.params.id as string;
      const matches = await Promise.all(allQueues.map((queue) => queue.getJob(id)));
      const job = matches.find((candidate) => candidate != null);

      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      const status = await job.getState();

      res.status(200).json({
        data: {
          id: job.id,
          name: job.name,
          queue: job.queueName,
          status,
          progress: job.progress,
          attemptsMade: job.attemptsMade,
          data: job.data,
          failedReason: job.failedReason,
          stacktrace: job.stacktrace,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
