import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import rateLimit from 'express-rate-limit';
import { env } from '../core/env';
import { logger } from '../core/logger';
import { requestId } from './middlewares/request-id';
import { errorHandler, notFoundHandler } from './middlewares/error';
import { apiRouter } from './routes';

export function createApp(): Express {
  const app = express();

  // Alguns middlewares de terceiros declaram assinaturas http.* mais amplas que o
  // RequestHandler do Express; o cast mantem a checagem de tipo no restante do app.
  const mw = (h: unknown): RequestHandler => h as RequestHandler;

  app.set('trust proxy', 1);
  app.use(mw(helmet()));
  app.use(
    cors({
      origin: env.WEB_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(mw(express.json({ limit: '1mb' })));
  app.use(mw(express.urlencoded({ extended: true })));
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id ?? 'unknown',
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/api/health' },
    }),
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas, tente mais tarde' } },
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  app.get('/', (_req, res) =>
    res.json({ name: 'HERMES IA API', status: 'up', health: '/api/health', docs: '/api' }),
  );
  app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
  app.head('/', (_req, res) => res.sendStatus(200));
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
