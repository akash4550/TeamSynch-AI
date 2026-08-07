import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';
import {getNormalizedRoute} from '../utils/requestRoute';

export const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let status = 500;
  let message = 'Internal Server Error';

  if (err instanceof AppError) {
    status = err.statusCode;
    message = err.message;
  }

  else if (err instanceof ZodError) {
    status = 400;
    /*
     * BUG FIX (#46): match validateRequest's message composition — raw
     * ZodErrors reaching this middleware (e.g. the documents module's
     * inline schema.parse calls) used to collapse to a bare 'Validation
     * failed' with no detail for the client to act on.
     */
    message = `Validation failed: ${err.issues.map((issue) => issue.message).join(',')}`;
  }

  /*
   * BUG FIX (#46): multer parser failures (file over the 50MB documents
   * limit or the 2MB logo limit, unexpected multipart fields, ...) bubble
   * up OUTSIDE any controller try/catch and used to surface as
   * 500 'Internal Server Error'. Multer's own messages are safe static
   * strings, so map them to honest client errors: 413 for size limits,
   * 400 for everything else.
   */
  else if (err instanceof MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.message || 'Invalid upload';
  }

  else if (
    err instanceof JsonWebTokenError ||
    err instanceof TokenExpiredError
  ) {
    status = 401;
    message = 'Invalid or expired token';
  }

  else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {

      case 'P2002':
        status = 409;
        message = 'Duplicate record';
        break;

      case 'P2025':
        status = 404;
        message = 'Record not found';
        break;

      case 'P2003':
        status = 400;
        message = 'Invalid relation';
        break;

      default:
        status = 500;
        message = 'Database error';
    }
  }

  const route = getNormalizedRoute(req);

  const logMeta = {
    requestId: req.requestId,
    method: req.method,
    route,
    status,
    message,
  };

  if (status < 500) {
    logger.warn(logMeta);
  } else {
    logger.error({
      ...logMeta,
      errorName: err.name,
      stack: err.stack,
    });
  }

  res.status(status).json({
    success: false,
    requestId: req.requestId,
    error: {
      message,

      ...(process.env.NODE_ENV === 'development'
        ? {
            stack: err.stack,
          }
        : {}),
    },
  });
};