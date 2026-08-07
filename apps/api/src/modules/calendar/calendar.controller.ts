import { Request, Response } from 'express';
import { CalendarProvider } from '@prisma/client';

import { env } from '../../config/env';
import { AppError } from '../../core/errors/AppError';
import { CalendarService, isCalendarProvider } from './calendar.service';

const calendarService = new CalendarService();

export class CalendarController {
  async getCalendarFeed(req: Request, res: Response) {
    const feed = await calendarService.getCalendarFeed(req.user!.organizationId);
    res.json({ data: feed });
  }

  async getConnectUrl(req: Request, res: Response) {
    // FEATURE (ledger #3): honesty first — a provider with no deployment
    // credentials gets a 503 from the service, not a dummy auth URL.
    const providerParam = String(req.query.provider || 'GOOGLE').toUpperCase();
    if (!isCalendarProvider(providerParam)) {
      throw new AppError('Unsupported calendar provider', 400);
    }

    const result = calendarService.getOAuthUrl(
      providerParam as CalendarProvider,
      req.user!.organizationId,
      req.user!.id
    );
    res.json({ data: result });
  }

  /*
   * FEATURE (ledger #3): PUBLIC callback (mounted via
   * calendar.public.routes.ts). The provider redirects the admin's
   * BROWSER here — no session bearer is attached, so the verified HMAC
   * state authenticates the flow. Outcomes are delivered as a browser
   * redirect to the calendar page with an honest oauth= parameter
   * (success carries the real provider account email; failures carry the
   * reason) instead of a bare JSON the user would never act on.
   */
  async handleCallback(req: Request, res: Response) {
    const pathProvider = String(req.params.provider).toUpperCase() as CalendarProvider;
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const providerError = req.query.error ? String(req.query.error) : null;

    const redirectBase = `${env.FRONTEND_URL}/calendar`;

    if (providerError) {
      const description = String(req.query.error_description || providerError);
      res.redirect(
        `${redirectBase}?oauth=error&reason=${encodeURIComponent(description)}`
      );
      return;
    }

    try {
      const account = await calendarService.handleOAuthCallback(
        pathProvider,
        code,
        state
      );

      res.redirect(
        `${redirectBase}?oauth=connected&provider=${account.provider}&email=${encodeURIComponent(account.email)}`
      );
    } catch (error) {
      if (error instanceof AppError) {
        res.redirect(
          `${redirectBase}?oauth=error&reason=${encodeURIComponent(error.message)}`
        );
        return;
      }
      throw error;
    }
  }

  async listAccounts(req: Request, res: Response) {
    const accounts = await calendarService.listAccounts(
      req.user!.organizationId,
      req.user!.id
    );
    res.json({ data: accounts });
  }

  async disconnectAccount(req: Request, res: Response) {
    const provider = String(req.params.provider).toUpperCase() as CalendarProvider;

    const result = await calendarService.disconnectAccount(
      req.user!.organizationId,
      req.user!.id,
      provider
    );
    res.json({ data: result });
  }

  async triggerSync(req: Request, res: Response) {
    const result = await calendarService.triggerTwoWaySync(
      req.user!.organizationId,
      req.user!.id
    );
    res.status(202).json({ data: result });
  }
}
