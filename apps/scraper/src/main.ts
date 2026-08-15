import 'dotenv/config';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const execAsync = promisify(exec);

async function killPort(port: number): Promise<void> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const pids = new Set<string>();
      for (const line of stdout.trim().split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      await Promise.all([...pids].map(pid =>
        execAsync(`taskkill /PID ${pid} /F`).catch(() => {}),
      ));
    } else {
      await execAsync(`fuser -k ${port}/tcp`).catch(() => {});
    }
  } catch {
    // Port already free
  }
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bootstrap() {
  const port = Number(process.env.PORT ?? 3003);
  const app = await NestFactory.create(AppModule);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await app.listen(port);
      console.log(`Scraper service listening on port ${port}`);
      return;
    } catch (error) {
      const isInUse =
        typeof error === 'object' && error !== null &&
        'code' in error && (error as { code?: string }).code === 'EADDRINUSE';

      if (!isInUse) throw error;

      console.warn(`Port ${port} is in use (attempt ${attempt}/3) — killing existing process…`);
      await killPort(port);
      await wait(800);
    }
  }

  throw new Error(`Could not bind to port ${port} after killing the existing process.`);
}
bootstrap();
