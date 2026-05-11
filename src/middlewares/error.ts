import { Request, Response, NextFunction } from 'express';

import { logError, logWarning } from '../shared/log';
import { config } from '../shared/config';

interface HttpLikeError {
  status?: number;
  message?: string;
}

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction
) {
  if (response.headersSent) return next(error);

  const e = (error ?? {}) as HttpLikeError;
  const status = typeof e.status === 'number' ? e.status : 500;
  const rawMessage = typeof e.message === 'string' ? e.message : 'Unknown error';
  const clientMessage = status >= 500 ? 'An unexpected error occurred.' : rawMessage;

  if (status === 404) {
    logWarning(`404 Not Found: ${request.method} ${request.originalUrl}`);
  } else {
    logError(error, { method: request.method, url: request.originalUrl });
  }

  response.status(status);

  if (request.originalUrl.startsWith('/assets')) {
    return response.end();
  }
  if (request.originalUrl.startsWith('/api')) {
    return response.json({ status, message: clientMessage });
  }

  return response.render(
    status === 404 ? 'error-404' : 'error-other',
    {
      ...config,
      title: String(status),
      status: String(status),
      message: clientMessage,
    }
  );
}
