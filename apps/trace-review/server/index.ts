import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createTraceReviewApp } from './app.js';

const serverDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(serverDir, '../../..');
const serveStatic = process.argv.includes('--serve-static');
const { app } = await createTraceReviewApp({
  repoRoot,
  serveStatic,
  logger: true,
});

try {
  await app.listen({ host: '127.0.0.1', port: 4173 });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
