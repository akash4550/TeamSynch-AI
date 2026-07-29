import { Request, Response } from 'express';
import { CalendarService } from './calendar.service';

const calendarService = new CalendarService();

export class CalendarController {
  async getCalendarFeed(req: Request, res: Response) {
    const feed = await calendarService.getCalendarFeed(req.user!.organizationId);
    res.json({ data: feed });
  }

  async getConnectUrl(req: Request, res: Response) {
    const provider = (req.query.provider as 'GOOGLE' | 'OUTLOOK') || 'GOOGLE';
    const state = `${req.user!.organizationId}:${req.user!.id}`;
    const result = calendarService.getOAuthUrl(provider, state);
    res.json({ data: result });
  }

  async handleCallback(req: Request, res: Response) {
    const providerParam = Array.isArray(req.params.provider) ? req.params.provider[0] : req.params.provider;
    const provider = (providerParam?.toUpperCase() as 'GOOGLE' | 'OUTLOOK') || 'GOOGLE';
    const code = String(req.query.code || '');

    const account = await calendarService.handleOAuthCallback(
      req.user!.organizationId,
      req.user!.id,
      provider,
      code
    );

    res.json({ data: account });
  }

  async triggerSync(req: Request, res: Response) {
    const result = await calendarService.triggerTwoWaySync(
      req.user!.organizationId,
      req.user!.id
    );
    res.status(202).json({ data: result });
  }
}
