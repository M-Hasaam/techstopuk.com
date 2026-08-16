import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import type { NextFunction, Request, Response } from 'express';

const appEnvPath = resolve(__dirname, '..', '.env');
if (existsSync(appEnvPath)) {
  loadEnv({ path: appEnvPath });
}

const logger = new Logger('Bootstrap');

const maxPortAttempts = 20;

function resolveStartPort(defaultPort: number): number {
  const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
  if (Number.isInteger(parsedPort) && parsedPort > 0) {
    return parsedPort;
  }

  return defaultPort;
}

async function bootstrap() {
  // Fail fast rather than silently signing tokens with the well-known dev
  // secret in a real deployment — every module that reads JWT_SECRET falls
  // back to 'dev-secret-change-me' for local-dev convenience, so this is the
  // one place that actually closes the hole if the env var is ever unset.
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-me') {
    throw new Error('JWT_SECRET must be set to a real secret in production');
  }

  // Lazy-load AppModule after dotenv has been applied.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require('./app.module') as typeof import('./app.module');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // This is a private, fully dynamic API (admin + storefront) — nothing here should ever
  // be cached by an intermediary. Without this, a CDN/edge proxy in front of the API
  // (e.g. Cloudflare) can cache a GET response (like an empty `/scraper/runs` right after
  // a fresh deploy) and keep serving that stale body indefinitely, since we never sent
  // any Cache-Control header for it to key off of.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.useWebSocketAdapter(new IoAdapter(app));
  app.use(compression());
  app.use(cookieParser());
  // Use Nest's own body-parser hooks (not raw `express.json()`/`urlencoded()`) so the
  // `rawBody: true` capture above actually takes effect — a plain `app.use(json(...))`
  // parses and drains the request stream itself without stashing req.rawBody, which
  // silently broke Stripe webhook signature verification (confirmed via a live test:
  // a correctly-signed payload was rejected as "Invalid webhook signature" until this
  // was fixed to go through Nest's raw-body-aware parser instead).
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '10mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: (process.env.ALLOWED_REDIRECT_URLS ?? 'http://localhost:3000')
      .split(',')
      .map((u) => u.trim()),
    credentials: true,
  });

  const startPort = resolveStartPort(3002);
  let selectedPort = startPort;

  for (let attempt = 0; attempt < maxPortAttempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    try {
      await app.listen(selectedPort);

      if (selectedPort !== startPort) {
        logger.warn(`Port ${startPort} is busy. Falling back to port ${selectedPort}.`);
      }

      logger.log(`API listening on port ${selectedPort}`);
      return;
    } catch (error) {
      const isAddressInUse =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'EADDRINUSE';

      if (!isAddressInUse) {
        throw error;
      }

      selectedPort += 1;
    }
  }

  throw new Error(`No free port found in range ${startPort}-${startPort + maxPortAttempts - 1}`);
}
bootstrap();


